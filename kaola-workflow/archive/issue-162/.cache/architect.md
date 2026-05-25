# Code Architect — issue-162

## Key Findings From Code Analysis

1. **Schema is already correct and complete.** `scripts/kaola-workflow-closure-contract.js` already defines `roadmap_source_removed: ['removed', 'absent', 'failed']` and `roadmap_regenerated: ['regenerated', 'skipped', 'failed']`. The task brief showed `roadmap_regenerated: ['regenerated', 'failed']` (missing `'skipped'`) and showed CLOSURE_INVARIANTS keyed by `name` — the real file keys them by **`id`**. `checkClosureInvariants` must look up by `.id`. **closure-contract.js needs NO change.**

2. **closure-contract is not yet required by any claim script.** All four claim scripts will need a new `require('./kaola-workflow-closure-contract')`.

3. **The roadmap-cleanup block is structurally identical across all 3 scripts.** Only divergence in `archiveProjectDir` is above it: GitHub copy calls `removeLegacyStateBlocks(content)` (line 505); GitLab/Gitea do not. That divergence is out of scope.

4. **BYTE_IDENTICAL_GROUPS and COMMON_SCRIPTS confirmed.** Changes to `scripts/kaola-workflow-claim.js` must be byte-identical in `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`.

5. **docs/api.md already documents the schema** with a `#162` flow-mapping row at line 468 describing current best-effort behavior. Must update to reflect observable receipt.

## Design Decisions

- **D1**: Receipt fields only on `archived:true`/closed path; `skipped`/`abandoned` unchanged.
- **D2**: Named-error capture; never re-throw. `'failed'` is the fallthrough; invariant check is the observable gate.
- **D3**: ENOENT -> `'absent'` (valid state, not failure).
- **D4**: Separate try blocks for unlink and regen so failures are independently reported.
- **D5**: `checkClosureInvariants(root, receipt)` is filesystem-only; returns `{ ok, violations }`, does NOT throw. Checks `roadmap-source-absent` and `roadmap-mirror-clean` by `.id`.
- **D6**: `cmdWatchPr` surfaces failures via `warnings` array.

## Files to Modify

| # | File | Changes |
|---|------|---------|
| 1 | `scripts/kaola-workflow-claim.js` | (a) add require for closure-contract; (b) replace `catch (_) {}` block with named-capture; (c) add receipt fields to closed-path return; (d) add `checkClosureInvariants` helper; (e) `cmdFinalize` calls it and merges into output; (f) `cmdWatchPr` captures return and emits warnings |
| 2 | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical to #1 (COMMON_SCRIPTS enforced) |
| 3 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Same logical changes; GitLab naming; manual sync |
| 4 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same logical changes; Gitea naming; manual sync |
| 5 | `scripts/simulate-workflow-walkthrough.js` | Add 2 new tests + extend 2 existing tests + register |
| 6 | `docs/api.md` | Update #162 flow-mapping row; add receipt emission note |
| 7 | `CHANGELOG.md` | Add [Unreleased] entry |

**No files to create.** `checkClosureInvariants` lives inside each claim script.

## Receipt-Block Target Shape

Replace the closed-path roadmap block in all 4 scripts:

```js
let roadmapSourceRemoved = 'absent';
let roadmapRegenerated = 'skipped';
if (statusValue === 'closed') {
  if (Number.isInteger(archiveIssueNumber) && archiveIssueNumber > 0) {
    const roadmapFilePath = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + archiveIssueNumber + '.md');
    try {
      fs.unlinkSync(roadmapFilePath);
      roadmapSourceRemoved = 'removed';
    } catch (e) {
      roadmapSourceRemoved = (e.code === 'ENOENT') ? 'absent' : 'failed';
    }
  }
  try {
    roadmapModule.regenerateRoadmap(root);
    roadmapRegenerated = 'regenerated';
  } catch (_) {
    roadmapRegenerated = 'failed';
  }
}
// Return:
return { archived: true, dest, roadmap_source_removed: roadmapSourceRemoved, roadmap_regenerated: roadmapRegenerated };
```

## `checkClosureInvariants` helper

```js
function checkClosureInvariants(root, receipt) {
  const violations = [];
  const issueNumber = receipt.issue_number;
  if (Number.isInteger(issueNumber) && issueNumber > 0) {
    // roadmap-source-absent
    const roadmapFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + issueNumber + '.md');
    if (fs.existsSync(roadmapFile)) {
      const inv = closureContract.CLOSURE_INVARIANTS.find(i => i.id === 'roadmap-source-absent');
      violations.push({ id: 'roadmap-source-absent', description: inv ? inv.description : 'roadmap source file still present' });
    }
    // roadmap-mirror-clean
    const roadmapMirror = path.join(root, 'kaola-workflow', 'ROADMAP.md');
    try {
      const content = fs.readFileSync(roadmapMirror, 'utf8');
      if (content.includes('#' + issueNumber)) {
        const inv = closureContract.CLOSURE_INVARIANTS.find(i => i.id === 'roadmap-mirror-clean');
        violations.push({ id: 'roadmap-mirror-clean', description: inv ? inv.description : 'ROADMAP.md still lists issue as active' });
      }
    } catch (_) { /* ROADMAP.md absent — not a violation */ }
  }
  return { ok: violations.length === 0, violations };
}
```

## `cmdFinalize` change

After `archiveProjectDir` call, add:
```js
const invariantResult = checkClosureInvariants(root, { issue_number: archiveIssueNumber, ...archiveResult });
output({ status: 'closed', archived: true, dest: archiveResult.dest,
  roadmap_source_removed: archiveResult.roadmap_source_removed,
  roadmap_regenerated: archiveResult.roadmap_regenerated,
  closure_invariants: invariantResult });
```

## `cmdWatchPr` change

Capture return and emit warnings:
```js
const archiveResult = archiveProjectDir(root, folder, prState === 'MERGED' ? 'closed' : 'abandoned');
if (archiveResult && (archiveResult.roadmap_source_removed === 'failed' || archiveResult.roadmap_regenerated === 'failed')) {
  warnings.push({ folder, roadmap_source_removed: archiveResult.roadmap_source_removed, roadmap_regenerated: archiveResult.roadmap_regenerated });
}
```

## Build Sequence

1. Verify `scripts/kaola-workflow-closure-contract.js` (no changes needed)
2. **Task A** — GitHub pair (scripts/ + Codex, byte-identical) — parallel-safe with B, C, E
3. **Task B** — GitLab claim script — parallel-safe with A, C, E
4. **Task C** — Gitea claim script — parallel-safe with A, B, E
5. **Task D** — Tests in simulate-workflow-walkthrough.js — depends on A
6. **Task E** — Docs (api.md + CHANGELOG.md) — independent

## Parallelization Plan

| Group | Tasks | Why Safe |
|-------|-------|---------|
| P1 | A, B, C, E | Disjoint write sets |
| P2 | D | Depends on A (walkthrough invokes scripts/ claim script) |

**Note**: Tasks A's two files (scripts/ + Codex) MUST be byte-identical — produce as one diff by same agent.

## Test Locations

- **Extend `testFinalizeCleansRoadmapEntry` (line 2054):** assert `result.roadmap_source_removed`, `result.roadmap_regenerated`, `result.closure_invariants.ok`
- **Extend `testFinalizeFromLinkedWorktreeCleansRoadmapEntry` (line 2084):** same assertions from linked-worktree run
- **New `testFinalizeRoadmapCleanupFailureReceipt`:** replace `.roadmap/issue-N.md` with a directory of same name (EISDIR/EPERM, not ENOENT); assert finalize exits 0, `roadmap_source_removed === 'failed'`, `closure_invariants.ok === false`
- **New `testWatchPrRoadmapCleanupWarning`:** use gh shim + MERGED state + corrupt .roadmap source; assert `output.warnings` non-empty
- Register both new tests in `main()` after line 2312

## Validation Commands

| Task | Command |
|------|---------|
| A — byte-identity | `node scripts/validate-script-sync.js` |
| A/B/C — modules load | `node -e "require('./scripts/kaola-workflow-claim.js')"` (and GitLab/Gitea) |
| D — regression | `node scripts/simulate-workflow-walkthrough.js` |
| E — docs/schema sync | `node scripts/validate-workflow-contracts.js && node scripts/validate-kaola-workflow-contracts.js` |
| Full gate | `node scripts/simulate-workflow-walkthrough.js && node scripts/validate-script-sync.js && npm test` |

## Open Verification For Implementer

GitLab/Gitea editions may use `cmdWatchMr`/`watch-mr`. Grep each forge claim script for watch command name before editing.

## Explicit Out-of-Scope

- Modifying `kaola-workflow-closure-contract.js` schema
- Fixing GitLab/Gitea missing `removeLegacyStateBlocks` divergence
- Other 5 invariants (#163/#164/#165 scope)
- Shared closure executor / `emptyReceipt`-based full-receipt flow (#164)
- `release`/`abandoned` paths
