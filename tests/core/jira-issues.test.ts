import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import {
  fetchEpicStories,
  fetchVibeCodeEpics,
  fetchEpicDetails,
  createStoriesForExistingEpic,
  buildEpicDescription,
  buildStoryDescription,
  createJiraTickets,
} from "../../src/core/jira/issues.js";
import { server } from "../msw/server.js";
import { makeTestClient } from "../fixtures/jira-client.js";
import {
  TEST_CREDENTIALS,
  sampleEpic,
  sampleAiAnalysis,
} from "../fixtures/jira.js";
import { getJiraStore } from "../msw/handlers/jira.js";
import type { ProgressReporter } from "../../src/core/progress.js";
import type { StoryPlan } from "../../src/core/types.js";

function makeProgress(): ProgressReporter & { logs: string[]; warns: string[]; errors: string[] } {
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    warns,
    errors,
    report: (m: string) => logs.push(m),
    section: (m: string) => logs.push(`[section] ${m}`),
    warn: (m: string) => warns.push(m),
    error: (m: string) => errors.push(m),
  };
}

describe("fetchEpicStories", () => {
  it("returns stories matching the parent epic", async () => {
    const client = makeTestClient();
    const stories = await fetchEpicStories(client, sampleEpic.key);
    expect(stories.map((s) => s.key)).toEqual(["TEST-101", "TEST-102"]);
    expect(stories[0]).toMatchObject({
      summary: "Implement search page layout",
      hasAttachments: false,
      attachmentCount: 0,
    });
  });

  it("rejects malformed issue keys", async () => {
    const client = makeTestClient();
    await expect(fetchEpicStories(client, "bad key")).rejects.toThrow(/Invalid/);
  });
});

describe("fetchVibeCodeEpics", () => {
  it("returns epics with their stories", async () => {
    const client = makeTestClient();
    const results = await fetchVibeCodeEpics(client);
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("TEST-100");
    expect(results[0].stories.map((s) => s.key)).toEqual([
      "TEST-101",
      "TEST-102",
    ]);
  });
});

describe("fetchEpicDetails", () => {
  it("fetches epic fields and attached stories", async () => {
    const client = makeTestClient();
    const details = await fetchEpicDetails(client, sampleEpic.key);
    expect(details).toMatchObject({
      key: "TEST-100",
      summary: sampleEpic.fields.summary,
      status: "In Progress",
      labels: ["vibe-code"],
    });
    expect(details.stories).toHaveLength(2);
  });
});

describe("buildEpicDescription", () => {
  it("includes prototype reference, stories, deps, and infra notes", () => {
    const epic = sampleAiAnalysis.epics[0];
    const doc = buildEpicDescription(epic, "/repo", "dev", "apps/web", sampleAiAnalysis);
    const flattened = JSON.stringify(doc);
    expect(flattened).toContain("Prototype Reference");
    expect(flattened).toContain("/repo");
    expect(flattened).toContain("dev");
    expect(flattened).toContain("apps/web");
    expect(flattened).toContain("Stories");
    expect(flattened).toContain(epic.stories[0].title);
    expect(flattened).toContain("Infrastructure Notes");
    expect(flattened).toContain("New Dependencies");
  });

  it("omits infra/deps sections when empty", () => {
    const epic = sampleAiAnalysis.epics[0];
    const doc = buildEpicDescription(epic, "/repo", "dev", ".", {
      ...sampleAiAnalysis,
      infrastructureNotes: [],
      newDependencies: [],
    });
    const flattened = JSON.stringify(doc);
    expect(flattened).not.toContain("Infrastructure Notes");
    expect(flattened).not.toContain("New Dependencies");
  });
});

describe("buildStoryDescription", () => {
  it("includes AC, prototype reference, and source files", () => {
    const story = sampleAiAnalysis.epics[0].stories[0];
    const doc = buildStoryDescription(story, "/repo", "dev");
    const flattened = JSON.stringify(doc);
    expect(flattened).toContain("Acceptance Criteria");
    expect(flattened).toContain(story.acceptanceCriteria[0]);
    expect(flattened).toContain("Prototype Reference");
    expect(flattened).toContain(story.sourceFiles[0]);
  });

  it("mentions screenshots if any routes are specified", () => {
    const story = sampleAiAnalysis.epics[0].stories[0];
    const doc = buildStoryDescription(story, "/repo", "dev");
    expect(JSON.stringify(doc)).toContain("See attached screenshots");
  });

  it("omits screenshot note when screenshotRoutes is empty", () => {
    const story = sampleAiAnalysis.epics[0].stories[1];
    const doc = buildStoryDescription(story, "/repo", "dev");
    expect(JSON.stringify(doc)).not.toContain("See attached screenshots");
  });
});

describe("createStoriesForExistingEpic (dry run)", () => {
  it("produces dry-run keys without any HTTP calls for creation", async () => {
    let issueCreates = 0;
    server.use(
      http.post(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/issue`, () => {
        issueCreates++;
        return HttpResponse.json({ key: "SHOULDNT-HAPPEN" });
      }),
    );
    const client = makeTestClient();
    const stories: StoryPlan[] = [
      {
        title: "a",
        description: "",
        acceptanceCriteria: [],
        sourceFiles: [],
        screenshotRoutes: [],
      },
      {
        title: "b",
        description: "",
        acceptanceCriteria: [],
        sourceFiles: [],
        screenshotRoutes: [],
      },
    ];
    const progress = makeProgress();
    const keys = await createStoriesForExistingEpic(
      client,
      "TEST-100",
      stories,
      { projectKey: "TEST", dryRun: true },
      "/repo",
      "dev",
      progress,
      { Story: "10002" },
    );
    expect(keys).toEqual(["TEST-DRY1", "TEST-DRY2"]);
    expect(issueCreates).toBe(0);
  });
});

describe("createStoriesForExistingEpic (real creation)", () => {
  it("creates stories, links dependencies, and assigns to sprint", async () => {
    const client = makeTestClient();
    const stories: StoryPlan[] = [
      {
        title: "Story A",
        description: "",
        acceptanceCriteria: [],
        sourceFiles: [],
        screenshotRoutes: [],
      },
      {
        title: "Story B",
        description: "",
        acceptanceCriteria: [],
        sourceFiles: [],
        screenshotRoutes: [],
        dependsOn: [0],
      },
    ];
    const progress = makeProgress();
    const keys = await createStoriesForExistingEpic(
      client,
      "TEST-100",
      stories,
      { projectKey: "TEST", sprintId: "1001", dryRun: false },
      "/repo",
      "dev",
      progress,
      { Story: "10002" },
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^TEST-\d+$/);

    const store = getJiraStore();
    expect(store.issueLinks).toContainEqual(
      expect.objectContaining({
        type: "Blocks",
        inward: keys[1],
        outward: keys[0],
      }),
    );
    expect(store.sprintAssignments.get("1001")).toEqual(
      expect.arrayContaining(keys),
    );
  });
});

describe("createJiraTickets", () => {
  it("creates epic + stories + dependency links", async () => {
    const client = makeTestClient();
    const progress = makeProgress();
    const allKeys = await createJiraTickets(
      client,
      sampleAiAnalysis,
      new Map(),
      { projectKey: "TEST", dryRun: false },
      "/repo",
      "dev",
      "apps/web",
      progress,
      { Epic: "10001", Story: "10002" },
    );
    // 1 epic + 2 stories
    expect(allKeys).toHaveLength(3);
    const store = getJiraStore();
    // Second story depends on first
    expect(store.issueLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("continues when an epic create fails", async () => {
    let firstCall = true;
    server.use(
      http.post(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/issue`, () => {
        if (firstCall) {
          firstCall = false;
          return new HttpResponse("boom", { status: 500 });
        }
        return HttpResponse.json({ key: "TEST-999" });
      }),
    );
    const client = makeTestClient();
    const progress = makeProgress();
    const allKeys = await createJiraTickets(
      client,
      sampleAiAnalysis,
      new Map(),
      { projectKey: "TEST", dryRun: false },
      "/repo",
      "dev",
      "apps/web",
      progress,
      { Epic: "10001", Story: "10002" },
    );
    expect(progress.errors.some((e) => /FAILED to create epic/i.test(e))).toBe(
      true,
    );
    expect(allKeys).toEqual([]);
  });
});
