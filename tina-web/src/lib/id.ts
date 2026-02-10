export type RouteParams = Readonly<Record<string, string | undefined>>;

/**
 * Small route-boundary helper:
 * Keep parsing/validation at the edge, never inline in feature hooks.
 */
export function readRequiredParam(
  params: RouteParams,
  key: string,
): string | null {
  const value = params[key];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Convex IDs are opaque strings to app code.
 * This function provides a single "gate" for null-safe conversion.
 */
export function toOpaqueId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function requireOpaqueId(
  params: RouteParams,
  key: string,
): { id: string } | { error: "missing_or_invalid_id" } {
  const raw = readRequiredParam(params, key);
  const id = toOpaqueId(raw);
  if (!id) {
    return { error: "missing_or_invalid_id" };
  }
  return { id };
}
