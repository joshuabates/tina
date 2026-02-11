const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS

function parseIsoTimestamp(isoTimestamp: string): number | null {
  const parsed = Date.parse(isoTimestamp)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatRelativeTimeShort(
  isoTimestamp: string,
  now: Date = new Date(),
): string {
  const parsed = parseIsoTimestamp(isoTimestamp)
  if (parsed === null) return "--"

  const deltaMs = Math.max(0, now.getTime() - parsed)

  if (deltaMs < MINUTE_MS) {
    return `${Math.floor(deltaMs / SECOND_MS)}s`
  }
  if (deltaMs < HOUR_MS) {
    return `${Math.floor(deltaMs / MINUTE_MS)}m`
  }
  if (deltaMs < DAY_MS) {
    return `${Math.floor(deltaMs / HOUR_MS)}h`
  }
  if (deltaMs < WEEK_MS) {
    return `${Math.floor(deltaMs / DAY_MS)}d`
  }
  if (deltaMs < MONTH_MS) {
    return `${Math.floor(deltaMs / WEEK_MS)}w`
  }
  return `${Math.floor(deltaMs / MONTH_MS)}mo`
}

export function formatLocalTimestamp(isoTimestamp: string): string {
  const parsed = parseIsoTimestamp(isoTimestamp)
  if (parsed === null) return "--"
  return new Date(parsed).toLocaleString()
}
