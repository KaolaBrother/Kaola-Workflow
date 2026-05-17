# Advisor Gate: issue-47 Ideation

## Verdict

Option A is sound — proceed.

The plan correctly mirrors the issue-44 pattern, preserves the bootstrap/startup divergence (stdout-only vs. receipt file), and keeps `runBootstrapClaim`, sweep, watch-pr, and the `ownedActiveProject` resume path. Options B and C are correctly rejected.

## Gotchas

### 1. Validator assertion string — `'no_target'` is too weak

Use `'bootstrap: --target-issue <N> is required'` (or the guard form `'if (!args.targetIssue)'`). A 9-char generic substring could match unrelated code and would fail to catch actual removal of the no-target contract.

**Resolution:** Use the full stderr string as the validator assertion in both `validate-workflow-contracts.js` and `validate-kaola-workflow-contracts.js`.

### 2. Stdout JSON shape — standardize across all verdicts

Always emit `{project, issue, verdict, claim, session, target_source?, reasoning?}` with `issue`/`project` set to `null` when unknown (e.g., in the `no_target` path). Downstream parsers should not need "key missing vs. key null" branches.

**Resolution:** No-target path emits `{project: null, issue: null, verdict: 'no_target', claim: 'none', session: args.session}`.

### 3. OFFLINE behavior is unspecified

`runBootstrapClaimFirstAvailable` returned `{pick: null}` when OFFLINE. New `cmdBootstrap` must verify what `claimExplicitTarget` does offline — if it throws instead of emitting a structured refusal, add an explicit offline guard before the call (emit `verdict: 'offline'`).

**Resolution:** Decide in Phase 3 blueprint. Check if `claimExplicitTarget` handles offline gracefully (mirrors `cmdStartup`'s offline handling); if not, add a pre-call guard.

### 4. L193/L194 validator fixes — align with NEW test descriptions

The 13A/13B tests are being **rewritten** as explicit-target parallel tests, so their descriptive headers will change. Choose the new headers for 13A/13B first, then write the validator assertions to match. This prevents "fix then re-fix."

**Resolution:** Pick new 13A/13B headers in Phase 3, then update L193/L194 to match those new headers in Phase 4.

### 5. Owned-project + mismatched target — document intended behavior

If a session owns project X and runs `bootstrap --target-issue Y` (Y ≠ X), the `ownedActiveProject` short-circuit emits resume JSON for X and silently ignores Y. This is intentional (resume takes priority) but should be documented.

**Resolution:** Document as intended behavior in Phase 3 blueprint notes. No code change needed.

## Non-Blockers (verify in Phase 3)

- **Test ordering coupling**: 6G/8I/12D/13A/13B share gh-shim setup; confirm in-place replacement preserves downstream test state.
- **Codex parity**: grep `bootstrap` under `commands/` and codex-specific contract docs.
- **`runBootstrapClaim` retention**: verify with one grep that it is called inside `claimExplicitTarget` before Phase 4 deletes anything.
