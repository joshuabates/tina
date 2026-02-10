import { test, expect } from "@playwright/test"
import { AppPage } from "./support/app.po"

test.describe("Keyboard Navigation", () => {
  test("Tab cycles focus between sidebar, phase timeline, and task list sections", async ({
    page,
  }) => {
    const app = new AppPage(page)
    await app.goto()

    const itemCount = await app.focusSidebarViaTab()
    if (itemCount > 0) {
      const firstSidebarItem = app.firstSidebarItem()
      await expect(firstSidebarItem).toBeFocused()

      await app.press("Tab")
      await expect(firstSidebarItem).not.toBeFocused()
    }
  })

  test("arrow keys navigate within sidebar orchestration list", async ({ page }) => {
    const app = new AppPage(page)
    await app.goto()

    const itemCount = await app.focusSidebarViaTab()
    if (itemCount > 0) {
      const firstItem = app.firstSidebarItem()
      await expect(firstItem).toBeFocused()
      await expect(firstItem).toHaveAttribute("tabindex", "0")

      if (itemCount > 1) {
        const secondItem = app.sidebarItem(1)

        await app.press("ArrowDown")
        await expect(secondItem).toHaveAttribute("tabindex", "0")
        await expect(firstItem).toHaveAttribute("tabindex", "-1")

        await app.press("ArrowUp")
        await expect(firstItem).toHaveAttribute("tabindex", "0")
        await expect(secondItem).toHaveAttribute("tabindex", "-1")
      }
    }
  })

  test("Enter key selects an orchestration in sidebar", async ({ page }) => {
    const app = new AppPage(page)
    await app.goto()

    const itemCount = await app.focusSidebarViaTab()
    if (itemCount > 0) {
      const firstItem = app.sidebarItem(0)

      await app.press("Enter")

      await expect(firstItem).toHaveClass(/ring-2 ring-primary/)
    }
  })

  test("Space key opens quicklook modal in phase timeline", async ({ page }) => {
    const app = new AppPage(page)
    await app.goto()

    const phaseCount = await app.moveToPhaseTimelineAfterSidebarSelection()
    if (phaseCount > 0) {
      await app.press("Space")
      await expect(app.dialog()).toBeVisible()
    }
  })

  test("Escape key dismisses quicklook modal", async ({ page }) => {
    const app = new AppPage(page)
    await app.goto()

    const phaseCount = await app.moveToPhaseTimelineAfterSidebarSelection()
    if (phaseCount > 0) {
      const quicklook = app.dialog()
      await app.press("Space")
      await expect(quicklook).toBeVisible()

      await app.press("Escape")
      await expect(quicklook).not.toBeVisible()
    }
  })

  test("arrow keys navigate within phase timeline", async ({ page }) => {
    const app = new AppPage(page)
    await app.goto()

    const phaseCount = await app.moveToPhaseTimelineAfterSidebarSelection()
    if (phaseCount > 1) {
      const firstPhase = app.firstPhaseItem()
      const secondPhase = app.phaseItem(1)

      await expect(firstPhase).toHaveAttribute("tabindex", "0")

      await app.press("ArrowDown")
      await expect(firstPhase).toHaveAttribute("tabindex", "-1")
      await expect(secondPhase).toHaveAttribute("tabindex", "0")

      await app.press("ArrowUp")
      await expect(firstPhase).toHaveAttribute("tabindex", "0")
    }
  })

  test("Space key opens quicklook modal in task list", async ({ page }) => {
    const app = new AppPage(page)
    await app.goto()

    const taskCount = await app.moveToTaskListAfterPhaseSelection()
    if (taskCount > 0) {
      await app.press("Space")
      await expect(app.dialog()).toBeVisible()
    }
  })

  test("focus restoration after closing quicklook modal", async ({ page }) => {
    const app = new AppPage(page)
    await app.goto()

    const phaseCount = await app.moveToPhaseTimelineAfterSidebarSelection()
    if (phaseCount > 0) {
      const firstPhase = app.firstPhaseItem()
      const phaseId = await firstPhase.getAttribute("id")

      const quicklook = app.dialog()
      await app.press("Space")
      await expect(quicklook).toBeVisible()

      await app.press("Escape")
      await expect(quicklook).not.toBeVisible()

      const focusedPhase = page.locator(`[id='${phaseId}']`)
      await expect(focusedPhase).toBeFocused()
    }
  })
})
