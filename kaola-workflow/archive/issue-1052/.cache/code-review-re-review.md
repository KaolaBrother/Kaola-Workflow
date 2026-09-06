# Code re-review — Issue #1052 frozen candidate

candidate: SHA `2cae8caa13ef00bd5aef6d5b5f534b3a3ab8352b` on `workflow/issue-1052`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
compare: `main` `05b67a8ca096ee9661d06c0393aacb97eaf3d31d`
prior FAIL: SHA `4212d44a912363e205b24090e0977aff97500e93` at `kaola-workflow/issue-1052/.cache/code-review.md` (R1 open, R2 open)
surface: GitLab/Gitea/Codex claim.js identity flags, generated Next locator prose, unknown-identity writes, resume-from-worktree locator, App/Cloud inference, Next resume subject, docs vs source, test custody
reviewed: 2026-09-07
ran: `node scripts/test-issue-1052-cursor-cli-startup-prep.js` (141 assertions, exit 0); `node scripts/test-cursor-edition.js --cli-materialization-oracle` (GREEN, github/gitlab/gitea); `node scripts/validate-script-sync.js` (exit 0)
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`, full `test-cursor-edition.js` G2/G7/G8 loops

## Prior findings

### R1 — CLOSED — GitLab/Gitea/Codex Next identity flags no longer `unknown_flag`

- prior status: open / HIGH on `4212d44a`
- now: resolved on `2cae8caa`
- file: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`; `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`; `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- evidence:
  - `KNOWN_VALUE_FLAGS` on all three named trees includes `product`, `host`, `cursorWorkspace` (GitLab lines 64-66; Gitea 64-66; Codex copy 69-71, byte-synced with `scripts/kaola-workflow-claim.js`).
  - Direct spawn of generated Next argv against named ports is not `unknown_flag`. GitLab/Gitea/Codex/kernel each returned a later claim-time envelope with `cursor_prep` present:
    `startup --target-issue 1 --runtime cursor --product cli --host local --json`
    GitLab: `verdict: target_indeterminate` plus `cursor_prep.status=materialized` (not `reason: unknown_flag`).
    Gitea/Codex/kernel: same flags accepted; `cursor_prep` present.
  - Isolated oracle now renders `--forge=gitlab` and `--forge=gitea` Next, binds `CLAIM_JS` to the named port basename, and fails if that port returns `unknown_flag`.
  - Focused suite `#1052-port[gitlab|gitea|codex-github]-startup-flags` / `-resume-flags` / `-cursor-workspace-flags` passed.

### R2 — CLOSED — generated Next no longer names `git rev-parse --show-toplevel` as the ensure target

- prior status: open / MEDIUM on `4212d44a`
- now: resolved on `2cae8caa`
- file: `scripts/sync-cursor-edition.js` `cursorCliStartupResumePrepProse()`
- evidence:
  - Generator prose (lines 214-215): explicit `--cursor-workspace` is the CLI workspace locator; resume uses recorded `main_root` when that flag is absent. No `git rev-parse --show-toplevel`.
  - Isolated `--write --tree-root` for github/gitlab/gitea: Next has `--cursor-workspace` and `main_root`; does not contain `git rev-parse --show-toplevel`; resume bash is `node "$CLAIM_JS" resume --runtime cursor --product cli --host local`.
  - Oracle locator mutant rejects show-toplevel; dropped-locator mutant requires `--cursor-workspace` and `main_root`. GREEN on all three forges.

## What was checked and not admitted

Unknown identity still writes extra Repo: not found. `isCursorCliLocalWorkflowPath` is true only for normalized `cursor`+`cli`+`local`. Omitted/unknown/incomplete/app/cloud skip ensure and still claim/resume on kernel and named ports. `status` / `list-open` stay zero-write even with CLI/local flags. No env/sibling-binary inference path was found.

Resume from write-worktree still targeting `getRoot()`: not found in claim.js. `cmdResume` calls `resolveCursorCliEnsureTarget(args, root, folder.main_root)`. Explicit `--cursor-workspace` wins; else recorded `main_root`; invoking `getRoot()` is first-claim fallback only. `#1052-worktree-cwd` and `#1052-port[*]-worktree-cwd` passed (prep on `main_root`, not worktree cwd).

Generated App/Cloud inheriting CLI as default argv inference: not admitted. Shared generated Next still stamps `--product cli --host local` on the executable `$CLAIM_JS` startup/resume lines (oracle-locked). Host negatives remain in the appendix prose; App/Cloud guidance window is checked not to carry those flags as a default. `claim.js` still requires the explicit triple; App/local and omitted identity skip ensure.

Next resume remaining helper-only: not found. Generator still injects the `$CLAIM_JS` resume bash block before `On resume, read mission-list.md`. Isolated Next contains that line. G2 mutation still rejects helper-only / mission-list-only resume.

Docs vs source: match on the four claim trees, identity gate, locator order, Next appendix vs claim.js `getRoot()` first-claim fallback, Finalize `$PWD`, and `--forge` not being a claim.js flag (`docs/api.md`, `docs/cursor-edition.md`, `docs/architecture.md`, `docs/runtime-capabilities.md`, `CHANGELOG.md` `[Unreleased]`).

Test custody: not weakened. Repair added named-port assertions and forge-axis oracle coverage. GitHub kernel positives/negatives from `4212d44a` remain. Suite grew from the prior RED (90 passed / 51 failed) to 141 passing assertions. No assertion was deleted into a weaker substitute.

Helper `--forge=<args.forge||'github'>` on GitLab/Gitea: not admitted. `--forge` is still not a claim.js flag, so named ports spawn the helper with `github`. A GitLab-shaped `--global` authority (`receipt.forge=gitlab`) against `--forge=github` is `stale_forge` and fail-closes before project mutation (`kaola-workflow-cursor-surface.js` `inspectAuthority` / `installProject`). That is loud refuse, not a silent overwrite. Issue #1052 does not claim a GitLab-shaped global plus GitLab Next must materialize `--forge=gitlab` through claim.js. The github helper default is documented and pinned by the 1052 suite's github global install. Observation only.

did_not_touch: `kaola-workflow/bundle-1051`, `.kw/worktrees/bundle-1051`, Runner, candidate production files (review-only).

finding: id=R1 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=gitlab-gitea-next-unknown-flag
finding: id=R2 scope=in_scope action=fix status=resolved severity=medium fix_role=tdd-guide rationale=next-prose-getRoot-locator
verdict: pass
findings_blocking: 0
review_conclusion: Frozen candidate 2cae8caa closes prior R1 and R2: GitLab Gitea and Codex claim.js accept generated CLI identity flags, generated Next names cursor-workspace and recorded main_root, and focused 141-assertion plus three-forge oracle evidence is green with no remaining blocking defect on this SHA.
