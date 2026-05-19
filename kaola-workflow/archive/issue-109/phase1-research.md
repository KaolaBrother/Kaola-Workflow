# Phase 1 - Research / Discovery: issue-109

## Deliverable
Fix the GitHub Codex `kaola-workflow-next` SKILL.md so the Git freshness-block recovery:
1. Extracts `KAOLA_CLAIM` from the startup output
2. Guards the release command with `[ "$KAOLA_CLAIM" = "acquired" ]`
3. Names the project correctly using `$PICK_NEXT_PROJECT`
Add regression assertions in `scripts/validate-kaola-workflow-contracts.js`.

## Why
Prevents orphaned active workflow folders: when startup successfully acquires an issue and provisions a worktree, then a git freshness block fires, the recovery runs `release --project "$KAOLA_PROJECT"` with `$KAOLA_PROJECT` unset — so no folder is released. The orphaned folder recreates the failure mode fixed for other paths in issue #80.

## Affected Area
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` — primary: extraction block (~line 117) and freshness-block recovery (~line 139)
- `scripts/validate-kaola-workflow-contracts.js` — regression coverage (~lines 86–89)

## Key Patterns Found
1. **Pattern B (GitLab sibling — preferred mirror)** — `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` lines ~120–122, 165: adds `KAOLA_CLAIM` extraction alongside `PICK_NEXT_PROJECT`, release uses `[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ] && node "$claim_script" release --project "$PICK_NEXT_PROJECT" --reason git-freshness-block`
2. **Pattern A (Claude command)** — `commands/workflow-next.md` lines ~132–143: uses `KAOLA_PROJECT` (renamed from `PICK_NEXT_PROJECT`) + `KAOLA_CLAIM`; not preferred for SKILL.md because it would leave duplicate project variables
3. **Contract test pattern** — `scripts/validate-kaola-workflow-contracts.js` lines 86–89: `assertIncludes(file, 'string')` — add two new calls for `KAOLA_CLAIM` and the guard string

## Test Patterns
- Framework: Node.js `assert` (validate-contracts.js) + `spawnSync` simulation (simulate-kaola-workflow-walkthrough.js)
- Location: `scripts/validate-kaola-workflow-contracts.js` (primary); `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (secondary)
- Structure: `assertIncludes(filePath, substring)` for contract checks; simulation runs the skill file and checks exit code + output
- Command: `npm run test:kaola-workflow:codex` runs both; `node scripts/simulate-workflow-walkthrough.js` runs main walkthrough

## Config & Env
- `KAOLA_CLAIM` — startup JSON field `.claim`; values: `"acquired"` (new claim), `"owned"` (existing), `"none"`
- `PICK_NEXT_PROJECT` — startup JSON field `.project`; the selected project name
- No new env vars needed

## External Docs
None — all internal patterns.

## GitHub Issue
KaolaBrother/Kaola-Workflow#109

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | internal patterns sufficient; no external library behavior needed | |

## Notes / Future Considerations
- The GitLab Codex skill's contract validator (`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`) has a pre-existing gap (no assertion for the GitLab Codex release guard) — out of scope for #109
- The fast-forward attempt before release (present in Claude command pattern) is optional; Pattern B (GitLab sibling) skips it; keeping it out of scope simplifies the fix
