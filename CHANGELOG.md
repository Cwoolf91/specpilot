# Changelog

All notable changes to SpecPilot will be documented in this file.

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
