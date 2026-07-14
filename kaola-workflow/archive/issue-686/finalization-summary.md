# Finalization - Summary: issue-686

## Delivered
Archived projects no longer strand their per-node barrier gc-anchor refs (`refs/kaola-workflow/barrier/<tag>/*`).
`archiveProjectDir` now reaps this project's own barrier refs after the archive is verified (fail-soft), and a new
one-shot `kaola-workflow-claim.js barrier-ref-sweep` subcommand collects the ~239 pre-existing stranded refs under
a keep-everything-live discipline (keep across all worktree roots by active-folder tag, live running-set.json, or
an unreadable-but-present workflow-state.md; ADD-only on collisions; scoped to barrier/ only; fails closed on an
unenumerable worktree set).

## Files Changed
- scripts/kaola-workflow-claim.js (+ 3 edition ports) — archive-time reap + barrier-ref-sweep + keep discipline
- scripts/test-claim-hardening.js — RED-first regressions (reap, fail-soft, all-worktrees keep, -z parse, case-fold, unreadable-state keep, mutation-kill)
- docs/decisions/D-686-01.md (new), docs/workflow-state-contract.md (barrier-ref lifecycle), CHANGELOG.md

## Test Coverage
test-claim-hardening.js 245 assertions, 0 failures; walkthrough passed. Cross-edition diff → all four
test:kaola-workflow:{claude,codex,gitlab,gitea} chains (run sequentially, chain-receipt.json).

## Final Validation Evidence
Self-host four-chain receipt: kaola-workflow/issue-686/.cache/chain-receipt.json (all chains exit 0).
Plan-validator finalize gates: --resume-check=0, --gate-verify=0, --verdict-check=0, --barrier-check=0
(no --base — single-issue run, all work attributed to plan nodes). --finalize-check: pass.

## Documentation Docking
DOCKED — D-686-01 records the reap+sweep decision, the keep-signal discipline, the ref namespaces, and the
documented out-of-band residual limitations; workflow-state-contract.md documents the barrier-ref lifecycle;
CHANGELOG carries #686 under [Unreleased].

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- #690 — the #686 R6 test fixture tmpdir leak — DISCHARGED in-run (n1's R8 repair hoisted nlPath686g + added its
  finally cleanup); close #690 at sink.
- #691 — barrier-ref-sweep reaps a live project whose DIRECTORY is chmod-000 (existsSync ENOENT-vs-EACCES);
  pre-existing, out-of-band, filed with the statSync-ENOENT fix ready.
- R11 (documented, no issue) — a sanitize-collision over-reap needs two hand-crafted aliasing --project names no
  shipped generator produces (upstream-broken anyway); candidate follow-up noted in D-686-01: refuse claim
  --project names that sanitize-collide with a live folder.

## Run gaps
- in_run_repair (n2-review): noise: the code-reviewer gate found an over-reap (R1: keep-set scoped to cwd root, not the shared mainRoot store), repaired in-run RED-first and re-verified — the review/repair loop working as designed, not a shipped defect.
- in_run_repair (n3-adversary): noise: the adversarial gate found three over-reap classes (R4 third-worktree keep-universe, R6/R7 worktree-path parse, R8 unreadable-state keep-signal), each repaired in-run RED-first and re-verified; the residual out-of-band edges were filed (#691) or documented (R11 in D-686-01) — not shipped defects.

## Closure Decision
No open user-decision items. All in-run findings resolved or filed; the sweep is a one-shot manual subcommand
(not wired into any automatic flow), documented in D-686-01.

## Commit And Push
Single-node feature diff (n1 claim.js ×4 + test; n4 docs; n5 CHANGELOG), uncommitted in the worktree; finalize
commits and sinks.

## GitHub Issue
Closing #686 at sink. Also close #690 (discharged in-run).

## Roadmap
Regenerated at closure (issue-686 source removed).

## Archive
Pending cmdFinalize.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/n4-docs.md | |
| documentation docking | invoked | this summary + D-686-01 | |
| final-validation fix executors | invoked | .cache/n1-reap-sweep.md (R1/R4/R5/R6/R7/R8 repairs) | |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | runs at cmdFinalize |
| archive completed folder | pending | | runs at cmdFinalize |
| final commit and push | ready | git status/log | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE

## Attestation
claim_planner_attested: attested
finalize_contractor_attested: missing
ATTESTATION WARNING: no contractor dispatch found in dispatch-log — finalize seam may have been run inline by main session
