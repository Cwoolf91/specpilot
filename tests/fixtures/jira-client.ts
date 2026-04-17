/**
 * Shared helper for constructing a JiraClient bound to TEST_CREDENTIALS.
 * All HTTP calls will hit the MSW server.
 */
import { createJiraClientSync } from "../../src/core/jira-client.js";
import type { JiraClient } from "../../src/core/types.js";
import { TEST_CREDENTIALS } from "./jira.js";

export function makeTestClient(): JiraClient {
  return createJiraClientSync({ ...TEST_CREDENTIALS });
}
