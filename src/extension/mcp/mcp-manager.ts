import * as vscode from "vscode";
import { spawn, type ChildProcess } from "child_process";
import { join } from "path";

export class McpManager {
  private process: ChildProcess | undefined;
  private outputChannel: vscode.OutputChannel;
  private stopping = false;

  constructor(private extensionPath: string) {
    this.outputChannel = vscode.window.createOutputChannel("Jira MCP Server");
  }

  private static SAFE_ENV_KEYS = [
    "PATH", "HOME", "USER", "SHELL", "LANG", "TERM", "TMPDIR",
    "NODE_PATH", "NODE_OPTIONS", "NVM_DIR", "NVM_BIN",
    "JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT_KEY",
    "AWS_REGION", "AWS_PROFILE", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE",
  ];

  start(): void {
    if (this.process || this.stopping) {
      vscode.window.showInformationMessage(
        this.stopping ? "MCP server is stopping..." : "MCP server is already running."
      );
      return;
    }

    const filteredEnv: Record<string, string> = {};
    for (const key of McpManager.SAFE_ENV_KEYS) {
      if (process.env[key]) {
        filteredEnv[key] = process.env[key]!;
      }
    }

    const scriptPath = join(this.extensionPath, "scripts", "mcp-server.ts");
    this.process = spawn("npx", ["tsx", scriptPath], {
      cwd: this.extensionPath,
      stdio: ["pipe", "pipe", "pipe"],
      env: filteredEnv,
    });

    this.process.stdout?.on("data", (data) => {
      this.outputChannel.append(data.toString());
    });

    this.process.stderr?.on("data", (data) => {
      this.outputChannel.append(data.toString());
    });

    this.process.on("exit", (code) => {
      this.outputChannel.appendLine(`MCP server exited with code ${code}`);
      this.process = undefined;
      this.stopping = false;
    });

    this.outputChannel.show(true);
    vscode.window.showInformationMessage("MCP server started.");
  }

  stop(): void {
    if (!this.process) {
      vscode.window.showInformationMessage("MCP server is not running.");
      return;
    }

    this.stopping = true;
    this.process.kill();
    vscode.window.showInformationMessage("MCP server stopping...");
  }

  get isRunning(): boolean {
    return this.process !== undefined && !this.stopping;
  }

  dispose(): void {
    if (this.process) {
      this.process.kill();
      // Let the exit handler clear process ref; don't dispose output channel
      // until process exits
      this.process.on("exit", () => {
        this.outputChannel.dispose();
      });
    } else {
      this.outputChannel.dispose();
    }
  }
}
