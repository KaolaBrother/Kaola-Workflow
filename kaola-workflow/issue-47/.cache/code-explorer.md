# Code Explorer: issue-47 — Bootstrap auto-pick removal

## cmdBootstrap and runBootstrapClaimFirstAvailable

### scripts/kaola-workflow-claim.js
| Symbol | Lines | Role |
|--------|-------|------|
| `runBootstrapClaimFirstAvailable` | 1223–1232 | Walks open issues, claims first available |
| `cmdBootstrap` | 1234–1262 | Command handler; calls runBootstrapClaimFirstAvailable |
| Dispatcher | 2773 | `if (sub === 'bootstrap') return cmdBootstrap()` |

**`runBootstrapClaimFirstAvailable` step by step:**
1. Returns `{ pick: null }` immediately if OFFLINE or classifier missing
2. Calls `listOpenIssues(getRoot())` to fetch full open-issue list
3. Loops over each issue, calls `pickFirstActionableIssue(classifierScript, issues.slice(i, i+1))`
4. On first non-null pick, calls `runBootstrapClaim(claimScript, args, pick)` → returns pick
5. If all fail → `{ pick: null }`

**`cmdBootstrap` current args:** `parseArgs(process.argv.slice(3))` — parses `--session`, `--project`, `--issue`, `--target-issue`, `--branch`, `--sink`, `--runtime`. BUT `args.targetIssue` is NEVER READ inside cmdBootstrap. Only `--session` and `--runtime` are used.

**Plugin mirror:** `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` is byte-identical. Same line numbers apply.

## claimExplicitTarget Pattern (issue-44 implementation)

**Lines 1285–1308 in scripts/kaola-workflow-claim.js**

Signature: `claimExplicitTarget(claimScript, classifierScript, args, targetIssue, coordRoot, root)`

Return statuses:
- `{ status: 'target_occupied', issue, project }` — already claimed
- `{ status: 'target_unavailable', issue, project, reasoning }` — classifier missing or non-green/yellow
- `{ status: 'user_target_blocked', issue, project, reasoning }` — classifier blocked
- `{ status: 'user_target_red', issue, project, reasoning }` — classifier red
- `{ status: 'acquired', issue, project, verdict }` — success

**How cmdStartup uses it:**
1. Line 1405: checks `if (!args.targetIssue)` → writes `no_target` receipt, stderr warning, exits 1
2. Line 1427: calls `claimExplicitTarget(..., args.targetIssue, ...)`
3. Line 1428: if not acquired → writes refusal receipt `claim: 'none'`, exits 1
4. On success: writes receipt with `claim: 'acquired'`, `target_source: 'user_directed'`, `verdict`

Guard at line 1317: `assert(!args.targetIssue || (Number.isFinite(args.targetIssue) && args.targetIssue > 0), '--target-issue must be a positive integer')`

## Tests asserting bootstrap auto-pick behavior (to be replaced)

All in `scripts/simulate-workflow-walkthrough.js`:

| Test | Lines | Assertion |
|------|-------|-----------|
| 6G | 1089–1134 | bootstrap skips remotely-claimed 19, picks 21; `r6G.issue === 21` |
| 8I-a | 2035–2092 | First bootstrap picks issue 11; `out8i1.issue === 11` |
| 8I-owned | 2094–2100 | Same session re-runs bootstrap → `verdict: 'owned'` |
| 8I-b | 2102–2113 | Second session skips locked 11, picks 12; `out8i2.issue === 12` |
| 12D | 3002–3021 | Each iteration: bootstrap for secondary session picks freeIssue |
| 13A | 3086–3158 | Lock injected mid-classification; bootstrap retries and picks 902 |
| 13B | 3160–3228 | Two parallel bootstraps split between 911 and 912 |

**Test setup pattern:** temp dir + gh shim in `bin/`, `HOME` redirected, locks in `<tmpdir>/.git/kaola-workflow/locks/`, cleanup in `finally`.

Epic 14A–14E (lines 3271–3380) are the explicit-target startup tests — mirror pattern for new bootstrap explicit-target tests.

## Validator assertions (to be removed/replaced)

| File | Line | Assertion |
|------|------|-----------|
| `scripts/validate-workflow-contracts.js` | 226 | `assertIncludes('scripts/kaola-workflow-claim.js', 'function runBootstrapClaimFirstAvailable')` |
| `scripts/validate-kaola-workflow-contracts.js` | 182 | `assertIncludes('.../kaola-workflow-claim.js', 'function runBootstrapClaimFirstAvailable')` |

Pre-existing validator bug (unrelated): `validate-kaola-workflow-contracts.js` L193 asserts `'real parallel bootstrap coordination and claim-race retry'` which doesn't exist in the simulate script.

## README sections to update

| Line | Content |
|------|---------|
| 308 | Feature table: `--runtime claude\|codex flag on claim and bootstrap` |
| 520 | `bootstrap continues scanning the open issue list and claims the next green/yellow issue automatically` |

## Issue-44 test pattern (for new explicit-target tests)

Epic 14A–14E (lines 3271–3380): use `execFileSync([claimScript, 'startup', '--session', '<id>', '--runtime', 'codex', '--target-issue', '<N>'])`.

Key test shapes:
- 14A: target acquired → `claim: 'acquired'`, `target_source: 'user_directed'`
- 14C: no target → exit 1, `verdict: 'no_target'`, `claim: 'none'`
- 14D: already claimed → exit 1, `verdict: 'target_occupied'`, `claim: 'none'`
- 14E: blocked target → exit 1, `verdict: 'user_target_blocked'`, `claim: 'none'`
