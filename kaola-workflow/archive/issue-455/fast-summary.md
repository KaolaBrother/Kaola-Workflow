# Fast Summary: issue-455

## Status
PASSED

## Scope
- Write Set: scripts/kaola-workflow-release.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js, scripts/test-release.js, plugins/kaola-workflow/scripts/kaola-workflow-release.js, CHANGELOG.md
- Acceptance: node scripts/test-release.js && npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Plan
Dual-version cut fix: codex manifests bump in their own series via derive-default (bumpKind + deriveCodexVersion applied to codex baseline) + `--codex-version` explicit override. Guards: fail-closed `codex_version_underivable` when no last root tag and no override; monotonic `non_monotonic_codex_version` when override does not advance the baseline. Crash-resume idempotent via `codex_resolution` receipt (persisted after guards pass, before Step 1 changelog; resume reuses prior codexVersion/source and skips re-derive). Bump the 2 `.claude-plugin` manifests (gitlab + gitea) to root version (new Step 3b). README codex lines -> codexVersion; ADD README claude-install lines -> root version. Propagate canonical to all 3 release.js ports (gitlab/gitea via renameNormalize cp; codex byte copy via edition-sync --write).

## Implementation Evidence
Round 1 (RED->GREEN): rewrote T5 + added derive-major / explicit-override / non_monotonic_codex_version / codex_version_underivable cases + fixture additions (claudeVersion opt, 3 claude-install README lines, 2 .claude-plugin manifests). 24 assertions failing RED. Implemented A1-A8 in scripts/kaola-workflow-release.js. All 78 assertions passed GREEN. test_thrash 0. Ports regenerated via renameNormalize() + edition-sync --write; validate-script-sync.js exit 0.

Round 2 (RED->GREEN, crash-resume fix): added T12 (derived face) + T13 (explicit face) crash-resume tests + simulatePartialCrash helper. 4 assertions failing RED. Fixed resolution to load receipt at top of block; on resume reuse prior.codexVersion/prior.source and skip derive+monotonic-guard. All 94 assertions passed GREEN. test_thrash 0. Re-propagated via renameNormalize() + edition-sync --write; validate-script-sync.js exit 0.

Final: node scripts/test-release.js -> all 94 assertions passed (exit 0). ALL FOUR cross-edition chains green with real exit codes verified: TESTRELEASE_EXIT=0, CLAUDE_EXIT=0, CODEX_EXIT=0, GITLAB_EXIT=0, GITEA_EXIT=0 (each with its success sentinel). Live repo versions untouched (5.16.0 / 3.16.0).

Pre-existing out-of-scope noted: runCut full-completion idempotent short-circuit omits codex_version/codex_version_source in its envelope (predates #455; minor observability gap, not a correctness issue).

## Review
Round 1 verdict: BLOCK (1 CRITICAL, 2 faces). Crash-resume regression: codex resolution read the live (mutable) lockstep.baseline + re-guarded against it. Face 1 (derived): resume re-derives 3.2.0 into README+envelope while manifests stay 3.1.0 (README<->manifest mismatch, violates validate-workflow-contracts.js:486). Face 2 (explicit): resume baseline==target -> non_monotonic_codex_version refuses forever -> bricked release. Everything else clean.

Round 2 verdict: PASS (0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW). Verified idempotent receipt-cached resolution fix: both faces resolve correctly on resume; first-run refusals still fire and leave no half-mutation (non_monotonic/underivable refuse does NOT write a codex_resolution receipt so retry re-derives cleanly); forge-port parity + source purity clean; logic propagated to all 4 ports. Mutation-tested: neutering the fix makes T12 fail (got=3.2.0) and T13 fail (refuse non_monotonic_codex_version). node scripts/test-release.js exit 0, all 94 assertions; validate-script-sync.js + validate-workflow-contracts.js exit 0.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| tdd-guide | invoked | .cache/tdd-guide.md | |
| code-reviewer | invoked | .cache/code-reviewer.md | |

## Escalation
N/A
