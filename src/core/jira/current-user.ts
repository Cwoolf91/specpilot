/**
 * Fetch the authenticated Jira user (accountId + displayName).
 * Used to scope JQL queries like `assignee = currentUser()`.
 */

import type { JiraClient, JiraUser } from "../types.js";

export async function getCurrentUser(client: JiraClient): Promise<JiraUser | null> {
  try {
    const res = await client.jiraFetch("/rest/api/3/myself");
    const data = (await res.json()) as Partial<JiraUser>;
    if (!data.accountId || !data.displayName) return null;
    return {
      accountId: data.accountId,
      displayName: data.displayName,
      emailAddress: data.emailAddress,
    };
  } catch {
    return null;
  }
}
