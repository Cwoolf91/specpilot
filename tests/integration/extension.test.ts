import * as assert from "assert";
import * as vscode from "vscode";

const EXTENSION_ID = "chriswoolf.specpilot";

const EXPECTED_COMMANDS = [
  "specPilot.openDashboard",
  "specPilot.setCredentials",
  "specPilot.setAnthropicApiKey",
  "specPilot.createIssueFromCode",
  "specPilot.startMcp",
  "specPilot.stopMcp",
  "specPilot.checkForUpdates",
  "specPilot.refreshVibeEpics",
  "specPilot.refreshSprint",
  "specPilot.refreshRules",
];

describe("SpecPilot extension — activation", function () {
  this.timeout(30_000);

  it("is present in the extensions registry", () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `Extension ${EXTENSION_ID} not found`);
  });

  it("activates successfully", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext);
    if (!ext!.isActive) {
      await ext!.activate();
    }
    assert.strictEqual(ext!.isActive, true);
  });

  it("registers every declared command", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    if (!ext!.isActive) await ext!.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const expected of EXPECTED_COMMANDS) {
      assert.ok(
        commands.includes(expected),
        `Command not registered: ${expected}`,
      );
    }
  });
});

describe("SpecPilot extension — contributes metadata", () => {
  it("declares the four sidebar tree views", () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    const views = (ext!.packageJSON.contributes?.views?.specpilot ?? []) as {
      id: string;
    }[];
    const ids = views.map((v) => v.id);
    assert.deepStrictEqual(
      ids.sort(),
      [
        "specPilot.activeSprint",
        "specPilot.automationRules",
        "specPilot.settings",
        "specPilot.vibeEpics",
      ].sort(),
    );
  });

  it("declares activation events for each tree view", () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    const events = (ext!.packageJSON.activationEvents ?? []) as string[];
    for (const v of [
      "onView:specPilot.vibeEpics",
      "onView:specPilot.activeSprint",
      "onView:specPilot.automationRules",
      "onView:specPilot.settings",
    ]) {
      assert.ok(events.includes(v), `Missing activation event: ${v}`);
    }
  });
});
