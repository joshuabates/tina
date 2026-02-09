import { test, expect } from "@playwright/test"

test("app loads without crashing", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("body")).toBeVisible()
  // Placeholder text from the cleaned App.tsx
  await expect(page.getByText("tina-web rebuild")).toBeVisible()
})
