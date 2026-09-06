# Issue #1052 doc-updater evidence (comment 5560806842 / 5561181849)

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
Evidence: this file (MAIN checkout `kaola-workflow/issue-1052/.cache/doc-updater-comment-5560806842.md`)
Date: 2026-09-07

Codemaps: neither `scripts/codemaps/` nor `docs/CODEMAPS/` exists. Did not invent that tree.

No production `claim.js`, tests, rendered Cursor mirrors, Runner, or `kaola-workflow/bundle-1051` edited.
Did not run `npm test`, walkthrough, or `:claude:full`.

Binding later-wins comments transcribed: 5560806842 (consumer route / workspace locator / cold resume CLAIM_JS / README required) and 5561181849 (no operator-export burden; do not silently skip the original failure; real CLI does not export invented env).

## Executable signatures transcribed

`applyDemonstratedCursorCliHost(args)` in all four claim trees:
- no-op unless `runtime` normalizes to `cursor`
- returns immediately when `--product` or `--host` is already set (explicit argv wins)
- otherwise `inspectDemonstratedCursorParent()` walks living ancestors (`CURSOR_CLI_DEMONSTRATED_ANCESTOR_HOPS = 8`)
- `--workspace <opened>` that `demonstratedCursorWorkspaceApplies` (realpath equal, cwd under workspace, or shared `git-common-dir`) stamps `product=cli`, `host=local`, `cursorWorkspace=<that dir>`
- `--worker-dir` without `--workspace` → `kind: app` (skip ensure)
- no `--workspace` → `kind: unknown` (skip ensure)

`ensureCursorCliLocalPrep` then requires `isCursorCliLocalWorkflowPath` (`cursor`/`cli`/`local`) and spawns installed `--ensure-target <target> --forge=<args.forge||'github'> --json` before the single claim / on resume without re-claim.

`resolveCursorCliEnsureTarget`: `--cursor-workspace` wins (including stamped locator); else recorded `main_root` on resume; else invoking `getRoot()`.

Generated Next first claim fence remains unstamped:
`node "$CLAIM_JS" startup --runtime cursor --target-issues "$KAOLA_TARGET_ISSUES"`

Residual second fence (`cursorCliHostGateOpen` + `--product cli --host local --cursor-workspace "$CURSOR_WORKSPACE"`) documented only as leftover generated text, not the CLI-positive path.

Real Cursor CLI `2026.09.02-c22c1a3` does not export `CURSOR_PRODUCT`, `CURSOR_HOST`, `KAOLA_CURSOR_*`, or `CURSOR_WORKSPACE`. Demonstrated context is argv `--workspace <opened>`.

First Resume fence inlines `kaola_script` / `CLAIM_JS=` outside any `if`. Finalize still `--ensure-target "$PWD"` immediately before named dispatch. No `sessionStart` / `--global` dual-write.

Focused #1052 suite recorded 225 passed / 0 failed after living-parent fixture (not an `exec`-replaced fake CLI). This pass does not claim live Task named-dispatch, same-process hot load, `npm test`, walkthrough, or `:claude:full`.

## Files changed (worktree)

| File | Reconciled against |
|---|---|
| `README.md` | C4 required; CLI-positive unstamped fence + ancestor `--workspace`; removed operator-export burden |
| `CHANGELOG.md` | `[Unreleased]` only; `[10.4.0]` and earlier untouched |
| `docs/api.md` | claim flags, prep section, `--ensure-target` row, env vars (residual names only) |
| `docs/cursor-edition.md` | startup/resume/finalize order; installer `--ensure-target` paragraph |
| `docs/architecture.md` | CLI identity from ancestor argv; sessionStart/`--global` unchanged |
| `docs/runtime-capabilities.md` | CLI/local table row + following paragraph |

## Surfaces skipped (with reason)

| Surface | Reason |
|---|---|
| `docs/README.md` | index only; no CLI host-gate / ensure order |
| `docs/installation.md` | no `CURSOR_PRODUCT` operator-setup / first-fence text to retarget |
| `docs/CODEMAPS/*` | directory does not exist |
| Public comments in claim/sync/cursor-surface JS | production JS out of custody |
| Tests / rendered Cursor mirrors / Runner / `kaola-workflow/bundle-1051` | out of custody |
| Released CHANGELOG entries | must not rewrite |

## Commands run

- Glob for `scripts/codemaps/**` and `docs/CODEMAPS/**` (none)
- GitHub issue_read comments 5560806842 / 5561181849 (and later 5561551896 observed, not used to invent a new operator path)
- Read `applyDemonstratedCursorCliHost` / ancestor walk in worktree `scripts/kaola-workflow-claim.js`
- Grep/read of listed docs and README in the worktree
- StrReplace on the six listed files only
