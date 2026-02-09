# Rust Refactoring Reference

## ast-grep Patterns for Rust

### Function signatures
```bash
# Find all functions returning Result with a specific error type
sg run --pattern 'fn $NAME($$$ARGS) -> Result<$T, OldError>' --lang rust

# Rewrite error type
sg run --pattern 'fn $NAME($$$ARGS) -> Result<$T, OldError>' \
  --rewrite 'fn $NAME($$$ARGS) -> Result<$T, NewError>' --lang rust -i
```

### Struct/enum definitions
```bash
# Find struct definitions
sg run --pattern 'struct $NAME { $$$FIELDS }' --lang rust

# Find enum variants
sg run --pattern '$ENUM::$VARIANT($$$ARGS)' --lang rust
```

### Match arms
```bash
# Find match on specific enum
sg run --pattern 'match $EXPR { $$$ARMS }' --lang rust

# Rewrite specific variant handling
sg run --pattern 'OldError::$VARIANT($$$ARGS)' \
  --rewrite 'NewError::$VARIANT($$$ARGS)' --lang rust -U
```

### Trait implementations
```bash
sg run --pattern 'impl $TRAIT for $TYPE { $$$BODY }' --lang rust
```

### Use statements
```bash
# Rename in use paths
fastmod 'use crate::errors::OldError' 'use crate::errors::NewError' --extensions rs
```

### Derive macros
```bash
# Add a derive
sg run --pattern '#[derive($$$EXISTING)]' \
  --rewrite '#[derive($$$EXISTING, Clone)]' --lang rust -i
```

## Common Refactors

### unwrap() → expect() / ?
```bash
# unwrap to expect
sg run --pattern '$EXPR.unwrap()' \
  --rewrite '$EXPR.expect("TODO: handle error")' --lang rust -i

# unwrap to ? (inside functions returning Result)
sg run --pattern '$EXPR.unwrap()' --rewrite '$EXPR?' --lang rust -i
```

### Error type migration
```bash
# 1. Rename the type definition (manual — usually one file)
# 2. Rename all usages
sg run --pattern 'OldError' --rewrite 'NewError' --lang rust -U
# 3. Verify
cargo check
```

### Edition migration
```bash
cargo fix --edition    # migrate to current edition
cargo fix --edition-idioms  # apply edition idiom changes
```

## Verification Tools

```bash
cargo check              # type check (fast)
cargo clippy             # lint check
cargo clippy --fix       # auto-fix lint warnings
cargo test               # full test suite
cargo fix                # auto-fix compiler warnings
```

## Gotchas

- **Macros don't parse as normal AST.** `println!("...")`, `vec![...]`, `derive(...)` internals can't be matched structurally. Use fastmod for text patterns inside macros.
- **`use` paths need full qualification** in patterns. `use crate::module::Type` is different from `use Type`.
- **Lifetime annotations** are AST nodes. `'a` in `&'a str` can be matched with `$LIFETIME`.
- **Turbofish** syntax (`func::<Type>()`) has its own AST shape — test your pattern against actual code.
- **cfg attributes** mean some code is conditionally compiled. Run `cargo check` with different feature flags if the codebase uses features.
