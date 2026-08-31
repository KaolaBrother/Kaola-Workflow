@AGENTS.md

# Claude Code adapter

- Claude imports the repository instructions through the bridge above.
- Native role profiles live under `.claude/agents/`; model and tool carriers come from the runtime
  adapter rather than this file.
- The focused chain is `npm run test:kaola-workflow:claude`; the complete local chain is
  `npm run test:kaola-workflow:claude:full`.
