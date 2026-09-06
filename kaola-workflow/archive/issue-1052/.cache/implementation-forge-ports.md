# Implementation — Issue #1052 forge ports

role: implementer (production only; tests not edited)
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
verification tier: `tests-green`

## Files changed

- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — hand-port of GitHub kernel #1052 Cursor CLI/local prep
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — same hand-port
- `scripts/sync-cursor-edition.js` — `cursorCliStartupResumePrepProse()` locator text
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — Codex GitHub COMMON_SCRIPTS copy via `npm run sync:editions` (not hand-edited)

Not edited: `scripts/kaola-workflow-claim.js` (already on the kernel #1052 path), tests, Runner, `kaola-workflow/bundle-1051`, `.kw/worktrees/bundle-1051`. Did not restore sessionStart or `--global` dual-write. GitLab `issue_iid` and Gitea `issue_iid` resume fields unchanged. `--forge` is not a claim.js flag.

## Helper forge default

GitLab and Gitea `ensureCursorCliLocalPrep` spawn:

`${CURSOR_HOME}/kaola-workflow/scripts/kaola-workflow-cursor-surface.js --ensure-target <target> --forge=<args.forge||'github'> --json`

Default forge token is **`github`**, matching the GitHub kernel. Ports do not default to `gitlab`/`gitea` (that would `stale_forge` against the github global authority the 1052 suite installs). Gate remains explicit `--runtime cursor --product cli --host local` only.

`cmdStartup`: prep after a real target is known and before claim mutation; `no_target` still skips prep; bundle still returns early before the scalar `no_target` arm. `cmdResume`: after the active folder is resolved, prep `resolveCursorCliEnsureTarget(args, root, folder.main_root)` and merge `cursorPrepEnvelope`.

Generated Next prose: no `git rev-parse --show-toplevel`; names `--cursor-workspace` and recorded `main_root`. `$CLAIM_JS` startup/resume lines still carry `--product cli --host local`.

## Before

Recorded RED on `4212d44a` (tdd-guide; this implementer did not re-run RED):

- `node scripts/test-issue-1052-cursor-cli-startup-prep.js` — 90 passed / 51 failed, exit 1
- `node scripts/test-cursor-edition.js --cli-materialization-oracle` — exit 1 (locator + named-port `unknown_flag`)
- Codex copy refused `--product`/`--host` (`unknown_flag`)

## After (focused only; from the worktree)

```
npm run sync:editions
```

exit 0 — `codex-sync plugins/kaola-workflow/scripts/kaola-workflow-claim.js`

```
node scripts/test-issue-1052-cursor-cli-startup-prep.js
```

exit 0 — `issue-1052 cursor CLI startup/resume prep passed (141 assertions).`

```
node scripts/test-cursor-edition.js --cli-materialization-oracle
```

exit 0 — `CLI-MATERIALIZATION-ORACLE GREEN: Next startup/resume identity, named claim.js flags, locator, and Finalize pre-dispatch ensure`

```
node scripts/validate-script-sync.js
```

exit 0 — `OK: 14 common scripts, 25 byte-identical groups, ...`

Did not run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`, full `test-cursor-edition.js`.

Stop.
