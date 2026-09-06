# Acceptance RED — Issue #1052 comment 5561808292 (matching-authority stale_forge)

role: tdd-guide (test custody only)
baseline: `57df4125a1b765acaf9892755757ee91a5bccaad` (HEAD after merge; dirty only `scripts/test-issue-1052-cursor-cli-startup-prep.js`)
`git rev-parse HEAD`: `57df4125a1b765acaf9892755757ee91a5bccaad`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
suite: `scripts/test-issue-1052-cursor-cli-startup-prep.js`
command: `node scripts/test-issue-1052-cursor-cli-startup-prep.js` (cwd = worktree)
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: production `claim.js` (any of the four trees), `kaola-workflow/bundle-1051`, mission-list done rows
did_not_weaken: `stale_forge` (mismatched github claim.js against gitlab/gitea isolated authority still fail-closed), App `--worker-dir`, unknown without `--workspace`, first-fence CLI-positive living parent, C3 cold `CLAIM_JS`, C4 README, prior CLI identity / spaced-path / first-fence pins
did_not_invent: operator/Runner `--forge` on claim.js as the proof

comments: 5561808292 (later-wins) / 5561551896 / 5561181849 / 5560806842

## Counts

- failures: **8**
- passed: **238**
- spawn-census: `{"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":696}`
- exit: 1
- footer: `issue-1052 cursor CLI startup/resume prep FAILED: 8 failure(s), 238 passed.`

GitHub isolated `--global --forge=github` + generated github Next first fence + `kaola-workflow-claim.js` CLI-positive living parent `--workspace` remains among the 238 (GREEN). App/unknown/generic-workspace/`--workspace`+`--worker-dir`/C3/C4 and mismatched-forge `stale_forge` pins also remain among the 238.

## Subject

Each edition’s actual isolated install authority:

- GitHub: `install-cursor.sh --global --forge=github` + generated github Next first unstamped fence + `kaola-workflow-claim.js`
- GitLab: `install-cursor.sh --global --forge=gitlab` + generated gitlab Next first unstamped fence + `kaola-gitlab-workflow-claim.js`
- Gitea: `install-cursor.sh --global --forge=gitea` + generated gitea Next first unstamped fence + `kaola-gitea-workflow-claim.js`

Living parent: `…/2026.09.02-c22c1a3/index.js --workspace <opened> --model cursor-grok-4.6-xhigh` (no invented `CURSOR_PRODUCT` / `KAOLA_CURSOR_*` / `CURSOR_WORKSPACE`; no claim.js `--forge`).

## RED (comment 5561808292 — matching-authority CLI-positive)

```
RED: #1052-generated[gitlab]-c1-first-claim-cli-matching-authority
  isolated install-cursor.sh --global --forge=gitlab
  + generated gitlab Next first unstamped fence
  + kaola-gitlab-workflow-claim.js living parent --workspace
  expected prep (cursor_prep materialized|current; agents on opened dir)
  got status=1 json={"result":"refuse","reason":"cursor_prep_failed","claim":"none","diagnostic":"cursor-surface: installed global Cursor authority is missing or stale (stale_forge)"}

RED: #1052-generated[gitlab]-c2-cli-opened-worktree
  same matching-authority CLI-positive; got cursor_prep_failed / stale_forge

RED: #1052-generated[gitlab]-c2-main-cli-other-cwd
  same matching-authority CLI-positive; got cursor_prep_failed / stale_forge

RED: #1052-generated[gitlab]-c2-spaced-workspace-full
  same matching-authority CLI-positive; got cursor_prep_failed / stale_forge

RED: #1052-generated[gitea]-c1-first-claim-cli-matching-authority
  isolated install-cursor.sh --global --forge=gitea
  + generated gitea Next first unstamped fence
  + kaola-gitea-workflow-claim.js living parent --workspace
  expected prep, not cursor_prep_failed/stale_forge
  got status=1 json={"result":"refuse","reason":"cursor_prep_failed","claim":"none","diagnostic":"cursor-surface: installed global Cursor authority is missing or stale (stale_forge)"}

RED: #1052-generated[gitea]-c2-cli-opened-worktree
  same matching-authority CLI-positive; got cursor_prep_failed / stale_forge

RED: #1052-generated[gitea]-c2-main-cli-other-cwd
  same matching-authority CLI-positive; got cursor_prep_failed / stale_forge

RED: #1052-generated[gitea]-c2-spaced-workspace-full
  same matching-authority CLI-positive; got cursor_prep_failed / stale_forge
```

Production cause (read-only): GitLab/Gitea hand-ports call helper `--ensure-target` with `const forge = String(args && args.forge || 'github')`, so a GitLab/Gitea authority receipt is classified `stale_forge`. Testing those named scripts against a GitHub-authority install masks it.

Repair is production custody (`claim.js` edition identity for helper `--forge=` without weakening `stale_forge` and without requiring operator/Runner `--forge` on claim.js). Stop.
