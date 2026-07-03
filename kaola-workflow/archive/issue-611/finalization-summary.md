# Finalization - Summary: issue-611

## Delivered
Codex dispatch JOIN protocol (#611), the complement of the authorization half:
- wait budgets: `wait_budget_minutes` on every dispatch card (schema `waitBudgetMinutes` beside `dispatchEffort`; reasoning 40m / standard 20m / untiered 20m; legacy aliases normalize).
- writer kill-safety: `reconcile-running-set` diffs an interrupted/departing writer's actual changes vs its declared write set and emits positive-confirmation `adopt|halt` verdicts (`writerHalt` top-level; `barrier_unverifiable` on any unverifiable barrier result) — fail-closed, non-destructive.
- typed delegation outcomes: optional column-0 `delegation_outcome: completed | returned_partial | interrupted_unresponsive | interrupted_obsolete` evidence token (absent ⇒ completed; unknown value refuses).
- Join Protocol prose (arms A–C+F) on all six plan-run surfaces + new docs/plan-run-cards/join-protocol.md; `fork_turns:"none"` unconditional for role dispatch; status-probe prohibition; escalation ladder; frontier same-turn spawns with running-members-only width; validator pins ×4.
- preflight/installer report effective multi_agent_v2 slots + wait bounds (6 fields, honest observed-default labeling, report-only, version-guarded) + recommended config block docs.

## Files Changed
8 commits over f19bc181: n1 window (9680b765) + R1 fix (7cfb48b0) + 2 leg commits + kw-synth (2155443b) + docs (778bffa8). ~30 files.

## Test Coverage
test-adaptive-node 1394 (+32 net this run); walkthrough incl. delegation-outcome + wait-budget asserts + codex v2-bounds; test-install-model-rendering extended; route-reachability 260 (unedited, green); opencode 499.

## Final Validation Evidence
- Four chains green, serial, receipt HEAD-bound at 778bffa8 (claude 844s / codex 18s / gitlab 223s / gitea 225s, timed_out false ×4) — run by n6 (.cache/n6-review.md), receipt .cache/chain-receipt.json.
- Validation reuse boundary: the receipt covers everything through the n5 docs commit (778bffa8 == HEAD); n7 wrote only workflow-band .md bookkeeping after it (receipt codeTreeHash-inert).
- sync-opencode --check parity + test-opencode-edition 499 + test-install-model-rendering standalone: all exit 0 (n6).
- Adaptive barriers at finalize: resume=0 gate=0 barrier=0 verdict=0.

## Documentation Docking
DOCKED — docs landed in n5 (CHANGELOG, D-611-01, api.md shapes transcribed from code, architecture, conventions, card index) and verified by n6's prose↔impl agreement pass; .cache/n5-docs.md is the docking record.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items
None blocking. Noise-level notes for the audit phase: n6 R1 (parseDelegationOutcome helper regex laxer than the enforcing inline check — helper not on any enforcement path); n4 R2 (halt→reopen laundering closed by the n3 prose rule "honor writerHalt before re-opening" — prose-level, mechanical enforcement would be a future hardening).

## Run gaps
- in_run_repair (n1-engine): noise: the defect (fail-open adopt on a crashed barrier-check subprocess) was introduced BY THIS RUN's new code, caught in-run by the n4 adversarial gate, and fixed in-run at 7cfb48b0 with +6 regression tests before merge — zero residual defect on main, nothing to file.

## Closure Decision
None needed — no deferred items, no partial implementation, no user-decision items. All 7 ACs verified MET by n6.

## Commit And Push
Pending final Git gate (contractor Step 8 + sink-merge --sink).

## GitHub Issue
#611 — to be closed by the sink (--issue 611).

## Roadmap
Regenerated at closure by cmdFinalize (.roadmap/issue-611.md source exists from the claim — closure removes it).

## Archive
Pending — kaola-workflow/archive/issue-611/ via cmdFinalize.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | subagent-invoked (n5-docs plan node) | .cache/n5-docs.md | |
| documentation docking | invoked | .cache/n5-docs.md + n6 prose↔impl pass | |
| final-validation fix executors | subagent-invoked (n1 reopen via adversarial gate) | .cache/n4-adversarial.md + .cache/n1-engine.md | |
| roadmap refresh | pending cmdFinalize | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status clean except workflow band; upstream origin | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
