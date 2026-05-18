# Phase 2 — Ideation: issue-64

## Approaches Evaluated

### Option A: New standalone `scripts/kaola-workflow-active-folders.js`

- Summary: Create a new top-level script that both `kaola-workflow-classifier.js`
  and `kaola-workflow-claim.js` `require()`. Owns `readActiveFolders` and
  re-exports `isIssueClosed` (or duplicates `ghExec`/`OFFLINE` logic).
- Pros: Single-responsibility module; easy discoverability; clean separation
  from the 2,895-line `claim.js`.
- Cons: `scripts/validate-script-sync.js` `COMMON_SCRIPTS` allowlist (confirmed
  at lines 39-47) must be extended; a byte-identical sibling must be created
  in `plugins/kaola-workflow/scripts/`. To consume `isIssueClosed` the new
  module either creates a cycle (`require('./kaola-workflow-claim.js')`) or
  duplicates `ghExec`/`OFFLINE` (drift — exactly what the validator was built
  to prevent).
- Risk: Medium (sync drift, dependency cycle).
- Complexity: Medium.

### Option B: Export `readActiveFolders` and `isIssueClosed` from `scripts/kaola-workflow-claim.js`

- Summary: Add `readActiveFolders` next to `isIssueClosed` in `claim.js`. Add
  both to `module.exports` (currently at lines 2888-2893). Classifier does
  `require('./kaola-workflow-claim.js')` and consumes them. Matches the
  existing precedent at `scripts/kaola-workflow-sink-merge.js:5` (confirmed:
  `const { getCoordRoot, removeWorktree } = require('./kaola-workflow-claim.js');`).
- Pros: Zero sync-validator change. Helpers stay co-located with their domain
  (`ghExec`, `OFFLINE`, lock primitives, `isSafeName`, `field`). Single edit
  point per change. No new file in either tree. Per-call `isIssueClosed`
  memoization is trivial inside this module.
- Cons: Grows `claim.js` from 2,895 to ~2,950 lines (already over the
  CLAUDE.md <800-line guideline — the codebase has accepted this).
- Risk: Low.
- Complexity: Small.

### Option C: New `scripts/lib/` directory

- Summary: Create a `scripts/lib/` convention for shared helpers and house
  `readActiveFolders` (and future extractions) there.
- Pros: Establishes a future-proof shared-helpers convention.
- Cons: `validate-script-sync.js` checks a flat allowlist — adding `lib/`
  requires either listing each file or reworking the scanner. Convention must
  be mirrored in `plugins/kaola-workflow/scripts/lib/`. YAGNI: one helper does
  not justify a directory. Sets precedent that invites further splitting and
  complicates `require()` paths in callers.
- Risk: Medium-High (validator rework, new convention overhead).
- Complexity: Large.

## Advisor Findings

(Full text: `.cache/advisor-ideation.md`.) Advisor confirmed Option B and
flagged three additions:

1. **Per-call memo for `isIssueClosed`** — a `Map<number, boolean>` scoped to a
   single `readActiveFolders` call avoids duplicate `gh issue view` round-trips
   when scanning N active folders. Trivial now, awkward to retrofit. Do NOT
   defer.
2. **Explicit test-scenario inventory** in Phase 2 so Phase 3 has a concrete
   write set:
   - Folder-based overlap (red exact-path; yellow shared-infra) — replaces
     existing lock-planting cases.
   - Closed-issue residue ignored (active folder + closed GH issue → not in
     overlap, not picked by startup).
   - Lock-without-folder ignored (lock file present, no folder → no overlap
     contribution).
   - `status: released` folder excluded.
3. **Sync to plugin tree + `node scripts/validate-script-sync.js` must run
   after each caller migration**, not once at the end. Phase 3's task
   ordering must make this explicit; an intermediate commit would otherwise
   fail the validator.

Advisor verifications run before approval:

- `grep -n "require" scripts/kaola-workflow-sink-merge.js` →
  `5:const { getCoordRoot, removeWorktree } = require('./kaola-workflow-claim.js');`
- `head -50 scripts/validate-script-sync.js` → `COMMON_SCRIPTS` allowlist
  confirmed with `kaola-workflow-claim.js` and `kaola-workflow-classifier.js`
  present; simulator NOT on the allowlist.

## Selected Approach

**Option B — Export `readActiveFolders` and `isIssueClosed` from
`scripts/kaola-workflow-claim.js`.**

Rationale: the hidden `validate-script-sync.js` allowlist constraint plus the
existing `sink-merge.js → claim.js` precedent make Option B the lowest-risk,
lowest-friction placement. Co-location with `ghExec`/`isIssueClosed` keeps the
GH integration single-sourced and lets the helper add free `KAOLA_WORKFLOW_OFFLINE`
support and per-call memoization without any new module surface.

### API shape

```js
readActiveFolders(coordRoot, root, opts = {})
//   opts: { includeClosedIssues = false, isIssueClosedFn = isIssueClosed }
//   returns: Array<{ project, issueNumber, status, path, stateContent }>
```

- Array (not Set): `scanClaimedOverlap` needs `project` + `path`.
- Include `stateContent`: avoids re-reading `workflow-state.md` in callers.
- Default filter `status === 'active'`: mirrors `readActiveStateIssueNumbers`;
  `released` excluded by value.
- Injectable `isIssueClosedFn`: simulator fixtures stub closed-issue checks
  without spawning `gh`.
- Both roots scanned: `{coordRoot}/kaola-workflow/` and `{root}/kaola-workflow/`,
  de-duped by project name.
- Internal `Map<number, boolean>` memo around `isIssueClosedFn` calls per
  invocation.
- `isIssueClosed` added to `module.exports` next to `analyzeIssue` /
  `computeRecovery` (lines 2888-2893).

### Caller migration

- **Phase 4a — classifier**: replace `readLockFiles` (lines 87-99) and
  `readActiveStateIssueNumbers` (101-116) call site at `cmdClassify` line 370
  with `readActiveFolders`. `scanClaimedOverlap` now takes
  `Array<{project, path, ...}>` instead of lock objects; only the `lock.project`
  read at the top of its loop changes, the overlap math is untouched.
- **Phase 4b — claim.js folder-selection callers**: migrate
  `issueAlreadyClaimed` (line 444-447) and the folder-selection branch of
  `ownedActiveProject` (line 414) to call `readActiveFolders`. Keep
  `readLockFiles` and lease-enforcement consumers in place (cmdSweep at 2138,
  watch-pr / tick paths at 1867, 1979, 2031, 2252).

### Test plan

Four simulator scenarios in `scripts/simulate-workflow-walkthrough.js`
(append/parallel Epic Case 6 starting line 892):

1. Folder-based overlap RED — two active folders, one with `phase3-plan.md`
   touching `scripts/kaola-workflow-claim.js`; classifier verdict for a
   candidate that touches the same file → `red`.
2. Folder-based overlap YELLOW — same setup but candidate touches a
   `SHARED_INFRA` area (`scripts`, `hooks`, `plugins/kaola-workflow/scripts`)
   → `yellow`.
3. Closed-issue residue ignored — active folder with `status: active` but the
   linked GH issue (via shim) returns CLOSED; classifier verdict ignores the
   folder; startup pick-next does not select it.
4. Lock-without-folder ignored — plant a `.locks/*.lock` with no
   corresponding folder; classifier returns `green` (no overlap contribution).
5. `status: released` excluded — folder with `status: released` does not
   contribute to overlap.

## Out of Scope (explicit)

- Removing `readLockFiles` from `claim.js`. Lease enforcement still needs it.
- Changing overlap math in `scanClaimedOverlap` (extractFilePaths /
  extractCoarseAreas / parseAreaLabelsFromText / SHARED_INFRA yellow vs red).
  Only the enumerator changes.
- Widening the `status === 'active'` filter to include `released`.
- Extracting `ghExec` or `isSafeName` (separate cleanup; current duplication
  between classifier and claim.js stays).
- Removing locks / sessions / tickers / heartbeat / sweep. That is #63
  Phase β.
- GitLab work.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
