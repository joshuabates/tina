---
name: automated-refactoring
description: Use when making repetitive edits across multiple files - renaming symbols, changing function signatures, migrating APIs, updating imports, or ANY pattern-based change touching 5+ files. If you're about to Edit the same kind of change file-by-file — STOP and use this skill. Covers ast-grep, fastmod, and language-specific tools for Rust, TypeScript, and Ruby.
---

# Automated Refactoring

## Overview

Large refactors (renames, signature changes, API migrations) across many files should use specialized tools — not manual file-by-file editing. One `sg run` command replaces 47 individual Edit calls.

**Core principle:** If the change follows a pattern, automate it. Manual editing is for the exceptions, not the rule.

## The Iron Law

```
NEVER manually edit 5+ files for the same pattern.
Use ast-grep, fastmod, or a language-specific tool instead.
```

## Red Flags — STOP and Use a Tool

- You're about to Edit the same kind of change in file after file
- You're doing find-and-replace mentally across the codebase
- You're writing a "do this for each file" plan with 10+ items
- You're considering "I'll just do it by hand, it's faster"

**All of these mean: reach for a refactoring tool.**

## Tool Selection

```
What kind of change?
├── Text/string replacement (comments, strings, config, imports)
│   └── fastmod (regex, interactive review)
├── Symbol rename (variables, functions, types)
│   └── ast-grep  (structural, AST-aware)
├── Structural transform (signatures, argument restructuring)
│   └── ast-grep  (pattern → replacement with metavariables)
├── Migration (API changes, dependency swap)
│   ├── Repeated pattern → ast-grep rule file
│   └── Complex per-file logic → jscodeshift (TS) / custom script
└── Lint/style fixes
    └── Language linter autofix (clippy, eslint, rubocop)
```

**Default to ast-grep** unless the change is purely textual (then fastmod) or purely lint (then linter).

## Workflow by Scope

### Simple rename (< 20 matches) — fast path

```bash
sg run --pattern 'OldName' --rewrite 'NewName' --lang rust -i   # interactive review
cargo check                                                       # verify
```

### Large rename (20+ matches) — batch path

```bash
# 1. Test on one file first
sg run --pattern 'OldName' --rewrite 'NewName' --lang rust \
  --paths src/one_file.rs -i

# 2. If correct, apply to all
sg run --pattern 'OldName' --rewrite 'NewName' --lang rust -U

# 3. Verify
cargo check   # or: npx tsc --noEmit / bundle exec srb tc
```

### Structural transform / migration — safety path

```bash
# 1. Green baseline
cargo test   # must pass before starting

# 2. Assess scope
sg run --pattern '$PATTERN' --lang rust --json | jq '.[].file' | sort -u | wc -l

# 3. Apply batch by module/directory
sg run --pattern '$OLD' --rewrite '$NEW' --lang rust --paths src/module_a/ -U
cargo test
git add -p && git commit -m "refactor: migrate module_a"

# 4. Repeat for each module
# 5. Full test suite after all batches
```

### Compiler-as-safety-net pattern

For any rename or type change, the compiler catches what the tool missed:

```
ast-grep transform → compiler check → fix remaining errors → repeat until clean
```

- Rust: `cargo check`
- TypeScript: `npx tsc --noEmit`
- Ruby: `bundle exec srb tc` (Sorbet) or `ruby -c` (syntax)

## ast-grep Quick Reference

**Pattern syntax:**

| Syntax | Matches | Example |
|--------|---------|---------|
| `$NAME` | Single AST node | `fn $NAME()` — any function name |
| `$$$ARGS` | Zero or more nodes | `foo($$$ARGS)` — any arg count |
| `$_` | Any node (no capture) | `if $_ { $$$BODY }` |

**Core commands:**

```bash
# Search (dry run)
sg run --pattern 'old_func($$$ARGS)' --lang rust

# Interactive replace (review each match)
sg run --pattern 'old_func($$$ARGS)' --rewrite 'new_func($$$ARGS)' -i

# Batch replace (no confirmation)
sg run --pattern 'old_func($$$ARGS)' --rewrite 'new_func($$$ARGS)' -U

# JSON output (for scripting/counting)
sg run --pattern '$X' --lang rust --json
```

**Compound rules** (YAML rule files for complex transforms):

```yaml
# migration.yml
id: update-api
language: typescript
rule:
  pattern: api.get($PATH, $OPTS)
fix: api.get($PATH, { ...$OPTS, version: 2 })
---
id: update-api-post
language: typescript
rule:
  pattern: api.post($PATH, $BODY, $OPTS)
fix: api.post($PATH, $BODY, { ...$OPTS, version: 2 })
```

```bash
sg scan --rule migration.yml -i    # interactive
sg scan --rule migration.yml -U    # batch
```

**Relational rules** (context-aware matching):

```yaml
rule:
  pattern: console.log($ARG)
  not:
    inside:
      kind: catch_clause   # skip logging in catch blocks
```

- `inside` — node is within matching parent
- `has` — node contains matching child
- `follows` / `precedes` — sibling ordering
- `stopBy: end` — search deeply (default is one level)

**Constraints** (filter metavariable captures):

```yaml
rule:
  pattern: $FUNC($$$ARGS)
constraints:
  FUNC:
    regex: '^use[A-Z]'   # only React hooks
```

**Transforms** (manipulate captured text in rewrites):

```yaml
transform:
  SNAKE:
    convert:
      source: $NAME
      toCase: snakeCase    # also: camelCase, kebabCase, pascalCase
fix: $SNAKE
```

Available: `replace` (regex sub), `substring` (slice), `convert` (case), `rewrite` (apply sub-rules).

**Testing rules before applying:**

```bash
sg test                  # validate against test cases
sg test --update-all     # generate/update snapshots
```

**Key gotchas:**
- `-i` (interactive) and `-U` (update-all) are mutually exclusive
- Patterns are language-specific — same code parses differently across languages
- Use `pattern: { context: '...', selector: node_kind }` for ambiguous patterns
- `constraints` only work on `$X`, not `$$$X`
- Macros (Rust) and metaprogramming (Ruby) don't parse as normal AST

## fastmod Quick Reference

For text/string patterns where AST awareness adds no value.

```bash
# Interactive (default)
fastmod 'old_name' 'new_name' --extensions rs,toml -d src/

# With capture groups
fastmod 'fn (\w+)_old' 'fn ${1}_new' --extensions rs

# Batch (no review — use after verifying pattern)
fastmod --accept-all 'old_path' 'new_path' --extensions ts,tsx

# Multiline
fastmod -m 'start.*?end' 'replacement'
```

**When to use over ast-grep:** config files, comments, doc strings, import paths, non-code files (YAML, TOML, Markdown).

**Gotchas:** No lookahead/lookbehind. No backreferences (use `${1}` captures). Always scope with `--extensions` and `-d`.

## LSP Integration

Most LSPs lack clean CLI access. The practical approach:

1. **Default:** ast-grep handles 90% of renames without type info
2. **When type-awareness matters:** Write a small script (ts-morph for TS)
3. **Always verify:** Compiler catches what the tool missed

Language-specific tools — see sub-references:
- `rust.md` — Rust patterns, cargo tools, common refactors
- `typescript.md` — TS/TSX patterns, ts-morph, jscodeshift
- `ruby.md` — Ruby patterns, RuboCop, Sorbet

## Rationalization Table

| Excuse | Reality |
|--------|---------|
| "It's faster to just edit manually" | 47 Edit calls vs 1 `sg run`. Tools are faster. |
| "I need to review each change anyway" | Use `-i` (interactive). You review AND automate. |
| "The pattern is too complex for a tool" | ast-grep compound rules handle complex patterns. Try it. |
| "It's only 10 files" | 10 files × 3 occurrences = 30 edits. Use a tool. |
| "I'll batch it into groups of Edit calls" | That's still manual. Use `sg run --paths dir/`. |
| "ast-grep doesn't understand types" | It doesn't need to. Apply the transform, let the compiler verify. |
