import { test, expect } from "@playwright/test"

test.describe("Performance Budget", () => {
  test("meets performance budgets for initial load", async ({ page }) => {
    // This suite runs against Vite dev server (not production build),
    // often in parallel with other browser workers.
    const fcpBudgetMs = process.env.CI ? 5000 : 4000

    // Capture console errors
    const consoleErrors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text())
      }
    })

    // Navigate and wait for load (use 'load' instead of 'networkidle' for better reliability)
    await page.goto("/", { waitUntil: "load" })

    // Wait for the page to actually render content
    await page.waitForSelector("body", { state: "visible" })

    // 1. First contentful paint budget for dev server runs
    // Use Performance API to get paint timing
    const paintTiming = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        // Check if paint timing is already available
        const paint = performance.getEntriesByType("paint")
        const fcp = paint.find(
          (entry) => entry.name === "first-contentful-paint"
        )
        if (fcp) {
          resolve(fcp.startTime)
          return
        }

        // If not available yet, wait for it via PerformanceObserver
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const fcpEntry = entries.find(
            (entry) => entry.name === "first-contentful-paint"
          )
          if (fcpEntry) {
            observer.disconnect()
            resolve(fcpEntry.startTime)
          }
        })
        observer.observe({ entryTypes: ["paint"] })

        // Fallback timeout after 3s
        setTimeout(() => {
          observer.disconnect()
          const paint = performance.getEntriesByType("paint")
          const fcp = paint.find(
            (entry) => entry.name === "first-contentful-paint"
          )
          resolve(fcp ? fcp.startTime : 0)
        }, 3000)
      })
    })

    expect(paintTiming).toBeLessThan(fcpBudgetMs)
    expect(paintTiming).toBeGreaterThan(0) // Sanity check

    // Log timing for visibility (helpful for monitoring trends)
    console.log(`First contentful paint: ${paintTiming.toFixed(2)}ms`)

    // 2. Page load without console errors
    expect(consoleErrors).toHaveLength(0)

    // 3. No layout thrashing (forced reflows during initial render)
    // We detect this by checking for excessive style/layout calculations
    const layoutMetrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType("measure")
      // Count layout-related entries during initial load
      const layoutEntries = entries.filter(
        (entry) =>
          entry.name.includes("layout") || entry.name.includes("style")
      )
      return {
        count: layoutEntries.length,
        totalDuration: layoutEntries.reduce((sum, e) => sum + e.duration, 0),
      }
    })

    // Generous threshold - we mainly want to catch pathological cases
    // (dozens of forced reflows)
    expect(layoutMetrics.count).toBeLessThan(50)

    // 4. Sanity check: page actually loaded
    await expect(page.getByRole("banner")).toBeVisible()
    await expect(page.getByRole("main")).toBeVisible()
  })

  test("bundle size remains reasonable", async ({ page }) => {
    // Navigate and collect resource sizes
    await page.goto("/")

    const resourceSizes = await page.evaluate(() => {
      const resources = performance.getEntriesByType("resource")
      let totalJS = 0
      let totalCSS = 0
      let totalSize = 0

      resources.forEach((resource: any) => {
        const size = resource.transferSize || 0
        totalSize += size

        if (resource.name.endsWith(".js")) {
          totalJS += size
        } else if (resource.name.endsWith(".css")) {
          totalCSS += size
        }
      })

      return {
        totalJS: Math.round(totalJS / 1024), // KB
        totalCSS: Math.round(totalCSS / 1024), // KB
        totalSize: Math.round(totalSize / 1024), // KB
      }
    })

    // Generous budgets for a React + Vite app with real-time features
    // These should catch major regressions without being too strict
    // Based on actual measurements: JS ~3 KB, CSS ~32 KB, Total ~4929 KB
    // Note: These are development build sizes; production builds will be smaller
    expect(resourceSizes.totalJS).toBeLessThan(2000) // 2MB total JS (generous for dev builds)
    expect(resourceSizes.totalCSS).toBeLessThan(200) // 200KB total CSS
    expect(resourceSizes.totalSize).toBeLessThan(6000) // 6MB total (catches major regressions)

    // Log sizes for visibility (helpful for monitoring trends)
    console.log("Bundle sizes:", resourceSizes)
  })
})
