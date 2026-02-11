import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useOrchestrationEvents } from "../useOrchestrationEvents"
import { buildOrchestrationEvent } from "@/test/builders/domain"
import type { Commit } from "@/schemas"
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

  it("reads git data from commits and review data from orchestration events", () => {
    const commits: Commit[] = [
      {
        _id: "commit1",
        _creationTime: 1234567890,
        orchestrationId: "orch1",
        phaseNumber: "1",
        sha: "abc123456789",
        shortSha: "abc1234",
        subject: "commit from commits table",
        author: "Tina Bot",
        timestamp: "2024-01-01T10:00:00Z",
        insertions: 10,
        deletions: 2,
        recordedAt: "2024-01-01T10:00:05Z",
      },
    ]

    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "events.list") {
        return querySuccess([
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
        ])
      }
      if (def.key === "commits.list") {
        return querySuccess(commits)
      }
      return queryLoading()
    })

    const { result } = renderHook(() => useOrchestrationEvents("orch1"))

    expect(result.current.status).toBe("success")
    expect(result.current.isLoading).toBe(false)
    expect(result.current.gitEvents.map((event) => event._id)).toEqual(["commit1"])
    expect(result.current.gitEvents.map((event) => event.summary)).toEqual([
      "commit from commits table",
    ])
    expect(result.current.reviewEvents.map((event) => event._id)).toEqual(["review1"])
  })
})
