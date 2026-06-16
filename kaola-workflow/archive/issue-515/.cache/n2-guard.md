evidence-binding: n2-guard 7f3d520668cf

# n2-guard evidence — #515 `path_requires_explicit_opt_in` guard

## RED→GREEN transition

RED: #515(a'): defaulted full under ON must refuse with path_requires_explicit_opt_in — AssertionError: expected status path_requires_explicit_opt_in, got acquired (pre-impl; guard not yet in claim.js). 2 assertions failed; 85 passed. `node scripts/test-claim-hardening.js` exit 1.

GREEN: #515(a') and all (b)-(f) assertions pass after guard insertion; 87/87 assertions green. `node scripts/test-claim-hardening.js` exit 0.

## Files changed (write set)

1. `scripts/kaola-workflow-claim.js` — guard inserted after `workflow_path_refused` block (line 801+); uses `issueNumber`.
2. `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — byte-identical guard (same `issueNumber` local); after line 801.
3. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — guard inserted after `workflow_path_refused` block (~line 648); uses `issueIid` (forge diff from root/codex — `issueNumber` is not declared in this file).
4. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — guard inserted after `workflow_path_refused` block (~line 650); uses `issueIid` (same forge diff).
5. `scripts/test-claim-hardening.js` — 6 new sub-tests (a')-(f) appended in a new `#515` block.

## Guard block (root/codex edition)

```js
  const pathWasDefaulted = !args.workflowPath && !process.env.KAOLA_PATH;
  if (adaptiveEnabled && pathWasDefaulted) {
    return {
      status: 'path_requires_explicit_opt_in',
      claim: 'none',
      issue: issueNumber,
      project,
      reasoning: 'adaptive switch is ON, so adaptive is the default path; "' + requestedPath +
        '" was reached by default (no --workflow-path / KAOLA_PATH). fast/full are explicit escapes ' +
        'only — pass --workflow-path fast|full (or export KAOLA_PATH) to opt in. Refusing to ' +
        'silently downgrade to a non-adaptive path under an ON switch (#254/#44).'
    };
  }
```

(gitlab/gitea editions: `issue: issueIid` instead of `issue: issueNumber`; reasoning string identical.)

## Advisor correction to blueprint

The n1-architect blueprint stated "byte-identical across all 4 editions" and provided `issue: issueNumber` for all 4. The advisor correctly identified that `issueNumber` is NOT declared in gitlab/gitea `claimProject` (those editions use `issueIid`). Using `issueNumber` byte-identically would produce a `ReferenceError` at runtime in the forge editions. The reasoning string is forge-neutral (identical), but `issue:` uses the edition-correct local variable.

## CORRECTNESS NOTE on test case (a)

The original task described test case (a) as "defaulted fast under ON → refuse". This is UNCONSTRUCTABLE: `requestedPath = args.workflowPath || KAOLA_PATH || 'full'` resolves to 'fast' ONLY when a truthy input is provided (explicit, not defaulted). `pathWasDefaulted===true` implies `requestedPath==='full'` always. The case was replaced by (a') "defaulted full under ON → refuse", which is the actual constructible refuse case. A comment at the test site documents this.

## Walkthrough hermetic isolation gap (blocker for finalize) — blast radius: 4 harnesses

`node scripts/simulate-workflow-walkthrough.js` exits 1 after the guard is inserted. Root cause: `readAdaptiveConfig()` reads from `~/.config/kaola-workflow/config.json` (HOME, not the temp repo root). On this machine that file contains `{"enable_adaptive": true}`. The walkthrough's `runNode` scrubs `KAOLA_*` env vars but NOT the HOME directory, so switch is ON for every bare startup in `testClaimStatusRelease` and similar tests that don't set `KAOLA_ENABLE_ADAPTIVE` explicitly.

Confirmed: `git stash` (pre-guard) + `node scripts/simulate-workflow-walkthrough.js` exits 0. The guard is correct; the failure is non-hermetic isolation.

**Blast radius (all 4 chains):**
- `scripts/simulate-workflow-walkthrough.js` (claude chain) — `runNode` baseEnv scrubs `KAOLA_*` but reads HOME config; `testClaimStatusRelease` startup at line 92 is defaulted → guard fires → exit 1.
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (codex chain) — `runClaim` inherits `process.env`; `startup --target-issue 163` at line 1482 is defaulted under HOME config ON → guard fires → exit 1.
- `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` (gitlab chain) — `spawnNode` at line 246 inherits `process.env`; `testGitlabBundleSingleIssueStateHasNoBundleFields` startup is defaulted → `claim:'none'` assertion fails.
- `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` (gitea chain) — same pattern; `gitea #342 S6: single-issue startup must acquire, got "none"`.

**Required fix (one-liner per harness):** add `KAOLA_ENABLE_ADAPTIVE: '0'` to the default env in each harness's `runNode`/`runClaim`/`spawnNode` function (BEFORE the `extraEnv` spread so explicit switch-ON tests still win). The walkthrough's own comments at line 1247-49 confirm all switch-ON tests already pass the toggle explicitly — the default-OFF is the correct hermetic intent.

**Files needing the fix (OUTSIDE n2's write set):**
1. `scripts/simulate-workflow-walkthrough.js` — `baseEnv` in `runNode` (~line 30)
2. `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` — `runClaim`/`runClaimRaw` env (~line 23)
3. `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` — `spawnNode` env (~line 248)
4. `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` — `spawnNode` env (same pattern)

Orchestrator must add these to a write set (plan-repair or new node) before finalize can complete.

## test-claim-hardening.js exit code

`node scripts/test-claim-hardening.js` → exit 0, 87 assertions passed.

## Harness hermeticity fix (plan-repair) — GREEN

Write set was WIDENED (plan-repair) to include the 4 walkthrough harnesses. Applied the hermetic
default `KAOLA_ENABLE_ADAPTIVE='0'` so the #515 guard (correct: refuses a DEFAULTED fast/full claim
under switch-ON) no longer breaks tests that do defaulted startup/claim while inheriting `process.env`
(which carries HOME `~/.config/kaola-workflow/config.json` `enable_adaptive:true` on a dev box).

REVISED blast radius vs the earlier "runNode-only / 4 harnesses" note above — that note was wrong on
TWO counts, corrected here:
- The claude walkthrough needed a DUAL fix: runNode-only was INSUFFICIENT — `runClaimOnline` (line
  4287) is a SEPARATE non-scrubbing helper that broke with `path_requires_explicit_opt_in` on a
  defaulted online claim. Module-top is required to cover it (+ ~25 inline `process.env`-inheriting
  spawn sites), AND runNode needs the post-scrub re-add because runNode SCRUBS all `KAOLA_*`.
- The true entry-point count is SIX, not four: the gitlab/gitea CHAINS each run a SECOND harness
  (`simulate-{gitlab,gitea}-codex-workflow-walkthrough.js`) that shells `test-{gitlab,gitea}-workflow-scripts.js`
  (defaulted claim under HOME-ON). Those 2 forge-codex harnesses are OUTSIDE the widened 9-file set.

### Exact edits made (4 files, all in the widened 9-file write set)

1. `scripts/simulate-workflow-walkthrough.js` (claude) — DUAL fix:
   - module top: `process.env.KAOLA_ENABLE_ADAPTIVE = '0';` (unconditional) — covers `runClaimOnline`
     + all inline `process.env`-inheriting spawns.
   - `runNode` env literal (line ~48): `env: { ...baseEnv, ...(extraEnv||{}), KAOLA_WORKFLOW_OFFLINE:'1' }`
     → `env: { ...baseEnv, KAOLA_ENABLE_ADAPTIVE: '0', ...(extraEnv||{}), KAOLA_WORKFLOW_OFFLINE:'1' }`
     — post-scrub re-add (runNode strips all KAOLA_* into baseEnv first).
2. `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (codex) — module top:
   `process.env.KAOLA_ENABLE_ADAPTIVE = '0';` (unconditional) — covers `runClaim`/`runClaimRaw`.
3. `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` (gitlab) — module top:
   `process.env.KAOLA_ENABLE_ADAPTIVE = '0';` (unconditional) — covers `spawnNode` + inline `spawnSync`
   (incl. the failing line 1160 `testGitlabBundleSingleIssueStateHasNoBundleFields`). `spawnNode`-only
   would NOT fix the inline sites — module-top is required.
4. `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` (gitea) — module top:
   `process.env.KAOLA_ENABLE_ADAPTIVE = '0';` (unconditional) — same pattern.

All explicit switch-ON sub-tests pass `KAOLA_ENABLE_ADAPTIVE:'1'` via a per-call env arg that spreads
AFTER `process.env` in its `Object.assign`/spread (verified: glSpawnBundle 861-866, gtSpawnBundle
1115-1119, claude runClaimOnline 4277-4284, runNode extraEnv-after-baseEnv) — so they STILL WIN.
The module-top is UNCONDITIONAL (not `=== undefined`-guarded) so an ambient-exported dev-shell value
cannot reintroduce the non-hermeticity. No test writes a repo-local `enable_adaptive:true` config and
relies on env-absent ON (grep-verified; the only `enable_adaptive` refs in claude walkthrough are
direct `resolveEnableAdaptive` unit calls at 3480-3488, no subprocess).

### Four-chain exit codes (#307)

- `npm run test:kaola-workflow:claude` → 0 (after the dual fix; `simulate-workflow-walkthrough.js`
  alone re-run → exit 0, "Workflow walkthrough simulation passed").
- `npm run test:kaola-workflow:codex` → 0.
- `npm run test:kaola-workflow:gitlab` → 1 — BLOCKED: `simulate-gitlab-workflow-walkthrough.js` (mine)
  PASSES ("GitLab workflow walkthrough simulation passed"); the chain's SECOND harness
  `simulate-gitlab-codex-workflow-walkthrough.js` (NOT in write set) fails at shelled child
  `test-gitlab-workflow-scripts.js`.
- `npm run test:kaola-workflow:gitea` → 1 — BLOCKED: `simulate-gitea-workflow-walkthrough.js` (mine)
  PASSES ("Gitea workflow walkthrough simulation passed"); the chain's SECOND harness
  `simulate-gitea-codex-workflow-walkthrough.js` (NOT in write set) fails at shelled child
  `test-gitea-workflow-scripts.js`.

### Remaining blocker — 2 more files for the orchestrator to add to the write set

The gitlab/gitea chains cannot go green without the IDENTICAL unconditional module-top one-liner in:
5. `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js`
6. `plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js`

PROVEN: prefixing each with `KAOLA_ENABLE_ADAPTIVE=0` makes BOTH exit 0 (the env CASCADES via the
`run()` `execFileSync(...,{cwd,encoding,stdio})` no-env-override to the shelled children
`test-{gitlab,gitea}-workflow-scripts.js` + `*-sinks.js`) — so NO child-test edits are needed, only
the 2 harness module-tops. After those 2 land, run all four chains once for the #307 record.

## FINAL — forge-codex harness fix landed; all four chains GREEN

Write set WIDENED to 11 files (added the 2 forge-codex harnesses identified above). Applied the
IDENTICAL unconditional module-top one-liner `process.env.KAOLA_ENABLE_ADAPTIVE = '0';` to each,
placed after the `const root = ...` declaration (matching the placement/idiom of the other 4
module-top fixes). The env cascades through each harness's `run()` (`execFileSync(...,{cwd,encoding,
stdio})`, no env override) to the shelled children, so NO child-test edits were needed.

### Exact edits (files 10 & 11 of the 11-file write set)

10. `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js` — module top
    (after `const root`): `process.env.KAOLA_ENABLE_ADAPTIVE = '0';` (unconditional). Covers shelled
    children `test-gitlab-workflow-scripts.js`, `test-gitlab-sinks.js`, + inline bundle-426-428 spawns.
11. `plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js` — module top
    (after `const root`): `process.env.KAOLA_ENABLE_ADAPTIVE = '0';` (unconditional). Covers shelled
    children `test-gitea-workflow-scripts.js`, `test-gitea-sinks.js`, + inline bundle-426-428 spawns.

### FINAL four-chain exit codes (#307) — ALL GREEN

```
npm run test:kaola-workflow:claude  → claude=0
npm run test:kaola-workflow:codex   → codex=0
npm run test:kaola-workflow:gitlab  → gitlab=0
npm run test:kaola-workflow:gitea   → gitea=0
```

Run individually (NOT `npm test`, which short-circuits). claude chain ends "Workflow walkthrough
simulation passed". GREEN.

### Write-set discipline confirmation

All edits confined to the 11-file write set:
1. `scripts/kaola-workflow-claim.js`
2. `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
3. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
4. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
5. `scripts/test-claim-hardening.js`
6. `scripts/simulate-workflow-walkthrough.js`
7. `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
8. `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`
9. `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`
10. `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js`
11. `plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js`

(Plus the `.cache/n2-guard.md` evidence file, which the barrier exempts.)
