# Finalization - Summary: bundle-607-608

## Delivered
- #608 — run-chains timeout observability: receipt per-chain `timed_out: true|false` (persisted from the existing internal marker), TIMEOUT-labelled failure summary + finalize `chains_red` operator hint naming the `KAOLA_RUN_CHAINS_TIMEOUT_MS` remedy, default per-chain budget recalibrated 900000→1800000 ms, guard tests both ways (T24/T25 + T12 updated), 4-edition parity.
- #607 — main-session-gate runtime write fence, three layers: (L1) planner/plan-run prose across 13 planner surfaces + 6 plan-run surfaces mandating upstream instrumentation provisioning (validator needles + route-reachability T15 + md↔toml parity token enforce it); (L2) `kind:'gate'` running-set state channel (open-next + fused advance record; close/reconcile remove; slot math + liveStable exclude gates; kind-consumer audit clean) + write-lane hook rule (c) denying in-worktree out-of-band Write/Edit during a gate window (default-ON, `KAOLA_GATE_WINDOW_FENCE=0` opt-out, carve-outs for workflow bands/.kw band/member worktrees/co-open lanes/out-of-repo, all fail-open exits preserved); (L3) required `instrumentation: none | <node-id>` gate-evidence token (close refuses on absence; named node must be a ledger writer).

## Files Changed
5 commits over cfa910d9: 3 leg commits + kw-synth octopus merge (fd8d1377) + docs commit (b64a5734). ~41 files: run-chains.js ×4, plan-validator.js ×4, adaptive-node.js ×4, write-lane.sh ×4, walkthrough + test-adaptive-node + test-run-chains + test-route-reachability + test-agent-profile-parity, contract validators ×4, planner md/toml ×4, adapt SKILL ×3, plan-run command ×3 + SKILL ×3, CHANGELOG, 2 ADRs, workflow-state-contract, conventions, architecture, api.md, README, .env.example.

## Test Coverage
Hand-rolled assert suites (no coverage tooling). test-adaptive-node 1352 assertions; test-run-chains 125; route-reachability 257; agent-profile-parity 27; walkthrough full suite incl. new gate-window hook matrix c1..c8b; opencode 499.

## Final Validation Evidence
- Four chains green, serial, receipt HEAD-bound: claude 842s / codex 18s / gitlab 220s / gitea 224s, all exitCode 0, all timed_out false; receipt kaola-workflow/bundle-607-608/.cache/chain-receipt.json, headSha b64a5734 == HEAD. Run by n6-review (.cache/n6-review.md).
- Validation reuse boundary: the receipt covers code + chain-asserted docs through the n5 docs commit (b64a5734); no tracked-file change after it except this finalization band (kaola-workflow/*.md — receipt codeTreeHash-inert).
- node scripts/test-run-chains.js standalone: 125 assertions green (n6).
- node scripts/test-opencode-edition.js: 499 green; sync-opencode-edition --check: 15 agents + 11 commands + 1 plugin in parity (orchestrator, post-docs).
- Adaptive barriers at finalize: resume-check 0, gate-verify 0, barrier-check 0, verdict-check 0.

## Documentation Docking
DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items
None blocking. Noise-level observations recorded in gate evidence (n4: pre-existing `.cache`-anywhere band semantics; sticky fence after mid-gate crash is the intended fail-closed tripwire, documented; write_awaits_drain makespan effect in a narrow DAG shape. n6: pre-existing api.md `exit` label in receipt example; fence per-write cost accepted/documented). No follow-up issues filed (user permission required to file).

## Run gaps
(sweep clean — .cache/run-gaps.json sweptClasses: [] , --check pass)

## Closure Decision
None needed — no deferred items, no partial implementation, no user-decision items. Both issues' acceptance criteria verified MET by n6-review (12/12). Bundle closure all_or_nothing: #607 + #608.

## Commit And Push
Pending final Git gate (contractor Step 8 + sink-merge --sink; final hash reported after push).

## GitHub Issue
#607, #608 — to be closed by the bundle sink (--issue 607 --issue-numbers 607,608).

## Roadmap
Regenerated at closure by cmdFinalize (no .roadmap/issue-607.md / issue-608.md sources existed — filed post-v6.19.0; closure unlink no-op expected).

## Archive
Pending — kaola-workflow/archive/bundle-607-608/ via cmdFinalize.

## Mid-run plan governance (recorded)
n5's write set was widened mid-run (docs/api.md, README.md, .env.example) after n5 flagged stale env-var docs; the .env.example write classified n5 sensitive (G2), so n5s-envsec (security-reviewer, verdict: pass, 0 blocking) was added post-dominating n5; plan re-frozen in-grammar, hash eccb0611… → 057e8481… (refused, no write) → b7f3b5b7… (in-grammar, stamped).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | subagent-invoked (n5-docs plan node) | .cache/n5-docs.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failure |
| roadmap refresh | pending cmdFinalize | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status clean except workflow band; upstream origin | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
