import { test, expect } from "@playwright/test"

test.describe("Smoke Tests", () => {
  test("app loads and renders AppShell with all landmark regions and no console errors", async ({
    page,
  }) => {
    // Capture console errors to verify graceful empty state
    const consoleErrors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text())
      }
    })

    // Navigate to the app
    await page.goto("/", { waitUntil: "networkidle" })

    // Wait for the app shell to be fully rendered
    await page.waitForSelector("header", { state: "visible", timeout: 10000 })

    // Verify page title
    await expect(page).toHaveTitle(/ORCHESTRATOR|TINA/i)

    // Verify all landmark regions are present
    const banner = page.getByRole("banner")
    await expect(banner).toBeVisible()

    const navigation = page.getByRole("navigation")
    await expect(navigation).toBeVisible()

    const main = page.getByRole("main")
    await expect(main).toBeVisible()

    // Verify AppShell header renders with correct text
    await expect(banner).toContainText("ORCHESTRATOR")

    // Verify no console errors occurred (proves graceful empty state handling)
    expect(consoleErrors).toHaveLength(0)
  })
})
