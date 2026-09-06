# Acceptance — Issue #1052 port matching-authority retarget (comment 5561808292)

role: tdd-guide (test custody only)
HEAD: `57df4125a1b765acaf9892755757ee91a5bccaad` (dirty only `scripts/test-issue-1052-cursor-cli-startup-prep.js`)
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
suite: `scripts/test-issue-1052-cursor-cli-startup-prep.js`
command: `node scripts/test-issue-1052-cursor-cli-startup-prep.js` (cwd = worktree)
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: production `claim.js` (any of the four trees), helper default, `kaola-workflow/bundle-1051`
did_not_weaken: `#1052-generated[gitlab|gitea]-mismatched-github-claim` or `#1052-port[gitlab|gitea]-mismatched-github-claim` (`stale_forge` still required)
did_not_restore: GitLab/Gitea helper `--forge` default `github`

## Fixture retarget

Older `#1052-port[gitlab]` / `#1052-port[gitea]` (and siblings) no longer drive named claim.js against `makeSandbox('github')`. Each port uses `getAuthority(port.forge)` → isolated `install-cursor.sh --global --forge=<edition>`. GitHub ports stay on github. Helper-control twin uses `--forge=` + `port.forge`, not hardcoded github.

Mismatch remains: github `kaola-workflow-claim.js` against gitlab/gitea isolated authority must refuse `cursor_prep_failed` / `stale_forge`.

## Run

- failures: **0**
- passed: **251**
- spawn-census: `{"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":710}`
- exit: 0
- footer: `issue-1052 cursor CLI startup/resume prep passed (251 assertions).`

This run is the retargeted port + generated matching-authority surface after production already spawned matching `--forge=gitlab|gitea|github` from the claim tree. It is not a waiver of `stale_forge` mismatch. Stop.
