/**
 * Spec validation gate for launch.
 * Checks that spec markers are complete and phase structure is valid.
 */

export interface LaunchValidationResult {
  valid: boolean;
  errors: string[];
}

interface SpecValidationInput {
  requiredMarkers?: string[];
  completedMarkers?: string[];
  phaseCount?: number;
  phaseStructureValid?: boolean;
}

export function validateSpecForLaunch(
  spec: SpecValidationInput,
): LaunchValidationResult {
  const errors: string[] = [];

  const required = spec.requiredMarkers ?? [];
  const completed = spec.completedMarkers ?? [];

  if (required.length === 0) {
    errors.push("Spec has no validation markers — set a complexity preset first");
  } else {
    const missing = required.filter((m) => !completed.includes(m));
    if (missing.length > 0) {
      errors.push(`Incomplete markers: ${missing.join(", ")}`);
    }
  }

  if (spec.phaseStructureValid !== true) {
    errors.push("Phase structure is invalid — spec must contain ## Phase N headings");
  }

  if ((spec.phaseCount ?? 0) < 1) {
    errors.push("Spec must have at least one phase");
  }

  return { valid: errors.length === 0, errors };
}
