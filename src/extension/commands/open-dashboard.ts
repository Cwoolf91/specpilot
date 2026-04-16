import * as vscode from "vscode";
import type { DashboardPanel } from "../panels/dashboard-panel.js";

export function registerOpenDashboard(
  context: vscode.ExtensionContext,
  getPanel: () => DashboardPanel
) {
  context.subscriptions.push(
    vscode.commands.registerCommand("specPilot.openDashboard", () => {
      getPanel().reveal();
    })
  );
}
