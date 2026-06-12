evidence-binding: n10-review a623fcafd4f4

verdict: pass
findings_blocking: 0

## Findings

### Blocking
(none)

The first review's blocking finding — seedEvidenceFile(forceRotate=true) rewrote
only line 1 and preserved the stale body — is RESOLVED. Confirmed at
scripts/kaola-workflow-adaptive-node.js:285-301: the forceRotate branch now builds
freshContent (binding line + fresh role stubs) and fs.writeFileSync's the ENTIRE
file, discarding the old body. The #392 anti-replay guard is restored: prior-attempt
evidence (verdict: pass / GREEN / findings_blocking: 0) can no longer survive a reopen.

### Verification performed

1. forceRotate fix re-seeds entire file — CONFIRMED.
   - scripts/kaola-workflow-adaptive-node.js:285-301 writes freshContent (full file).
   - Reopen consumer at :2013 passes forceRotate=true with the fresh reopen nonce.
   - Propagated to all 4 editions: claude-root + codex twin byte-identical
     (md5 fff4a59c…); gitlab + gitea share their own md5 (1d5c37b1…), differing only
     by the validator require-path noun (verified by diff — logic identical).

2. T3 asserts stale body absent + fresh stubs present — CONFIRMED (:2755-2765).
   - T2 (:2748) writes a body containing "RED: some test output", then T3 (:2758)
     forceRotate=true and asserts (:2763) that string is GONE, plus fresh RED:/GREEN:
     stubs present (:2764-2765). The ordering makes T3 a genuine regression test:
     it fails against the old line-1-only behavior. Present in all 4 editions.

3. No new regression from the fix — CONFIRMED.
   - The fix is isolated to the `if (forceRotate)` branch. The forceRotate=false normal
     seed path (:307-322) and the crash-resume idempotency path (:303-304) are untouched.
   - T1/T2/T5 (normal seed + crash-resume no-overwrite + implementer stubs) all pass.
   - seedEvidenceFile is wholly new in this bundle (git diff: all-additions), so the
     change lands as one cohesive feature with no pre-existing behavior altered.

4. Four chains GREEN — CONFIRMED (run this dispatch):
   - claude_exit=0, codex_exit=0, gitlab_exit=0, gitea_exit=0.
   - adaptive-node --self-test: 28/28 passed in all 4 editions (incl. the 3 new T3 asserts).
   - test-run-chains.js: 36 assertions passed.

### Advisory (non-blocking — unchanged from prior review; confirmed still advisory)

- chains_stale gates on headSha only (plan-validator.js:1872). The receipt's
  workTreeHash field is recorded by run-chains but never compared at finalize, so an
  uncommitted edit made after the chains ran (HEAD unchanged) would not surface as
  stale via this gate. Mitigated by the independent attribution sweep (B, :1883+)
  which catches out-of-window changes via `git diff base...HEAD`. Follow-up: either
  wire workTreeHash into the staleness compare or drop the dead field. Not a blocker —
  the finalize flow commits before running chains, so HEAD-binding covers the
  committed state, and the sweep provides a second guard.

- --accept-known-red waiver (run-chains.js:100-126) validates format <name>:<issue>
  (both non-empty) AND requires `name ∈ KNOWN_CHAINS`. It does NOT verify the issue
  number references an actually-open GitHub issue — a closed/bogus issue ref would be
  accepted. This is an explicit human escape hatch whose issue ref is for auditability;
  the residual gap is defense-in-depth, not correctness. Stronger than the prior
  review described (which said "any non-empty string"). Not a blocker.

### Cross-edition / scope notes

- run-chains.js canonical == codex twin byte-identical; gitlab/gitea are edition-named
  hand-mirrors (correct per #309).
- n4-node-evidence.md binding nonce rotated to 90d0b81b9dbf (reopened to apply this fix)
  with T3 inverted to "stale body must be gone after forceRotate" — this IS the live
  artifact of the forceRotate fix. Consistent with the reopen/re-seed flow.
