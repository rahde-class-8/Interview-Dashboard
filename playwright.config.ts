import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build on http://localhost:3000
 * (the Supabase Auth site_url) with local Supabase and Mailpit running.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start -- -p 3000",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
