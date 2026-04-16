/**
 * Jira version operations for release notes.
 */

import type { JiraClient, JiraVersion } from "../types.js";

export async function getVersion(
  client: JiraClient,
  versionName: string,
  projectKey: string
): Promise<JiraVersion> {
  const res = await client.jiraFetch(
    `/rest/api/3/project/${projectKey}/version?query=${encodeURIComponent(versionName)}&maxResults=50`
  );
  const data = (await res.json()) as { values?: JiraVersion[] };
  const match = data.values?.find((v) => v.name === versionName);
  if (!match) {
    throw new Error(`Version "${versionName}" not found in project ${projectKey}`);
  }
  return match;
}

export async function updateVersionDescription(
  client: JiraClient,
  version: JiraVersion,
  description: string
): Promise<void> {
  await client.jiraFetch(`/rest/api/3/version/${version.id}`, {
    method: "PUT",
    body: JSON.stringify({ description }),
  });
}
