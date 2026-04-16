/**
 * Jira automation rule operations.
 */

import type { JiraClient, RuleSummary, RuleSummaryResponse } from "../types.js";
import { buildAuthHeader } from "../config.js";

export async function fetchAutomationApi(
  url: string,
  authHeader: string
): Promise<unknown> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text();
    switch (res.status) {
      case 401:
        throw new Error(
          `401 Unauthorized — check JIRA_EMAIL and JIRA_API_TOKEN.\nURL: ${url}\nResponse: ${body}`
        );
      case 403:
        throw new Error(
          `403 Forbidden — your account may lack Jira admin permissions.\n` +
            `The rule/summary endpoint requires global admin access.\nURL: ${url}\nResponse: ${body}`
        );
      case 404:
        throw new Error(
          `404 Not Found — automation API endpoint not found.\nURL: ${url}\nResponse: ${body}`
        );
      default:
        throw new Error(
          `HTTP ${res.status} ${res.statusText}\nURL: ${url}\nResponse: ${body}`
        );
    }
  }

  return res.json();
}

export async function fetchAllRules(
  cloudId: string,
  authHeader: string
): Promise<RuleSummary[]> {
  const baseUrl = `https://api.atlassian.com/automation/public/jira/${cloudId}/rest/v1/rule/summary`;

  const allRules: RuleSummary[] = [];
  let cursor: string | null = null;
  const limit = 100;

  do {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);

    const url = `${baseUrl}?${params}`;
    const data = (await fetchAutomationApi(url, authHeader)) as RuleSummaryResponse;

    const rules = data.data ?? [];
    allRules.push(...rules);

    cursor = null;
    if (data.links?.next) {
      const nextUrl = new URL(data.links.next, baseUrl);
      cursor = nextUrl.searchParams.get("cursor");
    }
  } while (cursor);

  return allRules;
}

export async function getRuleDetail(
  cloudId: string,
  ruleUuid: string,
  authHeader: string
): Promise<unknown> {
  const url = `https://api.atlassian.com/automation/public/jira/${cloudId}/rest/v1/rule/${ruleUuid}`;
  return fetchAutomationApi(url, authHeader);
}

// Display helpers

export function formatState(rule: RuleSummary): string {
  if (rule.enabled === true || rule.state === "ENABLED") return "ENABLED";
  if (rule.enabled === false || rule.state === "DISABLED") return "DISABLED";
  return rule.state || "UNKNOWN";
}

export function formatScope(rule: RuleSummary): string {
  if (rule.scope?.resources?.length) {
    return rule.scope.resources
      .map((r) => {
        const match = r.match(/project\/(\d+)$/);
        return match ? `project:${match[1]}` : r;
      })
      .join(", ");
  }
  if (rule.projects?.length) {
    return rule.projects
      .map((p) => p.projectKey ?? `pid:${p.projectId}`)
      .join(", ");
  }
  return "global";
}

export function formatTrigger(rule: RuleSummary): string {
  return rule.trigger?.component || rule.trigger?.type || "-";
}

export function formatId(rule: RuleSummary): string {
  return rule.uuid ?? String(rule.id ?? "-");
}
