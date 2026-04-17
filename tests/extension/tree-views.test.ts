import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";

import { VibeEpicsTreeProvider } from "../../src/extension/views/vibe-epics-tree.js";
import { SprintTreeProvider } from "../../src/extension/views/sprint-tree.js";
import { AutomationTreeProvider } from "../../src/extension/views/automation-tree.js";
import { SettingsTreeProvider } from "../../src/extension/views/settings-tree.js";
import { VscodeCredentialProvider } from "../../src/extension/credentials.js";

import {
  resetVscodeMock,
  setSecret,
  getSecret,
} from "../mocks/vscode.js";
import { TEST_CREDENTIALS, sampleEpic } from "../fixtures/jira.js";

function makeProvider(): VscodeCredentialProvider {
  const secrets = {
    get: async (k: string) => getSecret(k),
    store: async (k: string, v: string) => setSecret(k, v),
    delete: async () => {},
  } as unknown as import("vscode").SecretStorage;
  return new VscodeCredentialProvider(secrets);
}

function seedCreds(): void {
  setSecret("specPilot.baseUrl", TEST_CREDENTIALS.baseUrl);
  setSecret("specPilot.email", TEST_CREDENTIALS.email);
  setSecret("specPilot.apiToken", TEST_CREDENTIALS.apiToken);
  setSecret("specPilot.projectKey", TEST_CREDENTIALS.projectKey);
}

beforeEach(() => {
  resetVscodeMock();
});

describe("VibeEpicsTreeProvider", () => {
  it("returns configure hint when credentials are unset", async () => {
    const tree = new VibeEpicsTreeProvider(makeProvider());
    const items = await tree.getChildren();
    expect(items.length).toBe(1);
    // InfoItem has no contextValue
    expect((items[0] as { label?: string }).label).toMatch(/Set credentials/);
  });

  it("returns labeled epics from the store when present", async () => {
    seedCreds();
    const tree = new VibeEpicsTreeProvider(makeProvider());
    const items = await tree.getChildren();
    // sampleEpic has the vibe-code label — at least one EpicItem should be returned.
    expect(items.length).toBeGreaterThanOrEqual(1);
    const first = items[0] as { label?: string; contextValue?: string };
    expect(first.contextValue).toBe("epic");
    expect(first.label).toContain(sampleEpic.key);
  });

  it("refresh clears internal state", async () => {
    seedCreds();
    const tree = new VibeEpicsTreeProvider(makeProvider());
    await tree.getChildren(); // populate
    tree.refresh(); // should not throw, resets
    const next = await tree.getChildren();
    expect(Array.isArray(next)).toBe(true);
  });
});

describe("SprintTreeProvider", () => {
  it("returns empty when credentials are unset (swallowed)", async () => {
    const tree = new SprintTreeProvider(makeProvider());
    const items = await tree.getChildren();
    expect(items).toEqual([]);
  });

  it("returns status groups for the active sprint", async () => {
    seedCreds();
    const tree = new SprintTreeProvider(makeProvider());
    const items = await tree.getChildren();
    // The default MSW handler returns sampleBoards + active sprint; expect 3 groups.
    expect(items.length).toBe(3);
    const labels = items.map((i) => (i as { label?: string }).label ?? "");
    expect(labels.some((l) => l.startsWith("To Do"))).toBe(true);
    expect(labels.some((l) => l.startsWith("In Progress"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Done"))).toBe(true);
  });

  it("returns [] if no board is found", async () => {
    seedCreds();
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/agile/1.0/board`, () =>
        HttpResponse.json({ values: [] }),
      ),
    );
    const tree = new SprintTreeProvider(makeProvider());
    const items = await tree.getChildren();
    expect(items).toEqual([]);
  });
});

describe("AutomationTreeProvider", () => {
  it("returns sorted rules (enabled first) on success", async () => {
    seedCreds();
    const tree = new AutomationTreeProvider(makeProvider());
    const items = await tree.getChildren();
    // Two sample rules — enabled first.
    expect(items.length).toBeGreaterThanOrEqual(1);
    const first = items[0] as { contextValue?: string };
    expect(first.contextValue).toBe("ruleEnabled");
  });

  it("returns [] when credentials are unset (error path swallows)", async () => {
    const tree = new AutomationTreeProvider(makeProvider());
    const items = await tree.getChildren();
    expect(items).toEqual([]);
  });
});

describe("SettingsTreeProvider", () => {
  it("prompts to configure when credentials are missing", async () => {
    const tree = new SettingsTreeProvider(makeProvider());
    const items = await tree.getChildren();
    const labels = items.map((i) => (i as { label?: string }).label ?? "");
    expect(labels).toContain("Configure Credentials");
    expect(labels).toContain("Open Dashboard");
    expect(labels).toContain("Start MCP Server");
    expect(labels).toContain("Check for Updates");
  });

  it("shows connected baseUrl when credentials are present", async () => {
    seedCreds();
    const tree = new SettingsTreeProvider(makeProvider(), "1.2.3");
    const items = await tree.getChildren();
    const connection = items.find(
      (i) => (i as { label?: string }).label === "Jira Connection",
    ) as { description?: string } | undefined;
    expect(connection?.description).toBe("mock.atlassian.net");
    // Version row present
    const versionRow = items.find(
      (i) => (i as { description?: string }).description === "v1.2.3",
    );
    expect(versionRow).toBeTruthy();
  });

  it("Anthropic row toggles label based on key presence", async () => {
    seedCreds();
    const tree1 = new SettingsTreeProvider(makeProvider());
    const items1 = await tree1.getChildren();
    const a1 = items1.find(
      (i) => ((i as { label?: string }).label ?? "").includes("Anthropic"),
    ) as { label?: string } | undefined;
    expect(a1?.label).toBe("Set Anthropic API Key");

    setSecret("specPilot.anthropicApiKey", "sk-test");
    const tree2 = new SettingsTreeProvider(makeProvider());
    const items2 = await tree2.getChildren();
    const a2 = items2.find(
      (i) => ((i as { label?: string }).label ?? "").includes("Anthropic"),
    ) as { label?: string } | undefined;
    expect(a2?.label).toBe("Anthropic API Key");
  });
});
