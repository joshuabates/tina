import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useOrchestrationEvents } from "../useOrchestrationEvents"
import { buildOrchestrationEvent } from "@/test/builders/domain"
import type { Commit } from "@/schemas"
import { queryError, queryLoading, querySuccess } from "@/test/builders/query"

vi.mock("../useTypedQuery")
vi.mock("../useDaemonQuery", () => ({
  useCommitDetails: vi.fn(() => ({
    data: { commits: [], missingShas: [] },
  })),
}))

const mockUseTypedQuery = vi.mocked(
  await import("../useTypedQuery"),
).useTypedQuery

const mockUseCommitDetails = vi.mocked(
  await import("../useDaemonQuery"),
).useCommitDetails

describe("useOrchestrationEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCommitDetails.mockReturnValue({
      data: { commits: [], missingShas: [] },
    } as unknown as ReturnType<typeof mockUseCommitDetails>)
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

  it("uses daemon commit details when available and keeps review events from orchestration events", () => {
    const commits: Commit[] = [
      {
        _id: "commit1",
        _creationTime: 1234567890,
        orchestrationId: "orch1",
        phaseNumber: "1",
        sha: "abc123456789",
        shortSha: "abc1234",
        subject: "commit from convex index",
        recordedAt: "2024-01-01T10:00:05Z",
      },
    ]

    mockUseCommitDetails.mockReturnValue({
      data: {
        commits: [
          {
            sha: "abc123456789",
            short_sha: "abc1234",
            subject: "commit from daemon details",
            author: "Tina Bot",
            timestamp: "2024-01-01T10:00:00Z",
            insertions: 10,
            deletions: 2,
          },
        ],
        missingShas: [],
      },
    } as unknown as ReturnType<typeof mockUseCommitDetails>)

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
      if (def.key === "orchestrations.detail") {
        return querySuccess(null)
      }
      return queryLoading()
    })

    const { result } = renderHook(() => useOrchestrationEvents("orch1"))

    expect(result.current.status).toBe("success")
    expect(result.current.isLoading).toBe(false)
    expect(result.current.gitEvents.map((event) => event._id)).toEqual(["commit1"])
    expect(result.current.gitEvents.map((event) => event.summary)).toEqual([
      "commit from daemon details",
    ])
    expect(result.current.reviewEvents.map((event) => event._id)).toEqual(["review1"])
  })

  it("falls back to index summary when daemon data is missing", () => {
    const commits: Commit[] = [
      {
        _id: "commit1",
        _creationTime: 1234567890,
        orchestrationId: "orch1",
        phaseNumber: "1",
        sha: "abc123456789",
        shortSha: "abc1234",
        subject: "commit from convex index",
        recordedAt: "2024-01-01T10:00:05Z",
      },
    ]

    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "events.list") return querySuccess([])
      if (def.key === "commits.list") return querySuccess(commits)
      if (def.key === "orchestrations.detail") return querySuccess(null)
      return queryLoading()
    })

    const { result } = renderHook(() => useOrchestrationEvents("orch1"))

    expect(result.current.status).toBe("success")
    expect(result.current.gitEvents[0].summary).toBe("commit from convex index")
  })
})
