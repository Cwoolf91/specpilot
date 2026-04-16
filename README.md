# SpecPilot

Jira workflow tools for any team — create epics and stories from prototype code diffs, generate release notes, manage automation rules, and more. Powered by AI.

## Requirements

- **VS Code 1.90+**
- **Jira Cloud** with an [API token](https://id.atlassian.com/manage-profile/security/api-tokens)
- **AWS SSO access** (optional) — for AI-powered features via AWS Bedrock

## Getting Started

### 1. Install

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/) or search "SpecPilot" in the Extensions view.

### 2. Configure credentials

1. Open the Command Palette (`Cmd+Shift+P`)
2. Run **SpecPilot: Set Credentials**
3. Enter your Jira base URL, email, API token, and default project key

The status bar shows your connection status. Click it to open the dashboard.

Issue types and projects are discovered automatically from your Jira instance — no manual ID configuration needed.

---

## Features

### Activity Bar Sidebar

Four views under the **SpecPilot** icon:

| View | Description |
|------|-------------|
| **Vibe Code Epics** | Epics with a configurable label (default: `vibe-code`), expandable to child stories |
| **Active Sprint** | Current sprint issues grouped by status (To Do / In Progress / Done) |
| **Automation Rules** | All automation rules, sorted enabled-first |
| **Settings** | Credentials, dashboard, MCP server, and version info |

### Create Issue from Selection

Highlight code and create a Jira Bug or Story directly:

- **Keybinding:** `Cmd+Shift+J` (mac) / `Ctrl+Shift+J` (win/linux)
- **Context Menu:** Right-click > "Create Issue from Selection"
- **Command Palette:** `SpecPilot: Create Issue from Selection`

**Flow:** select code > choose Bug/Story > pick project (auto-discovered from Jira) > enter summary > review panel opens beside your editor.

AI enhances the ticket in the background using BDD templates:

- **Stories** get structured fields: User Story, Why (business value), Acceptance Criteria (Given/When/Then), Release Instructions
- **Bugs** get a detailed description with problem, expected vs actual behavior, and steps to reproduce

### Dashboard

**Command:** `SpecPilot: Open Dashboard`

A React webview with four tabs:

- **Vibe Code** — 6-step wizard: repo selection, diff review, editable epic/story cards, screenshot capture, sprint selection, ticket creation
- **Release Notes** — 4-step wizard: version selector, issue picker, AI-generated notes, publish to Confluence
- **Augment Epic** — capture screenshots for an existing epic's stories
- **Epic Review** — review existing epics, generate stories with AI, create or export as MCP-compatible JSON

---

## AI Provider Setup (Optional)

AI features use **AWS Bedrock** (Claude) by default, with automatic fallback to the **VS Code Language Model API** (GitHub Copilot Chat).

```bash
# Authenticate with AWS SSO before using AI features
aws sso login --profile <your-profile>
```

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `specPilot.aiEnhanceIssues` | `true` | Enable/disable AI enhancement |
| `specPilot.ai.provider` | `"auto"` | `auto`, `bedrock`, or `vscode-lm` |
| `specPilot.ai.bedrockRegion` | `AWS_REGION` env | AWS region for Bedrock |
| `specPilot.ai.bedrockProfile` | `AWS_PROFILE` env | AWS SSO profile name |
| `specPilot.ai.bedrockModelId` | `us.anthropic.claude-opus-4-6-v1` | Bedrock model ID |
| `specPilot.ai.storyTemplatePath` | (built-in) | Custom BDD Story template (`.md`) |
| `specPilot.ai.epicTemplatePath` | (built-in) | Custom BDD Epic template (`.md`) |
| `specPilot.epicLabel` | `"vibe-code"` | Label for filtering tool-created epics |
| `specPilot.acceptanceCriteriaFieldId` | `""` | Custom field ID for AC (e.g., `customfield_10334`) |
| `specPilot.releaseNotes.excludeIssueTypes` | (see defaults) | Issue types excluded from release notes |

---

## All Commands

| Command | Description |
|---------|-------------|
| `SpecPilot: Open Dashboard` | Open the main webview panel |
| `SpecPilot: Set Credentials` | Configure Jira API credentials |
| `SpecPilot: Create Issue from Selection` | Create Bug/Story from selected code |
| `SpecPilot: Check for Updates` | Check for new extension versions (self-hosted only) |
| `SpecPilot: Start MCP Server` | Start the MCP server process |
| `SpecPilot: Stop MCP Server` | Stop the MCP server process |

---

## Credentials

Two sources, checked in order:

1. **VS Code Secret Storage** (primary) — set via `SpecPilot: Set Credentials`
2. **`.env` file** (fallback) — for users who also use the CLI tools

---

## MCP Server

Exposes Jira operations as MCP tools for Claude Code, Claude Desktop, or any MCP client.

**Tools:** `jira-search`, `jira-get-issue`, `jira-create-issue`, `jira-add-attachment`, `jira-list-sprints`, `jira-move-to-sprint`, `jira-transition`

Start from the Settings tree view or the Command Palette.

---

## Custom Templates

Override the built-in BDD templates with your own:

- `specPilot.ai.storyTemplatePath` — path to a `.md` file for Story templates
- `specPilot.ai.epicTemplatePath` — path to a `.md` file for Epic templates

Templates must be within your workspace and use `.md`, `.txt`, or `.template` extensions.

---

## License

[MIT](LICENSE)
