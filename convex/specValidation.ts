/**
 * Design validation gate for launch.
 * Checks that design markers are complete and phase structure is valid.
 */

export interface LaunchValidationResult {
  valid: boolean;
  errors: string[];
}

interface DesignValidationInput {
  requiredMarkers?: string[];
  completedMarkers?: string[];
  phaseCount?: number;
  phaseStructureValid?: boolean;
}

export function validateDesignForLaunch(
  design: DesignValidationInput,
): LaunchValidationResult {
  const errors: string[] = [];

  const required = design.requiredMarkers ?? [];
  const completed = design.completedMarkers ?? [];

  if (required.length === 0) {
    errors.push("Design has no validation markers — set a complexity preset first");
  } else {
    const missing = required.filter((m) => !completed.includes(m));
    if (missing.length > 0) {
      errors.push(`Incomplete markers: ${missing.join(", ")}`);
    }
  }

  if (design.phaseStructureValid !== true) {
    errors.push("Phase structure is invalid — design must contain ## Phase N headings");
  }

  if ((design.phaseCount ?? 0) < 1) {
    errors.push("Design must have at least one phase");
  }

  return { valid: errors.length === 0, errors };
}
