/**
 * Canonical Jira API response fixtures used across MSW handlers and
 * direct-stub tests. Keep shapes aligned with src/core/types.ts.
 */
import type {
  JiraIssue,
  JiraBoard,
  Sprint,
  JiraVersion,
  RuleSummary,
  AiAnalysis,
  ReleaseNotesResult,
} from "../../src/core/types.js";

export const TEST_CREDENTIALS = {
  baseUrl: "https://mock.atlassian.net",
  email: "dev@example.com",
  apiToken: "mock-token-xyz",
  projectKey: "TEST",
} as const;

export const myselfResponse = {
  accountId: "mock-account-id",
  displayName: "Mock Dev",
  emailAddress: "dev@example.com",
} as const;

export const cloudIdResponse = {
  cloudId: "mock-cloud-id-00000000-0000-0000-0000-000000000000",
  cloudName: "mock",
} as const;

export const issueTypesResponse: Array<{ id: string; name: string; subtask: boolean }> = [
  { id: "10001", name: "Epic", subtask: false },
  { id: "10002", name: "Story", subtask: false },
  { id: "10014", name: "Bug", subtask: false },
  { id: "10003", name: "Task", subtask: false },
  { id: "10004", name: "Sub-task", subtask: true },
];

export const projectsResponse: Array<{ key: string; name: string }> = [
  { key: "TEST", name: "Test Project" },
  { key: "DEMO", name: "Demo Project" },
];

export function makeIssue(overrides: Partial<JiraIssue["fields"]> & { key: string }): JiraIssue {
  const { key, ...fields } = overrides;
  return {
    key,
    fields: {
      summary: "Sample issue",
      status: { name: "To Do" },
      issuetype: { name: "Story", id: "10002" },
      ...fields,
    },
  };
}

export const sampleEpic = makeIssue({
  key: "TEST-100",
  summary: "Sample Vibe Code Epic",
  issuetype: { name: "Epic", id: "10001" },
  status: { name: "In Progress" },
  labels: ["vibe-code"],
});

export const sampleStories: JiraIssue[] = [
  makeIssue({
    key: "TEST-101",
    summary: "Implement search page layout",
    status: { name: "To Do" },
    parent: { key: "TEST-100", fields: { summary: sampleEpic.fields.summary } },
  }),
  makeIssue({
    key: "TEST-102",
    summary: "Wire search API",
    status: { name: "In Progress" },
    parent: { key: "TEST-100", fields: { summary: sampleEpic.fields.summary } },
  }),
];

export const sampleSprints: Sprint[] = [
  { id: 1001, name: "Sprint 1", state: "active", startDate: "2026-04-01", endDate: "2026-04-14" },
  { id: 1002, name: "Sprint 2", state: "future" },
];

export const sampleBoards: JiraBoard[] = [
  { id: 42, name: "TEST Board" },
];

export const sampleVersions: JiraVersion[] = [
  { id: "10100", name: "v1.0.0", released: false, description: "First release" },
  { id: "10101", name: "v1.1.0", released: false },
];

export const sampleAutomationRules: RuleSummary[] = [
  {
    id: 1,
    uuid: "11111111-1111-1111-1111-111111111111",
    name: "Auto-assign new stories",
    state: "ENABLED",
    trigger: { component: "TRIGGER", type: "jira.issue.created" },
    projects: [{ projectKey: "TEST" }],
  },
  {
    id: 2,
    uuid: "22222222-2222-2222-2222-222222222222",
    name: "Archive old bugs",
    state: "DISABLED",
  },
];

export const sampleAiAnalysis: AiAnalysis = {
  summary: "Adds a /search page with typeahead and API wiring.",
  epics: [
    {
      title: "Search Experience",
      description: "## Problem / Why\n\nUsers cannot find products efficiently.",
      stories: [
        {
          title: "Build /search page layout",
          description: "## Story\n\nAs a user, I want a search page so that I can find products.",
          acceptanceCriteria: [
            "Given I navigate to /search, when the page loads, then I see a centered input.",
          ],
          sourceFiles: ["apps/web/pages/search.tsx"],
          screenshotRoutes: ["/search"],
        },
        {
          title: "Wire search API",
          description: "## Story\n\nAs a user, I want live results so that I find items quickly.",
          acceptanceCriteria: [
            "Given I type 3+ chars, when typing pauses 300ms, then results update.",
          ],
          sourceFiles: ["apps/web/pages/api/search.ts"],
          screenshotRoutes: [],
          dependsOn: [0],
        },
      ],
    },
  ],
  newDependencies: ["react-query"],
  infrastructureNotes: ["Requires new /api/search route"],
};

export const sampleReleaseNotes: ReleaseNotesResult = {
  summary: "v1.0.0 introduces a redesigned search experience and smaller quality-of-life improvements.",
  categories: [
    {
      name: "New Features",
      items: [
        { key: "TEST-101", summary: "Search page layout" },
        { key: "TEST-102", summary: "Live search API" },
      ],
    },
    {
      name: "Improvements",
      items: [{ key: "TEST-103", summary: "Faster page load" }],
    },
  ],
};
