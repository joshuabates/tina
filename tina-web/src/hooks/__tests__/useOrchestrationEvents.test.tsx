import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useOrchestrationEvents } from "../useOrchestrationEvents"
import { buildOrchestrationEvent } from "@/test/builders/domain"
import { queryError, queryLoading, querySuccess } from "@/test/builders/query"

vi.mock("../useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("../useTypedQuery"),
).useTypedQuery

describe("useOrchestrationEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns loading state while query is pending", () => {
    mockUseTypedQuery.mockReturnValue(queryLoading())

    const { result } = renderHook(() => useOrchestrationEvents("orch1"))

    expect(result.current.status).toBe("loading")
    expect(result.current.isLoading).toBe(true)
    expect(result.current.gitEvents).toEqual([])
    expect(result.current.reviewEvents).toEqual([])
  })

  it("surfaces query errors", () => {
    const error = new Error("failed")
    mockUseTypedQuery.mockReturnValue(queryError(error))

    const { result } = renderHook(() => useOrchestrationEvents("orch1"))

    expect(result.current.status).toBe("error")
    if (result.current.status === "error") {
      expect(result.current.error).toBe(error)
    }
    expect(result.current.isLoading).toBe(false)
  })

  it("filters git and review events from the shared events query", () => {
    mockUseTypedQuery.mockReturnValue(
      querySuccess([
        buildOrchestrationEvent({
          _id: "git1",
          eventType: "git_commit",
          summary: "commit",
        }),
        buildOrchestrationEvent({
          _id: "review1",
          eventType: "phase_review_requested",
          summary: "review",
        }),
        buildOrchestrationEvent({
          _id: "other1",
          eventType: "phase_started",
          summary: "phase started",
        }),
      ]),
    )

    const { result } = renderHook(() => useOrchestrationEvents("orch1"))

    expect(result.current.status).toBe("success")
    expect(result.current.isLoading).toBe(false)
    expect(result.current.gitEvents.map((event) => event._id)).toEqual(["git1"])
    expect(result.current.reviewEvents.map((event) => event._id)).toEqual(["review1"])
  })
})
