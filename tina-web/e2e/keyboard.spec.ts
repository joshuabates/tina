import { test, expect } from "@playwright/test"

test.describe("Keyboard Navigation", () => {
  test("Tab cycles focus between sidebar, phase timeline, and task list sections", async ({
    page,
  }) => {
    await page.goto("/")

    // Start from body (no focus)
    await page.keyboard.press("Tab")

    // First Tab should focus an item in the sidebar
    // Check if any sidebar item is focused (roving tabindex pattern)
    const firstSidebarItem = page.locator("[id^='sidebar-item-']").first()
    const itemCount = await page.locator("[id^='sidebar-item-']").count()

    if (itemCount > 0) {
      await expect(firstSidebarItem).toBeFocused()

      // Second Tab should move focus away from sidebar to main content
      await page.keyboard.press("Tab")
      await expect(firstSidebarItem).not.toBeFocused()
    }
  })

  test("arrow keys navigate within sidebar orchestration list", async ({ page }) => {
    await page.goto("/")

    // Focus sidebar by tabbing
    await page.keyboard.press("Tab")

    // Check if there are any orchestration items
    const firstItem = page.locator("[id^='sidebar-item-']").first()
    const itemCount = await page.locator("[id^='sidebar-item-']").count()

    if (itemCount > 0) {
      // First item should be focused (have tabIndex 0)
      await expect(firstItem).toBeFocused()
      await expect(firstItem).toHaveAttribute("tabindex", "0")

      // Press down arrow to move to next item (if exists)
      if (itemCount > 1) {
        await page.keyboard.press("ArrowDown")
        const secondItem = page.locator("[id='sidebar-item-1']")
        await expect(secondItem).toHaveAttribute("tabindex", "0")
        await expect(firstItem).toHaveAttribute("tabindex", "-1")

        // Press up arrow to return to first item
        await page.keyboard.press("ArrowUp")
        await expect(firstItem).toHaveAttribute("tabindex", "0")
        await expect(secondItem).toHaveAttribute("tabindex", "-1")
      }
    }
  })

  test("Enter key selects an orchestration in sidebar", async ({ page }) => {
    await page.goto("/")

    // Tab to sidebar
    await page.keyboard.press("Tab")

    // Check if there are orchestration items
    const itemCount = await page.locator("[id^='sidebar-item-']").count()

    if (itemCount > 0) {
      const firstItem = page.locator("[id='sidebar-item-0']")

      // Press Enter to select
      await page.keyboard.press("Enter")

      // Verify selection by checking if item now has active styling
      // The implementation adds a "ring-2 ring-primary" class or sets active prop
      await expect(firstItem).toHaveClass(/ring-2 ring-primary/)
    }
  })

  test("Space key opens quicklook modal in phase timeline", async ({ page }) => {
    await page.goto("/")

    // Tab to sidebar, select an orchestration (if available)
    await page.keyboard.press("Tab")
    const itemCount = await page.locator("[id^='sidebar-item-']").count()

    if (itemCount > 0) {
      await page.keyboard.press("Enter") // Select first orchestration

      // Tab to phase timeline
      await page.keyboard.press("Tab")

      // Check if there are phase items
      const phaseCount = await page.locator("[id^='phase-']").count()

      if (phaseCount > 0) {
        // Press Space to open quicklook
        await page.keyboard.press("Space")

        // Verify quicklook modal is visible
        const quicklook = page.getByRole("dialog")
        await expect(quicklook).toBeVisible()
      }
    }
  })

  test("Escape key dismisses quicklook modal", async ({ page }) => {
    await page.goto("/")

    // Navigate to sidebar, select orchestration, navigate to phase timeline
    await page.keyboard.press("Tab")
    const itemCount = await page.locator("[id^='sidebar-item-']").count()

    if (itemCount > 0) {
      await page.keyboard.press("Enter")
      await page.keyboard.press("Tab") // To phase timeline

      const phaseCount = await page.locator("[id^='phase-']").count()

      if (phaseCount > 0) {
        // Open quicklook with Space
        await page.keyboard.press("Space")
        const quicklook = page.getByRole("dialog")
        await expect(quicklook).toBeVisible()

        // Close with Escape
        await page.keyboard.press("Escape")
        await expect(quicklook).not.toBeVisible()
      }
    }
  })

  test("arrow keys navigate within phase timeline", async ({ page }) => {
    await page.goto("/")

    // Navigate to an orchestration and then to phase timeline
    await page.keyboard.press("Tab")
    const itemCount = await page.locator("[id^='sidebar-item-']").count()

    if (itemCount > 0) {
      await page.keyboard.press("Enter")
      await page.keyboard.press("Tab")

      const phaseCount = await page.locator("[id^='phase-']").count()

      if (phaseCount > 1) {
        const firstPhase = page.locator("[id^='phase-']").first()
        await expect(firstPhase).toHaveAttribute("tabindex", "0")

        // Move down
        await page.keyboard.press("ArrowDown")
        await expect(firstPhase).toHaveAttribute("tabindex", "-1")

        const secondPhase = page.locator("[id^='phase-']").nth(1)
        await expect(secondPhase).toHaveAttribute("tabindex", "0")

        // Move back up
        await page.keyboard.press("ArrowUp")
        await expect(firstPhase).toHaveAttribute("tabindex", "0")
      }
    }
  })

  test("Space key opens quicklook modal in task list", async ({ page }) => {
    await page.goto("/")

    // Navigate through sidebar -> select orchestration -> phase timeline -> select phase -> task list
    await page.keyboard.press("Tab")
    const itemCount = await page.locator("[id^='sidebar-item-']").count()

    if (itemCount > 0) {
      await page.keyboard.press("Enter") // Select orchestration
      await page.keyboard.press("Tab") // To phase timeline

      const phaseCount = await page.locator("[id^='phase-']").count()
      if (phaseCount > 0) {
        await page.keyboard.press("Enter") // Select phase
        await page.keyboard.press("Tab") // To task list

        const taskCount = await page.locator("[id^='task-']").count()
        if (taskCount > 0) {
          // Press Space to open task quicklook
          await page.keyboard.press("Space")

          const quicklook = page.getByRole("dialog")
          await expect(quicklook).toBeVisible()
        }
      }
    }
  })

  test("focus restoration after closing quicklook modal", async ({ page }) => {
    await page.goto("/")

    // Navigate and open a phase quicklook
    await page.keyboard.press("Tab")
    const itemCount = await page.locator("[id^='sidebar-item-']").count()

    if (itemCount > 0) {
      await page.keyboard.press("Enter")
      await page.keyboard.press("Tab")

      const phaseCount = await page.locator("[id^='phase-']").count()
      if (phaseCount > 0) {
        const firstPhase = page.locator("[id^='phase-']").first()
        const phaseId = await firstPhase.getAttribute("id")

        // Open quicklook
        await page.keyboard.press("Space")
        const quicklook = page.getByRole("dialog")
        await expect(quicklook).toBeVisible()

        // Close quicklook
        await page.keyboard.press("Escape")
        await expect(quicklook).not.toBeVisible()

        // Verify focus returned to the phase element
        const focusedPhase = page.locator(`[id='${phaseId}']`)
        await expect(focusedPhase).toBeFocused()
      }
    }
  })
})
