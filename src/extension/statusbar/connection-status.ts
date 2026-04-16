import * as vscode from "vscode";
import type { VscodeCredentialProvider } from "../credentials.js";
import { createJiraClient } from "../../core/jira-client.js";

export class ConnectionStatusBar {
  private item: vscode.StatusBarItem;
  private refreshVersion = 0;

  constructor(private credProvider: VscodeCredentialProvider) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50
    );
    this.item.command = "specPilot.openDashboard";
    this.item.show();
  }

  async refresh(): Promise<void> {
    const version = ++this.refreshVersion;
    this.item.text = "$(sync~spin) SpecPilot";
    this.item.tooltip = "SpecPilot: Checking connection...";

    try {
      const client = await createJiraClient(this.credProvider);
      const res = await client.jiraFetch("/rest/api/3/myself");
      const user = (await res.json()) as { displayName?: string };
      if (version !== this.refreshVersion) return; // stale
      this.item.text = "$(check) SpecPilot";
      this.item.tooltip = `SpecPilot: Connected as ${user.displayName ?? "unknown"}`;
      this.item.backgroundColor = undefined;
      this.item.command = "specPilot.openDashboard";
    } catch (err) {
      if (version !== this.refreshVersion) return; // stale
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not configured")) {
        this.item.text = "$(key) SpecPilot";
        this.item.tooltip = "SpecPilot: Click to configure credentials";
        this.item.command = "specPilot.setCredentials";
      } else {
        this.item.text = "$(error) SpecPilot";
        this.item.tooltip = `SpecPilot: Connection failed: ${msg}`;
        this.item.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.errorBackground"
        );
        this.item.command = "specPilot.openDashboard";
      }
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
