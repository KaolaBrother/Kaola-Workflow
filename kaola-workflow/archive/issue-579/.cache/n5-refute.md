evidence-binding: n5-refute 32a2c3268957
## n5-refute (re-run after the forge active-folders repair) — Adversarial change-gate for issue #579

Claim: "This change is correct, complete, and regression-free for issue #579." Read-only; touched zero repo files. Focus: the forge active-folders ports now parse session_marker/claim_ts/main_root so classifyLane is no longer blind, plus regression-freeness of the prior R1 (canonical ctx) fix and untouched surfaces.

### PRIMARY (forge data path, end-to-end) — SURVIVED
Built own scratch workflow-state.md fixtures, drove the REAL path readActiveFolders → classifyLane (not pure classifier) for gitlab, gitea, canonical, plugin-canonical. Could NOT make any forge edition return stale for an own-session lane:
- gitlab kaola-gitlab-workflow-active-folders.js: own-session lane (session_marker s-MINE, ctx.ownSession=s-MINE) → bucket: mine; parseStateFile/readActiveFolders surfaced main_root + claim_ts (non-empty).
- gitea kaola-gitea-workflow-active-folders.js: same → bucket: mine, fields surfaced.
- Co-tenant non-owned lane (s-OTHER + KAOLA_COTENANT) → live in both forge editions; old marker (48h) → stale; absent marker (pre-#579) → empty-string fields → stale; own-session beats co-tenant signal → mine. Identical in all four trees.
- Robustness: garbage/empty/invalid claim_ts ("not-a-date", "", "2026-13-99T99:99Z") → all stale, no crash (Date.parse→NaN guarded by Number.isFinite).
All 8 live classifyLane call sites (4 editions × cmdResume + cmdStatus) feed a readActiveFolders lane (now surfacing the 3 fields at source parseStateFile) + full ctx — defect-class closed at source, cannot recur at any consumer. Forge test assertions (testGitlabActiveFoldersSessionMarker579 / testGiteaActiveFoldersSessionMarker579) are genuine RED→GREEN (assert item.session_marker === ownSession, undefined pre-fix), not vacuous.

### REGRESSION — SURVIVED
- ffMergeLoop body md5 58fab9252844887b469e09a5f68fcdf7 byte-identical across HEAD, worktree sink-merge.js, plugin copy — unchanged.
- Canonical R1 ctx-shape fix intact: both call sites pass full ctx; canonical claim.js == codex twin byte-identical.
- validate-script-sync.js exit 0; edition-sync.js --check exit 0; test-claim-hardening.js 149 exit 0; test-adaptive-node.js 1072 exit 0; serial simulate-workflow-walkthrough.js passed (incl. testTwoLanesInOneCheckout579); gitlab + gitea forge suites pass incl. new #579 assertions.

### Non-blocking observations (not refutations)
- Forge classifier comment "Byte-identical to canonical classifier.js #579 block" slightly inaccurate — bodies differ only in inline comments/blank lines (md5 8a0ec06c forge vs 63617dc6 canonical); logic/behavior proven identical, sync gates green.
- mine detection requires a stable KAOLA_SESSION_MARKER across invocations; without it an own lane degrades to ambiguous (asks, does not stomp) — safe-by-design, documented in resolveSessionMarker, not introduced by this repair.

### Verdict
NOT-REFUTED (confidence: high) — forge fix confirmed end-to-end in both gitlab and gitea; no regression. Search was strong (5 lane states × 4 trees + degenerate-timestamp fuzzing + full sync/regression sweep + byte-parity hashing).

verdict: pass
findings_blocking: 0
