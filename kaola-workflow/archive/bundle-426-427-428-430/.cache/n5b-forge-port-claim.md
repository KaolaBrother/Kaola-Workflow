evidence-binding: n5b-forge-port-claim bc3d9f4f1fc8
non_tdd_reason: forge port mirror — mirrors root claim.js structural changes to forge-named ports with forge-specific adaptations; no new logic; regression-green four-chain verifies all editions
regression-green

## Summary

Node n5b-forge-port-claim mirrored all 8 accumulated root changes from n2/n3/n4/n5 (issues #426/#427/#428/#430) to both forge ports:

- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`

## Changes applied to each port

### Change 1: `verifyArchiveComplete` helper (#426)
Mirrored verbatim after `copyDir` in both ports. Pure filesystem logic, no forge adaptations needed.

### Change 2: `archiveProjectDir` restructure (#426)
Both ports: moved main/linked root resolution BEFORE any mutation; added `isLinkedRun` branch; for linked runs, uses `copyDir` + `verifyArchiveComplete` + delete-both-copies pattern instead of renameSync; returns `roadmap_removed_by_root`/`roadmap_residue` from the `statusValue === 'closed'` path.

### Change 3: `closeIssueIdempotent` function (#427)
- GitLab: uses `probeIssueState(n)` (already imported) + `forge.closeIssue(n, opts)` + `forge.updateIssue(n, { unlabels: [CLAIM_LABEL] })` for best-effort label removal.
- Gitea: uses `probeIssueState(n)` (already imported) + `forge.closeIssue(n, opts)` (label removal omitted — `updateIssueLabels` requires `projectInfo` not in scope; best-effort so tolerated).

### Change 4: `cmdFinalize` close-execution block (#427)
Both ports: added `cmdFinalizeMainRoot/LinkedRoot/IsLinkedRun` resolution after the `archiveProjectDir` call. Backstop `destDir` is now worktree-aware. `removeWorktree` call now uses `cmdFinalizeMainRoot` when in a linked run. Added `closeIssueIdempotent` loop after the probe bucket computation (guards: `!keepIssueOpen && !OFFLINE && !args.keepWorktree`). GitLab uses `issueIids`/`issueIid` variable names; Gitea uses `issueNumbers`/`issueNumber` to match existing port conventions.

### Change 5: `closure` receipt roll-up (#427)
Mirrored verbatim to both ports after `probe_degraded` attachment. GitLab uses `issueIids`/`issueIid`; Gitea uses `issueNumbers`/`issueNumber`.

### Change 6: `reconcileRoadmapForClosure` dual-root extension (#428)
Both ports: added `roadmapByRoot` map and `residue` array; added `thisRemovedWorktree`/`thisRemovedMain` tracking; added `#428` committed-file removal block (else-if on `onHead`); per-member dual-root record; residue tracking; main-root roadmap regeneration at the end. Return value extended with `roadmap_removed_by_root`/`roadmap_residue`.

### Change 7: cmdFinalize receipt attachments (#428)
Both ports: `anchored_root`, `roadmap_removed`, `roadmap_residue` attached post-build after `probe_degraded`. Resume reconcile path also surfaces `roadmap_removed_by_root`/`roadmap_residue`.

### Change 8: `cmdStartup` bundle path `target_set_mismatch` guard (#430)
Mirrored verbatim to both ports. Uses existing `stateFile`/`field` helpers present in both forge ports.

## Verification

### Baseline (pre-change)
All four chains passed before edits:
- claude: exit 0 (Kaola-Workflow walkthrough simulation passed)
- codex: exit 0 (Kaola-Workflow walkthrough simulation passed)
- gitlab: exit 0 (GitLab workflow walkthrough simulation passed, GitLab Codex workflow walkthrough simulation passed)
- gitea: exit 0 (Gitea workflow walkthrough simulation passed, Gitea Codex workflow walkthrough simulation passed)

### After-change verification
Sequential four-chain run: `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`
Exit code: 0 (ALL_CHAINS_EXIT:0)

Final sentinels observed:
- `Kaola-Workflow walkthrough simulation passed` (claude)
- `Kaola-Workflow walkthrough simulation passed` (codex)
- `GitLab workflow walkthrough simulation passed` + `GitLab Codex workflow walkthrough simulation passed`
- `Gitea workflow walkthrough simulation passed` + `Gitea Codex workflow walkthrough simulation passed`
