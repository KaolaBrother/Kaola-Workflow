# Issue #1052 doc-updater (forge-port repair)

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
Date: 2026-09-07
Codemap tooling: neither `scripts/codemaps/` nor `docs/CODEMAPS/` exists; skipped inventing that tree.

No production code or tests changed. `kaola-workflow/bundle-1051` not touched. No live Task / hot-load claims added.

## Commands

- Glob for `scripts/codemaps/` and `docs/CODEMAPS/` (absent).
- Grep/read of four claim trees, `scripts/sync-cursor-edition.js` (`cursorCliStartupResumePrepProse`), and the listed doc surfaces.

## Skipped

- `README.md` — does not describe `--product` / `--host` / `--cursor-workspace`, the claim.js gate, or generated Next locators.
- `docs/README.md` — documentation index only; no this-surface wording to correct.
- Production, tests, generated Next bytes, and `kaola-workflow/bundle-1051`.

## Files updated (worktree)

### `CHANGELOG.md` `[Unreleased]`

Reconciled against all four claim.js trees and `cursorCliStartupResumePrepProse`.

**Four-tree sentence:** The same identity flags (`product`, `host`, `cursorWorkspace`) and `ensureCursorCliLocalPrep` path exist on all four claim trees: canonical GitHub `scripts/kaola-workflow-claim.js`, COMMON_SCRIPTS Codex copy `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (`npm run sync:editions`), GitLab hand-port `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`, and Gitea hand-port `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`. Generated Next (including GitLab/Gitea) rewrites `node "$CLAIM_JS" startup --runtime cursor --product cli --host local` and resume `node "$CLAIM_JS" resume --runtime cursor --product cli --host local`; those claim.js no longer `unknown_flag`.

**Next-locator sentences:** Generated Next appendix (`cursorCliStartupResumePrepProse`) names `--cursor-workspace` and recorded `main_root`; it does not name `git rev-parse --show-toplevel` as the known CLI workspace. First-claim fallback in claim.js is still invoking `getRoot()` (`git rev-parse --show-toplevel`). Nested cwd and the write-worktree are not the known workspace. Helper spawn is `--forge=<args.forge||'github'>`; `--forge` is not a claim.js flag; GitLab/Gitea helpers therefore keep that same `github` default, not gitlab/gitea.

### `docs/api.md`

**Four-tree sentences:** Those three identity flags exist on all four claim trees: canonical GitHub `scripts/kaola-workflow-claim.js`, COMMON_SCRIPTS Codex copy `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (`npm run sync:editions`), GitLab hand-port `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`, and Gitea hand-port `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`. That gate and helper path exist on all four claim trees named above. Generated GitLab/Gitea Next stamps `--product cli --host local`; those claim.js no longer `unknown_flag`. Standalone Cursor CLI/local Workflow `startup`/`resume` spawn the helper from all four claim trees only when `--runtime cursor --product cli --host local`.

**Next-locator sentences:** `--forge` is not a claim.js flag, so GitLab/Gitea claim trees keep that same helper default of `github`. Helper spawn is `--forge=<args.forge||'github'>`. First-claim fallback in claim.js is still invoking `getRoot()` (`git rev-parse --show-toplevel`). Nested cwd and the write-worktree are not the known workspace. Generated Next appendix (`cursorCliStartupResumePrepProse`) names `--cursor-workspace` and recorded `main_root`; it does not name `git rev-parse --show-toplevel` as the known CLI workspace.

### `docs/cursor-edition.md`

**Four-tree sentences:** That identity-flag and `ensureCursorCliLocalPrep` path exists on all four claim trees (canonical GitHub `scripts/kaola-workflow-claim.js`, COMMON_SCRIPTS Codex copy, GitLab hand-port, Gitea hand-port). Generated GitLab/Gitea Next stamps `--product cli --host local`; those claim.js no longer `unknown_flag`. Compact recovery and `--ensure-target DIR` bullets now say startup/resume spawn from all four claim trees.

**Next-locator sentences:** Claim.js `<target>` is `--cursor-workspace` when set, else recorded `main_root` on resume, else invoking `getRoot()` (`git rev-parse --show-toplevel`) on first claim — not nested cwd and not the write-worktree. Generated Next appendix (`cursorCliStartupResumePrepProse`) names `--cursor-workspace` and recorded `main_root`; it does not name `git rev-parse --show-toplevel` as the known CLI workspace. Helper spawn is `--forge=<args.forge||'github'>`; `--forge` is not a claim.js flag.

### `docs/architecture.md`

**Four-tree sentences:** Workflow `startup` and `resume` spawn the installed helper `--ensure-target` when `--runtime cursor --product cli --host local` from all four claim trees (canonical GitHub `scripts/kaola-workflow-claim.js`, COMMON_SCRIPTS Codex copy, GitLab hand-port, Gitea hand-port). Generated GitLab/Gitea Next stamps `--product cli --host local`; those claim.js no longer `unknown_flag`.

**Next-locator sentences:** Helper spawn is `--forge=<args.forge||'github'>`; `--forge` is not a claim.js flag. Claim.js target is `--cursor-workspace` when set, else recorded `main_root` on resume, else invoking `getRoot()` (`git rev-parse --show-toplevel`) on first claim — not nested cwd and not the write-worktree. Generated Next appendix names `--cursor-workspace` and recorded `main_root`; it does not name `git rev-parse --show-toplevel` as the known CLI workspace.

### `docs/runtime-capabilities.md`

**Four-tree sentences:** Table and prose: all four claim trees spawn installed `--ensure-target` only on `--runtime cursor --product cli --host local` (canonical GitHub, COMMON_SCRIPTS Codex copy, GitLab hand-port, Gitea hand-port). Generated GitLab/Gitea Next stamps `--product cli --host local`; those claim.js no longer `unknown_flag`.

**Next-locator sentences:** Helper spawn is `--forge=<args.forge||'github'>`; `--forge` is not a claim.js flag. Claim.js target is `--cursor-workspace` when set, else recorded `main_root` on resume, else invoking `getRoot()` (`git rev-parse --show-toplevel`) on first claim — not nested cwd and not the write-worktree. Generated Next appendix names `--cursor-workspace` and recorded `main_root`; it does not name `git rev-parse --show-toplevel` as the known CLI workspace.

## Unchanged gates (transcribed, not invented)

Gate remains explicit `--runtime cursor --product cli --host local` only. No sessionStart. No `--global` dual-write. Finalize still `--ensure-target "$PWD"` immediately before named dispatch.
