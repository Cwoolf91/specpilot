import * as vscode from "vscode";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, basename } from "path";
import { writeFile, unlink } from "fs/promises";

const LAST_CHECK_KEY = "specPilot.lastUpdateCheck";
const DISMISSED_VERSION_KEY = "specPilot.dismissedUpdateVersion";

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    url: string;
  }>;
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split("-")[0].split(".").map(Number);
  const pb = b.replace(/^v/, "").split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export class UpdateChecker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private checking = false;
  private outputChannel: vscode.OutputChannel;
  private githubOwner = "";
  private githubRepo = "";

  constructor(
    private context: vscode.ExtensionContext,
    private currentVersion: string
  ) {
    this.outputChannel = vscode.window.createOutputChannel("SpecPilot Updates");
  }

  start(): void {
    const config = vscode.workspace.getConfiguration("specPilot");

    // If no self-hosted update repo is configured, marketplace handles updates
    const updateRepo = config.get<string>("selfHostedUpdateRepo", "");
    if (!updateRepo) {
      this.outputChannel.appendLine("No selfHostedUpdateRepo configured — marketplace handles updates.");
      return;
    }

    // Parse "owner/repo" format
    const parts = updateRepo.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      this.outputChannel.appendLine(`Invalid selfHostedUpdateRepo format: "${updateRepo}" (expected "owner/repo").`);
      return;
    }
    this.githubOwner = parts[0];
    this.githubRepo = parts[1];

    if (!config.get<boolean>("autoUpdate", true)) {
      this.outputChannel.appendLine("Auto-update disabled via settings.");
      return;
    }

    const intervalMinutes = Math.max(config.get<number>("updateCheckIntervalMinutes", 60), 5);
    const intervalMs = intervalMinutes * 60 * 1000;

    const lastCheck = this.context.globalState.get<number>(LAST_CHECK_KEY, 0);
    if (Date.now() - lastCheck >= intervalMs) {
      void this.checkForUpdates(true);
    }

    this.timer = setInterval(() => this.checkForUpdates(true), intervalMs);
  }

  async checkForUpdates(silent = false): Promise<void> {
    if (this.checking) return;
    this.checking = true;

    try {
      // Ensure repo is configured (manual check may bypass start())
      if (!this.githubOwner || !this.githubRepo) {
        const updateRepo = vscode.workspace.getConfiguration("specPilot").get<string>("selfHostedUpdateRepo", "");
        if (!updateRepo) {
          if (!silent) {
            vscode.window.showInformationMessage("No selfHostedUpdateRepo configured — marketplace handles updates.");
          }
          return;
        }
        const parts = updateRepo.split("/");
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
          if (!silent) {
            vscode.window.showWarningMessage(`Invalid selfHostedUpdateRepo format: "${updateRepo}" (expected "owner/repo").`);
          }
          return;
        }
        this.githubOwner = parts[0];
        this.githubRepo = parts[1];
      }

      const token = await this.getGitHubToken(silent);
      if (!token) {
        if (!silent) {
          vscode.window.showWarningMessage(
            "GitHub authentication is required to check for updates. Use the command again after signing in."
          );
        }
        return;
      }

      const release = await this.fetchLatestRelease(token);
      this.context.globalState.update(LAST_CHECK_KEY, Date.now());

      if (!release) {
        if (!silent) {
          vscode.window.showWarningMessage("Could not fetch latest release from GitHub.");
        }
        return;
      }

      const latestVersion = release.tag_name.replace(/^v/, "");
      this.outputChannel.appendLine(
        `Version check: installed=${this.currentVersion}, latest=${latestVersion}`
      );

      if (compareVersions(latestVersion, this.currentVersion) <= 0) {
        if (!silent) {
          vscode.window.showInformationMessage(
            `SpecPilot is up to date (v${this.currentVersion}).`
          );
        }
        return;
      }

      // Skip if user already dismissed this version (background only)
      const dismissed = this.context.globalState.get<string>(DISMISSED_VERSION_KEY);
      if (silent && dismissed === latestVersion) {
        return;
      }

      this.outputChannel.appendLine(`Update available: v${latestVersion}`);

      const action = await vscode.window.showInformationMessage(
        `SpecPilot v${latestVersion} is available (current: v${this.currentVersion}).`,
        "Install Update",
        "Dismiss"
      );

      if (action === "Install Update") {
        await this.downloadAndInstall(release, token);
      } else if (action === "Dismiss") {
        this.context.globalState.update(DISMISSED_VERSION_KEY, latestVersion);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`Update check failed: ${msg}`);
      if (!silent) {
        vscode.window.showErrorMessage(`Update check failed: ${msg}`);
      }
    } finally {
      this.checking = false;
    }
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.outputChannel.dispose();
  }

  private async getGitHubToken(silent: boolean): Promise<string | undefined> {
    try {
      const session = await vscode.authentication.getSession(
        "github",
        ["repo"],
        { createIfNone: !silent }
      );
      return session?.accessToken;
    } catch {
      return undefined;
    }
  }

  private async fetchLatestRelease(token: string): Promise<GitHubRelease | undefined> {
    const url = `https://api.github.com/repos/${this.githubOwner}/${this.githubRepo}/releases/latest`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      this.outputChannel.appendLine(`GitHub API error: ${res.status} ${res.statusText}`);
      return undefined;
    }
    return (await res.json()) as GitHubRelease;
  }

  private async downloadAndInstall(release: GitHubRelease, token: string): Promise<void> {
    const vsixAsset = release.assets.find((a) => a.name.endsWith(".vsix"));
    if (!vsixAsset) {
      vscode.window.showErrorMessage("Release has no .vsix asset attached.");
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Downloading SpecPilot ${release.tag_name}...`,
        cancellable: false,
      },
      async () => {
        const res = await fetch(vsixAsset.url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/octet-stream",
          },
          signal: AbortSignal.timeout(120_000),
        });

        if (!res.ok) {
          throw new Error(`Download failed: ${res.status} ${res.statusText}`);
        }

        const buffer = Buffer.from(await res.arrayBuffer());

        // Verify SHA-256 checksum if available
        const checksumAsset = release.assets.find((a) => a.name === "checksums.sha256");
        if (checksumAsset) {
          try {
            const csRes = await fetch(checksumAsset.url, {
              headers: { Authorization: `Bearer ${token}`, Accept: "application/octet-stream" },
              signal: AbortSignal.timeout(15_000),
            });
            if (csRes.ok) {
              const checksumText = await csRes.text();
              const expectedHash = checksumText.split("\n")
                .find((line) => line.includes(vsixAsset.name))
                ?.split(/\s+/)[0];
              if (expectedHash) {
                const actualHash = createHash("sha256").update(buffer).digest("hex");
                if (actualHash !== expectedHash) {
                  throw new Error(`Checksum mismatch for ${vsixAsset.name}`);
                }
                this.outputChannel.appendLine(`Checksum verified: ${actualHash.slice(0, 16)}...`);
              }
            }
          } catch (err) {
            if (err instanceof Error && err.message.startsWith("Checksum mismatch")) {
              throw err;
            }
            this.outputChannel.appendLine(`Checksum verification skipped: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          this.outputChannel.appendLine("No checksum asset found — skipping verification.");
        }

        const tmpPath = join(tmpdir(), basename(vsixAsset.name));
        await writeFile(tmpPath, buffer);

        try {
          await vscode.commands.executeCommand(
            "workbench.extensions.installExtension",
            vscode.Uri.file(tmpPath)
          );

          // Clear dismissed version on successful install
          this.context.globalState.update(DISMISSED_VERSION_KEY, undefined);

          const action = await vscode.window.showInformationMessage(
            `SpecPilot updated to ${release.tag_name}. Reload to activate.`,
            "Reload Now",
            "Later"
          );
          if (action === "Reload Now") {
            await vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        } finally {
          await unlink(tmpPath).catch(() => {});
        }
      }
    );
  }
}
