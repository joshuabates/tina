import { vi } from "vitest"
import type { ActionDescriptor } from "@/services/action-registry"

export interface SelectionStateMock {
  orchestrationId: string | null
  phaseId: string | null
  selectOrchestration: (id: string | null) => void
  selectPhase: (id: string | null) => void
}

export interface FocusableStateMock {
  isSectionFocused: boolean
  activeIndex: number
}

export function selectionState(
  overrides: Partial<SelectionStateMock> = {},
): SelectionStateMock {
  return {
    orchestrationId: null,
    phaseId: null,
    selectOrchestration: vi.fn(),
    selectPhase: vi.fn(),
    ...overrides,
  }
}

export function focusableState(
  overrides: Partial<FocusableStateMock> = {},
): FocusableStateMock {
  return {
    isSectionFocused: false,
    activeIndex: -1,
    ...overrides,
  }
}

export function createActionRegistrationCapture() {
  const actions: ActionDescriptor[] = []
  const register = vi.fn((action: ActionDescriptor) => {
    actions.push(action)
  })

  return {
    register,
    actions,
    byId: (id: string) => actions.find((action) => action.id === id),
    reset: () => {
      actions.length = 0
      register.mockClear()
    },
  }
}
