# Code review — Issue #1052 comments 5560806842 / 5561181849 (consumer-route)

behavior: code-reviewer
profile: code-reviewer
context: issue-1052
claim: issue-1052
surface: generated Cursor Next default executable startup/resume vs Issue comments
candidate: SHA `ba368eabb3385bfd5e389432603a116b52524298` on `workflow/issue-1052`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
binding:
- https://github.com/KaolaBrother/Kaola-Workflow/issues/1052#issuecomment-5560806842
- https://github.com/KaolaBrother/Kaola-Workflow/issues/1052#issuecomment-5561181849 (later; wins)
prior_stale_pass: `kaola-workflow/issue-1052/.cache/code-review-c1-gate-parens.md` on this same SHA
reviewed: 2026-09-07
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: `kaola-workflow/bundle-1051`, `.kw/worktrees/bundle-1051`, tests, candidate production files
did_not_mutate: user consumer repos; live CLI/App processes were inspect-only for selected non-secret fields

## What this review is

Comment 5560806842 requires independent review of the **normal generated consumer route**, not claim.js `--product app` substitutes and not an oracle that pins `--product cli --host local`. An explicit stamped argument is not truthful host identity. App/Cloud/unknown hosts must not obtain local-CLI preparation through default executable commands. The positive standalone CLI/local route must still run. The generated path must supply or preserve the workspace the CLI opened. Cold resume must resolve `CLAIM_JS`. README is required. R1 forge-port remains required.

Comment 5561181849 (later) adds: grouped host-gate parens must be re-executed; tests that pre-export `CURSOR_PRODUCT` / `KAOLA_CURSOR_*` / `CURSOR_WORKSPACE` cannot establish a **normal CLI-positive path**; inspect only selected non-secret fields on a real unchanged Cursor CLI; if the runtime does not supply those facts, Workflow must resolve identity/workspace from **demonstrated runtime context** and pass explicit values in its **own** call — not a new operator setup burden and not a silent skip of the original failure. The unstamped startup fence that still precedes the gated CLI startup means full proof is **prep before the single claim**, not a pass on the second fence.

The earlier C1-parens PASS on this SHA is stale for that meaning.

## How the generated consumer was produced and driven

1. `node scripts/sync-cursor-edition.js --write --tree-root=/tmp/kw-1052-comment-review/gen-{github,gitlab,gitea} --forge={github,gitlab,gitea}`
2. Isolated `install-cursor.sh --global --yes` into a disposable `CURSOR_HOME`. Named `kaola-workflow-claim.js` copied under `$CURSOR_HOME/kaola-workflow/scripts/`. `node` wrapped to log argv. Empty git consumer. `KAOLA_WORKFLOW_OFFLINE=1` plus the existing GH mock. No controller pre-export of invented `CURSOR_PRODUCT` / `CURSOR_HOST` / `KAOLA_CURSOR_*` / `CURSOR_WORKSPACE`.
3. Drive **emitted** default bash fences from generated `workflow-next.md`, not `claim.js --product app`.
4. Re-execute the grouped `if { A && B; } || { C && D; }; then` in a clean bash. Confirm parens; do not treat that as the consumer-route close.
5. Inspect two real unchanged standalone `cursor-agent` processes (pids 94434 Kaola-Workflow, 16915 kaolaterminal) and one App `cursor-agent-worker` (pid 39473): argv plus selected non-secret env names only. Did not print secrets. Did not mutate those processes or user repos. Did not infer CLI from a sibling `agent` binary.

## Grouped parens (comment 5561181849 first bullet) — closed as a standalone syntax defect

Generated `cursorCliHostGateOpen` is:

`if { [ "${CURSOR_PRODUCT:-}" = cli ] && [ "${CURSOR_HOST:-}" = local ]; } || { [ "${KAOLA_CURSOR_PRODUCT:-}" = cli ] && [ "${KAOLA_CURSOR_HOST:-}" = local ]; }; then`

Clean bash: unset ELSE; `CURSOR_PRODUCT=cli CURSOR_HOST=local` only THEN; KAOLA twins only THEN.

github/gitlab/gitea generated Next all carry that grouped gate. This closes the unparenthesized `((A&&B)||C)&&D` ELSE-on-CURSOR-pair bug. It does **not** close the consumer-route requirement below.

## Real CLI provenance (selected non-secret fields)

Installed `2026.09.02-c22c1a3/index.js` contains none of `CURSOR_PRODUCT`, `KAOLA_CURSOR_PRODUCT`, `KAOLA_CURSOR_HOST`, `CURSOR_WORKSPACE`. `CURSOR_HOST` appears only as a substring of unrelated `CURSOR_LOCAL_AGENT_ALLOW_CURSOR_HOST`.

Standalone CLI pid 94434 argv (redacted shape): `cursor-agent .../2026.09.02-c22c1a3/index.js --workspace /Users/ylpromax5/Workspace/Kaola-Workflow --model cursor-grok-4.6-xhigh`.

Selected env: `CURSOR_PRODUCT` absent, `CURSOR_HOST` absent, `KAOLA_CURSOR_PRODUCT` absent, `KAOLA_CURSOR_HOST` absent, `CURSOR_WORKSPACE` absent, `CURSOR_LOCAL_AGENT_ALLOW_CURSOR_HOST` absent. Present non-secret: `PWD` equals that workspace, `CURSOR_INVOKED_AS=cursor-agent`.

Standalone CLI pid 16915 (`--workspace` kaolaterminal): same absences; same `CURSOR_INVOKED_AS=cursor-agent`.

App worker pid 39473: same absences of the gate names and of `CURSOR_WORKSPACE`. Also `CURSOR_INVOKED_AS=cursor-agent`. Argv uses `--worker-dir`, not `--workspace`. `CURSOR_INVOKED_AS` is therefore not a CLI discriminator.

Demonstrated runtime context on the real CLI: argv `--workspace <opened dir>`. The generated then-arm instead reads `$CURSOR_WORKSPACE` and `$CURSOR_PRODUCT`/`$CURSOR_HOST`, which this runtime does not supply. README / docs/api.md tell the operator to export those names. Comment 5561181849 forbids turning that into a new setup burden and forbids silently skipping the original failure.

## C1 — default generated consumer route still skips CLI prep (OPEN)

failure_class: skippable-cli-prep-on-normal-generated-entry
trigger: empty disposable consumer; isolated global install; execute the first generated Next claim fence (the block the skeleton labels "then claim it") with the four gate variables and `CURSOR_WORKSPACE` unset, matching the inspected CLI.
expected: Repo `--ensure-target` prep completes before that single claim; `cursor_prep` present; project agents appear on the opened workspace.
observed: argv `startup --runtime cursor --target-issues 12571`; `claim=acquired`; `cursor_prep` absent; `.cursor/agents/implementer.md` absent.

Primary anchor: generated GitHub Next first claim fence (fence index 2 in independently generated `/tmp/kw-1052-comment-review/evidence/github-workflow-next.md` lines 122-126):

`node "$CLAIM_JS" startup --runtime cursor --target-issues "$KAOLA_TARGET_ISSUES"`

Secondary anchors:
- `scripts/sync-cursor-edition.js` `transformCommandBody`: keeps that unstamped startup, then appends a **separate** gated fence with no `else` and no `CLAIM_JS` resolver.
- Concatenate every startup/resume operator fence, same unset env: three invocations, all unstamped `--runtime cursor`; no `--product cli --host local`; no agents.
- First Resume fence, same unset env, after a claude seed: else-arm `resume --runtime cursor`; no agents; no `cursor_prep`. Compact-recovery Resume therefore also skips prep on a real CLI.
- Concatenate with invented `CURSOR_PRODUCT=cli CURSOR_HOST=local` (the suite's positive pin): argv0 is still the unstamped `startup --runtime cursor` (claim without prep); argv1 is the gated CLI startup **after** that claim. Agents appear only after later fences. Prep is not before the single claim.
- Two-shell invented CURSOR pair: first fence acquires with no agents; second gated startup fence has no resolver, so argv is `node "" startup --runtime cursor --product cli --host local --cursor-workspace  --target-issues ...` (empty `CLAIM_JS`, empty workspace). Agents still absent.
- `scripts/test-issue-1052-cursor-cli-startup-prep.js` selects `executableClaimLines(...).find(hasCliLocalIdentity)` and `hostGateEnv('cli')` / `CURSOR_WORKSPACE` extras. That is the second fence plus invented variables. Comment 5561181849: those tests cannot establish a normal CLI-positive path. Issue acceptance overrides an oracle that pins the defective call shape.
- README.md lines 157-162: "Standalone CLI/local must set `CURSOR_PRODUCT=cli` and `CURSOR_HOST=local`". That is the operator setup burden the later comment forbids. The same paragraph admits this tree does not record that Cursor CLI exports those names.

App-like unset still does not stamp cli/local (the prior App-negative repair). That is necessary and not sufficient. The positive standalone CLI/local route, driven as the generated default commands without invented env, still skips ensure. `isCursorCliLocalWorkflowPath` only becomes true on explicit `--product cli --host local`; the default fence never passes them.

This is not an observation about missing Cursor-native export. Comment 5561181849 requires Workflow to resolve identity from demonstrated runtime context and pass explicit values in its own call. The candidate instead gates on undocumented env and leaves the first executable claim unstamped. Blocking.

## C2 — normal generated path still does not supply the CLI-opened workspace (OPEN)

failure_class: generated-next-omits-cursor-workspace-on-default-entry
trigger: same first claim fence as C1, including a CLI opened on an independent worktree or a main-workspace CLI whose shell cwd is another worktree.
expected: the normal generated startup/resume path supplies or preserves a known locator for the workspace the CLI opened (`--workspace` on the inspected CLI argv).
observed: the default first startup fence has no `--cursor-workspace`. `resolveCursorCliEnsureTarget` then uses invoking `getRoot()` / recorded `main_root`. Real CLI `CURSOR_WORKSPACE` is absent, so even the gated then-arm expands `--cursor-workspace "$CURSOR_WORKSPACE"` to an empty locator (disposable concat argv1: `--cursor-workspace  `).

Primary anchor: same first claim fence (unstamped startup, no workspace flag).
Secondary: `cursorCliOperatorIdentityArgv` uses `"$CURSOR_WORKSPACE"`; inspected CLI does not export that name; demonstrated locator is argv `--workspace`. Tests that set `CURSOR_WORKSPACE` and drive the then-arm line are not normal-route proof (comment 5560806842: an optional `--cursor-workspace` flag alone is not the proof).

## C3 C4 R1 R2

C3 remains resolved: first `## Resume` fence still inlines `kaola_script` / `CLAIM_JS=` outside the `if`; disposable cold Resume with `CLAIM_JS` unset invoked named `kaola-workflow-claim.js resume`. The gated **startup** fence still has no resolver; that is recorded under C1 (second fence is not a cold-capable CLI entry), not a C3 reopen.

C4 remains resolved: README.md documents the generated startup/resume surface (required user-visible file is present). The operator-export instruction in that README is C1 evidence, not a missing-README defect.

R1 remains resolved and still required: GitHub `scripts/kaola-workflow-claim.js`, Codex COMMON_SCRIPTS copy, GitLab `kaola-gitlab-workflow-claim.js`, and Gitea `kaola-gitea-workflow-claim.js` all list `product`, `host`, `cursorWorkspace` in known value flags. No `unknown_flag` regression found on this SHA.

R2 remains resolved as prose: generated Next names `--cursor-workspace` / `main_root` rather than `git rev-parse --show-toplevel` as the resume locator. Consumer-route locator failure is C2, not a R2 revert.

## Observation (not blocking)

`CURSOR_INVOKED_AS=cursor-agent` is present on both standalone CLI and the App worker; it is not a CLI discriminator. Issue #1052 still forbids inferring App/Cloud from `--runtime cursor` or a sibling `agent` binary. A later repair that stamps identity from demonstrated CLI `--workspace` (or other Workflow-owned measured context) is a production choice; this review does not implement it.

finding: id=R1 scope=in_scope action=fix status=resolved severity=high fix_role=implementer rationale=forge-port-unknown-flag
finding: id=R2 scope=in_scope action=fix status=resolved severity=medium fix_role=implementer rationale=next-names-git-toplevel
finding: id=C1 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=normal-generated-entry-skips-cli-prep
finding: id=C2 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=default-fence-omits-cli-workspace
finding: id=C3 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=cold-resume-claim-js-unbound
finding: id=C4 scope=in_scope action=fix status=resolved severity=medium fix_role=doc-updater rationale=readme-omits-user-visible-prep
verdict: fail
findings_blocking: 2
review_conclusion: Frozen ba368eab still fails comments 5560806842 and 5561181849: real Cursor CLI does not export the host-gate variables, so the first generated Next claim fence acquires without Repo prep, and the CLI-opened workspace is not passed on that default path.
