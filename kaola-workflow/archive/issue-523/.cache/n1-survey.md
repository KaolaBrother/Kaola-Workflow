evidence-binding: n1-survey b44d5058e7cb

## Chain command inventory

37 total commands in `test:kaola-workflow:claude`. Positions 1–2 are non-node (bash syntax check, node -e JSON.parse). Positions 3–36 are `node scripts/...` unit validators. Position 37 is the walkthrough monolith.

Cost rank key: H=heavy (many subprocesses or real git/worktree ops), M=medium (some subprocesses), L=light (in-process only, 0 subprocesses).

| # | Command | Script file | Subprocess call-sites | Rank |
|---|---------|-------------|----------------------|------|
| 1 | `node scripts/validate-script-sync.js` | validate-script-sync.js | 0 | L |
| 2 | `node scripts/validate-vendored-agents.js` | validate-vendored-agents.js | 0 | L |
| 3 | `bash -n install.sh uninstall.sh` | (bash syntax check only) | 0 | L |
| 4 | `node -e "JSON.parse(...)"` | (inline, package.json parse) | 0 | L |
| 5 | `node scripts/test-agent-model-resolver.js` | test-agent-model-resolver.js | 0 | L |
| 6 | `node scripts/test-install-model-rendering.js` | test-install-model-rendering.js | 10 | M |
| 7 | `node scripts/test-install-upgrade-rewrite.js` | test-install-upgrade-rewrite.js | 2 | L |
| 8 | `node scripts/test-install-manifest-single-source.js` | test-install-manifest-single-source.js | 2 | L |
| 9 | `node scripts/test-install-adaptive-config.js` | test-install-adaptive-config.js | 3 | L |
| 10 | `node scripts/test-next-action.js` | test-next-action.js | 0 | L |
| 11 | `node scripts/test-commit-node.js` | test-commit-node.js | 7 | M |
| 12 | `node scripts/test-barrier-base-integrity.js` | test-barrier-base-integrity.js | 3 | L |
| 13 | `node scripts/test-issue-probe-memo.js` | test-issue-probe-memo.js | 2 | L |
| 14 | `node scripts/test-claim-hardening.js` | test-claim-hardening.js | 33 | H |
| 15 | `node scripts/test-adaptive-handoff.js` | test-adaptive-handoff.js | 0 | L |
| 16 | `node scripts/test-adaptive-node.js` | test-adaptive-node.js | 63 | H |
| 17 | `node scripts/test-plan-run.js` | test-plan-run.js | 2 | L |
| 18 | `node scripts/test-bundle-state.js` | test-bundle-state.js | 4 | L |
| 19 | `node scripts/test-bundle-claim.js` | test-bundle-claim.js | 10 | M |
| 20 | `node scripts/test-bundle-finalize.js` | test-bundle-finalize.js | 7 | M |
| 21 | `node scripts/test-parallel-batch.js` | test-parallel-batch.js | 6 | M |
| 22 | `node scripts/test-parallel.js --self-test` | test-parallel.js | 0 | L |
| 23 | `node scripts/test-edition-sync.js` | test-edition-sync.js | 0 | L |
| 24 | `node scripts/test-release-surface-drift.js` | test-release-surface-drift.js | 0 | L |
| 25 | `node scripts/test-release.js` | test-release.js | 8 | M |
| 26 | `node scripts/test-gap-sweep.js` | test-gap-sweep.js | 2 | L |
| 27 | `node scripts/test-ledger-compare.js` | test-ledger-compare.js | 2 | L |
| 28 | `node scripts/test-route-reachability.js` | test-route-reachability.js | 0 | L |
| 29 | `node scripts/test-agent-profile-parity.js` | test-agent-profile-parity.js | 0 | L |
| 30 | `node scripts/validate-workflow-contracts.js` | validate-workflow-contracts.js | 2 | L |
| 31 | `node scripts/test-fast-audit.js` | test-fast-audit.js | 0 | L |
| 32 | `node scripts/test-bash-block-guards.js` | test-bash-block-guards.js | 6 | M |
| 33 | `node scripts/test-autopilot.js` | test-autopilot.js | 3 | L |
| 34 | `node scripts/test-fast-advance.js` | test-fast-advance.js | 3 | L |
| 35 | `node scripts/test-full-advance.js` | test-full-advance.js | 2 | L |
| 36 | `node scripts/test-phase4-advance.js` | test-phase4-advance.js | 2 | L |
| 37 | `node scripts/simulate-workflow-walkthrough.js` | simulate-workflow-walkthrough.js | 505 static call-sites (see walkthrough section) | H (dominant) |

Non-walkthrough total: positions 1–36 have ~181 static subprocess call-sites combined. Dominant non-walkthrough scripts: #16 test-adaptive-node.js (63), #14 test-claim-hardening.js (33), #6 test-install-model-rendering.js (10), #19 test-bundle-claim.js (10).

## Walkthrough scenario registry

Source file: `scripts/simulate-workflow-walkthrough.js` (~14,377 LOC)

### Registry structure

- Total registry entries: **246** (231 self-contained + 15 shared-tmp)
- Built by `buildRegistry()` at line 12753; stored in `const SCENARIO_REGISTRY` at line 12998
- Each entry: `{ name: string, fn: Function, sharedTmp: boolean }`
- Shared-tmp entries have `fn = sharedTmpFn` (throws if called directly); they run via `runSharedTmpGroup(tmp)` at line 12712

### Shared-tmp group (15 members, run as one indivisible unit)

`SHARED_TMP_NAMES` array at lines 12731–12747:
1. testClaimStatusRelease
2. testFinalize
3. testRepair
4. testRepairFastPath
5. testRepairFastEscalation
6. testHookSingleProjectGuard
7. testRoadmapGenerateMissingSourceGuard
8. testRoadmapGenerateAtomicReplace
9. testRoadmapProjectRulesAppend
10. testRoadmapInitIssueConcurrentExclusive
11. testRoadmapFilenameAuthorityMissingIssueField
12. testRoadmapFilenameAuthorityMismatch
13. testRoadmapMigrateRoundTripNoDoubleEscape
14. testRoadmapEmptySourceGuard
15. testRoadmapInProcessRegenerateGuard

**NOTE:** The comment at line 12701 says "first 13 entries are marked sharedTmp:true" — this is STALE. The actual `SHARED_TMP_NAMES` array and `runSharedTmpGroup` body both contain **15** members. Trust the code, not the comment.

**Critical isolation constraint:** Selecting *any* shared-tmp scenario via `--only` causes the WHOLE group of 15 to run (enforced at main() line 13043 + 13060–13062). n2 cannot time an individual shared-tmp member — the group is one indivisible timing unit.

### `--only` selector syntax (from main() lines 13000–13073)

```
node scripts/simulate-workflow-walkthrough.js --only <token> [--only <token2> ...]
```

- Each `--only <token>` adds one token to the union
- Match rule: `entry.name === tok || entry.name.startsWith(tok)` — exact match OR prefix match
- Multiple tokens: union (any matching token includes the entry)
- Zero matches → stderr error + exit 1
- `--list` flag: prints all 246 scenario names (with `[shared-tmp group]` suffix on members) and exits 0
- If any matched entry is shared-tmp, the whole 15-member group runs before the self-contained selections

Examples:
```
# Single exact match (self-contained):
node scripts/simulate-workflow-walkthrough.js --only testSinkTransactionCleanEndToEnd

# Prefix match (all scenarios starting with "testAdaptive"):
node scripts/simulate-workflow-walkthrough.js --only testAdaptive

# Multiple tokens (union):
node scripts/simulate-workflow-walkthrough.js --only testE2EGitHub --only testFastE2E

# Force shared-tmp group to run (pick any member name):
node scripts/simulate-workflow-walkthrough.js --only testFinalize

# List all names for reference:
node scripts/simulate-workflow-walkthrough.js --list
```

### Subprocess call-site distribution in walkthrough

Static grep counts (source occurrences, not per-run count):
- `spawnSync`: 495 call-sites
- `execFileSync`: 10 call-sites
- `execSync`: 0 call-sites
- **Total: 505 static call-sites**

These are *source-level* occurrences including the `require` line and wrapper function definitions. The actual per-run subprocess count is far higher: the wrappers `runNode` (line 48, one spawnSync), `runClaimOnline` (line 4394), and `runClaimOnlineLastJson` (line 4416) are each invoked hundreds of times across 246 scenarios. The multiplication of wrapper invocations per scenario is what produces the ~574s runtime.

### Core subprocess helpers

- `runNode(script, args, cwd, extraEnv, opts)` — wraps `spawnSync`, 120s timeout, sets `KAOLA_WORKFLOW_OFFLINE:1` and `KAOLA_ENABLE_ADAPTIVE:0`
- `runClaimOnline(args, cwd, binDir)` — sets `KAOLA_WORKFLOW_OFFLINE:0`, uses gh mock shim
- `runClaimOnlineLastJson(args, cwd, binDir)` — same as above, returns last JSON line
- `initGitRepo(tmp)` — 5 git spawnSync calls (init -b main, config email, config name, add, commit)
- `initGitRepoWithBareRemote(tmp)` — 8 git calls (initGitRepo + init --bare, remote add, push -u)
- `adaptiveTmp(label)` — creates hermetic tmp directory for adaptive test scenarios

## Top suspect timing units for n2

### Two-level profiling strategy for n2

**Level 1: Time the 37 chain commands individually.** This confirms the walkthrough's share of the 574s vs the 36 preceding scripts (positions 1–36 combined likely contribute <60s based on subprocess counts). Use `time node scripts/<name>.js` for each. Key candidates: #16 test-adaptive-node.js (63 spawns), #14 test-claim-hardening.js (33 spawns).

**Level 2: Bisect the walkthrough via `--only`.** Use `--only <prefix>` to time scenario groups. Start with the scenarios below.

### Top suspect walkthrough scenarios (ordered by subprocess density estimate)

1. **`testStaleWorktreeCleanup`** (line ~5884) — 11 sub-cases, each calling `initGitRepo` + `git worktree add` + `runClaimOnline`. 11 × ~8 git ops + runClaimOnline = very high subprocess count. Self-contained. Time with: `--only testStaleWorktreeCleanup`

2. **`testE2EGitHubMergeFullChain`** (line 6301) — full worktree+finalize+sink-merge chain. Uses `initGitRepoWithBareRemote` (8 git ops) + multiple runNode + runClaimOnline calls. Time with: `--only testE2EGitHubMergeFullChain`

3. **`testFastE2EMergeFullChain`** (line 6666) — fast-path E2E equivalent of above. Time with: `--only testFastE2EMergeFullChain`

4. **`testE2EGitHubPrFullChain`** (line 6763) — PR-variant E2E. Time with: `--only testE2EGitHubPrFullChain`

5. **`testAdaptiveWorktreeProvisionedE2E`** (line 11986) — full adaptive E2E with provisioned worktree. Time with: `--only testAdaptiveWorktreeProvisionedE2E`

6. **`testSinkTransactionCleanEndToEnd`** (line 12586) — real git worktree add + full sink-merge transaction. Time with: `--only testSinkTransactionCleanEndToEnd`

7. **`testSinkTransactionCrashResume`** (line 12494) — 2 sink-merge runs with crash-resume. Time with: `--only testSinkTransactionCrashResume`

8. **`testAdaptiveVerdictCheck`** (line ~10123) — ~380 lines, many `runNode(adaptiveNodeScript)` calls (drives the full adaptive-node lifecycle). Time with: `--only testAdaptiveVerdictCheck`

9. **`testStaleWorktreeCheck`** (line ~5721) — multiple sub-cases with git worktrees. Time with: `--only testStaleWorktreeCheck`

10. **`testParallelIssueIndependence`** (line 6847) — 2 concurrent startups with real git repos. Time with: `--only testParallelIssueIndependence`

11. **Shared-tmp group (15 members, one unit)** — includes `testClaimStatusRelease`, `testFinalize`, `testRepair`, `testRepairFastPath`, `testRepairFastEscalation` plus roadmap tests. Cannot isolate members. Time with: `--only testClaimStatusRelease` (triggers the whole group). Expected to be significant due to claim+finalize+repair subprocess chains.

12. **`testAdaptivePatternLibrary`** (line ~10505) — many `validatePlanFixture` calls, each spawning the plan validator. Time with: `--only testAdaptivePatternLibrary`

### Grep discriminator for within-walkthrough real-git scenarios

Pattern `initGitRepo|git worktree|--sink` has ~291 hits in the walkthrough. Scenarios containing all three are the heaviest (real git repos + real worktrees + sink-merge transaction).

### Chain commands worth timing individually (non-walkthrough heavy hitters)

- `test-adaptive-node.js` (#16, 63 call-sites) — highest non-walkthrough subprocess density; may contribute 20–40s
- `test-claim-hardening.js` (#14, 33 call-sites) — known ~5.49s from prior run data
- `test-install-model-rendering.js` (#6, 10 call-sites)
- `test-bundle-claim.js` (#19, 10 call-sites)
- `test-release.js` (#25, 8 call-sites)
