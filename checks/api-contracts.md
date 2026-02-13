# API Contracts Check

Verify that public API contracts are consistent across layers.

## Criteria

1. **Convex schema matches mutations/queries:** Every field in `convex/schema.ts` table definitions is used by at least one mutation or query. No mutation writes a field not in the schema.

2. **CLI arguments match Convex mutations:** Every `tina-session` CLI command that writes to Convex passes arguments matching the mutation's expected parameters. No silent field drops or type mismatches.

3. **Web query definitions match Convex queries:** Every `QueryDef` in `tina-web/src/services/data/queryDefs.ts` references an existing Convex query function with matching argument types.

4. **Daemon HTTP response types match web hooks:** TypeScript types in `tina-web/src/hooks/useDaemonQuery.ts` match the Rust serialization types in `tina-daemon/src/git.rs`.

## How to evaluate

For each criterion, spot-check 2-3 examples from the phase's changed files. If all spot checks pass, the check passes. If any mismatch is found, the check fails with a description of the mismatch.
