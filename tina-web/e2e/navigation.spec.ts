import { test, expect, type Page } from "@playwright/test"

async function openApp(page: Page) {
  await page.goto("/")
  const navigation = page.getByRole("navigation")
  await expect(navigation).toBeVisible()
  return navigation
}

async function resolveSidebarState(page: Page) {
  const navigation = await openApp(page)
  const skeletonBars = navigation.locator('[class*="skeletonBar"]')

  const emptyState = navigation.getByText("No orchestrations found")
  const items = page.locator('[data-orchestration-id]')
  const errorAlert = navigation.getByRole("alert")

  await Promise.race([
    emptyState.waitFor({ state: "visible", timeout: 5000 }),
    items.first().waitFor({ state: "visible", timeout: 5000 }),
    errorAlert.waitFor({ state: "visible", timeout: 5000 }),
  ])

  if (await skeletonBars.first().isVisible().catch(() => false)) {
    await skeletonBars.first().waitFor({ state: "hidden", timeout: 15000 })
  }

  if (await errorAlert.isVisible()) {
    throw new Error(`Sidebar error state: ${await errorAlert.textContent()}`)
  }

  return { navigation, emptyState, items }
}

async function firstOrchestration(page: Page) {
  const items = page.locator('[data-orchestration-id]')
  if ((await items.count()) === 0) return null

  const first = items.first()
  const id = await first.getAttribute("data-orchestration-id")
  expect(id).toBeTruthy()

  return { first, id: id as string, items }
}

test.describe("Navigation", () => {
  test("sidebar renders and handles empty or populated state", async ({ page }) => {
    const consoleErrors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text())
    })

    const { emptyState, items } = await resolveSidebarState(page)

    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible()
      expect(await items.count()).toBe(0)
    } else {
      expect(await items.count()).toBeGreaterThan(0)
      await expect(items.first()).toBeVisible()
    }

    expect(consoleErrors).toHaveLength(0)
  })

  test("clicking sidebar item updates URL and loads orchestration page", async ({ page }) => {
    await openApp(page)

    const entry = await firstOrchestration(page)
    if (!entry) {
      test.skip()
      return
    }

    await entry.first.click()
    await expect(page).toHaveURL(new RegExp(`\\?orch=${entry.id}`))

    const main = page.getByRole("main")
    await expect(main).toBeVisible()
    expect(await main.textContent()).toBeTruthy()
  })

  test("deep-link to orchestration ID loads page correctly", async ({ page }) => {
    await openApp(page)

    const entry = await firstOrchestration(page)
    if (!entry) {
      test.skip()
      return
    }

    await page.goto(`/?orch=${entry.id}`)
    await expect(page.getByRole("navigation")).toBeVisible()
    await expect(page.getByRole("main")).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`\\?orch=${entry.id}`))
    await expect(page.locator('[data-orchestration-id]').first()).toBeVisible()
  })

  test("status bar shows feature name and phase info when orchestration selected", async ({ page }) => {
    await openApp(page)

    const entry = await firstOrchestration(page)
    if (!entry) {
      test.skip()
      return
    }

    const featureName = (await entry.first.textContent())?.trim().split("\n")[0]
    expect(featureName).toBeTruthy()

    await entry.first.click()
    await expect(page).toHaveURL(new RegExp(`\\?orch=${entry.id}`))

    const statusBar = page.locator("footer")
    await expect(statusBar).toBeVisible()
    expect(await statusBar.textContent()).toContain(featureName)
  })
})
