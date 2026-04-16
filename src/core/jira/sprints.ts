/**
 * Sprint and board operations.
 */

import type { JiraClient, Sprint, JiraBoard } from "../types.js";

export async function fetchBoards(
  client: JiraClient,
  projectKey: string
): Promise<JiraBoard[]> {
  try {
    const res = await client.jiraFetch(
      `/rest/agile/1.0/board?projectKeyOrId=${projectKey}&type=scrum&maxResults=10`
    );
    const data = (await res.json()) as { values?: JiraBoard[] };
    return data.values || [];
  } catch {
    return [];
  }
}

export async function fetchSprints(
  client: JiraClient,
  boardId: number
): Promise<Sprint[]> {
  try {
    const res = await client.jiraFetch(
      `/rest/agile/1.0/board/${boardId}/sprint?state=active,future&maxResults=10`
    );
    const data = (await res.json()) as { values?: Sprint[] };
    return data.values || [];
  } catch {
    return [];
  }
}

export async function moveToSprint(
  client: JiraClient,
  sprintId: string,
  issueKeys: string[]
): Promise<void> {
  await client.jiraFetch(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
    method: "POST",
    body: JSON.stringify({ issues: issueKeys }),
  });
}
