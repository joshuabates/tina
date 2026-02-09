# TypeScript Refactoring Reference

## ast-grep Patterns for TypeScript

### Function/hook signatures
```bash
# Find hook calls with specific arguments
sg run --pattern 'useDataFetcher($URL, $OPTS)' --lang typescript

# Restructure arguments
sg run --pattern 'useDataFetcher($URL, $OPTS)' \
  --rewrite 'useDataFetcher({ url: $URL, options: $OPTS })' --lang typescript -i

# Find function declarations
sg run --pattern 'function $NAME($$$PARAMS): $RET { $$$BODY }' --lang typescript
```

### Interface/type changes
```bash
# Find interface definitions
sg run --pattern 'interface $NAME { $$$FIELDS }' --lang typescript

# Find type aliases
sg run --pattern 'type $NAME = $TYPE' --lang typescript
```

### Import restructuring
```bash
# Named import rename
sg run --pattern 'import { $$$BEFORE, OldName, $$$AFTER } from $PATH' \
  --rewrite 'import { $$$BEFORE, NewName, $$$AFTER } from $PATH' --lang typescript -i

# Path changes (fastmod is simpler here)
fastmod "from 'old/path'" "from 'new/path'" --extensions ts,tsx
```

### JSX/TSX patterns
```bash
# Component rename
sg run --pattern '<OldComponent $$$PROPS />' \
  --rewrite '<NewComponent $$$PROPS />' --lang tsx -i

# Also catch opening tags with children
sg run --pattern '<OldComponent $$$PROPS>$$$CHILDREN</OldComponent>' \
  --rewrite '<NewComponent $$$PROPS>$$$CHILDREN</NewComponent>' --lang tsx -i
```

### Export changes
```bash
# Named to default
sg run --pattern 'export function $NAME($$$ARGS) { $$$BODY }' \
  --rewrite 'function $NAME($$$ARGS) { $$$BODY }\nexport default $NAME' --lang typescript -i
```

## Advanced: ts-morph for Type-Aware Refactoring

When ast-grep isn't enough (need type info), write a one-off ts-morph script:

```typescript
// rename-type.ts
import { Project } from 'ts-morph'

const project = new Project({ tsConfigFilePath: './tsconfig.json' })

// Find all references to a type and rename
const sourceFile = project.getSourceFileOrThrow('src/types.ts')
const typeAlias = sourceFile.getTypeAliasOrThrow('OldType')
typeAlias.rename('NewType')  // renames ALL references across the project

project.saveSync()
```

```bash
npx ts-node rename-type.ts
```

## Advanced: jscodeshift for Programmatic Transforms

For complex per-file logic (API migrations, argument restructuring):

```typescript
// transform.ts
import type { API, FileInfo } from 'jscodeshift'

export default function transform(file: FileInfo, api: API) {
  const j = api.jscodeshift
  return j(file.source)
    .find(j.CallExpression, { callee: { name: 'oldFunc' } })
    .replaceWith(path => {
      const args = path.value.arguments
      return j.callExpression(j.identifier('newFunc'), [
        j.objectExpression([
          j.property('init', j.identifier('url'), args[0]),
          j.property('init', j.identifier('options'), args[1]),
        ]),
      ])
    })
    .toSource()
}
```

```bash
npx jscodeshift -t transform.ts --extensions ts,tsx src/
```

## Verification Tools

```bash
npx tsc --noEmit          # type check (fast, no output files)
npx eslint --fix src/     # lint autofix
npm test                  # test suite
npx tsc --noEmit --watch  # continuous type check during batch refactoring
```

## Gotchas

- **TSX needs `--lang tsx`** in ast-grep, not `--lang typescript`. Self-closing and paired JSX tags are different AST shapes — handle both.
- **Template literals** have complex AST. `` `${expr}` `` parses differently from `'string'`. Test patterns against actual code.
- **Decorators** (if using them) are separate AST nodes. `@Component` needs its own pattern.
- **Optional chaining** (`?.`) and nullish coalescing (`??`) are specific AST node kinds.
- **Type assertions** (`as Type` vs `<Type>`) have different AST shapes.
- **Re-exports** (`export { X } from './module'`) are easy to miss — search for them separately.
