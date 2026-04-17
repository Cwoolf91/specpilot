/**
 * vscode API mock used by vitest unit tests.
 *
 * The real `vscode` module is only available inside a VS Code extension host.
 * When we run extension code under vitest, imports of `vscode` are aliased to
 * this file (see vitest.workspace.ts). Each test should import helpers from
 * here directly to drive the mock (e.g. set config values, capture calls).
 *
 * Design notes:
 * - Every method is a vi.fn() so tests can assert on call args.
 * - State is reset by `resetVscodeMock()`, which is called in tests/setup.
 * - We keep behavior minimal — enough to activate the extension and exercise
 *   each module's happy path. Tests enrich behavior per-case.
 */
import { vi } from "vitest";

/* ------------------------------------------------------------------ Enums */

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;
export const ViewColumn = {
  Active: -1,
  Beside: -2,
  One: 1,
  Two: 2,
  Three: 3,
} as const;
export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
} as const;
export const ProgressLocation = {
  SourceControl: 1,
  Window: 10,
  Notification: 15,
} as const;
export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
} as const;
export const ExtensionKind = { UI: 1, Workspace: 2 } as const;
export const FileType = {
  Unknown: 0,
  File: 1,
  Directory: 2,
  SymbolicLink: 64,
} as const;

/* ------------------------------------------------------------------ Types */

export class ThemeIcon {
  static readonly File = new ThemeIcon("file");
  static readonly Folder = new ThemeIcon("folder");
  constructor(public readonly id: string, public readonly color?: ThemeColor) {}
}
export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class TreeItem {
  public label?: string;
  public description?: string | boolean;
  public tooltip?: string;
  public iconPath?: ThemeIcon | string;
  public contextValue?: string;
  public command?: { command: string; title: string; arguments?: unknown[] };
  public collapsibleState?: number;
  public resourceUri?: Uri;
  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class EventEmitter<T> {
  private listeners: Array<(value: T) => void> = [];
  public event = (listener: (value: T) => void): Disposable => {
    this.listeners.push(listener);
    return { dispose: () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    }};
  };
  fire(value: T): void {
    for (const l of this.listeners) l(value);
  }
  dispose(): void {
    this.listeners = [];
  }
}

export interface Disposable { dispose(): void }

export class CancellationTokenSource {
  public token = {
    isCancellationRequested: false,
    onCancellationRequested: new EventEmitter<void>().event,
  };
  cancel(): void {
    this.token.isCancellationRequested = true;
  }
  dispose(): void {}
}

export class Uri {
  private constructor(
    public scheme: string,
    public authority: string,
    public path: string,
    public query = "",
    public fragment = "",
  ) {}
  get fsPath(): string { return this.path; }
  static file(path: string): Uri { return new Uri("file", "", path); }
  static parse(value: string): Uri {
    const m = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^\/]*)(\/.*)?$/);
    if (m) return new Uri(m[1], m[2] ?? "", m[3] ?? "");
    return new Uri("file", "", value);
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    const joined = [base.path, ...segments].join("/").replace(/\/+/g, "/");
    return new Uri(base.scheme, base.authority, joined);
  }
  toString(): string { return `${this.scheme}://${this.authority}${this.path}`; }
  with(change: Partial<{ scheme: string; authority: string; path: string; query: string; fragment: string }>): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
    );
  }
}

export class LanguageModelChatMessage {
  constructor(public role: "user" | "assistant", public content: string) {}
  static User(content: string): LanguageModelChatMessage {
    return new LanguageModelChatMessage("user", content);
  }
  static Assistant(content: string): LanguageModelChatMessage {
    return new LanguageModelChatMessage("assistant", content);
  }
}

/* ------------------------------------------------------------------ State */

interface MockState {
  config: Map<string, unknown>;
  secrets: Map<string, string>;
  globalState: Map<string, unknown>;
  workspaceState: Map<string, unknown>;
  commands: Map<string, (...args: unknown[]) => unknown>;
  inputBoxQueue: Array<string | undefined>;
  quickPickQueue: Array<unknown | undefined>;
  openDialogQueue: Array<Uri[] | undefined>;
  infoMessageResponse: string | undefined;
  warnMessageResponse: string | undefined;
  errorMessageResponse: string | undefined;
  authSession: unknown;
  lmModels: unknown[];
  extensions: Map<string, { packageJSON: Record<string, unknown> }>;
}

const state: MockState = {
  config: new Map(),
  secrets: new Map(),
  globalState: new Map(),
  workspaceState: new Map(),
  commands: new Map(),
  inputBoxQueue: [],
  quickPickQueue: [],
  openDialogQueue: [],
  infoMessageResponse: undefined,
  warnMessageResponse: undefined,
  errorMessageResponse: undefined,
  authSession: undefined,
  lmModels: [],
  extensions: new Map(),
};

export function resetVscodeMock(): void {
  state.config.clear();
  state.secrets.clear();
  state.globalState.clear();
  state.workspaceState.clear();
  state.commands.clear();
  state.inputBoxQueue = [];
  state.quickPickQueue = [];
  state.openDialogQueue = [];
  state.infoMessageResponse = undefined;
  state.warnMessageResponse = undefined;
  state.errorMessageResponse = undefined;
  state.authSession = undefined;
  state.lmModels = [];
  state.extensions.clear();

  for (const spy of allSpies) spy.mockClear();
}

export function setConfig(key: string, value: unknown): void {
  state.config.set(key, value);
}
export function setSecret(key: string, value: string): void {
  state.secrets.set(key, value);
}
export function getSecret(key: string): string | undefined {
  return state.secrets.get(key);
}
export function setGlobalState(key: string, value: unknown): void {
  state.globalState.set(key, value);
}
export function getGlobalState(key: string): unknown {
  return state.globalState.get(key);
}
export function queueInputBox(...values: Array<string | undefined>): void {
  state.inputBoxQueue.push(...values);
}
export function queueQuickPick(...values: Array<unknown | undefined>): void {
  state.quickPickQueue.push(...values);
}
export function queueOpenDialog(...values: Array<Uri[] | undefined>): void {
  state.openDialogQueue.push(...values);
}
export function setInfoMessageResponse(v: string | undefined): void {
  state.infoMessageResponse = v;
}
export function setWarnMessageResponse(v: string | undefined): void {
  state.warnMessageResponse = v;
}
export function setAuthSession(v: unknown): void {
  state.authSession = v;
}
export function setLmModels(models: unknown[]): void {
  state.lmModels = models;
}
export function registerMockExtension(id: string, packageJSON: Record<string, unknown>): void {
  state.extensions.set(id, { packageJSON });
}
export function getCommands(): Map<string, (...args: unknown[]) => unknown> {
  return state.commands;
}
export async function executeMockCommand(command: string, ...args: unknown[]): Promise<unknown> {
  const fn = state.commands.get(command);
  if (!fn) throw new Error(`Command not registered: ${command}`);
  return await fn(...args);
}

/* ------------------------------------------------------------------ Spies */

const allSpies: Array<ReturnType<typeof vi.fn>> = [];
function track<T extends (...args: never[]) => unknown>(fn: T): T & ReturnType<typeof vi.fn> {
  const spy = vi.fn(fn as never);
  allSpies.push(spy);
  return spy as unknown as T & ReturnType<typeof vi.fn>;
}

/* ------------------------------------------------------------------ window */

export const window = {
  showInformationMessage: track(async (_message: string, ..._items: unknown[]) => state.infoMessageResponse),
  showWarningMessage: track(async (_message: string, ..._items: unknown[]) => state.warnMessageResponse),
  showErrorMessage: track(async (_message: string, ..._items: unknown[]) => state.errorMessageResponse),
  showInputBox: track(async (_options?: { prompt?: string; value?: string; password?: boolean; ignoreFocusOut?: boolean; validateInput?: (v: string) => string | undefined | null | Thenable<string | undefined | null> }) => state.inputBoxQueue.shift()),
  showQuickPick: track(async (_items: unknown, _options?: unknown) => state.quickPickQueue.shift()),
  showOpenDialog: track(async (_options?: unknown) => state.openDialogQueue.shift()),
  createStatusBarItem: track((_alignment?: number, _priority?: number) => {
    const item = {
      text: "",
      tooltip: "" as string | undefined,
      command: "" as string | undefined,
      backgroundColor: undefined as ThemeColor | undefined,
      color: undefined as ThemeColor | undefined,
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    };
    return item;
  }),
  createOutputChannel: track((_name: string) => ({
    appendLine: vi.fn(),
    append: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  })),
  createWebviewPanel: track((_viewType: string, _title: string, _showOptions: unknown, _options?: unknown) => ({
    webview: {
      html: "",
      cspSource: "vscode-webview://mock",
      postMessage: vi.fn(),
      onDidReceiveMessage: new EventEmitter<unknown>().event,
      asWebviewUri: (u: Uri) => u,
    },
    reveal: vi.fn(),
    dispose: vi.fn(),
    onDidDispose: new EventEmitter<void>().event,
    onDidChangeViewState: new EventEmitter<unknown>().event,
    visible: true,
    active: true,
  })),
  registerTreeDataProvider: track((_viewId: string, _provider: unknown) => ({ dispose: vi.fn() })),
  withProgress: track(async (_options: unknown, task: (progress: { report: (value: { message?: string }) => void }, token: { isCancellationRequested: boolean }) => unknown) => {
    return await task({ report: () => {} }, { isCancellationRequested: false });
  }),
  activeTextEditor: undefined as unknown as {
    document: { uri: Uri; fileName: string; languageId: string; getText(range?: unknown): string };
    selection: { start: { line: number }; end: { line: number }; isEmpty: boolean };
  } | undefined,
  StatusBarAlignment,
  ViewColumn,
};

/* ------------------------------------------------------------------ commands */

export const commands = {
  registerCommand: track((command: string, callback: (...args: unknown[]) => unknown) => {
    state.commands.set(command, callback);
    return { dispose: () => state.commands.delete(command) };
  }),
  executeCommand: track(async (command: string, ...args: unknown[]) => {
    const fn = state.commands.get(command);
    if (fn) return await fn(...args);
    return undefined;
  }),
  getCommands: track(async (_filterInternal?: boolean) => Array.from(state.commands.keys())),
};

/* ------------------------------------------------------------------ workspace */

export const workspace = {
  getConfiguration: track((section?: string) => ({
    get: <T>(key: string, fallback?: T): T | undefined => {
      const full = section ? `${section}.${key}` : key;
      if (state.config.has(full)) return state.config.get(full) as T;
      return fallback;
    },
    update: vi.fn(async (_key: string, _value: unknown, _target?: number) => undefined),
    has: (key: string): boolean => state.config.has(section ? `${section}.${key}` : key),
    inspect: vi.fn(),
  })),
  workspaceFolders: undefined as undefined | Array<{ uri: Uri; name: string; index: number }>,
  onDidChangeConfiguration: new EventEmitter<{ affectsConfiguration: (s: string) => boolean }>().event,
};

/* ------------------------------------------------------------------ env */

export const env = {
  openExternal: track(async (_uri: Uri) => true),
  appName: "Visual Studio Code",
  language: "en",
  machineId: "mock-machine-id",
  sessionId: "mock-session-id",
};

/* ------------------------------------------------------------------ authentication */

export const authentication = {
  getSession: track(async (_providerId: string, _scopes: readonly string[], _options?: unknown) => state.authSession),
  onDidChangeSessions: new EventEmitter<unknown>().event,
};

/* ------------------------------------------------------------------ lm */

export const lm = {
  selectChatModels: track(async (_selector?: unknown) => state.lmModels),
  onDidChangeChatModels: new EventEmitter<void>().event,
};

/* ------------------------------------------------------------------ extensions */

export const extensions = {
  getExtension: track((id: string) => state.extensions.get(id)),
  all: Array.from(state.extensions.values()),
  onDidChange: new EventEmitter<void>().event,
};

/* ------------------------------------------------------------------ Build a fake ExtensionContext */

export function createExtensionContext(opts: { extensionPath?: string } = {}): {
  subscriptions: Disposable[];
  secrets: { get: (k: string) => Promise<string | undefined>; store: (k: string, v: string) => Promise<void>; delete: (k: string) => Promise<void> };
  globalState: { get: <T>(k: string, def?: T) => T | undefined; update: (k: string, v: unknown) => Promise<void>; keys: () => readonly string[] };
  workspaceState: { get: <T>(k: string, def?: T) => T | undefined; update: (k: string, v: unknown) => Promise<void>; keys: () => readonly string[] };
  extensionUri: Uri;
  extensionPath: string;
  extension: { packageJSON: Record<string, unknown> };
} {
  const extensionPath = opts.extensionPath ?? "/mock/extension/path";
  return {
    subscriptions: [],
    secrets: {
      get: async (k: string) => state.secrets.get(k),
      store: async (k: string, v: string) => { state.secrets.set(k, v); },
      delete: async (k: string) => { state.secrets.delete(k); },
    },
    globalState: {
      get: <T>(k: string, def?: T) => (state.globalState.has(k) ? (state.globalState.get(k) as T) : def) as T | undefined,
      update: async (k: string, v: unknown) => { state.globalState.set(k, v); },
      keys: () => Array.from(state.globalState.keys()),
    },
    workspaceState: {
      get: <T>(k: string, def?: T) => (state.workspaceState.has(k) ? (state.workspaceState.get(k) as T) : def) as T | undefined,
      update: async (k: string, v: unknown) => { state.workspaceState.set(k, v); },
      keys: () => Array.from(state.workspaceState.keys()),
    },
    extensionUri: Uri.file(extensionPath),
    extensionPath,
    extension: { packageJSON: { version: "1.0.0" } },
  };
}

export type Thenable<T> = Promise<T>;

/* ------------------------------------------------------------------ default */

export default {
  StatusBarAlignment,
  ViewColumn,
  TreeItemCollapsibleState,
  ProgressLocation,
  ConfigurationTarget,
  ExtensionKind,
  FileType,
  ThemeIcon,
  ThemeColor,
  TreeItem,
  EventEmitter,
  CancellationTokenSource,
  Uri,
  LanguageModelChatMessage,
  window,
  commands,
  workspace,
  env,
  authentication,
  lm,
  extensions,
};
