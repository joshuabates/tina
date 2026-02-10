import { createActionRegistry, type ActionRegistry } from "./action-registry"
import { createFocusService, type FocusService } from "./focus-service"
import { createKeyboardService, type KeyboardService } from "./keyboard-service"
import { createSelectionService, type SelectionService } from "./selection-service"

export interface AppServices {
  actionRegistry: ActionRegistry
  focusService: FocusService
  keyboardService: KeyboardService
  selectionService: SelectionService
}

export function createAppServices(): AppServices {
  const actionRegistry = createActionRegistry()
  const focusService = createFocusService()
  const keyboardService = createKeyboardService({ actionRegistry, focusService })
  const selectionService = createSelectionService()
  return { actionRegistry, focusService, keyboardService, selectionService }
}
