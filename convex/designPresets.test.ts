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
