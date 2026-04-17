import * as vscode from "vscode";
import type { TicketBriefing, BriefingFile } from "../../core/types.js";

export interface ResolvedBriefingFile extends BriefingFile {
  resolved: boolean;
  uri?: string; // vscode.Uri.toString() when resolved
}

export interface JumpstartInitData {
  issueKey: string;
  issueSummary: string;
  issueUrl: string;
  briefing: TicketBriefing | null;
  resolvedFiles: ResolvedBriefingFile[];
  aiPending: boolean;
}

type OpenFileHandler = (file: ResolvedBriefingFile) => void | Promise<void>;
type SearchFileHandler = (path: string) => void | Promise<void>;
type RegenerateHandler = () => void | Promise<void>;

export class JumpstartPanel {
  private panel: vscode.WebviewPanel | undefined;
  private data: JumpstartInitData | undefined;
  private pendingMessages: unknown[] = [];
  private webviewReady = false;

  private _onDidDispose = new vscode.EventEmitter<void>();
  readonly onDidDispose = this._onDidDispose.event;

  private openFileHandler?: OpenFileHandler;
  private searchFileHandler?: SearchFileHandler;
  private regenerateHandler?: RegenerateHandler;

  onOpenFile(handler: OpenFileHandler): void {
    this.openFileHandler = handler;
  }

  onSearchFile(handler: SearchFileHandler): void {
    this.searchFileHandler = handler;
  }

  onRegenerate(handler: RegenerateHandler): void {
    this.regenerateHandler = handler;
  }

  show(data: JumpstartInitData): void {
    this.data = data;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.postMessage({ type: "init", ...data });
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "specPilot.ticketJumpstart",
      `Jumpstart: ${data.issueKey}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.webviewReady = false;
    this.pendingMessages = [{ type: "init", ...data }];
    this.panel.webview.html = getHtml();
    this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this._onDidDispose.fire();
    });
  }

  updateBriefing(briefing: TicketBriefing | null, resolvedFiles: ResolvedBriefingFile[]): void {
    if (this.data) {
      this.data = { ...this.data, briefing, resolvedFiles, aiPending: false };
    }
    this.postMessage({ type: "briefing", briefing, resolvedFiles });
  }

  setAiUnavailable(): void {
    if (this.data) {
      this.data = { ...this.data, aiPending: false };
    }
    this.postMessage({ type: "aiUnavailable" });
  }

  postMessage(msg: unknown): void {
    if (this.webviewReady) {
      this.panel?.webview.postMessage(msg);
    } else {
      this.pendingMessages.push(msg);
    }
  }

  dispose(): void {
    this.panel?.dispose();
    this._onDidDispose.dispose();
  }

  private async handleMessage(msg: { type: string; [key: string]: unknown }): Promise<void> {
    if (msg.type === "ready") {
      this.webviewReady = true;
      for (const pending of this.pendingMessages) {
        this.panel?.webview.postMessage(pending);
      }
      this.pendingMessages = [];
      return;
    }

    if (!this.data) return;

    switch (msg.type) {
      case "openFile": {
        const idx = Number(msg.index);
        const file = this.data.resolvedFiles[idx];
        if (file && this.openFileHandler) {
          await this.openFileHandler(file);
        }
        break;
      }
      case "searchFile": {
        const path = typeof msg.path === "string" ? msg.path : "";
        if (path && this.searchFileHandler) {
          await this.searchFileHandler(path);
        }
        break;
      }
      case "openExternal": {
        const url = typeof msg.url === "string" ? msg.url : "";
        if (url.startsWith("https://")) {
          void vscode.env.openExternal(vscode.Uri.parse(url));
        }
        break;
      }
      case "regenerate": {
        if (this.regenerateHandler) {
          this.postMessage({ type: "aiRetrying" });
          await this.regenerateHandler();
        }
        break;
      }
      case "dismiss": {
        this.dispose();
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Inline HTML for the webview
// ---------------------------------------------------------------------------

function getHtml(): string {
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
  <title>Ticket Jumpstart</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      line-height: 1.5;
    }
    .header {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      margin-bottom: 4px;
    }
    .issue-key {
      font-weight: 700; font-size: 14px;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
    }
    .issue-key:hover { text-decoration: underline; }
    .confidence {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    }
    .confidence-high { background: #27ae60; color: #fff; }
    .confidence-medium { background: var(--vscode-badge-background); }
    .confidence-low {
      background: transparent;
      color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-panel-border);
    }
    .issue-summary {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 16px; font-size: 13px;
    }
    .brief-summary {
      padding: 10px 12px; margin-bottom: 16px;
      border-left: 3px solid var(--vscode-textLink-foreground);
      background: var(--vscode-editor-inactiveSelectionBackground, transparent);
      font-size: 13px;
    }
    .section { margin-bottom: 16px; opacity: 0; animation: fadeIn 200ms ease forwards; }
    .section:nth-child(1) { animation-delay: 0ms; }
    .section:nth-child(2) { animation-delay: 60ms; }
    .section:nth-child(3) { animation-delay: 120ms; }
    .section:nth-child(4) { animation-delay: 180ms; }
    @keyframes fadeIn { to { opacity: 1; } }
    .section h3 {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      color: var(--vscode-descriptionForeground); margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .file-row {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 8px 10px; margin-bottom: 4px; border-radius: 4px;
      background: var(--vscode-textCodeBlock-background, transparent);
      border: 1px solid var(--vscode-panel-border);
      cursor: pointer; transition: background 100ms ease;
    }
    .file-row:hover { background: var(--vscode-list-hoverBackground); }
    .file-row.unresolved { opacity: 0.65; cursor: default; }
    .file-row.unresolved:hover { background: var(--vscode-textCodeBlock-background, transparent); }
    .file-row .path {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px; font-weight: 500;
      word-break: break-all;
    }
    .file-row .reason {
      font-size: 12px; color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }
    .file-row .line {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px; color: var(--vscode-descriptionForeground);
      margin-left: 6px;
    }
    .file-row .search-btn {
      margin-left: auto; font-size: 11px;
      color: var(--vscode-textLink-foreground);
      background: none; border: none; cursor: pointer; padding: 2px 6px;
    }
    .file-row .search-btn:hover { text-decoration: underline; }
    ul.bullets { list-style: none; padding-left: 0; }
    ul.bullets li {
      position: relative; padding-left: 18px; margin-bottom: 6px;
      font-size: 13px;
    }
    ul.bullets li::before {
      content: "→"; position: absolute; left: 0; top: 0;
      color: var(--vscode-textLink-foreground);
    }
    .similar-row {
      padding: 6px 0; font-size: 12px;
    }
    .similar-row .title {
      color: var(--vscode-textLink-foreground); cursor: pointer; font-weight: 500;
    }
    .similar-row .title:hover { text-decoration: underline; }
    .similar-row .why {
      color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 2px;
    }
    .actions {
      display: flex; gap: 8px; margin-top: 20px; padding-top: 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .btn {
      padding: 6px 14px; border-radius: 4px; border: none;
      cursor: pointer; font-size: 12px; font-weight: 500;
      font-family: inherit;
    }
    .btn-primary {
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .spinner-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; margin-bottom: 16px; border-radius: 4px;
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
      padding: 10px 12px; margin-bottom: 16px; border-radius: 4px;
      font-size: 12px; color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-panel-border);
    }
    .info-bar a {
      color: var(--vscode-textLink-foreground); cursor: pointer;
      text-decoration: underline; margin-left: 4px;
    }
    .empty-hint {
      font-size: 12px; color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="header">
    <span class="issue-key" id="issue-key"></span>
    <span class="confidence hidden" id="confidence"></span>
  </div>
  <div class="issue-summary" id="issue-summary"></div>

  <div id="spinner-bar" class="spinner-bar hidden">
    <span class="dot"></span>
    <span>Briefing you on this ticket&hellip;</span>
  </div>

  <div id="info-bar" class="info-bar hidden"></div>

  <div id="brief-summary" class="brief-summary hidden"></div>

  <div class="section hidden" id="files-section">
    <h3>Start Here</h3>
    <div id="files-list"></div>
  </div>

  <div class="section hidden" id="starters-section">
    <h3>Steps</h3>
    <ul class="bullets" id="starters-list"></ul>
  </div>

  <div class="section hidden" id="implications-section">
    <h3>AC Implies</h3>
    <ul class="bullets" id="implications-list"></ul>
  </div>

  <div class="section hidden" id="similar-section">
    <h3>Similar Stories</h3>
    <div id="similar-list"></div>
  </div>

  <div class="actions">
    <button class="btn btn-secondary" id="regenerate-btn">Regenerate</button>
    <button class="btn btn-secondary" id="dismiss-btn">Dismiss</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = {};

    const $ = (id) => document.getElementById(id);

    vscode.postMessage({ type: "ready" });

    $("issue-key").addEventListener("click", () => {
      if (state.issueUrl) {
        vscode.postMessage({ type: "openExternal", url: state.issueUrl });
      }
    });

    $("dismiss-btn").addEventListener("click", () => {
      vscode.postMessage({ type: "dismiss" });
    });

    $("regenerate-btn").addEventListener("click", () => {
      vscode.postMessage({ type: "regenerate" });
    });

    function renderBriefing(briefing, resolvedFiles) {
      if (!briefing) {
        showAiUnavailable();
        return;
      }

      $("spinner-bar").classList.add("hidden");
      $("info-bar").classList.add("hidden");

      $("brief-summary").textContent = briefing.summary || "";
      $("brief-summary").classList.toggle("hidden", !briefing.summary);

      // Confidence
      const conf = $("confidence");
      const level = briefing.confidence || "medium";
      conf.textContent = "AI: " + level + " confidence";
      conf.className = "confidence confidence-" + level;
      conf.classList.remove("hidden");

      // Files
      const filesList = $("files-list");
      filesList.textContent = "";
      if (resolvedFiles && resolvedFiles.length > 0) {
        resolvedFiles.forEach((file, idx) => {
          const row = document.createElement("div");
          row.className = "file-row" + (file.resolved ? "" : " unresolved");

          const body = document.createElement("div");
          body.style.flex = "1";

          const pathLine = document.createElement("div");
          const path = document.createElement("span");
          path.className = "path";
          path.textContent = file.path;
          pathLine.appendChild(path);
          if (file.line) {
            const line = document.createElement("span");
            line.className = "line";
            line.textContent = ":" + file.line;
            pathLine.appendChild(line);
          }
          body.appendChild(pathLine);

          if (file.reason) {
            const reason = document.createElement("div");
            reason.className = "reason";
            reason.textContent = file.reason;
            body.appendChild(reason);
          }
          row.appendChild(body);

          if (file.resolved) {
            row.addEventListener("click", () => {
              vscode.postMessage({ type: "openFile", index: idx });
            });
          } else {
            const btn = document.createElement("button");
            btn.className = "search-btn";
            btn.textContent = "Search workspace";
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              vscode.postMessage({ type: "searchFile", path: file.path });
            });
            row.appendChild(btn);
          }

          filesList.appendChild(row);
        });
        $("files-section").classList.remove("hidden");
      } else {
        $("files-section").classList.add("hidden");
      }

      // Starters
      renderBulletList("starters-list", briefing.starters);
      $("starters-section").classList.toggle("hidden", !(briefing.starters && briefing.starters.length));

      // Implications
      renderBulletList("implications-list", briefing.implications);
      $("implications-section").classList.toggle("hidden", !(briefing.implications && briefing.implications.length));

      // Similar stories
      const similarList = $("similar-list");
      similarList.textContent = "";
      if (briefing.similarStories && briefing.similarStories.length > 0) {
        briefing.similarStories.forEach((s) => {
          const row = document.createElement("div");
          row.className = "similar-row";
          const title = document.createElement("div");
          title.className = "title";
          title.textContent = s.title;
          if (s.url) {
            title.addEventListener("click", () => {
              // url may be a key (e.g., PROJ-123); resolve via issueUrl base
              if (s.url.startsWith("https://")) {
                vscode.postMessage({ type: "openExternal", url: s.url });
              } else if (state.issueUrl) {
                const base = state.issueUrl.replace(/\\/browse\\/.*$/, "/browse/");
                vscode.postMessage({ type: "openExternal", url: base + s.url });
              }
            });
          }
          row.appendChild(title);
          if (s.why) {
            const why = document.createElement("div");
            why.className = "why";
            why.textContent = s.why;
            row.appendChild(why);
          }
          similarList.appendChild(row);
        });
        $("similar-section").classList.remove("hidden");
      } else {
        $("similar-section").classList.add("hidden");
      }
    }

    function renderBulletList(id, items) {
      const ul = $(id);
      ul.textContent = "";
      if (!items) return;
      items.forEach((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        ul.appendChild(li);
      });
    }

    function showAiUnavailable() {
      $("spinner-bar").classList.add("hidden");
      const info = $("info-bar");
      info.textContent = "";
      info.classList.remove("hidden");
      const msg = document.createElement("span");
      msg.textContent = "AI briefing unavailable.";
      const retry = document.createElement("a");
      retry.href = "#";
      retry.textContent = "Try again";
      retry.addEventListener("click", (e) => {
        e.preventDefault();
        vscode.postMessage({ type: "regenerate" });
      });
      info.appendChild(msg);
      info.appendChild(retry);
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      switch (msg.type) {
        case "init":
          state = msg;
          $("issue-key").textContent = msg.issueKey;
          $("issue-summary").textContent = msg.issueSummary || "";
          if (msg.aiPending) {
            $("spinner-bar").classList.remove("hidden");
          }
          if (msg.briefing) {
            renderBriefing(msg.briefing, msg.resolvedFiles || []);
          }
          break;

        case "briefing":
          renderBriefing(msg.briefing, msg.resolvedFiles || []);
          break;

        case "aiUnavailable":
          showAiUnavailable();
          break;

        case "aiRetrying":
          $("info-bar").classList.add("hidden");
          $("spinner-bar").classList.remove("hidden");
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
