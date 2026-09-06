# Code review — Issue #1052 frozen candidate

candidate: SHA `4212d44a912363e205b24090e0977aff97500e93` on `workflow/issue-1052`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
compare: `main` `05b67a8ca096ee9661d06c0393aacb97eaf3d31d`
surface: `isCursorCliLocalWorkflowPath`, `resolveCursorCliEnsureTarget`, `ensureCursorCliLocalPrep`, generated Next/Finalize, test custody, docs vs source
reviewed: 2026-09-07
did_not_run: focused 1052 suite / full chains (admitted defects short-circuit that run)

## Admitted findings

### R1 — HIGH — GitLab/Gitea generated Next cannot execute claim/resume

- failure_class: generated-operator-path / unknown_flag
- severity: high
- file: `scripts/sync-cursor-edition.js` (primary); `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`; `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- trigger: `install-cursor.sh --forge=gitlab` (or gitea), then follow generated Next startup/resume as written
- expected: explicit `--runtime cursor --product cli --host local` is a known identity pair; claim/resume proceeds; CLI/local prep may run
- observed: forge claim.js refuses before any subcommand body with `reason: unknown_flag`, `unknownFlags: ["--product","--host"]`, exit 1, zero mutation
- reproducible:
  1. Isolated render: `node scripts/sync-cursor-edition.js --write --tree-root=<empty> --forge=gitlab`
  2. Generated `.cursor-gitlab/commands/workflow-next.md` binds `CLAIM_JS` to `kaola-gitlab-workflow-claim.js` and emits `node "$CLAIM_JS" startup --runtime cursor --product cli --host local --target-issues ...` plus `node "$CLAIM_JS" resume --runtime cursor --product cli --host local`
  3. Direct execution against the shipped port:
     `node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js startup --target-issue 1 --runtime cursor --product cli --host local --json`
     stdout: `{"result":"refuse","reason":"unknown_flag","unknownFlags":["--product","--host"],...}` exit 1
     Same for `kaola-gitea-workflow-claim.js`
- why guards do not prevent: `transformCommandBody` stamps those flags on every forge's `workflow-next.md`. Only GitHub `scripts/kaola-workflow-claim.js` added `product`, `host`, and `cursorWorkspace` to `KNOWN_VALUE_FLAGS`. GitLab/Gitea claim.js remain hand-ports without those names; `main()` unknown_flag refusal runs before `cmdStartup`/`cmdResume`. Issue-1052 tests spawn only GitHub `scripts/kaola-workflow-claim.js`. Cursor-edition G7/oracle checks generated Next bytes, not that the named claim.js accepts the flags.
- action: pin a failing GitLab/Gitea Next-to-claim.js oracle, then port identity flags and prep into the forge claim scripts (or stop stamping CLI identity onto those Next surfaces until the ports exist)

### R2 — MEDIUM — generated Next still names getRoot() as the ensure target

- failure_class: generated-surface / locator-mismatch
- severity: medium
- file: `scripts/sync-cursor-edition.js` `cursorCliStartupResumePrepProse()` (generated Next appendix)
- trigger: read generated Cursor `workflow-next.md` after `sync-cursor-edition.js --write`; compare to `resolveCursorCliEnsureTarget`
- expected: Next reflects the program locator: `--cursor-workspace` when set, else recorded `main_root` on resume, else invoking `getRoot()` on first claim
- observed: Next says Repo prep runs `--ensure-target` "against the CLI workspace (`git rev-parse --show-toplevel`)" with no `--cursor-workspace` / `main_root`. That parenthetical is the write-worktree/cwd git toplevel, which the host-identity repair removed from the executable resume path.
- evidence: isolated GitHub Next line: `` `--ensure-target` transaction against the CLI workspace (`git rev-parse --show-toplevel`). `` vs `scripts/kaola-workflow-claim.js` `resolveCursorCliEnsureTarget` (explicit locator, then `folder.main_root` on `cmdResume`, then invoking root). User-visible docs (`docs/api.md`, `docs/cursor-edition.md`, `docs/architecture.md`, `docs/runtime-capabilities.md`, CHANGELOG) were retargeted; the generator prose was not. The isolated `--cli-materialization-oracle` does not assert locator text, so GREEN does not prove Next matches source.
- action: retarget Next prose to the real locator; pin that Next must not describe cwd/`git rev-parse --show-toplevel` as the known CLI workspace on resume

## What was checked and not admitted

GitHub `isCursorCliLocalWorkflowPath` is true only for normalized `cursor`+`cli`+`local`. Omitted/unknown/incomplete/app/cloud skip ensure and still claim/resume. `ensureCursorCliLocalPrep` spawns the installed helper, fail-closes on missing helper / nonzero / invalid status, and does not claim. Resume uses recorded `main_root` unless `--cursor-workspace` is set. Finalize keeps one `--ensure-target "$PWD"` line without CLI identity flags. Issue-1052 positives vs negatives and the Next/Finalize split match that GitHub executable path. Docs match GitHub source. No remaining GitHub path was found where unknown identity still writes, or where resume-from-worktree still targets `getRoot()` in `claim.js`.

Observation (not admitted): Cursor App/Cloud load the same generated Next whose only startup/resume bash lines pass `--product cli --host local`. Host negatives live in a later prose section; the locked Next oracle requires those flags on the claim.js lines. That is a shared-file coupling, not a silent argv inference in `claim.js`.

Observation (not admitted): `args.forge || 'github'` in GitHub `ensureCursorCliLocalPrep` cannot be passed as `--forge` (`forge` is not a known claim.js flag). GitLab/Gitea never reach spawn because of R1.

did_not_touch: `kaola-workflow/bundle-1051`, `.kw/worktrees/bundle-1051`, Runner, tests (not weakened), candidate production files.

finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=gitlab-gitea-next-unknown-flag
finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=next-prose-getRoot-locator
verdict: fail
findings_blocking: 2
review_conclusion: Frozen candidate 4212d44a fails review: GitLab and Gitea generated Next stamp CLI identity flags that those forge claim.js ports refuse as unknown_flag, and generated Next still names git rev-parse --show-toplevel as the ensure target after resume was repaired to recorded main_root.
