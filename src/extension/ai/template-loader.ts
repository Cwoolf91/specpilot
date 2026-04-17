import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { STORY_TEMPLATE, EPIC_TEMPLATE } from "../../core/templates.js";

const outputChannel = vscode.window.createOutputChannel("SpecPilot: Templates");
const ALLOWED_EXTENSIONS = new Set([".md", ".txt", ".template"]);

export type TemplateKind = "story" | "epic";

const SETTING_KEY: Record<TemplateKind, string> = {
  story: "ai.storyTemplatePath",
  epic: "ai.epicTemplatePath",
};

const BUILT_IN: Record<TemplateKind, string> = {
  story: STORY_TEMPLATE,
  epic: EPIC_TEMPLATE,
};

export function getBuiltInTemplate(kind: TemplateKind): string {
  return BUILT_IN[kind];
}

export function getCustomTemplatePath(kind: TemplateKind): string {
  return vscode.workspace
    .getConfiguration("specPilot")
    .get<string>(SETTING_KEY[kind], "")
    .trim();
}

/**
 * Resolve a configured path to an absolute path, respecting workspace-relative
 * paths. Returns null if no workspace is open and the path is relative.
 */
function resolveConfiguredPath(customPath: string): string | null {
  if (path.isAbsolute(customPath)) return customPath;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return null;
  return path.resolve(root, customPath);
}

function isInsideWorkspace(abs: string): boolean {
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.some(
    (f) => abs === f.uri.fsPath || abs.startsWith(f.uri.fsPath + path.sep),
  );
}

/**
 * Load the effective template for the given kind. Returns the built-in default
 * if no custom path is configured, the file can't be read, or it's rejected by
 * validation (unsupported extension, outside workspace, empty file).
 */
export function loadTemplate(kind: TemplateKind): string {
  const customPath = getCustomTemplatePath(kind);
  if (!customPath) return BUILT_IN[kind];

  const ext = path.extname(customPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    outputChannel.appendLine(`${kind} template rejected: unsupported extension '${ext}'`);
    return BUILT_IN[kind];
  }

  const resolved = resolveConfiguredPath(customPath);
  if (!resolved) {
    outputChannel.appendLine(`${kind} template rejected: no workspace to resolve relative path`);
    return BUILT_IN[kind];
  }
  if (!isInsideWorkspace(resolved)) {
    outputChannel.appendLine(`${kind} template rejected: path outside workspace`);
    return BUILT_IN[kind];
  }
  try {
    const content = fs.readFileSync(resolved, "utf-8");
    if (!content.trim()) {
      outputChannel.appendLine(`${kind} template is empty, falling back to built-in`);
      return BUILT_IN[kind];
    }
    return content;
  } catch (err) {
    outputChannel.appendLine(
      `Failed to read ${kind} template at ${resolved}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return BUILT_IN[kind];
  }
}

export interface TemplateInfo {
  kind: TemplateKind;
  configuredPath: string;
  resolvedPath: string | null;
  usingCustom: boolean;
  exists: boolean;
  error: string | null;
}

export function inspectTemplate(kind: TemplateKind): TemplateInfo {
  const configured = getCustomTemplatePath(kind);
  if (!configured) {
    return {
      kind,
      configuredPath: "",
      resolvedPath: null,
      usingCustom: false,
      exists: false,
      error: null,
    };
  }
  const ext = path.extname(configured).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      kind,
      configuredPath: configured,
      resolvedPath: null,
      usingCustom: false,
      exists: false,
      error: `Unsupported file extension '${ext || "(none)"}'. Use .md, .txt, or .template.`,
    };
  }
  const resolved = resolveConfiguredPath(configured);
  if (!resolved) {
    return {
      kind,
      configuredPath: configured,
      resolvedPath: null,
      usingCustom: false,
      exists: false,
      error: "Open a workspace folder to use a relative template path.",
    };
  }
  if (!isInsideWorkspace(resolved)) {
    return {
      kind,
      configuredPath: configured,
      resolvedPath: resolved,
      usingCustom: false,
      exists: fs.existsSync(resolved),
      error: "Template must live inside a workspace folder.",
    };
  }
  const exists = fs.existsSync(resolved);
  return {
    kind,
    configuredPath: configured,
    resolvedPath: resolved,
    usingCustom: exists,
    exists,
    error: exists ? null : "File not found.",
  };
}

export async function saveTemplatePath(kind: TemplateKind, absPath: string): Promise<string> {
  const ext = path.extname(absPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type '${ext || "(none)"}'. Use .md, .txt, or .template.`);
  }
  if (!isInsideWorkspace(absPath)) {
    throw new Error("Template file must be inside a workspace folder.");
  }
  if (!fs.existsSync(absPath)) {
    throw new Error("File does not exist.");
  }

  // Prefer workspace-relative storage so the setting can be committed safely.
  const folder = (vscode.workspace.workspaceFolders ?? []).find(
    (f) => absPath === f.uri.fsPath || absPath.startsWith(f.uri.fsPath + path.sep),
  );
  const stored = folder ? path.relative(folder.uri.fsPath, absPath) : absPath;

  await vscode.workspace
    .getConfiguration("specPilot")
    .update(SETTING_KEY[kind], stored, vscode.ConfigurationTarget.Workspace);
  return stored;
}

export async function clearTemplatePath(kind: TemplateKind): Promise<void> {
  await vscode.workspace
    .getConfiguration("specPilot")
    .update(SETTING_KEY[kind], undefined, vscode.ConfigurationTarget.Workspace);
  await vscode.workspace
    .getConfiguration("specPilot")
    .update(SETTING_KEY[kind], undefined, vscode.ConfigurationTarget.Global);
}

/**
 * Create a .specpilot/<kind>-template.md file seeded with the built-in
 * template, then point the setting at it. Returns the absolute path.
 */
export async function scaffoldTemplate(kind: TemplateKind): Promise<string> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    throw new Error("Open a workspace folder before scaffolding a template.");
  }
  const root = folders[0].uri.fsPath;
  const dir = path.join(root, ".specpilot");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filename = kind === "story" ? "story-template.md" : "epic-template.md";
  const fullPath = path.join(dir, filename);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, BUILT_IN[kind], "utf-8");
  }
  await saveTemplatePath(kind, fullPath);
  return fullPath;
}
