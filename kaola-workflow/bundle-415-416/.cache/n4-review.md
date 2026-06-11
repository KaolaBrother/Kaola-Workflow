evidence-binding: n4-review ce4fd439ac3d

# n4-review — post-dominating code-reviewer gate (bundle-415-416: #415 + #416)

Read-only gate over n1 (plan-validator #415/#416A), n2 (claim.js #416B), n3 (forge plan-validator regen).
Declared write set empty; no source files modified. All 10 review items verified below.

## Item-by-item findings

1. #415 freeze-only invariant — PASS
   The absolute-path refusal lives in validatePlan's freeze-only write-set loop
   (scripts/kaola-workflow-plan-validator.js:787-794), guarded by the freeze-only `freezeRoot`
   block. revalidateForResume (:1224-1250) has NO write-set token loop and is byte-untouched —
   a legacy in-flight plan with an absolute-path token still resume-checks (no brick). Confirmed.

2. Drive-letter symmetry — PASS
   Both forms refused with typed reason absolute_path:
   - `/abs/path` via `tok.startsWith('/')` (:791)
   - `C:src/app.js` via `tok.match(/^[A-Za-z]:/)` (:793)
   Regex verified against legit relative paths (src/app.js, Dockerfile, a/b/c.ts) — zero false
   positives. `C:\x` / `D:\x` (with backslash) match the drive-letter branch first → typed
   absolute_path, consistent with the documented "checked BEFORE backslash" ordering.

3. #416A hint at BOTH sites — PASS
   Corrected barrier_base_mismatch hint at --barrier-check (:1596,:1600) and --node-end
   (:1645,:1650). Each plan-validator carries exactly 4 corrected-hint occurrences (2 sites x
   {ref-missing, sha-mismatch}). grep confirms ZERO stale "re-run --record-base" hints remain in
   any of the 4 plan-validator files.

4. Idempotent-reuse branch reasoning — PASS
   The new hint ("run --drop-base then --record-base, or restore the ref; note: a fresh re-record
   after work was done would launder the crashed attempt, so prefer ref-restore where work exists")
   is grounded: --record-base's idempotent-reuse branch (:1518-1535) returns early with reused:true
   WITHOUT re-anchoring the ref, so the old "re-run --record-base" advice was a no-op against a
   missing/mismatched ref. --drop-base (:1542) clears both the .cache file and the ref. Laundering
   caveat preserved.

5. #416B skipped_offline exclusion — PASS
   computeClosePendingFinalize (claim.js:2546-2551) excludes 'skipped_offline'. Traced all three
   cases against the remoteIssueClosed assignment sites (:1810,:1853,:1862-1863):
   (a) truly OFFLINE → default 'skipped_offline', `!offline` false → close_pending false (unchanged).
   (b) online + probe throws → 'skipped_offline' while !OFFLINE → OLD expr TRUE (false close_pending);
       NEW correctly false. Verified.
   (c) probe success: 'already_closed' → false; 'close_pending' token → true. Verified live.
   Bundle 'partial' still close_pending true (intended, unchanged).

6. probe_degraded surfaced — PASS
   isProbeDegraded(offline, remoteIssueClosed) returns true ONLY when !offline && token ===
   'skipped_offline'. Attached post-build (claim.js:1894 `if (probeDegraded) closureReceipt.probe_degraded = true`)
   because the receipt schema doesn't yet carry the field. Live-verified false for offline,
   partial, kept_open, close_pending, already_closed — never spuriously surfaced.

7. Forge-neutral twin prose — PASS
   Brand-name scan of #416 added lines across all 4 claim files: zero GitHub/GitLab/Gitea in code
   (only diff filename headers matched). gitlab/gitea twins say "the forge probe". Confirmed.

8. All three claim copies (four files) — PASS
   Canonical, codex-peer (byte-identical to canonical via diff), gitlab twin, gitea twin all carry
   the helpers + exports. All four `require()` and resolve computeClosePendingFinalize +
   isProbeDegraded as functions.

9. Edition parity — PASS
   plugins/kaola-workflow/...plan-validator.js byte-identical to canonical (diff empty).
   `node scripts/edition-sync.js --check` → exit 0: "12 forge aggregator ports in rename-normalized
   parity with canonical."

10. Cross-edition test chains — PASS (all four green, run sequentially)
    claude exit 0 (196 PASSED, "Workflow walkthrough simulation passed")
    codex  exit 0 ("Kaola-Workflow walkthrough simulation passed")
    gitlab exit 0 ("GitLab + GitLab Codex walkthrough simulation passed")
    gitea  exit 0 ("Gitea + Gitea Codex walkthrough simulation passed")
    Direct: node scripts/test-claim-hardening.js → 39 assertions passed (incl. 9 new #416 probe
    assertions); walkthrough carries the 2 new #415 freeze-wall assertions (Unix abs + drive-letter).

## Severity summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 0     | pass   |

Verdict: APPROVE — all 10 review items pass, all four chains green, edition parity clean,
freeze-only invariant preserved, no source modified by this gate.

verdict: pass
findings_blocking: 0
