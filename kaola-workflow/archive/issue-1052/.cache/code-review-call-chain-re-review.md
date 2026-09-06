# Code re-review — Issue #1052 generated consumer call chain

candidate: SHA `8fbd756a6ffd3681c9270261a654d667fadd205f` on `workflow/issue-1052`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
prior FAIL: `kaola-workflow/issue-1052/.cache/code-review-call-chain.md` C1-C4 on `2cae8caa` (immutable)
surface: generated Next operator path (C1 App/Cloud identity, C2 workspace locator, C3 cold resume CLAIM_JS, C4 README)
reviewed: 2026-09-07
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: `kaola-workflow/bundle-1051`, `.kw/worktrees/bundle-1051`, tests, candidate production files

## How the chain was generated and executed

1. `node scripts/sync-cursor-edition.js --write --tree-root=/tmp/kw-1052-c1c4-re/gen-{github,gitlab,gitea} --forge={github,gitlab,gitea}`
2. Classified every fenced `node "$CLAIM_JS" startup|resume` line. Confirmed two argv classes on all three forges.
3. Isolated `install-cursor.sh --global --yes`, then drove **emitted** argv through real `scripts/kaola-workflow-claim.js` (not `--product app` substitutes):
   - unstamped: `startup --runtime cursor --target-issues N --json` and `resume --runtime cursor --json`
   - CLI: generated identity plus `--cursor-workspace` with `$CURSOR_WORKSPACE` unset vs set-to-opened-worktree
4. Cold `bash --noprofile --norc -c` of the **first** `## Resume` fence with `CLAIM_JS` unset and `CLAIM_JS=""`, wrapping `node` to log argv. Named claim.js was copied to `$CURSOR_HOME/kaola-workflow/scripts/` so `kaola_script` could hit it.
5. Independent README read (not the doc-updater skip).

## Prior findings

### C1 — still OPEN — HIGH — two line classes exist; no host gate around the CLI fence

- prior: shared Next only stamped cli/local, so App/Cloud following the command presented that identity
- repair: added unstamped App/Cloud `startup|resume --runtime cursor` beside CLI lines
- why not closed: Issue #1052 allows Repo prep only for standalone CLI/local. The generated file still has **no host gate** (no shell `if`/`case` on product/host, no wrapper) around the CLI fences. Host-negative prose lives in the appendix after `KW-COMPACT-RECOVERY-END`, not around the fences.
- generated github (gitlab/gitea same shape):
  1. unstamped startup fence, then immediately another fence: `node "$CLAIM_JS" startup --runtime cursor --product cli --host local --cursor-workspace "$CURSOR_WORKSPACE" --target-issues "$KAOLA_TARGET_ISSUES"`
  2. first `## Resume` fence is the **CLI** line (with resolver), then a second unstamped `node "$CLAIM_JS" resume --runtime cursor`
- executed:
  - unstamped startup: `claim=acquired`, `cursor_prep=null`, no `.cursor/agents/implementer.md`
  - unstamped resume: `resumed=true`, `cursor_prep=null`, no extra Repo writes
  - same CLI fence argv (what an App hits if it runs every fence, or compact-recovery Resume which starts at the first fence): `cursor_prep.status=materialized` and agents written
- compact recovery (`templates/routing/compact-recovery.skeleton.md`) reloads Next and resumes without intake. The first Resume bash fence is CLI-stamped, so that default resume entry still forges cli/local.
- two classes are necessary but not sufficient. An App that follows every bash fence, or compact recovery that runs the first Resume fence, still triggers CLI ensure. That remains blocking under Issue #1052.

### C2 — CLOSED — generated CLI argv now passes `--cursor-workspace`

- generated CLI startup/resume on github/gitlab/gitea include `--cursor-workspace "$CURSOR_WORKSPACE"`.
- nested cwd + set locator to opened workspace: `cursor_prep.target` = opened git toplevel, nested cwd got no agents.
- nested cwd + unset/empty locator: empty flag falls through to `getRoot()` (opened repo), not nested cwd.
- write-worktree + set `$CURSOR_WORKSPACE` to the worktree: `cursor_prep.target` = worktree, agents on worktree, not main_root.
- write-worktree + unset: empty flag uses recorded `main_root` (documented fallback, not the old unused-flag defect).
- original C2 trigger (operator path never passed the flag) is gone.

### C3 — CLOSED — first Resume fence inlines resolver and invokes named claim.js

- first `## Resume` fence is `kaola_script` + `CLAIM_JS="$(kaola_script kaola-*-workflow-claim.js)"` + named resume (github `kaola-workflow-claim.js`, gitlab/gitea renamed ports).
- cold unset: node argv log is `.../kaola-workflow-claim.js resume --runtime cursor --product cli --host local --cursor-workspace `; stdout is a real resume JSON envelope (`resumed:true`), not `node ""` exit 0 empty.
- cold `CLAIM_JS=""`: fence overwrites CLAIM_JS via `kaola_script`; same named claim.js resume invocation.

### C4 — CLOSED — README states CLI/local prep and App/Cloud non-inheritance

- independent read of `README.md` lines 151-155: shared one `.cursor/commands` file, two argv classes, CLI/local `--ensure-target` / `--cursor-workspace "$CURSOR_WORKSPACE"`, sentence `App/Cloud do not inherit that CLI ensure`. README still names `workflow-next` and `Cursor CLI/App/Cloud`, so the surface is present and no longer omits the behavior.

## Residual note (not a new identity)

C1 remaining is the same generated-operator-path / forged-host-identity class. Do not treat "two line classes" as a PASS.

did_not_touch: tests (not weakened), Runner, `#1051` / `bundle-1051`.

finding: id=C1 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=unguarded-cli-fence-still-forges-app-cloud
finding: id=C2 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=generated-next-omits-cursor-workspace
finding: id=C3 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=cold-resume-claim-js-unbound
finding: id=C4 scope=in_scope action=fix status=resolved severity=medium fix_role=doc-updater rationale=readme-omits-user-visible-prep
verdict: fail
findings_blocking: 1
review_conclusion: On 8fbd756a C2 C3 and C4 are closed by generated --cursor-workspace, inlined Resume resolver, and README text, but C1 remains blocking because unguarded CLI fences and the first Resume fence still stamp cli/local with no host gate.
