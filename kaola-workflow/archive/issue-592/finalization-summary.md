# Finalization - Summary: issue-592

## Delivered
Fix for issue #592: `sink-merge --sink` invoked with only `--issue-numbers A,B` (bundle sink, no primary `--issue`) skipped the entire closure loop yet recorded `closure: done` / `status: sinked` — zero issues closed, permanently (resume skips done steps). The closure gate is widened to `!OFFLINE && (args.issue != null || issueNumbers.length > 0)`; the primary close runs only when `args.issue != null`; the bundle-member loop bound widens from `> 1` to `> (args.issue != null ? 1 : 0)` so every member closes when no primary is present; `receipt.closed_issues` is now recorded on the success path too, enabling verify-then-retry resume. Fail-closed `sink_incomplete` refuse unchanged. Landed atomically in all four sink-merge editions (canonical, codex byte-twin, gitlab/gitea forge ports) with genuine RED coverage in each chain's sink test.

## Files Changed
- scripts/kaola-workflow-sink-merge.js
- plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js (byte-identical twin, cmp-verified)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js
- scripts/test-bundle-finalize.js (new no-primary --sink E2E test; 118 tests)
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js
- CHANGELOG.md, docs/api.md, docs/workflow-state-contract.md, docs/decisions/D-592-01.md (new)

## Test Coverage
No formal coverage pipeline (Node scripts, hand-rolled asserts). The fixed path is pinned by three new E2E tests driving the real `--sink` transaction (claude/gitlab/gitea chains); the codex chain proves the byte-identical twin transitively.

## Final Validation Evidence
- Per-node scoped runs (n1-fix, re-run by n3-review): `node scripts/test-bundle-finalize.js` (118 passed), `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` (passed), `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` (passed), `node scripts/simulate-workflow-walkthrough.js` (passed), `cmp` byte-identity (silent). Evidence: .cache/n1-fix.md, .cache/n3-review.md.
- Full four-chain gate: `KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --project issue-592` run by the orchestrator after the impl commit (c4e3df84); receipt at .cache/chain-receipt.json (HEAD-bound). Result recorded below before the final Git gate.
- Adaptive script-enforced barrier: `--resume-check` 0, `--gate-verify` 0, `--barrier-check` 0, `--verdict-check` 0.
- Validation reuse boundary: the scoped runs cover code/test impact through n3-review; the only later edits are workflow artifacts (this summary, docking record) — docs-only relative to the chain-asserted tree, outside the rerun trigger; the four-chain receipt is bound to the impl commit tree.

## Documentation Docking
DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| npm run test:kaola-workflow:gitlab (chain 1st run) | forge-purity contract: new test's mock log filename `-gh-calls.log` matched the gitlab validator's `\bgh\b` needle | Trivial Inline Edit Exception (one-line mechanical rename, inside n1-fix's declared write set): gitlab → `-glab-calls.log`, gitea → `-tea-calls.log` (same latent name; its validator lacks the needle) | test-gitlab-sinks.js:1348, test-gitea-sinks.js:1300; re-run: gitlab sinks OK / gitea sinks OK / gitlab contracts OK | fixed; amended into impl commit c4e3df84; full four-chain re-run against new HEAD |

## Follow-Up Items
None. n3-review recorded a single noise-level note (CHANGELOG "behaviorally unchanged" phrasing vs the disclosed additive `closed_issues` receipt field) — intentional, documented, no action.

## Closure Decision
None needed — no deferred items, no partial implementation, no unresolved conflicts. Issue #592 acceptance criteria met (no-primary bundle closure runs; closed set recorded; AC3 primary shapes unchanged; fail-closed refuse preserved). Close on sink.

## Commit And Push
Impl commit c4e3df84 on workflow/issue-592 (3360f7e4 amended with the forge-purity test rename). Archive commit eaaf166a ("chore: archive issue-592") recorded by cmdFinalize on workflow/issue-592 (--keep-worktree). After the archive commit, `git status` was clean in both the worktree and the main checkout — no further changes to stage, so no separate "chore: finalize issue-592" commit was created (Step 8 fallback: branch already contains the final candidate commit). sink-merge --sink (Step 9) still pending, run by the orchestrator.

## GitHub Issue
#592 — to be closed by sink-merge --sink --issue 592 (probe-before-close).

## Roadmap
No committed kaola-workflow/.roadmap/issue-592.md source existed at HEAD (issue filed post-close of the prior session). cmdFinalize's closure reconciliation additionally found and removed a STAGED-but-uncommitted stray `kaola-workflow/.roadmap/issue-592.md` (present in both the main checkout and the worktree at Step 8a mirror time, before cmdFinalize ran; origin unknown) — receipt fields: `roadmap_source_removed: absent`, `roadmap_staged_reconciled: ["issue-592.md"]`, `roadmap_removed_by_root: {"592":{"worktree":true,"main":true}}`. Net result: zero diff against HEAD; ROADMAP.md content unchanged ("No active work").

## Archive
Done — kaola-workflow/archive/issue-592/ via cmdFinalize (contractor Step 8b), commit eaaf166a on workflow/issue-592.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | subagent-invoked | .cache/n2-docs.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failure |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md (regen at cmdFinalize) | |
| archive completed folder | done | commit eaaf166a | |
| final commit and push | done | worktree HEAD eaaf166a; main checkout untouched (merge pending via sink-merge --sink) | |
| finalize (n4-finalize) | main-session-direct | .cache/n4-finalize.md | |

## Status
ARCHIVED AFTER FINAL GIT GATE
