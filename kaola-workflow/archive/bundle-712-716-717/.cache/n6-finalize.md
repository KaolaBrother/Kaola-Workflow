evidence-binding: n6-finalize 22e91e8c44b6
compliance: main-session-direct
upstream_read: n5-falsify-review-gate-fixes 64eaea6a2837

## Terminal validation (Meta validation_command, run once over the final post-documentation tree)

command: npm test && node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js
cwd: run worktree (workflow/bundle-712-716-717)
result: exit 0 — all four edition chains sequentially green via npm test:
- test:kaola-workflow:claude — green (incl. adaptive-node 2425 assertions, install-model-rendering, simulate-workflow-walkthrough "Workflow walkthrough simulation passed" with testReviewerContractV2Conformance)
- test:kaola-workflow:codex — green (contracts + codex walkthrough passed)
- test:kaola-workflow:gitlab — green (edition-sync 12 ports/25 mirrors/28 byte groups parity, contracts + both walkthroughs passed)
- test:kaola-workflow:gitea — green (same parity + contracts + both walkthroughs passed)
- node scripts/test-kimi-edition.js — passed (577 assertions)
- node scripts/test-opencode-edition.js — passed (547 assertions)

## Gate freshness

- Named code certifier n4-code-review: complete, domain_outcome approved, findings_blocking 0, candidate_digest b8b618a4f2ef7a056e9ef535cd5bd2105a54083b319ecabbb2af9b8d6d342a97 (current candidate).
- Standalone adversarial gate n5-falsify-review-gate-fixes: complete, domain_outcome not_refuted, findings_blocking 0, same candidate_digest; certifies n1-reviewer-profile-resolution + n2-preflight-builtin-roles.
- No code or test-consumed file changed after either gate closed; both gates are fresh against the final candidate.

## Bundle closure routing

Issues 712, 716, 717 close together under the bundle all_or_nothing closure policy at Finalization (/kaola-workflow-finalize bundle-712-716-717), which owns the sink transaction, roadmap source removal, ROADMAP.md regeneration, folder archive, and closure receipt. This node wrote no tracked file.
