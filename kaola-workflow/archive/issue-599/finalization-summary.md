# Finalization - Summary: issue-599

## Delivered
Issue #599: `selectSpeculativeWriteGroup` (adaptive-node.js ×4) now fails CLOSED on an indeterminate `--parallel-safe` result — any non-ok validator result without a well-formed `overlapping` array (subprocess crash, garbled JSON, structured refuse like `node_not_found`) excludes every speculative write candidate instead of letting them open unchecked, mirroring `tryFormLaneGroup`'s posture so both callsites of the one predicate share one error posture. A well-formed non-ok keeps the existing per-pair exclusion.

**This run doubled as the first live end-to-end exercise of the #596 speculative-write machinery** (plan Meta `speculative_open_policy: consent`): n3-docs opened speculatively in an isolated leg while the n2 review gate ran (`open-ready --speculative-consent`, lane group lg-n3-docs); a deliberate early close refused with the typed `gate_not_complete` fence; after the gate passed, the member closed through the per-leg barrier → octopus merge → union barrier (`group_passed`, merge commit 23d4df98). Recorded in issue #597 (its hard precondition) with project id issue-599.

## Files Changed
- scripts/kaola-workflow-adaptive-node.js + codex twin + gitlab/gitea generated ports (fail-closed branch, +11/-2 each)
- scripts/test-adaptive-node.js (T599-1a/1b/1c; 1310→1314)
- docs/decisions/D-599-01.md (new), docs/api.md (posture note), CHANGELOG.md (### Fixed)
Commits on workflow/issue-599: 67464e62 (impl), 079fd946/23d4df98 (leg + synth merge of n3's docs), 0152abb2 (CHANGELOG).

## Test Coverage
RED-first: T599-1a (crash {exitCode:1}) and T599-1b (garbled JSON {exitCode:0}) reproduced the fail-open pre-fix; T599-1c pins the untouched well-formed-non-ok per-pair posture. The n2 gate enumerated every reachable validator output shape and confirmed fail-closed coverage (including the bonus node_not_found closure) with healthy paths byte-unchanged.

## Final Validation Evidence
- Per-node runs (n1, re-run by n2): test-adaptive-node 1314, test-next-action 103, test-commit-node 123, walkthrough green, edition-sync --check 10 ports parity, validate-script-sync 24 in sync.
- Full four-chain gate: `KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --project issue-599` after the CHANGELOG commit 0152abb2; receipt at .cache/chain-receipt.json (HEAD-bound). Result recorded before the final Git gate.
- Adaptive script-enforced barrier: --resume-check 0, --gate-verify 0, --barrier-check 0, --verdict-check 0.
- Validation reuse boundary: scoped runs cover code/test impact through n2-review; n3's docs merge and the n4 CHANGELOG entry are docs-only relative to those runs; the four-chain receipt is bound to the final tree.

## Documentation Docking
DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (in-run, not a validation failure) close-node n3-docs refused: parent_dirty → write_set_overflow → leg_base_unreachable | the interim impl commit (67464e62) landed on the parent branch BETWEEN leg provision and merge — a state the leg-base anchoring assumes never happens; every refusal was correctly fail-closed | orchestrator repair: reset parent to the interim commit, rebase the leg onto it (docs-only vs scripts — no conflict), re-run close-node | .cache/n4-finalize.md; merge then passed clean (group_passed, 23d4df98); no unattributed writes at any point (the five script files were measured by n1-fix's own closed barrier) | resolved; operational learning recorded in the #597 comment |

## Follow-Up Items
- O1 (LOW, n2-review, non-blocking): `speculativeWriteExcluded.reason` labels a crash/garbled non-open as `overlaps_live_writer` — diagnostic-only field, behavior correct; candidate token `parallel_safe_indeterminate`. Owned by #597 (the speculative productionization pass), noted in its comment thread context.
- Operational learnings for #597 (recorded in its comment): (a) the fused serial advance opens a width-1 gate outside the running set, so an authored speculative topology needs the open-ready path — orchestrator-facing guidance; (b) no parent commits while a speculative leg is open, or an explicit re-anchor recipe in the recovery cards.

## Run gaps
- in_run_repair (n2-review): filed: #597

(The gate node's serial-open→running-set reset is the width-1 fused-advance friction; explicitly documented in the #597 comment — the issue that owns the speculative-open productionization/prose pass.)

## Closure Decision
None needed — no partial implementation; ACs verified by the opus gate (verdict: pass, findings_blocking: 0). Close on sink.

## Commit And Push
Commits 67464e62 + 23d4df98 (merge) + 0152abb2 on workflow/issue-599, plus archive commit ee38bb0b (chore: archive issue-599). Sink push/merge still pending — owned by the orchestrator's sink-merge dispatch, not run by this contractor pass.

## GitHub Issue
#599 — to be closed by sink-merge --sink --issue 599 (probe-before-close); closure_receipt at archive time recorded remote_issue_closed: close_pending.

## Roadmap
Claim staged issue source reconciled by cmdFinalize (roadmap_staged_reconciled: ["issue-599.md"], roadmap_source_removed: absent at the worktree root); ROADMAP.md regenerated at closure.

## Archive
Archived — kaola-workflow/archive/issue-599/ via cmdFinalize (contractor Step 8b), commit ee38bb0b.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix) | subagent-invoked | .cache/n1-fix.md | |
| code-reviewer (n2) | subagent-invoked | .cache/n2-review.md | |
| doc-updater (n3, speculative leg) | subagent-invoked | .cache/n3-docs.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failure |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md (regen at cmdFinalize) | |
| archive completed folder | complete | commit ee38bb0b (chore: archive issue-599) | |
| final commit and push | ready | git status clean of unrelated changes; push via sink-merge --sink | sink (push/merge/close) not run by contractor per dispatch scope |
| finalize (n4-finalize) | main-session-direct | .cache/n4-finalize.md | |

## Status
ARCHIVED AFTER FINAL GIT GATE
