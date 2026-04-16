/**
 * CLI Jira client wrapper — provides backward-compatible exports.
 * Used by mcp-server.ts which imports jiraFetch/uploadAttachment directly.
 */

import { JIRA_BASE_URL, AUTH_HEADER } from "./config.js";
import { readFileSync } from "fs";
import { basename } from "path";

export async function jiraFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${JIRA_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: AUTH_HEADER,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira API ${res.status}: ${url}\n${body.slice(0, 500)}`);
  }
  return res;
}

export async function uploadAttachment(
  issueKey: string,
  filepath: string
): Promise<void> {
  const fileBuffer = readFileSync(filepath);
  const blob = new Blob([fileBuffer], { type: "application/octet-stream" });
  const formData = new FormData();
  formData.append("file", blob, basename(filepath));

  const res = await fetch(
    `${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/attachments`,
    {
      method: "POST",
      headers: {
        Authorization: AUTH_HEADER,
        "X-Atlassian-Token": "no-check",
      },
      body: formData,
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Attachment ${res.status}: ${body.slice(0, 300)}`);
  }
}
