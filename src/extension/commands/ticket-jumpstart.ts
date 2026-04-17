import * as vscode from "vscode";
import path from "path";
import type { VscodeCredentialProvider } from "../credentials.js";
import { createJiraClient } from "../../core/jira-client.js";
import { extractTextFromAdf, validateIssueKey } from "../../core/utils.js";
import { getCurrentUser } from "../../core/jira/current-user.js";
import { findActiveSprint, fetchSprintIssues } from "../../core/jira/active-sprint.js";
import { fetchSimilarStoriesInEpic } from "../../core/jira/similar-stories.js";
import { generateBriefing } from "../ai/generate-briefing.js";
import { JumpstartPanel, type ResolvedBriefingFile } from "../panels/jumpstart-panel.js";
import type {
  JiraClient,
  JiraIssue,
  BriefingContext,
  BriefingFile,
  TicketBriefing,
} from "../../core/types.js";

type SourceChoice = "ask" | "nextUnassigned" | "myAssigned" | "byKey";
type ResolvedSource = Exclude<SourceChoice, "ask">;

interface PickableIssue extends vscode.QuickPickItem {
  issueKey: string;
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerTicketJumpstart(
  context: vscode.ExtensionContext,
  credProvider: VscodeCredentialProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("specPilot.ticketJumpstart", async () => {
      await runJumpstart(credProvider);
    }),
  );
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

async function runJumpstart(credProvider: VscodeCredentialProvider): Promise<void> {
  let client: JiraClient;
  try {
    client = await createJiraClient(credProvider);
  } catch (err) {
    vscode.window.showErrorMessage(
      `SpecPilot: credentials not configured. Run "SpecPilot: Set Credentials".`,
    );
    return;
  }

  const config = vscode.workspace.getConfiguration("specPilot");
  const source = config.get<SourceChoice>("ticketJumpstart.source", "ask");
  const maxSimilar = Math.max(0, Math.min(10, config.get<number>("ticketJumpstart.maxSimilarStories", 3)));

  const choice: ResolvedSource | undefined = source === "ask" ? await pickSource() : source;
  if (!choice) return;

  const issueKey = await resolveIssueKey(client, choice);
  if (!issueKey) return;

  const panel = new JumpstartPanel();
  const creds = client.credentials;
  const issueUrl = `${creds.baseUrl.replace(/\/$/, "")}/browse/${issueKey}`;

  // Show panel immediately with loading state
  panel.show({
    issueKey,
    issueSummary: "",
    issueUrl,
    briefing: null,
    resolvedFiles: [],
    aiPending: true,
  });

  const cts = new vscode.CancellationTokenSource();
  panel.onDidDispose(() => cts.cancel());

  panel.onOpenFile(async (file) => {
    await openFileAtLine(file);
  });

  panel.onSearchFile(async (p) => {
    await quickPickWorkspaceFile(p);
  });

  const runBriefing = async () => {
    try {
      const issue = await fetchIssue(client, issueKey);
      if (!issue) {
        panel.setAiUnavailable();
        return;
      }

      // Update header with summary once we have it
      panel.show({
        issueKey,
        issueSummary: issue.fields.summary ?? "",
        issueUrl,
        briefing: null,
        resolvedFiles: [],
        aiPending: true,
      });
      updateStatusBar(issueKey, 0, 0);

      const epicKey = issue.fields.parent?.key;
      const epicSummary = issue.fields.parent?.fields?.summary;

      const [similarStories, workspaceHints] = await Promise.all([
        epicKey ? fetchSimilarStoriesInEpic(client, epicKey, maxSimilar, issueKey) : Promise.resolve([]),
        gatherWorkspaceHints(),
      ]);

      const acceptanceCriteria = extractAcceptanceCriteria(issue);
      const briefingContext: BriefingContext = {
        issueKey,
        issueSummary: issue.fields.summary ?? "",
        issueType: issue.fields.issuetype?.name ?? "Story",
        acceptanceCriteria,
        description: extractTextFromAdf(issue.fields.description),
        epicKey,
        epicSummary,
        similarStories,
      };

      const briefing = await generateBriefing(briefingContext, workspaceHints, cts.token, credProvider);
      if (cts.token.isCancellationRequested) return;

      if (!briefing) {
        panel.setAiUnavailable();
        return;
      }

      const resolvedFiles = await resolveFiles(briefing.filesToOpen);
      panel.updateBriefing(briefing, resolvedFiles);
      updateStatusBar(issueKey, resolvedFiles.length, briefing.similarStories.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Jumpstart failed: ${message}`);
      panel.setAiUnavailable();
    }
  };

  panel.onRegenerate(async () => {
    await runBriefing();
  });

  void runBriefing();
}

// ---------------------------------------------------------------------------
// Source selection
// ---------------------------------------------------------------------------

async function pickSource(): Promise<ResolvedSource | undefined> {
  const items: Array<{ label: string; detail: string; value: ResolvedSource }> = [
    {
      label: "$(arrow-right) Next unassigned in active sprint",
      detail: "Pick the top unassigned ticket to grab",
      value: "nextUnassigned",
    },
    {
      label: "$(person) My assigned tickets",
      detail: "Pick from tickets assigned to you",
      value: "myAssigned",
    },
    {
      label: "$(search) Enter issue key…",
      detail: "Type a key like PROJ-123",
      value: "byKey",
    },
  ];

  const pick = await vscode.window.showQuickPick(items, {
    title: "Ticket Jumpstart",
    placeHolder: "How should we pick the ticket?",
  });
  return pick?.value;
}

async function resolveIssueKey(client: JiraClient, source: ResolvedSource): Promise<string | undefined> {
  if (source === "byKey") {
    const input = await vscode.window.showInputBox({
      title: "Ticket Jumpstart",
      prompt: "Enter issue key (e.g., PROJ-123)",
      ignoreFocusOut: true,
      validateInput: (v) => {
        if (!v.trim()) return "Issue key is required.";
        try {
          validateIssueKey(v.trim().toUpperCase());
          return null;
        } catch {
          return "Invalid key format. Expected PROJ-123.";
        }
      },
    });
    return input?.trim().toUpperCase();
  }

  const projectKey = client.credentials.projectKey;
  const active = await findActiveSprint(client, projectKey);
  if (!active) {
    vscode.window.showWarningMessage(
      `No active sprint found for project ${projectKey}. Enter an issue key instead.`,
    );
    return resolveIssueKey(client, "byKey");
  }

  let jql: string | undefined;
  if (source === "nextUnassigned") {
    jql = `assignee is EMPTY AND statusCategory != Done ORDER BY priority DESC, created ASC`;
  } else {
    const me = await getCurrentUser(client);
    if (!me) {
      vscode.window.showWarningMessage("Could not identify current user. Enter an issue key instead.");
      return resolveIssueKey(client, "byKey");
    }
    jql = `assignee = "${me.accountId}" AND statusCategory != Done ORDER BY priority DESC, updated DESC`;
  }

  const issues = await fetchSprintIssues(client, active.sprint.id, { jql, maxResults: 50 });
  if (issues.length === 0) {
    vscode.window.showInformationMessage(
      source === "nextUnassigned"
        ? "No unassigned tickets in the active sprint."
        : "You have no tickets in the active sprint.",
    );
    return undefined;
  }

  if (source === "nextUnassigned") {
    return issues[0].key;
  }

  const items: PickableIssue[] = issues.map((i) => ({
    label: `${i.key} — ${i.fields.summary ?? ""}`,
    description: i.fields.status?.name ?? "",
    detail: i.fields.issuetype?.name,
    issueKey: i.key,
  }));
  const pick = await vscode.window.showQuickPick(items, {
    title: `Your tickets in ${active.sprint.name}`,
    placeHolder: "Pick a ticket to jumpstart",
  });
  return pick?.issueKey;
}

// ---------------------------------------------------------------------------
// Issue fetching + AC extraction
// ---------------------------------------------------------------------------

async function fetchIssue(client: JiraClient, issueKey: string): Promise<JiraIssue | null> {
  try {
    const acFieldId = vscode.workspace.getConfiguration("specPilot").get<string>("acceptanceCriteriaFieldId", "");
    const baseFields = ["summary", "description", "status", "issuetype", "labels", "parent", "assignee"];
    if (acFieldId) baseFields.push(acFieldId);
    const params = new URLSearchParams({ fields: baseFields.join(",") });
    const res = await client.jiraFetch(`/rest/api/3/issue/${validateIssueKey(issueKey)}?${params}`);
    return (await res.json()) as JiraIssue;
  } catch {
    return null;
  }
}

function extractAcceptanceCriteria(issue: JiraIssue): string[] {
  const acFieldId = vscode.workspace.getConfiguration("specPilot").get<string>("acceptanceCriteriaFieldId", "");
  const fields = issue.fields as Record<string, unknown>;

  if (acFieldId && acFieldId in fields) {
    const value = fields[acFieldId];
    const text = typeof value === "string" ? value : extractTextFromAdf(value);
    if (text.trim()) {
      return splitIntoBullets(text);
    }
  }

  // Fallback: parse AC from description (look for "Acceptance Criteria" section)
  const descText = extractTextFromAdf(issue.fields.description);
  const match = descText.match(/Acceptance Criteria[:\n]*([\s\S]*?)(?:\n\n[A-Z]|\n##|$)/i);
  if (match) {
    return splitIntoBullets(match[1]);
  }
  return [];
}

function splitIntoBullets(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•\-*\d.]+/, "").trim())
    .filter((line) => line.length > 0);
}

// ---------------------------------------------------------------------------
// Workspace hints (sample of files for AI grounding)
// ---------------------------------------------------------------------------

async function gatherWorkspaceHints(): Promise<string[]> {
  try {
    const uris = await vscode.workspace.findFiles(
      "**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php,cs,vue,svelte}",
      "**/node_modules/**",
      200,
    );
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return uris.slice(0, 60).map((u) => u.fsPath);
    return uris.slice(0, 60).map((u) => path.relative(folder.uri.fsPath, u.fsPath));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// File resolution + opening
// ---------------------------------------------------------------------------

async function resolveFiles(files: BriefingFile[]): Promise<ResolvedBriefingFile[]> {
  const results: ResolvedBriefingFile[] = [];
  for (const file of files) {
    const resolved = await resolveSingleFile(file.path);
    results.push({
      ...file,
      resolved: resolved !== undefined,
      uri: resolved?.toString(),
    });
  }
  return results;
}

async function resolveSingleFile(candidate: string): Promise<vscode.Uri | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;

  // Try exact relative path first
  const exact = vscode.Uri.joinPath(folder.uri, candidate);
  try {
    await vscode.workspace.fs.stat(exact);
    return exact;
  } catch {
    // fall through
  }

  // Try basename match via findFiles
  const base = path.basename(candidate);
  if (!base) return undefined;
  const matches = await vscode.workspace.findFiles(`**/${base}`, "**/node_modules/**", 5);
  if (matches.length === 0) return undefined;
  // Prefer match that ends with the full candidate
  const preferred = matches.find((m) => m.fsPath.endsWith(candidate)) ?? matches[0];
  return preferred;
}

async function openFileAtLine(file: ResolvedBriefingFile): Promise<void> {
  if (!file.uri) return;
  try {
    const uri = vscode.Uri.parse(file.uri);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    if (file.line && file.line > 0) {
      const line = Math.min(file.line - 1, doc.lineCount - 1);
      const pos = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }
  } catch (err) {
    vscode.window.showWarningMessage(
      `Could not open ${file.path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function quickPickWorkspaceFile(candidate: string): Promise<void> {
  const base = path.basename(candidate);
  const matches = await vscode.workspace.findFiles(`**/${base}`, "**/node_modules/**", 20);
  if (matches.length === 0) {
    vscode.window.showInformationMessage(`No files matching "${base}" in workspace.`);
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  const items = matches.map((uri) => ({
    label: folder ? path.relative(folder.uri.fsPath, uri.fsPath) : uri.fsPath,
    uri,
  }));
  const pick = await vscode.window.showQuickPick(items, {
    title: `Find "${base}"`,
    placeHolder: "Pick a file to open",
  });
  if (!pick) return;
  const doc = await vscode.workspace.openTextDocument(pick.uri);
  await vscode.window.showTextDocument(doc, { preview: false });
}

// ---------------------------------------------------------------------------
// Status bar (transient — shown while briefing is active)
// ---------------------------------------------------------------------------

let statusBarItem: vscode.StatusBarItem | undefined;

function updateStatusBar(issueKey: string, fileCount: number, similarCount: number): void {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  }
  const parts = [`$(rocket) Jumpstart: ${issueKey}`];
  if (fileCount > 0) parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
  if (similarCount > 0) parts.push(`${similarCount} similar`);
  statusBarItem.text = parts.join(" · ");
  statusBarItem.tooltip = `SpecPilot: briefing ${issueKey}`;
  statusBarItem.show();

  // Auto-hide after 2 minutes
  setTimeout(() => {
    statusBarItem?.hide();
  }, 120_000);
}

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------

export const __test__ = {
  extractAcceptanceCriteria,
  splitIntoBullets,
  resolveSingleFile,
};
