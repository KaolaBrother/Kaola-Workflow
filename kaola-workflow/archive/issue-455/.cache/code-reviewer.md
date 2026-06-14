# code-reviewer evidence — issue #455

## Round 1 verdict: BLOCK (1 CRITICAL)
Crash-resume regression: codex resolution read the live (mutable) lockstep.baseline + re-guarded
against it. Two faces, both empirically reproduced:
- Face 1 (derived): resume re-derives 3.2.0 into README+envelope while manifests stay 3.1.0 →
  README↔manifest mismatch (violates validate-workflow-contracts.js:486).
- Face 2 (explicit): resume baseline==target → non_monotonic_codex_version refuses forever → bricked release.
Everything else (functional design, README dual-axis, JSON envelope, forge-port purity/parity, security) clean.

## Round 2 verdict: PASS (0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW)
Verified the idempotent receipt-cached resolution fix:
1. Both faces resolve correctly on resume (face 1 reuses 3.1.0 across manifest/README/envelope;
   face 2 returns result:ok codex_version:3.9.9).
2. First-run refusals still fire and leave NO half-mutation (persist ordered after guards, before
   Step 1); crucially the non_monotonic/underivable refuse does NOT write a codex_resolution receipt,
   so a retry with corrected input re-derives cleanly (no cached bad state).
3. No new issue from the receipt cache: full-completion idempotent short-circuit still fires first;
   codex_resolution find() is orthogonal to version-keyed isStepDone; multiple resumes append exactly
   one entry and all reuse it.
4. Forge-port parity + source purity clean; logic propagated to all 4 ports.
Test quality: MUTATION-TESTED — neutering the fix makes T12 fail (got=3.2.0) and T13 fail (refuse
non_monotonic_codex_version), i.e. the regression tests genuinely bite. node scripts/test-release.js
exit 0, all 94 assertions; validate-script-sync.js + validate-workflow-contracts.js exit 0.

Verdict: PASS.
