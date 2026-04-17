/**
 * MSW handlers that mock the Jira Cloud REST, Agile, Automation, and Confluence
 * APIs. Responses use shapes from tests/fixtures/jira.ts to keep test inputs
 * consistent across suites. Handlers mutate an in-memory store so create/update
 * flows can be verified end-to-end.
 */
import { http, HttpResponse } from "msw";
import {
  TEST_CREDENTIALS,
  cloudIdResponse,
  myselfResponse,
  issueTypesResponse,
  projectsResponse,
  sampleEpic,
  sampleStories,
  sampleSprints,
  sampleBoards,
  sampleVersions,
  sampleAutomationRules,
} from "../../fixtures/jira.js";
import type { JiraIssue } from "../../../src/core/types.js";

const BASE = TEST_CREDENTIALS.baseUrl;
const CLOUD_ID = cloudIdResponse.cloudId;

// ---------------------------------------------------------------------------
// Mutable in-memory store
// ---------------------------------------------------------------------------

interface Store {
  issues: Map<string, JiraIssue>;
  issueLinks: Array<{
    type: string;
    inward: string;
    outward: string;
  }>;
  sprintAssignments: Map<string, string[]>; // sprintId -> issue keys
  attachments: Map<string, string[]>; // issue key -> filenames
  versions: Map<string, { description?: string; released?: boolean }>;
  confluencePages: Map<string, { id: string; title: string; version: number }>;
  nextIssueNumber: number;
  nextConfluencePageId: number;
}

const initialState = (): Store => {
  const issues = new Map<string, JiraIssue>();
  issues.set(sampleEpic.key, sampleEpic);
  for (const s of sampleStories) issues.set(s.key, s);

  const versions = new Map<string, { description?: string; released?: boolean }>();
  for (const v of sampleVersions) {
    versions.set(v.id, { description: v.description, released: v.released });
  }

  return {
    issues,
    issueLinks: [],
    sprintAssignments: new Map(),
    attachments: new Map(),
    versions,
    confluencePages: new Map(),
    nextIssueNumber: 200,
    nextConfluencePageId: 3_000_000,
  };
};

let store: Store = initialState();

export function resetJiraStore(): void {
  store = initialState();
}

export function getJiraStore(): Store {
  return store;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const jiraHandlers = [
  // ------------ Cloud ID ------------
  http.get(`${BASE}/_edge/tenant_info`, () => HttpResponse.json(cloudIdResponse)),

  // ------------ Identity ------------
  http.get(`${BASE}/rest/api/3/myself`, () => HttpResponse.json(myselfResponse)),

  // ------------ Issue types / projects ------------
  http.get(`${BASE}/rest/api/3/issuetype`, () => HttpResponse.json(issueTypesResponse)),
  http.get(`${BASE}/rest/api/3/project`, () => HttpResponse.json(projectsResponse)),
  http.get(`${BASE}/rest/api/3/project/search`, () =>
    HttpResponse.json({ values: projectsResponse, total: projectsResponse.length }),
  ),

  // ------------ Search (POST new JQL endpoint) ------------
  http.post(`${BASE}/rest/api/3/search/jql`, async ({ request }) => {
    const body = (await request.json()) as { jql: string; fields?: string[]; maxResults?: number };
    const jql = body.jql || "";

    let matches = [...store.issues.values()];

    const parentMatch = /parent\s*=\s*([A-Z]+-\d+)/i.exec(jql);
    if (parentMatch) {
      matches = matches.filter(
        (i) => (i.fields as { parent?: { key: string } }).parent?.key === parentMatch[1],
      );
    }

    const labelMatch = /labels\s*=\s*"([^"]+)"/i.exec(jql);
    if (labelMatch) {
      matches = matches.filter((i) =>
        ((i.fields as { labels?: string[] }).labels ?? []).includes(labelMatch[1]),
      );
    }

    if (/issuetype\s*=\s*Epic/i.test(jql)) {
      matches = matches.filter((i) => i.fields.issuetype?.name === "Epic");
    }

    return HttpResponse.json({ issues: matches, total: matches.length, isLast: true });
  }),

  // ------------ Search (legacy GET) ------------
  http.get(`${BASE}/rest/api/3/search`, ({ request }) => {
    const url = new URL(request.url);
    const jql = decodeURIComponent(url.searchParams.get("jql") || "");

    let matches = [...store.issues.values()];
    const labelMatch = /labels\s*=\s*"([^"]+)"/i.exec(jql);
    if (labelMatch) {
      matches = matches.filter((i) =>
        ((i.fields as { labels?: string[] }).labels ?? []).includes(labelMatch[1]),
      );
    }
    const projectMatch = /project\s*=\s*"([^"]+)"/i.exec(jql);
    if (projectMatch) {
      matches = matches.filter((i) => i.key.startsWith(projectMatch[1] + "-"));
    }

    return HttpResponse.json({ issues: matches, total: matches.length, isLast: true });
  }),

  // ------------ Issue CRUD ------------
  http.get(`${BASE}/rest/api/3/issue/:key`, ({ params }) => {
    const key = String(params.key);
    const issue = store.issues.get(key);
    if (!issue) return new HttpResponse(`Issue ${key} not found`, { status: 404 });
    return HttpResponse.json(issue);
  }),

  http.post(`${BASE}/rest/api/3/issue`, async ({ request }) => {
    const body = (await request.json()) as {
      fields: {
        project: { key: string };
        issuetype: { id: string };
        summary: string;
        description?: unknown;
        parent?: { key: string };
        labels?: string[];
      };
    };
    const projectKey = body.fields.project.key;
    const newKey = `${projectKey}-${store.nextIssueNumber++}`;
    const typeName =
      issueTypesResponse.find((t) => t.id === body.fields.issuetype.id)?.name ?? "Story";

    const issue: JiraIssue = {
      key: newKey,
      fields: {
        summary: body.fields.summary,
        status: { name: "To Do" },
        issuetype: { name: typeName, id: body.fields.issuetype.id },
        ...(body.fields.description ? { description: body.fields.description } : {}),
        ...(body.fields.parent ? { parent: body.fields.parent } : {}),
        ...(body.fields.labels ? { labels: body.fields.labels } : {}),
      } as JiraIssue["fields"],
    };
    store.issues.set(newKey, issue);
    return HttpResponse.json({ id: String(store.nextIssueNumber), key: newKey });
  }),

  http.post(`${BASE}/rest/api/3/issueLink`, async ({ request }) => {
    const body = (await request.json()) as {
      type: { name: string };
      inwardIssue: { key: string };
      outwardIssue: { key: string };
    };
    store.issueLinks.push({
      type: body.type.name,
      inward: body.inwardIssue.key,
      outward: body.outwardIssue.key,
    });
    return new HttpResponse(null, { status: 201 });
  }),

  // ------------ Attachments ------------
  http.post(`${BASE}/rest/api/3/issue/:key/attachments`, async ({ params, request }) => {
    const key = String(params.key);
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return new HttpResponse("Invalid content type", { status: 400 });
    }
    const form = await request.formData();
    const file = form.get("file");
    const name =
      file && typeof file === "object" && "name" in file
        ? (file as { name: string }).name
        : "unknown";
    const list = store.attachments.get(key) ?? [];
    list.push(name);
    store.attachments.set(key, list);
    return HttpResponse.json([{ filename: name, id: `att-${list.length}` }]);
  }),

  // ------------ Agile: boards & sprints ------------
  http.get(`${BASE}/rest/agile/1.0/board`, () =>
    HttpResponse.json({ values: sampleBoards, total: sampleBoards.length, isLast: true }),
  ),

  http.get(`${BASE}/rest/agile/1.0/board/:id/sprint`, () =>
    HttpResponse.json({ values: sampleSprints, total: sampleSprints.length, isLast: true }),
  ),

  http.get(`${BASE}/rest/agile/1.0/sprint/:id/issue`, ({ params }) => {
    const sprintId = String(params.id);
    const keys = store.sprintAssignments.get(sprintId) ?? [];
    return HttpResponse.json({ issues: [], total: keys.length, isLast: true });
  }),

  http.post(`${BASE}/rest/agile/1.0/sprint/:id/issue`, async ({ params, request }) => {
    const sprintId = String(params.id);
    const body = (await request.json()) as { issues: string[] };
    const existing = store.sprintAssignments.get(sprintId) ?? [];
    store.sprintAssignments.set(sprintId, [...existing, ...body.issues]);
    return new HttpResponse(null, { status: 204 });
  }),

  // ------------ Versions ------------
  http.get(`${BASE}/rest/api/3/project/:key/version`, ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("query") || "";
    const filtered = sampleVersions.filter((v) => !query || v.name.includes(query));
    return HttpResponse.json({ values: filtered, total: filtered.length, isLast: true });
  }),

  http.get(`${BASE}/rest/api/3/project/:key/versions`, () =>
    HttpResponse.json(sampleVersions),
  ),

  http.put(`${BASE}/rest/api/3/version/:id`, async ({ params, request }) => {
    const id = String(params.id);
    const body = (await request.json()) as { description?: string; released?: boolean };
    const current = store.versions.get(id) ?? {};
    store.versions.set(id, { ...current, ...body });
    return HttpResponse.json({ id, ...current, ...body });
  }),

  // ------------ Automation API ------------
  http.get(
    `https://api.atlassian.com/automation/public/jira/${CLOUD_ID}/rest/v1/rule/summary`,
    () => HttpResponse.json({ data: sampleAutomationRules, links: {} }),
  ),

  http.get(
    `https://api.atlassian.com/automation/public/jira/${CLOUD_ID}/rest/v1/rule/:uuid`,
    ({ params }) => {
      const uuid = String(params.uuid);
      const rule = sampleAutomationRules.find((r) => r.uuid === uuid);
      if (!rule) return new HttpResponse(null, { status: 404 });
      return HttpResponse.json(rule);
    },
  ),

  // ------------ Confluence (v2) ------------
  http.get(`${BASE}/wiki/api/v2/pages`, ({ request }) => {
    const url = new URL(request.url);
    const title = url.searchParams.get("title") || "";
    const results = [...store.confluencePages.values()].filter(
      (p) => !title || p.title === title,
    );
    return HttpResponse.json({ results });
  }),

  http.post(`${BASE}/wiki/api/v2/pages`, async ({ request }) => {
    const body = (await request.json()) as { title: string };
    const id = String(store.nextConfluencePageId++);
    const page = { id, title: body.title, version: 1 };
    store.confluencePages.set(id, page);
    return HttpResponse.json({
      id,
      title: body.title,
      _links: { webui: `/spaces/PT1/pages/${id}` },
    });
  }),

  http.put(`${BASE}/wiki/api/v2/pages/:id`, async ({ params, request }) => {
    const id = String(params.id);
    const body = (await request.json()) as {
      title: string;
      version: { number: number };
    };
    const page = store.confluencePages.get(id) ?? { id, title: body.title, version: 1 };
    page.version = body.version.number;
    page.title = body.title;
    store.confluencePages.set(id, page);
    return HttpResponse.json({
      id,
      title: body.title,
      _links: { webui: `/spaces/PT1/pages/${id}` },
    });
  }),

  http.get(`${BASE}/wiki/api/v2/spaces`, () =>
    HttpResponse.json({ results: [{ id: "space-123", key: "PT1" }] }),
  ),
];
