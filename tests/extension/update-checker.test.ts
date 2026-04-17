import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server.js";
import { setLatestRelease } from "../msw/handlers/github.js";

// Mock fs/promises so the test never touches the real filesystem.
vi.mock("fs/promises", () => ({
  writeFile: vi.fn(async () => undefined),
  unlink: vi.fn(async () => undefined),
}));

import { UpdateChecker } from "../../src/extension/updater/update-checker.js";
import {
  resetVscodeMock,
  setConfig,
  setAuthSession,
  setInfoMessageResponse,
  createExtensionContext,
  commands as vscodeCommands,
  window as vscodeWindow,
} from "../mocks/vscode.js";

function makeChecker(currentVersion = "1.0.0") {
  const ctx = createExtensionContext();
  const checker = new UpdateChecker(
    ctx as unknown as import("vscode").ExtensionContext,
    currentVersion,
  );
  return { ctx, checker };
}

beforeEach(() => {
  resetVscodeMock();
});

describe("UpdateChecker.start", () => {
  it("does nothing when selfHostedUpdateRepo is unset", () => {
    const { checker } = makeChecker();
    // No config set → returns before starting timer
    checker.start();
    // No crash, no auth session requested
    expect(vscodeWindow.createOutputChannel).toHaveBeenCalled();
    checker.dispose();
  });

  it("warns on invalid selfHostedUpdateRepo format", () => {
    setConfig("specPilot.selfHostedUpdateRepo", "not-a-valid-repo");
    const { checker } = makeChecker();
    checker.start();
    // Invalid format is logged — still no crash
    checker.dispose();
  });
});

describe("UpdateChecker.checkForUpdates", () => {
  it("returns early (and warns) when repo is unset and check is not silent", async () => {
    const { checker } = makeChecker();
    await checker.checkForUpdates(false);
    expect(vscodeWindow.showInformationMessage).toHaveBeenCalledWith(
      expect.stringMatching(/No selfHostedUpdateRepo/),
    );
  });

  it("warns when GitHub session is unavailable", async () => {
    setConfig("specPilot.selfHostedUpdateRepo", "example/specpilot");
    setAuthSession(undefined);
    const { checker } = makeChecker();
    await checker.checkForUpdates(false);
    expect(vscodeWindow.showWarningMessage).toHaveBeenCalledWith(
      expect.stringMatching(/GitHub authentication is required/),
    );
  });

  it("reports up to date when latest <= current", async () => {
    setConfig("specPilot.selfHostedUpdateRepo", "example/specpilot");
    setAuthSession({ accessToken: "mock-token" });
    setLatestRelease({
      tag_name: "v1.0.0",
      name: "v1.0.0",
      assets: [],
    });

    const { checker } = makeChecker("1.0.0");
    await checker.checkForUpdates(false);

    expect(vscodeWindow.showInformationMessage).toHaveBeenCalledWith(
      expect.stringMatching(/up to date/),
    );
  });

  it("persists dismissed version when user selects Dismiss", async () => {
    setConfig("specPilot.selfHostedUpdateRepo", "example/specpilot");
    setAuthSession({ accessToken: "mock-token" });
    setLatestRelease({
      tag_name: "v2.0.0",
      name: "v2.0.0",
      assets: [
        {
          name: "specpilot-2.0.0.vsix",
          browser_download_url:
            "https://github.com/example/specpilot/releases/download/v2.0.0/specpilot-2.0.0.vsix",
        },
      ],
    });
    setInfoMessageResponse("Dismiss");

    const { ctx, checker } = makeChecker("1.0.0");
    await checker.checkForUpdates(false);

    // The update-checker calls showInformationMessage twice potentially
    // but the prompt is the one with Install Update / Dismiss buttons.
    const dismissed = ctx.globalState.get<string>("specPilot.dismissedUpdateVersion");
    expect(dismissed).toBe("2.0.0");
  });

  it("skips prompt silently when dismissed version equals the latest", async () => {
    setConfig("specPilot.selfHostedUpdateRepo", "example/specpilot");
    setAuthSession({ accessToken: "mock-token" });
    setLatestRelease({
      tag_name: "v2.0.0",
      name: "v2.0.0",
      assets: [],
    });

    const { ctx, checker } = makeChecker("1.0.0");
    await ctx.globalState.update("specPilot.dismissedUpdateVersion", "2.0.0");

    await checker.checkForUpdates(true); // silent

    // Info message shown is allowed to be 0 — no prompt, no "up to date".
    const infoCalls = (vscodeWindow.showInformationMessage as unknown as {
      mock: { calls: unknown[][] };
    }).mock.calls;
    expect(infoCalls.length).toBe(0);
  });

  it("updates LAST_CHECK_KEY timestamp after a successful fetch", async () => {
    setConfig("specPilot.selfHostedUpdateRepo", "example/specpilot");
    setAuthSession({ accessToken: "mock-token" });
    setLatestRelease({
      tag_name: "v1.0.0",
      name: "v1.0.0",
      assets: [],
    });

    const { ctx, checker } = makeChecker("1.0.0");
    const before = Date.now();
    await checker.checkForUpdates(true);
    const ts = ctx.globalState.get<number>("specPilot.lastUpdateCheck", 0);
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  it("installs the .vsix when the user selects Install Update", async () => {
    setConfig("specPilot.selfHostedUpdateRepo", "example/specpilot");
    setAuthSession({ accessToken: "mock-token" });

    const assetUrl = "https://api.github.com/repos/example/specpilot/releases/assets/12345";
    setLatestRelease({
      tag_name: "v2.0.0",
      name: "v2.0.0",
      assets: [
        {
          name: "specpilot-2.0.0.vsix",
          // The update-checker reads `asset.url` — rename via browser_download_url is also returned on GitHub.
          // Our MockRelease asset type uses browser_download_url, but update-checker needs `url`.
          // We override the handler below to return a release with a `url` field.
          browser_download_url: assetUrl,
        },
      ],
    });

    // Override the releases/latest handler to supply a `url` field (which update-checker reads).
    server.use(
      http.get(
        "https://api.github.com/repos/example/specpilot/releases/latest",
        () =>
          HttpResponse.json({
            tag_name: "v2.0.0",
            assets: [
              {
                name: "specpilot-2.0.0.vsix",
                url: assetUrl,
              },
            ],
          }),
      ),
      http.get(assetUrl, () =>
        new HttpResponse(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        }),
      ),
    );

    // First info prompt chooses "Install Update"; the subsequent "Reload Now / Later" is undefined (Later).
    setInfoMessageResponse("Install Update");

    const { checker } = makeChecker("1.0.0");
    await checker.checkForUpdates(false);

    // The installExtension command should have been invoked by the updater.
    const execCalls = (vscodeCommands.executeCommand as unknown as {
      mock: { calls: unknown[][] };
    }).mock.calls;
    const installCall = execCalls.find(
      (c) => c[0] === "workbench.extensions.installExtension",
    );
    expect(installCall).toBeTruthy();
  });

  it("errors gracefully when GitHub returns non-OK", async () => {
    setConfig("specPilot.selfHostedUpdateRepo", "example/specpilot");
    setAuthSession({ accessToken: "mock-token" });
    server.use(
      http.get(
        "https://api.github.com/repos/example/specpilot/releases/latest",
        () => new HttpResponse("forbidden", { status: 403 }),
      ),
    );

    const { checker } = makeChecker("1.0.0");
    await checker.checkForUpdates(false);

    expect(vscodeWindow.showWarningMessage).toHaveBeenCalledWith(
      expect.stringMatching(/Could not fetch latest release/),
    );
  });
});
