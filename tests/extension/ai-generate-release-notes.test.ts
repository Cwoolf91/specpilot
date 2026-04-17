import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/sdk", () => import("../mocks/anthropic-sdk.js"));
vi.mock("@aws-sdk/client-bedrock-runtime", () =>
  import("../mocks/bedrock-sdk.js"),
);
vi.mock("@aws-sdk/credential-providers", () =>
  import("../mocks/bedrock-sdk.js"),
);

import { generateReleaseNotesWithAI } from "../../src/extension/ai/generate-release-notes.js";
import {
  resetVscodeMock,
  setConfig,
  setLmModels,
  setSecret,
  getSecret,
  CancellationTokenSource,
} from "../mocks/vscode.js";
import {
  queueAnthropicJson,
  resetAnthropicMock,
} from "../mocks/anthropic-sdk.js";
import {
  queueBedrockJson,
  queueBedrockError,
  resetBedrockMock,
} from "../mocks/bedrock-sdk.js";
import { VscodeCredentialProvider } from "../../src/extension/credentials.js";

function makeProvider(): VscodeCredentialProvider {
  const secrets = {
    get: async (k: string) => getSecret(k),
    store: async (k: string, v: string) => setSecret(k, v),
    delete: async () => {},
  } as unknown as import("vscode").SecretStorage;
  return new VscodeCredentialProvider(secrets);
}

function makeContext() {
  return {
    issues: [
      { key: "TEST-1", summary: "Fix login", type: "Bug" },
      { key: "TEST-2", summary: "Add search", type: "Story" },
    ],
    versionName: "v1.0.0",
  };
}

const validPayload = {
  summary: "Release notes summary",
  categories: [
    {
      name: "Features",
      items: [{ key: "TEST-2", summary: "Improved search experience" }],
    },
  ],
};

beforeEach(() => {
  resetVscodeMock();
  resetAnthropicMock();
  resetBedrockMock();
});

describe("generateReleaseNotesWithAI", () => {
  it("returns notes from Bedrock in auto mode", async () => {
    queueBedrockJson(validPayload);
    const token = new CancellationTokenSource().token;
    const result = await generateReleaseNotesWithAI(makeContext(), token);
    expect(result?.summary).toBe("Release notes summary");
    expect(result?.categories[0].items[0].key).toBe("TEST-2");
  });

  it("falls back to Anthropic when Bedrock errors", async () => {
    queueBedrockError(new Error("bedrock down"));
    setSecret("specPilot.anthropicApiKey", "sk-mock");
    queueAnthropicJson(validPayload);
    const token = new CancellationTokenSource().token;
    const result = await generateReleaseNotesWithAI(makeContext(), token, makeProvider());
    expect(result?.summary).toBe("Release notes summary");
  });

  it("rejects responses missing valid categories", async () => {
    queueBedrockJson({ summary: "x", categories: [] });
    setLmModels([]);
    const token = new CancellationTokenSource().token;
    const result = await generateReleaseNotesWithAI(makeContext(), token);
    expect(result).toBeNull();
  });

  it("returns null when no provider succeeds", async () => {
    queueBedrockError(new Error("no creds"));
    setLmModels([]);
    const token = new CancellationTokenSource().token;
    const result = await generateReleaseNotesWithAI(makeContext(), token);
    expect(result).toBeNull();
  });

  it("honors explicit provider=anthropic", async () => {
    setConfig("specPilot.ai.provider", "anthropic");
    setSecret("specPilot.anthropicApiKey", "sk-mock");
    queueAnthropicJson(validPayload);
    const token = new CancellationTokenSource().token;
    const result = await generateReleaseNotesWithAI(makeContext(), token, makeProvider());
    expect(result?.summary).toBe("Release notes summary");
  });

  it("returns null for explicit provider=anthropic with no credProvider", async () => {
    setConfig("specPilot.ai.provider", "anthropic");
    const token = new CancellationTokenSource().token;
    const result = await generateReleaseNotesWithAI(makeContext(), token);
    expect(result).toBeNull();
  });
});
