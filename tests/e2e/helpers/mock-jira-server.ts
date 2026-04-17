/**
 * Tiny HTTP server that mimics a subset of the Jira REST API. Used by E2E
 * tests to drive the real CLI scripts (`npx tsx scripts/*.ts`) against a
 * controllable backend without touching Atlassian Cloud.
 *
 * Only the routes exercised by the `--list` flow in create-epic-stories are
 * implemented — expand as more CLI scripts are brought under E2E.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface MockJiraServer {
  url: string;
  close(): Promise<void>;
}

interface FixtureIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string; id: string };
    labels?: string[];
    parent?: { key: string };
  };
}

const epics: FixtureIssue[] = [
  {
    key: "E2E-100",
    fields: {
      summary: "E2E Sample Epic",
      status: { name: "In Progress" },
      issuetype: { name: "Epic", id: "10001" },
      labels: ["vibe-code"],
    },
  },
];

const stories: FixtureIssue[] = [
  {
    key: "E2E-101",
    fields: {
      summary: "E2E Story One",
      status: { name: "To Do" },
      issuetype: { name: "Story", id: "10002" },
      parent: { key: "E2E-100" },
    },
  },
];

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function startMockJiraServer(): Promise<MockJiraServer> {
  const server = http.createServer(async (req, res) => {
    const url = req.url ?? "";
    const method = req.method ?? "GET";

    // CORS / content-type defaults
    res.setHeader("Content-Type", "application/json");

    if (method === "GET" && url.includes("/rest/api/3/myself")) {
      res.end(JSON.stringify({ accountId: "e2e", displayName: "E2E User" }));
      return;
    }

    if (method === "GET" && url.includes("/rest/api/3/issuetype")) {
      res.end(
        JSON.stringify([
          { id: "10001", name: "Epic", subtask: false },
          { id: "10002", name: "Story", subtask: false },
        ]),
      );
      return;
    }

    // Legacy GET /rest/api/3/search with jql=... in query string
    if (method === "GET" && url.startsWith("/rest/api/3/search?")) {
      const qs = new URL(`http://x${url}`).searchParams;
      const jql = decodeURIComponent(qs.get("jql") ?? "");
      const parentMatch = /parent\s*=\s*([A-Z]+-\d+)/.exec(jql);
      if (parentMatch) {
        const parentKey = parentMatch[1];
        const children = stories.filter((s) => s.fields.parent?.key === parentKey);
        res.end(JSON.stringify({ issues: children, total: children.length, isLast: true }));
        return;
      }
      // Otherwise return epics
      res.end(JSON.stringify({ issues: epics, total: epics.length, isLast: true }));
      return;
    }

    if (method === "POST" && url.includes("/rest/api/3/search/jql")) {
      const body = await readBody(req);
      const parsed = body ? (JSON.parse(body) as { jql?: string }) : {};
      const jql = parsed.jql ?? "";

      // Child story lookup: parent = EPIC-KEY
      const parentMatch = /parent\s*=\s*([A-Z]+-\d+)/.exec(jql);
      if (parentMatch) {
        const parentKey = parentMatch[1];
        const children = stories.filter(
          (s) => s.fields.parent?.key === parentKey,
        );
        res.end(JSON.stringify({ issues: children, total: children.length, isLast: true }));
        return;
      }

      // Epic list with vibe-code label
      res.end(JSON.stringify({ issues: epics, total: epics.length, isLast: true }));
      return;
    }

    // Fallback: 404
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `unhandled ${method} ${url}` }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
