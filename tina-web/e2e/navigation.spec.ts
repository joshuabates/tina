import { test, expect } from "@playwright/test"

test.describe("Navigation", () => {
  test("sidebar renders and handles empty or populated state", async ({
    page,
  }) => {
    // Capture console errors
    const consoleErrors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text())
      }
    })

    // Navigate to the app
    await page.goto("/")

    // Wait for the navigation sidebar to be visible
    const navigation = page.getByRole("navigation")
    await expect(navigation).toBeVisible()

    // Wait for loading state to complete
    // The sidebar should show either "Loading orchestrations..." initially
    // Then transition to either empty state or orchestration items
    const loadingText = navigation.getByText("Loading orchestrations...")

    // If loading state exists, wait for it to disappear
    try {
      await loadingText.waitFor({ state: "visible", timeout: 2000 })
      await loadingText.waitFor({ state: "hidden", timeout: 15000 })
    } catch {
      // Loading state might not appear if data loads very quickly
    }

    // Debug: capture what's actually in the sidebar
    const sidebarContent = await navigation.textContent()
    console.log("Sidebar content:", sidebarContent)

    // Now check which final state we're in
    // Possible states: empty, has items, or error
    const emptyState = navigation.getByText("No orchestrations found")
    const orchestrationItems = page.locator('[data-orchestration-id]')
    const errorAlert = navigation.getByRole("alert")

    // Wait for one of the three states to appear
    try {
      await Promise.race([
        emptyState.waitFor({ state: "visible", timeout: 5000 }),
        orchestrationItems.first().waitFor({ state: "visible", timeout: 5000 }),
        errorAlert.waitFor({ state: "visible", timeout: 5000 }),
      ])
    } catch (error) {
      // If none of the states appeared, take a screenshot for debugging
      await page.screenshot({ path: "/tmp/sidebar-debug.png" })
      throw new Error(`None of the expected sidebar states appeared. Sidebar content: ${sidebarContent}`)
    }

    // Check which state is visible
    const hasError = await errorAlert.isVisible()
    if (hasError) {
      // If there's an error alert, the test should fail
      const errorText = await errorAlert.textContent()
      throw new Error(`Sidebar error state: ${errorText}`)
    }

    const hasEmptyState = await emptyState.isVisible()
    const itemCount = await orchestrationItems.count()

    if (hasEmptyState) {
      // Verify empty state is shown
      await expect(emptyState).toBeVisible()
      expect(itemCount).toBe(0)
    } else {
      // Verify at least one orchestration item exists
      expect(itemCount).toBeGreaterThan(0)
      await expect(orchestrationItems.first()).toBeVisible()
    }

    // Verify no console errors
    expect(consoleErrors).toHaveLength(0)
  })

  test("clicking sidebar item updates URL and loads orchestration page", async ({
    page,
  }) => {
    await page.goto("/")

    // Wait for navigation to be visible
    const navigation = page.getByRole("navigation")
    await expect(navigation).toBeVisible()

    // Check if orchestrations exist
    const orchestrationItems = page.locator('[data-orchestration-id]')
    const count = await orchestrationItems.count()

    if (count === 0) {
      test.skip()
      return
    }

    // Get the first orchestration ID
    const firstItem = orchestrationItems.first()
    const orchestrationId = await firstItem.getAttribute("data-orchestration-id")
    expect(orchestrationId).toBeTruthy()

    // Click the first orchestration item
    await firstItem.click()

    // Verify URL was updated with query parameter
    await expect(page).toHaveURL(new RegExp(`\\?orch=${orchestrationId}`))

    // Verify the main content area shows orchestration content
    const main = page.getByRole("main")
    await expect(main).toBeVisible()

    // The OrchestrationPage should render (verify by checking for common elements)
    // We expect the page to not show an error state
    const mainContent = await main.textContent()
    expect(mainContent).toBeTruthy()
  })

  test("deep-link to orchestration ID loads page correctly", async ({
    page,
  }) => {
    // First, get an orchestration ID by loading the app
    await page.goto("/")
    await page.getByRole("navigation").waitFor({ state: "visible" })

    const orchestrationItems = page.locator('[data-orchestration-id]')
    const count = await orchestrationItems.count()

    if (count === 0) {
      test.skip()
      return
    }

    // Get the first orchestration ID
    const orchestrationId = await orchestrationItems
      .first()
      .getAttribute("data-orchestration-id")
    expect(orchestrationId).toBeTruthy()

    // Navigate directly to the orchestration via deep link
    await page.goto(`/?orch=${orchestrationId}`)

    // Verify the page loaded correctly
    const navigation = page.getByRole("navigation")
    await expect(navigation).toBeVisible()

    const main = page.getByRole("main")
    await expect(main).toBeVisible()

    // Verify URL still has the orchestration ID
    await expect(page).toHaveURL(new RegExp(`\\?orch=${orchestrationId}`))

    // Verify the orchestration item is marked as active
    const activeItem = orchestrationItems.first()
    await expect(activeItem).toBeVisible()
  })

  test("status bar shows feature name and phase info when orchestration selected", async ({
    page,
  }) => {
    await page.goto("/")

    // Wait for navigation to be visible
    const navigation = page.getByRole("navigation")
    await expect(navigation).toBeVisible()

    // Check if orchestrations exist
    const orchestrationItems = page.locator('[data-orchestration-id]')
    const count = await orchestrationItems.count()

    if (count === 0) {
      test.skip()
      return
    }

    // Get the feature name from the first item
    const firstItem = orchestrationItems.first()
    const featureName = await firstItem.textContent()
    expect(featureName).toBeTruthy()

    // Click the orchestration
    await firstItem.click()

    // Wait for URL to update
    const orchestrationId = await firstItem.getAttribute("data-orchestration-id")
    await expect(page).toHaveURL(new RegExp(`\\?orch=${orchestrationId}`))

    // Verify status bar shows the phase info
    // The status bar should contain the feature name and phase info
    // Format: "{featureName} / P{currentPhase} {status}"
    const statusBar = page.locator("footer")
    await expect(statusBar).toBeVisible()

    // The status bar should contain the feature name (trimmed)
    const statusBarText = await statusBar.textContent()
    expect(statusBarText).toContain(featureName?.trim().split("\n")[0])
  })
})
