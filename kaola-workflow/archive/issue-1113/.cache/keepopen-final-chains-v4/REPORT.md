# FINAL candidate-bound validation (round 4) — Kaola-Workflow issue #1113

- Runner seat: `droid-KW-i1113-chains4` (Host owns acceptance and the mission ledger)
- Date: 2026-10-02/03
- Mode: workflow ON for run context only. No claims, worktrees, branches, ledger writes, commits, pushes, or merges performed.
- Verdict: **ALL REQUIRED CHECKS PASSED. No waivers.**

## 1. Frozen candidate identity (verified before anything ran)

- Worktree: `/Users/ylmacstudio/Workspace/kaola-workflow/.kw/worktrees/issue-1113`
- Branch: `workflow/issue-1113`
- `git rev-parse HEAD` = `969b11b6bc7192361bfc5e6b840ef6773ebf655c` (matches expected `969b11b6...`)
- `git status --porcelain` = empty (clean) at start
- Confirmed exact + clean BEFORE any check ran.

## 2. Command results (all bound to HEAD `969b11b6bc7192361bfc5e6b840ef6773ebf655c`)

All commands executed from the worktree root with `HEAD=969b11b6bc7192361bfc5e6b840ef6773ebf655c` echoed before the run.

| # | Command | Exit | Duration |
|---|---------|------|----------|
| 1 | `node scripts/simulate-workflow-walkthrough.js` (full, unsharded) | 0 | 117.8 s (1m57.8s wall) |
| 2 | `node scripts/kaola-workflow-run-chains.js --project issue-1113` | 0 | 713.6 s (11m53.6s wall) |
| 3a | `node scripts/validate-workflow-contracts.js` | 0 | 353 ms |
| 3b | `node scripts/validate-script-sync.js` | 0 | 69 ms |
| 3c | `node scripts/edition-sync.js --check` | 0 | 49 ms |
| 3d | `node scripts/generate-routing-surfaces.js --check` | 0 | 28 ms |
| 3e | `node scripts/test-issue-1055-render-subtraction-oracle.js` | 0 | 94 ms |

No source mutation: `git status --porcelain` was empty after every check and after the whole batch; HEAD unchanged.

## 3. Integration walkthrough (unsharded)

- Result: **PASSED** — `Workflow walkthrough simulation passed`
- Scenario line: `##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":205,"ran":205,"passed":205,"failed":0}`
- Scenario count: **205 scenarios, 205 ran, 205 passed, 0 failed**
- Spawn census: `{"suite":"simulate-workflow-walkthrough","spawns":2745}`

## 4. Producer cross-forge chain receipt

Receipt written (runner overwrites it) at the main checkout project cache:
`/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/chain-receipt.json`

- `headSha` = `969b11b6bc7192361bfc5e6b840ef6773ebf655c` → **equals the exact frozen HEAD**
- `workTreeHash` = `clean`
- `codeTreeHash` = `b150bb72b45bb77d8fc44e3e9091ebf2f462760824933242d407c88d583e93ee`
- `validationTestConsumes` (`validationConsumes`) = `[]` (empty)
- `source` = `npm-default`
- `scope`: decision `all-four`, reason `edition_coupling`, base `fe7e4443a8c367cfc111c65755191ae6790e810e`, 27 changed files, chains `claude, codex, gitlab, gitea`
- Window: startedAt `2026-10-02T17:35:44.321Z`, completedAt `2026-10-02T17:47:37.790Z`

Per-chain exits / accepted_red / attempts:

| Chain | exitCode | accepted_red | accepted_red_issue | attempts | retried_transient | timed_out | duration |
|-------|----------|--------------|--------------------|----------|-------------------|-----------|----------|
| claude | 0 | false | null | 1 | false | false | 689.3 s |
| codex | 0 | false | null | 1 | false | false | 9.0 s |
| gitlab | 0 | false | null | 1 | false | false | 166.1 s |
| gitea | 0 | false | null | 1 | false | false | 166.2 s |

- `accepted_red` = **none** for every chain.
- All preamble steps exitCode 0 (10 steps, incl. `edition-sync --materialize-kernel`, `validate-script-sync.js`, `generate-routing-surfaces.js --check`, `edition-sync.js --check`).
- **Waivers: none.**

## 5. Focused standalone checks

| Command | Exit | Result line |
|---------|------|-------------|
| `validate-workflow-contracts.js` | 0 | `Workflow contract validation passed` |
| `validate-script-sync.js` | 0 | 14 common scripts, 10 byte-identical groups, 0 rename-normalized families, 2 hooks.json families, 5 forge export-superset families in sync; 4 Oracle Kernel copies identical at HEAD |
| `edition-sync.js --check` | 0 | 6 forge aggregator ports in parity; committed kernel parity verified at HEAD |
| `generate-routing-surfaces.js --check` | 0 | all 24 surfaces byte-match the skeleton |
| `test-issue-1055-render-subtraction-oracle.js` | 0 | passed (11 assertions, 90 render comparisons hashed against baseline `fe7e4443a8c367cfc111c65755191ae6790e810e`) |

## 6. Not run / notes

- No unrelated full suites were run beyond the required producer chain (per scope limit).
- The deliverable-scoped change set since `45e6deb1` (origin-fallback restriction in `scripts/kaola-workflow-sink-pr.js` GitHub-URL-only origin parser + tightened state slug, plugins mirror, walkthrough controls, ADR sentences) is covered by the walkthrough, the four-forge chain, and the focused checks above.
- No mission-ledger write was performed (Host owns the ledger).
- No irreversible or value-laden choices were made; none require `HUMAN_DECISION_REQUIRED`.
