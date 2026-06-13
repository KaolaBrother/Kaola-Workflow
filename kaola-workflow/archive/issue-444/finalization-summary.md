# Finalization - Summary: issue-444

## Delivered
Script-emitted `dispatch` descriptor in every adaptive opener + `record-evidence --verify` (#444, D-421 P1+P2).

`buildDispatch(nodeInfo, context)` — a single module-level builder called by ALL three openers (`runOpenNext`, `runOpenReady`, fused advance in `runCloseAndOpenNext`) so the `dispatch` sub-object in the `opened` payload is always field-complete and identical in shape across all three call sites. Kills the #411 class by construction.

`deriveGuards(nodeInfo)` — script-owned guard computation: gate roles → `'read-only'`; `tdd-guide` → `'RED-fixture-in-$TMPDIR'`; generated-port sibling write sets → `'sync:editions'`.

`record-evidence --verify` (`runVerifyEvidence`) — reads `.cache/<node-id>.md` from disk with no stdin transit; delegates to `checkEvidenceShape` + nonce binding; returns same typed reason vocabulary as the close gate.

×6 plan-run prose surfaces (3 Claude commands + 3 Codex SKILL packs) updated with dispatch descriptor reference.

## Files Changed
- `scripts/kaola-workflow-adaptive-node.js` (canonical)
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` (codex twin, generated)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` (generated)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` (generated)
- `scripts/test-adaptive-node.js` (5 new D444 assertions)
- `docs/decisions/D-444-01.md` (new decision record)
- `commands/kaola-workflow-plan-run.md` (dispatch descriptor prose)
- `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md`
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md`
- `CHANGELOG.md`
- `docs/api.md`
- `docs/architecture.md`

## Test Coverage
All four chains green: claude/codex/gitlab/gitea. 579 adaptive-node assertions pass. Walkthrough simulation pass.

## Final Validation Evidence
- command: node scripts/simulate-workflow-walkthrough.js — pass — .cache/final-validation.md
- command: npm run test:kaola-workflow:{claude,codex,gitlab,gitea} (sequential) — all pass — .cache/final-validation.md
- validation reuse covers code/test impact through n3-code-review (all four chains run there); the finalize-node CHANGELOG+docs edits are docs-only and outside the rerun trigger (re-validated by the tdd-guide final-validation agent which ran all four chains at finalization time)

## Documentation Docking
DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
None. n3-code-review verdict: pass, findings_blocking: 0. Closure scan: no deferred items.

One non-blocking observation from code-reviewer: `dispatch.working_dir` resolves to `null` uniformly (main() does not thread working_dir into openers). Field is wired for future use. Not a blocker.

## Closure Decision
No deferred items found. Implementation complete. Issue #444 may close.

## Commit And Push
Pending final Git gate.

## GitHub Issue
To be closed by contractor/sink-merge.

## Roadmap
To be updated by contractor (cmdFinalize removes .roadmap/issue-444.md).

## Archive
To be performed by contractor (cmdFinalize archives issue-444/).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | DOCKED |
| final-validation fix executors | N/A | | No failures requiring fixes |
| roadmap refresh | pending contractor | kaola-workflow/ROADMAP.md | runs in contractor Step 8b |
| archive completed folder | pending contractor | | runs in contractor Step 8b |
| final commit and push | ready | git status shows 15 modified + 2 untracked | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
