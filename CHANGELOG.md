# Changelog

All notable changes to SpecPilot will be documented in this file.

## [1.1.0] - 2026-04-17

### Added
- **Ticket Jumpstart** (`Cmd+Alt+J` / `Ctrl+Alt+J`): jump into your next ticket with an AI-generated briefing — which files to open, what the acceptance criteria imply, and what patterns from similar resolved stories to mimic. Three sources: next unassigned in active sprint, your assigned tickets, or enter an issue key.
  - New settings: `specPilot.ticketJumpstart.source` (default `ask`), `specPilot.ticketJumpstart.maxSimilarStories` (default 3)
  - Uses the same three-provider AI chain as other features (Bedrock → Anthropic → VS Code LM)
  - Status bar indicator shows the active briefing; click files in the panel to open at the relevant line

## [1.0.0] - 2026-04-15

### Added
- **Vibe Code Wizard**: 6-step flow to create Jira epics and stories from prototype code diffs
- **Release Notes**: Generate and publish release notes to Confluence with AI assistance
- **Epic Review**: Review existing Jira epics, generate implementable stories with AI
- **Inline Code Action**: Create bugs or stories from selected code (`Cmd+Shift+J`)
- **MCP Server**: Expose Jira operations as MCP tools for Claude Code and other clients
- **Screenshot Capture**: Playwright-based screenshots attached to stories automatically
- **AI Integration**: AWS Bedrock (primary) with VS Code Language Model API fallback
- **Tree Views**: Filtered epics, active sprint issues, and automation rules in the sidebar
- **Auto-discovery**: Issue types and projects discovered from your Jira instance automatically
- **Custom Templates**: Override BDD story and epic templates with your own files
- **Session Persistence**: Resume in-progress work across tab switches and panel reopens
