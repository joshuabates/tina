import { test, expect } from "@playwright/test"

test.describe("Responsive Layout", () => {
  // Test the actual acceptance criteria: layout adapts and no horizontal scroll

  test("no horizontal overflow at desktop width (1440px)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth
    })

    expect(hasHorizontalScroll).toBe(false)
  })

  test("no horizontal overflow at 1200px breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 1199, height: 800 })
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth
    })

    // Should NOT have horizontal scroll (CSS should adapt layout)
    expect(hasHorizontalScroll).toBe(false)
  })

  test("no horizontal overflow at 900px breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 899, height: 800 })
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth
    })

    // Should NOT have horizontal scroll (timeline should be narrower)
    expect(hasHorizontalScroll).toBe(false)
  })

  test("no horizontal overflow at mobile width (768px)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 800 })
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth
    })

    // Should NOT have horizontal scroll (single column layout)
    expect(hasHorizontalScroll).toBe(false)
  })

  test("no horizontal overflow at small mobile (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth
    })

    // Should NOT have horizontal scroll even at very narrow width
    expect(hasHorizontalScroll).toBe(false)
  })

  test("sidebar auto-collapses at narrow viewports", async ({ page }) => {
    await page.setViewportSize({ width: 899, height: 800 })
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Check that sidebar is narrow (collapsed) at this width
    const sidebarWidth = await page.evaluate(() => {
      const sidebar = document.querySelector(
        '[class*="sidebar"]'
      ) as HTMLElement
      if (!sidebar) return 0
      return sidebar.getBoundingClientRect().width
    })

    // Sidebar should be collapsed width (48px) not full width (208px)
    expect(sidebarWidth).toBeLessThan(100)
  })
})
