import * as vscode from "vscode";
import type { VscodeCredentialProvider } from "../credentials.js";
import { createJiraClient } from "../../core/jira-client.js";
import type { JiraIssue } from "../../core/types.js";

const STATUS_GROUPS = ["To Do", "In Progress", "Done"] as const;
type StatusGroup = (typeof STATUS_GROUPS)[number];

class StatusGroupItem extends vscode.TreeItem {
  constructor(
    public readonly group: StatusGroup,
    public readonly count: number
  ) {
    super(
      `${group} (${count})`,
      count > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );
    const icons: Record<StatusGroup, string> = {
      "To Do": "circle-outline",
      "In Progress": "sync",
      Done: "check",
    };
    this.iconPath = new vscode.ThemeIcon(icons[group]);
    this.contextValue = "statusGroup";
  }
}

class SprintIssueItem extends vscode.TreeItem {
  constructor(public readonly issue: JiraIssue) {
    super(issue.fields.summary ?? issue.key, vscode.TreeItemCollapsibleState.None);
    this.description = `${issue.key} [${issue.fields.issuetype?.name ?? ""}]`;
    this.tooltip = `${issue.key} — ${issue.fields.status?.name ?? ""}`;
    this.iconPath = new vscode.ThemeIcon(
      issue.fields.issuetype?.name === "Bug" ? "bug" : "bookmark"
    );
    this.contextValue = "sprintIssue";
  }
}

type TreeItem = StatusGroupItem | SprintIssueItem;

export class SprintTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private issuesByGroup = new Map<StatusGroup, JiraIssue[]>();
  private loadVersion = 0;

  constructor(private credProvider: VscodeCredentialProvider) {}

  refresh(): void {
    this.loadVersion++;
    this.issuesByGroup.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!element) return this.getGroups();
    if (element instanceof StatusGroupItem) {
      return (this.issuesByGroup.get(element.group) ?? []).map(
        (i) => new SprintIssueItem(i)
      );
    }
    return [];
  }

  private async getGroups(): Promise<StatusGroupItem[]> {
    const version = this.loadVersion;
    try {
      const client = await createJiraClient(this.credProvider);
      if (version !== this.loadVersion) return [];
      const projectKey = client.credentials.projectKey;

      // Find active sprint
      const boardRes = await client.jiraFetch(
        `/rest/agile/1.0/board?projectKeyOrId=${projectKey}&type=scrum`
      );
      const boards = (await boardRes.json()) as { values?: { id: number }[] };
      const boardId = boards.values?.[0]?.id;
      if (!boardId) return [];

      const sprintRes = await client.jiraFetch(
        `/rest/agile/1.0/board/${boardId}/sprint?state=active`
      );
      const sprints = (await sprintRes.json()) as {
        values?: { id: number; name: string }[];
      };
      const sprint = sprints.values?.[0];
      if (!sprint) return [];

      // Fetch sprint issues
      const issuesRes = await client.jiraFetch(
        `/rest/agile/1.0/sprint/${sprint.id}/issue?maxResults=100&fields=summary,status,issuetype,assignee`
      );
      const data = (await issuesRes.json()) as { issues?: JiraIssue[] };
      const issues = data.issues ?? [];

      // Group by status category
      this.issuesByGroup.clear();
      for (const group of STATUS_GROUPS) {
        this.issuesByGroup.set(group, []);
      }

      for (const issue of issues) {
        const category =
          (issue.fields.status as Record<string, unknown>)?.statusCategory as
            | { name?: string }
            | undefined;
        const catName = category?.name ?? "";
        let group: StatusGroup = "To Do";
        if (catName === "In Progress") group = "In Progress";
        else if (catName === "Done") group = "Done";
        this.issuesByGroup.get(group)!.push(issue);
      }

      return STATUS_GROUPS.map(
        (g) => new StatusGroupItem(g, this.issuesByGroup.get(g)!.length)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(`Sprint: ${msg}`);
      return [];
    }
  }
}
