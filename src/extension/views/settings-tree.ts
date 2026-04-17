import * as vscode from "vscode";
import type { VscodeCredentialProvider } from "../credentials.js";

class SettingsItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly action: string,
    icon: string,
    description?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.command = {
      command: action,
      title: label,
    };
  }
}

export class SettingsTreeProvider
  implements vscode.TreeDataProvider<SettingsItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    SettingsItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private credProvider: VscodeCredentialProvider,
    private version: string = ""
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SettingsItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<SettingsItem[]> {
    const hasCredentials = await this.credProvider.hasCredentials();

    const items: SettingsItem[] = [];

    if (hasCredentials) {
      try {
        const creds = await this.credProvider.getCredentials();
        items.push(
          new SettingsItem(
            "Jira Connection",
            "specPilot.setCredentials",
            "check",
            creds.baseUrl.replace("https://", "")
          )
        );
      } catch {
        items.push(
          new SettingsItem(
            "Configure Credentials",
            "specPilot.setCredentials",
            "key",
            "Click to set up"
          )
        );
      }
    } else {
      items.push(
        new SettingsItem(
          "Configure Credentials",
          "specPilot.setCredentials",
          "key",
          "Required to connect to Jira"
        )
      );
    }

    const hasAnthropicKey = await this.credProvider.hasAnthropicApiKey();
    items.push(
      new SettingsItem(
        hasAnthropicKey ? "Anthropic API Key" : "Set Anthropic API Key",
        "specPilot.setAnthropicApiKey",
        hasAnthropicKey ? "check" : "key",
        hasAnthropicKey ? "Configured" : "Required for AI without Bedrock/Copilot"
      )
    );

    items.push(
      new SettingsItem(
        "Open Dashboard",
        "specPilot.openDashboard",
        "layout",
        "Vibe Code, Release Notes, Augment"
      )
    );

    items.push(
      new SettingsItem(
        "Start MCP Server",
        "specPilot.startMcp",
        "server-process",
        "Jira tools for Claude"
      )
    );

    items.push(
      new SettingsItem(
        "Check for Updates",
        "specPilot.checkForUpdates",
        "cloud-download",
        "Check for new version"
      )
    );

    if (this.version) {
      items.push(
        new SettingsItem(
          `SpecPilot`,
          "specPilot.openDashboard",
          "info",
          `v${this.version}`
        )
      );
    }

    return items;
  }
}
