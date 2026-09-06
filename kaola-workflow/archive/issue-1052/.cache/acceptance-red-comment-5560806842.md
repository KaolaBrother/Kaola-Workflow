# Acceptance RED — Issue #1052 comments 5560806842 / 5561181849 (normal generated entry)

role: tdd-guide (test custody only)
baseline: `ba368eabb3385bfd5e389432603a116b52524298`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
`git rev-parse HEAD` matched that SHA.
suite: `scripts/test-issue-1052-cursor-cli-startup-prep.js`
command: `node scripts/test-issue-1052-cursor-cli-startup-prep.js` (cwd = worktree)
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: production, `kaola-workflow/bundle-1051`, mission-list done rows
did_not_weaken: App-unset-must-not-forge, collision/readonly/fail-closed, R1 forge-port `unknown_flag` pins, C3 cold `CLAIM_JS`, C4 README presence

## Counts

- failures: **9**
- passed: **216**
- spawn-census: `{"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":591}`
- exit: 1
- footer: `issue-1052 cursor CLI startup/resume prep FAILED: 9 failure(s), 216 passed.`

App/Cloud/unknown first-claim fences (no `--workspace`), App first Resume, App concatenated fences, C3 cold Resume `CLAIM_JS` unset/empty, C4 README, collision/symlink/authority/readonly, and R1 named claim.js product/host/cursorWorkspace pins are among the 216 passes.

## What was retargeted (former GREEN skip-proof)

Removed as the CLI-positive generated-route oracle:

- selecting `executableClaimLines(...).find(hasCliLocalIdentity)` (the **second** gated fence)
- requiring shared Next to emit `--product cli --host local` as proof of standalone CLI
- driving that stamped argv / `--cursor-workspace "$CURSOR_WORKSPACE"`
- `hostGateEnv('cli'|'kaola'|'cli-four')` plus invented `CURSOR_WORKSPACE`

Those cannot remain the skip-proof. Issue acceptance overrides an oracle that pins shared Next `--product cli --host local`. Invented `CURSOR_PRODUCT` / `KAOLA_CURSOR_*` / `CURSOR_WORKSPACE` is not the normal CLI-positive path. `claim.js --product app` is still not substituted for C1.

## New oracle (disposable consumer, isolated global install)

Default **first** claim fence (skeleton “then claim it” block). No invented gate env. Demonstrated parent argv only:

- CLI-positive: `--workspace <opened>` and `--model cursor-grok-4.6-xhigh` (real CLI `2026.09.02-c22c1a3` shape). `CURSOR_INVOKED_AS=cursor-agent` is set on CLI **and** App (not a discriminator). Sibling `agent` remains on PATH.
- App-like: `--worker-dir`, no `--workspace`.
- unknown: same fence, no demonstrated `--workspace`.

Subject is the generated fence + named claim.js, not a mock.

## RED

Observed first-fence argv (all three generated Next forges):  
`…/kaola-*-workflow-claim.js startup --runtime cursor --target-issues 12571`  
`claim=acquired`; `cursor_prep` absent; no project agents on the opened workspace.

```
RED: #1052-generated[codex-github]-c1-first-claim-cli-prep
  expected Repo prep before that single claim (cursor_prep present; agents on --workspace)
  got acquired bundle-12571 with no cursor_prep; log unstamped startup --runtime cursor --target-issues 12571

RED: #1052-generated[codex-github]-c2-cli-opened-worktree
  expected prep of CLI-opened independent worktree (--workspace = that worktree)
  got acquired with no agents / no cursor_prep

RED: #1052-generated[codex-github]-c2-main-cli-other-cwd
  expected prep of main (--workspace = main) when shell cwd is another worktree
  got acquired with no agents on main

RED: #1052-generated[gitlab]-c1-first-claim-cli-prep
  expected same first-fence prep; got unstamped startup --runtime cursor --target-issues 12571, no cursor_prep

RED: #1052-generated[gitlab]-c2-cli-opened-worktree
  expected worktree --workspace prep; got acquired without agents

RED: #1052-generated[gitlab]-c2-main-cli-other-cwd
  expected main --workspace prep from other-worktree cwd; got acquired without agents on main

RED: #1052-generated[gitea]-c1-first-claim-cli-prep
  expected same first-fence prep; got unstamped startup --runtime cursor --target-issues 12571, no cursor_prep

RED: #1052-generated[gitea]-c2-cli-opened-worktree
  expected worktree --workspace prep; got acquired without agents

RED: #1052-generated[gitea]-c2-main-cli-other-cwd
  expected main --workspace prep from other-worktree cwd; got acquired without agents on main
```

baseline: `ba368eabb3385bfd5e389432603a116b52524298`

Testing only the second gated fence is not this proof: `-c1-first-claim-cli-single` passed (exactly one startup on the first fence).

## Pins kept (not this RED)

- App/unknown first claim fence and App every-fence: no forged `--product cli --host local` that materializes
- C3: first `## Resume` fence still resolves named claim.js when `CLAIM_JS` unset / `""`
- C4: README remains required and still names the startup/resume prep surface
- R1: named forge claim.js still accept `--product` / `--host` / `--cursor-workspace` (not `unknown_flag`)
- collision / symlink / missing+stale authority / readonly status/list-open / explicit `--product app`

Production still leaves the first executable claim unstamped and gates CLI identity on undocumented env the real CLI does not export. Implementer must resolve identity/workspace from demonstrated runtime context (`--workspace`) and pass explicit values in Workflow’s own call.
