# Planner — Issue #64

## TL;DR

**Recommend Option B: Export `readActiveFolders` and `isIssueClosed` from `scripts/kaola-workflow-claim.js`.** It is the only option with zero new sync-validator surface, follows direct precedent (`scripts/kaola-workflow-sink-merge.js:5` already does `require('./kaola-workflow-claim.js')`), and keeps the helpers co-located with their domain.

## Discriminating constraint surfaced during orientation

`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/scripts/validate-script-sync.js` enforces a hand-curated `COMMON_SCRIPTS` allowlist that requires byte-identical copies in `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/plugins/kaola-workflow/scripts/`. `kaola-workflow-claim.js` and `kaola-workflow-classifier.js` are already on the allowlist. Any new top-level script (Option A) or new directory convention (Option C) requires changes to this validator AND a new plugin-tree sibling.

## Option comparison

### Option A — New standalone `scripts/kaola-workflow-active-folders.js`
- Pros: Single-responsibility module. Easy to find. Conceptually clean.
- Cons: Requires extending `COMMON_SCRIPTS` and creating byte-identical sibling. If helper needs `isIssueClosed`, must either duplicate `ghExec`/`OFFLINE` (drift) or `require()` claim.js back (cycle).
- Risk: Medium. Complexity: M.
- Fit: Inconsistent. Existing pattern (`sink-merge.js`) is "require from claim.js".

### Option B — Export from `scripts/kaola-workflow-claim.js`
- Pros: Zero sync-validator change. Direct precedent in `kaola-workflow-sink-merge.js`. Helpers stay with their domain (`ghExec`, `isIssueClosed`, lock primitives). Single edit point. No new file in either tree.
- Cons: Grows `claim.js` by ~30-60 lines (already 2,895 lines).
- Risk: Low. Complexity: S.
- Fit: Matches existing `sink-merge.js → claim.js` precedent.

### Option C — New `scripts/lib/` directory
- Pros: Establishes shared-helpers convention.
- Cons: `validate-script-sync.js` checks a flat allowlist; adding `lib/` requires scanner rework. YAGNI for one helper.
- Risk: Medium-High. Complexity: L.
- Fit: Premature.

## API shape

```js
readActiveFolders(coordRoot, root, opts = {})
//   opts: { includeClosedIssues = false, isIssueClosedFn = isIssueClosed }
//   returns: Array<{ project, issueNumber, status, path, stateContent }>
```

- Array, not Set: `scanClaimedOverlap` needs `project` + `path`.
- Include `stateContent`: avoids re-reading `workflow-state.md` in callers.
- Default filter `status === 'active'`: mirrors `readActiveStateIssueNumbers`. `released` excluded.
- Injectable `isIssueClosedFn`: simulator fixtures stub closed-issue checks without spawning `gh`.
- `isIssueClosed` stays a separate export (used independently by `cmdSweep`).
- OFFLINE behavior: when `KAOLA_WORKFLOW_OFFLINE=1`, default `isIssueClosed` returns `false` — closed-issue filter becomes a no-op for free.
- Both roots scanned: `{coordRoot}/kaola-workflow/` and `{root}/kaola-workflow/`, de-duped by project name (mirrors `readLockFiles`).

## Migration order — classifier first, then claim.js

1. **Phase 4a — Classifier migration**: Remove `readLockFiles` (lines 87-99) and `readActiveStateIssueNumbers` (101-116). Retrofit `cmdClassify` call site at 370-371. Switch `scanClaimedOverlap` to consume `readActiveFolders` output. Run simulator. Sync to plugin tree. Run `validate-script-sync.js`.
2. **Phase 4b — Claim.js folder-enumeration callers**: Migrate folder-selection consumers only:
   - `issueAlreadyClaimed` at 444-447 (uses `activeStateIssueNumbers`).
   - `ownedActiveProject` at 403-425 (its `activeStateProjects` branch at 414; `readLockFiles` branch at 405 stays — that's lease enforcement).
   - Other consumers of `activeStateSessions/Projects/IssueNumbers` are inventoried; helpers may become thin wrappers.
3. **Out-of-scope**: `readLockFiles` stays. Lease-enforcement call sites (cmdSweep at 2138, watch-pr/tick at 1867, 1979, 2031, 2252) continue to use it directly.

## Risks and mitigations

- **Risk**: Forgetting to byte-copy `claim.js` and `classifier.js` to `plugins/kaola-workflow/scripts/`.
  - **Mitigation**: Phase 4 plan must include an explicit sync step + `node scripts/validate-script-sync.js` at the end of each task.
- **Risk**: Simulator Epic 6F2 (line 1061-1089) plants `workflow-state.md` directly to exercise the active-state path. Helper must recognize this fixture.
  - **Mitigation**: API preserves `status: active` filter and `issue_number` parsing. Walk-through re-runs validate.
- **Risk**: `claim.js` already exceeds <800-line guideline (2,895 lines). Option B grows it further.
  - **Mitigation**: Accept for this task. Splitting `claim.js` is its own multi-issue refactor.

## Out-of-scope (confirmed)

- Do NOT remove `readLockFiles` from `claim.js`. Lease enforcement still needs it.
- Do NOT change overlap math in `scanClaimedOverlap`. Only the enumerator changes.
- Do NOT widen `status === 'active'` filter to include `released`.
- Do NOT extract `ghExec` or `isSafeName` (separate cleanup).

## Relevant absolute file paths

- `scripts/kaola-workflow-classifier.js`
- `scripts/kaola-workflow-claim.js`
- `scripts/kaola-workflow-sink-merge.js` (precedent for Option B)
- `scripts/validate-script-sync.js` (sync constraint)
- `scripts/simulate-workflow-walkthrough.js` (Epic 6F2 at 1061-1089)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-identical sync target)
- `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` (byte-identical sync target)
