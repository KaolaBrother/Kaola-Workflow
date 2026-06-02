# Phase 3 - Plan: issue-223

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/simulate-workflow-walkthrough.js` | Add 3 failing-first tests + register in main() | Write-failing-test-first (RED before fixes); covers root + Codex via byte-identity |
| `scripts/kaola-workflow-claim.js` | #13 checkClosureInvariants `!abandoned` guard; #14 claimProject EEXIST reclaim-stateless; #15 cmdPatchBranch isSafeName + activeByProject asserts | CANONICAL — the three fixes |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | `cp` from root (byte-identical) | COMMON_SCRIPTS parity (validate-script-sync gate) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Same 3 logical edits, forge-adapted (issue_iid var in #14 return) | Forge port; outside validate-script-sync scope |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same 3 logical edits, forge-adapted | Forge port |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | 3 forge regression tests | Forge claim/patch-branch currently untested |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | 3 forge regression tests | Forge regression net |

NOT modified: `kaola-workflow-closure-contract.js` (holds only the data array); `simulate-kaola-workflow-walkthrough.js` (Codex — byte-identical to root).

### Exact edits
**#13** (checkClosureInvariants, root :574): add `const abandoned = receipt && receipt.archive === 'abandoned';`; change `if (Number.isInteger(issueNumber) && issueNumber > 0) {` → `if (!abandoned && Number.isInteger(issueNumber) && issueNumber > 0) {` (wraps the two roadmap invariants).
**#14** (claimProject EEXIST, root :404-409):
```
if (e.code === 'EEXIST') {
  if (fs.existsSync(stateFile(root, project))) {
    return { status: 'target_occupied', issue: issueNumber, project, reasoning: 'local project folder exists' };
  }
  // orphaned stateless dir (crash between mkdir and writeState) — fall through and reclaim
} else { throw e; }
```
(forge: issueIid var in the return object). Happy path unchanged.
**#15** (cmdPatchBranch, root :734-744), after project/branch asserts, before updateState:
```
assert(isSafeName(args.project), 'unsafe project name');
assert(activeByProject(root, args.project), 'patch-branch requires an existing active folder');
```

### Tests (write-failing-first)
Root walkthrough (register in main ~:4340):
1. `testWatchPrAbandonedClosureInvariantsClean` — gh shim pr view {state:CLOSED}, plant .roadmap/issue-N.md + ROADMAP mirror #N; assert cleanups[0].receipt.archive==='abandoned' AND closure_invariants.ok===true. RED now (ok:false).
2. `testClaimReclaimsStatelessOrphanDir` — mkdir kaola-workflow/issue-888 (no state file); offline claim → 'acquired' + state file exists; negative: dir WITH active state → 'target_occupied'. RED now (target_occupied).
3. `testPatchBranchGuards` — (a) ghost-proj → nonzero, no folder, status count 0; (b) ../escape-poc → exit1 'unsafe project name', no traversal write; (c) positive: plant active issue-63, patch-branch succeeds. (a)/(b) RED now.
Forge (gitlab + gitea test-*-workflow-scripts.js): testWatchMrAbandonedClosureInvariantsClean, testClaimReclaimsStatelessOrphanDir, testPatchBranchGuards (withForge/tempRoot/spawnSync patterns).

### Build Sequence
1. Add 3 failing tests to root walkthrough → confirm RED. 2. Apply #13/#14/#15 to root claim.js → rerun root walkthrough GREEN. 3. `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`. 4. Hand-adapt gitlab + gitea claim copies. 5. Add 3 forge tests each. 6. CHANGELOG [Unreleased] entry (phase6).

### Acceptance
`node scripts/validate-script-sync.js` (root↔Codex byte-identity — MUST pass after step 3); `node scripts/simulate-workflow-walkthrough.js`; `npm test`; forge walkthroughs/suites.
