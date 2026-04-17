/**
 * Fetch resolved stories in the same epic — used to give the AI prior art
 * when briefing an engineer on their next ticket.
 */

import type { JiraClient, SimilarStory, JiraIssue } from "../types.js";
import { extractTextFromAdf, validateIssueKey } from "../utils.js";

export async function fetchSimilarStoriesInEpic(
  client: JiraClient,
  epicKey: string,
  maxResults = 5,
  excludeKey?: string,
): Promise<SimilarStory[]> {
  try {
    const validated = validateIssueKey(epicKey);
    const clauses = [
      `parent = ${validated}`,
      "statusCategory = Done",
    ];
    if (excludeKey) {
      clauses.push(`key != ${validateIssueKey(excludeKey)}`);
    }
    const jql = `${clauses.join(" AND ")} ORDER BY resolved DESC`;

    const res = await client.jiraFetch("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({
        jql,
        fields: ["summary", "description", "resolutiondate"],
        maxResults,
      }),
    });
    const data = (await res.json()) as { issues?: JiraIssue[] };
    const issues = data.issues ?? [];

    return issues.map((issue): SimilarStory => ({
      key: issue.key,
      summary: issue.fields.summary ?? "",
      description: extractTextFromAdf(issue.fields.description),
      resolvedAt: (issue.fields as Record<string, unknown>).resolutiondate as string | undefined,
    }));
  } catch {
    return [];
  }
}
