import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "e2e",
  testMatch: ["performance.spec.ts"],
  timeout: 45_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:4174",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command:
      "sh -c 'set -e; TINA_ENV=\"${TINA_ENV:-prod}\"; CONVEX_URL=$(cargo run --quiet --manifest-path ../tina-session/Cargo.toml -- config convex-url --env \"$TINA_ENV\"); VITE_TINA_ENV=\"$TINA_ENV\" VITE_CONVEX_URL=\"$CONVEX_URL\" npm run build && npm run preview -- --host 127.0.0.1 --port 4174 --strictPort'",
    port: 4174,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
