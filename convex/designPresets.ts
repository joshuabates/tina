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
