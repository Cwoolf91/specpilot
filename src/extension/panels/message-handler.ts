import * as vscode from "vscode";
import type { VscodeCredentialProvider } from "../credentials.js";
import { createJiraClient } from "../../core/jira-client.js";
import { generateDiff, categorizeFiles } from "../../core/diff/git-diff.js";
import { detectRoutes } from "../../core/diff/route-detection.js";
import { fetchBoards, fetchSprints, moveToSprint } from "../../core/jira/sprints.js";
import { createJiraTickets } from "../../core/jira/issues.js";
import { fallbackMapping } from "../../core/ai/screenshot-matcher.js";
import { getVersion, updateVersionDescription } from "../../core/jira/versions.js";
import { publishToConfluence } from "../../core/jira/confluence.js";
import { formatPlainText } from "../../core/ai/release-notes.js";
import { generateReleaseNotesWithAI } from "../ai/generate-release-notes.js";
import { generateAnalysisWithAI, generateEpicStoriesWithAI } from "../ai/generate-analysis.js";
import { getCloudId } from "../../core/cloud-id.js";
import { captureScreenshots, captureStoryScreenshots } from "../../core/screenshots/capture.js";
import { escapeJqlString, validateProjectKey } from "../../core/utils.js";
import type { AiAnalysis, JiraIssue, ReleaseNotesResult } from "../../core/types.js";
import type { ProgressReporter } from "../../core/progress.js";
import { fetchEpicStories, fetchVibeCodeEpics, fetchEpicDetails, createStoriesForExistingEpic } from "../../core/jira/issues.js";
import { getIssueTypes } from "../../core/jira/issue-types.js";
import {
  inspectTemplate,
  saveTemplatePath,
  clearTemplatePath,
  scaffoldTemplate,
  getBuiltInTemplate,
  type TemplateKind,
} from "../ai/template-loader.js";

interface Message {
  type: string;
  [key: string]: unknown;
}

function requireString(msg: Message, key: string): string {
  const val = msg[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new Error(`Missing required field: ${key}`);
  }
  return val;
}

function optionalString(msg: Message, key: string, fallback = ""): string {
  const val = msg[key];
  return typeof val === "string" ? val : fallback;
}

function optionalNumber(msg: Message, key: string, fallback: number): number {
  const val = msg[key];
  return typeof val === "number" && Number.isFinite(val) ? val : fallback;
}

export class MessageHandler {
  constructor(
    private credProvider: VscodeCredentialProvider,
    private postMessage: (msg: unknown) => void,
    private globalState?: vscode.Memento
  ) {}

  private progress(): ProgressReporter {
    return {
      report: (message: string) => {
        this.postMessage({ type: "progress", message });
      },
      section: (title: string) => {
        this.postMessage({ type: "progress:section", title });
      },
      warn: (message: string) => {
        this.postMessage({ type: "progress:warn", message });
      },
      error: (message: string) => {
        this.postMessage({ type: "progress:error", message });
      },
    };
  }

  async handle(msg: Message): Promise<void> {
    try {
      switch (msg.type) {
        case "getDiff":
          return await this.handleGetDiff(msg);
        case "importAnalysis":
          return await this.handleImportAnalysis(msg);
        case "getBoards":
          return await this.handleGetBoards();
        case "getSprints":
          return await this.handleGetSprints(msg);
        case "createTickets":
          return await this.handleCreateTickets(msg);
        case "captureScreenshots":
          return await this.handleCaptureScreenshots(msg);
        case "captureStoryScreenshots":
          return await this.handleCaptureStoryScreenshots(msg);
        case "matchScreenshots":
          return await this.handleMatchScreenshots(msg);
        case "getVersions":
          return await this.handleGetVersions(msg);
        case "searchIssues":
          return await this.handleSearchIssues(msg);
        case "importReleaseNotes":
          return await this.handleImportReleaseNotes(msg);
        case "publishReleaseNotes":
          return await this.handlePublishReleaseNotes(msg);
        case "browseFolder":
          return await this.handleBrowseFolder();
        case "getEpicStories":
          return await this.handleGetEpicStories(msg);
        case "getEpicDetails":
          return await this.handleGetEpicDetails(msg);
        case "generateEpicStories":
          return await this.handleGenerateEpicStories(msg);
        case "createStoriesForEpic":
          return await this.handleCreateStoriesForEpic(msg);
        case "getConnectionStatus":
          return await this.handleGetConnectionStatus();
        case "getSprintIssues":
          return await this.handleGetSprintIssues();
        case "generateAnalysis":
          return await this.handleGenerateAnalysis(msg);
        case "generateReleaseNotes":
          return await this.handleGenerateReleaseNotes(msg);
        case "openCommand":
          return await this.handleOpenCommand(msg);
        case "saveSettings":
          return await this.handleSaveSettings(msg);
        case "getSettings":
          return await this.handleGetSettings(msg);
        case "getAboutInfo":
          return this.handleGetAboutInfo();
        case "openExternal":
          return await this.handleOpenExternal(msg);
        case "getCredentialsForm":
          return await this.handleGetCredentialsForm();
        case "saveCredentialsForm":
          return await this.handleSaveCredentialsForm(msg);
        case "saveAnthropicKeyForm":
          return await this.handleSaveAnthropicKeyForm(msg);
        case "getEpicLabel":
          return this.handleGetEpicLabel();
        case "saveEpicLabel":
          return await this.handleSaveEpicLabel(msg);
        case "getTemplatesForm":
          return this.handleGetTemplatesForm();
        case "browseTemplate":
          return await this.handleBrowseTemplate(msg);
        case "scaffoldTemplate":
          return await this.handleScaffoldTemplate(msg);
        case "clearTemplatePath":
          return await this.handleClearTemplatePath(msg);
        case "viewTemplate":
          return await this.handleViewTemplate(msg);
        default:
          this.postMessage({ type: "error", message: `Unknown message type: ${msg.type}` });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: "error", message: errMsg, requestType: msg.type });
    }
  }

  private async handleGetDiff(msg: Message) {
    const vibeRepo = requireString(msg, "vibeRepo");
    const vibeBranch = requireString(msg, "vibeBranch");
    const targetRepo = requireString(msg, "targetRepo");
    const targetBranch = requireString(msg, "targetBranch");
    const appDir = optionalString(msg, "appDir", ".");

    const diff = await generateDiff({
      vibeRepo,
      vibeBranch,
      targetRepo,
      targetBranch,
      appDir,
    });

    const categories = categorizeFiles(diff.statSummary);
    const routes = detectRoutes(vibeRepo, vibeBranch, appDir);

    this.postMessage({
      type: "diffResult",
      diff,
      categories,
      routes,
    });
  }

  private async handleImportAnalysis(msg: Message) {
    const analysis = msg.analysis as AiAnalysis;
    this.postMessage({ type: "analysisResult", analysis });
  }

  private async handleGetBoards() {
    const client = await createJiraClient(this.credProvider);
    const boards = await fetchBoards(client, client.credentials.projectKey);
    this.postMessage({ type: "boardsResult", boards });
  }

  private async handleGetSprints(msg: Message) {
    const client = await createJiraClient(this.credProvider);
    const boardId = optionalNumber(msg, "boardId", 0);
    if (!boardId) throw new Error("Missing required field: boardId");
    const sprints = await fetchSprints(client, boardId);
    this.postMessage({ type: "sprintsResult", sprints });
  }

  private async handleCreateTickets(msg: Message) {
    const client = await createJiraClient(this.credProvider);
    const progress = this.progress();
    const analysis = msg.analysis;
    if (!analysis || typeof analysis !== "object") {
      throw new Error("Missing required field: analysis");
    }

    const vibeRepo = optionalString(msg, "vibeRepo");
    const vibeBranch = optionalString(msg, "vibeBranch");
    const appDir = optionalString(msg, "appDir", ".");
    const rawSprintId = msg.sprintId;
    const sprintId = rawSprintId != null && rawSprintId !== 0 && rawSprintId !== ""
      ? String(rawSprintId)
      : null;

    const issueTypeMap = await getIssueTypes(client);
    const epicLabel = vscode.workspace.getConfiguration("specPilot").get<string>("epicLabel", "vibe-code");

    const keys = await createJiraTickets(
      client,
      analysis as AiAnalysis,
      new Map<string, string>(),
      {
        projectKey: client.credentials.projectKey,
        sprintId,
        dryRun: msg.dryRun === true,
        verbose: false,
      },
      vibeRepo,
      vibeBranch,
      appDir,
      progress,
      issueTypeMap,
      epicLabel,
    );

    this.postMessage({ type: "ticketsCreated", keys });
  }

  private async handleCaptureScreenshots(msg: Message) {
    const routes = Array.isArray(msg.routes) ? msg.routes as string[] : [];

    const screenshots = await captureScreenshots(
      {
        vibeRepo: requireString(msg, "vibeRepo"),
        vibeBranch: requireString(msg, "vibeBranch"),
        appDir: optionalString(msg, "appDir", "."),
        port: optionalNumber(msg, "port", 4000),
        interactiveScreenshots: false,
      },
      routes,
      ".auth-state.json",
      this.progress(),
    );

    // Map doesn't serialize via postMessage — convert to array
    const screenshotArray = [...screenshots.entries()].map(([route, path]) => ({ route, path }));
    this.postMessage({ type: "screenshotsResult", screenshots: screenshotArray });
  }

  private async handleCaptureStoryScreenshots(msg: Message) {
    if (!Array.isArray(msg.stories)) throw new Error("Missing required field: stories");
    const stories = msg.stories as { key: string; summary: string; description: string }[];
    const routes = Array.isArray(msg.routes) ? msg.routes as string[] : [];
    const prebuiltScenarios = Array.isArray(msg.scenarios) ? msg.scenarios as unknown[] : undefined;

    const mappings = await captureStoryScreenshots(
      {
        vibeRepo: requireString(msg, "vibeRepo"),
        vibeBranch: requireString(msg, "vibeBranch"),
        appDir: optionalString(msg, "appDir", "."),
        port: optionalNumber(msg, "port", 4000),
        interactiveScreenshots: false,
        stories,
        prebuiltScenarios: prebuiltScenarios as any,
      },
      routes,
      ".auth-state.json",
      this.progress(),
    );

    this.postMessage({ type: "storyScreenshotsResult", mappings });
  }

  private async handleMatchScreenshots(msg: Message) {
    if (!Array.isArray(msg.stories)) throw new Error("Missing required field: stories");
    const stories = msg.stories as { key: string; summary: string; hasAttachments: boolean; attachmentCount: number; description: string }[];
    // Screenshots arrive as [{route, path}] array or {route: path} object
    const rawScreenshots = msg.screenshots;
    const screenshots = new Map<string, string>(
      Array.isArray(rawScreenshots)
        ? (rawScreenshots as { route: string; path: string }[]).map(s => [s.route, s.path])
        : rawScreenshots && typeof rawScreenshots === "object"
          ? Object.entries(rawScreenshots as Record<string, string>)
          : []
    );

    const mapping = fallbackMapping(stories, screenshots);
    this.postMessage({ type: "matchResult", mapping });
  }

  private async handleGetVersions(msg: Message) {
    const client = await createJiraClient(this.credProvider);
    const projectKey = validateProjectKey(
      optionalString(msg, "projectKey") || client.credentials.projectKey
    );
    const res = await client.jiraFetch(
      `/rest/api/3/project/${projectKey}/versions`
    );
    const versions = await res.json();
    this.postMessage({ type: "versionsResult", versions });
  }

  private async handleSearchIssues(msg: Message) {
    const client = await createJiraClient(this.credProvider);
    const versionName = requireString(msg, "versionName");

    const config = vscode.workspace.getConfiguration("specPilot");
    const excludeTypes = config.get<string[]>("releaseNotes.excludeIssueTypes", []);
    const acFieldId = config.get<string>("acceptanceCriteriaFieldId", "");

    const exclusion = excludeTypes.length > 0
      ? ` AND issuetype not in (${excludeTypes.map((t) => `"${escapeJqlString(t)}"`).join(", ")})`
      : "";
    const jql = `fixVersion = "${escapeJqlString(versionName)}"${exclusion}`;
    const fields = ["summary", "issuetype", "project", "status", "description"];
    if (acFieldId) fields.push(acFieldId);

    const res = await client.jiraFetch("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({
        jql,
        fields,
        maxResults: 50,
      }),
    });
    const data = (await res.json()) as { issues?: JiraIssue[] };
    const issues = data.issues ?? [];

    this.postMessage({
      type: "issuesResult",
      issues: issues.map((i) => ({
        key: i.key,
        summary: i.fields.summary,
        type: i.fields.issuetype?.name,
        status: i.fields.status?.name ?? "",
      })),
    });
  }

  private async handleImportReleaseNotes(msg: Message) {
    if (!msg.notes || typeof msg.notes !== "object") throw new Error("Missing required field: notes");
    const notes = msg.notes as ReleaseNotesResult;
    const versionName = requireString(msg, "versionName");
    const plainText = formatPlainText(notes, versionName);

    this.postMessage({
      type: "releaseNotesResult",
      notes,
      plainText,
    });
  }

  private async handlePublishReleaseNotes(msg: Message) {
    const client = await createJiraClient(this.credProvider);
    const versionName = requireString(msg, "versionName");
    if (!msg.notes || typeof msg.notes !== "object") throw new Error("Missing required field: notes");
    const notes = msg.notes as Parameters<typeof publishToConfluence>[1];
    const editedPlainText = optionalString(msg, "plainText");
    const cloudId = await getCloudId(client.credentials.baseUrl);

    const results: string[] = [];

    try {
      const pageUrl = await publishToConfluence(client, notes, versionName, cloudId);
      results.push(`Confluence: ${pageUrl}`);
    } catch (err) {
      results.push(`Confluence failed: ${(err as Error).message}`);
    }

    try {
      const version = await getVersion(
        client,
        versionName,
        client.credentials.projectKey
      );
      const description = editedPlainText || notes.summary;
      await updateVersionDescription(client, version, description);
      results.push("Jira version description updated");
    } catch (err) {
      results.push(`Version update failed: ${(err as Error).message}`);
    }

    this.postMessage({ type: "publishResult", results });
  }

  private async handleGetSprintIssues() {
    const client = await createJiraClient(this.credProvider);
    const projectKey = client.credentials.projectKey;
    const boards = await fetchBoards(client, projectKey);
    if (boards.length === 0) {
      this.postMessage({ type: "sprintIssuesResult", issues: [] });
      return;
    }

    const sprintRes = await client.jiraFetch(
      `/rest/agile/1.0/board/${boards[0].id}/sprint?state=active`
    );
    const sprintData = (await sprintRes.json()) as { values?: { id: number }[] };
    const sprint = sprintData.values?.[0];
    if (!sprint) {
      this.postMessage({ type: "sprintIssuesResult", issues: [] });
      return;
    }

    const issuesRes = await client.jiraFetch(
      `/rest/agile/1.0/sprint/${sprint.id}/issue?maxResults=100&fields=summary,status,issuetype`
    );
    const data = (await issuesRes.json()) as { issues?: JiraIssue[] };
    const issues = data.issues ?? [];

    this.postMessage({
      type: "sprintIssuesResult",
      issues: issues.map((i) => ({
        key: i.key,
        summary: i.fields.summary,
        type: i.fields.issuetype?.name ?? "",
        status: i.fields.status?.name ?? "",
      })),
    });
  }

  private async handleGenerateAnalysis(msg: Message) {
    const statSummary = optionalString(msg, "statSummary");
    const categories = (msg.categories as Record<string, string[]>) || {};
    const routes = Array.isArray(msg.routes) ? msg.routes as string[] : [];

    if (Object.keys(categories).length === 0 && !statSummary) {
      throw new Error("No diff data available for analysis");
    }

    const tokenSource = new vscode.CancellationTokenSource();
    try {
      // Fetch existing vibe-code epics to avoid duplicating work
      this.postMessage({ type: "progress", message: "Fetching existing epics from Jira..." });
      let existingEpics: { key: string; summary: string; stories: { key: string; summary: string; description: string }[] }[] = [];
      try {
        const client = await createJiraClient(this.credProvider);
        const epicLabel = vscode.workspace.getConfiguration("specPilot").get<string>("epicLabel", "vibe-code");
        existingEpics = await fetchVibeCodeEpics(client, epicLabel);
      } catch {
        // Non-fatal — continue without existing epic context
      }

      const focusArea = optionalString(msg, "focusArea");

      this.postMessage({ type: "progress", message: "Generating analysis with AI..." });

      const analysis = await generateAnalysisWithAI(
        { statSummary, categories, routes, existingEpics, focusArea },
        tokenSource.token,
        this.credProvider,
      );

      if (!analysis) {
        this.postMessage({
          type: "error",
          message: "AI generation returned no results. Try again or use manual import.",
        });
        return;
      }

      this.postMessage({ type: "analysisResult", analysis });
    } catch (err) {
      this.postMessage({
        type: "error",
        message: `Analysis generation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      tokenSource.dispose();
    }
  }

  private async handleGenerateReleaseNotes(msg: Message) {
    if (!Array.isArray(msg.issues) || msg.issues.length === 0) {
      throw new Error("Missing required field: issues (non-empty array)");
    }
    const versionName = requireString(msg, "versionName");

    const issues = (msg.issues as unknown[])
      .slice(0, 200)
      .filter((item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" &&
        typeof (item as Record<string, unknown>).key === "string" &&
        typeof (item as Record<string, unknown>).summary === "string"
      )
      .map((item) => ({
        key: item.key as string,
        summary: item.summary as string,
        type: typeof item.type === "string" ? item.type : "",
      }));

    if (issues.length === 0) {
      throw new Error("No valid issues provided");
    }

    const tokenSource = new vscode.CancellationTokenSource();
    try {
      const notes = await generateReleaseNotesWithAI(
        { issues, versionName },
        tokenSource.token,
        this.credProvider,
      );

      if (!notes) {
        this.postMessage({
          type: "releaseNotesError",
          message: "AI generation returned no results. Try again or use manual import.",
        });
        return;
      }

      const plainText = formatPlainText(notes, versionName);
      this.postMessage({ type: "releaseNotesGenerated", notes, plainText });
    } catch (err) {
      this.postMessage({
        type: "releaseNotesError",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      tokenSource.dispose();
    }
  }

  private async handleGetEpicStories(msg: Message) {
    const client = await createJiraClient(this.credProvider);
    const epicKey = requireString(msg, "epicKey");
    const stories = await fetchEpicStories(client, epicKey);
    this.postMessage({ type: "epicStoriesResult", stories });
  }

  private async handleGetEpicDetails(msg: Message) {
    const client = await createJiraClient(this.credProvider);
    const epicKey = requireString(msg, "epicKey");
    const details = await fetchEpicDetails(client, epicKey);
    this.postMessage({ type: "epicDetailsResult", epic: details });
  }

  private async handleGenerateEpicStories(msg: Message) {
    const epicKey = requireString(msg, "epicKey");
    const epicSummary = requireString(msg, "epicSummary");
    const epicDescription = optionalString(msg, "epicDescription");
    const existingStories = Array.isArray(msg.existingStories)
      ? (msg.existingStories as { key: string; summary: string; description: string }[])
      : [];
    const focusArea = optionalString(msg, "focusArea");

    const tokenSource = new vscode.CancellationTokenSource();
    try {
      this.postMessage({ type: "progress", message: "Generating stories with AI..." });

      const analysis = await generateEpicStoriesWithAI(
        { epicKey, epicSummary, epicDescription, existingStories, focusArea },
        tokenSource.token,
        this.credProvider,
      );

      if (!analysis) {
        this.postMessage({
          type: "error",
          message: "AI generation returned no results. Try again or adjust the focus area.",
        });
        return;
      }

      this.postMessage({ type: "epicStoryGenResult", analysis });
    } catch (err) {
      this.postMessage({
        type: "error",
        message: `Story generation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      tokenSource.dispose();
    }
  }

  private async handleCreateStoriesForEpic(msg: Message) {
    const client = await createJiraClient(this.credProvider);
    const progress = this.progress();
    const epicKey = requireString(msg, "epicKey");
    const stories = msg.stories;
    if (!Array.isArray(stories)) throw new Error("Missing required field: stories");

    const isDryRun = msg.dryRun === true;

    if (isDryRun) {
      // Dry run: export MCP-compatible JSON for another tool to create
      const storyPlans = stories as import("../../core/types.js").StoryPlan[];
      const mcpCalls = storyPlans.map((s, i) => ({
        tool: "jira-create-issue",
        arguments: {
          projectKey: client.credentials.projectKey,
          issueType: "Story" as const,
          summary: s.title,
          description: [
            s.description,
            "",
            "## Acceptance Criteria",
            ...s.acceptanceCriteria.map((ac) => `- ${ac}`),
          ].join("\n"),
          parentKey: epicKey,
          labels: [vscode.workspace.getConfiguration("specPilot").get<string>("epicLabel", "vibe-code")],
        },
        _meta: {
          index: i,
          dependsOn: s.dependsOn ?? [],
        },
      }));

      const payload = {
        epicKey,
        generatedAt: new Date().toISOString(),
        stories: mcpCalls,
      };

      const { writeFileSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");
      const filename = `${epicKey.toLowerCase()}-stories.json`;
      const filePath = join(homedir(), "Documents", filename);
      writeFileSync(filePath, JSON.stringify(payload, null, 2));

      progress.report(`Dry run: exported ${mcpCalls.length} stories to ${filePath}`);

      const keys = mcpCalls.map((_, i) => `${client.credentials.projectKey}-DRY${i + 1}`);
      this.postMessage({ type: "storiesCreated", keys, dryRunFile: filePath });

      // Open the file in the editor
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      return;
    }

    const rawSprintId = msg.sprintId;
    const sprintId = rawSprintId != null && rawSprintId !== 0 && rawSprintId !== ""
      ? String(rawSprintId)
      : null;

    const issueTypeMap = await getIssueTypes(client);
    const epicLabel = vscode.workspace.getConfiguration("specPilot").get<string>("epicLabel", "vibe-code");

    const keys = await createStoriesForExistingEpic(
      client,
      epicKey,
      stories as import("../../core/types.js").StoryPlan[],
      {
        projectKey: client.credentials.projectKey,
        sprintId,
        dryRun: false,
      },
      optionalString(msg, "vibeRepo"),
      optionalString(msg, "vibeBranch"),
      progress,
      issueTypeMap,
      epicLabel,
    );

    this.postMessage({ type: "storiesCreated", keys });
  }

  private async handleBrowseFolder() {
    const result = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: "Select Folder",
    });
    if (result?.[0]) {
      this.postMessage({ type: "folderSelected", path: result[0].fsPath });
    }
  }

  private async handleGetConnectionStatus() {
    try {
      const creds = await this.credProvider.getCredentials();
      const client = await createJiraClient(this.credProvider);
      const res = await client.jiraFetch("/rest/api/3/myself");
      const user = (await res.json()) as { displayName?: string };

      this.postMessage({
        type: "connectionStatus",
        status: {
          connected: true,
          displayName: user.displayName ?? "Unknown",
          baseUrl: creds.baseUrl,
          projectKey: creds.projectKey,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({
        type: "connectionStatus",
        status: {
          connected: false,
          error: msg,
        },
      });
    }
  }

  private async handleOpenCommand(msg: Message) {
    const command = requireString(msg, "command");
    if (!command.startsWith("specPilot.")) {
      throw new Error(`Command not allowed: ${command}`);
    }
    await vscode.commands.executeCommand(command);
  }

  private handleGetAboutInfo() {
    const ext = vscode.extensions.getExtension("woolfpakstudios.specpilot");
    const pkg = (ext?.packageJSON ?? {}) as {
      version?: string;
      displayName?: string;
      publisher?: string;
      homepage?: string;
      repository?: { url?: string };
      bugs?: { url?: string };
      license?: string;
    };
    const repoUrl = pkg.repository?.url?.replace(/\.git$/, "") ?? "https://github.com/Cwoolf91/specpilot";
    this.postMessage({
      type: "aboutInfo",
      about: {
        name: pkg.displayName ?? "SpecPilot",
        version: pkg.version ?? "0.0.0",
        publisher: "Woolf Pak Studios",
        publisherId: pkg.publisher ?? "woolfpakstudios",
        license: pkg.license ?? "MIT",
        homepage: pkg.homepage ?? "https://woolfpakstudios.com",
        repository: repoUrl,
        bugs: pkg.bugs?.url ?? `${repoUrl}/issues`,
        discord: "https://discord.gg/GTqFP4gDJr",
        marketplace: `https://marketplace.visualstudio.com/items?itemName=${pkg.publisher ?? "woolfpakstudios"}.specpilot`,
      },
    });
  }

  private async handleOpenExternal(msg: Message) {
    const url = requireString(msg, "url");
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("Only http(s) URLs allowed");
      }
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private async handleGetCredentialsForm() {
    let creds: { baseUrl: string; email: string; projectKey: string } | null = null;
    try {
      const c = await this.credProvider.getCredentials();
      creds = { baseUrl: c.baseUrl, email: c.email, projectKey: c.projectKey };
    } catch {
      // not configured yet
    }
    const hasAnthropicKey = await this.credProvider.hasAnthropicApiKey();
    this.postMessage({
      type: "credentialsForm",
      form: {
        baseUrl: creds?.baseUrl ?? "",
        email: creds?.email ?? "",
        projectKey: creds?.projectKey ?? "",
        hasApiToken: creds !== null,
        hasAnthropicKey,
      },
    });
  }

  private async handleSaveCredentialsForm(msg: Message) {
    const baseUrl = requireString(msg, "baseUrl").trim().replace(/\/+$/, "");
    const email = requireString(msg, "email").trim();
    const projectKey = requireString(msg, "projectKey").trim();
    const apiTokenInput = typeof msg.apiToken === "string" ? msg.apiToken : "";

    if (!/^https:\/\/.+/.test(baseUrl)) {
      throw new Error("Jira Base URL must use HTTPS (e.g., https://yoursite.atlassian.net).");
    }

    // Blank token = keep existing. Require at least one stored or provided token.
    let apiToken = apiTokenInput.trim();
    if (!apiToken) {
      try {
        const existing = await this.credProvider.getCredentials();
        apiToken = existing.apiToken;
      } catch {
        throw new Error("API token is required for the first-time setup.");
      }
    }

    await this.credProvider.storeCredentials({ baseUrl, email, apiToken, projectKey });
    this.postMessage({ type: "credentialsSaved" });
    await this.handleGetConnectionStatus();
    await this.handleGetCredentialsForm();
  }

  private async handleSaveAnthropicKeyForm(msg: Message) {
    const apiKey = requireString(msg, "apiKey").trim();
    if (!apiKey.startsWith("sk-")) {
      throw new Error("Anthropic API keys start with 'sk-'.");
    }
    await this.credProvider.storeAnthropicApiKey(apiKey);
    this.postMessage({ type: "anthropicKeySaved" });
    await this.handleGetCredentialsForm();
  }

  private handleGetEpicLabel() {
    const config = vscode.workspace.getConfiguration("specPilot");
    const value = config.get<string>("epicLabel", "vibe-code");
    const defaultValue = (config.inspect<string>("epicLabel")?.defaultValue as string | undefined) ?? "vibe-code";
    this.postMessage({ type: "epicLabel", value, defaultValue });
  }

  private async handleSaveEpicLabel(msg: Message) {
    const rawValue = typeof msg.value === "string" ? msg.value : "";
    const value = rawValue.trim();
    if (!value) {
      throw new Error("Epic label cannot be empty.");
    }
    if (!/^[\w.-]+$/.test(value)) {
      throw new Error("Epic label may only contain letters, numbers, hyphens, underscores, and dots.");
    }
    await vscode.workspace
      .getConfiguration("specPilot")
      .update("epicLabel", value, vscode.ConfigurationTarget.Global);
    this.postMessage({ type: "epicLabelSaved", value });
  }

  private handleGetTemplatesForm() {
    const story = inspectTemplate("story");
    const epic = inspectTemplate("epic");
    this.postMessage({
      type: "templatesForm",
      form: { story, epic },
    });
  }

  private requireTemplateKind(msg: Message): TemplateKind {
    const kind = typeof msg.kind === "string" ? msg.kind : "";
    if (kind !== "story" && kind !== "epic") {
      throw new Error("kind must be 'story' or 'epic'");
    }
    return kind;
  }

  private async handleBrowseTemplate(msg: Message) {
    const kind = this.requireTemplateKind(msg);
    const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    const result = await vscode.window.showOpenDialog({
      canSelectFolders: false,
      canSelectFiles: true,
      canSelectMany: false,
      openLabel: `Select ${kind} template`,
      defaultUri,
      filters: { Templates: ["md", "txt", "template"] },
    });
    if (!result?.[0]) return;
    const stored = await saveTemplatePath(kind, result[0].fsPath);
    this.postMessage({ type: "templatePathSaved", kind, stored });
    this.handleGetTemplatesForm();
  }

  private async handleScaffoldTemplate(msg: Message) {
    const kind = this.requireTemplateKind(msg);
    const fullPath = await scaffoldTemplate(kind);
    this.postMessage({ type: "templateScaffolded", kind, path: fullPath });
    const doc = await vscode.workspace.openTextDocument(fullPath);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    this.handleGetTemplatesForm();
  }

  private async handleClearTemplatePath(msg: Message) {
    const kind = this.requireTemplateKind(msg);
    await clearTemplatePath(kind);
    this.postMessage({ type: "templatePathCleared", kind });
    this.handleGetTemplatesForm();
  }

  private async handleViewTemplate(msg: Message) {
    const kind = this.requireTemplateKind(msg);
    const info = inspectTemplate(kind);
    if (info.usingCustom && info.resolvedPath) {
      const doc = await vscode.workspace.openTextDocument(info.resolvedPath);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      return;
    }
    // Show built-in template in an untitled markdown buffer
    const doc = await vscode.workspace.openTextDocument({
      language: "markdown",
      content: getBuiltInTemplate(kind),
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  private async handleSaveSettings(msg: Message) {
    if (!this.globalState) return;
    const key = requireString(msg, "key");
    const value = msg.value;
    await this.globalState.update(`specPilot.${key}`, value);
  }

  private async handleGetSettings(msg: Message) {
    if (!this.globalState) return;
    const key = requireString(msg, "key");
    const value = this.globalState.get(`specPilot.${key}`);
    this.postMessage({ type: "settingsResult", key, value });
  }
}
