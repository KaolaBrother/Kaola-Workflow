# Implementation — Issue #1052 comment 5561551896 (identity + spaced locator)

role: implementer (production only)
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
HEAD: `ba368eabb3385bfd5e389432603a116b52524298` plus uncommitted ancestor walk + docs + tests
binding: https://github.com/KaolaBrother/Kaola-Workflow/issues/1052#issuecomment-5561551896 (later-wins), plus 5560806842 / 5561181849
did_not_edit: tests (`scripts/test-issue-1052-cursor-cli-startup-prep.js`, `--cli-materialization-oracle`), Runner, sessionStart/`--global` dual-write, rendered Cursor mirrors by hand, `kaola-workflow/bundle-1051`
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_invent: operator exports of `CURSOR_PRODUCT` / `KAOLA_CURSOR_*` / `CURSOR_WORKSPACE`
did_not_infer: CLI from sibling `agent` binary or `CURSOR_INVOKED_AS`
did_not_restore: “must set CURSOR_PRODUCT” / gated-env operator-export README (C4 left to test/docs custody)

## task

Close the nine resolver assertions (3 names × github/gitlab/gitea): generic unrelated-tool `--workspace` is not CLI; `--worker-dir` plus `--workspace` is App-like (do not take the workspace branch first); Darwin unquoted `ps args=` spaced `--workspace` must prep the full opened dir. Keep the first generated Next fence unstamped and stamp `product=cli` / `host=local` / `cursorWorkspace=<full opened dir>` in-process before the single claim. Retire the obsolete second gated startup in `scripts/sync-cursor-edition.js`. Port the same identity/locator repair to all four claim trees.

## verification tier

`tests-green` for the nine identity/locator names. Focused suite still exits 1 because of two dirty-tree C4 README regex failures left to test/docs custody (not restored). Isolated `--cli-materialization-oracle` GREEN. `npm run sync:editions` and `validate-script-sync.js` GREEN.

## files changed

- `scripts/kaola-workflow-claim.js` (canonical GitHub)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (COMMON_SCRIPTS Codex copy via `npm run sync:editions`)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (hand-port)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (hand-port)
- `scripts/sync-cursor-edition.js` (retire second gated startup after the first unstamped fence; Resume recovery fence still inlines `kaola_script` / `CLAIM_JS=` outside any `if`; leftover gated Resume stamp remains leftover, not CLI-positive startup)

Production behavior:

1. CLI identity requires a CLI-shaped executable (`…/YYYY.MM.DD-<hash>/index.js` or basename `cursor-agent`) **plus** `--workspace`. Unrelated parent argv with `--workspace` stays unknown and does not `--ensure-target`.
2. `--worker-dir` on that ancestor returns `kind: app` first (with or without `--workspace`) and skips ensure.
3. After tokenize, `--workspace` value is the remainder until the next `--<flag>` (or end), then realpath. Linux `/proc/<pid>/cmdline` NUL split is unchanged.
4. First generated fence remains `node "$CLAIM_JS" startup --runtime cursor --target-issues …`. Explicit `--product`/`--host` still win. R1 named flags (`product`, `host`, `cursorWorkspace`) stay accepted. GitLab/Gitea helper `--forge=` default remains `github` unless tests demand otherwise.
5. Finalize `--ensure-target "$PWD"` immediately before named dispatch is unchanged. sessionStart not restored.

## verification commands

cwd = worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`

```
node scripts/test-issue-1052-cursor-cli-startup-prep.js
# before: exit 1; 11 failure(s), 230 passed
# after:  exit 1; 2 failure(s), 239 passed
# GREEN: 9 resolver names (generic-workspace-not-cli, workspace-and-worker-dir, spaced-workspace-full) × github/gitlab/gitea
# still FAIL (dirty C4 README regex vs already-retargeted docs; not restored):
#   FAIL: #1052-c4-readme-prep
#   FAIL: #1052-c4-readme-app-cloud

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

Unexecuted: `npm test`, `:claude:full`, walkthrough, live CLI named Task dispatch.

## before

Focused suite (cwd = worktree): exit 1; **11 fail / 230 pass**. Nine resolver RED as in `acceptance-red-comment-5561551896.md`. Isolated oracle was already GREEN on the unstamped first fence (does not prove the nine cases).

## after

Focused suite: exit 1; **2 fail / 239 pass**. The nine identity/locator names are GREEN. The remaining two are `#1052-c4-readme-prep` and `#1052-c4-readme-app-cloud` (dirty README vs kept C4 regex). Isolated oracle GREEN. script-sync GREEN.

This is working evidence for the nine resolver cases, not a freeze or live named-dispatch proof.

## Follow-up — retire Resume host-gate / operator-export path

task: Comment 5561551896 — retire obsolete gated startup/operator-export path on Resume. Cold resume must be one unstamped `node "$CLAIM_JS" resume --runtime cursor` after inlining `kaola_script` / `CLAIM_JS=` outside any `if` (C3). Claim.js already stamps from demonstrated CLI ancestor `--workspace`. Delete unused `cursorCliHostGateOpen` / `cursorCliGatedOperatorLines` / `cursorCliOperatorIdentityArgv`. Do not restore sessionStart. Do not edit tests. Do not restore operator-export README.

verification tier: `tests-green`

files changed:
- `scripts/sync-cursor-edition.js` only (`cursorCliResumeRecoveryFence` now emits `kaola_script` + `CLAIM_JS=` + unstamped resume in one fence; removed the extra second resume fence and the three unused gated-operator helpers)

did_not_edit: tests, README, claim.js trees, sessionStart, rendered Cursor mirrors by hand

verification commands (cwd = worktree):

```
node scripts/test-issue-1052-cursor-cli-startup-prep.js
# after: exit 0
# issue-1052 cursor CLI startup/resume prep passed (241 assertions).
# spawn-census: {"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":680}
# Nine resolver names GREEN. C3 cold unset/empty GREEN (first ## Resume fence inlines CLAIM_JS outside if, then unstamped resume).
# This run: C4 README two also passed (241/0). Implementer did not restore gated-env operator-export README and did not edit tests.

node scripts/test-cursor-edition.js --cli-materialization-oracle
# after: exit 0
# CLI-MATERIALIZATION-ORACLE GREEN: Next CLI identity vs App/Cloud shared-file, --cursor-workspace operator argv, named claim.js flags, locator, and Finalize pre-dispatch ensure
```

before (this follow-up): focused suite exit 1; 2 fail / 239 pass (C4 only); nine resolver GREEN; oracle GREEN; Resume recovery fence still had `cursorCliGatedOperatorLines` + stamped `--product cli --host local --cursor-workspace "$CURSOR_WORKSPACE"`.

after: focused suite exit 0; 241 passed; oracle GREEN. Unexecuted: `npm test`, walkthrough, live CLI named dispatch.
