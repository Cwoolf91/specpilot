import * as vscode from "vscode";
import type { VscodeCredentialProvider } from "../credentials.js";
import { createJiraClient } from "../../core/jira-client.js";
import type { JiraIssue } from "../../core/types.js";

type TreeItem = EpicItem | StoryItem | InfoItem;

class InfoItem extends vscode.TreeItem {
  constructor(label: string, tooltip?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.iconPath = new vscode.ThemeIcon("info");
  }
}

class EpicItem extends vscode.TreeItem {
  constructor(
    public readonly issue: JiraIssue,
    public readonly childCount: number
  ) {
    super(
      `${issue.key} — ${issue.fields.summary}`,
      childCount > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.description = childCount > 0 ? `${childCount} stories` : "no stories";
    this.tooltip = `${issue.key}: ${issue.fields.summary}\nStatus: ${issue.fields.status?.name ?? "unknown"}`;
    this.iconPath = new vscode.ThemeIcon("symbol-class");
    this.contextValue = "epic";
  }
}

class StoryItem extends vscode.TreeItem {
  constructor(public readonly issue: JiraIssue) {
    super(issue.fields.summary ?? issue.key, vscode.TreeItemCollapsibleState.None);
    this.description = issue.key;
    const status = issue.fields.status?.name ?? "";
    this.tooltip = `${issue.key} — ${status}`;

    const hasAttachments = (issue.fields as Record<string, unknown>).attachment;
    const attachCount = Array.isArray(hasAttachments) ? hasAttachments.length : 0;
    this.iconPath = new vscode.ThemeIcon(
      attachCount > 0 ? "file-media" : "circle-outline"
    );
    this.contextValue = "story";
  }
}

export class VibeEpicsTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private epics: JiraIssue[] = [];
  private childrenMap = new Map<string, JiraIssue[]>();
  private loadVersion = 0;

  constructor(private credProvider: VscodeCredentialProvider) {}

  refresh(): void {
    this.loadVersion++;
    this.epics = [];
    this.childrenMap.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!element) return this.getEpics();
    if (element instanceof EpicItem) return this.getStories(element.issue.key);
    return [];
  }

  private async getEpics(): Promise<TreeItem[]> {
    const version = this.loadVersion;
    try {
      const client = await createJiraClient(this.credProvider);
      if (version !== this.loadVersion) return [];
      const projectKey = client.credentials.projectKey;

      // Try labeled epics first (configurable label, default "vibe-code")
      const epicLabel = vscode.workspace.getConfiguration("specPilot").get<string>("epicLabel", "vibe-code");
      let jql = `labels = "${epicLabel}" AND issuetype = Epic ORDER BY created DESC`;
      let res = await client.jiraFetch("/rest/api/3/search/jql", {
        method: "POST",
        body: JSON.stringify({
          jql,
          fields: ["summary", "status", "issuetype"],
          maxResults: 50,
        }),
      });
      let data = (await res.json()) as { issues?: JiraIssue[] };
      this.epics = data.issues ?? [];

      // Fallback: show recent project epics if none have the label
      if (this.epics.length === 0) {
        jql = `project = ${projectKey} AND issuetype = Epic ORDER BY created DESC`;
        res = await client.jiraFetch("/rest/api/3/search/jql", {
          method: "POST",
          body: JSON.stringify({
            jql,
            fields: ["summary", "status", "issuetype"],
            maxResults: 20,
          }),
        });
        data = (await res.json()) as { issues?: JiraIssue[] };
        this.epics = data.issues ?? [];

        if (this.epics.length === 0) {
          return [new InfoItem("No epics found", `No epics in project ${projectKey}`)];
        }

        // Show info that these are all epics, not just labeled ones
        const items: TreeItem[] = [
          new InfoItem(
            `Showing all ${projectKey} epics (no "${epicLabel}" label found)`,
            `Add the "${epicLabel}" label to epics created by the tool to filter this list.`
          ),
        ];
        items.push(...(await this.buildEpicItems()));
        return items;
      }

      return this.buildEpicItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not configured")) {
        return [new InfoItem("Set credentials to connect", "Run 'SpecPilot: Set Credentials'")];
      }
      vscode.window.showWarningMessage(`Vibe Epics: ${msg}`);
      return [new InfoItem("Failed to load", msg)];
    }
  }

  private async buildEpicItems(): Promise<EpicItem[]> {
    const version = this.loadVersion;
    const client = await createJiraClient(this.credProvider);
    const items: EpicItem[] = [];

    for (const epic of this.epics) {
      if (version !== this.loadVersion) return [];
      const childRes = await client.jiraFetch("/rest/api/3/search/jql", {
        method: "POST",
        body: JSON.stringify({
          jql: `parent = ${epic.key}`,
          fields: ["summary", "status", "issuetype", "attachment"],
          maxResults: 100,
        }),
      });
      const childData = (await childRes.json()) as { issues?: JiraIssue[] };
      const children = childData.issues ?? [];
      this.childrenMap.set(epic.key, children);
      items.push(new EpicItem(epic, children.length));
    }

    return items;
  }

  private async getStories(epicKey: string): Promise<StoryItem[]> {
    const children = this.childrenMap.get(epicKey) ?? [];
    return children.map((issue) => new StoryItem(issue));
  }
}
