# Phase 1 - Research / Discovery: issue-47

## Deliverable

Make `bootstrap` subcommand require explicit `--target-issue N`, same contract as `startup` (issue-44). Remove `runBootstrapClaimFirstAvailable` auto-pick function. Replace all bootstrap auto-pick tests with explicit-target tests. Update validators to assert the new no-auto-pick contract. Update README.

## Why

After issue-44, `startup` and `pick-next` require explicit agent-directed issue selection. But `bootstrap` still has `runBootstrapClaimFirstAvailable` — an older auto-picker that walks open issues and claims the first available. This creates a back-door bypass of the issue-44 contract. The principle is: "agent owns reasoning; scripts own atomicity." Scripts must not walk all issues and autonomously pick work.

## Affected Area

Primary:
- `scripts/kaola-workflow-claim.js` — remove `runBootstrapClaimFirstAvailable` (L1223-1232), rewrite `cmdBootstrap` (L1234-1262) to use `claimExplicitTarget` with `--target-issue`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — byte-identical mirror (must stay in sync)

Tests:
- `scripts/simulate-workflow-walkthrough.js` — replace tests 6G (L1089), 8I-a/owned/b (L2035), 12D (L3002), 13A/13B (L3086) with explicit-target bootstrap tests (modeled on Epic 14A–14E at L3271)
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` — mirror

Validators:
- `scripts/validate-workflow-contracts.js` L226 — replace `runBootstrapClaimFirstAvailable` assertion with `target_required` assertion
- `scripts/validate-kaola-workflow-contracts.js` L182 — same

Docs:
- `README.md` L308, L520 — update to remove auto-scan description; document explicit-target bootstrap

## Key Patterns Found

1. **`claimExplicitTarget` at L1285**: The exact function `cmdBootstrap` should call. Same args as `cmdStartup`. Returns `status: 'acquired'` or one of `target_occupied`/`target_unavailable`/`user_target_blocked`/`user_target_red`.
2. **`cmdStartup` no-target guard at L1405**: `if (!args.targetIssue) { /* write no_target receipt, exit 1 */ }` — identical guard needed in `cmdBootstrap`.
3. **Epic 14A–14E at L3271–3380**: Explicit-target startup tests — the exact pattern for new bootstrap explicit-target tests (same gh shim setup, same receipt assertions).
4. **`runBootstrapSweep` and `runBootstrapWatchPr`**: Still called in `cmdBootstrap` at top of function — these background housekeeping calls are PRESERVED; only the auto-pick logic is removed.
5. **`ownedActiveProject` check at cmdBootstrap**: Still needed — if this session already owns a project, emit resume JSON and return (same as current behavior).

## Test Patterns

- Framework: Hand-rolled assert (`assert`, `assert.strictEqual`, `assert.deepStrictEqual`), no test framework
- Location: `scripts/simulate-workflow-walkthrough.js` (primary), mirrored to `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- Structure: `try { ... } finally { cleanup }` blocks per epic; gh shim in `bin/` subdir; `HOME` env redirected to temp dir; lock files at `<tmpdir>/.git/kaola-workflow/.locks/`
- Validation: `node scripts/validate-script-sync.js` — confirms both files byte-identical
- Explicit-target test pattern: `execFileSync(process.execPath, [claimJS, 'bootstrap', '--session', sess, '--runtime', 'claude', '--target-issue', '201'], { env: { ...process.env, HOME: tmpDir, PATH: bin + ':' + process.env.PATH } })`

## Config & Env

- `OFFLINE` env var: when set, disables gh calls. `runBootstrapClaimFirstAvailable` returns `{ pick: null }` immediately. New `cmdBootstrap` should behave similarly (no-target/offline refusal).
- `KAOLA_KERNEL_SESSION_SKIP=1`: bypasses platform session enforcement in tests.
- `KAOLA_WORKFLOW_OFFLINE=1`: forces offline mode in tests.
- Plugin mirror enforcement: `scripts/validate-script-sync.js` — must pass after every change.

## External Docs

N/A — all changes are internal to the kaola-workflow codebase. No external library or API behavior needed.

## GitHub Issue

KaolaBrother/Kaola-Workflow#47

## Completeness Score

10/10
- Goal clarity: 3/3 (precise deliverable: remove auto-pick, add explicit-target contract to bootstrap)
- Expected outcome: 3/3 (acceptance criteria in issue; mirrors issue-44 pattern exactly)
- Scope boundaries: 2/2 (specific files and line numbers identified)
- Constraints: 2/2 (plugin mirror invariant; no new external deps; simulate-workflow-walkthrough passes)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | No external library/API behavior needed; all internal | |

## Notes / Future Considerations

- Pre-existing validator bug in `validate-kaola-workflow-contracts.js` L193 asserts `'real parallel bootstrap coordination and claim-race retry'` — a string not present in the simulate script. This is a pre-existing issue, not introduced by #47. Fix it in scope: update the assertion to match the actual string present in the test.
- Tests 8I-owned (bootstrap returning `verdict: 'owned'` when session already owns a project) must be preserved — the owned-project resume path is unrelated to auto-pick and must still work.
- `runBootstrapSweep` and `runBootstrapWatchPr` remain in cmdBootstrap (background housekeeping only, no issue selection).
