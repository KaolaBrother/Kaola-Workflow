# Acceptance RED — Issue #1052 forge ports (R1/R2)

custody: tdd-guide (test artifact only; no production edits)
baseline HEAD: `4212d44a912363e205b24090e0977aff97500e93`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`, full `node scripts/test-cursor-edition.js` (only `--cli-materialization-oracle`)
did_not_touch: `kaola-workflow/bundle-1051`, `.kw/worktrees/bundle-1051`, any production/source file

## Files changed

- `scripts/test-issue-1052-cursor-cli-startup-prep.js` — drive named claim.js ports (Codex GitHub copy, GitLab, Gitea) with the same CLI/local identity and locator boundary as the existing GitHub `scripts/kaola-workflow-claim.js` suite
- `scripts/test-cursor-edition.js` — locator oracle on generated Next; isolated `--cli-materialization-oracle` now writes github/gitlab/gitea `--tree-root` trees; spawns the named forge claim.js with generated `--product cli --host local`; G2 mutation pins for `git rev-parse --show-toplevel` / missing `--cursor-workspace`+`main_root`

Existing GitHub 1052 assertions were not weakened. Collision/App/readonly/fail-closed/host-identity negatives on `scripts/kaola-workflow-claim.js` remain.

## New pins

### Generated Next (must not dodge unknown_flag by dropping flags)

Isolated `sync-cursor-edition.js --write --forge=<github|gitlab|gitea> --tree-root=<empty>` still requires executable `$CLAIM_JS` startup/resume lines to pass `--runtime cursor --product cli --host local`. GREEN cannot drop those flags.

### Named claim.js accepts those flags and runs Repo prep

Real binaries, not helpers-as-subject:

- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (COMMON_SCRIPTS Codex GitHub copy)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`

On explicit CLI/local identity they must not return `reason: unknown_flag` for `--product`/`--host`/`--cursor-workspace`. They must acquire/resume and run the installed `--ensure-target` write set. Omitted/unknown/incomplete/App identity must still claim/resume without extra Repo writes. Resume from a write-worktree cwd must prep recorded `main_root`. `--cursor-workspace` wins over decoy cwd.

### Next locator prose (R2)

`cursorCliMaterializationVerdict` Next appendix must name `--cursor-workspace` and recorded `main_root`, and must not name `git rev-parse --show-toplevel` as the CLI workspace. Isolated oracle mutations keep that from going GREEN by ignoring locator text.

## RED counts on 4212d44a

### `node scripts/test-issue-1052-cursor-cli-startup-prep.js`

- **90 passed, 51 failed**, exit 1
- Existing GitHub `scripts/kaola-workflow-claim.js` surface remains in the passing set (57 prior assertions plus port-side negatives that do not pass `--product`/`--host`)
- **51 new RED** are the named-port identity/prep/locator drives (17 per port × 3 ports)

Failure signature (same class on all three named binaries):

```
RED: #1052-port[gitlab]-startup-flags — unknown_flag, unknownFlags: ["--product","--host"]
RED: #1052-port[gitea]-startup-flags — unknown_flag, unknownFlags: ["--product","--host"]
RED: #1052-port[codex-github]-startup-flags — unknown_flag, unknownFlags: ["--product","--host"]
baseline: 4212d44a912363e205b24090e0977aff97500e93
```

Follow-on RED on the same refuse (prep never runs): `-startup-empty` acquire/ensure/write-set; `-resume-flags` / `-resume` prep; `-worktree-cwd` recorded `main_root`; `-cursor-workspace` locator; App/incomplete identity still `unknown_flag` instead of claim-without-ensure.

### `node scripts/test-cursor-edition.js --cli-materialization-oracle`

Exit 1. Generated Next for github/gitlab/gitea still stamps CLI identity flags (those identity checks did not fire). Locator + named claim.js refused:

```
RED: [gitlab] workflow-next: generated Next names git rev-parse --show-toplevel as the CLI workspace
RED: [gitlab] workflow-next: generated Next does not name --cursor-workspace as the explicit CLI workspace locator
RED: [gitlab] workflow-next: generated Next does not name recorded main_root as the resume ensure locator
RED: [gitlab] named claim.js refused generated CLI identity flags: reason unknown_flag, unknownFlags ["--product","--host"]
```

Same four signatures for `[github]` (Codex plugin claim.js) and `[gitea]`.

## What remains unexecuted

- Full `test-cursor-edition.js` (G2/G7/G8 live `--write` into TREE_ROOT). Locator checks are in `cursorCliMaterializationVerdict`, so G2/G7 would inherit them; that full process was not run here.
- Producer chains and the integration walkthrough (forbidden by brief).
- Live Cursor CLI Task catalog / `new_process_same_chat` reload (not a machine check in this custody).
- Installed helper `--ensure-target --forge=gitlab|gitea` against a github-only `--global` authority (`stale_forge`). Port prep is pinned against the same github global authority the existing 1052 suite installs; forge-shaped installer materialization stays G8.

Stop. Production claim.js / `sync-cursor-edition.js` generator prose were not edited.
