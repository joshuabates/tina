import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { ReactNode } from "react"
import { useCreateSession } from "../useCreateSession"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  )
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function createWrapper(initialUrl: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="/projects/:projectId/observe" element={children} />
          <Route path="/projects/:projectId/sessions" element={children} />
        </Routes>
      </MemoryRouter>
    )
  }
}

describe("useCreateSession", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
    mockNavigate.mockClear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe("connectToPane", () => {
    it("navigates to sessions mode with pane query param", () => {
      const { result } = renderHook(() => useCreateSession(), {
        wrapper: createWrapper("/projects/proj-123/observe"),
      })

      act(() => {
        result.current.connectToPane("pane-abc")
      })

      expect(mockNavigate).toHaveBeenCalledWith(
        "/projects/proj-123/sessions?pane=pane-abc",
      )
    })

    it("encodes special characters in pane ID", () => {
      const { result } = renderHook(() => useCreateSession(), {
        wrapper: createWrapper("/projects/proj-123/observe"),
      })

      act(() => {
        result.current.connectToPane("%pane/special")
      })

      expect(mockNavigate).toHaveBeenCalledWith(
        "/projects/proj-123/sessions?pane=%25pane%2Fspecial",
      )
    })

    it("does nothing when projectId is missing", () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={children} />
          </Routes>
        </MemoryRouter>
      )

      const { result } = renderHook(() => useCreateSession(), { wrapper })

      act(() => {
        result.current.connectToPane("pane-abc")
      })

      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  describe("createAndConnect", () => {
    it("posts to /sessions and navigates on success", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            sessionName: "my-session",
            tmuxPaneId: "pane-new",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )

      const { result } = renderHook(() => useCreateSession(), {
        wrapper: createWrapper("/projects/proj-123/observe"),
      })

      await act(async () => {
        await result.current.createAndConnect({
          label: "Test Session",
          cli: "claude",
          contextType: "task",
          contextId: "task-42",
          contextSummary: "Fix the bug",
        })
      })

      const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]
      expect(url).toContain("/sessions")
      expect(init).toMatchObject({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const body = JSON.parse(init!.body as string)
      expect(body).toEqual({
        label: "Test Session",
        cli: "claude",
        contextType: "task",
        contextId: "task-42",
        contextSummary: "Fix the bug",
      })

      expect(mockNavigate).toHaveBeenCalledWith(
        "/projects/proj-123/sessions?pane=pane-new",
      )
    })

    it("defaults cli to claude when not specified", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ sessionName: "s1", tmuxPaneId: "p1" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )

      const { result } = renderHook(() => useCreateSession(), {
        wrapper: createWrapper("/projects/proj-123/observe"),
      })

      await act(async () => {
        await result.current.createAndConnect({ label: "Quick" })
      })

      const body = JSON.parse(
        vi.mocked(globalThis.fetch).mock.calls[0][1]!.body as string,
      )
      expect(body.cli).toBe("claude")
    })

    it("throws on non-ok response", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response("Server error", { status: 500 }),
      )

      const { result } = renderHook(() => useCreateSession(), {
        wrapper: createWrapper("/projects/proj-123/observe"),
      })

      await expect(
        act(async () => {
          await result.current.createAndConnect({ label: "Fail" })
        }),
      ).rejects.toThrow("Daemon /sessions: 500 Server error")
    })

    it("does nothing when projectId is missing", async () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={children} />
          </Routes>
        </MemoryRouter>
      )

      const { result } = renderHook(() => useCreateSession(), { wrapper })

      await act(async () => {
        await result.current.createAndConnect({ label: "Noop" })
      })

      expect(globalThis.fetch).not.toHaveBeenCalled()
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })
})
