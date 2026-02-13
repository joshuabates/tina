import { useQuery } from "@tanstack/react-query"

// Types matching tina-daemon/src/git.rs serialization
export type FileStatus = "added" | "modified" | "deleted" | "renamed"

export interface DiffFileStat {
  path: string
  status: FileStatus
  insertions: number
  deletions: number
  old_path: string | null
}

export type DiffLineKind = "context" | "add" | "delete"

export interface DiffLine {
  kind: DiffLineKind
  old_line: number | null
  new_line: number | null
  text: string
}

export interface DiffHunk {
  old_start: number
  old_count: number
  new_start: number
  new_count: number
  lines: DiffLine[]
}

const DAEMON_BASE = import.meta.env.VITE_DAEMON_URL ?? "http://localhost:7842"

export async function fetchDaemon<T>(
  path: string,
  params: Record<string, string>,
  method: string = "GET",
): Promise<T> {
  const url = new URL(path, DAEMON_BASE)
  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }
  const resp = await fetch(url.toString(), { method })
  if (!resp.ok) {
    throw new Error(`Daemon ${path}: ${resp.status} ${await resp.text()}`)
  }
  if (resp.status === 204) return undefined as T
  return resp.json() as Promise<T>
}

export function useDiffFiles(worktree: string, base: string) {
  return useQuery<DiffFileStat[]>({
    queryKey: ["daemon", "diff", worktree, base],
    queryFn: () => fetchDaemon<DiffFileStat[]>("/diff", { worktree, base }),
    enabled: !!worktree && !!base,
  })
}

export function useDiffFile(worktree: string, base: string, file: string) {
  return useQuery<DiffHunk[]>({
    queryKey: ["daemon", "diff", "file", worktree, base, file],
    queryFn: () => fetchDaemon<DiffHunk[]>("/diff/file", { worktree, base, file }),
    enabled: !!worktree && !!base && !!file,
  })
}
