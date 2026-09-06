# C4 README retarget — Issue #1052 comment 5561551896

role: tdd-guide (test custody only)
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
suite: `scripts/test-issue-1052-cursor-cli-startup-prep.js`
command: `node scripts/test-issue-1052-cursor-cli-startup-prep.js` (cwd = worktree)
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: production `claim.js`, `kaola-workflow/bundle-1051`
did_not_restore: operator-export / gated-env / “do not inherit CLI ensure” README pins
did_not_weaken: collision/readonly/identity/spaced-path/first-fence pins

## What changed (C4 only)

`#1052-c4-readme-prep` now requires startup + resume + `--ensure-target` + `Cursor CLI` + (`CLI/local` or `product=cli`). It no longer requires `--product cli` / `--host local` argv stamps or `CURSOR_PRODUCT` export docs.

`#1052-c4-readme-app-cloud` now requires `--worker-dir` plus App-like / App/Cloud / App-started Cloud plus skip/skips/must not/does not/do not … ensure. It no longer requires the inherit/infer/apply phrase.

Current README sentences that satisfy them:

- CLI/local prep: living ancestor `--workspace` stamps `product=cli`, `host=local`, and runs installed `--ensure-target` before the single claim.
- App-like boundary: `--worker-dir` without `--workspace` is App-like and skips ensure.

## Run

`issue-1052 cursor CLI startup/resume prep passed (241 assertions).`
spawn-census: `{"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":680}`
exit: 0
failures: **0**
passed: **241**

This is the C4 regex matching the retired-operator-export README. It is not a new production identity/locator verdict; those nine pins were already reported GREEN on the current production tree before this retarget.
