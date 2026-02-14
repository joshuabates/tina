# Design Workbench Phase 4.5 Remediation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 276087c97feffe678df03fc93f9718bafd392f28

**Goal:** Address gaps from Phase 4 review: fix screenshotDir path resolution in capture-design.ts, capture-storybook.ts, and compare.ts.

**Architecture:** Targeted fixes to existing implementation. No new architecture.

**Phase context:** Phase 4 implemented screenshot capture and comparison tooling. Review found that screenshotDir path resolution uses incorrect relative path depth from `runtime/scripts/` to repo root. The config's `screenshotDir` value (`ui/designs/.artifacts/screenshots`) is relative to the repo root, but the scripts don't traverse enough directories to reach the repo root from `import.meta.dirname`.

**Issues to address:**
1. `capture-design.ts` uses `"../../.."` (3 levels: lands at `ui/`) — should use `"../../../.."` (4 levels: lands at repo root)
2. `capture-storybook.ts` uses `"../../.."` (3 levels: lands at `ui/`) — should use `"../../../.."` (4 levels: lands at repo root)
3. `compare.ts` uses `"../.."` (2 levels: lands at `designs/`) — should use `"../../../.."` (4 levels: lands at repo root)

**Path analysis:**
```
<repo>/ui/designs/runtime/scripts/  ← import.meta.dirname
  ..                                → runtime/     (1 level)
  ../..                             → designs/     (2 levels)
  ../../..                          → ui/          (3 levels)
  ../../../..                       → <repo>/      (4 levels) ✓
```

---

## Tasks

### Task 1: Fix screenshotDir path resolution in all three scripts

**Files:**
- `ui/designs/runtime/scripts/capture-design.ts`
- `ui/designs/runtime/scripts/capture-storybook.ts`
- `ui/designs/runtime/scripts/compare.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Fix the relative path used with `import.meta.dirname` to correctly resolve `config.screenshotDir` from the repo root.

**Steps:**

1. In `ui/designs/runtime/scripts/capture-design.ts`, change the `screenshotDir` resolution from:

```typescript
const screenshotDir = path.resolve(
  import.meta.dirname,
  "../../..",
  config.screenshotDir,
);
```

to:

```typescript
const screenshotDir = path.resolve(
  import.meta.dirname,
  "../../../..",
  config.screenshotDir,
);
```

2. In `ui/designs/runtime/scripts/capture-storybook.ts`, change the `screenshotDir` resolution from:

```typescript
const screenshotDir = path.resolve(
  import.meta.dirname,
  "../../..",
  config.screenshotDir,
);
```

to:

```typescript
const screenshotDir = path.resolve(
  import.meta.dirname,
  "../../../..",
  config.screenshotDir,
);
```

3. In `ui/designs/runtime/scripts/compare.ts`, change the `screenshotDir` resolution from:

```typescript
const screenshotDir = path.resolve(
  import.meta.dirname,
  "../..",
  config.screenshotDir,
);
```

to:

```typescript
const screenshotDir = path.resolve(
  import.meta.dirname,
  "../../../..",
  config.screenshotDir,
);
```

4. Run: `cd ui/designs/runtime && npx tsc --noEmit`
   Expected: No type errors (path strings are just string literals, no type impact)

5. Run: `node -e "const path = require('path'); const d = '/repo/ui/designs/runtime/scripts'; console.log(path.resolve(d, '../../../..', 'ui/designs/.artifacts/screenshots'))"`
   Expected: `/repo/ui/designs/.artifacts/screenshots`

---

## Phase Estimates

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Fix screenshotDir path in 3 files | 2 min |
| **Total** | | **~2 min** |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 10 |

---

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| depends-on | pass |
| plan-baseline | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
