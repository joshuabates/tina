/**
 * Policy preset templates for orchestration launch.
 * Each preset defines ReviewPolicy + ModelPolicy defaults.
 * The web form can apply a preset then override individual fields.
 */

export interface ReviewPolicyConfig {
  enforcement: "task_and_phase" | "task_only" | "phase_only";
  detector_scope:
    | "whole_repo_pattern_index"
    | "touched_area_only"
    | "architectural_allowlist_only";
  architect_mode: "manual_only" | "manual_plus_auto" | "disabled";
  test_integrity_profile: "strict_baseline" | "max_strict" | "minimal";
  hard_block_detectors: boolean;
  allow_rare_override: boolean;
  require_fix_first: boolean;
}

export interface ModelPolicyConfig {
  validator: string;
  planner: string;
  executor: string;
  reviewer: string;
}

export interface PolicySnapshot {
  review: ReviewPolicyConfig;
  model: ModelPolicyConfig;
}

export const PRESETS: Record<string, PolicySnapshot> = {
  strict: {
    review: {
      enforcement: "task_and_phase",
      detector_scope: "whole_repo_pattern_index",
      architect_mode: "manual_plus_auto",
      test_integrity_profile: "max_strict",
      hard_block_detectors: true,
      allow_rare_override: false,
      require_fix_first: true,
    },
    model: {
      validator: "opus",
      planner: "opus",
      executor: "opus",
      reviewer: "opus",
    },
  },
  balanced: {
    review: {
      enforcement: "task_and_phase",
      detector_scope: "whole_repo_pattern_index",
      architect_mode: "manual_plus_auto",
      test_integrity_profile: "strict_baseline",
      hard_block_detectors: true,
      allow_rare_override: true,
      require_fix_first: true,
    },
    model: {
      validator: "opus",
      planner: "opus",
      executor: "opus",
      reviewer: "opus",
    },
  },
  fast: {
    review: {
      enforcement: "phase_only",
      detector_scope: "touched_area_only",
      architect_mode: "disabled",
      test_integrity_profile: "minimal",
      hard_block_detectors: false,
      allow_rare_override: true,
      require_fix_first: false,
    },
    model: {
      validator: "opus",
      planner: "opus",
      executor: "haiku",
      reviewer: "haiku",
    },
  },
};

/**
 * Resolve a policy snapshot from a preset name and optional overrides.
 * Returns the final merged policy.
 */
export function resolvePolicy(
  presetName: string,
  overrides?: Partial<PolicySnapshot>,
): PolicySnapshot {
  const base = PRESETS[presetName];
  if (!base) {
    throw new Error(
      `Unknown preset: "${presetName}". Valid: ${Object.keys(PRESETS).join(", ")}`,
    );
  }

  if (!overrides) return structuredClone(base);

  return {
    review: { ...base.review, ...overrides.review },
    model: { ...base.model, ...overrides.model },
  };
}

/** Sort object keys recursively for deterministic serialization. */
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return obj;
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Hash a policy snapshot for immutability checks.
 * Uses deterministic JSON serialization (recursively sorted keys).
 */
export async function hashPolicy(snapshot: PolicySnapshot): Promise<string> {
  const json = JSON.stringify(sortKeys(snapshot));
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return (
    "sha256-" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}
