# Finalization - Summary: issue-576

## Delivered
Machine-enforced the "keep provenance out of agent-facing prompts" convention (#575 follow-up): added a `PROVENANCE_BAN` guard to all five contract validators + the additive opencode suite, and stripped the last 13-file prompt-surface stragglers the manual #575 sweep missed.

## Files Changed
21 files:
- Guard (6): scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js (byte-mirror pair), scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-opencode-edition.js (A25 + 17 assertions).
- Strip (13): agents/workflow-planner.md + 3× workflow-planner.toml (INV-17→validator-derived); commands/workflow-next.md + 2 forge ports + 3× kaola-workflow-next/SKILL.md (#42/#47/#53→#N); 3× kaola-workflow-adapt/SKILL.md (#142→#<N>).
- Docs (2): docs/conventions.md (machine-enforcement subsection), docs/decisions/D-576-01.md (new).
- Finalize (1): CHANGELOG.md ([Unreleased] entry).

## Test Coverage
N/A (Node scripts, no coverage tool). Verification is the four contract+walkthrough chains + the additive opencode suite + targeted parity tests.

## Final Validation Evidence
- n4 code-reviewer (read-only gate): `KAOLA_RUN_CHAINS_CONCURRENCY=serial npm test` exit 0, all four edition sentinels confirmed (claude/codex/gitlab/gitea); `node scripts/test-opencode-edition.js` → "opencode-edition test passed (494 assertions)". verdict: pass, findings_blocking: 0. Evidence: .cache/n4-review.md.
- n3 adversarial-verifier (opus, read-only): strip-completeness (0 banlist hits, broad sweep 0), enforcement-hole audit (every validator scans its complete surface set), regex taxonomy matrix clean, INV-17 meaning preserved + agent-profile-parity green. verdict: pass. Evidence: .cache/n3-meaning-verify.md.
- All four adaptive barrier gates green (resume=0 gate=0 barrier=0 verdict=0).
- Authoritative all-done chain receipt: .cache/chain-receipt.json (run-chains.js --project, serial concurrency).

## Documentation Docking
DOCKED — see .cache/doc-docking.md.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- #577 (filed) — opencode hooks plugin has no tracked source; fresh-clone install deploys nothing + test-opencode-edition.js A11/P1/G1/H1 fail in a clean worktree. Pre-existing, out of #576 scope.

## Run gaps
- manual:opencode-worktree-env (test-opencode-edition.js A11/P1/G1/H1 fail in a fresh worktree because .opencode/plugins/kaola-workflow-hooks.js is untracked & not regenerable): filed: #577

## Closure Decision
No deferred items, conflicts, or partial work within #576 scope. The one run-discovered defect (opencode plugin source gap) is filed as #577. Issue #576 is complete and closeable.

## Commit And Push
[pending final Git gate]

## GitHub Issue
#576 — to be closed by sink-merge after FF-merge to main.

## Roadmap
Updated (cmdFinalize removes .roadmap/issue-576.md + regenerates ROADMAP.md).

## Archive
[pending — cmdFinalize archives kaola-workflow/issue-576/ → kaola-workflow/archive/]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| n1 tdd-guide (strip+guard) | complete | .cache/n1-provenance-guard.md | |
| n2 doc-updater | complete | .cache/n2-docs.md | |
| n3 adversarial-verifier (change-gate) | complete | .cache/n3-meaning-verify.md | |
| n4 code-reviewer (G1 gate) | complete | .cache/n4-review.md | |
| n5 finalize | main-session-direct | .cache/n5-finalize.md | |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/diff/upstream | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
