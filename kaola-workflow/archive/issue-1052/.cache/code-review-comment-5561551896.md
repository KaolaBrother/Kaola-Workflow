# Code review — Issue #1052 comment 5561551896 (identity + spaced locator)

behavior: code-reviewer
profile: code-reviewer
context: issue-1052
claim: issue-1052
surface: generated Cursor Next default executable startup/resume vs Issue comments
candidate: SHA `5d4b0a90aa5650f2842f8bd6310235c684ed6721` on `workflow/issue-1052`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
binding:
- https://github.com/KaolaBrother/Kaola-Workflow/issues/1052#issuecomment-5560806842
- https://github.com/KaolaBrother/Kaola-Workflow/issues/1052#issuecomment-5561181849
- https://github.com/KaolaBrother/Kaola-Workflow/issues/1052#issuecomment-5561551896 (later; wins)
prior_fail: `kaola-workflow/issue-1052/.cache/code-review-comment-5560806842.md` on SHA `ba368eab` (C1/C2 open)
reviewed: 2026-09-07
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: `kaola-workflow/bundle-1051`, `.kw/worktrees/bundle-1051`, tests, candidate production files
did_not_mutate: user consumer repos; live CLI/App processes were inspect-only for selected non-secret fields
did_not_treat_as_verdict: focused 241 GREEN, `--cli-materialization-oracle` GREEN

## What this review is

Comment 5561551896 requires independent identity and locator review of the ancestor resolver on the same C1/C2 surface: generic unrelated-tool `--workspace` is not CLI; `--workspace` plus `--worker-dir` must not take the workspace branch first; Darwin unquoted `ps args=` spaced `--workspace` must prep the full opened dir. Living parent argv must not be exec-replaced. Normal generated entry remains the unstamped first fence plus in-process stamp. Residual `cursorCliHostGateOpen` / second gated stamped startup must be gone. Cold resume must resolve named claim.js when `CLAIM_JS` is unset/empty. README remains required. R1 four-tree flags remain required.

Later comment wins over earlier text. Prior PASS files on earlier SHAs are stale if bytes/meaning changed. The ba368eab consumer-route FAIL is the previous verdict this SHA claims to close.

## How the generated consumer was produced and driven

1. Confirmed `git rev-parse HEAD` = `5d4b0a90aa5650f2842f8bd6310235c684ed6721`.
2. `node scripts/sync-cursor-edition.js --write --tree-root=/tmp/kw-1052-rev-5d4b0a90/gen-{github,gitlab,gitea} --forge={github,gitlab,gitea}`.
3. Isolated `install-cursor.sh --global --yes` into disposable `CURSOR_HOME` (github authority). Named claim.js plus required siblings copied under `$CURSOR_HOME/kaola-workflow/scripts/` so generated `kaola_script` resolves gitlab/gitea names. Empty git consumers. `KAOLA_WORKFLOW_OFFLINE=1` plus existing GH/GL/tea mocks. No controller pre-export of `CURSOR_PRODUCT` / `CURSOR_HOST` / `KAOLA_CURSOR_*` / `CURSOR_WORKSPACE`.
4. Drove emitted default bash fences from generated `workflow-next.md`: first "then claim it" startup, and compact-recovery Resume. Subject is generated commands plus named claim.js, not `claim.js --product app`.
5. Living parent argv kept alive (no exec-replace): `node …/2026.09.02-c22c1a3/index.js --workspace <opened> --model cursor-grok-4.6-xhigh`.
6. Inspected standalone CLI pid 94434 selected non-secret fields only. Did not print secrets. Did not infer CLI from sibling `agent` or `CURSOR_INVOKED_AS`.

Driver artifacts: `/tmp/kw-1052-rev-5d4b0a90/` (not the candidate).

## Generated Next shape (all three forges)

First then-claim-it fence is unstamped:

`node "$CLAIM_JS" startup --runtime cursor --target-issues "$KAOLA_TARGET_ISSUES"`

Resume is one fence: `kaola_script` / `CLAIM_JS=` then `node "$CLAIM_JS" resume --runtime cursor`. No `cursorCliHostGateOpen`. No `CURSOR_PRODUCT:-` / `KAOLA_CURSOR_PRODUCT:-` host gate. Zero stamped `--product cli --host local` operator fences.

## Real CLI provenance (selected non-secret fields)

Standalone CLI pid 94434 argv shape: `cursor-agent …/2026.09.02-c22c1a3/index.js --workspace /Users/ylpromax5/Workspace/Kaola-Workflow --model cursor-grok-4.6-xhigh`.

Gate names `CURSOR_PRODUCT`, `CURSOR_HOST`, `KAOLA_CURSOR_PRODUCT`, `KAOLA_CURSOR_HOST`, `CURSOR_WORKSPACE` are absent from that process env-name scan. `CURSOR_INVOKED_AS` is present and is not a CLI discriminator. Demonstrated runtime context remains argv `--workspace <opened dir>`.

App worker pid 39473 uses `--worker-dir`, not `--workspace`, and also carries a credential flag; the value was not reproduced.

## Driven cases

CLI-positive (github isolated global install; gitlab/gitea named claim.js against that same github authority): one unstamped startup; `cursor_prep` present (`materialized`); project agents on the opened dir; prep target equals `--workspace`. Independent worktree: agents on that worktree, not main. Main-open plus other-worktree cwd: agents on opened main, not cwd worktree.

Unrelated-tool `--workspace <repo>`: acquire without `cursor_prep.status=materialized` and without project agents.

Both `--workspace` and `--worker-dir`: same non-writing App-like outcome.

App `--worker-dir` without `--workspace`: same non-writing outcome.

Spaced opened dir on this Darwin host: measured `ps -ww -p PID -o args=` is unquoted (`--workspace /private/tmp/kw-1052-rev-5d4b0a90/kaola workspace with spaces-github --model …`). Naive whitespace tokenize would yield the truncated prefix `/private/tmp/kw-1052-rev-5d4b0a90/kaola`. Driven fence prepped the full realpath; truncated prefix decoy received no agents. Same full-path prep for gitlab/gitea named claim.js.

Cold resume: `CLAIM_JS` unset and `CLAIM_JS=""` still invoked named `kaola-workflow-claim.js` / `kaola-gitlab-workflow-claim.js` / `kaola-gitea-workflow-claim.js` `resume --runtime cursor`.

R1: `product`, `host`, `cursorWorkspace` accepted on github canonical, Codex COMMON_SCRIPTS copy, GitLab hand-port, and Gitea hand-port (`status` did not return `unknown_flag`).

C4: README documents the unstamped generated route, demonstrated CLI ancestor plus `--workspace`, unrelated-tool skip, `--worker-dir` App-like skip, Darwin unquoted remainder, and the absence of `cursorCliHostGateOpen`. It does not require operator export of `CURSOR_PRODUCT=cli`.

## Observation (not blocking)

`install-cursor.sh --global --forge=gitlab` (and gitea) then the same CLI-positive generated fence refuses `cursor_prep_failed` / `stale_forge`, because all four claim trees pass helper `--forge=github` when `args.forge` is omitted. The brief's isolated `--global` install is the github-authority path; comment 5561551896 did not retarget that helper default. Recorded so the orchestrator sees it; not admitted as a candidate-caused identity/locator defect.

finding: id=R1 scope=in_scope action=fix status=resolved severity=high fix_role=implementer rationale=forge-port-unknown-flag
finding: id=R2 scope=in_scope action=fix status=resolved severity=medium fix_role=implementer rationale=next-names-git-toplevel
finding: id=C1 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=normal-generated-entry-skips-cli-prep
finding: id=C2 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=default-fence-omits-cli-workspace
finding: id=C3 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=cold-resume-claim-js-unbound
finding: id=C4 scope=in_scope action=fix status=resolved severity=medium fix_role=doc-updater rationale=readme-omits-user-visible-prep
verdict: pass
findings_blocking: 0
review_conclusion: Frozen 5d4b0a90 closes comments 5560806842, 5561181849, and 5561551896 on the generated Next default path: living CLI-shaped ancestor plus --workspace preps before the single unstamped claim, unrelated-tool and worker-dir stay non-writing, and Darwin unquoted spaced argv reconstitutes the full opened dir.
