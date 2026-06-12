evidence-binding: n4-impl-roadmap-428 ee8dcb89d177
non_tdd_reason: glue/wiring — connects existing reconcileRoadmapForClosure worktree-detection logic to the committed-on-HEAD removal path; no new behavioral unit exists without the full worktree+git filesystem fixture (covered by existing integration tests).
regression-green

## Task

Fix issue #428: dual-root roadmap removal in `reconcileRoadmapForClosure`.

When `cmdFinalize` runs inside a linked worktree, `reconcileRoadmapForClosure` only removed the `.roadmap/issue-N.md` source file from the worktree tree root, never from the MAIN repo tree. After worktree removal, the main repo retained stale roadmap source files, leaving ROADMAP.md listing closed issues.

## Changes Made

### `scripts/kaola-workflow-claim.js` + `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-identical)

**`reconcileRoadmapForClosure` function (lines ~1410-1516)**:

- Added `roadmapByRoot = {}` and `residue = []` initialized at function top.
- Added dual-root tracking variables `thisRemovedWorktree` and `thisRemovedMain` per member.
- Added `#428` branch inside the existing `if (mainRoot && mainRoot !== linkedRoot)` block:
  - When file IS committed on main's HEAD AND `keepWorktree` is false: remove the working-tree file in main + stage the deletion via `git rm --cached --force --ignore-unmatch`.
  - When file IS committed on main's HEAD AND `keepWorktree` is true: skip staging on main (the feature-branch archive commit carries the deletion at sink-merge time); set `thisRemovedMain = 'kept'`.
  - The `!onHead` staged-ADD orphan path (#297/#403.7) is unchanged.
- Built per-member `roadmapByRoot[issueN] = { worktree: bool, main: bool }` after each member.
- Tracked residue (files surviving despite removal attempt) conditionally (skip main residue when `keepWorktree` to avoid false positives).
- Added main-root ROADMAP.md regeneration after the loop, gated on `!(opts.keepRoadmapSource) && !(opts.keepWorktree)`.
- Extended return value with `roadmap_removed_by_root` and `roadmap_residue`.

**`archiveProjectDir` function (statusValue === 'closed' path)**:

- Early-returned with `roadmap_removed_by_root` and `roadmap_residue` fields from the reconcile call.

**`cmdFinalize` (resume path, ~line 1844)**:

- Surfaced `roadmap_removed_by_root` and `roadmap_residue` from the resume reconcile call.

**`cmdFinalize` (receipt attachment, ~line 1980-1984)**:

- Updated comment: "n3 will add it" → "added to CLOSURE_RECEIPT_FIELDS in n3; kept here".
- Added `#428: dual-root roadmap receipt` block attaching `roadmap_removed` and `roadmap_residue` to `closureReceipt`.

### `scripts/kaola-workflow-closure-contract.js` + 3 byte-identical plugin copies

**Part B.a**: Added `anchored_root: 'string'` to `CLOSURE_RECEIPT_FIELDS` (after `keep_open_requested`).

**Part B.b**: Added `{ id: 'roadmap-residue-clean', ... }` to `CLOSURE_INVARIANTS`.

**Minor**: Updated "The ten closure invariants" comment to "The closure invariants" (avoids stale count).

## Key Design Decisions

1. **keepWorktree guard**: When `--keep-worktree` is used, the archive commit on the feature branch carries the deletion of the roadmap source. Staging the deletion on main immediately would leave main's index dirty, violating the existing regression lock (#297 R1) in `testFinalizeFromLinkedWorktreeCleansRoadmapEntry`. So the main-root deletion is skipped for `keepWorktree` runs.

2. **keepWorktree + main regeneration**: Also gated — the main ROADMAP.md regeneration is skipped when `keepWorktree` is true to prevent leaving an untracked file that would block the subsequent `git checkout` during sink-merge (caught by `testE2EGitHubMergeFullChain`).

## Verification Commands + Results

### Baseline (before changes)
```
npm run test:kaola-workflow:claude  # exit 0 (task bgoeon3n3)
```

### After changes
```
npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && \
  npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
# exit 0 (task brb0065dx — all four chains green)
```

### Byte-pair verification
```
diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
diff scripts/kaola-workflow-closure-contract.js plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js
diff scripts/kaola-workflow-closure-contract.js plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js
diff scripts/kaola-workflow-closure-contract.js plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js
# ALL DIFFS EMPTY
```

## Write Set (files changed)

- `scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-identical twin)
- `scripts/kaola-workflow-closure-contract.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js` (byte-identical)
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js` (byte-identical)
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js` (byte-identical)
