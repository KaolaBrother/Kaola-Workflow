# Issue #1052 implementation — C1 executable host gate

worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`  
HEAD at start of this mission: `8fbd756a6ffd3681c9270261a654d667fadd205f` (dirty tree already had extra tdd pins; tests not reverted).  
Production custody only. Did not edit tests. Did not touch `kaola-workflow/bundle-1051`. Did not restore `sessionStart`. Did not infer CLI from a sibling `agent` binary. Did not hand-edit rendered mirrors. Did not run `npm test`, `test:kaola-workflow:claude:full`, or `scripts/simulate-workflow-walkthrough.js`.

## task

Gate every generated Next bash fence that contains CLI-stamped `--product cli --host local` startup/resume with an executable `if`/`elif`/`case` whose non-comment line matches `^(if|elif|case)\b` and `/(product|host)/i`. App/Cloud-like env (CURSOR/KAOLA product+host unset) must not invoke named claim.js with `--product cli --host local` from the first `## Resume` fence and must not materialize; concatenating every startup/resume fence in that env must not run the cli/local identity. CLI env (`CURSOR_PRODUCT=cli` `CURSOR_HOST=local` plus `KAOLA_CURSOR_*` twins) must still invoke `--product cli --host local` and `--cursor-workspace`; GitHub must materialize. C3: `CLAIM_JS` unset/empty still invokes named claim.js because the resolver stays outside the `if`. C2: CLI argv still has `--cursor-workspace "$CURSOR_WORKSPACE"`. Unstamped App `--runtime cursor` lines remain.

## verification tier

`tests-green`

## files changed

- `scripts/sync-cursor-edition.js` — added `cursorCliHostGateOpen` / `cursorCliGatedOperatorLines`. CLI-stamped startup fence is wrapped in:

  `if [ "${CURSOR_PRODUCT:-}" = cli ] && [ "${CURSOR_HOST:-}" = local ] || [ "${KAOLA_CURSOR_PRODUCT:-}" = cli ] && [ "${KAOLA_CURSOR_HOST:-}" = local ]; then`

  `cursorCliResumeRecoveryFence` keeps `kaola_script` / `CLAIM_JS="$(kaola_script …)"` **outside** the `if`; CLI-stamped resume is the `then` branch; unstamped `node "$CLAIM_JS" resume --runtime cursor` is the `else` so App compact recovery still resumes without cli/local. Existing second unstamped resume fence and unstamped startup fence are unchanged. No sibling-`agent` discriminator.

Generated `.cursor*/commands/workflow-next.md` trees were not hand-edited; isolated `--write --tree-root` in the suites consumes the generator.

## verification commands

```
node scripts/test-cursor-edition.js --cli-materialization-oracle
# exit 0
# CLI-MATERIALIZATION-ORACLE GREEN: Next CLI identity vs App/Cloud shared-file, --cursor-workspace operator argv, named claim.js flags, locator, and Finalize pre-dispatch ensure

node scripts/test-issue-1052-cursor-cli-startup-prep.js
# exit 0
# spawn-census: {"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":519}
# issue-1052 cursor CLI startup/resume prep passed (226 assertions).
```

## before

Recorded in `acceptance-red-c1-host-gate.md` on `8fbd756a`:

- `node scripts/test-issue-1052-cursor-cli-startup-prep.js` — exit 1, **10 failed / 216 passed** (C1 host-gate only)
- `node scripts/test-cursor-edition.js --cli-materialization-oracle` — exit 1, **3 RED errors** (github/gitlab/gitea × Next host-gate)

## after

- `node scripts/test-cursor-edition.js --cli-materialization-oracle` — exit 0, GREEN
- `node scripts/test-issue-1052-cursor-cli-startup-prep.js` — exit 0, **226 assertions** (216 prior + 10 former C1 host-gate pins)

Unexecuted: live Cursor App local / App Cloud sessions; full `test-cursor-edition.js` G2/G7 loops beyond `--cli-materialization-oracle`; `npm test` / `:claude:full` / walkthrough (forbidden).
