# Finalization - Summary: issue-495

## Delivered
Hardened the adaptive starting contract (`kaola-workflow-claim.js startup --workflow-path adaptive`) against an opaque, un-retried, transient classifier-subprocess fault (#495). Stop-swallowing + typed error classification (spawn-fault / timeout-kill / clean-nonzero) + bounded in-script retry (N≤2) on transient classes only + a new `target_set_indeterminate`/`target_indeterminate` verdict carrying `result: escalate`, distinct from determinate facts carrying `result: refuse`. Consumer routing prose (`refuse` → hard stop; `escalate` → pause-and-ask the user) propagated across all 18 command/skill routing surfaces + the workflow-planner profile, machine-enforced.

## Files Changed
- claim.js byte-pair (`scripts/` + `plugins/kaola-workflow/scripts/`) + `scripts/test-claim-hardening.js` (n1)
- forge claim.js ports gitlab + gitea — envelope-only parity (n2)
- 18 routing surfaces (adapt/next/auto × {3 commands, 3 SKILLs}) + `agents/workflow-planner.md` + 3 `.toml` twins + `scripts/test-route-reachability.js` (T6 pin) + `scripts/test-agent-profile-parity.js` (FEATURE_TOKEN) (n3)
- `docs/api.md` + `docs/decisions/D-495-01.md` (n6)
- `CHANGELOG.md` (n7)
Total 32 files.

## Final Validation Evidence
All four chains green via `kaola-workflow-run-chains.js` (chain-receipt: claude/codex/gitlab/gitea exitCode 0). n5 code-reviewer (G1, opus) verdict: pass, 0 blocking — confirmed real per-command exit codes + forge-mirror hand-diff sound. n4 adversarial-verifier verdict: pass (7 scenarios, distinctness + no-retry-bleed). Validation reuse covers code/test impact through node n7; the finalize-node CHANGELOG edit is docs-only and outside the rerun trigger. (`--sink` re-runs `npm test` post-rebase onto origin/main as the merge gate.)

## Documentation Docking
DOCKED — api.md envelope + D-495-01 ADR cover the public claim/startup verdict envelope change; CHANGELOG [Unreleased] entry added. No README/.env impact (no new env var surfaced to users; `KAOLA_CLASSIFIER_MOCK_SCRIPT` is a test-only seam mirroring the existing `KAOLA_GH_MOCK_SCRIPT`).

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- #507 — boundary-2 internal CLI-fetch transient fault swallowed to determinate `target_unavailable` across all four classifiers (no retry/escalate). Same defect class as #495, one layer down; deliberately out of #495 scope. Hardening it activates the forge forward-compat `indeterminate` handlers added here.

## Run gaps
- manual:boundary-2-classifier-swallow (forge n2 + review n5 flagged the edition-uniform boundary-2 swallow as out-of-#495-scope): filed: #507

## Closure Decision
Closure scan: one deferred item (the boundary-2 gap) — filed as #507 (follow-up). #495's own acceptance criteria are fully satisfied (boundary-1 fix; the issue's design carved boundary-2 as graceful/out-of-scope). #495 closes.

## GitHub Issue
close #495 (via sink-merge closure step)

## Roadmap
updated (closure removes kaola-workflow/.roadmap/issue-495.md + regenerates ROADMAP.md)

## Archive
pending (cmdFinalize via --sink finalize step)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/n6-docs.md (in-plan node n6) | |
| documentation docking | invoked | this summary | |
| final-validation fix executors | N/A | no failures | |
| roadmap refresh | pending | ROADMAP.md (via --sink finalize) | |
| archive completed folder | pending | (via --sink finalize) | |
| final commit and push | ready | impl commit + --sink transaction | |

## Status
ARCHIVED AFTER FINAL GIT GATE
