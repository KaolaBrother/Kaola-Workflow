# Final candidate-bound validation — round 5 (run ONCE)

- Issue: #1113
- Seat: droid-KW-i1113-chains5
- Worktree: `/Users/ylmacstudio/Workspace/kaola-workflow/.kw/worktrees/issue-1113`
- Branch: `workflow/issue-1113`
- Frozen candidate: `804c758b282af54595ef7026461228829ba1eb88`
- Result: **PASS** (all required checks green; no waivers; no source mutation)

## Candidate binding

- Verified HEAD before any check: `git rev-parse HEAD` → `804c758b282af54595ef7026461228829ba1eb88` (matches frozen candidate).
- Verified HEAD again after all checks: `804c758b282af54595ef7026461228829ba1eb88`.
- `git status --porcelain` before and after every command: empty (clean). No tracked file was dirtied; the worktree was clean at start and at end.
- Change since `969b11b6`: one commit only, `804c758b` ("fix(#1113): recognize issue-URL references and refuse repository conflicts").

## 1. Full unsharded integration walkthrough

- Command: `node scripts/simulate-workflow-walkthrough.js`
- Exit: **0** — Duration: 121s
- Scenario count: **205** (`##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":205,"ran":205,"passed":205,"failed":0}`)
- Result: **PASSED** ("Workflow walkthrough simulation passed"); spawn-census 2894.

## 2. Producer cross-forge chain

- Command: `node scripts/kaola-workflow-run-chains.js --project issue-1113`
- Exit: **0** — Duration: 715s
- Receipt path (written by the runner against the git top-level, i.e. the MAIN checkout):
  `/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/chain-receipt.json`
- `headSha` = **`804c758b282af54595ef7026461228829ba1eb88`** (binds the receipt to the frozen candidate)
- `workTreeHash` = **`clean`**
- `codeTreeHash` = `92c3facaec736137dcb4f499db997f52c18f5f4293641b733554ece4d9fce093`
- `validationTestConsumes` = `[]` (no band widening; nothing to replay)
- Scope: `all-four` (reason `edition_coupling`; base `fe7e4443`; 27 changed files touch edition paths)
- Per-chain results:

  | chain  | exit | attempts | timed_out | accepted_red |
  |--------|------|----------|-----------|--------------|
  | claude | 0    | 1        | false     | false        |
  | codex  | 0    | 1        | false     | false        |
  | gitlab | 0    | 1        | false     | false        |
  | gitea  | 0    | 1        | false     | false        |

- `accepted_red`: **none** (no chain was waived or accepted red). Waivers: **none**.
- Window: startedAt `2026-10-02T18:29:53.291Z`, completedAt `2026-10-02T18:41:48.386Z`.
- Note: the main checkout retains its pre-existing untracked `kaola-workflow/issue-1113/` (present at session start). Only gitignored `.cache/` content under it was written; no tracked file changed.

## 3. Focused standalone checks

| Check | Command | Exit | Duration | Evidence |
|-------|---------|------|----------|----------|
| Workflow contracts | `node scripts/validate-workflow-contracts.js` | 0 | 0s | "Workflow contract validation passed" |
| Script sync | `node scripts/validate-script-sync.js` | 0 | 0s | 14 common scripts, 10 byte-identical groups, 5 forge export-superset families in sync; 4 Oracle Kernel copies identical at HEAD |
| Edition sync | `node scripts/edition-sync.js --check` | 0 | 1s | 6 forge aggregator ports in parity; committed kernel parity verified at HEAD |
| Routing surfaces | `node scripts/generate-routing-surfaces.js --check` | 0 | 0s | all 24 surfaces byte-match the skeleton |
| Render subtraction oracle | `node scripts/test-issue-1055-render-subtraction-oracle.js` | 0 | 0s | passed (11 assertions, 90 render comparisons vs baseline `fe7e4443`) |

## Waivers

None. No `--accept-known-red` was passed; no failure was waived. No check failed.

## Not run (and why)

- `npm run test:parallel` / `npm run test:kaola-workflow:*` — not run: out of the brief's scope ("no unrelated full suites beyond the required chain"); the required producer chain and walkthrough already cover the declared edition chains.
- No commits, pushes, merges, claims, worktrees, or mission-ledger writes were performed. Workflow ON was used only for run context.

## Verdict

Acceptance-relevant evidence, bound to `804c758b282af54595ef7026461228829ba1eb88`: walkthrough 205/205 PASS; producer chain all-four exit 0 with `headSha` = the frozen commit and `workTreeHash` = clean; focused checks exit 0. No waivers, no source mutation. This report is evidence only — acceptance verdict and the mission ledger remain the Host's.
