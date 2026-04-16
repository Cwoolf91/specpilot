/**
 * Jira issue link operations.
 */

import type { JiraClient } from "../types.js";

export async function createBlocksLink(
  client: JiraClient,
  blockedIssueKey: string,
  blockingIssueKey: string
): Promise<void> {
  await client.jiraFetch("/rest/api/3/issueLink", {
    method: "POST",
    body: JSON.stringify({
      type: { name: "Blocks" },
      inwardIssue: { key: blockedIssueKey },
      outwardIssue: { key: blockingIssueKey },
    }),
  });
}
