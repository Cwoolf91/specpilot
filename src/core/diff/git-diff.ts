/**
 * Git diff generation and file categorization.
 */

import { execFileSync, execSync } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import type { DiffResult, DiffConfig } from "../types.js";
import { detectRoutes } from "./route-detection.js";

export function generateDiff(config: DiffConfig): DiffResult {
  const sameRepo = config.vibeRepo === config.targetRepo;
  const appPath = config.appDir === "." ? "" : config.appDir;

  let fullDiff: string;
  let statSummary: string;

  const excludeSpecs = [
    ":!**/node_modules/**",
    ":!**/*.lock",
    ":!**/package-lock.json",
    ":!**/dist/**",
    ":!**/.next/**",
    ":!**/.turbo/**",
  ];

  if (sameRepo) {
    const diffRef = `${config.targetBranch}...${config.vibeBranch}`;
    const pathArgs = ["--", appPath || ".", ...excludeSpecs];

    try {
      fullDiff = execFileSync(
        "git",
        ["-C", config.vibeRepo, "diff", diffRef, ...pathArgs],
        { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
      );
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string };
      if (execErr.stdout) {
        fullDiff = execErr.stdout;
      } else {
        throw new Error(
          `Git diff failed: ${execErr.stderr || "unknown error"}`
        );
      }
    }

    try {
      statSummary = execFileSync(
        "git",
        ["-C", config.vibeRepo, "diff", "--stat", diffRef, ...pathArgs],
        { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
      );
    } catch (err: unknown) {
      statSummary = (err as { stdout?: string }).stdout || "";
    }
  } else {
    let vibeWork: string | null = null;
    let targetWork: string | null = null;
    let vibeBase: string;
    let targetBase: string;

    try {
      // Check if vibe branch is already checked out
      const vibeCurrentBranch = execFileSync(
        "git",
        ["-C", config.vibeRepo, "rev-parse", "--abbrev-ref", "HEAD"],
        { encoding: "utf-8" }
      ).trim();

      if (vibeCurrentBranch === config.vibeBranch) {
        vibeBase = config.vibeRepo;
      } else {
        vibeWork = `/tmp/vibe-diff-${Date.now()}`;
        execFileSync(
          "git",
          ["-C", config.vibeRepo, "worktree", "add", vibeWork, config.vibeBranch],
          { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }
        );
        vibeBase = vibeWork;
      }

      // Check if target branch is already checked out
      const targetCurrentBranch = execFileSync(
        "git",
        ["-C", config.targetRepo, "rev-parse", "--abbrev-ref", "HEAD"],
        { encoding: "utf-8" }
      ).trim();

      if (targetCurrentBranch === config.targetBranch) {
        targetBase = config.targetRepo;
      } else {
        targetWork = `/tmp/target-diff-${Date.now()}`;
        execFileSync(
          "git",
          ["-C", config.targetRepo, "worktree", "add", targetWork, config.targetBranch],
          { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }
        );
        targetBase = targetWork;
      }

      // Only apply appDir to repos where the path actually exists.
      // The vibe code repo is often standalone (app at root) while
      // the target is a monorepo with the app under appDir.
      const vibeDir = appPath && existsSync(join(vibeBase, appPath))
        ? join(vibeBase, appPath)
        : vibeBase;
      const targetDir = appPath && existsSync(join(targetBase, appPath))
        ? join(targetBase, appPath)
        : targetBase;

      // Use git archive to export only tracked files, then diff those.
      // Diffing raw filesystem directories picks up node_modules, .git,
      // build artifacts, etc. that aren't tracked by git.
      const vibeExport = `/tmp/vibe-export-${Date.now()}`;
      const targetExport = `/tmp/target-export-${Date.now()}`;
      try {
        mkdirSync(vibeExport, { recursive: true });
        mkdirSync(targetExport, { recursive: true });

        // Export only git-tracked files from each branch
        execFileSync("bash", ["-c",
          `git -C "${vibeBase}" archive "${config.vibeBranch}" | tar -x -C "${vibeExport}"`
        ], { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 });
        execFileSync("bash", ["-c",
          `git -C "${targetBase}" archive "${config.targetBranch}" | tar -x -C "${targetExport}"`
        ], { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 });

        // Resolve appDir for each export
        const vibeExportDir = appPath && existsSync(join(vibeExport, appPath))
          ? join(vibeExport, appPath)
          : vibeExport;
        const targetExportDir = appPath && existsSync(join(targetExport, appPath))
          ? join(targetExport, appPath)
          : targetExport;

        try {
          fullDiff = execFileSync(
            "git",
            ["diff", "--no-index", "--", targetExportDir, vibeExportDir,
              ...excludeSpecs],
            { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
          );
        } catch (err: unknown) {
          fullDiff = (err as { stdout?: string }).stdout || "";
        }

        try {
          statSummary = execFileSync(
            "git",
            ["diff", "--no-index", "--stat", "--", targetExportDir, vibeExportDir,
              ...excludeSpecs],
            { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
          );
        } catch (err: unknown) {
          statSummary = (err as { stdout?: string }).stdout || "";
        }
      } finally {
        try { rmSync(vibeExport, { recursive: true, force: true }); } catch { /* best effort */ }
        try { rmSync(targetExport, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    } finally {
      if (vibeWork) {
        try {
          execFileSync(
            "git",
            ["-C", config.vibeRepo, "worktree", "remove", vibeWork, "--force"],
            { stdio: "ignore" }
          );
        } catch {
          /* best effort */
        }
      }
      if (targetWork) {
        try {
          execFileSync(
            "git",
            ["-C", config.targetRepo, "worktree", "remove", targetWork, "--force"],
            { stdio: "ignore" }
          );
        } catch {
          /* best effort */
        }
      }
    }
  }

  const statMatch = statSummary.match(
    /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/
  );
  const filesChanged = statMatch ? parseInt(statMatch[1], 10) : 0;
  const insertions = statMatch ? parseInt(statMatch[2] || "0", 10) : 0;
  const deletions = statMatch ? parseInt(statMatch[3] || "0", 10) : 0;

  const categorized = categorizeFiles(statSummary);
  const detectedRoutes = detectRoutes(config.vibeRepo, config.vibeBranch, config.appDir);

  return {
    fullDiff,
    statSummary,
    filesChanged,
    insertions,
    deletions,
    categorized,
    detectedRoutes,
  };
}

export function categorizeFiles(
  statSummary: string
): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    "Pages/Routes": [],
    Components: [],
    "API Routes": [],
    "Queries/Hooks": [],
    Types: [],
    "Utils/Lib": [],
    Config: [],
    Tests: [],
    Other: [],
  };

  const fileLines = statSummary
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes("|") || l.includes("=>"));

  for (const line of fileLines) {
    const fileMatch = line.match(/^\s*(.+?)\s*\|/);
    if (!fileMatch) continue;
    const file = fileMatch[1].trim();

    if (
      /\/(pages?|app)\/.+page\.(tsx?|jsx?)/.test(file) ||
      /\(pages\)/.test(file)
    ) {
      categories["Pages/Routes"].push(file);
    } else if (/\/components?\//.test(file)) {
      categories.Components.push(file);
    } else if (/\/api\//.test(file)) {
      categories["API Routes"].push(file);
    } else if (/\/(queries|hooks|use[A-Z])/.test(file)) {
      categories["Queries/Hooks"].push(file);
    } else if (/\/types?\/|\.d\.ts$/.test(file)) {
      categories.Types.push(file);
    } else if (/\/(lib|utils?|helpers?)\//.test(file)) {
      categories["Utils/Lib"].push(file);
    } else if (/\.(config|env)|middleware/.test(file)) {
      categories.Config.push(file);
    } else if (/__tests__|\.test\.|\.spec\./.test(file)) {
      categories.Tests.push(file);
    } else {
      categories.Other.push(file);
    }
  }

  for (const key of Object.keys(categories)) {
    if (categories[key].length === 0) delete categories[key];
  }

  return categories;
}
