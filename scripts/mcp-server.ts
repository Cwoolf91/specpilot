/**
 * MCP Server for Jira Operations
 *
 * Exposes Jira API operations as MCP tools for use with Claude Code,
 * Claude Desktop, or any MCP-compatible client.
 *
 * Usage:
 *   npx tsx scripts/mcp-server.ts
 *
 * Add to Claude Code config (.claude/settings.json):
 *   {
 *     "mcpServers": {
 *       "jira": {
 *         "command": "npx",
 *         "args": ["tsx", "scripts/mcp-server.ts"],
 *         "cwd": "/path/to/specpilot"
 *       }
 *     }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve, sep, basename } from "path";
import { existsSync, statSync } from "fs";
import { tmpdir } from "os";
import { JIRA_BASE_URL, PROJECT_KEY } from "./config.js";
import { jiraFetch, uploadAttachment } from "./jira-client.js";

const ISSUE_KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;
const BLOCKED_FILENAMES = new Set([".env", ".auth-state.json", ".gitconfig", ".npmrc"]);
const BLOCKED_DIRS = [".ssh", ".aws", ".gnupg"];

function validateAttachmentPath(filePath: string): string {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`File does not exist: ${basename(resolved)}`);
  }
  const stat = statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${basename(resolved)}`);
  }
  const filename = basename(resolved);
  if (BLOCKED_FILENAMES.has(filename) || filename.startsWith(".env")) {
    throw new Error(`Blocked sensitive file: ${filename}`);
  }
  const parts = resolved.split(sep);
  if (BLOCKED_DIRS.some((d) => parts.includes(d))) {
    throw new Error(`Blocked sensitive directory in path`);
  }
  const cwd = process.cwd();
  const tmp = tmpdir();
  if (!resolved.startsWith(cwd + sep) && !resolved.startsWith(tmp + sep)) {
    throw new Error("File must be within the project directory or temp directory");
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

// Issue type map — discovered at startup
let issueTypeMap: Record<string, string> = {};

const server = new McpServer({
  name: "specpilot",
  version: "1.0.0",
});

// Tool: Search Jira issues
server.tool(
  "jira-search",
  "Search Jira issues using JQL. Returns key, summary, status, and type for each result.",
  {
    jql: z.string().describe("JQL query string (e.g., 'project = WEB AND status = \"In Progress\"')"),
    maxResults: z.number().optional().default(20).describe("Maximum results to return (default 20, max 50)"),
  },
  async ({ jql, maxResults }) => {
    const limit = Math.min(maxResults ?? 20, 50);
    const res = await jiraFetch(
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,status,issuetype,assignee,priority,parent&maxResults=${limit}`
    );
    const data = (await res.json()) as {
      total: number;
      issues: Array<{
        key: string;
        fields: {
          summary: string;
          status: { name: string };
          issuetype: { name: string };
          assignee?: { displayName: string } | null;
          priority?: { name: string };
          parent?: { key: string; fields?: { summary: string } };
        };
      }>;
    };

    const lines = data.issues.map((issue) => {
      const f = issue.fields;
      const assignee = f.assignee?.displayName || "Unassigned";
      const parent = f.parent ? ` (parent: ${f.parent.key})` : "";
      return `${issue.key}  ${f.issuetype.name.padEnd(8)} ${f.status.name.padEnd(14)} ${assignee.padEnd(20)} ${f.summary}${parent}`;
    });

    return {
      content: [{
        type: "text" as const,
        text: `Found ${data.total} results (showing ${data.issues.length}):\n\n${lines.join("\n")}`,
      }],
    };
  }
);

// Tool: Get issue details
server.tool(
  "jira-get-issue",
  "Get full details of a Jira issue by key (e.g., PROJ-123). Returns summary, description, status, attachments, and child issues.",
  {
    issueKey: z.string().describe("Jira issue key (e.g., PROJ-123)"),
  },
  async ({ issueKey }) => {
    if (!ISSUE_KEY_RE.test(issueKey)) throw new Error(`Invalid issue key format: ${issueKey}`);
    const res = await jiraFetch(
      `/rest/api/3/issue/${issueKey}?fields=summary,description,status,issuetype,assignee,priority,labels,attachment,subtasks,parent,comment`
    );
    const issue = (await res.json()) as {
      key: string;
      fields: {
        summary: string;
        description: unknown;
        status: { name: string };
        issuetype: { name: string };
        assignee?: { displayName: string } | null;
        priority?: { name: string };
        labels: string[];
        attachment: Array<{ filename: string; size: number }>;
        subtasks: Array<{ key: string; fields: { summary: string; status: { name: string } } }>;
        parent?: { key: string; fields?: { summary: string } };
        comment?: { comments: Array<{ author: { displayName: string }; body: unknown; created: string }> };
      };
    };

    const f = issue.fields;
    let text = `${issue.key}: ${f.summary}\n`;
    text += `Type: ${f.issuetype.name}  Status: ${f.status.name}  Priority: ${f.priority?.name || "None"}\n`;
    text += `Assignee: ${f.assignee?.displayName || "Unassigned"}\n`;
    if (f.parent) text += `Parent: ${f.parent.key} — ${f.parent.fields?.summary || ""}\n`;
    if (f.labels.length) text += `Labels: ${f.labels.join(", ")}\n`;
    if (f.attachment.length) {
      text += `\nAttachments (${f.attachment.length}):\n`;
      f.attachment.forEach((a) => { text += `  - ${a.filename} (${(a.size / 1024).toFixed(1)}KB)\n`; });
    }
    if (f.subtasks.length) {
      text += `\nChild issues (${f.subtasks.length}):\n`;
      f.subtasks.forEach((s) => { text += `  ${s.key}  ${s.fields.status.name.padEnd(14)} ${s.fields.summary}\n`; });
    }
    if (f.description) {
      text += `\nDescription (ADF - raw):\n${JSON.stringify(f.description, null, 2).slice(0, 2000)}`;
    }

    return { content: [{ type: "text" as const, text }] };
  }
);

// Tool: Create issue
server.tool(
  "jira-create-issue",
  "Create a new Jira issue (Epic, Story, Bug, Task). Returns the created issue key.",
  {
    projectKey: z.string().optional().default(PROJECT_KEY || "").describe("Jira project key"),
    issueType: z.string().describe("Issue type name (e.g., Epic, Story, Bug, Task)"),
    summary: z.string().describe("Issue title/summary"),
    description: z.string().optional().describe("Plain text description (converted to ADF)"),
    parentKey: z.string().optional().describe("Parent issue key (for stories under epics)"),
    labels: z.array(z.string()).optional().describe("Labels to add"),
  },
  async ({ projectKey, issueType, summary, description, parentKey, labels }) => {
    if (!projectKey) throw new Error("Project key is required. Set JIRA_PROJECT_KEY in .env or pass projectKey.");
    if (parentKey && !ISSUE_KEY_RE.test(parentKey)) throw new Error(`Invalid parent key format: ${parentKey}`);
    const typeId = issueTypeMap[issueType];
    if (!typeId) {
      const available = Object.keys(issueTypeMap).join(", ");
      throw new Error(`Issue type "${issueType}" not found. Available: ${available}`);
    }

    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      issuetype: { id: typeId },
      summary,
    };

    if (description) {
      fields.description = {
        type: "doc",
        version: 1,
        content: [{
          type: "paragraph",
          content: [{ type: "text", text: description }],
        }],
      };
    }
    if (parentKey) fields.parent = { key: parentKey };
    if (labels?.length) fields.labels = labels;

    const res = await jiraFetch("/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify({ fields }),
    });
    const data = (await res.json()) as { key: string; id: string };

    return {
      content: [{
        type: "text" as const,
        text: `Created ${issueType} ${data.key}: ${summary}\nURL: ${JIRA_BASE_URL}/browse/${data.key}`,
      }],
    };
  }
);

// Tool: Add attachment
server.tool(
  "jira-add-attachment",
  "Attach a file to a Jira issue. Provide the local file path.",
  {
    issueKey: z.string().describe("Jira issue key (e.g., PROJ-123)"),
    filePath: z.string().describe("Absolute path to the file to attach"),
  },
  async ({ issueKey, filePath }) => {
    if (!ISSUE_KEY_RE.test(issueKey)) {
      throw new Error(`Invalid issue key format: ${issueKey}`);
    }
    const validatedPath = validateAttachmentPath(filePath);
    await uploadAttachment(issueKey, validatedPath);
    return {
      content: [{
        type: "text" as const,
        text: `Attached ${basename(validatedPath)} to ${issueKey}`,
      }],
    };
  }
);

// Tool: List sprints
server.tool(
  "jira-list-sprints",
  "List active and future sprints for a project's board.",
  {
    projectKey: z.string().optional().default(PROJECT_KEY || "").describe("Jira project key"),
  },
  async ({ projectKey }) => {
    if (!projectKey) throw new Error("Project key is required. Set JIRA_PROJECT_KEY in .env or pass projectKey.");
    // Find board
    const boardRes = await jiraFetch(
      `/rest/agile/1.0/board?projectKeyOrId=${projectKey}&type=scrum&maxResults=5`
    );
    const boardData = (await boardRes.json()) as { values: Array<{ id: number; name: string }> };

    if (!boardData.values?.length) {
      return { content: [{ type: "text" as const, text: `No scrum boards found for project ${projectKey}` }] };
    }

    const lines: string[] = [];
    for (const board of boardData.values) {
      const sprintRes = await jiraFetch(
        `/rest/agile/1.0/board/${board.id}/sprint?state=active,future&maxResults=10`
      );
      const sprintData = (await sprintRes.json()) as {
        values: Array<{ id: number; name: string; state: string; startDate?: string; endDate?: string }>;
      };

      lines.push(`Board: ${board.name} (ID ${board.id})`);
      if (sprintData.values?.length) {
        for (const sprint of sprintData.values) {
          const dates = sprint.startDate
            ? ` (${sprint.startDate.slice(0, 10)} → ${sprint.endDate?.slice(0, 10) || "?"})`
            : "";
          lines.push(`  ${sprint.id}  ${sprint.state.padEnd(8)} ${sprint.name}${dates}`);
        }
      } else {
        lines.push("  No active/future sprints");
      }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// Tool: Move issues to sprint
server.tool(
  "jira-move-to-sprint",
  "Move one or more issues into a sprint by sprint ID.",
  {
    sprintId: z.number().describe("Sprint ID (from jira-list-sprints)"),
    issueKeys: z.array(z.string()).describe("Array of issue keys to move (e.g., ['PROJ-123', 'PROJ-456'])"),
  },
  async ({ sprintId, issueKeys }) => {
    for (const key of issueKeys) {
      if (!ISSUE_KEY_RE.test(key)) throw new Error(`Invalid issue key format: ${key}`);
    }
    await jiraFetch(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
      method: "POST",
      body: JSON.stringify({ issues: issueKeys }),
    });

    return {
      content: [{
        type: "text" as const,
        text: `Moved ${issueKeys.length} issue(s) to sprint ${sprintId}: ${issueKeys.join(", ")}`,
      }],
    };
  }
);

// Tool: Transition issue (change status)
server.tool(
  "jira-transition",
  "Change the status of a Jira issue (e.g., move to In Progress, Done). Lists available transitions if no transition ID is provided.",
  {
    issueKey: z.string().describe("Jira issue key (e.g., PROJ-123)"),
    transitionId: z.string().optional().describe("Transition ID to execute. Omit to list available transitions."),
  },
  async ({ issueKey, transitionId }) => {
    if (!ISSUE_KEY_RE.test(issueKey)) throw new Error(`Invalid issue key format: ${issueKey}`);
    if (!transitionId) {
      const res = await jiraFetch(`/rest/api/3/issue/${issueKey}/transitions`);
      const data = (await res.json()) as {
        transitions: Array<{ id: string; name: string; to: { name: string } }>;
      };
      const lines = data.transitions.map(
        (t) => `  ${t.id}  ${t.name} → ${t.to.name}`
      );
      return {
        content: [{
          type: "text" as const,
          text: `Available transitions for ${issueKey}:\n${lines.join("\n")}`,
        }],
      };
    }

    await jiraFetch(`/rest/api/3/issue/${issueKey}/transitions`, {
      method: "POST",
      body: JSON.stringify({ transition: { id: transitionId } }),
    });

    return {
      content: [{
        type: "text" as const,
        text: `Transitioned ${issueKey} (transition ID ${transitionId})`,
      }],
    };
  }
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  // Discover issue types from the Jira instance at startup
  try {
    const res = await jiraFetch("/rest/api/3/issuetype");
    const types = (await res.json()) as Array<{ id: string; name: string }>;
    for (const t of types) {
      issueTypeMap[t.name] = t.id;
    }
  } catch {
    // Non-fatal — create-issue will fail with helpful error if types not found
    console.error("Warning: Could not discover issue types from Jira. The jira-create-issue tool may fail.");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err.message);
  process.exit(1);
});
