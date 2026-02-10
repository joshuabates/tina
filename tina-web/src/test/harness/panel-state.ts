import { vi } from "vitest"
import { focusableState, selectionState, type SelectionStateMock } from "@/test/harness/hooks"

type SelectionMock = {
  mockReturnValue: (value: SelectionStateMock) => void
}

type FocusableMock = {
  mockReturnValue: (value: { isSectionFocused: boolean; activeIndex: number }) => void
}

interface BaseSelection {
  orchestrationId?: string | null
  phaseId?: string | null
}

export function setPanelSelection(
  mockUseSelection: SelectionMock,
  overrides: Partial<SelectionStateMock> = {},
  base: BaseSelection = {},
) {
  mockUseSelection.mockReturnValue(
    selectionState({
      orchestrationId: base.orchestrationId ?? "orch1",
      phaseId: base.phaseId ?? null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
      ...overrides,
    }),
  )
}

export function setPanelFocus(
  mockUseFocusable: FocusableMock,
  isSectionFocused = false,
  activeIndex = -1,
) {
  mockUseFocusable.mockReturnValue(focusableState({ isSectionFocused, activeIndex }))
}
