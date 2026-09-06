# Issue #1052 host-identity / workspace / resume-entry — production implementation

worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`

## task

Production repair so only explicit standalone Cursor CLI + local runs Repo prep; generated Next startup/resume pass `--product cli --host local`; ensure-target is `--cursor-workspace` or recorded `main_root`, never silent write-worktree/cwd as the known CLI workspace; normal resume is `claim.js resume`.

## verification tier

`tests-green`

## files changed

- `scripts/kaola-workflow-claim.js`
- `scripts/sync-cursor-edition.js`

Not touched: `scripts/test-issue-1052-cursor-cli-startup-prep.js`, `scripts/test-cursor-edition.js` oracles, Runner, `bundle-1051`, sessionStart / `--global` dual-write, user-facing docs.

## helper / target resolution

- Helper remains the installed path: `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts/kaola-workflow-cursor-surface.js --ensure-target <target> --forge=<forge|github> --json`. Fail-closed install/authority faults unchanged.
- `isCursorCliLocalWorkflowPath`: true only when `--runtime cursor` **and** `--product cli` **and** `--host local` (trim, case-insensitive exact). Omitted / unknown / app / cloud / incomplete pairs skip ensure and still acquire/resume. `--runtime cursor` alone never infers CLI. `--host` is not ignored.
- `--cursor-workspace` is in `KNOWN_VALUE_FLAGS` (`cursorWorkspace`). When set, ensure-target is that resolved path.
- Resume with explicit CLI/local: ensure-target is recorded `folder.main_root` from `workflow-state.md` unless `--cursor-workspace` is passed.
- First `startup` without `--cursor-workspace`: invoking-process `getRoot()` git toplevel (nested-cwd fallback). Resume from a write-worktree does not treat that cwd as the known CLI workspace.

## verification commands

### before (dirty candidate RED)

```
node scripts/test-issue-1052-cursor-cli-startup-prep.js
```

exit 1 — 12 failed / 45 passed (identity omitted/incomplete/unknown/cloud; resume omitted; worktree-cwd main_root; `--cursor-workspace` unknown_flag).

```
node scripts/test-cursor-edition.js --cli-materialization-oracle
```

Not re-run in this production step; prior oracle RED: omitted `--product/--host` on Next startup; helper-only / mission-list.md resume.

### after

```
node scripts/test-issue-1052-cursor-cli-startup-prep.js
```

exit 0 — `issue-1052 cursor CLI startup/resume prep passed (57 assertions).`

```
node scripts/test-cursor-edition.js --cli-materialization-oracle
```

exit 0 — `CLI-MATERIALIZATION-ORACLE GREEN: Next startup/resume order and Finalize pre-dispatch ensure`

## unexecuted

- Live standalone Cursor CLI process / live Task catalog after prep
- Live Cursor App local / App Cloud sessions
- Runner / kaola-project-runner (out of scope)
- `npm test`, `test:kaola-workflow:claude:full`, `simulate-workflow-walkthrough.js` (forbidden this mission)
- Full `test-cursor-edition.js` G2/G7 loops
- User-facing docs (later mission)
