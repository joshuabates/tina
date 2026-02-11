import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CommentTimeline } from "../pm/CommentTimeline"
import { none } from "@/test/builders/domain"
import {
  queryLoading,
  querySuccess,
  queryStateFor,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithRouter } from "@/test/harness/render"
import type { WorkComment } from "@/schemas"

vi.mock("@/hooks/useTypedQuery")

const mockMutate = vi.fn()
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => mockMutate),
  }
})

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

function buildWorkComment(overrides: Partial<WorkComment> = {}): WorkComment {
  return {
    _id: "c1",
    _creationTime: 1234567890,
    projectId: "p1",
    targetType: "design",
    targetId: "d1",
    authorType: "human",
    authorName: "Alice",
    body: "Looks good to me",
    createdAt: "2024-01-01T10:00:00Z",
    editedAt: none<string>(),
    ...overrides,
  }
}

const comments: WorkComment[] = [
  buildWorkComment({
    _id: "c1",
    authorName: "Alice",
    authorType: "human",
    body: "Looks good to me",
    createdAt: "2024-01-01T10:00:00Z",
  }),
  buildWorkComment({
    _id: "c2",
    _creationTime: 1234567891,
    authorName: "Claude",
    authorType: "agent",
    body: "Implementation complete",
    createdAt: "2024-01-01T11:00:00Z",
  }),
]

function setupQueryMock(states: Partial<QueryStateMap>) {
  mockUseTypedQuery.mockImplementation((def) => {
    return queryStateFor(def.key, states as QueryStateMap)
  })
}

function renderTimeline(states: Partial<QueryStateMap> = { "workComments.list": querySuccess(comments) }) {
  setupQueryMock(states)
  return renderWithRouter(
    <CommentTimeline projectId="p1" targetType="design" targetId="d1" />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMutate.mockResolvedValue("new-comment-id")
})

describe("CommentTimeline", () => {
  it("renders loading state when comments are loading", () => {
    renderTimeline({ "workComments.list": queryLoading() })

    expect(screen.getByTestId("comment-timeline-loading")).toBeInTheDocument()
  })

  it("renders empty state when no comments exist", () => {
    renderTimeline({ "workComments.list": querySuccess([]) })

    expect(screen.getByText(/no comments/i)).toBeInTheDocument()
  })

  it("renders comment list with author names and bodies", () => {
    renderTimeline()

    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("Looks good to me")).toBeInTheDocument()
    expect(screen.getByText("Claude")).toBeInTheDocument()
    expect(screen.getByText("Implementation complete")).toBeInTheDocument()
  })

  it("renders author type badges", () => {
    renderTimeline()

    const badges = screen.getAllByTestId("author-badge")
    expect(badges).toHaveLength(2)
    expect(badges[0]).toHaveTextContent(/human/i)
    expect(badges[1]).toHaveTextContent(/agent/i)
  })

  it("renders add comment form", () => {
    renderTimeline()

    expect(screen.getByLabelText(/author name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/comment/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /add comment/i })).toBeInTheDocument()
  })

  it("submit button is disabled when fields are empty", () => {
    renderTimeline()

    expect(screen.getByRole("button", { name: /add comment/i })).toBeDisabled()
  })

  it("submits comment with form values", async () => {
    const user = userEvent.setup()
    renderTimeline()

    await user.type(screen.getByLabelText(/author name/i), "Bob")
    await user.type(screen.getByLabelText(/comment/i), "Nice work")
    await user.click(screen.getByRole("button", { name: /add comment/i }))

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        authorName: "Bob",
        body: "Nice work",
        authorType: "human",
        targetType: "design",
        targetId: "d1",
        projectId: "p1",
      }),
    )
  })

  it("clears form after successful submission", async () => {
    const user = userEvent.setup()
    renderTimeline()

    const nameInput = screen.getByLabelText(/author name/i) as HTMLInputElement
    const bodyInput = screen.getByLabelText(/comment/i) as HTMLTextAreaElement

    await user.type(nameInput, "Bob")
    await user.type(bodyInput, "Nice work")
    await user.click(screen.getByRole("button", { name: /add comment/i }))

    expect(nameInput.value).toBe("")
    expect(bodyInput.value).toBe("")
  })

  it("toggles author type between human and agent", async () => {
    const user = userEvent.setup()
    renderTimeline()

    const agentToggle = screen.getByRole("button", { name: /^agent$/i })
    await user.click(agentToggle)

    await user.type(screen.getByLabelText(/author name/i), "Bot")
    await user.type(screen.getByLabelText(/comment/i), "Automated comment")
    await user.click(screen.getByRole("button", { name: /add comment/i }))

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        authorType: "agent",
      }),
    )
  })
})
