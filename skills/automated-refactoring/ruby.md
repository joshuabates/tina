# Ruby Refactoring Reference

## ast-grep Patterns for Ruby

### Method definitions
```bash
# Find method definitions
sg run --pattern 'def $NAME($$$PARAMS) $$$BODY end' --lang ruby

# Rename a method
sg run --pattern 'def old_method($$$PARAMS) $$$BODY end' \
  --rewrite 'def new_method($$$PARAMS) $$$BODY end' --lang ruby -i
```

### Method calls
```bash
# Find calls to a specific method
sg run --pattern '$OBJ.old_method($$$ARGS)' --lang ruby

# Rename method calls
sg run --pattern '$OBJ.old_method($$$ARGS)' \
  --rewrite '$OBJ.new_method($$$ARGS)' --lang ruby -i
```

### Class/module definitions
```bash
# Find class definitions
sg run --pattern 'class $NAME < $PARENT $$$BODY end' --lang ruby

# Find module inclusions
sg run --pattern 'include $MODULE' --lang ruby
```

### Block patterns
```bash
# do...end blocks
sg run --pattern '$OBJ.each do |$VAR| $$$BODY end' --lang ruby

# Brace blocks
sg run --pattern '$OBJ.each { |$VAR| $$$BODY }' --lang ruby
```

### Hash syntax migration
```bash
# Rocket to symbol syntax
sg run --pattern ':$KEY => $VALUE' --rewrite '$KEY: $VALUE' --lang ruby -i
```

## Common Refactors

### Gem migration (e.g., HTTParty → Faraday)

Use ast-grep rule files for systematic migration:

```yaml
# httparty-to-faraday.yml
id: migrate-get
language: ruby
rule:
  pattern: HTTParty.get($URL, headers: $HEADERS)
fix: |
  Faraday.get($URL) do |req|
    req.headers = $HEADERS
  end
---
id: migrate-post
language: ruby
rule:
  pattern: HTTParty.post($URL, body: $BODY, headers: $HEADERS)
fix: |
  Faraday.post($URL) do |req|
    req.headers = $HEADERS
    req.body = $BODY
  end
---
id: migrate-response-code
language: ruby
rule:
  pattern: $RESP.code
fix: $RESP.status
---
id: migrate-parsed-response
language: ruby
rule:
  pattern: $RESP.parsed_response
fix: JSON.parse($RESP.body)
```

```bash
sg scan --rule httparty-to-faraday.yml -i   # review each transform
bundle exec rspec                            # verify
```

### Method rename across class hierarchy

```bash
# 1. Rename definitions
sg run --pattern 'def old_name($$$PARAMS)' \
  --rewrite 'def new_name($$$PARAMS)' --lang ruby -U

# 2. Rename calls
sg run --pattern '$OBJ.old_name($$$ARGS)' \
  --rewrite '$OBJ.new_name($$$ARGS)' --lang ruby -U

# 3. Rename symbol references (fastmod — these are text)
fastmod ':old_name' ':new_name' --extensions rb

# 4. Verify
bundle exec rspec
```

## RuboCop Autofix

```bash
rubocop -a              # safe corrections only
rubocop -A              # all corrections (including unsafe)
rubocop -a --only Style/HashSyntax   # fix specific cop only
rubocop --auto-gen-config            # generate baseline .rubocop_todo.yml
```

**Safe (`-a`)** won't change semantics. **Unsafe (`-A`)** might (e.g., `map` → `filter_map` where nil semantics differ). Prefer `-a` and apply unsafe cops individually after reviewing.

## Verification Tools

```bash
bundle exec rspec                  # test suite
bundle exec srb tc                 # Sorbet type check (if project uses it)
ruby -c file.rb                    # syntax check (minimal)
rubocop --format simple            # lint check
bundle exec rails test             # Rails test suite (if Rails)
```

## Gotchas

- **Ruby's flexible syntax creates AST variations.** `foo(a, b)` and `foo a, b` (no parens) are different AST shapes. You may need two patterns.
- **do...end vs { }** blocks are different AST nodes. Handle both when matching blocks.
- **Metaprogramming can't be statically refactored.** `send(:method_name)`, `define_method`, `method_missing` — these won't be caught by ast-grep. Search for string/symbol references with fastmod.
- **String interpolation** (`"#{expr}"`) has its own AST structure. Matching inside interpolations requires the right pattern context.
- **Heredocs** are string nodes but span multiple lines. ast-grep handles them, but verify with `--json` output.
- **Symbol references** (`:method_name`) are separate from method calls. Use fastmod for symbol renames alongside ast-grep for call sites.
