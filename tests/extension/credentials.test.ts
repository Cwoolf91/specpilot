import { describe, it, expect, beforeEach } from "vitest";
import { VscodeCredentialProvider } from "../../src/extension/credentials.js";
import { resetVscodeMock, setSecret, getSecret } from "../mocks/vscode.js";
import { TEST_CREDENTIALS } from "../fixtures/jira.js";

function makeProvider() {
  // Build a SecretStorage-like object backed by the mock store
  const secrets = {
    get: async (k: string) => getSecret(k),
    store: async (k: string, v: string) => {
      setSecret(k, v);
    },
    delete: async (k: string) => {
      // delete via the shared mock state
      // (no dedicated helper is exported, but setSecret to empty-then-delete pattern isn't needed here)
    },
  } as unknown as import("vscode").SecretStorage;
  return new VscodeCredentialProvider(secrets);
}

beforeEach(() => {
  resetVscodeMock();
});

describe("VscodeCredentialProvider.getCredentials", () => {
  it("returns credentials stored in SecretStorage", async () => {
    setSecret("specPilot.baseUrl", TEST_CREDENTIALS.baseUrl);
    setSecret("specPilot.email", TEST_CREDENTIALS.email);
    setSecret("specPilot.apiToken", TEST_CREDENTIALS.apiToken);
    setSecret("specPilot.projectKey", TEST_CREDENTIALS.projectKey);

    const provider = makeProvider();
    const creds = await provider.getCredentials();
    expect(creds).toEqual(TEST_CREDENTIALS);
  });

  it("falls back to env vars when secrets are missing", async () => {
    process.env.JIRA_BASE_URL = "https://env.atlassian.net";
    process.env.JIRA_EMAIL = "env@example.com";
    process.env.JIRA_API_TOKEN = "env-token";
    process.env.JIRA_PROJECT_KEY = "ENV";

    const provider = makeProvider();
    const creds = await provider.getCredentials();
    expect(creds).toEqual({
      baseUrl: "https://env.atlassian.net",
      email: "env@example.com",
      apiToken: "env-token",
      projectKey: "ENV",
    });
  });

  it("throws when neither secrets nor env are configured", async () => {
    const provider = makeProvider();
    await expect(provider.getCredentials()).rejects.toThrow(
      /SpecPilot: Set Credentials/,
    );
  });
});

describe("storeCredentials", () => {
  it("writes every field into SecretStorage", async () => {
    const provider = makeProvider();
    await provider.storeCredentials(TEST_CREDENTIALS);
    expect(getSecret("specPilot.baseUrl")).toBe(TEST_CREDENTIALS.baseUrl);
    expect(getSecret("specPilot.email")).toBe(TEST_CREDENTIALS.email);
    expect(getSecret("specPilot.apiToken")).toBe(TEST_CREDENTIALS.apiToken);
    expect(getSecret("specPilot.projectKey")).toBe(TEST_CREDENTIALS.projectKey);
  });
});

describe("hasCredentials", () => {
  it("returns true when creds are configured", async () => {
    const provider = makeProvider();
    await provider.storeCredentials(TEST_CREDENTIALS);
    expect(await provider.hasCredentials()).toBe(true);
  });

  it("returns false when creds are missing", async () => {
    const provider = makeProvider();
    expect(await provider.hasCredentials()).toBe(false);
  });
});

describe("Anthropic API key", () => {
  it("reads from SecretStorage first", async () => {
    setSecret("specPilot.anthropicApiKey", "sk-secret-storage");
    process.env.ANTHROPIC_API_KEY = "sk-env";
    const provider = makeProvider();
    expect(await provider.getAnthropicApiKey()).toBe("sk-secret-storage");
  });

  it("falls back to env var if not in SecretStorage", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-env";
    const provider = makeProvider();
    expect(await provider.getAnthropicApiKey()).toBe("sk-env");
  });

  it("returns null when neither source has a value", async () => {
    const provider = makeProvider();
    expect(await provider.getAnthropicApiKey()).toBeNull();
  });

  it("hasAnthropicApiKey reflects presence", async () => {
    const provider = makeProvider();
    expect(await provider.hasAnthropicApiKey()).toBe(false);
    await provider.storeAnthropicApiKey("sk-stored");
    expect(await provider.hasAnthropicApiKey()).toBe(true);
  });
});
