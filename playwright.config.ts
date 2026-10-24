import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// Local Supabase connection values for test helpers (CI provides them via env).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/**
 * Runs against a production build on http://localhost:3000 (the Supabase Auth
 * site_url) with local Supabase and Mailpit running.
 *   api      — HTTP tests of /api/v1 with real sessions (no browser)
 *   chromium — browser end-to-end tests
 */
export default defineConfig({
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "api", testDir: "tests/api" },
    { name: "chromium", testDir: "tests/e2e", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build && npm run start -- -p 3000",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
