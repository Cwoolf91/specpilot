/**
 * Shared Jira API client. Accepts credentials via dependency injection.
 */

import { readFileSync } from "fs";
import { basename } from "path";
import { buildAuthHeader } from "./config.js";
import type { JiraCredentials, JiraClient, CredentialProvider } from "./types.js";

function createClientInstance(credentials: JiraCredentials): JiraClient {
  const authHeader = buildAuthHeader(credentials.email, credentials.apiToken);

  async function jiraFetch(
    path: string,
    options?: RequestInit
  ): Promise<Response> {
    const url = path.startsWith("http")
      ? path
      : `${credentials.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(30_000),
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      const safePath = url.split("?")[0];
      throw new Error(`Jira API ${res.status}: ${safePath}\n${body.slice(0, 300)}`);
    }
    return res;
  }

  async function uploadAttachment(
    issueKey: string,
    filepath: string
  ): Promise<void> {
    const fileBuffer = readFileSync(filepath);
    const blob = new Blob([fileBuffer], { type: "application/octet-stream" });
    const formData = new FormData();
    formData.append("file", blob, basename(filepath));

    const res = await fetch(
      `${credentials.baseUrl}/rest/api/3/issue/${issueKey}/attachments`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "X-Atlassian-Token": "no-check",
        },
        body: formData,
        signal: AbortSignal.timeout(60_000),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Attachment ${res.status}: ${body.slice(0, 300)}`);
    }
  }

  return { jiraFetch, uploadAttachment, credentials };
}

export async function createJiraClient(
  provider: CredentialProvider
): Promise<JiraClient> {
  const credentials = await provider.getCredentials();
  return createClientInstance(credentials);
}

export function createJiraClientSync(
  credentials: JiraCredentials
): JiraClient {
  return createClientInstance(credentials);
}
