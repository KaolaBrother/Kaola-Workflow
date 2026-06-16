evidence-binding: n1-architect 30911273ec18

# n1-architect blueprint — #515 switch-ON path guard (`path_requires_explicit_opt_in`)

## Summary of design decisions

- **Placement: INLINE in `claimProject`, single site, NOT the schema.** Confirmed. The refusal
  needs `issueNumber` + `project` (in scope in `claimProject`) and reuses `adaptiveEnabled` already
  computed at line 789. A schema helper = 4 new-file edits for ZERO reuse (the predicate is two
  truthiness checks; the refusal object is forge-neutral but issue/project-shaped). Keep schema ×4
  OUT of n2's write set.
- **The refuse direction is exactly ONE constructible case: DEFAULTED → `full` under ON.**
  Because `requestedPath = args.workflowPath || process.env.KAOLA_PATH || 'full'`, a *defaulted*
  path (both inputs falsy) ALWAYS resolves to `'full'`. `'fast'` can only arrive from a truthy
  `--workflow-path fast` or `KAOLA_PATH=fast` — both EXPLICIT, both must be ALLOWED. So:
  "defaulted fast" is the **empty set** (unconstructable) and the `requestedPath==='fast'` disjunct
  is **dead code** under the defaulted predicate. The guard fires on `adaptiveEnabled && pathWasDefaulted`
  alone — `pathWasDefaulted` already implies `requestedPath==='full'`, so NO `requestedPath` membership
  test is needed.
- **Predicate (unified truthy form, mirrors the `|| 'full'` collapse byte-for-byte):**
  `const pathWasDefaulted = !args.workflowPath && !process.env.KAOLA_PATH;`
  Provably: when `pathWasDefaulted` is true, both operands of the `||` chain before `'full'` are
  falsy, so `requestedPath==='full'`. Do NOT use `args.workflowPath != null` — that treats
  `--workflow-path ''` as explicit while the collapse treats it as defaulted (mismatch).
- **Refusal: RETURNED object (not thrown, not printed).** `claimProject` returns objects; `cmdClaim`
  / `cmdStartup` call `output(...)` on the return. Mirror the `workflow_path_refused` family shape:
  keys `status`, `claim:'none'`, `issue`, `project`, `reasoning`.
- **Forge nouns: NONE.** The reasoning string is forge-neutral (no issue/MR/PR/GitHub/GitLab noun),
  exactly like `cmdAuthoringAllowed`'s body. The guard block is **byte-identical across all 4 editions**.

## Boundaries verified (accuracy non-negotiable #1)

| Boundary | Verdict | Why it holds |
|---|---|---|
| B1: Switch-OFF default→full intact | SAFE | Guard is `if (adaptiveEnabled && pathWasDefaulted)`. OFF ⇒ `adaptiveEnabled===false` ⇒ guard skipped ⇒ `isLegalWorkflowPath('full', false)===true` (Branch A `|| 'full'` survives). |
| B2: explicit `--workflow-path fast|full` under ON allowed | SAFE | `args.workflowPath` truthy ⇒ `pathWasDefaulted===false` ⇒ guard skipped. |
| B2: explicit `KAOLA_PATH=fast|full` under ON allowed | SAFE | `process.env.KAOLA_PATH` truthy ⇒ `pathWasDefaulted===false` ⇒ guard skipped. |
| B3: adaptive + bundle claims under ON allowed | SAFE | Adaptive front end ALWAYS passes `--workflow-path adaptive` (workflow-next.md Step 0a-2 line 293; kaola-workflow-adapt.md line 175). `args.workflowPath==='adaptive'` truthy ⇒ guard skipped. Bundle path NEVER reaches claimProject for non-adaptive: `claimExplicitBundle` line 1212 returns `target_set_not_adaptive` for any non-adaptive resolved path BEFORE provisioning; a defaulted bundle resolves to `'full'` and is refused there, not here (no double-guard). |

NO boundary found at risk. The guard is strictly additive: it fires ONLY in the previously-silent
bypass window (ON switch ∧ fast/full path reached with NO explicit escape) — which today is the
`startup`/`bootstrap` scalar path (workflow-next.md Step 0b runs `startup --runtime claude
$KAOLA_SINK_FLAG $KAOLA_TARGET_FLAG` with NO `--workflow-path`, relying on `KAOLA_PATH` in env;
when that env is unset under ON, the path silently collapses to full — exactly #254's gap).

## Switch read (reuse, do not add a surface)

`claimProject` ALREADY reads the switch at line 789:
`const adaptiveEnabled = adaptiveSchema.resolveEnableAdaptive(readAdaptiveConfig(), process.env);`
The guard reuses this `adaptiveEnabled`. No new config surface. (cmdAuthoringAllowed and
claimExplicitBundle are the only other readers — same helper, same precedence: env
`KAOLA_ENABLE_ADAPTIVE` 1/true/yes|0/false/no wins, else config.json `enable_adaptive===true`.)

## Caller map (all reach claimProject; all intended to be guarded)

- `cmdClaim` (sub `claim`) → `claimProject(root, args)` directly.
- `cmdStartup` / `bootstrap` (scalar) → `claimExplicitTarget` → `claimProject` (args passed via
  `Object.assign({}, args, {...})`; NO path injection — this is THE bypass entry).
- `cmdStartup` / `bootstrap` (bundle) → `claimExplicitBundle` (never reaches claimProject for fast/full).
- There is NO separate `cmdBootstrap`; `bootstrap` aliases `cmdStartup` (dispatch line 3095).

## EXACT code to insert into `claimProject`

Insert IMMEDIATELY AFTER the existing `workflow_path_refused` block (after its closing `}` —
i.e. after line 801 in root/codex; after line ~645 gitlab; after line ~647 gitea — locate by the
existing block, not absolute line). The new guard runs AFTER the legality check, so an
illegal explicit value is still caught by the pre-existing refusal first.

```js
  // issue #515: the reciprocal of cmdAuthoringAllowed — under an ON switch, adaptive is the
  // contract-determined default and fast/full are EXPLICIT user escapes only (#254). A claim that
  // resolved to fast/full by DEFAULT (no --workflow-path, no KAOLA_PATH) under an ON switch is the
  // silent bypass: the `|| 'full'` collapse above turns "defaulted" into "explicit full". Refuse it
  // here with ZERO mutation so the router cannot silently downgrade an ON-switch project to the
  // phaseN ladder. An EXPLICIT fast/full (either input truthy) is a legitimate escape and passes.
  // Defaulted ALWAYS resolves to 'full' (the fast branch is unreachable when defaulted), so the
  // predicate alone is sufficient — no requestedPath membership test. Forge-neutral + byte-identical
  // across all four editions (mirrors the cmdAuthoringAllowed body).
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

Notes for n2:
- The block uses `requestedPath` (defined at line 788) and `adaptiveEnabled` (line 789), both
  already in scope. No new requires.
- Keep the reasoning string forge-neutral and IDENTICAL in all 4 files (validate-script-sync / the
  cross-edition byte-anchor expectations). The gitlab/gitea ports are smaller files but the
  claimProject body around this seam is identical — confirmed: both have the exact
  `const requestedPath = args.workflowPath || process.env.KAOLA_PATH || 'full';` line and the
  `workflow_path_refused` family.

## Forge-noun adjustments per edition

NONE. The reasoning text contains no forge noun. Insert the byte-identical block in all four:
- `scripts/kaola-workflow-claim.js` (root) — after line 801
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (codex twin) — after line 801
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — after the `workflow_path_refused` block (~line 645)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — after the `workflow_path_refused` block (~line 647)

## Tests n2 MUST write in `scripts/test-claim-hardening.js`

Reuse the #495 harness template (lines 318-355): a green mock classifier
(`{verdict:"green"}`), `KAOLA_WORKFLOW_OFFLINE:'1'`, a repo with `.config/kaola-workflow/config.json`
`{enable_adaptive:true}`, and `runClaim(['startup','--target-issue', N], extraEnv, repoDir)` parsing
the last JSON line. The default harness env sets `KAOLA_PATH:'adaptive'` and `KAOLA_ENABLE_ADAPTIVE:'true'`
— so each sub-test must OVERRIDE these via `extraEnv`.

GOTCHAS (must heed):
- **`existing` early-return false-green**: a 2nd claim of the same issue returns `owned` (line 779-780),
  NOT the guard verdict. Use a DISTINCT `--target-issue` per sub-test, OR `rmSync` the project dir
  (`kaola-workflow/issue-<N>`) between sub-tests (the #495 block does the rmSync).
- **Clear the path env for defaulted tests**: pass `KAOLA_PATH:''` in extraEnv (empty string is
  falsy → defaulted). `!'' === true` ⇒ predicate true.
- **OFF-switch test**: set `KAOLA_ENABLE_ADAPTIVE:'false'` in extraEnv (env wins over the repo's
  `enable_adaptive:true` config.json) PLUS `KAOLA_PATH:''`.
- The mock classifier must return green so the issue passes `classifyIssue` and reaches `claimProject`
  (the guard sits AFTER the `existing` return and BEFORE the probe; with a green classifier + a real
  target the flow reaches the guard).

Test matrix (the task's (a) is REPLACED — see correctness note):

| id | env override (besides harness defaults) | expect |
|---|---|---|
| (a') DEFAULTED full under ON → REFUSE | `{KAOLA_PATH:'', KAOLA_ENABLE_ADAPTIVE:'true'}`, target #A | `status==='path_requires_explicit_opt_in'`, `claim==='none'` |
| (b) explicit `--workflow-path full` under ON → ALLOWED | `{KAOLA_PATH:'', KAOLA_ENABLE_ADAPTIVE:'true'}`, argv `['startup','--target-issue', B, '--workflow-path','full']` | `status==='acquired'` (NOT path_requires_explicit_opt_in) |
| (c) `KAOLA_PATH=fast` under ON → ALLOWED | `{KAOLA_PATH:'fast', KAOLA_ENABLE_ADAPTIVE:'true'}`, target #C | `status==='acquired'` (explicit escape; persisted workflow_path: fast) |
| (d) explicit `--workflow-path fast` under ON → ALLOWED | `{KAOLA_PATH:'', KAOLA_ENABLE_ADAPTIVE:'true'}`, argv `[...,'--workflow-path','fast']`, target #D | `status==='acquired'` (proves the explicit-fast escape; the dead-branch counterpart) |
| (e) DEFAULTED full under OFF switch → ALLOWED (Branch A) | `{KAOLA_PATH:'', KAOLA_ENABLE_ADAPTIVE:'false'}`, target #E | `status==='acquired'` (guard skipped; `|| 'full'` survives) |
| (f) adaptive claim under ON → ALLOWED | `{KAOLA_PATH:'adaptive', KAOLA_ENABLE_ADAPTIVE:'true'}` OR argv `[...,'--workflow-path','adaptive']`, target #F | `status==='acquired'` |

CORRECTNESS NOTE for n2 (do not skip): the original task's test (a) "DEFAULTED fast under ON → refuse"
is UNCONSTRUCTABLE. A defaulted path resolves to `'full'`, never `'fast'`; `'fast'` requires a truthy
(explicit) input which the predicate excludes. Writing it would either be a no-op or force the guard to
fire on explicit fast — which BREAKS boundary B2 and contradicts (c)/(d). It is replaced by (a')
DEFAULTED full → refuse, which is the single real refuse case. State this contradiction explicitly at
the test site (a comment) so a future reader doesn't "fix" it back.

Use distinct target issue numbers across (a')-(f) (e.g. 83, 143, ... — green via the mock), or rmSync
each `kaola-workflow/issue-<N>` between sub-tests, to dodge the `owned` false-green.

## Downstream (n2/finalize awareness, NOT n1's scope)

- 4× claim.js touched ⇒ CROSS-EDITION diff ⇒ all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`
  chains green (run sequentially) + `simulate-workflow-walkthrough.js` exit 0 before finalize.
- The walkthrough is the one place to check for an existing call that does a DEFAULTED fast/full claim
  under an ON switch (would now refuse). The #495/#507 test blocks set `KAOLA_PATH=adaptive` so they
  are safe. If the walkthrough has a switch-ON startup without `--workflow-path`/`KAOLA_PATH`, it must
  add an explicit escape or expect the new refusal.
- Lever 3 (prose floor on the fast/full entry surfaces) is a SEPARATE node — not in this blueprint.

## Existing-test fallout — VERIFIED CLEAN (read-only grep, n1 scope)

Grepped every test that toggles the switch (`enable_adaptive` / `KAOLA_ENABLE_ADAPTIVE`):
`simulate-workflow-walkthrough.js`, `test-claim-hardening.js`, `test-bundle-claim.js`,
`test-install-adaptive-config.js`. Result: **NO existing test does a DEFAULTED fast/full claim under
an ON switch.** The guard is zero-fallout against the current suite. Evidence:

- **`runNode` SCRUBS all `KAOLA_*` from the parent env** (walkthrough line 28-31) and temp roots have
  no config.json ⇒ every bare `startup --target-issue N` (lines 92/103/122/...) runs switch-OFF
  (Branch A, B1) — guard skipped.
- The only switch-ON `runNode` claim is line 1331 `{KAOLA_PATH:'adaptive', KAOLA_ENABLE_ADAPTIVE:'1'}`
  — EXPLICIT adaptive escape ⇒ guard skipped. (#227 block comment, lines 1247-48, states the toggle
  is set EXPLICITLY per-case — never inherited.)
- `runClaimOnline*` inherits `...process.env` (line 4278) but the test process does not export
  `KAOLA_ENABLE_ADAPTIVE`; the one switch-ON online claim (line 4687) passes `--workflow-path adaptive`
  explicitly ⇒ guard skipped. All other online startups run switch-OFF.
- `authoring-allowed` calls (lines 3138/3143) don't reach claimProject. The OFF cases (a/b/c at
  lines 1286-1319) are switch-OFF ⇒ guard skipped.

Conclusion: n2 ADDS the new (a')-(f) sub-tests; no existing assertion needs editing. The four-chain
finalize gate should pass on the additive guard alone (still RUN all four chains + walkthrough — it is
a cross-edition diff).

## Crosswalk to the task's original (a)-(f) lettering

- task (a) "defaulted fast under ON → refuse" → **DROPPED as unconstructable** (see CORRECTNESS NOTE);
  its real-world intent is covered by blueprint (a') "defaulted full under ON → refuse".
- task (b) "defaulted full under ON → refuse" → blueprint (a') (the single refuse case).
- task (c) "explicit --workflow-path full under ON → allowed" → blueprint (b).
- task (d) "KAOLA_PATH=fast under ON → allowed" → blueprint (c).
- task (e) "defaulted full under OFF → allowed (Branch A)" → blueprint (e).
- task (f) "adaptive claim under ON → allowed" → blueprint (f).
- blueprint (d) "explicit --workflow-path fast under ON → allowed" is an ADDED case (the explicit-fast
  escape, the live counterpart of the dead defaulted-fast branch) — covers the boundary the dropped
  task (a) was gesturing at, in the only constructible direction.
