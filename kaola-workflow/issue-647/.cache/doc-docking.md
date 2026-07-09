verdict: DOCKED

Changed behavior:
- Codex preflight and installer helpers now parse quoted TOML table headers and array-of-table headers without leaking table state into features.multi_agent_v2.
- The user-local Codex config was also updated to request five multi-agent v2 threads.

Docking audit:
- CHANGELOG.md has a #647 entry under 6.21.0 Fixed.
- After rebasing onto origin/main f05f15f7, the issue branch has no README.md diff. README.md and docs/ do not expose the internal parseTomlTableName helper or document the broken table-state behavior as a public contract.
- .env.example is not involved; this change reads Codex TOML config, not project environment variables.
- kaola-workflow/ROADMAP.md validates and was refreshed with `node scripts/kaola-workflow-roadmap.js generate` -> up-to-date.

Evidence:
- kaola-workflow/issue-647/.cache/n2-codex-runtime-evidence.md records the official Codex manual/local runtime evidence.
- kaola-workflow/issue-647/.cache/doc-updater.md records `docs_updated: no`.
- kaola-workflow/issue-647/.cache/final-validation.md records that the pre-rebase receipt was green and that the user explicitly approved reusing it after the README-only rebase without rerunning chains.
