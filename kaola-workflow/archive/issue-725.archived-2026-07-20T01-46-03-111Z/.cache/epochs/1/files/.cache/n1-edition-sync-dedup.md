evidence-binding: n1-edition-sync-dedup 2e53c1a30463

non_tdd_reason: dedup REMOVAL of a redundant cosmetic re-check (`checkMirrors` in `edition-sync.js --check`) plus the removal of the two tests that only covered that re-check — there is no new behavior to write a failing test for; correctness is that `edition-sync --check` and `validate-script-sync` both stay green with forge-aggregator parity fully retained and no same-bytes double-check remaining.

## What changed

### scripts/edition-sync.js
- Removed the `checkMirrors(rootDir, commonScripts, byteGroups)` function (was ~scripts/edition-sync.js:137-151) and its explanatory comment block (~:127-136). It re-verified COMMON_SCRIPTS canonical<->codex mirrors and BYTE_IDENTICAL_GROUPS copies — a check `validate-script-sync.js` already performs authoritatively, in-chain, making this a cosmetic `--check`/`--write` symmetry re-check, not a live coverage hole.
- `runCheck()`: removed the `const { missing, drift } = checkMirrors(REPO);` call and its two `mismatches.push(...)` loops. Updated the doc comment above `runCheck` to describe the narrowed scope (forge-aggregator parity only) and explain why the removed check was cosmetic. `runCheck` still fully verifies the GENERATED_AGGREGATORS forge-port parity loop, untouched.
- Updated the success `console.log` in `runCheck` (was ~:182-184) to no longer claim a `COMMON_SCRIPTS.length` mirror count / `BYTE_IDENTICAL_GROUPS.length` group count it no longer verifies. Now reads: `'edition-sync: ' + (GENERATED_AGGREGATORS.length * FORGES.length) + ' forge aggregator ports in parity with canonical.'`
- Import line (`require('./validate-script-sync')`, :40): dropped `checkByteIdenticalGroup` (only consumer was `checkMirrors`, now removed). Kept `COMMON_SCRIPTS` and `BYTE_IDENTICAL_GROUPS` — both are still live-used inside `runWrite()` (steps b/c: codex-sync copy and byte-group copy), confirmed by grep before editing.
- `module.exports` (:231, was :258): dropped `checkMirrors` from the export list. Confirmed via repo-wide grep that no other file imports `checkMirrors` from `edition-sync.js`.
- `runWrite()` is completely untouched — it still regenerates forge aggregators + copies COMMON_SCRIPTS -> codex + copies byte-identical groups exactly as before.

### scripts/test-edition-sync.js
- Updated the top-of-file `require('./edition-sync')` destructure (:9) to drop `checkMirrors`.
- Removed test T9 (~:175-220 in the original), which existed only to exercise `checkMirrors` against a synthetic fixture tree (green-on-sync, red-on-missing-mirror, red-on-drifted-byte-group).
- **Deviation from literal task wording, made in-scope of the declared write set (test-edition-sync.js is one of the two files I own):** the task said "remove test T9" and "do not touch the other edition-sync tests," but T10 (~:226-235 in the original, "checkMirrors is green on the REAL repo tree with NO override args") *also* calls `checkMirrors` directly and exists solely to test it — it is not a forge-aggregator-parity test. Since `checkMirrors` is fully removed from `edition-sync.js`'s exports, leaving T10 in place would throw `ReferenceError: checkMirrors is not defined` the moment the file runs (destructuring a dropped export yields `undefined`, then calling `undefined(...)` throws). T9 and T10 are the *only two* tests that exist to cover the removed `checkMirrors` re-check (both tagged `#638` in their comments, the same issue tag the removed function's doc comment cited); no third test references it. I removed both T9 and T10 together — this is required to keep the file executable, is entirely inside my declared write set, and matches the letter of the instruction ("remove the single test that only covered that re-check" in the non_tdd_reason, now literally two co-dependent tests once T10 is accounted for). All other tests (T1-T8, plus the top-of-file #699 replan-aggregator assertions) are untouched — forge-aggregator parity (T1, T2, T3, T6, T7), no-over-rename guards (T4, T5), and the create-on-missing `syncIfDrift` primitive (T8) are still fully checked and still tested.
- `os` import retained — still used by T8 (`os.tmpdir()`), confirmed by grep after the edit.

## write_set
- /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-725/scripts/edition-sync.js
- /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-725/scripts/test-edition-sync.js

## verification_tier
regression-green: edition-sync --check (12 ports parity), test-edition-sync (40 assertions), validate-script-sync OK, simulate-workflow-walkthrough passed — all exit 0

## verification_commands
All run from /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-725 after the edit:

1. `node scripts/edition-sync.js --check`
   → `edition-sync: 12 forge aggregator ports in parity with canonical.` (exit 0)

2. `node scripts/test-edition-sync.js`
   → `edition-sync tests passed (40 assertions)` (exit 0) — was 40 assertions after dropping T9's 8 assertions and T10's 2 assertions from the pre-edit count (pre-edit count not separately captured, but the full suite is green post-edit with no failures reported).

3. `node scripts/validate-script-sync.js` (the authoritative check the removed `checkMirrors` re-check was redundant with)
   → `OK: 22 common scripts, 28 byte-identical groups, 5 rename-normalized families, 2 hooks.json families (config + hooks dir), and 7 forge export-superset families in sync.` (exit 0)

4. `node scripts/simulate-workflow-walkthrough.js` (full integration suite, run in background due to >120s runtime; polled to completion)
   → tail of output ends with `Workflow walkthrough simulation passed` (exit code 0 per the background-task completion notification)

## before_result / after_result
- Before: `checkMirrors` present, called from `runCheck`; T9 (8 assertions) + T10 (2 assertions) exercised it directly. `edition-sync --check` and `test-edition-sync.js` were green on the pre-existing (unmodified) tree.
- After: `checkMirrors` fully removed (function, its call site, its two callers-in-test, its export, its now-unused `checkByteIdenticalGroup` import). `edition-sync --check`, `test-edition-sync.js`, `validate-script-sync.js`, and the full `simulate-workflow-walkthrough.js` integration suite are all green post-change — no regression, and the redundant re-check + its dedicated tests are gone.
