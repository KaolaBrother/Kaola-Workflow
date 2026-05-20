# Phase 1 - Research / Discovery: issue-118

## Deliverable
Add `--forge=gitea` support to `uninstall.sh`: accept the gitea forge value, remove `~/.claude/kaola-workflow-gitea` on uninstall, fix `--forge=all` to include Gitea, update README uninstall docs, and add contract assertion coverage.

## Why
Users can install the Gitea edition via `./install.sh --forge=gitea` but cannot cleanly uninstall it. `--forge=all` also silently leaves Gitea support files behind.

## Affected Area
- `uninstall.sh` — 4 spots: usage(), two-arg error message, case validation, new forge-specific remove block
- `README.md` lines 183–189 — uninstall documentation block
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — extend to assert uninstall.sh contains `kaola-workflow-gitea`

## Key Patterns Found
1. Forge-to-directory mapping: `gitea` → `$HOME/.claude/kaola-workflow-gitea` (`uninstall.sh` line 110 for gitlab mirror)
2. Forge validation case: `github|gitlab|all)` at `uninstall.sh:42` — extend to `github|gitlab|gitea|all)`
3. Gitea contract validator reads `install.sh` and asserts content (`validate-kaola-workflow-gitea-contracts.js:134`) — extend to read `uninstall.sh`

## Test Patterns
- Framework: hand-rolled `assert()`, no test framework
- Location: `scripts/simulate-workflow-walkthrough.js` (Node.js script surface only), `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` (contract assertions)
- Structure: `testFunctionName()` pattern; syntax check via `bash -n uninstall.sh` in `validate-workflow-contracts.js`

## Config & Env
- No env vars needed; `FORGE` is a local shell variable set from `--forge` argument
- `set -euo pipefail` in `uninstall.sh` — strict mode already active

## External Docs
None required — all changes mirror existing gitlab block patterns.

## GitHub Issue
KaolaBrother/Kaola-Workflow#118

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient; no external API needed |

## Notes / Future Considerations
- Hook-stripping Python3 block in `uninstall.sh` is already forge-agnostic; no changes needed there
- `simulate-workflow-walkthrough.js` is not the right place for shell-level uninstall coverage
- The Gitea contract validator is the correct home for new semantic assertions
