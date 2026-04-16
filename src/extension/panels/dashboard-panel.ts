import * as vscode from "vscode";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { VscodeCredentialProvider } from "../credentials.js";
import { MessageHandler } from "./message-handler.js";

export class DashboardPanel {
  private panel: vscode.WebviewPanel | undefined;
  private messageHandler: MessageHandler | undefined;

  constructor(
    private extensionUri: vscode.Uri,
    private credProvider: VscodeCredentialProvider,
    private globalState: vscode.Memento
  ) {}

  reveal(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "specPilot.dashboard",
      "SpecPilot Dashboard",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "webview-dist"),
        ],
      }
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.messageHandler = new MessageHandler(this.credProvider, (msg) =>
      this.panel?.webview.postMessage(msg),
      this.globalState
    );

    this.panel.webview.onDidReceiveMessage((msg) =>
      this.messageHandler?.handle(msg)
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.messageHandler = undefined;
    });
  }

  postMessage(message: unknown): void {
    this.panel?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const distPath = join(this.extensionUri.fsPath, "webview-dist");
    const indexPath = join(distPath, "index.html");

    if (!existsSync(indexPath)) {
      return `<html><body><h2>Webview not built</h2><p>Run <code>npm run build:webview</code></p></body></html>`;
    }

    const assetsDir = join(distPath, "assets");
    const assetsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "webview-dist", "assets")
    );

    // Find the built JS and CSS files
    const assetFiles = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
    const jsFile = assetFiles.find((f) => f.endsWith(".js"));
    const cssFile = assetFiles.find((f) => f.endsWith(".css"));

    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
      `connect-src 'none'`,
      `frame-src 'none'`,
    ].join("; ");

    // Build HTML directly instead of rewriting Vite output —
    // avoids regex issues with Vite's asset paths and script attributes
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>SpecPilot Dashboard</title>
    ${cssFile ? `<link rel="stylesheet" href="${assetsUri}/${cssFile}">` : ""}
  </head>
  <body>
    <div id="root"></div>
    ${jsFile ? `<script nonce="${nonce}" type="module" src="${assetsUri}/${jsFile}"></script>` : ""}
  </body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
  }
}

function getNonce(): string {
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return randomBytes(24).toString("base64url");
}
