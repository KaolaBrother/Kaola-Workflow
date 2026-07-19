evidence-binding: n4-claim 056db2b938fe
non_tdd_reason: behavior-preserving retirement of the fast/full paths in claim.js ×4 plus a typed-refusal collapse (the plan-absent finalize branch → `adaptive_plan_missing`); no natural RED-first new behavior exists — the meaningful checks are the three existing claim/bundle suites updated to the retired state and re-run green.
regression-green: the three coupled existing suites — test-claim-hardening.js (520 assertions), test-bundle-state.js (37), test-bundle-claim.js (79) — are all green after the retirement (updated to the retired contract), and a four-edition claim/finalize smoke confirms the adaptive scaffold + `adaptive_plan_missing` refusal.

upstream_read: n1-recon 30aed1d97859
upstream_read: n3-core-scripts 669b6397e8da

## verification_tier

regression-green

## task

n4-claim: surgery on `kaola-workflow-claim.js` all four editions + the three coupled claim/bundle
tests, converging on the Plan-Notes symbol contract. TRAP 4 landed in THIS node: the scaffold
`workflow_path` default flipped `|| 'full'` → `|| adaptiveSchema.ADAPTIVE_PATH` AND the `cmdFinalize`
plan-absent branch collapsed from shelling `full-advance phase5-verify` to a typed
`adaptive_plan_missing` refusal — together, so an absent-field finalize can no longer misroute. Also:
removed the `isFast` scaffold block; stopped calling `resolveInstalledPaths` (removed by n3); removed
the resume `isFast` branch; removed the `fast-summary.md` archive-sweep entry; and made the retired
`--with-fast`/`--with-full` install flags unknown-flag refusals at the claim surface (they were never
claim flags — the existing #476 `unknown_flag` guard already refuses them; a new assertion pins this).

## write_set (7/7, exact match to the n4-claim row)

- scripts/kaola-workflow-claim.js                                              (canonical, COMMON_SCRIPT)
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js                       (codex, byte-identical to canonical)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js         (gitlab hand-port)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js           (gitea hand-port)
- scripts/test-claim-hardening.js
- scripts/test-bundle-state.js
- scripts/test-bundle-claim.js

## per-file change summary

### claim.js ×4 (canonical edited, `cp`→codex byte-identical; gitlab/gitea hand-mirrored modulo forge nouns)
- **Scaffold (writeState):** `workflow_path` default `|| 'full'` → `|| adaptiveSchema.ADAPTIVE_PATH`
  (TRAP 4). Removed the `isFast` var and every isFast/numbered-phase branch; the scaffold now writes
  a fixed adaptive run (`phase: adaptive`, `phase_name: Adaptive`, `next_command: <plan-run>`,
  `next_skill: <plan-run>`, pending gate `- workflow-plan`). `data.next_command`/`data.next_skill`
  overrides preserved.
- **#538 path-legality gate (claimProject):** stopped calling `adaptiveSchema.resolveInstalledPaths`
  — now `isLegalWorkflowPath(requestedPath)` (one-arg → adaptive-only legal). Kept the typed
  `path_not_installed` refusal status (widely referenced by n6/n8/n9 surfaces — NOT renamed);
  reworded the reasoning (dropped the `--with-fast`/`--with-full` install hint). Removed the now-dead
  `readAdaptiveConfig()` helper (its only caller) and the now-unused `const os = require('os')`.
- **cmdFinalize plan-absent branch (TRAP 4):** the `else` (no workflow-plan.md) branch — which shelled
  the deleted `*-full-advance.js phase5-verify` and passed `fast` as N/A — collapsed to an
  unconditional typed refusal: `result:'refuse', reason:'finalize_gate_unverified',
  gate:'workflow_path', inner_reason:'adaptive_plan_missing'` (before any archive/close side effect;
  reports the stale `workflow_path` field for diagnostics). This removed the sole surviving dynamic
  shell of the retired full-advance script and the last `os.tmpdir()` use.
- **resumeFallbackCommand:** removed the `isFast` branch; collapsed to always route to the plan-run
  executor (reconcileNextCommand still trusts a legacy project's persisted next_command first).
- **fast-summary sweep:** dropped `'fast-summary.md'` from `listSourceEvidenceFiles`' evidence array;
  cleaned the surrounding archive-completeness prose (fast-run / "legacy fast/full folders" /
  "fast-summary" mentions).
- **Prose:** bundle-lane guard comment (`fast/full have no multi-issue lane` → `adaptive is the only
  workflow path`); reconcileNextCommand comment (retired-phaseN example de-tokenized). TRAP 1 honored
  — no grep-and-delete of "full"; claim.js carries no `escalated_to_full`/"full envelope" tokens to
  begin with, and none were introduced/removed.

### tests (updated to the retired contract; no RED-first tests authored)
- **test-claim-hardening.js:** dropped the `installed_paths:[]` HOME seed; rewrote the #538 block to
  the retired contract (removed the `setHomeInstalled(...)` opt-in machinery + the two "installed →
  legal" sub-tests (c)/(e); kept default→acquired, fast→refuse, full→refuse, adaptive→acquired,
  authoring unconditional, and the #550 zero-gh determinism guard; ADDED a retirement assertion that
  `--with-fast`/`--with-full` refuse `unknown_flag` at the claim surface). Rewrote #522 Scenario C
  (plan-absent finalize now REFUSES `adaptive_plan_missing`, folder preserved). Rewrote the
  full-advance block: removed `require('./kaola-workflow-full-advance.js')` + `reviewComplianceTable`;
  every plan-absent path case (stale / malformed / absent-field / stale-adaptive/full/fast/typo)
  now asserts `finalize_gate_unverified`+`adaptive_plan_missing` across all 4 editions; state-missing
  → `state_missing`, state-wrong-type → `state_invalid_type` (path-independent, unchanged); the
  former `valid-full`/`fast-unchanged` PASS cases inverted to `adaptive_plan_missing`; the archive
  crash-resume case inverted from idempotent-pass to `adaptive_plan_missing`. Legacy phaseN fixtures
  in the #503 resume test re-pointed to `/kaola-workflow-plan-run`.
- **test-bundle-state.js:** dropped `installed_paths:[]` from the HOME seed; re-pointed legacy phaseN
  `next_command` fixtures to `/kaola-workflow-plan-run` (parse tests never assert the command).
- **test-bundle-claim.js:** dropped `installed_paths:[]` from the HOME seed; reworded the seed and
  test-(7) comments; test (7) still proves a non-adaptive `--workflow-path full` bundle claim refuses
  `bundle_requires_adaptive` (a retired path is refused by the adaptive-only lane guard).

## verification_commands + outputs

1. Baseline byte-identity (pre-edit): `cmp -s` canonical↔codex claim.js → IDENTICAL.
2. Schema state (n3 applied): `resolveInstalledPaths === undefined`, `WORKFLOW_PATHS === ["adaptive"]`,
   `isLegalWorkflowPath('adaptive') === true`, `isLegalWorkflowPath('fast') === false`.
3. require-load (`node -e require(...)`): all four claim.js editions load OK.
4. AC1 token sweep (`with-fast|with-full|fast-advance|full-advance|phase4-advance|fast-summary|
   kaola-workflow-fast|kaola-workflow-phase[1-5]`): all four claim.js = 0; test-bundle-state.js = 0;
   test-bundle-claim.js = 0; test-claim-hardening.js = 3 — all three are the LOAD-BEARING
   `--with-fast`/`--with-full` retirement assertion (a test proving the retired flags refuse must name
   them). No `resolveInstalledPaths`/`readAdaptiveConfig`/`isFast`/`os` residual in any claim edition.
5. Byte-identity + parity (post-edit): `cmp -s` canonical↔codex → IDENTICAL; gitlab & gitea both carry
   the identical retirement hunks (adaptive_plan_missing collapse ×1, `phase: adaptive` scaffold ×1,
   one-arg isLegalWorkflowPath ×1, plan-run resume ×1), modulo forge nouns.
6. Three coupled suites: `node scripts/test-claim-hardening.js` → exit 0, 520 assertions;
   `node scripts/test-bundle-state.js` → exit 0, 37 tests; `node scripts/test-bundle-claim.js` →
   exit 0, 79 tests.
7. claim/finalize smoke, all four editions: a plan-absent finalize refuses `finalize_gate_unverified`
   / `inner_reason: adaptive_plan_missing` (exit non-zero) — canonical, codex, gitlab, gitea all OK.
8. Scope: `git status --porcelain` shows exactly the 7 n4 write-set files as ` M`; NO modified tracked
   file outside the n4+n3 write sets (n2 `D` deletions + n3 schema/repair/compact `M` are the only
   other changes, from upstream legs).

## before_result

Serial-chain reality: at this leg's start the base claim.js still called
`adaptiveSchema.resolveInstalledPaths(...)`, which n3 had already removed from the schema
(`resolveInstalledPaths === undefined`). Any claim reaching claimProject would throw a TypeError at
the #538 gate, so the three coupled suites were RED entering this leg (broken by the upstream symbol
removal — the expected serial-chain transient that n4 converges). No formal build/typecheck pipeline
exists (Node scripts only); the regression baseline is these three suites.

## after_result

All three coupled suites green (520 / 37 / 79 assertions), updated to the retired contract; all four
claim.js editions require-load cleanly and are AC1-clean; canonical==codex byte-identical; gitlab/gitea
carry the mirrored hunks modulo forge nouns. TRAP 4 landed together (scaffold adaptive default flip +
cmdFinalize `adaptive_plan_missing` collapse). The last dynamic shell of the retired
`*-full-advance.js` is removed from claim.js. Per the brief, the full four-edition chains / walkthrough
are NOT run in this leg (downstream validators/walkthroughs still reference retired surfaces until
n5–n9 land); cross-file convergence and the four-chain-green verdict are proven downstream and at
finalize. No commit made.
