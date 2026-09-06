# Implementation — Issue #1052 comments 5560806842 / 5561181849 (normal generated entry)

role: implementer (production only)
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
did_not_edit: tests, `kaola-workflow/bundle-1051`, rendered Cursor mirrors, Runner, sessionStart / `--global` dual-write, mission-list done rows
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_infer: CLI from sibling `agent` or `CURSOR_INVOKED_AS`
did_not_invent: `CURSOR_PRODUCT` / `KAOLA_CURSOR_*` / `CURSOR_WORKSPACE` operator exports

## task

Make the default **first** generated Next claim fence
(`node "$CLAIM_JS" startup --runtime cursor --target-issues …`) complete Repo
`--ensure-target` **before that single claim** when the demonstrated parent is a
real CLI shape: ancestor argv contains `--workspace <opened dir>`. Pass explicit
`--product cli --host local` and `--cursor-workspace <opened>` in Workflow’s own
ensure/claim args (in-process; no second claim spawn). App-like `--worker-dir`
without `--workspace`, and unknown (no `--workspace`), must still skip ensure.

## verification tier

not `tests-green` — focused 1052 suite remains RED (same 9 assertions). This is a
**finding for test custody**, not an assertion weakening. Production walk is in
place for a living CLI parent.

## files changed

- `scripts/kaola-workflow-claim.js` — walk ancestor argv; apply demonstrated CLI host before ensure
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — COMMON_SCRIPTS copy via `npm run sync:editions`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — hand-port
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — hand-port

R1 known flags (`product`, `host`, `cursorWorkspace`) unchanged on all four trees.
C3 Resume `CLAIM_JS` resolver untouched. Generator first fence left unstamped
(claim.js is supposed to resolve `--workspace` itself).

## behavior added

When `--runtime cursor` and both `--product` / `--host` are omitted:

1. Walk up to 8 ancestor PIDs (`/proc/<pid>/cmdline` or `ps -ww -o args=`).
2. Tokenize argv. Do not consult PATH sibling `agent` or `CURSOR_INVOKED_AS`.
3. `--workspace <dir>` that exists and shares git identity with cwd (same
   realpath, cwd inside that dir, or same `git rev-parse --git-common-dir`) →
   set `product=cli`, `host=local`, `cursorWorkspace=<dir>` then run installed
   `--ensure-target` against that dir (so main-open + other-worktree cwd preps
   main; worktree-open preps the worktree).
4. `--worker-dir` without `--workspace` → App-like; skip ensure.
5. No demonstrated `--workspace` → unknown; skip ensure.
6. Any explicit `--product` or `--host` (including incomplete pairs) wins; no fill-in.

This is Workflow’s own call: args are stamped in-process before
`resolveCursorCliEnsureTarget` / `ensureCursorCliLocalPrep`. Claim is not
re-spawned (keeps the single first-fence startup).

Unrelated nested Cursor sessions (`--workspace` = a different git common dir)
are skipped so identity-omitted / App/unknown fences do not inherit the
session CLI workspace.

## finding (blocks GREEN of the retargeted oracle)

`writeDemonstratedCursorParent` writes a fake `…/2026.09.02-c22c1a3/index.js`
that **`exec bash -c "$KAOLA_FENCE"` without forwarding `"$@"`**. `exec` replaces
that process image; live ancestor argv no longer contains `--workspace <opened>`.
Measured on Darwin: claim.js parent is bash `-c` (fence only); grandparent is
the test `node` process (`test-issue-1052-cursor-cli-startup-prep.js`, no
`--workspace`); the disposable opened dir is gone from the process tree.

A real Cursor CLI keeps `…/index.js --workspace <dir> --model …` alive as an
ancestor of the tool bash, so the same walk is the production path. The suite’s
`exec` fixture does not demonstrate that tree (despite the comment that claim.js
is a grandchild of `--workspace`). Dropping `exec` (keep `bash -c "$KAOLA_FENCE"`
so `sh index.js --workspace …` remains) would make claim.js a grandchild of a
living demonstrated parent without changing assertions.

Implementer did not edit tests.

## verification commands

cwd = worktree

```
node scripts/test-issue-1052-cursor-cli-startup-prep.js
node scripts/test-cursor-edition.js --cli-materialization-oracle
npm run sync:editions
node scripts/validate-script-sync.js
```

## before

worktree pre-edit (same SHA surface as RED `acceptance-red-comment-5560806842.md`):

- `node scripts/test-issue-1052-cursor-cli-startup-prep.js` → exit 1
  `issue-1052 cursor CLI startup/resume prep FAILED: 9 failure(s), 216 passed.`
  spawn-census: `{"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":591}`
- `node scripts/test-cursor-edition.js --cli-materialization-oracle` not re-run at
  the absolute pre-edit instant; last known on this line was GREEN (gate-parens receipt).

## after

- `node scripts/test-issue-1052-cursor-cli-startup-prep.js` → exit 1
  `issue-1052 cursor CLI startup/resume prep FAILED: 9 failure(s), 216 passed.`
  spawn-census: `{"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":591}`
  Same 9 names: generated github/gitlab/gitea `c1-first-claim-cli-prep`,
  `c2-cli-opened-worktree`, `c2-main-cli-other-cwd`.
  App/unknown first fences, identity incomplete pairs, R1 flags, C3, C4 still among the 216.
- `node scripts/test-cursor-edition.js --cli-materialization-oracle` → exit 0
  `CLI-MATERIALIZATION-ORACLE GREEN: Next CLI identity vs App/Cloud shared-file, --cursor-workspace operator argv, named claim.js flags, locator, and Finalize pre-dispatch ensure`
- `npm run sync:editions` → exit 0 (`codex-sync` claim.js)
- `node scripts/validate-script-sync.js` → exit 0
