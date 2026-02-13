export const NAV_MODES = [
  "observe",
  "plan",
  "sessions",
  "code",
  "design",
] as const

export type NavMode = (typeof NAV_MODES)[number]

export const DEFAULT_MODE: NavMode = "observe"

export const LAST_PROJECT_STORAGE_KEY = "tina.nav.lastProjectId"
export const LAST_MODE_BY_PROJECT_STORAGE_KEY = "tina.nav.lastModeByProject"
export const LAST_SUBVIEW_BY_PROJECT_MODE_STORAGE_KEY =
  "tina.nav.lastSubviewByProjectAndMode"

type StringMap = Record<string, string>

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function readStorageValue(key: string): string | null {
  if (!canUseStorage()) return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorageValue(key: string, value: string) {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage write failures (private mode/quota/security settings).
  }
}

function readStringMap(key: string): StringMap {
  const raw = readStorageValue(key)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }

    const entries = Object.entries(parsed)
    const result: StringMap = {}
    for (const [entryKey, entryValue] of entries) {
      if (typeof entryValue === "string") {
        result[entryKey] = entryValue
      }
    }
    return result
  } catch {
    return {}
  }
}

function writeStringMap(key: string, value: StringMap) {
  writeStorageValue(key, JSON.stringify(value))
}

export function isNavMode(value: string | null | undefined): value is NavMode {
  if (!value) return false
  return NAV_MODES.includes(value as NavMode)
}

export function buildModePath(projectId: string, mode: NavMode): string {
  return `/projects/${projectId}/${mode}`
}

export function buildProjectPath(projectId: string): string {
  return `/projects/${projectId}`
}

export function isPathWithinProjectMode(
  candidatePath: string | null | undefined,
  projectId: string,
  mode: NavMode,
): boolean {
  if (!candidatePath) return false
  const [pathname] = candidatePath.split("?")
  const base = buildModePath(projectId, mode)
  return pathname === base || pathname.startsWith(`${base}/`)
}

export function getLastProjectId(): string | null {
  const value = readStorageValue(LAST_PROJECT_STORAGE_KEY)
  return value && value.length > 0 ? value : null
}

export function setLastProjectId(projectId: string) {
  writeStorageValue(LAST_PROJECT_STORAGE_KEY, projectId)
}

export function getLastModeByProject(): StringMap {
  return readStringMap(LAST_MODE_BY_PROJECT_STORAGE_KEY)
}

export function getLastModeForProject(projectId: string): NavMode | null {
  const map = getLastModeByProject()
  const mode = map[projectId]
  return isNavMode(mode) ? mode : null
}

export function setLastModeForProject(projectId: string, mode: NavMode) {
  const map = getLastModeByProject()
  map[projectId] = mode
  writeStringMap(LAST_MODE_BY_PROJECT_STORAGE_KEY, map)
}

function subviewKey(projectId: string, mode: NavMode): string {
  return `${projectId}::${mode}`
}

export function getLastSubviewByProjectMode(): StringMap {
  return readStringMap(LAST_SUBVIEW_BY_PROJECT_MODE_STORAGE_KEY)
}

export function getLastSubviewForProjectMode(
  projectId: string,
  mode: NavMode,
): string | null {
  const map = getLastSubviewByProjectMode()
  const key = subviewKey(projectId, mode)
  const value = map[key]
  if (!isPathWithinProjectMode(value, projectId, mode)) {
    return null
  }
  return value
}

export function setLastSubviewForProjectMode(
  projectId: string,
  mode: NavMode,
  subviewPath: string,
) {
  if (!isPathWithinProjectMode(subviewPath, projectId, mode)) {
    return
  }

  const map = getLastSubviewByProjectMode()
  map[subviewKey(projectId, mode)] = subviewPath
  writeStringMap(LAST_SUBVIEW_BY_PROJECT_MODE_STORAGE_KEY, map)
}

export function resolveProjectModeTarget(projectId: string, mode: NavMode): string {
  return getLastSubviewForProjectMode(projectId, mode) ?? buildModePath(projectId, mode)
}

export function parseModeFromPathname(pathname: string): NavMode | null {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length < 3) return null
  if (segments[0] !== "projects") return null
  return isNavMode(segments[2]) ? segments[2] : null
}
