/**
 * Helpers for finding the active sprint for a project and fetching its issues.
 * Factored out so sprint-tree, ticket-jumpstart, and future features share one
 * canonical "what's the active sprint?" lookup.
 */

import type { JiraClient, JiraIssue, Sprint } from "../types.js";

export async function findActiveSprint(
  client: JiraClient,
  projectKey: string,
): Promise<{ boardId: number; sprint: Sprint } | null> {
  try {
    const boardRes = await client.jiraFetch(
      `/rest/agile/1.0/board?projectKeyOrId=${projectKey}&type=scrum`,
    );
    const boards = (await boardRes.json()) as { values?: { id: number }[] };
    const boardId = boards.values?.[0]?.id;
    if (!boardId) return null;

    const sprintRes = await client.jiraFetch(
      `/rest/agile/1.0/board/${boardId}/sprint?state=active`,
    );
    const sprints = (await sprintRes.json()) as { values?: Sprint[] };
    const sprint = sprints.values?.[0];
    if (!sprint) return null;

    return { boardId, sprint };
  } catch {
    return null;
  }
}

const DEFAULT_FIELDS = "summary,status,issuetype,assignee,labels,parent,description";

export async function fetchSprintIssues(
  client: JiraClient,
  sprintId: number,
  options: { jql?: string; fields?: string; maxResults?: number } = {},
): Promise<JiraIssue[]> {
  const fields = options.fields ?? DEFAULT_FIELDS;
  const maxResults = options.maxResults ?? 100;
  const params = new URLSearchParams({
    fields,
    maxResults: String(maxResults),
  });
  if (options.jql) params.set("jql", options.jql);

  try {
    const res = await client.jiraFetch(
      `/rest/agile/1.0/sprint/${sprintId}/issue?${params.toString()}`,
    );
    const data = (await res.json()) as { issues?: JiraIssue[] };
    return data.issues ?? [];
  } catch {
    return [];
  }
}
