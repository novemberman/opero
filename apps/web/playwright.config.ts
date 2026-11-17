import { defineConfig, devices } from "@playwright/test";

/**
 * Browser E2E for review confirmation.
 * Requires Chromium host libraries (CI image or `playwright install-deps`).
 * Local Hetzner host may lack libs — see happy-dom contract tests as fallback evidence.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
