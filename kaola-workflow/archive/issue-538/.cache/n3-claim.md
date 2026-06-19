evidence-binding: n3-claim f95d1a7877bd
<!-- RED: paste RED here -->
RED: n3-red fixture (3 cases via claim CLI, hermetic HOME {installed_paths:[]}) all FAIL against the unfixed claim.js — `adaptiveSchema.resolveEnableAdaptive is not a function` (the retired symbol). Signature: `FAIL- KAOLA_PATH=fast + installed_paths:[] => path_not_installed/refuse (got null RAW:adaptiveSchema.resolveEnableAdaptive is not a function)`; result 0 ok, 3 fail; exit 1. This is the same crash the walkthrough hit at L123 pre-fix.

## RED (pre-implementation)

Fixture `$TMPDIR/n3-red.js` exercises the NEW claim path-legality behavior via the `claim` CLI with a hermetic `HOME` carrying `config.json {installed_paths:[...]}`:
1. `KAOLA_PATH=fast` + `installed_paths:[]` → expect `status:path_not_installed, result:refuse`
2. `KAOLA_PATH=fast` + `installed_paths:['fast']` → expect `status:acquired`
3. no path (default) → expect `status:acquired` (adaptive default)

Run against the CURRENT (unfixed) `scripts/kaola-workflow-claim.js`:
```
--- n3 fixture (issue #538) ---
adaptiveSchema.resolveEnableAdaptive is not a function
  FAIL- KAOLA_PATH=fast + installed_paths:[] => path_not_installed/refuse (got null RAW:adaptiveSchema.resolveEnableAdaptive is not a function)
  FAIL- KAOLA_PATH=fast + installed_paths:['fast'] => acquired (got null)
  FAIL- default (no path) => acquired adaptive (got null)
--- result: 0 ok, 3 fail ---
EXIT: 1
```
claim.js still calls the retired `resolveEnableAdaptive` (n2 already removed it from the schema) → TypeError on every claim. This is the walkthrough's current L123 crash.

## GREEN (post-implementation, B0–B7 + R4)

Implemented B0–B7 in canonical `scripts/kaola-workflow-claim.js`: B0/B7 comment rewrites; B1 path-legality gate (`resolveInstalledPaths(readAdaptiveConfig())` + `isLegalWorkflowPath(requestedPath, installedPaths)` → `{status:'path_not_installed', result:'refuse', claim:'none', ...}`); B2 deleted the `path_requires_explicit_opt_in` block + `pathWasDefaulted`; B3/R4 renamed bundle `target_set_not_adaptive`→`bundle_requires_adaptive` (`result:'refuse'`) + deleted the dead `isLegalWorkflowPath` re-check; B4 collapsed `cmdAuthoringAllowed` to unconditional allow; B5 flipped `|| 'full'`→`|| 'adaptive'` at the 3 claim-default sites (claimProject, bundle, writeState `workflow_path:`); plus a stray `resolveEnableAdaptive` comment in `reconcileNextCommand` rewritten to be path-agnostic. Mirrored byte-identical to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`; rename-normalized to the 2 forge ports (gitlab `issueIid`/glab nouns, gitea `issueIid`/Gitea nouns).

Fixture re-run against the FIXED canonical → GREEN:
```
--- n3 fixture (issue #538) ---
  ok  - KAOLA_PATH=fast + installed_paths:[] => path_not_installed/refuse (got {"status":"path_not_installed","result":"refuse","claim":"none","issue":null,"project":"n3a","reasoning":"workflow_path \"fast\" is not installed. Installed paths: adaptive ..."})
  ok  - KAOLA_PATH=fast + installed_paths:['fast'] => acquired (got {"status":"acquired",...})
  ok  - default (no path) => acquired adaptive (got {"status":"acquired",...})
--- result: 3 ok, 0 fail ---
EXIT: 0
```

### validate-script-sync (load-bearing propagation proof for #2/#3/#4)
```
OK: 26 common scripts, 25 byte-identical groups, 9 rename-normalized families, and 1 config/hooks.json family in sync.
SYNC EXIT: 0
```
Proves the byte-pair (canonical ↔ plugins/kaola-workflow) is identical AND the 2 forge ports are correctly rename-normalized. All 4 claim copies parse (`node -c` OK each).

### The 3 unit tests (mine) — all GREEN
- `node scripts/test-claim-hardening.js` → `claim-hardening tests passed (104 assertions)` exit 0. The #515 `path_requires_explicit_opt_in` block was REPLACED by a #538 block (7 sub-tests a–g) that drives legality by rewriting the hermetic HOME `installed_paths` per sub-test (env lever retired): default→acquired; fast/[]→path_not_installed/refuse; fast/['fast']→acquired; full/[]→path_not_installed/refuse; full/['full']→acquired; explicit adaptive/[]→acquired; authoring-allowed unconditional. (Interleaved `TLS handshake timeout`/`rate limit` lines are the intended #495 transient-fault mocks.)
- `node scripts/test-bundle-claim.js` → `test-bundle-claim: all 79 tests passed` exit 0. Added a hermetic HOME (seed `installed_paths:[]`); Test (5) single-issue regression dropped `--workflow-path full` → defaults to adaptive (always legal); Test (7) renamed `target_set_not_adaptive`→`bundle_requires_adaptive` (asserts `result:'refuse'` too); exit-1 derives generically from non-acquired status (cmdStartup L59 `status==='acquired'||'owned' ? 0 : 1`), so the rename keeps exit 1.
- `node scripts/test-bundle-state.js` → `test-bundle-state: all 37 tests passed` exit 0. Hermetic HOME seed `enable_adaptive:false`→`installed_paths:[]`.

### Walkthrough delta
`node scripts/simulate-workflow-walkthrough.js` — the prior `resolveEnableAdaptive` crash at L123 is GONE; it now advances through `testStartupJsonAndHiddenLocalWorktrees` and `testWorktreeAdaptiveProvisioned` (PASSED) and fails LATER at `testFastStartupState` (L4886): `startup --target-issue 503` with `KAOLA_PATH:fast` asserts `claim==='acquired'`, but under #538 fast is not installed (no `installed_paths` HOME config → `[]`) so claim correctly returns `path_not_installed`/refuse. **This is an n7b-owned residual** — `simulate-workflow-walkthrough.js` is in n7b's write set (spec §F Cluster 4: "switch/legality assertions MUST be rewritten"), NOT in my 7-file write set. The claim-related portions all pass.

### Retired-symbol grep across the 7 files (broad pattern incl. KAOLA_ENABLE_ADAPTIVE + bare enable_adaptive)
Zero LIVE references. Only 2 hits remain, both intentional descriptive comments in `test-claim-hardening.js` (L783 "REPLACES the retired `path_requires_explicit_opt_in` guard", L790 "KAOLA_ENABLE_ADAPTIVE is retired") — explanatory, not code references (sanctioned by the spec note).

GREEN: n3-red fixture 3/3 ok (exit 0); validate-script-sync PASS (byte-pair identical + 2 forge ports rename-normalized); test-claim-hardening 104 assertions, test-bundle-claim 79 tests, test-bundle-state 37 tests — all green; walkthrough L123 `resolveEnableAdaptive` crash gone (advances past adaptive-provisioning tests, fails only on n7b-owned `testFastStartupState` fast-legality assertion); retired-symbol grep across all 7 write-set files clean (0 live refs).

## n7b HANDOFF — expected-red downstream surfaces (n3 removed the old literals on purpose; these need lockstep updates n3 does NOT own)

These fail BECAUSE n3's claim.js now carries the NEW vocabulary; none is an n3 logic error. All are in n7b's write set per spec §E4/§F Cluster 4.

**A. Contract validators (§E4, ×4 lockstep — claude + 3 forge/codex):**
- `scripts/validate-workflow-contracts.js` L825 `assertIncludes(claim.js, 'resolveEnableAdaptive')` → re-pin to `'resolveInstalledPaths'`; L826 `'workflow_path_refused'` → `'path_not_installed'`. (Run confirms: it throws `claim.js must include: resolveEnableAdaptive` — proves n3 correctly REMOVED it.)
- The ×4 equivalents per §E4: `validate-kaola-workflow-contracts.js` (L486, L556-557) + the 3 forge `validate-*-contracts.js`. Plus L749 `--enable-adaptive`→`--with-fast/--with-full`, L773-775 concept tokens (drop `KAOLA_ENABLE_ADAPTIVE`), L830 schema `resolveEnableAdaptive`→`resolveInstalledPaths`.

**B. `simulate-workflow-walkthrough.js` (LIVE, n7b) — switch/legality/default assertions to rewrite (grep hits):**
- L13/14/16/19/35/71: module-top `KAOLA_ENABLE_ADAPTIVE='0'` pin + `enable_adaptive:false` hermetic-HOME seed + runNode env re-add → migrate to `installed_paths:[]` (no env lever).
- L444/458: `workflow_path: full` ESCALATED/IN_PROGRESS fast assertions (resume rewrite semantics — verify still valid under adaptive default).
- L1325-1369: the `workflow_path_refused` / whitelist / bogus-path block + `authoring-allowed` toggle (L3241/3246 expect refuse-under-OFF → now unconditional allow). Rewrite to `path_not_installed` legality + always-allow authoring.
- L3158-3176: defaulted-claim resume tests asserting `workflow_path: full` / `phase: full` / phase-N next_command — under B5 a DEFAULTED claim now persists `adaptive`; these explicitly-seeded `workflow_path: full` state fixtures may still be valid (they pre-write full state), but verify.
- L3616-3624: the schema I4 unit block calls `schema.resolveEnableAdaptive(...)` DIRECTLY (now undefined) → rewrite to `resolveInstalledPaths` semantics (n2's new signature).
- L3775: `enable_adaptive:true` config seed → `installed_paths`.
- L4866-4869, L11893-11896, L12058, L12160, L13693, L13768, L13822, L13840: `KAOLA_ENABLE_ADAPTIVE:'1'` "makes adaptive legal" env — now a no-op (adaptive always legal); drop or convert. `testFastStartupState` (L4886) asserts fast `claim==='acquired'` → needs `installed_paths:['fast']` HOME config to pass.
- The 3 forge/codex walkthroughs (`simulate-{gitlab,gitea}-workflow-walkthrough.js` + codex) carry the same per §F.
