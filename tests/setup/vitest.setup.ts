/**
 * Global setup for node-environment unit tests.
 *
 * - Silences dotenv-style env loading that occurs at module-load in a few
 *   files (src/extension/credentials.ts loadEnvFallback) by scrubbing the
 *   relevant env vars before each test.
 * - Registers a vi reset hook so per-test mocks don't leak.
 */
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { server } from "../msw/server.js";
import { resetJiraStore } from "../msw/handlers/jira.js";
import { setLatestRelease } from "../msw/handlers/github.js";

const JIRA_ENV_KEYS = [
  "JIRA_BASE_URL",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "JIRA_PROJECT_KEY",
  "ANTHROPIC_API_KEY",
  "AWS_REGION",
  "AWS_PROFILE",
];

const originalEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  for (const key of JIRA_ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of JIRA_ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
  server.resetHandlers();
  resetJiraStore();
  setLatestRelease(null);
  vi.restoreAllMocks();
  vi.clearAllTimers();
});
