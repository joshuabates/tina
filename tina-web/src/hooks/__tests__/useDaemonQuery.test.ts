import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fetchDaemon } from "../useDaemonQuery"

describe("fetchDaemon", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("constructs URL with base and params", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    )

    await fetchDaemon("/diff", { worktree: "/tmp/wt", base: "main" })

    const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain("/diff")
    expect(calledUrl).toContain("worktree=%2Ftmp%2Fwt")
    expect(calledUrl).toContain("base=main")
  })

  it("returns parsed JSON on success", async () => {
    const data = [{ path: "src/foo.ts", status: "modified", insertions: 5, deletions: 2, old_path: null }]
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200 }),
    )

    const result = await fetchDaemon("/diff", { worktree: "/tmp", base: "main" })
    expect(result).toEqual(data)
  })

  it("throws on non-ok response with status and body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("Missing worktree param", { status: 400 }),
    )

    await expect(fetchDaemon("/diff", {})).rejects.toThrow(
      "Daemon /diff: 400 Missing worktree param",
    )
  })
})
