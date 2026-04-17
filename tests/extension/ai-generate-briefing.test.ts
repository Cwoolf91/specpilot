import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/sdk", () => import("../mocks/anthropic-sdk.js"));
vi.mock("@aws-sdk/client-bedrock-runtime", () => import("../mocks/bedrock-sdk.js"));
vi.mock("@aws-sdk/credential-providers", () => import("../mocks/bedrock-sdk.js"));

import { generateBriefing } from "../../src/extension/ai/generate-briefing.js";
import {
  resetVscodeMock,
  setConfig,
  setSecret,
  setLmModels,
  CancellationTokenSource,
  getSecret,
  setSecret as setSec,
} from "../mocks/vscode.js";
import { queueAnthropicJson, resetAnthropicMock } from "../mocks/anthropic-sdk.js";
import {
  queueBedrockJson,
  queueBedrockError,
  queueBedrockText,
  resetBedrockMock,
} from "../mocks/bedrock-sdk.js";
import { VscodeCredentialProvider } from "../../src/extension/credentials.js";
import type { BriefingContext } from "../../src/core/types.js";

function makeContext(): BriefingContext {
  return {
    issueKey: "TEST-123",
    issueSummary: "Add search page",
    issueType: "Story",
    acceptanceCriteria: ["Given /search, when I type, then I see results."],
    description: "Implement a search page.",
    epicKey: "TEST-100",
    epicSummary: "Search Experience",
    similarStories: [
      {
        key: "TEST-90",
        summary: "Prior search prototype",
        description: "We built a prototype last quarter.",
      },
    ],
  };
}

function makeProvider(): VscodeCredentialProvider {
  const secrets = {
    get: async (k: string) => getSecret(k),
    store: async (k: string, v: string) => setSec(k, v),
    delete: async () => {},
  } as unknown as import("vscode").SecretStorage;
  return new VscodeCredentialProvider(secrets);
}

const validBriefing = {
  summary: "Build a /search page with typeahead.",
  filesToOpen: [
    { path: "apps/web/pages/search.tsx", line: 10, reason: "New page component." },
  ],
  starters: ["Start by scaffolding the route.", "Then wire the API."],
  similarStories: [
    { title: "TEST-90 Prior search prototype", url: "TEST-90", why: "Reuse the layout." },
  ],
  implications: ["Needs a loading state."],
  confidence: "high" as const,
};

beforeEach(() => {
  resetVscodeMock();
  resetAnthropicMock();
  resetBedrockMock();
});

describe("generateBriefing — provider auto chain", () => {
  it("prefers Bedrock when it returns a valid briefing", async () => {
    queueBedrockJson(validBriefing);
    const ts = new CancellationTokenSource();
    const result = await generateBriefing(makeContext(), ["apps/web/pages/search.tsx"], ts.token);
    expect(result).toMatchObject({
      issueKey: "TEST-123",
      summary: validBriefing.summary,
      confidence: "high",
    });
    expect(result?.filesToOpen).toHaveLength(1);
    expect(result?.filesToOpen[0].path).toBe("apps/web/pages/search.tsx");
  });

  it("falls back to Anthropic when Bedrock errors", async () => {
    queueBedrockError(new Error("no aws credentials"));
    setSecret("specPilot.anthropicApiKey", "sk-mock");
    queueAnthropicJson({ ...validBriefing, summary: "Via Anthropic" });

    const ts = new CancellationTokenSource();
    const result = await generateBriefing(makeContext(), [], ts.token, makeProvider());
    expect(result?.summary).toBe("Via Anthropic");
  });

  it("falls back to vscode.lm if Bedrock and Anthropic both fail", async () => {
    queueBedrockError(new Error("bedrock down"));
    const lmText = JSON.stringify({ ...validBriefing, summary: "Via vscode.lm" });
    setLmModels([
      {
        id: "copilot-mock",
        sendRequest: async () => ({
          text: (async function* () {
            yield lmText;
          })(),
        }),
      },
    ]);

    const ts = new CancellationTokenSource();
    const result = await generateBriefing(makeContext(), [], ts.token);
    expect(result?.summary).toBe("Via vscode.lm");
  });

  it("returns null when every provider fails", async () => {
    queueBedrockError(new Error("bedrock down"));
    setLmModels([]);
    const ts = new CancellationTokenSource();
    const result = await generateBriefing(makeContext(), [], ts.token);
    expect(result).toBeNull();
  });

  it("rejects non-JSON responses", async () => {
    queueBedrockText("not json at all");
    setLmModels([]);
    const ts = new CancellationTokenSource();
    const result = await generateBriefing(makeContext(), [], ts.token);
    expect(result).toBeNull();
  });

  it("normalizes missing optional fields and invalid confidence", async () => {
    queueBedrockJson({
      summary: "Minimal briefing",
      filesToOpen: [{ path: "a.ts" }], // missing reason/line
      starters: ["only one"],
      similarStories: [],
      implications: [],
      confidence: "bogus", // -> defaults to "medium"
    });
    const ts = new CancellationTokenSource();
    const result = await generateBriefing(makeContext(), [], ts.token);
    expect(result).toMatchObject({
      summary: "Minimal briefing",
      confidence: "medium",
    });
    expect(result?.filesToOpen[0]).toMatchObject({ path: "a.ts", reason: "" });
    expect(result?.filesToOpen[0].line).toBeUndefined();
  });

  it("rejects responses missing required 'summary' field", async () => {
    queueBedrockJson({
      filesToOpen: [],
      starters: [],
      similarStories: [],
      implications: [],
      confidence: "medium",
    });
    setLmModels([]);
    const ts = new CancellationTokenSource();
    const result = await generateBriefing(makeContext(), [], ts.token);
    expect(result).toBeNull();
  });
});

describe("generateBriefing — explicit provider selection", () => {
  it("uses bedrock only when provider=bedrock", async () => {
    setConfig("specPilot.ai.provider", "bedrock");
    queueBedrockJson(validBriefing);
    const ts = new CancellationTokenSource();
    const result = await generateBriefing(makeContext(), [], ts.token);
    expect(result?.summary).toBe(validBriefing.summary);
  });

  it("returns null for provider=anthropic when no credProvider passed", async () => {
    setConfig("specPilot.ai.provider", "anthropic");
    const ts = new CancellationTokenSource();
    const result = await generateBriefing(makeContext(), [], ts.token);
    expect(result).toBeNull();
  });
});
