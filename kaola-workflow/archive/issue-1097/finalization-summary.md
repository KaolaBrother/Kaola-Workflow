# Finalization Summary — issue-1097

## Delivered

Issue #1097 — 把直接合并移出共享 main checkout(隔离集成 worktree + 短范围串行化) — move the
direct merge out of the shared main checkout: an isolated integration worktree carries the merge,
and publication becomes a short-scope serialized compare-and-swap. Every claimed part, judged
against the issue statement, with its covering evidence:

1. **Kernel publish primitives** (integration-worktree materialize/remove, the private-index
   `commitPathsOntoCandidate`, `acquirePublishLock`/`releasePublishLock` with provable-death
   takeover, `advanceCheckedOutDefault` with aside-relocation, `publishTargetRef`) — commit
   `1f312f2c`, materialized byte-identical into all four Oracle Kernel copies. Covered by
   test-kernel-conformance (239 assertions, including the publish-lock write rule, the DECLARED
   lock entry, and the ASIDE_SUFFIX relocation shapes) and test-oracle-kernel (48 assertions).
2. **Root sink-merge moves to the isolated integration worktree W** — the merge, rebase, and
   post-rebase test gate all happen inside `<mainRoot>/.kw/integrate/<project>` (detached,
   gitignored, regenerable at `candidate_head`); the shared checkout's HEAD never moves mid-run;
   the checkout advance after publication is report-only (`cleanup.main_checkout: advanced |
   behind: …`); tracked foreign dirt rides through with the index entry intact. Commits
   `80146cea` + the repair round `57fc4c67` (lock released for the re-rebase + gate and
   re-acquired, so a hold is one base-check + push; the three-way push-failure split; the stale-
   sweep receipt guard). Covered by test-sink-merge: 1258 assertions — AC2 concurrent lanes
   serialize on the per-repository lock and both publish linearly (with the reflog sole-touch
   pin), AC3 unstaged/staged/deleted/behind foreign-dirt legs, AC5 invalidated-evidence re-rebase
   (green and RED halves), the typed non_fast_forward give-up, the push-fault leg, dead-pid lock
   takeover, the gate-window second-acquirer leg, and the refused-ff aside restore.
3. **Both forge ports (gitlab, gitea) hand-ported** — same W-model, plus the old-model candidate
   adoption at archive_commit (merge done, no candidate_head → adopt the local default ref), so
   pre-#1097 receipts resume instead of being refused forever. Commits `3db1e3dd` + `57fc4c67`.
   Covered by the gitlab and gitea sink suites (green, exit 0) including the per-port roadmap-
   deletion, behind, and old-model-resume legs, and the per-port dead-pid takeover blocks.
4. **Serialization is short-scope and per-repository** — one publish lock in the git common dir,
   shared across worktrees; `publish_busy` is a typed queueable report at step `push_main`
   (exit 2, holder named, push_main left not-done, resumable); the wait is bounded by
   `KAOLA_WORKFLOW_PUBLISH_LOCK_WAIT_MS`. Covered by the AC2 suites and the lock-scope,
   dead-pid, and live-holder tests on all three editions.
5. **Never a force-push** — publication is an ordinary non-forced push; the server's fast-forward
   check IS the compare-and-swap; the bounded retry loop re-rebases and re-takes the gate on a
   genuine base advance, and the diverged old-model shape ends in the typed `non_fast_forward`
   (exit 2) with nothing published. Covered by the AC5 and nff legs on all editions.
6. **Routing surfaces pinned** — the finalize skeleton's PIN sentence, 24 surfaces regenerated
   byte-matched, the issue-1055 render baseline re-captured in the same commit (`54f3813f`).
   Covered by test-generate-routing-surfaces (480 assertions) and the walkthrough's finalize
   surfaces (#619(4)) plus the new isolated-integration scenario (`941e4556`).
7. **Two review repair rounds on the frozen candidates** — round 1 (`57fc4c67`): all six blocking
   findings (lock scope, push-fault classification, port adoption, missing tests, docs
   contradictions, dead code) plus the stale-sweep receipt guard; round 2 (`57c60106`): the two
   text-only findings (push-fault wording in api.md and the interface comments, and the deleted
   `stagedPathsUnder` doc-comment leftover). Review round 3 verdict: PASS on `57c60106`.

## Files Changed

37 files, +8365/−1754 over `d11a949e` (11 commits on `workflow/issue-1097`). Production surfaces:
the Oracle Kernel (adaptive-schema, claim, sink-merge) and both forge ports plus the codex
mirror; the test suites that measure them (root sink-merge, claim-hardening, both port sink and
workflow-scripts suites, kernel conformance, archive-identity, the walkthrough); the regenerated
routing surfaces and their authoring source; and the documentation set. No version bump — the
package stays v12.2.6.

## Test Coverage

- `scripts/test-sink-merge.js` — 1258 assertions (all #1097 ACs, lock scope, nff, push fault).
- `scripts/test-claim-hardening.js` — 867 assertions (incl. the stale-sweep receipt guard).
- gitlab sink suite, gitea sink suite — green, exit 0 (per-port legs + takeover blocks).
- gitlab/gitea workflow-scripts suites — green (incl. the sc2b sweep sub-case).
- `test-kernel-conformance` 239, `test-oracle-kernel` 48, `test-issue-1067-archive-identity` 22
  checks × 4 editions, `test-generate-routing-surfaces` 480, `test-spawn-classification` (766
  sites, 359 classified), walkthrough — all green.
- Full producer chain on the final tree via `kaola-workflow-run-chains.js --project issue-1097`
  (the four edition chains; receipt bound to the candidate) — recorded under ## Validation by
  the finalize transaction.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- README.md
- commands/kaola-workflow-finalize.md
- docs/README.md
- docs/api.md
- docs/architecture.md
- docs/decisions/0028-the-merge-sink-leaves-the-shared-checkout.md
- docs/workflow-state-contract.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- scripts/fixtures/issue-1055-render-baseline.json
- scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-sink-merge.js
- scripts/kernel-write-observer.js
- scripts/simulate-workflow-walkthrough.js
- scripts/test-claim-hardening.js
- scripts/test-issue-1067-archive-identity.js
- scripts/test-kernel-conformance.js
- scripts/test-sink-merge.js
- templates/routing/finalize.skeleton.md

## Documentation Docking

DOCKED — evidence in `.cache/doc-docking.md`. The changed public behavior is documented end to
end: `docs/api.md` (the W-model sink transaction, the kernel publish primitives with the real
lock semantics, the envelope fields including the round-2 push-fault wording), `README.md`,
`CHANGELOG.md` under `[Unreleased]`, `docs/decisions/0028` (the merge-sink ADR, one-repository
wording, seconds-only hold), `docs/architecture.md`, `docs/workflow-state-contract.md`,
`docs/README.md` index, the regenerated command/skill surfaces (never hand-edited), and the
public-interface comments in all four kernel copies.

## Follow-Up Items

- **Filed: #1100** (P3, bug, area:scripts) — the LANE worktree arm of `collectStale` shares the
  closed-issue active-set drop the integration arm was guarded against; proposed remedy mirrors
  the receipt guard. Issue verified open with a non-empty body. `searched:` probe recorded in it.
- No unfiled run-discovered defects remain. The round-1 residual risks are bounded by design and
  documented where they live: the sweep guard trusts receipt content (torn receipts fall back to
  the archived/closed rule; W is regenerable at `candidate_head`), and the divergence give-up
  spends its bounded retries against a static remote (recovery by design if the base moves
  mid-loop).

## Final Readiness

Ready. All seven missions done in the ledger; the candidate is frozen at `57c60106`; review
verdict PASS (round 3) on that exact tree; archive-before-publish per D3=a (#899); merge sink to
main with issue #1097 closing on the merge. No keep-open: the whole claimed set is the single
issue #1097 and it closes.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1097/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1097/.cache/doc-docking.md
- kaola-workflow/archive/issue-1097/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1097/finalization-summary.md
- kaola-workflow/archive/issue-1097/mission-ledger.jsonl
- kaola-workflow/archive/issue-1097/workflow-state.md
