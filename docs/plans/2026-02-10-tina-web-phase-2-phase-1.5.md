# Phase 1.5: Foundation Remediation & Validation

## Context

Phase 1 was designated for implementing the schema and Convex functions from `docs/plans/2026-02-10-tina-web-phase-2-design.md`. Upon inspection, all Phase 1 deliverables have already been completed:

- Schema tables `commits` and `plans` added to `/Users/joshua/Projects/tina/convex/schema.ts:124-149`
- Convex functions implemented in `/Users/joshua/Projects/tina/convex/commits.ts` and `/Users/joshua/Projects/tina/convex/plans.ts`
- Test suites created and passing for all functions
- Shutdown event tests added to `/Users/joshua/Projects/tina/convex/events.test.ts`

**Test results:**
- `commits.test.ts`: 7 tests passing
- `plans.test.ts`: 8 tests passing
- `events.test.ts`: 6 tests passing (shutdown events)

This phase validates the implementation and ensures it's ready for Phase 2 (tina-daemon watchers).

## Summary

Validate that Phase 1 implementation is complete and production-ready. Verify schema deployment, test coverage, and integration points. Document any gaps or issues for remediation before proceeding to Phase 2.

## Tasks

### Task 1.5.1: Verify schema deployment

**Model:** sonnet

**Validation steps:**

1. Check Convex schema has been deployed successfully
   ```bash
   npx convex dev
   ```

2. Verify tables exist in Convex dashboard:
   - `commits` table with indexes: `by_orchestration`, `by_phase`, `by_sha`
   - `plans` table with indexes: `by_orchestration`, `by_phase`, `by_path`

3. Verify no schema migration errors in Convex logs

**Exit criteria:**
- Schema deployed without errors
- Both tables visible in Convex dashboard
- All indexes created successfully

**Dependencies:** None

**Blocker for:** Task 1.5.2

### Task 1.5.2: Run comprehensive test suite

**Model:** sonnet

**Test execution:**

1. Run all Convex tests:
   ```bash
   npx vitest run convex/commits.test.ts convex/plans.test.ts convex/events.test.ts
   ```

2. Verify test coverage:
   - commits.ts: All mutations and queries covered
   - plans.ts: All mutations and queries covered
   - events.ts: Shutdown event type covered

3. Check for any flaky tests (run 3 times)

**Expected results:**
- commits.test.ts: 7/7 tests passing
- plans.test.ts: 8/8 tests passing
- events.test.ts: 6/6 shutdown event tests passing
- No test failures across 3 runs
- All tests complete in < 500ms

**Dependencies:** Task 1.5.1

**Blocker for:** Task 1.5.3

### Task 1.5.3: Validate function signatures match design

**Model:** sonnet

**Verification:**

Compare implemented functions against design spec in `docs/plans/2026-02-10-tina-web-phase-2-phase-1.md`:

**commits.ts:**
- ✅ `recordCommit` mutation - args match spec (orchestrationId, phaseNumber, sha, shortSha, subject, author, timestamp, insertions, deletions)
- ✅ `listCommits` query - args match spec (orchestrationId, phaseNumber optional)
- ✅ `getCommit` query - args match spec (sha)
- ✅ Deduplication logic via `by_sha` index

**plans.ts:**
- ✅ `upsertPlan` mutation - args match spec (orchestrationId, phaseNumber, planPath, content)
- ✅ `getPlan` query - args match spec (orchestrationId, phaseNumber)
- ✅ `listPlans` query - args match spec (orchestrationId)
- ✅ Upsert logic correctly creates or updates

**events.ts:**
- ✅ `recordEvent` handles `agent_shutdown` event type
- ✅ Detail field stores JSON with agent_name, agent_type, shutdown_detected_at

**Exit criteria:**
- All function signatures match design spec
- Return types match expected types
- Error handling consistent with existing patterns

**Dependencies:** Task 1.5.2

**Blocker for:** Task 1.5.4

### Task 1.5.4: Manual smoke test via Convex dashboard

**Model:** sonnet

**Test procedure:**

1. Start Convex dev server:
   ```bash
   npx convex dev
   ```

2. Test commits functions:
   - Open Convex dashboard → Functions → commits:recordCommit
   - Insert test commit with valid orchestrationId
   - Verify commit appears in `commits` table
   - Call `recordCommit` again with same SHA
   - Verify it returns existing ID (deduplication)
   - Call `listCommits` with orchestrationId
   - Verify commit returned

3. Test plans functions:
   - Call `plans:upsertPlan` with test data
   - Verify plan appears in `plans` table
   - Call `upsertPlan` again with updated content
   - Verify lastSynced timestamp updated
   - Call `getPlan` with orchestrationId + phaseNumber
   - Verify correct plan returned

4. Test events functions:
   - Call `events:recordEvent` with eventType: "agent_shutdown"
   - Verify event appears in `orchestrationEvents` table
   - Verify detail JSON is valid and parseable

**Exit criteria:**
- All manual tests pass
- No runtime errors
- Data persists correctly in Convex
- Queries return expected results

**Dependencies:** Task 1.5.3

**Blocker for:** None (this completes Phase 1.5)

## Integration

Phase 1.5 is purely validation - no code changes expected unless gaps are found.

**Files validated:**
- `/Users/joshua/Projects/tina/convex/schema.ts:124-149` - Schema definitions
- `/Users/joshua/Projects/tina/convex/commits.ts` - Commit functions
- `/Users/joshua/Projects/tina/convex/plans.ts` - Plan functions
- `/Users/joshua/Projects/tina/convex/events.test.ts` - Shutdown event tests
- `/Users/joshua/Projects/tina/convex/commits.test.ts` - Commit tests
- `/Users/joshua/Projects/tina/convex/plans.test.ts` - Plan tests

**No Rust code changes.**
**No UI changes.**

## Testing Strategy

**Automated tests:**
- Unit tests: commits.test.ts (7 tests), plans.test.ts (8 tests), events.test.ts (6 tests)
- All tests use `convex-test` with schema
- Edge cases covered: deduplication, upsert, filtering, null returns

**Manual tests:**
- Convex dashboard smoke tests
- Schema deployment verification
- Index creation verification

**Exit criteria:**
- All automated tests pass consistently
- Manual smoke tests complete successfully
- No schema deployment errors
- Functions deployable to Convex production

## Estimated Time

- Task 1.5.1: 15 min (schema verification)
- Task 1.5.2: 10 min (run tests)
- Task 1.5.3: 20 min (signature validation)
- Task 1.5.4: 20 min (manual smoke tests)

**Total: ~65 minutes (1 hour)**

## Success Criteria

1. ✅ Schema includes `commits` and `plans` tables with all indexes
2. ✅ commits.ts functions implement spec correctly
3. ✅ plans.ts functions implement spec correctly
4. ✅ agent_shutdown events work with existing infrastructure
5. ✅ All tests pass (21/21 tests passing)
6. ✅ No breaking changes to existing orchestrations
7. ✅ Functions deployable to Convex production
8. Manual smoke tests pass without errors
9. Schema deployed without migration errors
10. Function signatures match design spec exactly

## Current Status

**Completed work:**
- ✅ Schema changes applied (commits and plans tables)
- ✅ Convex functions implemented (commits.ts, plans.ts)
- ✅ Test suites written and passing (21 tests total)
- ✅ Shutdown event tests added to events.test.ts

**Remaining work:**
- Verify schema deployment to Convex cloud
- Run comprehensive test suite validation
- Manual smoke testing via Convex dashboard
- Document any issues found

## Dependencies

This phase is a prerequisite for:
- **Phase 2:** tina-daemon watchers need these Convex functions
- **Phase 3:** UI components need these queries

Phase 2 cannot proceed until Phase 1.5 validation is complete.

## Rollback Plan

If validation reveals issues:

1. **Schema issues:**
   - Revert schema changes via Convex dashboard
   - Remove commits and plans tables
   - Restore from backup if needed

2. **Function issues:**
   - Document specific failures
   - Create remediation tasks
   - Fix issues before proceeding to Phase 2

3. **Test issues:**
   - Fix flaky tests
   - Add missing test coverage
   - Verify edge cases

Schema changes are non-breaking since existing code doesn't reference new tables.

## Notes

The original Phase 1 plan called for implementation, but all work has already been completed. This remediation phase focuses on validation and quality assurance to ensure the foundation is solid before building Phase 2 (tina-daemon watchers) on top of it.

All test results as of 2026-02-10 10:05 PST:
```
convex/commits.test.ts: 7 passed (7)
convex/plans.test.ts: 8 passed (8)
convex/events.test.ts: 6 passed (6)
Total: 21 passed
Duration: ~300ms
```

Schema verification shows both tables exist with correct indexes:
- commits: by_orchestration, by_phase, by_sha
- plans: by_orchestration, by_phase, by_path
