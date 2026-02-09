# Automated Refactoring Skill Design

## Purpose

A skill for Claude agents performing large-scale refactoring across codebases. Teaches agents to reach for specialized tools (ast-grep, fastmod, LSP, language linters) instead of manually editing files one-by-one.

## Target Audience

Claude agents performing refactoring work in Rust, TypeScript, and Ruby codebases.

## Scope

### In Scope
- **Rename refactoring** — symbols, modules, files across codebase
- **Structural transforms** — function signatures, module extraction, code reorganization
- **Migration patterns** — API changes, dependency upgrades, framework version bumps
- Tool selection guidance (when to use which tool)
- Language-specific recipes for Rust, TypeScript, Ruby

### Out of Scope
- Editor/IDE integration (this is CLI-only)
- Writing custom codemod frameworks
- Refactoring design patterns (this is about the mechanics, not when to refactor)

## Tool Selection Flowchart

```
What kind of change?
├── Text/string replacement (comments, strings, config) → fastmod
├── Symbol rename (variables, functions, types)
│   ├── Single language, type-aware needed? → LSP rename (if available)
│   └── Multi-language or cross-file patterns → ast-grep
├── Structural transform (change signatures, extract, reorganize)
│   └── ast-grep (pattern → replacement with metavariables)
├── Migration (API changes, framework upgrades)
│   ├── Known pattern across many files → ast-grep rules
│   └── Complex per-file logic → jscodeshift (TS) / custom script
└── Lint/style fixes → language linter (RuboCop, clippy, eslint --fix)
```

## Workflow (Hybrid by Scope)

### Simple renames (< 20 matches) — fast path
1. Pick tool (ast-grep or fastmod)
2. Run with `--interactive` to review matches
3. Apply
4. Verify with compiler/typechecker

### Large renames (20+ matches) — batch path
1. Test on one file first (verify pattern correctness)
2. Apply to all (`-U` or `--accept-all`)
3. Verify with compiler/typechecker

### Structural transforms & migrations — safety path
1. Run tests → establish green baseline (abort if red)
2. Assess scope (`--json` output, count affected files)
3. Work in batches (by module/directory)
4. Per batch: preview → apply → test → commit
5. If tests fail: revert batch, refine pattern
6. Full test suite after all batches

## Primary Tools

### ast-grep (`sg`) — structural search/replace
- Tree-sitter based, multi-language
- Metavariables: `$NAME` (single node), `$$$ARGS` (variadic), `$_` (wildcard)
- Compound rules: `all`, `any`, `not`, `matches`
- Relational rules: `inside`, `has`, `follows`, `precedes`
- Constraints: regex/kind filtering on captured metavariables
- Transforms: `replace`, `substring`, `convert` (case), `rewrite`
- Rule files (YAML) for complex multi-step transforms
- `sg test` for validating rules before applying

### fastmod — regex find/replace
- Interactive by default, `--accept-all` for batch
- Scoped with `--extensions` and `-d`
- Capture groups with `${1}` syntax
- Best for: text patterns, non-code files, simple renames

### LSP — type-aware operations
- Practical reality: no clean CLI wrappers exist for most LSPs
- Best approach: use ast-grep for the rename, compiler for verification
- Compiler-as-safety-net: `ast-grep rename → cargo check → fix errors → repeat`
- Language-specific escape hatches: ts-morph scripts (TS), custom scripts (Rust/Ruby)

### Language linters — style autofix
- Rust: `cargo clippy --fix`, `cargo fix` (edition migrations)
- TypeScript: `eslint --fix`
- Ruby: `rubocop -a` (safe) / `rubocop -A` (all)

## File Structure

```
automated-refactoring/
  SKILL.md           # Tool selection, workflows, ast-grep/fastmod reference
  rust.md            # Rust-specific patterns, tools, gotchas (~100-150 lines)
  typescript.md      # TypeScript-specific patterns, tools, gotchas (~100-150 lines)
  ruby.md            # Ruby-specific patterns, tools, gotchas (~100-150 lines)
```

## Language Sub-References

### rust.md
- ast-grep patterns for Rust idioms (match arms, trait impls, derive, lifetimes)
- `cargo check` / `cargo clippy --fix` / `cargo fix` as verification/autofix
- Common refactors: unwrap→expect/?, error type migrations, async transforms
- Gotchas: macros don't parse as normal AST, `use` paths need full qualification

### typescript.md
- ast-grep patterns for TS idioms (interfaces, type aliases, generics, JSX/TSX)
- `tsc --noEmit` as verification, `eslint --fix` for style
- ts-morph for type-aware renames, jscodeshift for programmatic transforms
- Common refactors: export changes, prop types, hook migrations, import restructuring
- Gotchas: TSX needs separate language config, `any` type cleanup

### ruby.md
- ast-grep patterns for Ruby idioms (blocks, method defs, class/module bodies)
- RuboCop `-a`/`-A` for style, Sorbet `srb tc` or `ruby -c` for verification
- Common refactors: hash syntax, string interpolation, method renames
- Gotchas: flexible syntax = more AST variations, metaprogramming can't be statically refactored

## Success Metrics

- Agent reaches for ast-grep/fastmod instead of manual file-by-file editing for 5+ file refactors
- Agent uses correct tool for the refactoring type (structural vs text vs lint)
- Agent verifies with compiler/typechecker after applying changes
- Agent batches large refactors instead of applying globally in one shot
