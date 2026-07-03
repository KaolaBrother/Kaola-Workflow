evidence-binding: n1-runtime-dispatch-contract 1f9f9b4b5002

## Summary

Implemented AC1 (installer dispatch-posture REPORT) + AC2 (preflight/doctor dispatch-posture
WARN) of issue #598: the effort-gated `MultiAgentMode` derivation (`none | explicitRequestOnly |
proactive`, VERSION-GUARD codex-tui 0.142.5) is now surfaced everywhere the workflow already
detects `multi_agent_v2` tool exposure, entirely ATTESTATION-STYLE / NON-FATAL — it never reddens
an otherwise-good install or preflight, and the existing `dispatch_mode`
(`v2-task-name`/`v1-thread-id`) field is byte-for-byte unchanged.

## RED

Test: `#598 base fixture (multi_agent=true, no effort)` inside
`assertDispatchPostureForConfig()` in `scripts/test-install-model-rendering.js`.

Pre-implementation run (source reverted via `git stash` on the 7 non-test files, keeping only
the new test code in place) — `node scripts/test-install-model-rendering.js`:

```
AssertionError [ERR_ASSERTION]: #598 base fixture (multi_agent=true, no effort): expected dispatch_posture explicitRequestOnly, got undefined
+ actual - expected

+ undefined
- 'explicitRequestOnly'

    at assertDispatchPostureForConfig (.../scripts/test-install-model-rendering.js:364:16)
```
Exit code 1 — the preflight JSON carried no `dispatch_posture` key at all (the derivation did
not exist yet), proving the test discriminates the missing feature rather than a fixture bug.

## GREEN

Same command after restoring the implementation (`git stash pop`):

```
Install model rendering tests passed
```
Exit code 0. All new assertions (9 pure-function posture fixtures x 2 modules in the unit block,
7 E2E `assertDispatchPostureForConfig` cases, 2 installer-report smoke checks) pass — 18+
new dispatch-posture assertions green, zero pre-existing assertions regressed.

Additionally verified GREEN end-to-end across every file in scope:
- `node scripts/test-install-model-rendering.js` — PASSED
- `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` — PASSED
  (`testCodexDispatchPosture598` + extended `testCodexPreflight266` posture cases)
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — PASSED
  (`testGitlabDispatchPosture598` + extended `testGitlabPreflight266` posture cases)
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — PASSED
  (`testGiteaDispatchPosture598` + extended `testGiteaPreflight266` posture cases)
- `node scripts/validate-script-sync.js` — `OK: 24 common scripts, 25 byte-identical groups, ...`
- `node scripts/simulate-workflow-walkthrough.js` (canonical, untouched surface) — `Workflow walkthrough simulation passed`

## Derivation seam

Read both scripts first (per the task brief) and found the natural seam: the preflight already
had `detectCodexDispatchMode()` parsing `[features] multi_agent_v2` (added for #584) but the
installer had NO config.toml parsing at all. I authored ONE new block —
`parseFeaturesMultiAgentEnabled` (mirrors `detectCodexDispatchMode`'s single-pass TOML-table
scanner but for the plain `[features] multi_agent = <bool>` flag), `parseTopLevelModelReasoningEffort`
(reads a ROOT-level `model_reasoning_effort` key — must precede the first `[table]` per TOML rules,
same convention as the existing `top` slicing in `validateProfileText`), `dispatchPostureRemediation`
(exact remediation text per posture), and `deriveDispatchPosture` (composes the above +
`detectCodexDispatchMode` into `{ dispatch_posture, model_reasoning_effort, multi_agent_enabled,
dispatch_posture_warning }`) — then mirrored the WHOLE FUNCTION SET byte-identically into the
installer (which previously had none of this TOML-table-scanning machinery, so it gained
`stripTomlComment`/`parseTomlTableName`/`parseTomlBoolean`/`splitInlineTomlFields`/
`parseMultiAgentV2Value`/`detectCodexDispatchMode` too — the exact pattern the file's own header
comment already documents for `validateProfileText`/`EFFORT_VALUES`: "DUPLICATED ... keep the two
copies in lock-step"). Derivation:
`![features] multi_agent OR multi_agent_v2 enabled -> 'none'; else model_reasoning_effort === "ultra"
-> 'proactive'; else 'explicitRequestOnly'`. `DISPATCH_POSTURE_VERSION_NOTE` names 0.142.5 as the
verified CLI version. Both files export `deriveDispatchPosture` + `DISPATCH_POSTURE_VERSION_NOTE`
for direct unit-test `require()`.

Wiring:
- **Installer** (`main()`): after all existing writes, reads back the config.toml it just wrote,
  derives posture, and prints 1-3 additional `console.log` lines **BEFORE** the final
  `console.log('status: ok')` — an existing invariant (`#332 AC3`: "installer stdout must end with
  `status: ok`", asserted identically in the codex/gitlab/gitea test suites) would have broken had
  I appended after it; caught this via the walkthrough run and fixed by reordering (see Deviations).
  Never calls `process.exit()` for posture — purely informational.
- **Preflight** (`inspectScope`): computes posture once per scope inspection and folds
  `dispatch_posture` / `model_reasoning_effort` / `multi_agent_enabled` / `dispatch_posture_warning`
  into every scope object, which propagates through all ~13 `runPreflight` return sites
  (ok/stale/refuse/autofix branches), `scopeReport()` (doctor mode, all scopes incl. `n/a` for
  plugin_cache), and the human-readable CLI printers (`warn: <remediation>` lines, non-fatal).
  `dispatch_mode`/`multi_agent_v2_enabled` semantics and every existing exit code are byte-for-byte
  unchanged — confirmed by re-running all pre-existing `assertDispatchModeForConfig` cases GREEN.

## Byte-group sync proof

`node scripts/validate-script-sync.js` → `OK: 24 common scripts, 25 byte-identical groups, ...`
(re-run after every edit). Concretely:
- "codex agent-profile installer copies" (3 files, no root copy — confirmed absent via
  `ls scripts/install-codex-agent-profiles.js` before editing): edited the canonical
  `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js`, then `cp`'d verbatim onto the
  gitlab/gitea copies; `diff` triple confirmed byte-identical both before AND after each edit pass.
- "codex-preflight copies" (4 files: root + 3 plugin trees, also separately covered by
  `COMMON_SCRIPTS` root<->codex parity): edited the canonical `scripts/kaola-workflow-codex-preflight.js`,
  then `cp`'d verbatim onto all 3 plugin copies; `diff` quadruple confirmed byte-identical.
- Cross-module semantic-parity assertion added on top of the file-diff check: both
  `test-install-model-rendering.js` and `simulate-kaola-workflow-walkthrough.js` `require()` BOTH
  the installer's and preflight's `deriveDispatchPosture` against the same fixture set and assert
  identical results, plus assert `installerMod.DISPATCH_POSTURE_VERSION_NOTE ===
  preflightMod.DISPATCH_POSTURE_VERSION_NOTE` verbatim (the byte-identity check alone can't express
  "these two independently-duplicated functions still agree").

## Leg containment

Every repo-file Edit/Write and every Bash command targeted the absolute leg path
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/legs/issue-598/n1-runtime-dispatch-contract`
(confirmed via `pwd` + `git log` at the start of the session — HEAD `8bd372ca`, branch
`kw/legs/issue-598/n1-runtime-dispatch-contract`). `git status --short` at the end shows exactly
the 11 frozen-write-set files modified, nothing else touched, no writes to the parent worktree or
main repo. This evidence file is the sole exception, written to the parent-side `.cache/` path as
instructed.

## Deviations

None from the frozen write set — all 11 files touched, no others. One self-caught, self-fixed
defect during verification: my first pass appended the installer's posture-REPORT lines AFTER
`console.log('status: ok')`, which broke the pre-existing `#332 AC3` invariant ("installer stdout
must end with `status: ok`") asserted identically in `simulate-kaola-workflow-walkthrough.js`,
`test-gitlab-workflow-scripts.js`, and `test-gitea-workflow-scripts.js`. Caught by running the
codex walkthrough chain (per the Verification section) before declaring done; fixed by moving the
posture-report block to print immediately BEFORE the final `status: ok` line (re-propagated to all
3 installer copies, re-verified byte-identical, re-ran all four target suites GREEN).
