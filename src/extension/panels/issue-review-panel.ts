import * as vscode from "vscode";
import type { VscodeCredentialProvider } from "../credentials.js";
import { createJiraClient } from "../../core/jira-client.js";
import {
  buildAdfDocument,
  adfHeading,
  adfParagraph,
  adfCodeBlock,
  adfBulletList,
} from "../../core/adf.js";
import { fetchBoards, fetchSprints, moveToSprint } from "../../core/jira/sprints.js";
import { enhanceIssueWithAI } from "../ai/enhance-issue.js";

export interface IssueReviewData {
  issueType: string;
  issueTypeId: string;
  projectKey: string;
  summary: string;
  description: string;
  userStory: string;
  why: string;
  acceptanceCriteria: string[];
  releaseInstructions: string;
  selectedCode: string;
  filePath: string;
  lineRange: string;
  language: string;
  aiPending: boolean;
}

export class IssueReviewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private data: IssueReviewData | undefined;
  private pendingMessages: unknown[] = [];
  private webviewReady = false;
  private aiCts: vscode.CancellationTokenSource | undefined;

  private _onDidDispose = new vscode.EventEmitter<void>();
  readonly onDidDispose = this._onDidDispose.event;

  constructor(
    private credProvider: VscodeCredentialProvider
  ) {}

  show(data: IssueReviewData): void {
    this.data = data;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.postMessage({ type: "init", ...data });
      return;
    }

    const titleSummary = [...data.summary].slice(0, 40).join("");
    this.panel = vscode.window.createWebviewPanel(
      "specPilot.issueReview",
      `New ${data.issueType}: ${titleSummary}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.webviewReady = false;
    this.pendingMessages = [{ type: "init", ...data }];
    this.panel.webview.html = getHtml(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.cancelAi();
      this._onDidDispose.fire();
    });
  }

  postMessage(msg: unknown): void {
    if (this.webviewReady) {
      this.panel?.webview.postMessage(msg);
    } else {
      this.pendingMessages.push(msg);
    }
  }

  dispose(): void {
    this.cancelAi();
    this.panel?.dispose();
    this._onDidDispose.dispose();
  }

  private cancelAi(): void {
    if (this.aiCts) {
      this.aiCts.cancel();
      this.aiCts.dispose();
      this.aiCts = undefined;
    }
  }

  private async handleMessage(msg: { type: string; [key: string]: unknown }) {
    if (msg.type === "ready") {
      this.webviewReady = true;
      for (const pending of this.pendingMessages) {
        this.panel?.webview.postMessage(pending);
      }
      this.pendingMessages = [];
      return;
    }

    if (!this.data) return;
    const data = this.data;
    try {
      switch (msg.type) {
        case "getBoards": {
          const client = await createJiraClient(this.credProvider);
          const boards = await fetchBoards(client, data.projectKey);
          this.postMessage({ type: "boardsResult", boards });
          break;
        }
        case "getSprints": {
          const client = await createJiraClient(this.credProvider);
          const boardId = Number(msg.boardId);
          if (!boardId) throw new Error("Invalid boardId");
          const sprints = await fetchSprints(client, boardId);
          this.postMessage({ type: "sprintsResult", sprints });
          break;
        }
        case "createIssue": {
          await this.createIssue(msg);
          break;
        }
        case "cancel": {
          this.dispose();
          break;
        }
        case "retryAI": {
          this.cancelAi();
          this.postMessage({ type: "aiRetrying" });
          this.aiCts = new vscode.CancellationTokenSource();
          const token = this.aiCts.token;
          enhanceIssueWithAI(
            {
              issueType: data.issueType as "Bug" | "Story",
              projectKey: data.projectKey,
              summary: (msg.summary as string) || data.summary,
              description: (msg.description as string) || data.description,
              selectedCode: data.selectedCode,
              filePath: data.filePath,
              lineRange: data.lineRange,
              language: data.language,
            },
            token
          ).then((enhanced) => {
            if (token.isCancellationRequested) return;
            if (enhanced) {
              this.postMessage({ type: "aiResult", ...enhanced });
            } else {
              this.postMessage({ type: "aiUnavailable" });
            }
          }).catch(() => {
            if (token.isCancellationRequested) return;
            this.postMessage({ type: "aiUnavailable" });
          });
          break;
        }
        case "openExternal": {
          const url = msg.url as string;
          if (url.startsWith("https://")) {
            vscode.env.openExternal(vscode.Uri.parse(url));
          }
          break;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: "createError", message });
    }
  }

  private async createIssue(msg: { [key: string]: unknown }) {
    const data = this.data;
    if (!data) return;
    const summary = msg.summary as string;
    const sprintId = msg.sprintId as string | undefined;

    const adfContent = [];

    if (data.issueType === "Story") {
      const userStory = (msg.userStory as string) || "";
      const why = (msg.why as string) || "";
      const acceptanceCriteria = Array.isArray(msg.acceptanceCriteria)
        ? msg.acceptanceCriteria as string[]
        : [];
      const releaseInstructions = (msg.releaseInstructions as string) || "";

      if (userStory) {
        adfContent.push(adfHeading(3, "Story"));
        adfContent.push(adfParagraph(userStory));
      }
      if (why) {
        adfContent.push(adfHeading(3, "Why"));
        adfContent.push(adfParagraph(why));
      }
      if (acceptanceCriteria.length > 0) {
        adfContent.push(adfHeading(3, "Acceptance Criteria"));
        adfContent.push(adfBulletList(acceptanceCriteria));
      }
      if (releaseInstructions) {
        adfContent.push(adfHeading(3, "Release Instructions"));
        adfContent.push(adfParagraph(releaseInstructions));
      }
    } else {
      const description = (msg.description as string) || "";
      if (description) {
        adfContent.push(adfParagraph(description));
      }
    }

    adfContent.push(adfHeading(3, "Code Reference"));
    adfContent.push(adfParagraph(`${data.filePath} (${data.lineRange})`));
    adfContent.push(adfCodeBlock(data.selectedCode, data.language));

    const adfDescription = buildAdfDocument(adfContent);

    const client = await createJiraClient(this.credProvider);
    const res = await client.jiraFetch("/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify({
        fields: {
          project: { key: data.projectKey },
          issuetype: { id: data.issueTypeId },
          summary,
          description: adfDescription,
        },
      }),
    });

    const created = (await res.json()) as { key?: string };
    if (!created.key) {
      throw new Error(`Jira returned unexpected response: ${JSON.stringify(created)}`);
    }

    let warning: string | undefined;
    if (sprintId) {
      try {
        await moveToSprint(client, sprintId, [created.key]);
      } catch {
        warning = "Issue created but sprint assignment failed.";
      }
    }

    const creds = await this.credProvider.getCredentials();
    const url = `${creds.baseUrl}/browse/${created.key}`;
    this.postMessage({ type: "issueCreated", key: created.key, url, warning });
  }
}

// ---------------------------------------------------------------------------
// Inline HTML for the webview
// ---------------------------------------------------------------------------

function getHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `connect-src 'none'`,
    `frame-src 'none'`,
  ].join("; ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Review Issue</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
    }
    .header {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 16px; flex-wrap: wrap;
    }
    .badge {
      display: inline-block; padding: 2px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    }
    .badge-bug { background: #e74c3c; color: #fff; }
    .badge-story { background: #27ae60; color: #fff; }
    .badge-ai {
      background: var(--vscode-textLink-foreground); color: var(--vscode-editor-background);
      font-size: 10px;
    }
    .project { color: var(--vscode-descriptionForeground); font-weight: 600; }
    .field-group { margin-bottom: 14px; }
    .field-group label {
      display: block; margin-bottom: 4px; font-weight: 600;
      color: var(--vscode-foreground);
    }
    .field-group input, .field-group textarea, .field-group select {
      width: 100%; padding: 6px 8px; border-radius: 4px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      font-family: inherit; font-size: inherit; resize: vertical;
    }
    .field-group input:focus, .field-group textarea:focus, .field-group select:focus {
      outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder);
    }
    .hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
    .code-ref {
      background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px; padding: 8px; overflow-x: auto;
    }
    .code-ref code { font-family: var(--vscode-editor-font-family, monospace); }
    .code-ref pre {
      margin-top: 8px; white-space: pre-wrap; word-break: break-word;
      font-size: 12px; max-height: 200px; overflow-y: auto;
    }
    .code-path { font-size: 12px; color: var(--vscode-descriptionForeground); }
    details { margin-bottom: 14px; }
    details summary {
      cursor: pointer; font-weight: 600; padding: 4px 0;
      color: var(--vscode-textLink-foreground);
    }
    details .sprint-fields { padding-top: 8px; display: flex; flex-direction: column; gap: 8px; }
    .actions {
      display: flex; gap: 8px; margin-top: 16px; padding-top: 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .btn {
      padding: 6px 16px; border-radius: 4px; border: none;
      cursor: pointer; font-size: 13px; font-weight: 500;
    }
    .btn-primary {
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .spinner-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; margin-bottom: 14px; border-radius: 4px;
      background: var(--vscode-inputValidation-infoBackground, var(--vscode-editor-background));
      border: 1px solid var(--vscode-inputValidation-infoBorder, var(--vscode-panel-border));
      font-size: 12px;
    }
    .spinner-bar .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--vscode-textLink-foreground);
      animation: pulse 1s ease-in-out infinite alternate;
    }
    @keyframes pulse { from { opacity: 0.3; } to { opacity: 1; } }
    .info-bar {
      padding: 8px 12px; margin-bottom: 14px; border-radius: 4px;
      font-size: 12px; color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-panel-border);
    }
    .success-bar {
      padding: 12px; margin-top: 16px; border-radius: 4px; text-align: center;
      background: var(--vscode-inputValidation-infoBackground, var(--vscode-editor-background));
      border: 1px solid var(--vscode-inputValidation-infoBorder, var(--vscode-panel-border));
    }
    .success-bar a {
      color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: underline;
    }
    .error-bar {
      padding: 8px 12px; margin-bottom: 14px; border-radius: 4px;
      background: var(--vscode-inputValidation-errorBackground, var(--vscode-editor-background));
      border: 1px solid var(--vscode-inputValidation-errorBorder, #e74c3c);
      color: var(--vscode-errorForeground, #e74c3c); font-size: 12px;
    }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="header">
    <span class="badge" id="type-badge"></span>
    <span class="project" id="project-label"></span>
    <span class="badge badge-ai hidden" id="ai-badge">AI Enhanced</span>
  </div>

  <div id="spinner-bar" class="spinner-bar hidden">
    <span class="dot"></span>
    <span>Enhancing with AI&hellip;</span>
  </div>

  <div id="info-bar" class="info-bar hidden"></div>
  <div id="error-bar" class="error-bar hidden"></div>

  <div id="form-section">
    <div class="field-group">
      <label for="summary">Summary</label>
      <input type="text" id="summary" />
    </div>

    <!-- Story-specific BDD fields -->
    <div class="field-group hidden" id="user-story-section">
      <label for="userStory">User Story</label>
      <textarea id="userStory" rows="2" placeholder="As a <user>, I want to <need> so that <value>."></textarea>
    </div>

    <div class="field-group hidden" id="why-section">
      <label for="why">Why</label>
      <textarea id="why" rows="3" placeholder="Business value, user value, or operational value."></textarea>
    </div>

    <!-- Bug description field -->
    <div class="field-group hidden" id="description-section">
      <label for="description">Description</label>
      <textarea id="description" rows="6"></textarea>
    </div>

    <div class="field-group hidden" id="ac-section">
      <label for="acceptanceCriteria">Acceptance Criteria</label>
      <textarea id="acceptanceCriteria" rows="5" placeholder="Given <state>, when <action>, then <result>."></textarea>
      <p class="hint">One criterion per line (BDD Given/When/Then format)</p>
    </div>

    <div class="field-group hidden" id="release-section">
      <label for="releaseInstructions">Release Instructions</label>
      <textarea id="releaseInstructions" rows="2" placeholder="Feature flags, rollout considerations, dependencies."></textarea>
    </div>

    <div class="field-group">
      <label>Code Reference</label>
      <div class="code-ref">
        <span class="code-path" id="code-path"></span>
        <pre><code id="code-block"></code></pre>
      </div>
    </div>

    <details id="sprint-section">
      <summary>Sprint Assignment (optional)</summary>
      <div class="sprint-fields">
        <select id="board-select"><option value="">Loading boards&hellip;</option></select>
        <select id="sprint-select" disabled><option value="">Select a board first</option></select>
      </div>
    </details>

    <div class="actions">
      <button class="btn btn-primary" id="create-btn">Create Issue</button>
      <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
    </div>
  </div>

  <div id="success-section" class="success-bar hidden"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = {};
    let userEditedSummary = false;
    let userEditedStoryFields = false;
    let userEditedDescription = false;
    let boardsLoaded = false;
    let creating = false;

    const $ = (id) => document.getElementById(id);

    function isStory() { return state.issueType === "Story"; }

    function updateCreateButton() {
      $("create-btn").disabled = creating || !$("summary").value.trim();
    }

    $("summary").addEventListener("input", () => { userEditedSummary = true; updateCreateButton(); });
    $("description").addEventListener("input", () => { userEditedDescription = true; });
    $("userStory").addEventListener("input", () => { userEditedStoryFields = true; });
    $("why").addEventListener("input", () => { userEditedStoryFields = true; });

    vscode.postMessage({ type: "ready" });

    $("sprint-section").addEventListener("toggle", (e) => {
      if (e.target.open && !boardsLoaded) {
        boardsLoaded = true;
        vscode.postMessage({ type: "getBoards", projectKey: state.projectKey });
      }
    });

    $("board-select").addEventListener("change", (e) => {
      const boardId = Number(e.target.value);
      if (!boardId) return;
      $("sprint-select").disabled = true;
      $("sprint-select").innerHTML = '<option value="">Loading sprints&hellip;</option>';
      vscode.postMessage({ type: "getSprints", boardId });
    });

    $("create-btn").addEventListener("click", () => {
      if (creating || !$("summary").value.trim()) return;
      creating = true;
      $("create-btn").disabled = true;
      $("create-btn").textContent = "Creating\\u2026";
      $("error-bar").classList.add("hidden");

      const payload = {
        type: "createIssue",
        summary: $("summary").value.trim(),
        sprintId: $("sprint-select").value || undefined,
      };

      if (isStory()) {
        const ac = $("acceptanceCriteria").value.trim();
        Object.assign(payload, {
          userStory: $("userStory").value.trim(),
          why: $("why").value.trim(),
          acceptanceCriteria: ac ? ac.split("\\n").filter(Boolean) : [],
          releaseInstructions: $("releaseInstructions").value.trim(),
        });
      } else {
        Object.assign(payload, {
          description: $("description").value.trim(),
          acceptanceCriteria: [],
        });
      }

      vscode.postMessage(payload);
    });

    $("cancel-btn").addEventListener("click", () => {
      vscode.postMessage({ type: "cancel" });
    });

    function showStoryFields() {
      $("user-story-section").classList.remove("hidden");
      $("why-section").classList.remove("hidden");
      $("ac-section").classList.remove("hidden");
      $("release-section").classList.remove("hidden");
      $("description-section").classList.add("hidden");
    }

    function showBugFields() {
      $("description-section").classList.remove("hidden");
      $("user-story-section").classList.add("hidden");
      $("why-section").classList.add("hidden");
      $("ac-section").classList.add("hidden");
      $("release-section").classList.add("hidden");
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      switch (msg.type) {
        case "init":
          state = msg;
          $("type-badge").textContent = msg.issueType;
          $("type-badge").className = "badge badge-" + msg.issueType.toLowerCase();
          $("project-label").textContent = msg.projectKey;
          $("summary").value = msg.summary;
          $("code-path").textContent = msg.filePath + " (" + msg.lineRange + ")";
          $("code-block").textContent = msg.selectedCode;

          if (msg.issueType === "Story") {
            showStoryFields();
            $("userStory").value = msg.userStory || "";
            $("why").value = msg.why || "";
            $("acceptanceCriteria").value = (msg.acceptanceCriteria || []).join("\\n");
            $("releaseInstructions").value = msg.releaseInstructions || "";
          } else {
            showBugFields();
            $("description").value = msg.description || "";
          }

          if (msg.aiPending) {
            $("spinner-bar").classList.remove("hidden");
          }
          userEditedSummary = false;
          userEditedStoryFields = false;
          userEditedDescription = false;
          // Reset sprint state for new issue / different project
          boardsLoaded = false;
          $("board-select").innerHTML = '<option value="">Loading boards&hellip;</option>';
          $("sprint-select").innerHTML = '<option value="">Select a board first</option>';
          $("sprint-select").disabled = true;
          updateCreateButton();
          break;

        case "aiResult":
          $("spinner-bar").classList.add("hidden");
          $("ai-badge").classList.remove("hidden");
          if (!userEditedSummary) {
            $("summary").value = msg.summary;
          }
          if (isStory()) {
            if (!userEditedStoryFields) {
              if (msg.userStory) $("userStory").value = msg.userStory;
              if (msg.why) $("why").value = msg.why;
              if (msg.releaseInstructions) $("releaseInstructions").value = msg.releaseInstructions;
            }
            if (msg.acceptanceCriteria && msg.acceptanceCriteria.length > 0) {
              if (!$("acceptanceCriteria").value.trim()) {
                $("acceptanceCriteria").value = msg.acceptanceCriteria.join("\\n");
              }
            }
          } else {
            if (!userEditedDescription && msg.description) {
              $("description").value = msg.description;
            }
          }
          updateCreateButton();
          break;

        case "aiUnavailable":
          $("spinner-bar").classList.add("hidden");
          $("info-bar").textContent = "";
          $("info-bar").classList.remove("hidden");
          const infoText = document.createElement("span");
          infoText.textContent = "AI enhancement unavailable. ";
          const retryBtn = document.createElement("a");
          retryBtn.href = "#";
          retryBtn.textContent = "Retry AI";
          retryBtn.style.color = "var(--vscode-textLink-foreground)";
          retryBtn.style.cursor = "pointer";
          retryBtn.style.textDecoration = "underline";
          retryBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const retryPayload = {
              type: "retryAI",
              summary: $("summary").value.trim(),
              description: $("description").value.trim(),
            };
            if (isStory()) {
              retryPayload.userStory = $("userStory").value.trim();
              retryPayload.why = $("why").value.trim();
            }
            vscode.postMessage(retryPayload);
          });
          $("info-bar").appendChild(infoText);
          $("info-bar").appendChild(retryBtn);
          break;

        case "aiRetrying":
          $("info-bar").classList.add("hidden");
          $("spinner-bar").classList.remove("hidden");
          break;

        case "boardsResult": {
          const sel = $("board-select");
          sel.innerHTML = '<option value="">Select a board</option>';
          msg.boards.forEach((b) => {
            const opt = document.createElement("option");
            opt.value = b.id;
            opt.textContent = b.name;
            sel.appendChild(opt);
          });
          break;
        }

        case "sprintsResult": {
          const sel = $("sprint-select");
          sel.innerHTML = '<option value="">None</option>';
          sel.disabled = false;
          msg.sprints.forEach((s) => {
            const opt = document.createElement("option");
            opt.value = s.id;
            opt.textContent = s.name + (s.state === "active" ? " (active)" : "");
            sel.appendChild(opt);
          });
          break;
        }

        case "issueCreated": {
          $("form-section").classList.add("hidden");
          $("spinner-bar").classList.add("hidden");
          $("info-bar").classList.add("hidden");
          const sec = $("success-section");
          sec.classList.remove("hidden");
          sec.textContent = "";
          const created = document.createElement("span");
          created.textContent = "Created ";
          const strong = document.createElement("strong");
          strong.textContent = msg.key;
          const link = document.createElement("a");
          link.href = "#";
          link.textContent = "Open in Jira";
          link.addEventListener("click", (e) => {
            e.preventDefault();
            vscode.postMessage({ type: "openExternal", url: msg.url });
          });
          sec.appendChild(created);
          sec.appendChild(strong);
          sec.appendChild(document.createTextNode(" \\u2014 "));
          sec.appendChild(link);
          if (msg.warning) {
            const warn = document.createElement("p");
            warn.textContent = msg.warning;
            warn.style.marginTop = "8px";
            warn.style.fontSize = "12px";
            warn.style.color = "var(--vscode-editorWarning-foreground, orange)";
            sec.appendChild(warn);
          }
          break;
        }

        case "createError":
          creating = false;
          $("create-btn").disabled = false;
          $("create-btn").textContent = "Create Issue";
          $("error-bar").textContent = msg.message;
          $("error-bar").classList.remove("hidden");
          break;
      }
    });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return randomBytes(24).toString("base64url");
}
