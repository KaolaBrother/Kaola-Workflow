# Code review — Issue #1052 C1 host gate

candidate: SHA `282238bb8ee714b7989865378a57397f68b0b5a7` on `workflow/issue-1052`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
prior: C2/C3/C4 closed on `8fbd756a`; C1 open (unguarded CLI fences / first Resume stamped cli/local) in `code-review-call-chain-re-review.md`
surface: generated Next host gate around CLI-stamped startup/resume
reviewed: 2026-09-07
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: `kaola-workflow/bundle-1051`, `.kw/worktrees/bundle-1051`, tests, candidate production files

## How the chain was generated and executed

1. `node scripts/sync-cursor-edition.js --write --tree-root=/tmp/kw-1052-c1-gate/gen-{github,gitlab,gitea} --forge={github,gitlab,gitea}`
2. Classified fenced `startup|resume` bodies for executable `if`/`then` around `--product cli --host local`.
3. Isolated `install-cursor.sh --global --yes`. Copied named `kaola-workflow-claim.js` into `$CURSOR_HOME/kaola-workflow/scripts/`. Wrapped `node` to log argv.
4. Executed the **first** `## Resume` fence with `bash --noprofile --norc`:
   - App-like: `CURSOR_*` / `KAOLA_CURSOR_*` unset; sibling `agent` on PATH
   - documented CLI pair only: `CURSOR_PRODUCT=cli` `CURSOR_HOST=local`
   - test-style all four: those plus `KAOLA_CURSOR_PRODUCT=cli` `KAOLA_CURSOR_HOST=local`
5. Concatenated every generated startup/resume fence in App-like env and again with the documented CURSOR pair only.
6. Independently evaluated the exact generated `if` in a clean bash for operator precedence. README/docs read for export claims.

## C1

### App-forge (prior unguarded stamp) — repaired on this SHA

- github/gitlab/gitea: every `--product cli --host local` line sits inside `if`/`then` (zero CLI stamps outside `if`). First Resume fence: `kaola_script` / `CLAIM_JS=` then the gate, `else` unstamped `node "$CLAIM_JS" resume --runtime cursor`.
- App-like first Resume (vars unset, `agent` on PATH): argv log is `kaola-workflow-claim.js resume --runtime cursor`. `cursor_prep` absent. No `.cursor/agents/implementer.md`.
- Concatenate every startup/resume fence, App-like: three unstamped invocations only (`startup --runtime cursor`, then two `resume --runtime cursor`). No `--product cli --host local`. No agents.

That prior C1 trigger (App following every fence / first Resume presenting cli/local) does not reproduce.

### Still blocking — CLI path skippable-by-omission, and the documented CURSOR pair never enters `then`

Issue #1052 requires standalone CLI/local startup/resume to run Repo prep and not make that path skippable-by-omission.

Exact generated gate (no extra parens):

`if [ "${CURSOR_PRODUCT:-}" = cli ] && [ "${CURSOR_HOST:-}" = local ] || [ "${KAOLA_CURSOR_PRODUCT:-}" = cli ] && [ "${KAOLA_CURSOR_HOST:-}" = local ]; then`

bash `&&`/`||` are left-associative, so this is `((A && B) || C) && D`. Clean-shell results:

- unset all: ELSE
- `CURSOR_PRODUCT=cli` `CURSOR_HOST=local` only: ELSE
- `KAOLA_CURSOR_*` twins only: THEN
- all four: THEN
- parenthesized `(A&&B)||(C&&D)` with CURSOR pair only: THEN (the intended meaning, not the generated text)

First Resume fence with **only** `CURSOR_PRODUCT=cli` `CURSOR_HOST=local` (dispatcher item 3, and README/api "must set" that pair): argv is unstamped `resume --runtime cursor`; `cursor_prep` null; no agents. Concatenate every fence with that same pair: still no `--product cli --host local`, no materialize.

All four vars (what `test-issue-1052-cursor-cli-startup-prep.js` `hostGateEnv('cli')` sets together): stamps `--product cli --host local --cursor-workspace` and `cursor_prep.status=materialized`. That suite does not observe the documented two-var CLI path.

This tree does not record that Cursor CLI exports `CURSOR_PRODUCT` or `CURSOR_HOST` (README lines 161-162, `docs/api.md` env row, `docs/cursor-edition.md`). No installer, helper, or adapter in the candidate sets those names. A real Cursor CLI/App session therefore matches App-like unset: CLI ensure never runs unless an operator invents the test env. Inventing the documented CURSOR pair is still not enough because of the unparenthesized gate.

Guards that do not prevent: host-negative appendix prose; `isCursorCliLocalWorkflowPath` (never sees cli/local if the fence takes `else`); tests that set all four variables at once.

README/docs state the env gate and correctly refuse to claim Cursor exports the vars. They incorrectly claim the CURSOR pair alone runs the CLI-stamped fence.

## C2 C3 C4

Not re-opened. Not re-proven on this SHA beyond the generated `--cursor-workspace` still sitting inside the (broken for CURSOR-pair) `then` arm.

finding: id=C1 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=host-gate-skippable-and-unparen-or
finding: id=C2 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=generated-next-omits-cursor-workspace
finding: id=C3 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=cold-resume-claim-js-unbound
finding: id=C4 scope=in_scope action=fix status=resolved severity=medium fix_role=doc-updater rationale=readme-omits-user-visible-prep
verdict: fail
findings_blocking: 1
review_conclusion: On 282238bb App-like unset no longer forges cli/local, but C1 stays blocking: the unparenthesized host gate treats documented CURSOR_PRODUCT=cli CURSOR_HOST=local as else, and this tree does not show Cursor CLI exporting those vars so wild CLI ensure is skippable-by-omission.
