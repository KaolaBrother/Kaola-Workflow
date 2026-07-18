evidence-binding: n5-finalize 2580ceca4882
compliance: main-session-direct
upstream_read: n4-falsify-lifecycle-fixes a1f81fd47c13

## Terminal validation (Meta validation_command, run once over the final post-documentation tree)

command: npm test && node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js
cwd: run worktree (workflow/bundle-713-714)
result: exit 0 — all four edition chains sequentially green via npm test:
- test:kaola-workflow:claude — green (incl. adaptive-node 2479 assertions, replan 832, claim-hardening 450, adaptive-handoff 179, bundle-state/claim/finalize suites, sink-merge 89, run-chains 163, simulate-workflow-walkthrough "Workflow walkthrough simulation passed" with testReviewerContractV2Conformance)
- test:kaola-workflow:codex — green (contracts + codex walkthrough passed)
- test:kaola-workflow:gitlab — green (edition-sync 12 ports/25 mirrors/28 byte groups parity, contracts + both walkthroughs passed)
- test:kaola-workflow:gitea — green (same parity + contracts + both walkthroughs passed)
- node scripts/test-kimi-edition.js — passed (577 assertions)
- node scripts/test-opencode-edition.js — passed (547 assertions)

## Gate freshness

- Named code certifier n3-code-review: complete, domain_outcome approved, findings_blocking 0, candidate_digest 4e9024c3b25112141780f7eb5b11f5487004eea99a470a729a2603194d9868a8 (current candidate).
- Standalone adversarial gate n4-falsify-lifecycle-fixes: complete, domain_outcome not_refuted, claim_outcome not_refuted, findings_blocking 0, same candidate_digest; certifies n1-lifecycle-producer-fixes.
- Post-gate tree check: worktree still carries exactly the gated candidate — 11 modified files (n1's 9 + n2's 2) plus untracked run metadata, HEAD fe994d69 == claim_root_base.commit. No code or test-consumed file changed after either gate closed; both gates are fresh against the final candidate.

## Bundle closure routing

Issues 713, 714 close together under the bundle all_or_nothing closure policy at Finalization (/kaola-workflow-finalize bundle-713-714), which owns the sink transaction, roadmap source removal, ROADMAP.md regeneration, folder archive, and closure receipt. This node wrote no tracked file.
