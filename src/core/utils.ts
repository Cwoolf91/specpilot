/**
 * Shared utility functions.
 */

export function extractTextFromAdf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) {
    return (n.content as unknown[]).map(extractTextFromAdf).join("");
  }
  return "";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollUntil(
  check: () => Promise<boolean>,
  intervalMs: number,
  timeoutMs: number
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true;
    await sleep(intervalMs);
  }
  return false;
}

export function validateShellArg(value: string, label: string): void {
  if (/[`$;|&<>]/.test(value)) {
    throw new Error(`${label} contains unsafe characters: ${value}`);
  }
}

/** Escape a string for use inside JQL double-quotes. */
export function escapeJqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Validate a Jira issue key format (e.g., PROJ-123). */
export function validateIssueKey(key: string): string {
  if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) {
    throw new Error(`Invalid Jira issue key format: ${key}`);
  }
  return key;
}

/** Validate a Jira project key format (e.g., WEB). */
export function validateProjectKey(key: string): string {
  if (!/^[A-Z][A-Z0-9_]+$/.test(key)) {
    throw new Error(`Invalid Jira project key format: ${key}`);
  }
  return key;
}

/**
 * Parse a JSON string, stripping markdown code fences if present.
 * Useful for loading JSON that may have been pasted from a Claude conversation.
 */
export function parseJsonResponse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as T;
    }
    throw new Error(
      `Failed to parse JSON:\n${text.slice(0, 500)}`
    );
  }
}
