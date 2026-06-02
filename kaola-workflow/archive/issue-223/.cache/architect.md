# Architect — issue-223 (research + blueprint)

## Critical corrections to issue text (verified)
- checkClosureInvariants is in claim.js (root :574), NOT closure-contract.js (that module only holds the CLOSURE_INVARIANTS data array). #13 edits only the 4 claim.js copies; closure-contract.js gets NO edit (its BYTE_IDENTICAL_GROUP is a red herring here).
- Stale line numbers. Real (root claim.js): claimProject mkdir window :402-409 (EEXIST :404-409), writeState :416; watch-pr CLOSED branch :1032-1053 (checkClosureInvariants call :1051); cmdPatchBranch :734-744.
- All three bugs reproduce in current tree (live repros confirmed).

## Design decisions (verified against real code)
- #13: read receipt.archive — NO signature change. receipt.archive==='abandoned' only at watch CLOSED sites; never finalize/MERGED/sink-merge (sink-merge.js:262 sets only 'closed'/'failed'; claim.js:693,1022 'closed'/'skipped'). Mode-param rejected (would ripple 4 claim + 4 sink-merge).
- #14: RECLAIM STATELESS DIR (option 2), NOT atomic temp+rename (option 1). Temp+rename doesn't deliver claim atomicity (provisionWorktree runs between mkdir and writeState — rename only makes the state write atomic). Option 2 leaves the every-issue happy path byte-for-byte untouched (the named risk constraint) AND recovers non-empty orphans (rename-onto-non-empty → ENOTEMPTY). Change confined to the EEXIST branch.
- #15: guard with activeByProject (NOT existsSync(projectDir) — true for a #14 orphan dir → would still write partial state → status:unknown phantom). activeByProject returns null for stateless/inactive dirs.

## Edition/byte-sync matrix (md5-verified)
| File | Group | #13 | #14 | #15 |
| scripts/kaola-workflow-claim.js | COMMON_SCRIPTS canonical | edit | edit | edit |
| plugins/kaola-workflow/scripts/kaola-workflow-claim.js | byte-identical to root (validate-script-sync) | cp from root | cp | cp |
| plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js | forge-adapted (glab, issue_iid, MR) | edit forge-adapted | edit | edit |
| plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js | forge-adapted (tea) | edit forge-adapted | edit | edit |
| scripts/kaola-workflow-closure-contract.js (+3) | BYTE_IDENTICAL_GROUP | NO edit | NO edit | NO edit |
Root+Codex claim.js md5-identical (2cdbc31f). Implement in root, cp to Codex. Forge copies hand-adapted (different filenames/sizes, NOT in validate-script-sync scope). All target functions present in all 4 editions. Watch divergence (cmdWatchPr vs watchMergeRequests) IRRELEVANT to #13 (only checkClosureInvariants edited; CLOSED branches already set archive:'abandoned').

## Exact edits
### #13 checkClosureInvariants (root :574-628)
Add at top: `const abandoned = receipt && receipt.archive === 'abandoned';`
Change outer guard from `if (Number.isInteger(issueNumber) && issueNumber > 0) {` to `if (!abandoned && Number.isInteger(issueNumber) && issueNumber > 0) {` (wraps the two roadmap invariants :577-591). archive-state-closed (:615) already accepts 'abandoned'; label/active-folder/branch-worktree invariants stay.
### #14 claimProject EEXIST (root :404-409)
```
catch (e) {
  if (e.code === 'EEXIST') {
    if (fs.existsSync(stateFile(root, project))) {
      return { status: 'target_occupied', issue: issueNumber, project, reasoning: 'local project folder exists' };
    }
    // orphaned stateless dir (crash between mkdir and writeState) — fall through and reclaim
  } else { throw e; }
}
```
Happy path (mkdir succeeds) unchanged. stateFile(root,project) helper exists (:262). Forge copies use issueIid var in the return.
### #15 cmdPatchBranch (root :734-744), after the project/branch asserts, BEFORE updateState:
```
assert(isSafeName(args.project), 'unsafe project name');
assert(activeByProject(root, args.project), 'patch-branch requires an existing active folder');
```
isSafeName (imported :10) + activeByProject (:382) in scope all editions.

## Tests (write-failing-first)
Root scripts/simulate-workflow-walkthrough.js (register in main ~:4340):
1. testWatchPrAbandonedClosureInvariantsClean — gh shim pr view {state:CLOSED}, plant .roadmap/issue-N.md + ROADMAP mirror #N; assert cleanups[0].receipt.archive==='abandoned' AND closure_invariants.ok===true. (RED now: ok:false, violations roadmap-source-absent+roadmap-mirror-clean.)
2. testClaimReclaimsStatelessOrphanDir — mkdir kaola-workflow/issue-888 no state file; offline claim → 'acquired' + state file now exists; negative: dir WITH active state → 'target_occupied'. (RED now: permanent target_occupied.)
3. testPatchBranchGuards — (a) ghost-proj → nonzero, no folder, status.count 0; (b) ../escape-poc → exit1 'unsafe project name', no traversal write; (c) positive: plant active issue-63, patch-branch succeeds. (a/b RED now.)
Forge test-gitlab/gitea-workflow-scripts.js (patch-branch/claim-orphan currently UNTESTED in forge): testWatchMrAbandonedClosureInvariantsClean, testClaimReclaimsStatelessOrphanDir, testPatchBranchGuards (withForge/tempRoot/spawnSync patterns).
Codex simulate-kaola-workflow-walkthrough.js: NO new tests (byte-identical to root).

## Build sequence
1. Add 3 failing tests to root walkthrough; confirm RED. 2. Apply #13/#14/#15 to root claim.js; rerun → GREEN. 3. cp root → Codex. 4. Hand-adapt forge gitlab+gitea claim copies. 5. Add 3 forge tests each. 6. CHANGELOG entry.

## Acceptance
node scripts/validate-script-sync.js (root↔Codex byte-identity gate — MUST pass after step 3); node scripts/simulate-workflow-walkthrough.js; npm test; forge walkthroughs.
