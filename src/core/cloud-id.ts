/**
 * Resolve Atlassian Cloud ID from a Jira instance URL.
 * Used by automation rules API and Confluence API.
 */

export async function getCloudId(baseUrl: string): Promise<string> {
  const url = `${baseUrl}/_edge/tenant_info`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(
      `Failed to resolve Cloud ID from ${url} (HTTP ${res.status}). ` +
        `Verify JIRA_BASE_URL is correct.`
    );
  }
  const data = (await res.json()) as { cloudId?: string };
  if (!data.cloudId) {
    throw new Error("Cloud ID not found in tenant info response.");
  }
  return data.cloudId;
}
