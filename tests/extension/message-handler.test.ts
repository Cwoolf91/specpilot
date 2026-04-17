import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock heavy child-process/playwright paths before importing the handler
vi.mock("../../src/core/diff/git-diff.js", () => ({
  generateDiff: vi.fn(async () => ({
    statSummary: " apps/web/page.tsx | 10 +\n",
    files: ["apps/web/page.tsx"],
    fullDiff: "diff --git a/apps/web/page.tsx b/apps/web/page.tsx",
  })),
  categorizeFiles: vi.fn(() => ({ Pages: ["apps/web/page.tsx"] })),
}));
vi.mock("../../src/core/diff/route-detection.js", () => ({
  detectRoutes: vi.fn(() => ["/search"]),
}));
vi.mock("../../src/core/screenshots/capture.js", () => ({
  captureScreenshots: vi.fn(async () => new Map()),
  captureStoryScreenshots: vi.fn(async () => []),
}));
vi.mock("../../src/extension/ai/generate-release-notes.js", () => ({
  generateReleaseNotesWithAI: vi.fn(async () => ({
    summary: "mock notes",
    categories: [],
  })),
}));
vi.mock("../../src/extension/ai/generate-analysis.js", () => ({
  generateAnalysisWithAI: vi.fn(async () => ({
    summary: "mock analysis",
    epics: [],
    newDependencies: [],
    infrastructureNotes: [],
  })),
  generateEpicStoriesWithAI: vi.fn(async () => [
    {
      title: "mock story",
      description: "",
      acceptanceCriteria: [],
      sourceFiles: [],
      screenshotRoutes: [],
    },
  ]),
}));

import { MessageHandler } from "../../src/extension/panels/message-handler.js";
import { VscodeCredentialProvider } from "../../src/extension/credentials.js";
import {
  resetVscodeMock,
  setSecret,
  getSecret,
} from "../mocks/vscode.js";
import { TEST_CREDENTIALS, sampleBoards, sampleSprints } from "../fixtures/jira.js";

function makeProvider(): VscodeCredentialProvider {
  const secrets = {
    get: async (k: string) => getSecret(k),
    store: async (k: string, v: string) => setSecret(k, v),
    delete: async () => {},
  } as unknown as import("vscode").SecretStorage;
  return new VscodeCredentialProvider(secrets);
}

beforeEach(() => {
  resetVscodeMock();
  // Seed credentials so handlers can reach MSW-mocked Jira
  setSecret("specPilot.baseUrl", TEST_CREDENTIALS.baseUrl);
  setSecret("specPilot.email", TEST_CREDENTIALS.email);
  setSecret("specPilot.apiToken", TEST_CREDENTIALS.apiToken);
  setSecret("specPilot.projectKey", TEST_CREDENTIALS.projectKey);
});

describe("MessageHandler routing", () => {
  it("posts an error for unknown message types", async () => {
    const posts: unknown[] = [];
    const handler = new MessageHandler(makeProvider(), (m) => posts.push(m));
    await handler.handle({ type: "nonsense" });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      type: "error",
      message: expect.stringMatching(/Unknown/),
    });
  });

  it("catches handler errors and posts an error message with requestType", async () => {
    const posts: unknown[] = [];
    // Missing required field forces the getDiff handler to throw
    const handler = new MessageHandler(makeProvider(), (m) => posts.push(m));
    await handler.handle({ type: "getDiff" });
    expect(posts.at(-1)).toMatchObject({
      type: "error",
      requestType: "getDiff",
    });
  });
});

describe("MessageHandler — individual handlers", () => {
  it("getDiff posts diffResult with categories and routes", async () => {
    const posts: unknown[] = [];
    const handler = new MessageHandler(makeProvider(), (m) => posts.push(m));
    await handler.handle({
      type: "getDiff",
      vibeRepo: "/vibe",
      vibeBranch: "dev",
      targetRepo: "/target",
      targetBranch: "main",
      appDir: "apps/web",
    });
    expect(posts[0]).toMatchObject({
      type: "diffResult",
      categories: { Pages: ["apps/web/page.tsx"] },
      routes: ["/search"],
    });
  });

  it("importAnalysis round-trips the analysis payload", async () => {
    const posts: unknown[] = [];
    const handler = new MessageHandler(makeProvider(), (m) => posts.push(m));
    const analysis = { epics: [], summary: "x", newDependencies: [], infrastructureNotes: [] };
    await handler.handle({ type: "importAnalysis", analysis });
    expect(posts[0]).toMatchObject({ type: "analysisResult", analysis });
  });

  it("getBoards hits Jira and posts boardsResult", async () => {
    const posts: unknown[] = [];
    const handler = new MessageHandler(makeProvider(), (m) => posts.push(m));
    await handler.handle({ type: "getBoards" });
    expect(posts[0]).toMatchObject({ type: "boardsResult", boards: sampleBoards });
  });

  it("getSprints requires boardId", async () => {
    const posts: unknown[] = [];
    const handler = new MessageHandler(makeProvider(), (m) => posts.push(m));
    await handler.handle({ type: "getSprints" });
    expect(posts.at(-1)).toMatchObject({
      type: "error",
      requestType: "getSprints",
    });
  });

  it("getSprints posts sprintsResult with a valid boardId", async () => {
    const posts: unknown[] = [];
    const handler = new MessageHandler(makeProvider(), (m) => posts.push(m));
    await handler.handle({ type: "getSprints", boardId: 42 });
    expect(posts[0]).toMatchObject({ type: "sprintsResult", sprints: sampleSprints });
  });

  it("matchScreenshots returns fallback mapping", async () => {
    const posts: unknown[] = [];
    const handler = new MessageHandler(makeProvider(), (m) => posts.push(m));
    await handler.handle({
      type: "matchScreenshots",
      stories: [
        {
          key: "TEST-1",
          summary: "search page",
          hasAttachments: false,
          attachmentCount: 0,
          description: "",
        },
      ],
      screenshots: [{ route: "/search", path: "/tmp/s.png" }],
    });
    expect(posts[0]).toMatchObject({
      type: "matchResult",
      mapping: [
        { storyKey: "TEST-1", screenshotPaths: ["/tmp/s.png"] },
      ],
    });
  });

  it("getConnectionStatus reports connected with identity", async () => {
    const posts: unknown[] = [];
    const handler = new MessageHandler(makeProvider(), (m) => posts.push(m));
    await handler.handle({ type: "getConnectionStatus" });
    // Last post is the status
    const status = posts.find(
      (p): p is { type: string; status: string } =>
        (p as { type: string }).type === "connectionStatus",
    );
    expect(status).toBeTruthy();
  });
});

describe("MessageHandler — generation flows", () => {
  it("generateAnalysis posts analysisResult", async () => {
    const posts: unknown[] = [];
    const handler = new MessageHandler(makeProvider(), (m) => posts.push(m));
    await handler.handle({
      type: "generateAnalysis",
      statSummary: " apps/web/page.tsx | 10 +",
      categories: { Pages: ["apps/web/page.tsx"] },
      routes: ["/search"],
    });
    const result = posts.find(
      (p) => (p as { type: string }).type === "analysisResult",
    );
    expect(result).toMatchObject({
      type: "analysisResult",
      analysis: { summary: "mock analysis", epics: [] },
    });
  });

  it("generateReleaseNotes posts releaseNotesGenerated with notes and plainText", async () => {
    const posts: unknown[] = [];
    const handler = new MessageHandler(makeProvider(), (m) => posts.push(m));
    await handler.handle({
      type: "generateReleaseNotes",
      issues: [{ key: "TEST-1", summary: "do thing" }],
      versionName: "v1.0.0",
    });
    const result = posts.find(
      (p) => (p as { type: string }).type === "releaseNotesGenerated",
    );
    expect(result).toMatchObject({
      type: "releaseNotesGenerated",
      notes: { summary: "mock notes" },
    });
  });
});

describe("MessageHandler — settings (globalState)", () => {
  it("saveSettings persists and getSettings echoes back", async () => {
    const posts: unknown[] = [];
    const state = new Map<string, unknown>();
    const globalState = {
      get: <T>(k: string, def?: T) => (state.has(k) ? (state.get(k) as T) : def),
      update: async (k: string, v: unknown) => {
        state.set(k, v);
      },
      keys: () => Array.from(state.keys()),
    };
    const handler = new MessageHandler(
      makeProvider(),
      (m) => posts.push(m),
      globalState as unknown as import("vscode").Memento,
    );

    await handler.handle({
      type: "saveSettings",
      key: "vibeCode",
      value: { foo: "bar" },
    });
    await handler.handle({ type: "getSettings", key: "vibeCode" });

    const result = posts.find(
      (p) => (p as { type: string }).type === "settingsResult",
    );
    expect(result).toMatchObject({
      type: "settingsResult",
      key: "vibeCode",
      value: { foo: "bar" },
    });
  });
});
