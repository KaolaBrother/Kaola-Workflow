# Finalization - Summary: bundle-496-497

## Delivered
Two HIGH default-path reliability fixes in the sink-merge file family (#496, #497) plus the
D-497-01 closure-audit wiring, across all four editions. Both fixes close the cross-cutting
"opaque/transient fault → determinate outcome" anti-pattern on the SINK side (the toward-wrong-green
half; #495 covers the front-door toward-wrong-refuse half on another machine).

- **#496**: `assertWorktreeClean` inverted from fail-OPEN to fail-CLOSED — a `git status` probe
  that cannot prove the worktree clean now refuses (one bounded retry) before the destructive
  `git worktree remove --force`.
- **#497**: `--sink` no longer marks `push_main`/`closure` steps done on failure; it records the
  receipt (`push_main:"failed"` / `remote_issue_closed:"partial"` / `failed_issue_closures`),
  emits `{result:"refuse", reason:"sink_incomplete", step:…}`, and early-returns (branch preserved
  for retry) — no more false `status:"sinked"`.
- **D-497-01 (WIRE)**: `closure-audit.js` wired into the finalize sink card across the 6 #400
  finalize-route surfaces (3 commands + 3 SKILLs) + a fail-closed T6 reachability pin.

## Files Changed
scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js,
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js,
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js,
scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js,
plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js, commands/kaola-workflow-finalize.md,
plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md,
plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md,
plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md,
plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md,
plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md,
scripts/test-route-reachability.js, CHANGELOG.md, docs/api.md, docs/decisions/D-497-01.md (17 files)

## Test Coverage
RED→GREEN sink-guard assertions (3 canonical + 3 forge ×2 = 9 new). All four edition chains green;
route-reachability 62 assertions (incl. T6). Coverage adequate for a targeted reliability fix.

## Final Validation Evidence
All four chains + route-reachability + contract validators green; independently re-run by the
orchestrator. Adaptive barrier (resume/gate/barrier/verdict) all exit 0. Evidence: .cache/final-validation.md

## Documentation Docking
DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- R1 (code-reviewer n3, non-blocking): the OUTER `git worktree list` probe in `assertWorktreeClean`
  (sink-merge.js ~:167-172) keeps a pre-existing fail-open `catch(_){return}` — same anti-pattern on a
  sibling probe, independent of the #496-hardened inner probe. Symmetric-hardening follow-up.

## Run gaps
- manual:reviewer_followup (R1 — sibling worktree-list probe still fail-open): filed: #506

## Closure Decision
No deferred items, conflicts, or partial implementation. The one run-discovered defect (R1) is
filed as #506. Both bundle issues are complete and may close (all-or-nothing).

## Commit And Push
[pending final Git gate]

## GitHub Issue
[pending sink — will close BOTH #496 and #497, all-or-nothing]

## Roadmap
[pending sink — remove .roadmap/issue-496.md (issue-497.md absent), regenerate once]

## Archive
[pending cmdFinalize]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix-sink-merge) | subagent-invoked | .cache/n1-fix-sink-merge.md | |
| implementer (n2-wire-closure-audit) | subagent-invoked | .cache/n2-wire-closure-audit.md | |
| code-reviewer (n3-review) | subagent-invoked | .cache/n3-review.md (verdict: pass, findings_blocking: 0) | |
| doc-updater (n4-docs) | subagent-invoked | .cache/n4-docs.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | — | no validation failures |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | runs at sink |
| archive completed folder | pending | | runs at cmdFinalize |
| final commit and push | ready | git status/diff | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
