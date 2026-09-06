# Acceptance RED — Issue #1052 C1 host-gate parentheses

role: tdd-guide (test custody only)
baseline: `282238bb8ee714b7989865378a57397f68b0b5a7`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
suite: `scripts/test-issue-1052-cursor-cli-startup-prep.js`
command: `node scripts/test-issue-1052-cursor-cli-startup-prep.js` (cwd = worktree)
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: production, `kaola-workflow/bundle-1051`, C2/C3/C4 assertion meaning, App-unset-must-not-forge pins

## Counts

- failures: **7**
- passed: **245**
- spawn-census: `{"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":615}`
- exit: 1
- footer: `issue-1052 cursor CLI startup/resume prep FAILED: 7 failure(s), 245 passed.`

App-like unset first Resume / concatenated fences, KAOLA-twins-only then-arm, and the four-var (`cli-four`) path are among the 245 passes. They were not weakened.

## RED (documented CURSOR pair only; KAOLA twins unset)

Generated consumer chain (`bash --noprofile --norc` on first `## Resume` fence, and concatenated startup/resume fences). Subject is the generated `if` (left-associative `((A&&B)||C)&&D`), not `claim.js --product app`. Sibling `agent` remains on PATH; CLI is not inferred from it.

Unstamped argv observed: `…/kaola-*-workflow-claim.js resume --runtime cursor` (no `--product cli --host local`, no `--cursor-workspace`). Concatenate: three unstamped invocations (`startup --runtime cursor --target-issues 12566`, then two `resume --runtime cursor`).

```
RED: #1052-generated[codex-github]-c1-host-gate-cli-cursor-pair-first-resume
  expected then-arm named kaola-workflow-claim.js --product cli --host local --cursor-workspace
  got log resume --runtime cursor; json {resumed:true, project:issue-12564} (no cursor_prep)

RED: #1052-generated[codex-github]-c1-host-gate-cli-cursor-pair-prep
  expected cursor_prep.status=materialized on GitHub first Resume then-arm
  got json {resumed:true, project:issue-12564} with no cursor_prep

RED: #1052-generated[codex-github]-c1-host-gate-cli-cursor-pair-every-fence
  expected concatenated fences to stamp cli/local + --cursor-workspace
  got three unstamped startup/resume --runtime cursor lines

RED: #1052-generated[gitlab]-c1-host-gate-cli-cursor-pair-first-resume
  expected then-arm named kaola-gitlab-workflow-claim.js --product cli --host local --cursor-workspace
  got log resume --runtime cursor

RED: #1052-generated[gitlab]-c1-host-gate-cli-cursor-pair-every-fence
  expected concatenated stamps; got three unstamped --runtime cursor lines

RED: #1052-generated[gitea]-c1-host-gate-cli-cursor-pair-first-resume
  expected then-arm named kaola-gitea-workflow-claim.js --product cli --host local --cursor-workspace
  got log resume --runtime cursor

RED: #1052-generated[gitea]-c1-host-gate-cli-cursor-pair-every-fence
  expected concatenated stamps; got three unstamped --runtime cursor lines
```

baseline: `282238bb8ee714b7989865378a57397f68b0b5a7`

## Pins added (oracle)

`hostGateEnv` no longer treats `'cli'` as all four vars together:

- `'app'`: all four unset (existing App-unset-must-not-forge kept)
- `'cli'`: only `CURSOR_PRODUCT=cli` `CURSOR_HOST=local`
- `'kaola'`: only `KAOLA_CURSOR_PRODUCT=cli` `KAOLA_CURSOR_HOST=local`
- `'cli-four'`: both pairs (previous GREEN-hiding path kept)

Production remains the unparenthesized generated gate. Implementer owns the fence parentheses.
