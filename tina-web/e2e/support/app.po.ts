import type { Locator, Page } from "@playwright/test"

export class AppPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/")
  }

  async press(key: string) {
    await this.page.keyboard.press(key)
  }

  sidebarItems(): Locator {
    return this.page.locator("[id^='sidebar-item-']")
  }

  sidebarItem(index: number): Locator {
    return this.page.locator(`[id='sidebar-item-${index}']`)
  }

  firstSidebarItem(): Locator {
    return this.sidebarItems().first()
  }

  phaseItems(): Locator {
    return this.page.locator("[id^='phase-']")
  }

  phaseItem(index: number): Locator {
    return this.page.locator("[id^='phase-']").nth(index)
  }

  firstPhaseItem(): Locator {
    return this.phaseItems().first()
  }

  taskItems(): Locator {
    return this.page.locator("[id^='task-']")
  }

  dialog(): Locator {
    return this.page.getByRole("dialog")
  }

  async sidebarCount(): Promise<number> {
    return this.sidebarItems().count()
  }

  async phaseCount(): Promise<number> {
    return this.phaseItems().count()
  }

  async taskCount(): Promise<number> {
    return this.taskItems().count()
  }

  async focusSidebarViaTab(): Promise<number> {
    await this.press("Tab")
    return this.sidebarCount()
  }

  async selectFirstOrchestrationViaKeyboard(): Promise<boolean> {
    const count = await this.focusSidebarViaTab()
    if (count === 0) {
      return false
    }

    await this.press("Enter")
    return true
  }

  async moveToPhaseTimelineAfterSidebarSelection(): Promise<number> {
    const selected = await this.selectFirstOrchestrationViaKeyboard()
    if (!selected) {
      return 0
    }

    await this.press("Tab")
    return this.phaseCount()
  }

  async moveToTaskListAfterPhaseSelection(): Promise<number> {
    const phaseCount = await this.moveToPhaseTimelineAfterSidebarSelection()
    if (phaseCount === 0) {
      return 0
    }

    await this.press("Enter")
    await this.press("Tab")
    return this.taskCount()
  }
}
