import * as assert from "assert";
import * as vscode from "vscode";

const EXTENSION_ID = "chriswoolf.specpilot";

async function ensureActive(): Promise<void> {
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(ext);
  if (!ext!.isActive) await ext!.activate();
}

describe("SpecPilot commands", function () {
  this.timeout(30_000);

  before(async () => {
    await ensureActive();
  });

  it("refreshVibeEpics executes without throwing", async () => {
    await vscode.commands.executeCommand("specPilot.refreshVibeEpics");
  });

  it("refreshSprint executes without throwing", async () => {
    await vscode.commands.executeCommand("specPilot.refreshSprint");
  });

  it("refreshRules executes without throwing", async () => {
    await vscode.commands.executeCommand("specPilot.refreshRules");
  });

  it("openDashboard executes without throwing", async () => {
    await vscode.commands.executeCommand("specPilot.openDashboard");
  });
});
