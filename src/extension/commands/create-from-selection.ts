import * as vscode from "vscode";
import type { VscodeCredentialProvider } from "../credentials.js";
import { IssueReviewPanel } from "../panels/issue-review-panel.js";
import { enhanceIssueWithAI } from "../ai/enhance-issue.js";
import { createJiraClient } from "../../core/jira-client.js";
import { getIssueTypes, getProjects, resolveIssueTypeId } from "../../core/jira/issue-types.js";

export function registerCreateFromSelection(
  context: vscode.ExtensionContext,
  credProvider: VscodeCredentialProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand("specPilot.createIssueFromCode", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active editor with selected text.");
        return;
      }

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);
      if (!selectedText) {
        vscode.window.showWarningMessage("Select some code first.");
        return;
      }

      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const startLine = selection.start.line + 1;
      const endLine = selection.end.character === 0 && selection.end.line > selection.start.line
        ? selection.end.line
        : selection.end.line + 1;
      const language = editor.document.languageId;
      const lineRange = startLine === endLine
        ? `line ${startLine}`
        : `lines ${startLine}-${endLine}`;

      // Discover issue types and projects from Jira
      let issueTypeMap: Record<string, string> = {};
      let projectKeys: string[] = [];
      let defaultProject = "";
      try {
        const client = await createJiraClient(credProvider);
        defaultProject = client.credentials.projectKey;
        const [types, projects] = await Promise.all([
          getIssueTypes(client),
          getProjects(client),
        ]);
        issueTypeMap = types;
        projectKeys = projects.map((p) => p.key);
      } catch {
        // Fallback: let user type manually
      }

      // Issue type
      const bugId = issueTypeMap["Bug"] ?? "";
      const storyId = issueTypeMap["Story"] ?? "";
      const issueType = await vscode.window.showQuickPick(
        [
          { label: "Bug", id: bugId },
          { label: "Story", id: storyId },
        ],
        { title: "Issue Type", placeHolder: "Select issue type" }
      );
      if (!issueType) return;

      // Project key
      const sortedKeys = defaultProject
        ? [defaultProject, ...projectKeys.filter((k) => k !== defaultProject)]
        : projectKeys;
      const projectKey = sortedKeys.length > 0
        ? await vscode.window.showQuickPick(sortedKeys, {
            title: "Project",
            placeHolder: "Select Jira project",
          })
        : await vscode.window.showInputBox({
            title: "Project Key",
            prompt: "Enter Jira project key (e.g., WEB)",
          });
      if (!projectKey) return;

      // Summary
      const summary = await vscode.window.showInputBox({
        title: `${issueType.label} Summary`,
        prompt: `Brief description of the ${issueType.label.toLowerCase()}`,
        ignoreFocusOut: true,
      });
      if (!summary) return;

      // Additional description
      const extraDescription = await vscode.window.showInputBox({
        title: "Description (optional)",
        prompt: "Additional context — leave empty to skip",
        ignoreFocusOut: true,
      });

      // Check if AI enhancement is enabled
      const config = vscode.workspace.getConfiguration("specPilot");
      const aiEnabled = config.get<boolean>("aiEnhanceIssues", true);

      // Open review panel immediately
      const panel = new IssueReviewPanel(credProvider);
      panel.show({
        issueType: issueType.label,
        issueTypeId: issueType.id,
        projectKey,
        summary,
        description: extraDescription || "",
        userStory: "",
        why: "",
        acceptanceCriteria: [],
        releaseInstructions: "",
        selectedCode: selectedText,
        filePath,
        lineRange,
        language,
        aiPending: aiEnabled,
      });

      if (!aiEnabled) {
        return;
      }

      // Fire AI enhancement in background
      const cts = new vscode.CancellationTokenSource();
      panel.onDidDispose(() => cts.cancel());

      enhanceIssueWithAI(
        {
          issueType: issueType.label as "Bug" | "Story",
          projectKey,
          summary,
          description: extraDescription || "",
          selectedCode: selectedText,
          filePath,
          lineRange,
          language,
        },
        cts.token
      ).then((enhanced) => {
        if (cts.token.isCancellationRequested) return;
        if (enhanced) {
          panel.postMessage({ type: "aiResult", ...enhanced });
        } else {
          panel.postMessage({ type: "aiUnavailable" });
        }
      }).catch(() => {
        if (cts.token.isCancellationRequested) return;
        panel.postMessage({ type: "aiUnavailable" });
      }).finally(() => {
        cts.dispose();
      });
    })
  );
}
