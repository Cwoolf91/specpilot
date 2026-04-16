import * as vscode from "vscode";
import type { VscodeCredentialProvider } from "../credentials.js";
import { createJiraClient } from "../../core/jira-client.js";
import { getCloudId } from "../../core/cloud-id.js";
import {
  fetchAllRules,
  formatState,
  formatScope,
} from "../../core/jira/automation-rules.js";
import { buildAuthHeader } from "../../core/config.js";
import type { RuleSummary } from "../../core/types.js";

class RuleItem extends vscode.TreeItem {
  constructor(public readonly rule: RuleSummary) {
    super(rule.name || "(unnamed)", vscode.TreeItemCollapsibleState.None);
    const enabled = formatState(rule) === "ENABLED";
    this.description = formatScope(rule);
    this.tooltip = `${rule.name}\nState: ${formatState(rule)}\nScope: ${formatScope(rule)}`;
    this.iconPath = new vscode.ThemeIcon(
      enabled ? "symbol-event" : "circle-slash"
    );
    this.contextValue = enabled ? "ruleEnabled" : "ruleDisabled";
  }
}

export class AutomationTreeProvider
  implements vscode.TreeDataProvider<RuleItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<RuleItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private credProvider: VscodeCredentialProvider) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: RuleItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<RuleItem[]> {
    try {
      const creds = await this.credProvider.getCredentials();
      const cloudId = await getCloudId(creds.baseUrl);
      const authHeader = buildAuthHeader(creds.email, creds.apiToken);
      const rules = await fetchAllRules(cloudId, authHeader);

      rules.sort((a, b) => {
        const aOn = formatState(a) === "ENABLED" ? 0 : 1;
        const bOn = formatState(b) === "ENABLED" ? 0 : 1;
        if (aOn !== bOn) return aOn - bOn;
        return (a.name || "").localeCompare(b.name || "");
      });

      return rules.map((r) => new RuleItem(r));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(`Automation Rules: ${msg}`);
      return [];
    }
  }
}
