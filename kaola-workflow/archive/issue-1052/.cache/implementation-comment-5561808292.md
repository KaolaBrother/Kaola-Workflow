# Implementation — Issue #1052 comment 5561808292 (matching-authority helper `--forge=`)

role: implementer (production only)
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
HEAD: `57df4125a1b765acaf9892755757ee91a5bccaad` plus uncommitted claim.js edition `--forge=` + docs
binding: https://github.com/KaolaBrother/Kaola-Workflow/issues/1052#issuecomment-5561808292
did_not_edit: tests (`scripts/test-issue-1052-cursor-cli-startup-prep.js` remains dirty from test custody only), Runner, sessionStart, rendered Cursor mirrors by hand, `kaola-workflow/bundle-1051`, helper `stale_forge`
did_not_add: operator/Runner claim.js `--forge` flag
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_weaken: `stale_forge` (GitHub `kaola-workflow-claim.js` against isolated gitlab/gitea authority still fail-closed)

## task

GitLab/Gitea `ensureCursorCliLocalPrep` spawned the installed helper with `--forge=<args.forge||'github'>`. Isolated `install-cursor.sh --global --forge=gitlab` (and gitea) then generated CLI-positive entry failed `stale_forge`. Pass each edition’s install-authority forge in Workflow’s own helper spawn, not as an operator flag.

## verification tier

Not `tests-green` for the whole focused file. The eight later-wins matching-authority names are GREEN. Mismatch `stale_forge` pins are GREEN. Isolated `--cli-materialization-oracle` GREEN. `validate-script-sync.js` GREEN.

The same suite now exits 1 on **18** older `#1052-port[gitlab]` / `#1052-port[gitea]` assertions (finding below). Those cases still drive GitLab/Gitea claim.js against the outer GitHub-authority sandbox (`makeSandbox('github')`). That is the masked default the later-wins comment forbids. Tests were not edited.

## files changed

- `scripts/kaola-workflow-claim.js` — helper spawn `--forge=github` (edition identity, not `args.forge`)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — COMMON_SCRIPTS Codex copy via `npm run sync:editions`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — `--forge=gitlab`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — `--forge=gitea`
- `docs/api.md`, `docs/cursor-edition.md`, `docs/architecture.md`, `docs/runtime-capabilities.md`, `CHANGELOG.md` — document edition-authority helper spawn; `--forge` is not a claim.js operator flag

Production behavior:

1. Each claim tree’s `ensureCursorCliLocalPrep` passes that tree’s `install-cursor.sh --forge=` identity to the installed helper.
2. Identity/locator/unstamped first fence/Resume `CLAIM_JS` behavior is unchanged.
3. GitHub claim.js against gitlab/gitea isolated authority still `stale_forge`.
4. GitLab/Gitea claim.js against a GitHub-authority install now also `stale_forge` (correct mismatch). No operator `--forge` on claim.js.

## verification commands

cwd = worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`

```
node scripts/test-issue-1052-cursor-cli-startup-prep.js
# before: exit 1; 8 failure(s), 238 passed
# after:  exit 1; 18 failure(s), 228 passed
# GREEN (later-wins 8 matching-authority names; not in FAIL list):
#   #1052-generated[gitlab]-c1-first-claim-cli-matching-authority
#   #1052-generated[gitlab]-c2-cli-opened-worktree
#   #1052-generated[gitlab]-c2-main-cli-other-cwd
#   #1052-generated[gitlab]-c2-spaced-workspace-full
#   #1052-generated[gitea]-c1-first-claim-cli-matching-authority
#   #1052-generated[gitea]-c2-cli-opened-worktree
#   #1052-generated[gitea]-c2-main-cli-other-cwd
#   #1052-generated[gitea]-c2-spaced-workspace-full
# GREEN: mismatched-github-claim stale_forge pins (not in FAIL list)
# NEW FAIL (GitHub-authority sandbox + named GitLab/Gitea claim.js; 9+9):
#   #1052-port[gitlab]-startup-empty (3), -resume (2), -worktree-cwd (2), -cursor-workspace (2)
#   #1052-port[gitea]-startup-empty (3), -resume (2), -worktree-cwd (2), -cursor-workspace (2)
# spawn-census after: {"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":696}

node scripts/test-cursor-edition.js --cli-materialization-oracle
# after: exit 0
# CLI-MATERIALIZATION-ORACLE GREEN: Next CLI identity vs App/Cloud shared-file, --cursor-workspace operator argv, named claim.js flags, locator, and Finalize pre-dispatch ensure

npm run sync:editions
# after: exit 0
# codex-sync plugins/kaola-workflow/scripts/kaola-workflow-claim.js
# edition-sync: write complete (1 file(s) updated).

node scripts/validate-script-sync.js
# after: exit 0
# OK: 14 common scripts, 25 byte-identical groups, 0 rename-normalized families, 2 hooks.json families (config + hooks dir), and 5 forge export-superset families in sync.
```

Unexecuted: `npm test`, `:claude:full`, walkthrough.

## before

Focused suite: exit 1; **8 fail / 238 pass**. The eight matching-authority GitLab/Gitea CLI-positive names RED with `cursor_prep_failed` / `stale_forge` as in `acceptance-red-comment-5561808292.md`. GitHub matching-authority and mismatch pins were already among the 238.

## after

Focused suite: exit 1; **18 fail / 228 pass**. The eight matching-authority names are GREEN. Mismatch `stale_forge` pins remain GREEN. Isolated oracle GREEN. script-sync GREEN.

## finding (test custody)

`#1052-port[gitlab]` and `#1052-port[gitea]` still use the outer GitHub-authority `sandbox` while executing `kaola-gitlab-workflow-claim.js` / `kaola-gitea-workflow-claim.js`. That only passed while helper spawn defaulted to `github`. Comment 5561808292: GitHub-authority installs must not stand in for GitLab/Gitea; matching isolated `--forge=<edition>` is the authority. Satisfying those 18 assertions in production would require GitLab/Gitea claim.js to send `--forge=github` again (the defect) or weakening `stale_forge`. Neither is in scope. Retarget those port cases onto matching isolated authorities (same pattern as `makeSandbox(port.forge)` in the generated matching-authority block). Implementer did not edit the suite.

This is working evidence for the eight matching-authority names and the edition `--forge=` spawn, not a freeze or full-suite green.
