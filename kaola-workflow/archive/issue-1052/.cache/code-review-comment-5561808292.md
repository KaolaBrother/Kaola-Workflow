# Code review — Issue #1052 comment 5561808292 (matching-authority helper --forge=)

behavior: code-reviewer
profile: code-reviewer
context: issue-1052
claim: issue-1052
surface: isolated install-cursor.sh --global --forge=<edition> then generated Next first unstamped fence plus named claim.js
candidate: SHA `d852a2be0e17b00e6175f8a328785cab1c30202d` on `workflow/issue-1052`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
binding:
- https://github.com/KaolaBrother/Kaola-Workflow/issues/1052#issuecomment-5561808292 (later; wins)
- https://github.com/KaolaBrother/Kaola-Workflow/issues/1052#issuecomment-5561551896
- https://github.com/KaolaBrother/Kaola-Workflow/issues/1052#issuecomment-5561181849
- https://github.com/KaolaBrother/Kaola-Workflow/issues/1052#issuecomment-5560806842
stale_prior_pass: SHA `5d4b0a90` and SHA `57df4125` PASS files are stale for helper `--forge=` bytes
reviewed: 2026-09-07
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: candidate production files, tests, `kaola-workflow/bundle-1051`
did_not_copy: github helper or github claim.js into gitlab/gitea isolated CURSOR_HOME
did_not_invent: CURSOR_PRODUCT, CURSOR_HOST, KAOLA_CURSOR_*, CURSOR_WORKSPACE
did_not_weaken: stale_forge
did_not_require: operator claim.js `--forge`

## HEAD

`git rev-parse HEAD` = `d852a2be0e17b00e6175f8a328785cab1c30202d` on `workflow/issue-1052`. Clean worktree.

Candidate vs `57df4125`: one commit, `fix(cursor): pass each edition forge into ensure-target`. Each claim tree hardcodes its install-authority forge in `ensureCursorCliLocalPrep` (`github` / `gitlab` / `gitea`). `--forge` is not in claim.js `KNOWN_VALUE_FLAGS`. Helper `stale_forge` still compares `receipt.forge !== forge`.

## Required drive

Independent driver: `/tmp/kw-1052-rev-d852a2be/drive.js`. Run root: `/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kw-1052-rev-d852a2be-ldjs62`. Living parent: `fake-cursor-cli/2026.09.02-c22c1a3/index.js` spawnSync bash (no exec-replace).

For each of github, gitlab, gitea:

1. Isolated `install-cursor.sh --global --yes --forge=<that edition>` into a disposable CURSOR_HOME. Install status 0. Named claim.js present under that home (`kaola-workflow-claim.js` / `kaola-gitlab-workflow-claim.js` / `kaola-gitea-workflow-claim.js`). GitLab and Gitea homes did not contain github-named claim.js. Authority receipt `cursor-authority.json` records `forge` matching the edition (`github` / `gitlab` / `gitea`).
2. Generated that forge's Next via `sync-cursor-edition.js --write --forge=<edition> --tree-root=<isolated>`.
3. Living CLI-shaped parent `--workspace <opened> --model cursor-grok-4.6-xhigh`. No invented CURSOR_PRODUCT / KAOLA_CURSOR_* / CURSOR_WORKSPACE.
4. Drove the generated first unstamped startup fence `node "$CLAIM_JS" startup --runtime cursor --target-issues "$KAOLA_TARGET_ISSUES"` plus that forge's installed named claim.js.

Matching-authority CLI-positive (all three): status 0, `claim=acquired`, `cursor_prep.status=materialized`, agents on the opened dir, not `cursor_prep_failed`, not `stale_forge`. One startup invocation (no second gated fence).

Generated Next shape (all three): first fence unstamped; resume is one unstamped `node "$CLAIM_JS" resume --runtime cursor`; no `cursorCliHostGateOpen`; no `CURSOR_PRODUCT:-` / `KAOLA_CURSOR_PRODUCT:-` host gate; zero stamped `--product cli --host local` operator fences.

## Mismatch still fail-closed

github claim.js against isolated gitlab authority: refuse `cursor_prep_failed` / `stale_forge`.
github claim.js against isolated gitea authority: same.
gitlab claim.js against isolated github authority: same.
gitea claim.js against isolated github authority: same.

Operator `claim.js --forge <edition>` is `unknown_flag` on all three installed named scripts. Matching-authority prep does not require that flag.

## Identity and locator still hold (all three editions)

unrelated-tool `--workspace <repo>`: acquire, no project agents, no `cursor_prep.status=materialized`.
`--worker-dir` without `--workspace`: same non-writing.
`--workspace` plus `--worker-dir`: same non-writing (does not take the workspace branch first).
Spaced `--workspace` full dir: prep target equals the full realpath; truncated prefix decoy received no agents. Host `ps -ww -p PID -o args=` on this Darwin living parent is unquoted.
Cold CLAIM_JS unset and CLAIM_JS="": Resume fence still invoked the named installed claim.js `resume --runtime cursor`.

## Probe miss (not a finding)

Driver first looked for `install-receipt.json` and recorded empty `receipt.forge`. Actual authority file is `cursor-authority.json` with the matching forge. Matching CLI-positive and mismatch `stale_forge` already proved the receipts.

## Tests in the candidate

`scripts/test-issue-1052-cursor-cli-startup-prep.js` retargets `#1052-port[*]` and generated matching-authority cases onto `getAuthority(port.forge)` isolated `--forge=<edition>`. Mismatch pins remain: github claim.js against gitlab/gitea isolated authority must `stale_forge`.

verdict: pass
findings_blocking: 0
review_conclusion: Frozen d852a2be closes comment 5561808292: each edition isolated --global --forge then generated first unstamped fence plus named claim.js preps without stale_forge, and mismatched github versus gitlab or gitea authority still fail-closed.
