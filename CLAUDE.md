# Claude runtime overlay

@AGENTS.md

<!-- KW-CLAUDE-OVERLAY-MANAGED-START -->
Claude must import and follow the repository contract above before any action in this repository.

- Project instruction discovery is bridged through this file because this runtime does not load the
  universal file directly.
- Native role profiles live under `.claude/agents/`; their model and tool carriers are generated from
  the runtime adapter and must not be copied into the universal contract.
- The fast local chain is `npm run test:kaola-workflow:claude`; the optional complete local chain is
  `npm run test:kaola-workflow:claude:full`.
- Keep this overlay thin. Universal workflow behavior belongs only in `AGENTS.md`.
<!-- KW-CLAUDE-OVERLAY-MANAGED-END -->
