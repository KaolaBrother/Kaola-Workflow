# Finalization - Summary: issue-598

## Delivered
Issue #598: the Codex runtime's local dispatch configuration is now a verified part of the install contract. (AC1/AC2) A `deriveDispatchPosture` derivation (features-off → none; effort ultra → proactive; else explicitRequestOnly; version-guarded on codex-tui 0.142.5), authored once and mirrored byte-identically across the installer ×3 and preflight ×4 groups: the installer reports the effective posture + exact remediation before `status: ok` (non-fatal by construction; report-only — never writes user-owned effort config), and the preflight/doctor gains four additive fields + an attestation-style WARN. (AC3) The delegation probe in the six Codex next/adapt SKILLs accepts BOTH the project-local and global `~/.codex/agents/kaola-workflow/` paths. (AC4) The six plan-run routing surfaces carry the Gate-Role Degradation Notice in lockstep: a run-start notice naming the self-reviewing gate roles + consent-halt routing for adversarial-verifier/code-reviewer instead of a silent self-issued `verdict: pass`. Contract-validator needles ×3 machine-guard both propagations; workflow-init config-audit ×3 byte-pairs no longer reports features-alone as dispatch-ready.

## Run shape (durable observations)
- n1∥n2 co-opened as a two-leg lane group (the exact-path co-open default), merged clean (fc229372).
- **First production AUTO-tier speculation**: n5-docs opened speculatively via `open-ready` with NO consent flag (the flipped default, materialized `speculative_open_policy: auto` in this plan's Meta) while the n4 gate ran; gate passed; leg pass-merged clean (group_passed, db62b9c1). The full #596+#597 stack observed end-to-end under the default posture.

## Files Changed
32 files across fc229372 (n1: installer ×3 + preflight ×4 + 4 test files; n2: 12 prose surfaces + 3 validators), db62b9c1 (n5: README, api.md, architecture.md, workflow-init ×6, D-598-01), 95908a35 (CHANGELOG).

## Test Coverage
RED-first: posture derivation asserted `undefined` pre-impl (n1 RED); validator needles asserted missing pre-prose (n2 RED, per-AC isolated). New: 18+ dispatch-posture assertions across installer/preflight/codex/gitlab/gitea suites (posture value, warning-iff-not-proactive, exit codes, `status: ok` ordering); adversarial 69-cell truth table + A/B non-fatality battery (zero false-proactive, zero exit-code regressions).

## Final Validation Evidence
- Per-node runs: test-install-model-rendering green, codex/gitlab/gitea chain tests green, canonical walkthrough green, route-reachability 185, validate-script-sync 25 byte-groups, all four contract validators green. Evidence: .cache/n1-runtime-dispatch-contract.md, n2-delegation-gate-prose.md, n3-adversarial.md, n4-review.md, n5-docs.md.
- Full four-chain gate: `KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --project issue-598` after the CHANGELOG commit 95908a35; receipt at .cache/chain-receipt.json (HEAD-bound). Result recorded before the final Git gate.
- Adaptive script-enforced barrier: --resume-check 0, --gate-verify 0, --barrier-check 0, --verdict-check 0.
- Validation reuse boundary: scoped runs cover code/test impact through n5; the CHANGELOG commit is docs-only; the four-chain receipt is bound to the final tree.

## Documentation Docking
DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items
None blocking. Two noise-level observations from n4 (pre-existing substring-subsumed needle; security-reviewer notice-only floor — faithful to the AC's two-role consent-halt scoping) and one from n5 (pre-existing #584 dispatch_mode doc gap in api.md) recorded as observations, no issues filed (none is a defect of this change).

## Run gaps
(sweep empty — .cache/run-gaps.json sweptClasses: [])

## Closure Decision
None needed — all five ACs verified MET by two independent opus gates (adversarial truth-table battery + holistic review, both verdict: pass / findings_blocking: 0). Close on sink.

## Commit And Push
Commits fc229372 (merge) / db62b9c1 (merge) / 95908a35 on workflow/issue-598. Final git gate (archive + sink) pending; final hash reported after push.

## GitHub Issue
#598 — to be closed by sink-merge --sink --issue 598 (probe-before-close).

## Roadmap
Claim staged issue source reconciled by cmdFinalize; ROADMAP.md regenerated at closure.

## Archive
Pending — kaola-workflow/archive/issue-598/ via cmdFinalize (contractor Step 8b).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1, leg) | subagent-invoked | .cache/n1-runtime-dispatch-contract.md | |
| tdd-guide (n2, leg) | subagent-invoked | .cache/n2-delegation-gate-prose.md | |
| adversarial-verifier (n3) | subagent-invoked | .cache/n3-adversarial.md | |
| code-reviewer (n4) | subagent-invoked | .cache/n4-review.md | |
| doc-updater (n5, auto-speculative leg) | subagent-invoked | .cache/n5-docs.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failure |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md (regen at cmdFinalize) | |
| archive completed folder | pending | | |
| final commit and push | ready | git status clean of unrelated changes; push via sink-merge --sink | final gate runs after this file is committed |
| finalize (n6-finalize) | main-session-direct | .cache/n6-finalize.md | |

## Status
ARCHIVED AFTER FINAL GIT GATE
