# Issue #1052 acceptance RED

baseline SHA actually run: `05b67a8ca096ee9661d06c0393aacb97eaf3d31d`  
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`  
`git rev-parse HEAD` in that worktree matched the SHA above.

## Test paths

- `scripts/test-issue-1052-cursor-cli-startup-prep.js` — drives real `kaola-workflow-claim.js` startup/resume/status/list-open and the real installed `kaola-workflow-cursor-surface.js --ensure-target` helper. No production code.
- `scripts/test-cursor-edition.js` — retargeted Next program-order oracle (`cursorCliMaterializationVerdict(..., 'next')`). Finalize keeps the existing pre-dispatch `$PWD` ensure, App/Cloud negative, no-ambient-cwd, sessionStart exclusion, and fail-closed install-fault pins. Isolated entry: `node scripts/test-cursor-edition.js --cli-materialization-oracle`.

## Registration site

- `package.json` `test:kaola-workflow:claude` and `test:kaola-workflow:claude:full` both run `node scripts/test-issue-1052-cursor-cli-startup-prep.js` immediately after `scripts/test-issue-1046-global-contract.js`.
- Prompt oracles remain on `test:kaola-workflow:editions` via `scripts/test-cursor-edition.js` (already registered).
- `node scripts/test-suite-registration.js` on this tree: exit 0, `57 test-*.js files, 54 registered, 3 exempt`.

## RED: claim/startup/resume suite

Command: `node scripts/test-issue-1052-cursor-cli-startup-prep.js`  
Result: exit 1 — **19 failed / 19 passed**.

Failure signatures (test name + assertion/error):

- `#1052-startup-empty: startup must prepare the CLI workspace via ensure-target before named dispatch can be skipped` — missing `.cursor/agents/implementer.md` or receipt after `startup --runtime cursor` acquired.
- `#1052-startup-empty: startup prep must reuse the full ensure-target write set, not an agents-only copy` — workspace managed files `[]` vs helper twin (agents + commands).
- `#1052-startup-empty: project receipt must be the real ensure-target transaction for the CLI workspace (got null)`
- `#1052-startup-empty: a materializing write must report the measured CLI restart-required boundary new_process_same_chat` — envelope was `claim: acquired` with no restart boundary.
- `#1052-collision: unmanaged canonical-name collision must fail closed before claim mutation` — status 0 / `claim: acquired`.
- `#1052-collision: issue folder must not exist when prep fails closed`
- `#1052-collision: diagnostic must be an install fault, not Task-unsupported` — acquired JSON, no install-fault diagnostic.
- `#1052-symlink: managed-basename symlink must fail closed without following it` — status 0 / acquired.
- `#1052-symlink: diagnostic must be an install fault`
- `#1052-missing-authority: missing global authority must fail closed before claim` — status 0 / acquired.
- `#1052-missing-authority: must report an install fault, not Task-unsupported`
- `#1052-stale-authority: hash-stale global authority must fail before claim mutation` — status 0 / acquired.
- `#1052-stale-authority: diagnostic must be an install fault`
- `#1052-resume: missing/stale roles must still be prepared on resume`
- `#1052-refresh: a missing managed role on resume must be restored by ensure-target`
- `#1052-refresh: a safe refresh that writes must surface restart-required` — `{"resumed":true,"project":"issue-10527","issue":10527}`
- `#1052-workspace-vs-worktree: CLI workspace must receive Repo prep` — acquired a write-worktree, no workspace `.cursor` roles.
- `#1052-app-local: explicit Cursor App/local must not infer CLI ensure or write project roles` — `unknown_flag` for `--product`/`--host` (flags not yet known; App/Cloud cannot be expressed without inferring from `--runtime cursor`).
- `#1052-app-cloud: explicit Cursor App/Cloud must not apply CLI ensure` — same `unknown_flag`.

Passing on this baseline (regression pins that already hold, not the skip-proof): helper control `--ensure-target`; nested-cwd/neighbor non-write while prep is absent; non-Cursor `--runtime claude` writes no project roles; `status`/`list-open` zero-write; resume identity/Mission List bytes unchanged because resume currently does not write.

## RED: retargeted Next program-order oracle

Command: `node scripts/test-cursor-edition.js --cli-materialization-oracle`  
(Fresh `sync-cursor-edition.js --write --tree-root` render; does not use the main-checkout generated tree.)  
Result: exit 1.

- `CLI-MATERIALIZATION-ORACLE RED: workflow-next: Next still locates Repo prep at first named dispatch, which is skippable`
- `CLI-MATERIALIZATION-ORACLE RED: workflow-next: Next does not forbid treating missing named roles as capability_gap that skips Repo prep`

Finalize generated consumer produced no errors on this isolated render (pre-dispatch `$PWD` ensure, App/Cloud negative, no ambient cwd/sessionStart, fail-closed pins retained).

`node scripts/test-cursor-edition.js` (full file) stopped at D0: main-checkout `.cursor/commands/{workflow-next,kaola-workflow-finalize}.md` are stale vs `sync --check` from this worktree (`TREE_ROOT` is the linked-worktree common git dir). That D0 was not used as #1052 acceptance; the isolated `--cli-materialization-oracle` is the Next/Finalize oracle that was actually run.

## Unexecuted

- Live standalone Cursor CLI **new process** named Task dispatch after prep (catalog visibility, omit-model named role). Explicit later orchestrator mission; no live Task evidence fabricated.
- Live Cursor App local / App Cloud sessions.
- Runner / kaola-project-runner (out of scope; not required).
- Full producer chain `npm test` / `test:kaola-workflow:claude:full` / walkthrough (not required for this mission).
- Full `test-cursor-edition.js` G2/G7 loops (blocked by unrelated main-tree D0 drift in this worktree invocation). Isolated `--cli-materialization-oracle` covers the retargeted Next/Finalize verdicts against freshly generated bytes, including App/Cloud shared negatives encoded in those verdicts. The G2 mutation legs (omit `$PWD` on Finalize, App-host inversion, Next capability_gap-skip append) were not executed as a separate process in this RED run.
- `--global` install dual-write (existing helper already does not write the invoking repo; not used as a baseline-failing oracle).
