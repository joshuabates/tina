import { expect, test, describe } from "vitest";
import {
  PRESETS,
  resolvePolicy,
  hashPolicy,
  type ReviewPolicyConfig,
  type ModelPolicyConfig,
} from "./policyPresets";

describe("PRESETS", () => {
  test("has strict, balanced, and fast presets", () => {
    expect(Object.keys(PRESETS).sort()).toEqual(["balanced", "fast", "strict"]);
  });

  test("strict preset has max_strict test integrity and no rare overrides", () => {
    const strict = PRESETS.strict;
    expect(strict.review.test_integrity_profile).toBe("max_strict");
    expect(strict.review.allow_rare_override).toBe(false);
    expect(strict.review.hard_block_detectors).toBe(true);
  });

  test("balanced preset has strict_baseline test integrity with rare overrides", () => {
    const balanced = PRESETS.balanced;
    expect(balanced.review.test_integrity_profile).toBe("strict_baseline");
    expect(balanced.review.allow_rare_override).toBe(true);
    expect(balanced.review.hard_block_detectors).toBe(true);
  });

  test("fast preset uses minimal enforcement and cheaper models", () => {
    const fast = PRESETS.fast;
    expect(fast.review.enforcement).toBe("phase_only");
    expect(fast.review.architect_mode).toBe("disabled");
    expect(fast.review.hard_block_detectors).toBe(false);
    expect(fast.model.executor).toBe("haiku");
    expect(fast.model.reviewer).toBe("haiku");
  });
});

describe("resolvePolicy", () => {
  test("returns base preset when no overrides provided", () => {
    const result = resolvePolicy("balanced");
    expect(result).toEqual(PRESETS.balanced);
  });

  test("returns a deep copy, not a reference to the original", () => {
    const result = resolvePolicy("balanced");
    result.review.enforcement = "phase_only";
    expect(PRESETS.balanced.review.enforcement).toBe("task_and_phase");
  });

  test("applies review overrides", () => {
    const result = resolvePolicy("balanced", {
      review: { enforcement: "phase_only" } as ReviewPolicyConfig,
    });
    expect(result.review.enforcement).toBe("phase_only");
    // Non-overridden fields keep base values
    expect(result.review.hard_block_detectors).toBe(true);
  });

  test("applies model overrides", () => {
    const result = resolvePolicy("balanced", {
      model: { executor: "haiku" } as ModelPolicyConfig,
    });
    expect(result.model.executor).toBe("haiku");
    // Non-overridden fields keep base values
    expect(result.model.planner).toBe("opus");
  });

  test("applies both review and model overrides", () => {
    const result = resolvePolicy("strict", {
      review: { allow_rare_override: true } as ReviewPolicyConfig,
      model: { reviewer: "haiku" } as ModelPolicyConfig,
    });
    expect(result.review.allow_rare_override).toBe(true);
    expect(result.model.reviewer).toBe("haiku");
  });

  test("throws for unknown preset name", () => {
    expect(() => resolvePolicy("nonexistent")).toThrow(
      'Unknown preset: "nonexistent"',
    );
    expect(() => resolvePolicy("nonexistent")).toThrow("Valid: strict");
  });
});

describe("hashPolicy", () => {
  test("returns a sha256-prefixed hex string", async () => {
    const snapshot = resolvePolicy("balanced");
    const hash = await hashPolicy(snapshot);
    expect(hash).toMatch(/^sha256-[0-9a-f]{64}$/);
  });

  test("returns same hash for identical snapshots", async () => {
    const a = resolvePolicy("balanced");
    const b = resolvePolicy("balanced");
    expect(await hashPolicy(a)).toBe(await hashPolicy(b));
  });

  test("returns different hashes for different snapshots", async () => {
    const balanced = resolvePolicy("balanced");
    const strict = resolvePolicy("strict");
    expect(await hashPolicy(balanced)).not.toBe(await hashPolicy(strict));
  });

  test("hash reflects nested field changes", async () => {
    const base = resolvePolicy("balanced");
    const modified = resolvePolicy("balanced", {
      review: { enforcement: "phase_only" } as ReviewPolicyConfig,
    });
    expect(await hashPolicy(base)).not.toBe(await hashPolicy(modified));
  });
});
