import * as vscode from "vscode";
import { VscodeCredentialProvider } from "./credentials.js";
import { ConnectionStatusBar } from "./statusbar/connection-status.js";
import { DashboardPanel } from "./panels/dashboard-panel.js";
import { registerSetCredentials } from "./commands/set-credentials.js";
import { registerOpenDashboard } from "./commands/open-dashboard.js";
import { registerCreateFromSelection } from "./commands/create-from-selection.js";
import { registerSetAnthropicApiKey } from "./commands/set-anthropic-key.js";
import { VibeEpicsTreeProvider } from "./views/vibe-epics-tree.js";
import { SprintTreeProvider } from "./views/sprint-tree.js";
import { AutomationTreeProvider } from "./views/automation-tree.js";
import { SettingsTreeProvider } from "./views/settings-tree.js";
import { McpManager } from "./mcp/mcp-manager.js";
import { UpdateChecker } from "./updater/update-checker.js";

let statusBar: ConnectionStatusBar | undefined;
let dashboard: DashboardPanel | undefined;
let mcpManager: McpManager | undefined;
let updateChecker: UpdateChecker | undefined;

export function activate(context: vscode.ExtensionContext) {
  const credProvider = new VscodeCredentialProvider(context.secrets);

  // Status bar
  statusBar = new ConnectionStatusBar(credProvider);
  context.subscriptions.push({ dispose: () => statusBar?.dispose() });
  statusBar.refresh();

  // Dashboard panel
  dashboard = new DashboardPanel(context.extensionUri, credProvider, context.globalState);
  context.subscriptions.push({ dispose: () => dashboard?.dispose() });

  // MCP server
  mcpManager = new McpManager(context.extensionUri.fsPath);
  context.subscriptions.push({ dispose: () => mcpManager?.dispose() });

  // Auto-update checker
  const currentVersion = context.extension.packageJSON.version as string;
  updateChecker = new UpdateChecker(context, currentVersion);
  context.subscriptions.push({ dispose: () => updateChecker?.dispose() });
  updateChecker.start();

  // Sidebar TreeViews
  const vibeTree = new VibeEpicsTreeProvider(credProvider);
  const sprintTree = new SprintTreeProvider(credProvider);
  const rulesTree = new AutomationTreeProvider(credProvider);
  const settingsTree = new SettingsTreeProvider(credProvider, currentVersion);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("specPilot.vibeEpics", vibeTree),
    vscode.window.registerTreeDataProvider("specPilot.activeSprint", sprintTree),
    vscode.window.registerTreeDataProvider("specPilot.automationRules", rulesTree),
    vscode.window.registerTreeDataProvider("specPilot.settings", settingsTree)
  );

  // Commands
  registerSetCredentials(context, credProvider, () => {
    statusBar?.refresh();
    vibeTree.refresh();
    sprintTree.refresh();
    rulesTree.refresh();
    settingsTree.refresh();
  });
  registerOpenDashboard(context, () => dashboard!);
  registerCreateFromSelection(context, credProvider);
  registerSetAnthropicApiKey(context, credProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand("specPilot.refreshVibeEpics", () =>
      vibeTree.refresh()
    ),
    vscode.commands.registerCommand("specPilot.refreshSprint", () =>
      sprintTree.refresh()
    ),
    vscode.commands.registerCommand("specPilot.refreshRules", () =>
      rulesTree.refresh()
    ),
    vscode.commands.registerCommand("specPilot.startMcp", () =>
      mcpManager?.start()
    ),
    vscode.commands.registerCommand("specPilot.stopMcp", () =>
      mcpManager?.stop()
    ),
    vscode.commands.registerCommand("specPilot.checkForUpdates", () =>
      updateChecker?.checkForUpdates(false)
    )
  );
}

export function deactivate() {
  // All components are in context.subscriptions — VS Code disposes them automatically.
}
