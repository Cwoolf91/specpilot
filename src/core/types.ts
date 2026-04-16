/**
 * Shared type definitions used by both CLI scripts and the VS Code extension.
 */

// ---------------------------------------------------------------------------
// Credentials & Configuration
// ---------------------------------------------------------------------------

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}

export interface CredentialProvider {
  getCredentials(): Promise<JiraCredentials>;
}

// ---------------------------------------------------------------------------
// Jira Client
// ---------------------------------------------------------------------------

export interface JiraClient {
  jiraFetch(path: string, options?: RequestInit): Promise<Response>;
  uploadAttachment(issueKey: string, filepath: string): Promise<void>;
  credentials: JiraCredentials;
}

// ---------------------------------------------------------------------------
// ADF (Atlassian Document Format)
// ---------------------------------------------------------------------------

export interface AdfNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export interface AdfDocument {
  version: 1;
  type: "doc";
  content: AdfNode[];
}

// ---------------------------------------------------------------------------
// Vibe Code → Epic/Story
// ---------------------------------------------------------------------------

export interface EpicPlan {
  title: string;
  description: string;
  stories: StoryPlan[];
}

export interface StoryPlan {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  sourceFiles: string[];
  screenshotRoutes: string[];
  dependsOn?: number[];
}

export interface AiAnalysis {
  epics: EpicPlan[];
  summary: string;
  newDependencies: string[];
  infrastructureNotes: string[];
}

export interface DiffResult {
  fullDiff: string;
  statSummary: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  categorized: Record<string, string[]>;
  detectedRoutes: string[];
}

export interface DiffConfig {
  vibeRepo: string;
  vibeBranch: string;
  targetRepo: string;
  targetBranch: string;
  appDir: string;
}

export interface AnalysisConfig extends DiffConfig {
  verbose: boolean;
}

// ---------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------

export interface ScreenshotConfig {
  vibeRepo: string;
  vibeBranch: string;
  appDir: string;
  port: number;
  interactiveScreenshots: boolean;
}

export interface ScreenshotMapping {
  storyKey: string;
  storySummary: string;
  screenshotPaths: string[];
}

// ---------------------------------------------------------------------------
// Jira Issues
// ---------------------------------------------------------------------------

export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    issuetype?: { name?: string; id?: string };
    project?: { key?: string; name?: string };
    status?: { name?: string };
    description?: unknown;
    assignee?: { displayName: string } | null;
    priority?: { name: string };
    labels?: string[];
    attachment?: Array<{ filename: string; size: number }>;
    subtasks?: Array<{
      key: string;
      fields: { summary: string; status: { name: string } };
    }>;
    parent?: { key: string; fields?: { summary: string } };
    comment?: {
      comments: Array<{
        author: { displayName: string };
        body: unknown;
        created: string;
      }>;
    };
    [key: `customfield_${string}`]: unknown; // Dynamic custom fields (e.g., Acceptance Criteria)
  };
}

export interface JiraStoryInfo {
  key: string;
  summary: string;
  description: string;
  hasAttachments: boolean;
  attachmentCount: number;
}

// ---------------------------------------------------------------------------
// Sprints & Boards
// ---------------------------------------------------------------------------

export interface Sprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}

export interface JiraBoard {
  id: number;
  name: string;
}

// ---------------------------------------------------------------------------
// Versions & Release Notes
// ---------------------------------------------------------------------------

export interface JiraVersion {
  id: string;
  name: string;
  description?: string;
  released?: boolean;
  projectId?: number;
}

export interface ReleaseNoteItem {
  key: string;
  summary: string;
}

export interface ReleaseNoteCategory {
  name: string;
  items: ReleaseNoteItem[];
}

export interface ReleaseNotesResult {
  summary: string;
  categories: ReleaseNoteCategory[];
}

// ---------------------------------------------------------------------------
// Automation Rules
// ---------------------------------------------------------------------------

export interface RuleSummary {
  id?: number;
  uuid?: string;
  name?: string;
  state?: string;
  enabled?: boolean;
  description?: string;
  authorAccountId?: string;
  scope?: { resources?: string[] };
  trigger?: { component?: string; type?: string };
  projects?: { projectId?: string; projectKey?: string }[];
  created?: string | number;
  updated?: string | number;
  tags?: { tagType?: string; tagValue?: string }[];
  [key: string]: unknown;
}

export interface RuleSummaryResponse {
  links?: { self?: string; next?: string | null; prev?: string | null };
  data?: RuleSummary[];
}

// ---------------------------------------------------------------------------
// Ticket Creation Config
// ---------------------------------------------------------------------------

export interface TicketCreationConfig {
  projectKey: string;
  sprintId: string | null;
  dryRun: boolean;
  verbose: boolean;
}

export const SPRINT_CAPACITY_WARN = 30;

// ---------------------------------------------------------------------------
// Issue Types (discovered at runtime via src/core/jira/issue-types.ts)
// ---------------------------------------------------------------------------

export type IssueTypeMap = Record<string, string>;
