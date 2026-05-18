# Phase 1 - Research / Discovery: issue-81

## Deliverable
Resolve the startup contract conflict: pick one authoritative contract (explicit-always or sole-active-resume), update all four docs and the script to agree, and add regression tests covering the three no-target startup scenarios (0 active, 1 active, multiple active).

## Why
CLAUDE.md says startup always requires `--target-issue N`; commands/workflow-next.md step 5 says "if exactly one active folder exists, skip to it (no explicit target required)"; and `kaola-workflow-claim.js` implements the sole-active auto-resume. The three sources are in conflict. Any agent or user reading CLAUDE.md expects strict explicit-only behavior; the script silently violates it. The fix eliminates ambiguity and adds tests so regressions are caught automatically.

## Affected Area
- `CLAUDE.md` lines 21-22 — "Startup scripts validate, not select" rule
- `commands/workflow-next.md` step 5, line 56 — sole-active carve-out
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` step 5 — same carve-out
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md` step 5 — same carve-out
- `scripts/kaola-workflow-claim.js` lines 366-387 (`cmdStartup`) — implements `verdict: owned` for no-target + one active folder
- `scripts/simulate-workflow-walkthrough.js` — zero coverage for no-target startup scenarios

## Key Patterns Found
1. `cmdStartup` no-target branch (`claim.js:366-387`): `if (!targetIssue) { if (active.length === 1) return { verdict: 'owned', claim: 'owned', ... }; return { verdict: 'no_target', claim: 'none' } }` — sole-active auto-resume lives here
2. Typed refusal pattern (`claim.js:claimExplicitTarget`): `{ verdict: 'user_target_blocked', reasoning: '...' }` — model for typed refusals already in explicit-target path
3. Test structure (`simulate-workflow-walkthrough.js`): `runClaimOnline(['startup', '--target-issue', 'N'], tmp, binDir)` — existing tests all pass explicit target; no no-target test exists
4. CLAUDE.md enforcement principle (line 21): "They refuse auto-pick with typed refusals" — matches the explicit-always contract but conflicts with the script's `verdict: owned`

## Test Patterns
- Framework: hand-rolled assert (no test framework)
- Location: `scripts/simulate-workflow-walkthrough.js`
- Structure: `runClaimOnline(['startup', ...], tmp, binDir)` → assert on JSON fields `verdict`, `claim`, exit code

## Config & Env
No env vars or feature flags involved. The sole-active check is unconditional in `cmdStartup`.

## External Docs
N/A — internal patterns sufficient

## GitHub Issue
KaolaBrother/Kaola-Workflow#81

## Completeness Score
10/10
- Goal clarity: 3/3 — conflict identified, two options defined, success criteria clear
- Expected outcome: 3/3 — one contract, all four docs in sync, three regression tests
- Scope boundaries: 2/2 — only cmdStartup no-target path and its four doc references
- Constraints: 2/2 — GitHub and GitLab editions must stay in sync; no new commands

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns only, no external API/framework behavior needed |

## Notes / Future Considerations
- Design decision (Option A explicit-always vs Option B sole-active-allowed) deferred to Phase 2 advisor gate — both are technically valid; choice depends on project philosophy.
- If Option B is chosen, CLAUDE.md must get a carve-out sentence; if Option A is chosen, step 5 is removed from three command/skill files.
- The GitLab command file must stay in sync with the GitHub edition for whichever option is chosen (code-explorer confirmed this constraint).
