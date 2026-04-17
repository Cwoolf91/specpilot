import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/sdk", () => import("../mocks/anthropic-sdk.js"));
vi.mock("@aws-sdk/client-bedrock-runtime", () =>
  import("../mocks/bedrock-sdk.js"),
);
vi.mock("@aws-sdk/credential-providers", () =>
  import("../mocks/bedrock-sdk.js"),
);

import {
  generateAnalysisWithAI,
  generateEpicStoriesWithAI,
} from "../../src/extension/ai/generate-analysis.js";
import {
  resetVscodeMock,
  setConfig,
  CancellationTokenSource,
} from "../mocks/vscode.js";
import { resetAnthropicMock } from "../mocks/anthropic-sdk.js";
import {
  queueBedrockJson,
  queueBedrockError,
  queueBedrockText,
  resetBedrockMock,
} from "../mocks/bedrock-sdk.js";

const validAnalysis = {
  summary: "Adds a /search page",
  epics: [
    {
      title: "Search",
      description: "Add search.",
      stories: [
        {
          title: "Build /search layout",
          description: "Layout the page",
          acceptanceCriteria: ["Given I navigate, Then I see input"],
          sourceFiles: ["apps/web/search.tsx"],
          screenshotRoutes: ["/search"],
        },
      ],
    },
  ],
  newDependencies: [],
  infrastructureNotes: [],
};

beforeEach(() => {
  resetVscodeMock();
  resetAnthropicMock();
  resetBedrockMock();
  // Pin provider to bedrock so we only exercise the streaming path that our mock supports.
  setConfig("specPilot.ai.provider", "bedrock");
});

describe("generateAnalysisWithAI (bedrock)", () => {
  it("returns parsed analysis when Bedrock streams valid JSON", async () => {
    queueBedrockJson(validAnalysis);
    const token = new CancellationTokenSource().token;
    const result = await generateAnalysisWithAI(
      {
        statSummary: " apps/web/search.tsx | 10 +",
        categories: { Pages: ["apps/web/search.tsx"] },
        routes: ["/search"],
      },
      token,
    );
    expect(result?.summary).toBe("Adds a /search page");
    expect(result?.epics[0].stories[0].title).toBe("Build /search layout");
  });

  it("returns null when Bedrock emits non-JSON text", async () => {
    queueBedrockText("not json at all");
    const token = new CancellationTokenSource().token;
    const result = await generateAnalysisWithAI(
      {
        statSummary: " apps/web/search.tsx | 10 +",
        categories: { Pages: ["apps/web/search.tsx"] },
        routes: ["/search"],
      },
      token,
    );
    expect(result).toBeNull();
  });

  it("returns null when Bedrock errors", async () => {
    queueBedrockError(new Error("bedrock offline"));
    const token = new CancellationTokenSource().token;
    const result = await generateAnalysisWithAI(
      {
        statSummary: " a | 1 +",
        categories: { Pages: ["a"] },
        routes: [],
      },
      token,
    );
    expect(result).toBeNull();
  });

  it("filters out epics that have no valid stories", async () => {
    queueBedrockJson({
      summary: "Mixed",
      epics: [
        { title: "Empty Epic", description: "", stories: [] },
        validAnalysis.epics[0],
      ],
      newDependencies: [],
      infrastructureNotes: [],
    });
    const token = new CancellationTokenSource().token;
    const result = await generateAnalysisWithAI(
      {
        statSummary: " a | 1 +",
        categories: { Pages: ["a"] },
        routes: [],
      },
      token,
    );
    expect(result?.epics).toHaveLength(1);
    expect(result?.epics[0].title).toBe("Search");
  });
});

describe("generateEpicStoriesWithAI (bedrock)", () => {
  it("returns epic breakdown when Bedrock streams valid JSON", async () => {
    queueBedrockJson(validAnalysis);
    const token = new CancellationTokenSource().token;
    const result = await generateEpicStoriesWithAI(
      {
        epicKey: "TEST-100",
        epicSummary: "Search",
        epicDescription: "Add search",
        existingStories: [],
      },
      token,
    );
    expect(result?.epics[0].stories[0].title).toBe("Build /search layout");
  });

  it("returns null when stream yields non-JSON", async () => {
    queueBedrockText("gibberish");
    const token = new CancellationTokenSource().token;
    const result = await generateEpicStoriesWithAI(
      {
        epicKey: "TEST-100",
        epicSummary: "Search",
        epicDescription: "",
        existingStories: [],
      },
      token,
    );
    expect(result).toBeNull();
  });
});
