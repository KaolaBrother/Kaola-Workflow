# Finalization - Summary: issue-597

## Delivered
Issue #597: the reserved `speculative_open_policy: auto` tier is defined and the freeze-time default flips `off` → `auto`. Speculation (read and leg-contained write) is auto-granted under the structural net with no per-run consent ceremony; `consent` remains authorable (flag still required there; accepted as a no-op at `auto`); `off` inert. Resume safety: absence still parses `off` (decoupled from the default) and the freeze transaction materializes an explicit policy line into Meta (hash-covered) so frozen plans are self-describing. Discard telemetry (node/role/gate) + the `parallel_safe_indeterminate` relabel. The D-419-02 per-run-consent invariant is explicitly superseded (ceremony only; every mechanical invariant untouched; operator-directed 2026-07-02) — recorded in D-597-01. Prose: six routing surfaces + speculative-open card (incl. two operational-gotcha recipes from the issue-599 live exercise) + the planner write-speculation authoring rubric (+ .toml twins ×3 + parity token).

## Files Changed
38 files across commits 5ba860b2 (engine ×4 ×5-aggregators + tests + walkthrough), 6213bc4a (two-leg synth merge: six surfaces + card + ADR + rubric + toml ×3 + parity guard), bdb77adb (hint fix ×4), 7cad328a (comment refresh: schema ×4 + test header), e7fe9510 (CHANGELOG).

## Test Coverage
test-adaptive-handoff 107→116 (materialization AC1a/b/c), test-next-action 103→113 (auto emission SPEC-7, AC4 parity SPEC-8, eligibility statics), test-adaptive-node 1314→1330 (auto activation, no-op flag, condition-refusal-at-auto, discard telemetry, O1 reason), test-agent-profile-parity 24→27, test-commit-node 123 unchanged, all six walkthroughs green (canonical asserts the materialized auto line + AC6 unknown-value refusal).

## Final Validation Evidence
- Per-node scoped runs (n1; independently re-executed by n4 with byte-equal parity repros and by n5): counts above, edition-sync --check 10 ports parity, validate-script-sync 24 in sync, schema md5 identical ×4, route-reachability 185, four contract validators green. Evidence: .cache/n1-engine.md, n2-prose.md, n3-rubric.md, n4-adversarial.md, n5-review.md.
- Full four-chain gate: `KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --project issue-597` after the CHANGELOG commit e7fe9510; receipt at .cache/chain-receipt.json (HEAD-bound). Result recorded before the final Git gate.
- Adaptive script-enforced barrier: --resume-check 0, --gate-verify 0, --barrier-check 0, --verdict-check 0.
- Validation reuse boundary: scoped runs cover code/test impact through the 7cad328a comment refresh (test-next-action re-run green after it); the CHANGELOG commit is docs-only; the four-chain receipt is bound to the final tree.

## Documentation Docking
DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (in-run) close-node n4-adversarial refused write_set_overflow then evidence_stale | orchestrator-timing artifact: the n4 R1 trivial comment fix (next-action.js ×4) was applied while n4's read window was still open, so n4's empty-write-set barrier attributed it; the subsequent baseline reset invalidated the nonce-bound evidence | repair: baseline+ref reset & fresh --record-base (files remain fully measured — they ∈ n1's declared set, n1's barrier closed green, whole-plan barrier covers them); evidence re-recorded under the fresh binding | .cache/n4-adversarial.md (orchestrator note); this ledger | resolved; lesson: apply inline fixes BETWEEN windows, never during an open read node |

## Follow-Up Items
None outstanding. Three Trivial Inline Edit Exception fixes applied and verified in-run (n4 R1 comment, n2-flagged gate_not_complete hint, n5 R1/R2 comments) — all in closed nodes' declared sets or the union allowlist, all regenerated ×4 where applicable, suites re-verified after each.

## Run gaps
(sweep empty — .cache/run-gaps.json sweptClasses: [])

## Closure Decision
None needed — no partial implementation; ACs 1-8 verified by two independent opus gates (adversarial parity repros + holistic review, both verdict: pass / findings_blocking: 0). Close on sink.

## Commit And Push
Commits 5ba860b2 / 6213bc4a / bdb77adb / 7cad328a / e7fe9510 on workflow/issue-597. Final git gate (archive + sink) pending; final hash reported after push.

## GitHub Issue
#597 — to be closed by sink-merge --sink --issue 597 (probe-before-close).

## Roadmap
Claim staged issue source reconciled by cmdFinalize; ROADMAP.md regenerated at closure.

## Archive
Pending — kaola-workflow/archive/issue-597/ via cmdFinalize (contractor Step 8b).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-engine) | subagent-invoked | .cache/n1-engine.md | |
| doc-updater (n2-prose, leg) | subagent-invoked | .cache/n2-prose.md | |
| implementer (n3-rubric, leg) | subagent-invoked | .cache/n3-rubric.md | |
| adversarial-verifier (n4) | subagent-invoked | .cache/n4-adversarial.md | |
| code-reviewer (n5) | subagent-invoked | .cache/n5-review.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failure |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md (regen at cmdFinalize) | |
| archive completed folder | pending | | |
| final commit and push | ready | git status clean of unrelated changes; push via sink-merge --sink | final gate runs after this file is committed |
| finalize (n6-finalize) | main-session-direct | .cache/n6-finalize.md | |

## Status
ARCHIVED AFTER FINAL GIT GATE
