/**
 * Vibe Code -> Jira Epic/Story Generator
 *
 * Compares a prototype ("vibe code") branch against a production branch,
 * uses Claude to generate a structured epic/story breakdown, captures
 * screenshots of the prototype UI, and creates Jira tickets with
 * visual references attached.
 *
 * Usage:
 *   npx tsx scripts/create-epic-stories.ts
 *   npx tsx scripts/create-epic-stories.ts --dry-run --no-screenshots
 *   npx tsx scripts/create-epic-stories.ts \
 *     --vibe-repo /path/to/repo --vibe-branch feature/prototype \
 *     --target-repo /path/to/repo --target-branch main \
 *     --app-dir apps/web
 */

import {
  JIRA_BASE_URL,
  PROJECT_KEY,
  credentialProvider,
} from "./config.js";
import { createJiraClient } from "../src/core/jira-client.js";
import { ConsoleProgressReporter } from "../src/core/progress.js";
import { validateShellArg, parseJsonResponse } from "../src/core/utils.js";

// Core imports
import { generateDiff } from "../src/core/diff/git-diff.js";
import { detectRoutes } from "../src/core/diff/route-detection.js";
import { fallbackMapping } from "../src/core/ai/screenshot-matcher.js";
import { captureScreenshots, captureStoryScreenshots } from "../src/core/screenshots/capture.js";
import { fetchBoards, fetchSprints } from "../src/core/jira/sprints.js";
import { fetchEpicStories, listVibeCodeTickets, createJiraTickets } from "../src/core/jira/issues.js";

import { createInterface } from "readline";
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { basename, dirname, resolve } from "path";
import { fileURLToPath } from "url";

import type {
  AiAnalysis,
  JiraClient,
  ScreenshotMapping,
  Sprint,
  JiraBoard,
} from "../src/core/types.js";
import type { ScreenshotScenario } from "../src/core/screenshots/scenarios.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const progress = new ConsoleProgressReporter();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CliArgs {
  vibeRepo?: string;
  vibeBranch?: string;
  targetRepo?: string;
  targetBranch?: string;
  appDir?: string;
  projectKey?: string;
  port?: number;
  augmentEpic?: string;
  routes?: string[];
  profile?: string;
  saveProfile?: string;
  scenarios?: string;
  analysis?: string;
  noScreenshots: boolean;
  interactiveScreenshots: boolean;
  replaceScreenshots: boolean;
  dryRun: boolean;
  verbose: boolean;
  yes: boolean;
  help: boolean;
  list: boolean;
}

interface Profile {
  vibeRepo?: string;
  vibeBranch?: string;
  targetRepo?: string;
  targetBranch?: string;
  appDir?: string;
  projectKey?: string;
  port?: number;
  routes?: string[];
}

interface RunConfig {
  vibeRepo: string;
  vibeBranch: string;
  targetRepo: string;
  targetBranch: string;
  appDir: string;
  port: number;
  projectKey: string;
  sprintId: string | null;
  boardId: string | null;
  noScreenshots: boolean;
  interactiveScreenshots: boolean;
  dryRun: boolean;
  verbose: boolean;
  yes: boolean;
}

// ---------------------------------------------------------------------------
// CLI Arg Parsing
// ---------------------------------------------------------------------------

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    noScreenshots: false,
    interactiveScreenshots: false,
    replaceScreenshots: false,
    dryRun: false,
    verbose: false,
    yes: false,
    help: false,
    list: false,
  };

  function requireValue(flag: string, i: number): string {
    const val = args[i];
    if (val === undefined || val.startsWith("--")) {
      console.error(`Error: ${flag} requires a value`);
      process.exit(1);
    }
    return val;
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--vibe-repo": result.vibeRepo = requireValue("--vibe-repo", ++i); break;
      case "--vibe-branch": result.vibeBranch = requireValue("--vibe-branch", ++i); break;
      case "--target-repo": result.targetRepo = requireValue("--target-repo", ++i); break;
      case "--target-branch": result.targetBranch = requireValue("--target-branch", ++i); break;
      case "--app-dir": result.appDir = requireValue("--app-dir", ++i); break;
      case "--project-key": result.projectKey = requireValue("--project-key", ++i); break;
      case "--augment-epic": result.augmentEpic = requireValue("--augment-epic", ++i); break;
      case "--routes": result.routes = requireValue("--routes", ++i).split(",").map((r) => r.trim()); break;
      case "--port": result.port = parseInt(requireValue("--port", ++i), 10); break;
      case "--profile": result.profile = requireValue("--profile", ++i); break;
      case "--save-profile": result.saveProfile = requireValue("--save-profile", ++i); break;
      case "--scenarios": result.scenarios = requireValue("--scenarios", ++i); break;
      case "--analysis": result.analysis = requireValue("--analysis", ++i); break;
      case "--no-screenshots": result.noScreenshots = true; break;
      case "--interactive-screenshots": result.interactiveScreenshots = true; break;
      case "--replace-screenshots": result.replaceScreenshots = true; break;
      case "--dry-run": result.dryRun = true; break;
      case "--verbose": result.verbose = true; break;
      case "--yes": result.yes = true; break;
      case "--help": result.help = true; break;
      case "--list": result.list = true; break;
      default:
        if (args[i].startsWith("--")) {
          console.error(`Unknown flag: ${args[i]}`);
          process.exit(1);
        }
        break;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Vibe Code -> Jira Epic/Story Generator

Compares a prototype branch against production, creates epics/stories
from a pre-built analysis JSON, captures UI screenshots, and creates Jira tickets.

Usage:
  npx tsx scripts/create-epic-stories.ts [options]

Options:
  --vibe-repo <path>            Path to repo with the prototype
  --vibe-branch <branch>        Prototype branch name
  --target-repo <path>          Production repo path (default: same as vibe-repo)
  --target-branch <branch>      Production branch (default: main)
  --app-dir <dir>               App subdirectory in monorepo (default: .)
  --port <number>               Dev server port (default: 4000)
  --project-key <key>           Jira project key (default: WEB)
  --augment-epic <key>          Add screenshots to an existing epic's stories
  --routes <r1,r2,...>          Specific routes to screenshot (comma-separated)
  --profile <name>              Load a saved profile
  --save-profile <name>         Save current flags as a named profile
  --scenarios <file>            Path to pre-built screenshot scenarios JSON
  --analysis <file>             Path to pre-built epic/story analysis JSON
  --no-screenshots              Skip screenshot capture
  --interactive-screenshots     Pause on each route for manual interaction before capture
  --replace-screenshots         Re-capture screenshots even if stories already have attachments
  --list                        List all vibe-code epics and stories in Jira
  --dry-run                     Show plan but don't create Jira tickets
  --yes                         Skip confirmation prompt
  --verbose                     Show diffs and AI prompts
  --help                        Show this help message
`);
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const PROFILES_PATH = resolve(__dirname, "..", "profiles.json");

function loadProfiles(): Record<string, Profile> {
  if (!existsSync(PROFILES_PATH)) return {};
  try { return JSON.parse(readFileSync(PROFILES_PATH, "utf-8")); } catch { return {}; }
}

function saveProfile(name: string, profile: Profile): void {
  const profiles = loadProfiles();
  profiles[name] = profile;
  writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2) + "\n");
  console.log(`Profile "${name}" saved to profiles.json`);
}

function applyProfile(cliArgs: CliArgs): CliArgs {
  if (!cliArgs.profile) return cliArgs;
  const profiles = loadProfiles();
  const profile = profiles[cliArgs.profile];
  if (!profile) {
    const available = Object.keys(profiles);
    console.error(`Profile "${cliArgs.profile}" not found.`);
    if (available.length > 0) console.error(`Available profiles: ${available.join(", ")}`);
    process.exit(1);
  }
  console.log(`Using profile: ${cliArgs.profile}`);
  return {
    ...cliArgs,
    vibeRepo: cliArgs.vibeRepo || profile.vibeRepo,
    vibeBranch: cliArgs.vibeBranch || profile.vibeBranch,
    targetRepo: cliArgs.targetRepo || profile.targetRepo,
    targetBranch: cliArgs.targetBranch || profile.targetBranch,
    appDir: cliArgs.appDir || profile.appDir,
    projectKey: cliArgs.projectKey || profile.projectKey,
    port: cliArgs.port || profile.port,
    routes: cliArgs.routes || profile.routes,
  };
}

// ---------------------------------------------------------------------------
// Interactive Prompts
// ---------------------------------------------------------------------------

function createReadline() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: ReturnType<typeof createReadline>, question: string): Promise<string> {
  return new Promise((resolve) => { rl.question(question, (answer) => resolve(answer.trim())); });
}

async function collectInputs(cliArgs: CliArgs, client: JiraClient): Promise<RunConfig> {
  const hasRequiredArgs = cliArgs.vibeRepo && cliArgs.vibeBranch;
  const interactive = !hasRequiredArgs;
  let rl: ReturnType<typeof createReadline> | null = null;

  async function prompt(question: string): Promise<string> {
    if (!rl) rl = createReadline();
    return ask(rl, question);
  }

  if (interactive) {
    console.log("\nVibe Code -> Jira Epic/Story Generator");
    console.log("=".repeat(50));
  }

  let vibeRepo: string, vibeBranch: string;
  if (interactive) {
    console.log("\nWhere is the prototype (vibe code)?");
    vibeRepo = cliArgs.vibeRepo || (await prompt("  Repo path: "));
    vibeBranch = cliArgs.vibeBranch || (await prompt("  Branch name: "));
  } else {
    vibeRepo = cliArgs.vibeRepo!;
    vibeBranch = cliArgs.vibeBranch!;
  }

  let targetRepo: string, targetBranch: string;
  if (interactive) {
    console.log("\nWhere should it be built (production target)?");
    const targetRepoInput = cliArgs.targetRepo || (await prompt(`  Repo path [${vibeRepo}]: `));
    targetRepo = targetRepoInput || vibeRepo;
    const targetBranchInput = cliArgs.targetBranch || (await prompt("  Branch name [main]: "));
    targetBranch = targetBranchInput || "main";
  } else {
    targetRepo = cliArgs.targetRepo || vibeRepo;
    targetBranch = cliArgs.targetBranch || "main";
  }

  const appDir = cliArgs.appDir || (interactive ? (await prompt("\nApp subdirectory in repo [.]: ")) || "." : ".");
  const projectKey = cliArgs.projectKey || (interactive
    ? (await prompt(`\nJira project key [${PROJECT_KEY}]: `)) || PROJECT_KEY
    : PROJECT_KEY);

  let boardId: string | null = null;
  let sprintId: string | null = null;

  if (interactive && !cliArgs.yes) {
    const wantSprint = await prompt("\nAssign to a sprint? [y/N]: ");
    if (wantSprint.toLowerCase() === "y") {
      const boards = await fetchBoards(client, projectKey);
      if (boards.length > 0) {
        console.log("\n  Available boards:");
        boards.forEach((b, i) => console.log(`    ${i + 1}. ${b.name} (ID ${b.id})`));
        const boardChoice = await prompt(`  Select board [1]: `);
        const boardIndex = (parseInt(boardChoice, 10) || 1) - 1;
        const selectedBoard = boards[Math.min(boardIndex, boards.length - 1)];
        boardId = String(selectedBoard.id);

        const sprints = await fetchSprints(client, selectedBoard.id);
        if (sprints.length > 0) {
          console.log("\n  Available sprints:");
          sprints.forEach((s, i) =>
            console.log(`    ${i + 1}. ${s.name}${s.startDate ? ` (${s.startDate.slice(0, 10)})` : ""}`)
          );
          console.log(`    ${sprints.length + 1}. Backlog (no sprint)`);
          const sprintChoice = await prompt(`  Select sprint [${sprints.length + 1}]: `);
          const sprintIndex = (parseInt(sprintChoice, 10) || sprints.length + 1) - 1;
          if (sprintIndex < sprints.length) {
            sprintId = String(sprints[sprintIndex].id);
            console.log(`  -> ${sprints[sprintIndex].name}`);
          } else {
            console.log("  -> Backlog");
          }
        }
      }
    }
  }

  const port = cliArgs.port || (interactive
    ? parseInt(await prompt("\nDev server port [4000]: "), 10) || 4000
    : 4000);

  if (rl) rl.close();

  validateShellArg(vibeRepo, "Vibe repo path");
  validateShellArg(vibeBranch, "Vibe branch");
  validateShellArg(targetRepo, "Target repo path");
  validateShellArg(targetBranch, "Target branch");
  validateShellArg(appDir, "App directory");

  return {
    vibeRepo: resolve(vibeRepo),
    vibeBranch,
    targetRepo: resolve(targetRepo),
    targetBranch,
    appDir,
    port,
    projectKey,
    sprintId,
    boardId,
    noScreenshots: cliArgs.noScreenshots,
    interactiveScreenshots: cliArgs.interactiveScreenshots,
    dryRun: cliArgs.dryRun,
    verbose: cliArgs.verbose,
    yes: cliArgs.yes,
  };
}

// ---------------------------------------------------------------------------
// Review & Confirm
// ---------------------------------------------------------------------------

function printReview(
  analysis: AiAnalysis,
  screenshots: Map<string, string>,
  config: RunConfig
): void {
  console.log("\n" + "=".repeat(60));
  console.log("PROPOSED JIRA TICKETS");
  console.log("=".repeat(60));
  console.log(`\nSummary: ${analysis.summary}\n`);

  let totalStories = 0;
  for (const [i, epic] of analysis.epics.entries()) {
    console.log(`Epic ${i + 1}: ${epic.title} (${epic.stories.length} stories)`);
    for (const [si, story] of epic.stories.entries()) {
      const hasScreenshot = story.screenshotRoutes.some((r) => screenshots.has(r));
      const deps = story.dependsOn?.length
        ? ` [depends on: ${story.dependsOn.map((d) => `#${d + 1}`).join(", ")}]`
        : "";
      console.log(`  ${si + 1}. ${story.title}${hasScreenshot ? " [screenshot]" : ""}${deps}`);
      totalStories++;
    }
  }

  console.log(`\nTotal: ${analysis.epics.length} epics, ${totalStories} stories, ${screenshots.size} screenshots`);
  console.log(`Project: ${config.projectKey}`);
  console.log(`Sprint: ${config.sprintId ? `ID ${config.sprintId}` : "Backlog"}`);

  if (analysis.newDependencies.length > 0) {
    console.log(`New dependencies: ${analysis.newDependencies.join(", ")}`);
  }
  if (analysis.infrastructureNotes.length > 0) {
    console.log(`Infrastructure notes:`);
    for (const note of analysis.infrastructureNotes) console.log(`  - ${note}`);
  }
  console.log("=".repeat(60));
}

async function confirmProceed(config: RunConfig): Promise<boolean> {
  if (config.yes) return true;
  if (config.dryRun) {
    console.log("\n--dry-run: Skipping Jira ticket creation.");
    return false;
  }
  const rl = createReadline();
  const answer = await ask(rl, "\nProceed with Jira ticket creation? [Y/n]: ");
  rl.close();
  return answer.toLowerCase() !== "n";
}

// ---------------------------------------------------------------------------
// Augment Mode
// ---------------------------------------------------------------------------

async function augmentEpicMode(cliArgs: CliArgs, client: JiraClient): Promise<void> {
  const epicKey = cliArgs.augmentEpic!;
  console.log(`\nAugment Epic: ${epicKey}`);
  console.log("=".repeat(50));

  const epicRes = await client.jiraFetch(`/rest/api/3/issue/${epicKey}?fields=summary`);
  const epicData = (await epicRes.json()) as { fields: { summary: string } };
  console.log(`Epic: ${epicData.fields.summary}`);

  console.log("\nFetching child stories...");
  const stories = await fetchEpicStories(client, epicKey);
  console.log(`  Found ${stories.length} stories`);

  let needScreenshots: typeof stories;
  const haveScreenshots = stories.filter((s) => s.hasAttachments);

  if (cliArgs.replaceScreenshots) {
    // Replace mode: target all stories (even those with existing attachments)
    needScreenshots = stories;
    if (haveScreenshots.length > 0) {
      console.log(`  Will replace attachments on: ${haveScreenshots.map((s) => s.key).join(", ")}`);
    }
  } else {
    needScreenshots = stories.filter((s) => !s.hasAttachments);
    if (haveScreenshots.length > 0) {
      console.log(`  Already have attachments: ${haveScreenshots.map((s) => s.key).join(", ")}`);
    }
    if (needScreenshots.length === 0) {
      console.log("\nAll stories already have attachments. Use --replace-screenshots to re-capture.");
      return;
    }
  }
  console.log(`  Targeting: ${needScreenshots.map((s) => s.key).join(", ")}`);

  let rl: ReturnType<typeof createReadline> | null = null;
  async function prompt(question: string): Promise<string> {
    if (!rl) rl = createReadline();
    return ask(rl, question);
  }

  const needsPrompts = !cliArgs.vibeRepo || !cliArgs.vibeBranch;
  const vibeRepo = cliArgs.vibeRepo || (await prompt("\nVibe code repo path: "));
  const vibeBranch = cliArgs.vibeBranch || (await prompt("Vibe code branch: "));
  const appDir = cliArgs.appDir || (needsPrompts ? (await prompt("App subdirectory [.]: ")) || "." : ".");
  const port = cliArgs.port || (needsPrompts ? parseInt(await prompt("Dev server port [4000]: "), 10) || 4000 : 4000);
  if (rl) rl.close();

  const resolvedVibeRepo = resolve(vibeRepo);
  validateShellArg(vibeRepo, "Vibe repo path");
  validateShellArg(vibeBranch, "Vibe branch");

  // Detect or use specified routes
  let routes: string[];
  if (cliArgs.routes && cliArgs.routes.length > 0) {
    routes = cliArgs.routes;
    console.log(`\nUsing specified routes: ${routes.join(", ")}`);
  } else {
    console.log("\nDetecting page routes...");
    routes = detectRoutes(resolvedVibeRepo, vibeBranch, appDir);
    console.log(`  Found ${routes.length} routes: ${routes.join(", ")}`);
  }

  if (routes.length === 0) {
    console.log("No routes — cannot capture screenshots.");
    return;
  }

  // Capture screenshots
  const authStatePath = resolve(__dirname, "..", ".auth-state.json");
  console.log("\nCapturing screenshots...");

  let mappings: ScreenshotMapping[];

  // Load pre-built scenarios from file if provided
  let prebuiltScenarios: ScreenshotScenario[] | undefined;
  if (cliArgs.scenarios) {
    const scenariosPath = resolve(cliArgs.scenarios);
    if (!existsSync(scenariosPath)) {
      console.error(`Scenarios file not found: ${scenariosPath}`);
      process.exit(1);
    }
    const raw = parseJsonResponse<ScreenshotScenario[] | { scenarios: ScreenshotScenario[] }>(
      readFileSync(scenariosPath, "utf-8")
    );
    prebuiltScenarios = Array.isArray(raw) ? raw : raw.scenarios;
    console.log(`  Loaded ${prebuiltScenarios.length} scenarios from ${cliArgs.scenarios}`);
  }

  if (prebuiltScenarios && !cliArgs.interactiveScreenshots) {
    // Story-aware capture: uses pre-built scenarios
    const storyInputs = needScreenshots.map((s) => ({
      key: s.key,
      summary: s.summary,
      description: s.description,
    }));

    mappings = await captureStoryScreenshots(
      {
        vibeRepo: resolvedVibeRepo,
        vibeBranch,
        appDir,
        port,
        interactiveScreenshots: false,
        stories: storyInputs,
        prebuiltScenarios,
      },
      routes,
      authStatePath,
      progress,
    );
  } else {
    // Fallback: route-based capture + keyword matching
    const screenshots = await captureScreenshots(
      { vibeRepo: resolvedVibeRepo, vibeBranch, appDir, port, interactiveScreenshots: cliArgs.interactiveScreenshots },
      routes,
      authStatePath,
      progress
    );
    console.log(`  Captured ${screenshots.size} screenshots`);

    if (screenshots.size === 0) {
      console.log("No screenshots captured. Nothing to upload.");
      return;
    }

    console.log("\nMatching screenshots to stories...");
    mappings = fallbackMapping(needScreenshots, screenshots);
  }

  if (mappings.length === 0) {
    console.log("No screenshot mappings produced. Nothing to upload.");
    return;
  }

  // Review
  console.log("\n" + "=".repeat(60));
  console.log("SCREENSHOT ATTACHMENT PLAN");
  console.log("=".repeat(60));
  for (const mapping of mappings) {
    console.log(`  ${mapping.storyKey}: ${mapping.storySummary}`);
    for (const path of mapping.screenshotPaths) {
      console.log(`    -> ${basename(path)}`);
    }
  }

  const totalAttachments = mappings.reduce((sum, m) => sum + m.screenshotPaths.length, 0);
  console.log(`\nTotal: ${totalAttachments} attachments to ${mappings.length} stories`);
  console.log("=".repeat(60));

  if (cliArgs.dryRun) {
    console.log("\n--dry-run: Skipping uploads.");
    return;
  }

  if (!cliArgs.yes) {
    const confirmRl = createReadline();
    const answer = await ask(confirmRl, "\nProceed with uploads? [Y/n]: ");
    confirmRl.close();
    if (answer.toLowerCase() === "n") {
      console.log("Aborted.");
      return;
    }
  }

  // Upload
  console.log("\nUploading screenshots...");
  let uploaded = 0;
  let failed = 0;
  for (const mapping of mappings) {
    for (const filepath of mapping.screenshotPaths) {
      try {
        await client.uploadAttachment(mapping.storyKey, filepath);
        console.log(`  [OK] ${mapping.storyKey} <- ${basename(filepath)}`);
        uploaded++;
      } catch (err) {
        console.log(`  [FAIL] ${mapping.storyKey} <- ${basename(filepath)}: ${(err as Error).message.split("\n")[0]}`);
        failed++;
      }
    }
  }

  console.log(`\nDone! Uploaded ${uploaded} screenshots${failed > 0 ? `, ${failed} failed` : ""}.`);
  console.log(`View epic: ${JIRA_BASE_URL}/browse/${epicKey}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let cliArgs = parseArgs();

  if (cliArgs.help) {
    printHelp();
    process.exit(0);
  }

  cliArgs = applyProfile(cliArgs);

  // Save profile if requested
  if (cliArgs.saveProfile) {
    saveProfile(cliArgs.saveProfile, {
      vibeRepo: cliArgs.vibeRepo,
      vibeBranch: cliArgs.vibeBranch,
      targetRepo: cliArgs.targetRepo,
      targetBranch: cliArgs.targetBranch,
      appDir: cliArgs.appDir,
      projectKey: cliArgs.projectKey,
      port: cliArgs.port,
      routes: cliArgs.routes,
    });
    if (!cliArgs.augmentEpic && !cliArgs.list && !cliArgs.vibeRepo) return;
  }

  const client = await createJiraClient(credentialProvider);

  // List mode
  if (cliArgs.list) {
    await listVibeCodeTickets(client, cliArgs.projectKey || PROJECT_KEY, progress);
    return;
  }

  // Augment mode
  if (cliArgs.augmentEpic) {
    await augmentEpicMode(cliArgs, client);
    return;
  }

  // Phase 1: Collect inputs
  const config = await collectInputs(cliArgs, client);

  console.log("\n" + "=".repeat(50));
  console.log("Configuration:");
  console.log(`  Vibe:   ${config.vibeRepo} @ ${config.vibeBranch}`);
  console.log(`  Target: ${config.targetRepo} @ ${config.targetBranch}`);
  console.log(`  App:    ${config.appDir}`);
  console.log(`  Project: ${config.projectKey}`);
  console.log(`  Sprint:  ${config.sprintId || "Backlog"}`);
  console.log(`  Screenshots: ${config.noScreenshots ? "disabled" : "enabled"}`);
  if (config.dryRun) console.log("  Mode: DRY RUN");
  console.log("=".repeat(50));

  // Phase 2: Gap Analysis
  console.log("\nPhase 2: Analyzing code gap...");
  const diff = generateDiff(config);
  console.log(`  ${diff.filesChanged} files changed, ${diff.insertions} insertions(+), ${diff.deletions} deletions(-)`);

  if (Object.keys(diff.categorized).length > 0) {
    console.log("  File categories:");
    for (const [cat, files] of Object.entries(diff.categorized)) {
      console.log(`    ${cat}: ${files.length} files`);
    }
  }

  if (diff.detectedRoutes.length > 0) {
    console.log(`  Detected ${diff.detectedRoutes.length} page routes: ${diff.detectedRoutes.join(", ")}`);
  }

  if (diff.filesChanged === 0) {
    console.log("\nNo differences found between branches. Nothing to do.");
    process.exit(0);
  }

  if (!cliArgs.analysis) {
    // Output diff context for Claude to analyze, then require --analysis <file>
    console.log("\n  Diff generated. Use Claude to analyze this diff and produce an analysis JSON.");
    console.log("  Then re-run with: --analysis <file>\n");
    console.log("  The analysis JSON should match the AiAnalysis type:");
    console.log('  { "epics": [...], "summary": "...", "newDependencies": [...], "infrastructureNotes": [...] }');
    process.exit(0);
  }

  const analysisPath = resolve(cliArgs.analysis);
  if (!existsSync(analysisPath)) {
    console.error(`Analysis file not found: ${analysisPath}`);
    process.exit(1);
  }
  const analysisRaw = readFileSync(analysisPath, "utf-8");
  const analysis = parseJsonResponse<AiAnalysis>(analysisRaw);
  console.log(`  Loaded analysis: ${analysis.epics.length} epics with ${analysis.epics.reduce((sum, e) => sum + e.stories.length, 0)} stories`);

  // Phase 3: Screenshots
  let screenshots = new Map<string, string>();
  if (!config.noScreenshots && diff.detectedRoutes.length > 0) {
    console.log("\nPhase 3: Capturing screenshots...");
    const authStatePath = resolve(__dirname, "..", ".auth-state.json");
    screenshots = await captureScreenshots(
      { vibeRepo: config.vibeRepo, vibeBranch: config.vibeBranch, appDir: config.appDir, port: config.port, interactiveScreenshots: config.interactiveScreenshots },
      diff.detectedRoutes,
      authStatePath,
      progress
    );
    console.log(`  Captured ${screenshots.size} of ${diff.detectedRoutes.length} routes`);
  } else if (config.noScreenshots) {
    console.log("\nPhase 3: Screenshots disabled (--no-screenshots)");
  } else {
    console.log("\nPhase 3: No routes detected — skipping screenshots");
  }

  // Phase 4: Review & Confirm
  printReview(analysis, screenshots, config);
  const proceed = await confirmProceed(config);

  if (!proceed) {
    console.log("\nAborted. No tickets created.");
    process.exit(0);
  }

  // Phase 5: Create Jira Tickets
  const issueKeys = await createJiraTickets(
    client,
    analysis,
    screenshots,
    {
      projectKey: config.projectKey,
      sprintId: config.sprintId,
      dryRun: config.dryRun,
      verbose: config.verbose,
    },
    config.vibeRepo,
    config.vibeBranch,
    config.appDir,
    progress
  );

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DONE!");
  console.log("=".repeat(60));
  console.log(`Created ${issueKeys.length} tickets: ${issueKeys.join(", ")}`);
  console.log(`View in Jira: ${JIRA_BASE_URL}/issues/?jql=labels%3Dvibe-code+AND+project%3D${config.projectKey}+ORDER+BY+created+DESC`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
