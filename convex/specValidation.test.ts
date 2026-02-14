import { describe, expect, test } from "vitest";
import { validateSpecForLaunch } from "./specValidation";

describe("validateSpecForLaunch", () => {
  test("returns valid when all markers complete and phase structure valid", () => {
    const result = validateSpecForLaunch({
      requiredMarkers: ["scope", "risks"],
      completedMarkers: ["scope", "risks"],
      phaseCount: 2,
      phaseStructureValid: true,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("returns error when no required markers exist", () => {
    const result = validateSpecForLaunch({
      requiredMarkers: [],
      completedMarkers: [],
      phaseCount: 1,
      phaseStructureValid: true,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Spec has no validation markers — set a complexity preset first",
    );
  });

  test("returns error when markers are missing", () => {
    const result = validateSpecForLaunch({
      requiredMarkers: ["scope", "risks", "testing"],
      completedMarkers: ["scope"],
      phaseCount: 1,
      phaseStructureValid: true,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Incomplete markers: risks, testing");
  });

  test("returns error when phase structure is invalid", () => {
    const result = validateSpecForLaunch({
      requiredMarkers: ["scope"],
      completedMarkers: ["scope"],
      phaseCount: 1,
      phaseStructureValid: false,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Phase structure is invalid — spec must contain ## Phase N headings",
    );
  });

  test("returns error when phase count is zero", () => {
    const result = validateSpecForLaunch({
      requiredMarkers: ["scope"],
      completedMarkers: ["scope"],
      phaseCount: 0,
      phaseStructureValid: true,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Spec must have at least one phase");
  });

  test("treats undefined fields as empty/invalid defaults", () => {
    const result = validateSpecForLaunch({});

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Spec has no validation markers — set a complexity preset first",
    );
    expect(result.errors).toContain(
      "Phase structure is invalid — spec must contain ## Phase N headings",
    );
    expect(result.errors).toContain("Spec must have at least one phase");
  });

  test("ignores extra completed markers not in required", () => {
    const result = validateSpecForLaunch({
      requiredMarkers: ["objective_defined"],
      completedMarkers: ["objective_defined", "extra_marker"],
      phaseCount: 1,
      phaseStructureValid: true,
    });

    expect(result.valid).toBe(true);
  });

  test("accumulates multiple errors", () => {
    const result = validateSpecForLaunch({
      requiredMarkers: ["scope", "risks"],
      completedMarkers: [],
      phaseCount: 0,
      phaseStructureValid: false,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });
});
