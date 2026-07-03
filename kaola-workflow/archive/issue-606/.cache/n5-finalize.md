evidence-binding: n5-finalize 724a04f7881e

# n5-finalize — sink node (main-session-direct)

compliance: main-session-direct

## Work performed

1. CHANGELOG.md: one `### Added` entry for the Claude dispatch-posture feature (report-only agent-teams detection in install.sh + workflow-init config-audit; teammate-mode dispatch subsection ×6 plan-run surfaces; validator/route-reachability guards; D-606-01) — written BEFORE the binding chain run (receipt-freshness discipline). Joins the six existing [Unreleased] entries pending the v6.19.0 cut.

2. Gate redispatch (recorded): the first n4-review agent instance terminated unreachable without delivering (no idle notification, no error report — distinct from the known idle-before-delivery race). The node sat in_progress with only its seeded evidence stub; a fresh opus reviewer was redispatched per the crash-resume contract, trusted nothing from the lost instance, and re-ran the full review + four chains. verdict: pass, findings_blocking: 0.

## Validation (binding receipt)

- FIRST receipt attempt: claude chain exit 1 at duration_ms 900013 — a TIMEOUT KILL at the runner's default per-chain budget (KAOLA_RUN_CHAINS_TIMEOUT_MS 900000), not a test failure: every CHANGELOG-adjacent member re-run directly was green (test-release-surface-drift, test-release, validate-workflow-contracts, test-route-reachability, test-install-model-rendering — all exit 0), and the chain had already measured 821s on the previous bundle before this issue added sandboxed-install posture cases.
- FINAL receipt: `KAOLA_RUN_CHAINS_CONCURRENCY=serial KAOLA_RUN_CHAINS_TIMEOUT_MS=1500000 node scripts/kaola-workflow-run-chains.js --project issue-606` — claude/codex/gitlab/gitea ALL exit 0 (claude 976s, under the raised budget), accepted_red none; receipt headSha 3db2c398 (current branch HEAD), completedAt 2026-07-03T08:49:47Z; workTreeHash covers the uncommitted CHANGELOG.
- Validation reuse boundary: the receipt covers all code/prose/doc impact through the merge commit 3db2c398 plus the uncommitted CHANGELOG (hashed). No edits after the receipt.
- n4-review (opus, redispatch) independently ran the four chains green before its verdict.

## Gate verdicts

- n4-review (opus): verdict pass, findings_blocking 0; both load-bearing negatives verified (report-only boundary held by construction + test; zero behavior change — no script reads the flag); six-surface parity byte-identical; byte-pair wall held; PROVENANCE_BAN clean.

verdict: pass
