import { defineConfig } from "@playwright/test";

// Playwright E2E: primarily drives CLI scripts against a stood-up MSW Jira
// mock server. Running headless unless PWDEBUG=1.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // CLI tests share the mock server
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    trace: "on-first-retry",
  },
  // Dev-server / mock-server lifecycle is managed inside each spec so that
  // contracts remain explicit per test.
});
