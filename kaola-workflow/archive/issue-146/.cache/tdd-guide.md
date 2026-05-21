# TDD-Guide Output — issue-146

## Changes Made

### README.md (lines 241-244 replaced)
Old:
```
This repository also includes Codex packs under `plugins/`. They expose the same
Kaola-Workflow identity through Codex-native skills, using `kaola-workflow/`
project artifacts and `AGENTS.md` guidance rather than Claude Code slash
commands and `CLAUDE.md`.
```
New:
```
This repository also includes Codex packs under `plugins/`. They expose the same
Kaola-Workflow identity through Codex-native skills and `kaola-workflow/` project
artifacts rather than Claude Code slash commands. Codex uses `AGENTS.md` as its
entrypoint, which redirects to `CLAUDE.md` as the single canonical source of repo
guidance — the same `CLAUDE.md` contract applies to Codex and Claude Code alike.
```
No other files touched.

## Acceptance Check Results
- `node scripts/validate-workflow-contracts.js`: PASS ("Workflow contract validation passed")
- `node scripts/validate-kaola-workflow-contracts.js`: PASS ("Kaola-Workflow Codex contract validation passed")
- `node scripts/simulate-workflow-walkthrough.js`: PASSED
- `grep -n "AGENTS.md" README.md`: new phrasing at line 243 frames AGENTS.md as entrypoint
