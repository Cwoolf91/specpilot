import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SDKs *before* importing the module under test.
vi.mock("@anthropic-ai/sdk", () => import("../mocks/anthropic-sdk.js"));
vi.mock("@aws-sdk/client-bedrock-runtime", () =>
  import("../mocks/bedrock-sdk.js"),
);
vi.mock("@aws-sdk/credential-providers", () =>
  import("../mocks/bedrock-sdk.js"),
);

import { enhanceIssueWithAI } from "../../src/extension/ai/enhance-issue.js";
import {
  resetVscodeMock,
  setConfig,
  setSecret,
  setLmModels,
  CancellationTokenSource,
} from "../mocks/vscode.js";
import {
  queueAnthropicJson,
  resetAnthropicMock,
} from "../mocks/anthropic-sdk.js";
import {
  queueBedrockJson,
  queueBedrockError,
  queueBedrockText,
  resetBedrockMock,
} from "../mocks/bedrock-sdk.js";
import { VscodeCredentialProvider } from "../../src/extension/credentials.js";
import { getSecret, setSecret as setSec } from "../mocks/vscode.js";

function makeContext() {
  return {
    issueType: "Bug" as const,
    projectKey: "TEST",
    summary: "crash when clicking submit",
    description: "",
    selectedCode: "function onSubmit() { throw new Error('boom'); }",
    filePath: "src/app.ts",
    lineRange: "1-3",
    language: "typescript",
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

beforeEach(() => {
  resetVscodeMock();
  resetAnthropicMock();
  resetBedrockMock();
});

describe("enhanceIssueWithAI — provider auto chain", () => {
  it("prefers Bedrock when it returns a valid response", async () => {
    queueBedrockJson({
      summary: "Fix crash in submit handler",
      description: "Explains the bug.",
      acceptanceCriteria: [],
    });

    const tokenSource = new CancellationTokenSource();
    const result = await enhanceIssueWithAI(makeContext(), tokenSource.token);
    expect(result).toMatchObject({ summary: "Fix crash in submit handler" });
  });

  it("falls back to Anthropic when Bedrock errors", async () => {
    queueBedrockError(new Error("no aws credentials"));
    setSecret("specPilot.anthropicApiKey", "sk-mock");
    queueAnthropicJson({
      summary: "Via Anthropic",
      description: "Fallback path",
      acceptanceCriteria: [],
    });

    const tokenSource = new CancellationTokenSource();
    const result = await enhanceIssueWithAI(
      makeContext(),
      tokenSource.token,
      makeProvider(),
    );
    expect(result?.summary).toBe("Via Anthropic");
  });

  it("falls back to vscode.lm if Bedrock and Anthropic both fail", async () => {
    queueBedrockError(new Error("bedrock down"));
    // no anthropic key configured

    const lmResponseText = JSON.stringify({
      summary: "Via vscode.lm",
      description: "final fallback",
      acceptanceCriteria: [],
    });
    setLmModels([
      {
        id: "copilot-mock",
        sendRequest: async () => ({
          text: (async function* () {
            yield lmResponseText;
          })(),
        }),
      },
    ]);

    const tokenSource = new CancellationTokenSource();
    const result = await enhanceIssueWithAI(makeContext(), tokenSource.token);
    expect(result?.summary).toBe("Via vscode.lm");
  });

  it("returns null when every provider fails", async () => {
    queueBedrockError(new Error("bedrock down"));
    setLmModels([]);

    const tokenSource = new CancellationTokenSource();
    const result = await enhanceIssueWithAI(makeContext(), tokenSource.token);
    expect(result).toBeNull();
  });

  it("rejects non-JSON responses (returns null)", async () => {
    queueBedrockText("not json");
    setLmModels([]);
    const tokenSource = new CancellationTokenSource();
    const result = await enhanceIssueWithAI(makeContext(), tokenSource.token);
    expect(result).toBeNull();
  });

  it("rejects responses missing required shape", async () => {
    // Bedrock returns JSON but without required acceptanceCriteria field
    queueBedrockJson({ summary: "broken" });
    setLmModels([]);
    const tokenSource = new CancellationTokenSource();
    const result = await enhanceIssueWithAI(makeContext(), tokenSource.token);
    expect(result).toBeNull();
  });
});

describe("enhanceIssueWithAI — explicit provider selection", () => {
  it("uses bedrock only when provider=bedrock", async () => {
    setConfig("specPilot.ai.provider", "bedrock");
    queueBedrockJson({
      summary: "direct bedrock",
      description: "",
      acceptanceCriteria: [],
    });
    const tokenSource = new CancellationTokenSource();
    const result = await enhanceIssueWithAI(makeContext(), tokenSource.token);
    expect(result?.summary).toBe("direct bedrock");
  });

  it("returns null for provider=anthropic when no credProvider passed", async () => {
    setConfig("specPilot.ai.provider", "anthropic");
    const tokenSource = new CancellationTokenSource();
    const result = await enhanceIssueWithAI(makeContext(), tokenSource.token);
    expect(result).toBeNull();
  });
});

