# Candidate-bound validation round 2 — issue #1113 (repaired frozen candidate)

Run: `droid-KW-i1113-chains2`, dispatched by Host `zcode-KW-orchestrator-keepopen-pr`.
Date: 2026-10-02/03. All checks ran inside the run worktree. Workflow-next was invoked to resume
the existing issue-1113 run context: no claims, worktrees, branches, or ledger entries were created,
and the mission ledger was not written (Host owns it).

## Frozen candidate gate (verified before anything ran)

- Worktree: `/Users/ylmacstudio/Workspace/kaola-workflow/.kw/worktrees/issue-1113`
- Branch: `workflow/issue-1113`
- HEAD: `6423042aa1679564db6ca317bb4cf448f316da5c` — **exact match** with the repaired frozen
  candidate (v2).
- `git status --short --branch`: clean (no tracked or untracked paths) before the first check,
  re-verified clean after the walkthrough, after the chain, after the focused suites, and again
  after all runs. HEAD re-verified `6423042a` at the end. No source mutation occurred at any point.
- Changes validated since the previously validated `1203f765` (diff `1203f765..6423042a`: 9 files,
  +508/−76): `96c20b61` — keep-open P1 repairs in `scripts/kaola-workflow-sink-pr.js` (+145 lines,
  identical `plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js` mirror copy), ADR 0031
  `Accepted` status, and README / `docs/api.md` / `docs/architecture.md` /
  `docs/workflow-state-contract.md` / `CHANGELOG.md` updates; `6423042a` — new walkthrough
  scenario `testExplicitKeepOpenPrP1Repairs` (+212 lines in `scripts/simulate-workflow-walkthrough.js`)
  and its registration.

## 1. Required integration chain — walkthrough

- Command: `node scripts/simulate-workflow-walkthrough.js` (full, unsharded)
- Working dir: the worktree
- Exit code: **0**
- Duration: **119s** (16:34:18Z → 16:36:17Z)
- Result: `##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":205,"ran":205,"passed":205,"failed":0}`
  — **205/205 scenarios passed**, exceeding the previous round's 204 by exactly the new
  `testExplicitKeepOpenPrP1Repairs` scenario (registered in the scenario table at the repaired HEAD;
  its `testExplicitKeepOpenPrP1Repairs: PASSED` line is in the log, alongside
  `testKeepOpenMergeFullChain: PASSED` and `testSinkPrKeepOpenRefusal: PASSED`).
  Spawn census 2692 (round 1: 2535). `grep -c FAILED` over the full log: 0.
- Full log: `kaola-workflow/issue-1113/.cache/keepopen-final-chains-v2/logs/walkthrough.log`

## 2. Producer-selected cross-forge validation chain (`npm test` chain set)

- Command: `node scripts/kaola-workflow-run-chains.js --project issue-1113` (run from the worktree
  root; executes exactly the `npm test` four-chain set — `npm run test:kaola-workflow:claude && …codex
  && …gitlab && …gitea` — with the shared preamble hoisted and run once, and writes the
  candidate-bound receipt. A separate bare `npm test` was not run: it runs the identical four chains
  serially and writes no receipt.)
- Exit code: **0** (overall runner exit)
- Duration: **714s** (16:36:26Z → 16:48:20Z; receipt `startedAt` 16:36:26.954Z, `completedAt`
  16:48:20.545Z; the four chains ran concurrently)
- Preamble (hoisted, all 10 steps exit 0): `edition-sync.js --materialize-kernel`,
  `validate-script-sync.js`, `test-issue-1056-default-branch-env-contract.js`,
  `test-forge-finalize-findings.js`, `test-forge-archive-scoping.js`,
  `test-forge-claim-rollback-scoping.js`, `test-forge-claim-reserved-project.js`,
  `test-active-folders-field-parity.js`, `generate-routing-surfaces.js --check`,
  `edition-sync.js --check`
- Chains (from the receipt):

  | chain | command | exitCode | duration | accepted_red | attempts | timed_out |
  |---|---|---|---|---|---|---|
  | claude | `npm run test:kaola-workflow:claude` | 0 | 689.2s | false | 1 | false |
  | codex | `npm run test:kaola-workflow:codex` | 0 | 8.9s | false | 1 | false |
  | gitlab | `npm run test:kaola-workflow:gitlab` | 0 | 165.2s | false | 1 | false |
  | gitea | `npm run test:kaola-workflow:gitea` | 0 | 164.7s | false | 1 | false |

  Every per-step exit code inside every chain is 0 (claude 51 steps, codex 2, gitlab 3, gitea 3).

### Chain receipt

- Path: `/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/chain-receipt.json`
  (the runner resolved `--project issue-1113` to the main checkout's project record dir — the
  location the finalize gate reads, per the #546 receipt-path contract)
- sha256: `54ee09fdd9599cc61d205a417beeed97c8caa6a6eafa95e35254cc2f6934c1c8`
- headSha: `6423042aa1679564db6ca317bb4cf448f316da5c` — **bound to the exact repaired frozen candidate**
- workTreeHash: `clean`
- codeTreeHash: `ca100e110a97b0744d87d9ad1113138ac399cf832076cf69df72824464a0fe72`
- validationTestConsumes: `[]`
- scope: decision `all-four`, reason `edition_coupling`, base `fe7e4443a8c367cfc111c65755191ae6790e810e`,
  changedFileCount 27 (round 1's 26 plus this round's one new file, the walkthrough script; the
  sink-pr kernel/mirror and docs edits are within the round-1 paths)
- **accepted_red / waivers: none.** Every chain carries `accepted_red: false`,
  `accepted_red_issue: null`; no `--accept-known-red` was passed; no timeouts (`timed_out: false`),
  no signal deaths, no transient retries (`retried_transient: false`, `attempts: 1` on all four).
  This is a clean PASS.
- Overwrite note: as designed, the runner replaced the round-1 receipt (headSha `1203f765…`,
  sha256 `07d3ceb6eb97db1536eee8c4375ac77ab8821b618e289fe4dcd63e7ed8c603be`, verified present
  before this run) with the receipt above. Round-1 evidence remains recorded in the mission ledger
  and `.cache/keepopen-final-chains/REPORT.md`.
- Runner stdout: the runner emitted nothing to stdout/stderr on success; the round-2 log file is
  0 bytes (round 1's 184-byte log was the invoking wrapper's own echo lines, not runner output).
  Per-step evidence is in the receipt.
- Log: `kaola-workflow/issue-1113/.cache/keepopen-final-chains-v2/logs/cross-forge-chains.log` (empty)

## 3. Focused standalone re-runs for the touched surfaces

All run in the worktree, all bound to HEAD `6423042a`, all exit 0:

| # | Suite | Exit | Duration | Verdict line |
|---|---|---|---|---|
| 1 | `node scripts/validate-workflow-contracts.js` | 0 | <1s | `Workflow contract validation passed` |
| 2 | `node scripts/validate-script-sync.js` | 0 | <1s | `OK: 14 common scripts, 10 byte-identical groups, 0 rename-normalized families, 2 hooks.json families, 5 forge export-superset families in sync. committed kernel parity: 4 Oracle Kernel copies identical at HEAD.` |
| 3 | `node scripts/edition-sync.js --check` | 0 | <1s | `edition-sync: 6 forge aggregator ports in parity with canonical. edition-sync: committed kernel parity verified at HEAD.` |
| 4 | `node scripts/generate-routing-surfaces.js --check` | 0 | <1s | `generate-routing-surfaces --check: all 24 surfaces byte-match the skeleton.` |
| 5 | `node scripts/test-issue-1055-render-subtraction-oracle.js` | 0 | <1s | `issue-1055-render-subtraction-oracle passed (11 assertions, 90 render comparisons hashed against baseline commit fe7e4443…).` |

Coverage rationale for the round-2 diff: (1) pins the sink-pr structural contract of which the
repaired `kaola-workflow-sink-pr.js` is the carrier; (2)+(3) verify the repaired kernel and its
`plugins/kaola-workflow` mirror copy stay in sync and in parity at HEAD; (4)+(5) confirm the rendered
command/skill surfaces and the render baseline show no drift from the repairs (no routing template or
rendered surface changed this round, so these are confirmation re-runs, both also green inside the
hoisted preamble and the claude chain).

Logs: `kaola-workflow/issue-1113/.cache/keepopen-final-chains-v2/logs/focused-*.log`.

## Not run, and why

- `node scripts/test-claim-hardening.js` and `node scripts/test-sink-merge.js`: per dispatch they
  run inside the `claude:full` lane only and were not to be run standalone unless the chain result
  gave a reason. The chain result gave no reason: all four chains green with every per-step exit 0,
  and the full unsharded walkthrough (205/205, including the new keep-open P1-repairs scenario)
  plus the claude chain's `test-kernel-conformance.js` (363.6s, exit 0) cover the repaired sink-pr
  surface candidate-bound. This round's diff also does not touch `kaola-workflow-claim.js`.
- Bare `npm test`: the receipt runner executed the identical four npm chains plus the hoisted
  preamble and wrote the required candidate-bound receipt; a separate bare `npm test` would
  duplicate those chains with no receipt.
- `npm run test:kaola-workflow:claude:full`, `npm run test:parallel`, `npm run test:kaola-workflow:editions`:
  unrelated full-suite reruns beyond the required chain (dispatch rule).
- Docs surfaces (`README.md`, `docs/*`, `CHANGELOG.md`, ADR 0031): no dedicated machine validation
  suite exists for prose docs; the rendered finalize command surface is confirmed by checks 4–5
  above. Nothing to run beyond that.

## Waivers

None. No `--accept-known-red` was passed, no `accepted_red` appears anywhere in the receipt, and
every command above exited 0. No failure was observed at any stage; nothing was waived, skipped
silently, or retried.

## Postconditions

- Worktree: clean, HEAD unchanged at `6423042aa1679564db6ca317bb4cf448f316da5c`. No tracked file was
  dirtied by any check; nothing was committed, pushed, merged, or edited.
- Main checkout: no tracked-file changes; the only writes were the chain receipt overwrite (the
  runner's designed output) and this delivery directory (the declared report location).
- Mission ledger: not written (Host-owned). No claims, worktrees, branches, or ledger entries
  created. `workflow-state.md` untouched.
- No `HUMAN_DECISION_REQUIRED` event arose: every action was read-only validation plus the two
  designed cache writes; no irreversible or value-laden choice was encountered.
