/**
 * MSW server for Node-based tests. Start in a global setup file or per-suite
 * beforeAll/afterAll block. Use `server.use(...)` inside a test to add or
 * override handlers for a specific scenario.
 */
import { setupServer } from "msw/node";
import { jiraHandlers } from "./handlers/jira.js";
import { anthropicHandlers } from "./handlers/anthropic.js";
import { githubHandlers } from "./handlers/github.js";

export const server = setupServer(
  ...jiraHandlers,
  ...anthropicHandlers,
  ...githubHandlers,
);
