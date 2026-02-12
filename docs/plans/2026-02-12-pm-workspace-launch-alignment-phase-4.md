# PM Workspace + Launch UX Realignment Phase 4: Design Validation Model

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** b4f4b7935ea4eeea013ea57c81258f87f0480058

**Goal:** Add complexity + marker fields + phase validation fields to designs. Implement backend phase parsing and marker persistence. Add markdown import prefill UX with complexity preset selection.

**Architecture:** The design stores validation state directly in Convex fields. Markdown remains plain content — no frontmatter coupling. Key additions:

1. **Complexity presets** (`convex/designPresets.ts`): Maps preset names to required marker lists. Three tiers: `simple`, `standard`, `complex`. Pure data + helper functions, no mutations.
2. **Schema fields** (`convex/schema.ts`): Add `complexityPreset`, `requiredMarkers`, `completedMarkers`, `phaseCount`, `phaseStructureValid`, `validationUpdatedAt` as `v.optional()` fields to the designs table (additive — existing designs unaffected).
3. **Phase parser**: Server-side regex (`/^## Phase \d+/gm`) in `createDesign`/`updateDesign` handlers to compute `phaseCount` and `phaseStructureValid`.
4. **Marker mutations**: New `updateDesignMarkers` mutation for toggling `completedMarkers` from the UI.
5. **Frontend schema**: Extend `DesignSummary` Effect schema with new optional fields.
6. **CreateDesignModal**: Add complexity preset selector and markdown file import (drag/prefill).
7. **DesignDetailPage**: Show validation state (markers checklist, phase count, phase validity badge).

**Key files:**
- `convex/designPresets.ts` — New: complexity presets + phase parser
- `convex/designPresets.test.ts` — New: tests for presets + parser
- `convex/schema.ts` — Add validation fields to designs table
- `convex/designs.ts` — Update create/update, add updateDesignMarkers
- `convex/designs.test.ts` — Add validation-related tests
- `tina-web/src/schemas/design.ts` — Extend DesignSummary
- `tina-web/src/schemas/__tests__/schemas.test.ts` — Update design schema tests
- `tina-web/src/services/data/__tests__/queryDefs.test.ts` — Update design query tests
- `tina-web/src/components/pm/CreateDesignModal.tsx` — Add complexity + import
- `tina-web/src/components/pm/DesignDetailPage.tsx` — Show validation state + markers

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 800 |

---

## Tasks

### Task 1: Add complexity presets and phase parser module

**Files:**
- `convex/designPresets.ts` (new)

**Model:** opus

**review:** full

**Depends on:** none

Create a pure-data module with complexity preset definitions and phase-structure parser.

**Steps:**

1. Create `convex/designPresets.ts` with the following content:

```typescript
/**
 * Complexity preset templates and phase structure parser for designs.
 * Presets map to required validation markers.
 * Phase parser extracts phase count from markdown headings.
 */

export type ComplexityPreset = "simple" | "standard" | "complex";

export const COMPLEXITY_PRESETS: Record<ComplexityPreset, string[]> = {
  simple: [
    "objective_defined",
    "scope_bounded",
  ],
  standard: [
    "objective_defined",
    "scope_bounded",
    "phases_outlined",
    "testing_strategy",
    "acceptance_criteria",
  ],
  complex: [
    "objective_defined",
    "scope_bounded",
    "phases_outlined",
    "testing_strategy",
    "acceptance_criteria",
    "architecture_documented",
    "dependencies_mapped",
    "risk_assessment",
    "rollback_plan",
  ],
};

export const VALID_PRESETS = Object.keys(COMPLEXITY_PRESETS) as ComplexityPreset[];

export function seedMarkersFromPreset(preset: ComplexityPreset): string[] {
  const markers = COMPLEXITY_PRESETS[preset];
  if (!markers) {
    throw new Error(`Unknown complexity preset: "${preset}". Valid: ${VALID_PRESETS.join(", ")}`);
  }
  return [...markers];
}

export interface PhaseStructure {
  phaseCount: number;
  phaseStructureValid: boolean;
}

const PHASE_HEADING_PATTERN = /^## Phase \d+/gm;

export function parsePhaseStructure(markdown: string): PhaseStructure {
  const matches = markdown.match(PHASE_HEADING_PATTERN);
  const phaseCount = matches ? matches.length : 0;
  return {
    phaseCount,
    phaseStructureValid: phaseCount >= 1,
  };
}
```

2. Verify file compiles:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | tail -10`

Expected: No type errors (or only pre-existing unrelated errors).

---

### Task 2: Write tests for complexity presets and phase parser

**Files:**
- `convex/designPresets.test.ts` (new)

**Model:** opus

**review:** full

**Depends on:** 1

Write unit tests for the presets module covering all preset tiers and phase parsing edge cases.

**Steps:**

1. Create `convex/designPresets.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import {
  COMPLEXITY_PRESETS,
  VALID_PRESETS,
  seedMarkersFromPreset,
  parsePhaseStructure,
} from "./designPresets";

describe("COMPLEXITY_PRESETS", () => {
  test("defines three preset tiers", () => {
    expect(VALID_PRESETS).toEqual(["simple", "standard", "complex"]);
  });

  test("simple has fewer markers than standard", () => {
    expect(COMPLEXITY_PRESETS.simple.length).toBeLessThan(
      COMPLEXITY_PRESETS.standard.length,
    );
  });

  test("standard has fewer markers than complex", () => {
    expect(COMPLEXITY_PRESETS.standard.length).toBeLessThan(
      COMPLEXITY_PRESETS.complex.length,
    );
  });

  test("all markers are unique within each preset", () => {
    for (const preset of VALID_PRESETS) {
      const markers = COMPLEXITY_PRESETS[preset];
      expect(new Set(markers).size).toBe(markers.length);
    }
  });
});

describe("seedMarkersFromPreset", () => {
  test("returns copy of simple markers", () => {
    const markers = seedMarkersFromPreset("simple");
    expect(markers).toEqual(COMPLEXITY_PRESETS.simple);
    // Verify it's a copy, not a reference
    markers.push("extra");
    expect(COMPLEXITY_PRESETS.simple).not.toContain("extra");
  });

  test("returns copy of standard markers", () => {
    const markers = seedMarkersFromPreset("standard");
    expect(markers).toEqual(COMPLEXITY_PRESETS.standard);
  });

  test("returns copy of complex markers", () => {
    const markers = seedMarkersFromPreset("complex");
    expect(markers).toEqual(COMPLEXITY_PRESETS.complex);
  });

  test("throws for unknown preset", () => {
    expect(() => seedMarkersFromPreset("unknown" as any)).toThrow(
      'Unknown complexity preset: "unknown"',
    );
  });
});

describe("parsePhaseStructure", () => {
  test("finds zero phases in empty markdown", () => {
    const result = parsePhaseStructure("");
    expect(result.phaseCount).toBe(0);
    expect(result.phaseStructureValid).toBe(false);
  });

  test("finds zero phases in markdown without phase headings", () => {
    const result = parsePhaseStructure("# Design\n\nSome content\n\n## Overview");
    expect(result.phaseCount).toBe(0);
    expect(result.phaseStructureValid).toBe(false);
  });

  test("finds single phase heading", () => {
    const md = "# Design\n\n## Phase 1\n\nDo stuff";
    const result = parsePhaseStructure(md);
    expect(result.phaseCount).toBe(1);
    expect(result.phaseStructureValid).toBe(true);
  });

  test("finds multiple phase headings", () => {
    const md = [
      "# Feature Design",
      "",
      "## Phase 1: Setup",
      "Setup work",
      "",
      "## Phase 2: Implementation",
      "Build it",
      "",
      "## Phase 3: Testing",
      "Test it",
    ].join("\n");
    const result = parsePhaseStructure(md);
    expect(result.phaseCount).toBe(3);
    expect(result.phaseStructureValid).toBe(true);
  });

  test("ignores non-phase numbered headings", () => {
    const md = "## Phase 1\n\n## Section 2\n\n## Phase 3";
    const result = parsePhaseStructure(md);
    expect(result.phaseCount).toBe(2);
    expect(result.phaseStructureValid).toBe(true);
  });

  test("ignores phase headings at wrong heading level", () => {
    const md = "# Phase 1\n\n### Phase 2\n\n## Phase 3";
    const result = parsePhaseStructure(md);
    expect(result.phaseCount).toBe(1);
    expect(result.phaseStructureValid).toBe(true);
  });

  test("handles phase headings with extra text after number", () => {
    const md = "## Phase 1: Navigation\n\n## Phase 2: Modals";
    const result = parsePhaseStructure(md);
    expect(result.phaseCount).toBe(2);
    expect(result.phaseStructureValid).toBe(true);
  });
});
```

2. Run the tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run convex/designPresets.test.ts 2>&1 | tail -20`

Expected: All tests pass.

---

### Task 3: Add validation fields to designs schema

**Files:**
- `convex/schema.ts`

**Model:** opus

**review:** full

**Depends on:** none

Add the six new validation fields to the designs table as optional fields (Convex handles additive schema changes without migration).

**Steps:**

1. In `convex/schema.ts`, add the following fields to the `designs` table definition, after the `archivedAt` field (line 271):

Add these fields before the closing `})`:

```typescript
    complexityPreset: v.optional(v.string()), // simple | standard | complex
    requiredMarkers: v.optional(v.array(v.string())),
    completedMarkers: v.optional(v.array(v.string())),
    phaseCount: v.optional(v.number()),
    phaseStructureValid: v.optional(v.boolean()),
    validationUpdatedAt: v.optional(v.string()),
```

The full designs table should look like:

```typescript
  designs: defineTable({
    projectId: v.id("projects"),
    designKey: v.string(),
    title: v.string(),
    markdown: v.string(),
    status: v.string(), // draft | in_review | approved | archived
    createdAt: v.string(),
    updatedAt: v.string(),
    archivedAt: v.optional(v.string()),
    complexityPreset: v.optional(v.string()), // simple | standard | complex
    requiredMarkers: v.optional(v.array(v.string())),
    completedMarkers: v.optional(v.array(v.string())),
    phaseCount: v.optional(v.number()),
    phaseStructureValid: v.optional(v.boolean()),
    validationUpdatedAt: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_key", ["designKey"]),
```

2. Verify schema compiles:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | tail -10`

Expected: No type errors.

---

### Task 4: Update createDesign and updateDesign mutations with validation

**Files:**
- `convex/designs.ts`

**Model:** opus

**review:** full

**Depends on:** 1, 3

Update `createDesign` to accept an optional `complexityPreset` arg. When provided, seed markers and compute phase validation. Update `updateDesign` to recompute phase validation when markdown changes.

**Steps:**

1. Add imports at the top of `convex/designs.ts`:

```typescript
import { seedMarkersFromPreset, parsePhaseStructure } from "./designPresets";
import type { ComplexityPreset } from "./designPresets";
```

2. Update `createDesign` mutation to accept optional `complexityPreset`:

Replace the `args` object:
```typescript
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    markdown: v.string(),
    complexityPreset: v.optional(v.string()),
  },
```

Replace the handler body from the `return await ctx.db.insert` call through the end of the handler. The new handler:

```typescript
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error(`Project not found: ${args.projectId}`);
    }

    const keyNumber = await allocateKey(ctx, args.projectId, "design");
    const designKey = `${project.name.toUpperCase()}-D${keyNumber}`;
    const now = new Date().toISOString();

    const insertFields: Record<string, unknown> = {
      projectId: args.projectId,
      designKey,
      title: args.title,
      markdown: args.markdown,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };

    if (args.complexityPreset) {
      const preset = args.complexityPreset as ComplexityPreset;
      const requiredMarkers = seedMarkersFromPreset(preset);
      const { phaseCount, phaseStructureValid } = parsePhaseStructure(args.markdown);

      insertFields.complexityPreset = preset;
      insertFields.requiredMarkers = requiredMarkers;
      insertFields.completedMarkers = [];
      insertFields.phaseCount = phaseCount;
      insertFields.phaseStructureValid = phaseStructureValid;
      insertFields.validationUpdatedAt = now;
    }

    return await ctx.db.insert("designs", insertFields as any);
  },
```

3. Update `updateDesign` mutation to recompute phase validation when markdown changes:

Replace the `handler` of `updateDesign`:

```typescript
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    if (!design) {
      throw new Error(`Design not found: ${args.designId}`);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

    if (args.title !== undefined) {
      updates.title = args.title;
    }
    if (args.markdown !== undefined) {
      updates.markdown = args.markdown;
      // Recompute phase validation when markdown changes
      const { phaseCount, phaseStructureValid } = parsePhaseStructure(args.markdown);
      updates.phaseCount = phaseCount;
      updates.phaseStructureValid = phaseStructureValid;
      updates.validationUpdatedAt = now;
    }

    await ctx.db.patch(args.designId, updates);
    return args.designId;
  },
```

4. Verify compilation:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | tail -10`

Expected: No type errors.

---

### Task 5: Add updateDesignMarkers mutation

**Files:**
- `convex/designs.ts`

**Model:** opus

**review:** full

**Depends on:** 3

Add a new mutation for toggling design validation markers from the UI.

**Steps:**

1. Add the `updateDesignMarkers` mutation at the end of `convex/designs.ts`:

```typescript
export const updateDesignMarkers = mutation({
  args: {
    designId: v.id("designs"),
    completedMarkers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    if (!design) {
      throw new Error(`Design not found: ${args.designId}`);
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.designId, {
      completedMarkers: args.completedMarkers,
      validationUpdatedAt: now,
      updatedAt: now,
    });
    return args.designId;
  },
});
```

2. Verify compilation:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | tail -10`

Expected: No type errors.

---

### Task 6: Write backend tests for validation mutations

**Files:**
- `convex/designs.test.ts`

**Model:** opus

**review:** full

**Depends on:** 2, 4, 5

Add tests for createDesign with complexityPreset, updateDesign markdown recomputation, and updateDesignMarkers.

**Steps:**

1. Add a new `describe("createDesign with validation", ...)` block in `convex/designs.test.ts` after the existing `createDesign` describe block:

```typescript
  describe("createDesign with validation", () => {
    test("seeds markers and computes phase structure from complexity preset", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "VAL",
        repoPath: "/Users/joshua/Projects/val",
      });

      const markdown = "# Feature\n\n## Phase 1: Setup\n\nDo setup\n\n## Phase 2: Build\n\nBuild it";
      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Validated Design",
        markdown,
        complexityPreset: "standard",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.complexityPreset).toBe("standard");
      expect(design?.requiredMarkers).toEqual([
        "objective_defined",
        "scope_bounded",
        "phases_outlined",
        "testing_strategy",
        "acceptance_criteria",
      ]);
      expect(design?.completedMarkers).toEqual([]);
      expect(design?.phaseCount).toBe(2);
      expect(design?.phaseStructureValid).toBe(true);
      expect(design?.validationUpdatedAt).toBeDefined();
    });

    test("creates design without validation when no preset given", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Plain Design",
        markdown: "# No phases here",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.complexityPreset).toBeUndefined();
      expect(design?.requiredMarkers).toBeUndefined();
      expect(design?.phaseCount).toBeUndefined();
    });

    test("detects invalid phase structure", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "No Phases",
        markdown: "# Design\n\nJust content, no phases",
        complexityPreset: "simple",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.phaseCount).toBe(0);
      expect(design?.phaseStructureValid).toBe(false);
    });
  });
```

2. Add a test for updateDesign recomputing phase validation in the existing `updateDesign` describe block:

```typescript
    test("recomputes phase validation when markdown changes", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        markdown: "# No phases",
        complexityPreset: "simple",
      });

      const before = await t.query(api.designs.getDesign, { designId });
      expect(before?.phaseCount).toBe(0);
      expect(before?.phaseStructureValid).toBe(false);

      await t.mutation(api.designs.updateDesign, {
        designId,
        markdown: "# Design\n\n## Phase 1: Build\n\nBuild it\n\n## Phase 2: Test\n\nTest it",
      });

      const after = await t.query(api.designs.getDesign, { designId });
      expect(after?.phaseCount).toBe(2);
      expect(after?.phaseStructureValid).toBe(true);
      expect(after?.validationUpdatedAt).toBeDefined();
    });
```

3. Add a new `describe("updateDesignMarkers", ...)` block:

```typescript
  describe("updateDesignMarkers", () => {
    test("updates completed markers", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        markdown: "## Phase 1\n\nContent",
        complexityPreset: "simple",
      });

      await t.mutation(api.designs.updateDesignMarkers, {
        designId,
        completedMarkers: ["objective_defined"],
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.completedMarkers).toEqual(["objective_defined"]);
      expect(design?.validationUpdatedAt).toBeDefined();
    });

    test("replaces completed markers entirely", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        markdown: "## Phase 1\n\nContent",
        complexityPreset: "standard",
      });

      await t.mutation(api.designs.updateDesignMarkers, {
        designId,
        completedMarkers: ["objective_defined", "scope_bounded"],
      });

      await t.mutation(api.designs.updateDesignMarkers, {
        designId,
        completedMarkers: ["objective_defined"],
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.completedMarkers).toEqual(["objective_defined"]);
    });

    test("throws for non-existent design", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);
      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        markdown: "content",
      });

      try {
        await t.mutation(api.designs.updateDesignMarkers, {
          designId: designId.replace(/^[a-z0-9]+/, "z0000000000000000000000") as any,
          completedMarkers: [],
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect((e as Error).message).toContain("Design not found");
      }
    });
  });
```

4. Run all design tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run convex/designs.test.ts convex/designPresets.test.ts 2>&1 | tail -20`

Expected: All tests pass.

---

### Task 7: Update frontend DesignSummary schema and tests

**Files:**
- `tina-web/src/schemas/design.ts`
- `tina-web/src/schemas/common.ts`
- `tina-web/src/schemas/__tests__/schemas.test.ts`
- `tina-web/src/services/data/__tests__/queryDefs.test.ts`

**Model:** opus

**review:** full

**Depends on:** 3

Extend the Effect schema to include the new optional validation fields.

**Steps:**

1. First check `tina-web/src/schemas/common.ts` for existing helpers. If `optionalNumber`, `optionalBoolean`, or `optionalStringArray` don't exist, add them:

```typescript
export const optionalNumber = Schema.optional(Schema.Number)
export const optionalBoolean = Schema.optional(Schema.Boolean)
export const optionalStringArray = Schema.optional(Schema.Array(Schema.String))
```

2. In `tina-web/src/schemas/design.ts`, update the imports and add the new optional fields:

```typescript
import { Schema } from "effect"
import { convexDocumentFields, optionalString, optionalNumber, optionalBoolean, optionalStringArray } from "./common"

export const DesignSummary = Schema.Struct({
  ...convexDocumentFields,
  projectId: Schema.String,
  designKey: Schema.String,
  title: Schema.String,
  markdown: Schema.String,
  status: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  archivedAt: optionalString,
  complexityPreset: optionalString,
  requiredMarkers: optionalStringArray,
  completedMarkers: optionalStringArray,
  phaseCount: optionalNumber,
  phaseStructureValid: optionalBoolean,
  validationUpdatedAt: optionalString,
})

export type DesignSummary = typeof DesignSummary.Type
```

3. In `tina-web/src/schemas/__tests__/schemas.test.ts`, add a new test after "decodes a design with archivedAt present":

```typescript
  it("decodes a design with validation fields", () => {
    const raw = {
      _id: "design3",
      _creationTime: 1700000000000,
      projectId: "proj1",
      designKey: "DES-3",
      title: "Validated Design",
      markdown: "## Phase 1\n\nContent",
      status: "draft",
      createdAt: "2026-02-09T00:00:00Z",
      updatedAt: "2026-02-09T00:00:00Z",
      complexityPreset: "standard",
      requiredMarkers: ["objective_defined", "scope_bounded"],
      completedMarkers: ["objective_defined"],
      phaseCount: 1,
      phaseStructureValid: true,
      validationUpdatedAt: "2026-02-09T00:00:00Z",
    }

    const result = Schema.decodeUnknownSync(DesignSummary)(raw)
    expect(Option.getOrThrow(result.complexityPreset)).toBe("standard")
    expect(Option.getOrThrow(result.phaseCount)).toBe(1)
    expect(Option.getOrThrow(result.phaseStructureValid)).toBe(true)
  })
```

4. In `tina-web/src/services/data/__tests__/queryDefs.test.ts`, update the "schema decodes valid design list data" test (around line 400) and "schema decodes valid design detail data" test (around line 439) to include the new optional fields in the raw objects (set to `undefined` to match the pattern used for `archivedAt`):

Add to both raw objects:
```typescript
      complexityPreset: undefined,
      requiredMarkers: undefined,
      completedMarkers: undefined,
      phaseCount: undefined,
      phaseStructureValid: undefined,
      validationUpdatedAt: undefined,
```

5. Run schema and queryDefs tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/schemas/__tests__/schemas.test.ts tina-web/src/services/data/__tests__/queryDefs.test.ts 2>&1 | tail -20`

Expected: All tests pass.

---

### Task 8: Update CreateDesignModal with complexity preset and markdown import

**Files:**
- `tina-web/src/components/pm/CreateDesignModal.tsx`

**Model:** opus

**review:** full

**Depends on:** 7

Add a complexity preset selector (radio buttons) and a file import button that reads markdown files and prefills the form.

**Steps:**

1. Rewrite `CreateDesignModal` to include complexity preset selection and file import:

```tsx
import { useState, useRef } from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import { FormDialog } from "@/components/FormDialog"
import type { Id } from "@convex/_generated/dataModel"
import styles from "@/components/FormDialog.module.scss"

const COMPLEXITY_OPTIONS = [
  { value: "simple", label: "Simple", description: "Minimal checklist" },
  { value: "standard", label: "Standard", description: "Default checklist" },
  { value: "complex", label: "Complex", description: "Extended checklist" },
] as const

interface CreateDesignModalProps {
  projectId: string
  onClose: () => void
  onCreated: (designId: string) => void
}

function extractTitleFromMarkdown(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ""
}

export function CreateDesignModal({
  projectId,
  onClose,
  onCreated,
}: CreateDesignModalProps) {
  const [title, setTitle] = useState("")
  const [markdown, setMarkdown] = useState("")
  const [complexityPreset, setComplexityPreset] = useState("standard")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createDesign = useMutation(api.designs.createDesign)

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    setMarkdown(text)

    if (!title.trim()) {
      const extracted = extractTitleFromMarkdown(text)
      if (extracted) setTitle(extracted)
    }

    // Reset input so the same file can be re-imported
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      const designId = await createDesign({
        projectId: projectId as Id<"projects">,
        title: title.trim(),
        markdown: markdown.trim(),
        complexityPreset,
      })
      onCreated(designId as unknown as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create design")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog title="Create Design" onClose={onClose}>
      <form onSubmit={handleSubmit} data-testid="design-create-form">
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-title">
            Title
          </label>
          <input
            id="design-title"
            className={styles.formInput}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Design title"
            autoFocus
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Complexity</label>
          <div data-testid="complexity-selector" style={{ display: "flex", gap: "var(--space-sm)" }}>
            {COMPLEXITY_OPTIONS.map((opt) => (
              <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="complexity"
                  value={opt.value}
                  checked={complexityPreset === opt.value}
                  onChange={() => setComplexityPreset(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-markdown">
            Content
          </label>
          <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-xs)" }}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => fileInputRef.current?.click()}
            >
              Import Markdown
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              style={{ display: "none" }}
              onChange={handleImportFile}
              data-testid="markdown-file-input"
            />
          </div>
          <textarea
            id="design-markdown"
            className={styles.formTextarea}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="Design content (markdown)"
          />
        </div>
        {error && <div className={styles.errorMessage}>{error}</div>}
        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={!title.trim() || submitting}
          >
            {submitting ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
```

2. Verify TypeScript compilation:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -20`

Expected: No type errors.

---

### Task 9: Update DesignDetailPage with validation display and marker checklist

**Files:**
- `tina-web/src/components/pm/DesignDetailPage.tsx`
- `tina-web/src/components/pm/DesignDetailPage.module.scss`

**Model:** opus

**review:** full

**Depends on:** 5, 7

Add a validation section to the design detail page showing complexity preset, phase count, phase validity, and a marker checklist.

**Steps:**

1. The file already imports `useMutation` from convex/react and `api` from convex. No new imports needed for the mutation.

2. Add the marker checklist handler. After the `handleSaved` function and before the `actions` const, add:

```tsx
  const updateMarkers = useMutation(api.designs.updateDesignMarkers)

  const handleToggleMarker = async (marker: string) => {
    const current = design.completedMarkers ?? []
    const next = current.includes(marker)
      ? current.filter((m: string) => m !== marker)
      : [...current, marker]
    await updateMarkers({
      designId: designId as Id<"designs">,
      completedMarkers: next,
    })
  }
```

Note: `design.completedMarkers` comes through the Effect schema as `Option<string[]>`. The implementer needs to handle the Option unwrapping appropriately using `Option.getOrElse(() => [])` or `Option.getOrUndefined()`. Same for `design.complexityPreset`, `design.requiredMarkers`, `design.phaseCount`, and `design.phaseStructureValid`.

3. Add a validation section in the JSX after the `<pre>` tag and before the `{editing && ...}` block:

```tsx
      {design.complexityPreset && (
        <div className={styles.section} data-testid="validation-section">
          <h3 className={styles.sectionTitle}>Validation</h3>
          <div className={styles.metadata}>
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Complexity</span>
              <span>{design.complexityPreset}</span>
            </div>
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Phases</span>
              <span>{design.phaseCount ?? 0}</span>
            </div>
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Phase Structure</span>
              <span>{design.phaseStructureValid ? "Valid" : "Invalid"}</span>
            </div>
          </div>
          {design.requiredMarkers && design.requiredMarkers.length > 0 && (
            <div data-testid="marker-checklist">
              <h4>Markers</h4>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {design.requiredMarkers.map((marker: string) => {
                  const completed = (design.completedMarkers ?? []).includes(marker)
                  return (
                    <li key={marker} style={{ padding: "4px 0" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={completed}
                          onChange={() => handleToggleMarker(marker)}
                        />
                        <span style={{ textTransform: "capitalize" }}>
                          {marker.replace(/_/g, " ")}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
```

The implementer should ensure proper Option unwrapping for all new fields since they come through the Effect schema as `Option<T>`. Use `Option.getOrElse(() => defaultValue)` or `Option.getOrUndefined()` to extract values.

4. Add `metadata`, `metadataItem`, `metadataLabel` CSS classes to `DesignDetailPage.module.scss` if they don't already exist:

```scss
.metadata {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-bottom: var(--space-md);
}

.metadataItem {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
}

.metadataLabel {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

5. Verify TypeScript compilation:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -20`

Expected: No type errors.

---

### Task 10: Update test helpers and add frontend component tests

**Files:**
- `convex/test_helpers.ts`
- `tina-web/src/components/__tests__/DesignDetailPage.test.tsx`
- `tina-web/src/components/__tests__/DesignListPage.test.tsx`

**Model:** opus

**review:** full

**Depends on:** 8, 9

Update test helper `createDesign` to accept optional `complexityPreset`. Add/update frontend component tests for the new UI elements.

**Steps:**

1. In `convex/test_helpers.ts`, update the `CreateDesignOptions` interface and `createDesign` function:

Add `complexityPreset?: string` to `CreateDesignOptions`.

Update the `createDesign` function to pass it through:
```typescript
export async function createDesign(
  t: ConvexHarness,
  options: CreateDesignOptions,
) {
  const args: Record<string, unknown> = {
    projectId: options.projectId as any,
    title: options.title ?? "Test Design",
    markdown: options.markdown ?? "# Test Design\n\nTest content.",
  };

  if (options.complexityPreset !== undefined) {
    args.complexityPreset = options.complexityPreset;
  }

  return await t.mutation(api.designs.createDesign, args as any);
}
```

2. In `tina-web/src/components/__tests__/DesignListPage.test.tsx`, verify that existing tests still pass (they should — the create modal changes don't break existing render tests). If the tests reference `design-create-form`, ensure the test IDs still match.

3. In `tina-web/src/components/__tests__/DesignDetailPage.test.tsx`, add the new validation fields to the `buildDesign` helper (or equivalent fixture builder) if one exists, setting them to default/undefined values so existing tests pass, then add a test for the validation section rendering.

4. Run component tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/DesignListPage.test.tsx tina-web/src/components/__tests__/DesignDetailPage.test.tsx 2>&1 | tail -20`

Expected: All tests pass.

---

### Task 11: Run full test suite and verify

**Files:**
- (any files needing fixes)

**Model:** opus

**review:** full

**Depends on:** 6, 7, 8, 9, 10

Run the complete test suite across Convex and tina-web to verify no regressions.

**Steps:**

1. Run all Convex tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run convex/ 2>&1 | tail -30`

Expected: All Convex tests pass.

2. Run all tina-web tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/ 2>&1 | tail -30`

Expected: All tina-web tests pass.

3. Run TypeScript type check:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -20`

Expected: No type errors.

4. Verify new fields exist in schema:

Run: `cd /Users/joshua/Projects/tina && grep -n "complexityPreset\|requiredMarkers\|completedMarkers\|phaseCount\|phaseStructureValid\|validationUpdatedAt" convex/schema.ts`

Expected: Six lines showing all new fields in the designs table.

---

## Phase Estimates

| Task | Description | Estimate |
|------|-------------|----------|
| 1 | Add complexity presets and phase parser module | 3 min |
| 2 | Write tests for presets and parser | 4 min |
| 3 | Add validation fields to designs schema | 2 min |
| 4 | Update createDesign and updateDesign with validation | 5 min |
| 5 | Add updateDesignMarkers mutation | 3 min |
| 6 | Write backend tests for validation mutations | 5 min |
| 7 | Update frontend DesignSummary schema and tests | 5 min |
| 8 | Update CreateDesignModal with complexity + import | 5 min |
| 9 | Update DesignDetailPage with validation display | 5 min |
| 10 | Update test helpers and frontend component tests | 5 min |
| 11 | Full test suite verification | 3 min |
| **Total** | | **~45 min** |

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
