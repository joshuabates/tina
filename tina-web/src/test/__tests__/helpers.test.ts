import { describe, it, expect, vi } from "vitest"
import {
  buildAppIntegrationFixture,
  buildOrchestrationDetail,
  buildProjectSummary,
  buildTaskListDetail,
  buildReviewCheck,
} from "@/test/builders/domain"
import {
  queryError,
  queryLoading,
  queryStateFor,
  querySuccess,
} from "@/test/builders/query"
import {
  createActionRegistrationCapture,
  focusableState,
  selectionState,
} from "@/test/harness/hooks"
import {
  dispatchKeyDown,
  withAttachedKeyboardService,
} from "@/test/harness/keyboard"

describe("test builders", () => {
  it("buildProjectSummary applies overrides", () => {
    const project = buildProjectSummary({ name: "Custom" })
    expect(project.name).toBe("Custom")
    expect(project._id).toBe("p1")
  })

  it("buildOrchestrationDetail creates default shell", () => {
    const detail = buildOrchestrationDetail()
    expect(detail.featureName).toBe("my-feature")
    expect(detail.phases.length).toBeGreaterThan(0)
  })

  it("buildTaskListDetail creates two phases and task list", () => {
    const detail = buildTaskListDetail()
    expect(detail.phases).toHaveLength(2)
    expect(detail.phaseTasks["1"]).toHaveLength(3)
    expect(detail.phaseTasks["2"]).toHaveLength(0)
  })

  it("buildReviewCheck creates default check", () => {
    const check = buildReviewCheck()
    expect(check.reviewId).toBe("rev1")
    expect(check.name).toBe("typecheck")
    expect(check.kind).toBe("cli")
    expect(check.status).toBe("passed")
  })

  it("buildReviewCheck applies overrides", () => {
    const check = buildReviewCheck({ status: "failed", name: "test" })
    expect(check.status).toBe("failed")
    expect(check.name).toBe("test")
    expect(check.reviewId).toBe("rev1")
  })

  it("buildAppIntegrationFixture supports overrides", () => {
    const fixture = buildAppIntegrationFixture({
      detail: { featureName: "custom-feature" },
    })

    expect(fixture.projects).toHaveLength(1)
    expect(fixture.orchestrations).toHaveLength(1)
    expect(fixture.detail.featureName).toBe("custom-feature")
  })
})

describe("query helpers", () => {
  it("creates loading/success/error states", () => {
    expect(queryLoading<number>()).toEqual({ status: "loading" })
    expect(querySuccess(42)).toEqual({ status: "success", data: 42 })

    const error = new Error("boom")
    expect(queryError<number>(error)).toEqual({ status: "error", error })
  })

  it("queryStateFor returns fallback loading state", () => {
    const state = queryStateFor("missing", {})
    expect(state).toEqual({ status: "loading" })
  })

  it("queryStateFor returns mapped state", () => {
    const state = queryStateFor<number>("present", {
      present: querySuccess(7),
    })
    expect(state).toEqual({ status: "success", data: 7 })
  })
})

describe("hook harness", () => {
  it("selectionState and focusableState provide defaults and overrides", () => {
    const sel = selectionState({ orchestrationId: "orch1" })
    expect(sel.orchestrationId).toBe("orch1")
    expect(sel.phaseId).toBeNull()

    const focus = focusableState({ isSectionFocused: true, activeIndex: 2 })
    expect(focus).toEqual({ isSectionFocused: true, activeIndex: 2 })
  })

  it("action registration capture tracks and resets actions", () => {
    const capture = createActionRegistrationCapture()

    capture.register({
      id: "a1",
      label: "Action 1",
      execute: vi.fn(),
    })

    expect(capture.actions).toHaveLength(1)
    expect(capture.byId("a1")?.label).toBe("Action 1")

    capture.reset()
    expect(capture.actions).toHaveLength(0)
    expect(capture.register).toHaveBeenCalledTimes(0)
  })
})

describe("keyboard harness", () => {
  it("dispatchKeyDown dispatches keydown and returns event", () => {
    const div = document.createElement("div")
    const listener = vi.fn()
    div.addEventListener("keydown", listener)

    const event = dispatchKeyDown(div, "Enter", { ctrlKey: true })

    expect(event.key).toBe("Enter")
    expect(event.ctrlKey).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
  })

  it("withAttachedKeyboardService always detaches", async () => {
    const service = {
      attach: vi.fn(),
      detach: vi.fn(),
      setModalScope: vi.fn(),
    }

    const result = await withAttachedKeyboardService(service, async () => 123)
    expect(result).toBe(123)
    expect(service.attach).toHaveBeenCalledOnce()
    expect(service.detach).toHaveBeenCalledOnce()

    await expect(
      withAttachedKeyboardService(service, async () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    expect(service.detach).toHaveBeenCalledTimes(2)
  })
})
