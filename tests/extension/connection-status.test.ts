import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";

import { ConnectionStatusBar } from "../../src/extension/statusbar/connection-status.js";
import { VscodeCredentialProvider } from "../../src/extension/credentials.js";
import {
  resetVscodeMock,
  setSecret,
  getSecret,
  window as vscodeWindow,
} from "../mocks/vscode.js";
import { TEST_CREDENTIALS } from "../fixtures/jira.js";

function makeProvider(): VscodeCredentialProvider {
  const secrets = {
    get: async (k: string) => getSecret(k),
    store: async (k: string, v: string) => setSecret(k, v),
    delete: async () => {},
  } as unknown as import("vscode").SecretStorage;
  return new VscodeCredentialProvider(secrets);
}

function getStatusBarItem(): {
  text: string;
  tooltip?: string;
  command?: string;
} {
  const spy = vscodeWindow.createStatusBarItem as unknown as {
    mock: { results: { value: unknown }[] };
  };
  const last = spy.mock.results[spy.mock.results.length - 1]?.value as {
    text: string;
    tooltip?: string;
    command?: string;
  };
  return last;
}

beforeEach(() => {
  resetVscodeMock();
});

describe("ConnectionStatusBar", () => {
  it("shows connected state with user name on success", async () => {
    setSecret("specPilot.baseUrl", TEST_CREDENTIALS.baseUrl);
    setSecret("specPilot.email", TEST_CREDENTIALS.email);
    setSecret("specPilot.apiToken", TEST_CREDENTIALS.apiToken);
    setSecret("specPilot.projectKey", TEST_CREDENTIALS.projectKey);

    const bar = new ConnectionStatusBar(makeProvider());
    await bar.refresh();

    const item = getStatusBarItem();
    expect(item.text).toContain("SpecPilot");
    expect(item.text).toContain("check");
    expect(item.tooltip).toMatch(/Connected as/);

    bar.dispose();
  });

  it("shows key icon and configure command when credentials missing", async () => {
    const bar = new ConnectionStatusBar(makeProvider());
    await bar.refresh();

    const item = getStatusBarItem();
    expect(item.text).toContain("$(key)");
    expect(item.command).toBe("specPilot.setCredentials");

    bar.dispose();
  });

  it("shows error icon when the Jira call fails", async () => {
    setSecret("specPilot.baseUrl", TEST_CREDENTIALS.baseUrl);
    setSecret("specPilot.email", TEST_CREDENTIALS.email);
    setSecret("specPilot.apiToken", TEST_CREDENTIALS.apiToken);
    setSecret("specPilot.projectKey", TEST_CREDENTIALS.projectKey);

    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/myself`, () =>
        new HttpResponse("broken", { status: 500 }),
      ),
    );

    const bar = new ConnectionStatusBar(makeProvider());
    await bar.refresh();

    const item = getStatusBarItem();
    expect(item.text).toContain("$(error)");

    bar.dispose();
  });
});
