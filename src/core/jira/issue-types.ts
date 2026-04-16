/**
 * Issue type and project auto-discovery from Jira REST API.
 * Replaces hardcoded issue type IDs that vary per Jira instance.
 */

import type { JiraClient } from "../types.js";

export type IssueTypeMap = Record<string, string>;

/**
 * Discover all issue types from the Jira instance.
 * Calls GET /rest/api/3/issuetype and returns a name->ID map.
 * Names are stored as-is (case-sensitive, e.g., "Epic", "Story", "Bug").
 */
export async function discoverIssueTypes(client: JiraClient): Promise<IssueTypeMap> {
  const res = await client.jiraFetch("/rest/api/3/issuetype");
  const types = (await res.json()) as Array<{ id: string; name: string; subtask?: boolean }>;
  const map: IssueTypeMap = {};
  for (const t of types) {
    map[t.name] = t.id;
  }
  return map;
}

/**
 * Resolve an issue type name to its ID, with a helpful error message.
 */
export function resolveIssueTypeId(map: IssueTypeMap, name: string): string {
  const id = map[name];
  if (!id) {
    const available = Object.keys(map).join(", ");
    throw new Error(
      `Issue type "${name}" not found in this Jira instance. Available types: ${available}`
    );
  }
  return id;
}

export interface ProjectInfo {
  key: string;
  name: string;
}

/**
 * Discover all accessible projects from the Jira instance.
 * Calls GET /rest/api/3/project and returns key+name pairs.
 */
export async function discoverProjects(client: JiraClient): Promise<ProjectInfo[]> {
  const res = await client.jiraFetch("/rest/api/3/project?maxResults=200&orderBy=key");
  const projects = (await res.json()) as Array<{ key: string; name: string }>;
  return projects.map((p) => ({ key: p.key, name: p.name }));
}

// ---------------------------------------------------------------------------
// Cache (in-memory, keyed by base URL, 24h TTL)
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const issueTypeCache = new Map<string, CacheEntry<IssueTypeMap>>();
const projectCache = new Map<string, CacheEntry<ProjectInfo[]>>();

/**
 * Get issue types with caching. First call discovers, subsequent calls use cache.
 */
export async function getIssueTypes(client: JiraClient): Promise<IssueTypeMap> {
  const key = client.credentials.baseUrl;
  const cached = issueTypeCache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }
  const data = await discoverIssueTypes(client);
  issueTypeCache.set(key, { data, expiry: Date.now() + TTL_MS });
  return data;
}

/**
 * Get projects with caching. First call discovers, subsequent calls use cache.
 */
export async function getProjects(client: JiraClient): Promise<ProjectInfo[]> {
  const key = client.credentials.baseUrl;
  const cached = projectCache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }
  const data = await discoverProjects(client);
  projectCache.set(key, { data, expiry: Date.now() + TTL_MS });
  return data;
}

/**
 * Clear all cached data (e.g., when credentials change).
 */
export function clearDiscoveryCache(): void {
  issueTypeCache.clear();
  projectCache.clear();
}
