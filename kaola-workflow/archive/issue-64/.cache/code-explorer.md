# Code Explorer — Issue #64

## 1. Existing Lock-File Readers

### `readLockFiles` in classifier
- `scripts/kaola-workflow-classifier.js:87-99` — `readLockFiles(coordRoot, root)`
- Scans `{coordRoot}/kaola-workflow/.locks/*.lock` and `{root}/kaola-workflow/.locks/*.lock` (deduped)
- Returns parsed JSON lock objects
- Called by `cmdClassify` at `scripts/kaola-workflow-classifier.js:370`

### `readLockFiles` in claim.js (duplicate)
- `scripts/kaola-workflow-claim.js:310-324`
- Uses `locksDir(coordRoot)` helper (line 292)
- Identical logic
- Classifier comment line 11 explicitly: `"// Shared utilities (copied from kaola-workflow-claim.js)"`
- Called at: 405, 445, 1867, 1979, 2031, 2252, 2867

### `readActiveStateIssueNumbers` — two copies
- `scripts/kaola-workflow-classifier.js:101-116` — iterates `kaola-workflow/` dirs, excludes `archive` + dot-dirs, reads `workflow-state.md`, checks `status: active`, extracts `issue_number`
- `scripts/kaola-workflow-claim.js:427-442` — identical; called at line 445 in `issueAlreadyClaimed`

### All `.locks` reads (grep)
- `scripts/kaola-workflow-classifier.js:90`
- `scripts/kaola-workflow-claim.js:292, 310, 312`
- `scripts/kaola-workflow-claim.js:113` (migration sweep — legacy)
- `scripts/simulate-workflow-walkthrough.js:20` (`locksDirFor` test helper)

### Existing folder scanners (already iterating projects)
- `activeStateSessions()` — `scripts/kaola-workflow-claim.js:358-376` — returns session_ids of `status: active` dirs
- `activeStateProjects()` — `scripts/kaola-workflow-claim.js:378-401` — returns `{project, session_id, issue_number}` objects
- `activeStateIssueNumbers()` — `scripts/kaola-workflow-claim.js:427-442` — returns `Set<number>` of active issue numbers
- `readActiveStateIssueNumbers()` — classifier duplicate of above
- `cmdSweep()` second pass — `scripts/kaola-workflow-claim.js:2186-2221` — GC iterator over `kaola-workflow/`

**Common exclusion**: `entry.name === 'archive' || entry.name.startsWith('.')`

## 2. Overlap Semantics

`scanClaimedOverlap()` — `scripts/kaola-workflow-classifier.js:242-294`.

**Lock data usage**: only `lock.project` (string like `issue-64`) used to construct `kaola-workflow/{lock.project}/`. Lock carries NO file-path info.

**Data sources** (from project folder):
- `phase3-plan.md`
- `phase1-research.md`
- Concatenated → `combined` at line 263

**Extracted into 3 sets**:
- `extractFilePaths(combined)` → exact repo-relative paths (e.g. `scripts/kaola-workflow-claim.js`)
- `extractCoarseAreas(combined)` → top-level dir names (e.g. `scripts`, `commands`)
- `parseAreaLabelsFromText(combined)` → `area:foo` label names

**Intersection (lines 268-289)**:
- candidatePath ∈ claimedPaths → `hasExactOverlap=true` → verdict `red`
- candidateArea ∈ claimedAreas AND area ∉ `SHARED_INFRA` → `hasDirectOverlap=true` → verdict `red`
- area ∈ `SHARED_INFRA` (`scripts`, `hooks`, `plugins/kaola-workflow/scripts`) → `yellow`
- areaLabel ∈ claimedAreaLabels → `yellow`

**Guard at line 254**: `if (!fs.existsSync(projectDir)) continue;` — ghost locks silently skipped. Folder-based reader inherits this property by construction.

**Key insight**: classifier overlap is already folder-based after `lock.project` resolution. Issue #64 swaps the enumerator (lock-files → folders), overlap math unchanged.

**Input shape `scanClaimedOverlap` needs**: array of objects with at least `project: <string>`.

## 3. workflow-state.md Schema

```
# Kaola-Workflow State

## Project
name: <project>
status: active|released|closed|abandoned

## Current Position
phase: <n>
phase_name: ...
step: ...
...

## Sink
branch: workflow/issue-N | TBD
issue_number: N | N/A
claimed_at: ...
sink: merge|pr

## Lease
session_id: ...
expires: ...
last_heartbeat: ...
claim_comment_id: ...
owner_session_id: ...
```

### `status:` values (written by codebase)
- `active` — set during claim; only value actively tested by readers
- `released` — `releaseSession()` at `claim.js:1894`, regex `s/status: active/status: released/` — folder is NOT moved to archive
- `closed` — `archiveProjectDir(root, project, 'closed')` calls at lines 1955, 2209, 2815 — folder moved to `archive/`
- `abandoned` — `archiveProjectDir(root, project, 'abandoned')` at line 2220 — folder moved to `archive/`

**Filter implication**: `released` folders remain in `kaola-workflow/` (not archived). Must exclude by value, not by location.

### `issue_number:` field
- Lives in `## Sink` block
- Used by `readActiveStateIssueNumbers` via `field(content, 'issue_number')`

## 4. GitHub Issue Closed-State Check

### `isIssueClosed()` — `scripts/kaola-workflow-claim.js:2120-2128`
```js
function isIssueClosed(issueNumber) {
  if (OFFLINE || issueNumber == null) return false;
  try {
    const raw = ghExec(['issue', 'view', String(issueNumber), '--json', 'state']);
    ...
    return String(data.state || '').toLowerCase() === 'closed';
  } catch (_) { return false; }
}
```
- Uncached live `gh issue view` — 1 round-trip per issue
- No persisted issue-state cache anywhere (`issues.json` does not exist)
- NOT in `module.exports` (lines 2888-2893) — cannot `require` from classifier today
- Offline (`KAOLA_WORKFLOW_OFFLINE=1`): returns `false` at line 2121
- Classifier has inline closed-check at lines 409-411 (online only)

**Offline mode**: `ghExec` returns `''` (claim.js:33, classifier.js:29). New helper must skip GH closed-check when offline.

## 5. Conventions

- No `scripts/lib/` directory — all scripts top-level standalone
- CommonJS throughout
- `'use strict'` in classifier; absent in claim.js
- No JSDoc
- Errors: `catch (_) {}` swallow; callers see null/''/default
- Section dividers: `// -----...`
- Plain functions, no class syntax
- Module-level constants: `UPPER_SNAKE_CASE`
- Guard clauses with early returns
- No async/await in claim.js or classifier.js (only simulator uses async)

**Shared helper placement options**:
- No precedent for `scripts/lib/` — would be net new
- Current pattern: duplicate with comment
- Alternative: new standalone script `scripts/kaola-workflow-active-folders.js` — `require()` from both
- Or: add to `module.exports` of claim.js and `require` from classifier

## 6. Tests

### `scripts/simulate-workflow-walkthrough.js`
- 6526 lines; async `main()` at line 6526
- Hand-rolled `assert(condition, message)` at line 27
- No external test runner

### How overlap tests plant fixtures
- Lock files: direct `fs.writeFileSync(locksDir/'project.lock', JSON.stringify({...}))`
- Project dirs + phase files: `fs.mkdirSync` + `fs.writeFileSync`
- `workflow-state.md` fixtures: direct write (see Epic 6F2 at lines 1061-1089)
- `gh` shim: shell script in temp `bin/gh`, injected via PATH
- All in `fs.mkdtempSync` temp dirs; cleanup in finally

### Template (Epic 6F2, lines 1061-1089)
```js
const stateOnlyDir6F2 = path.join(epic6Tmp, 'kaola-workflow', 'state-only-issue');
fs.mkdirSync(stateOnlyDir6F2, { recursive: true });
fs.writeFileSync(path.join(stateOnlyDir6F2, 'workflow-state.md'), [
  '# Kaola-Workflow State', '', '## Project', 'name: state-only-issue', 'status: active',
  '', '## Current Position', ...,
  '## Sink', 'branch: ...', 'issue_number: 14', ...
].join('\n'));
```

### Where to add new scenarios
- Append to Epic Case 6 block at `scripts/simulate-workflow-walkthrough.js:892`
- Or new named Epic Case block parallel to it

## 7. Config / Env / Feature Flags

| Var | File | Effect |
|-----|------|--------|
| `KAOLA_WORKFLOW_OFFLINE` | claim, classifier (line 8 both) | `=1` disables all `gh` calls |
| `KAOLA_COORD_ROOT` | claim:95 | override coord root |
| `KAOLA_SESSION_ID` | claim:167 | override session ID |
| `KAOLA_KERNEL_SESSION_SKIP` | claim:214,1232,1350,2453 | skip platform session enforcement |
| `KAOLA_KERNEL_SESSION_FAKE_PID` | claim:218 | test-only walkToClaudePid override |
| `KAOLA_ENFORCE_PLATFORM_SESSION` | claim:257,505 | strict platform session enforcement |
| `KAOLA_PATH` | claim:1499 | `=fast` selects fast workflow |

No feature flag for folder-reader. `KAOLA_WORKFLOW_OFFLINE` affects the new helper's GH closed-issue check.

## Key Files

| File | Role | Importance |
|------|------|------------|
| `scripts/kaola-workflow-classifier.js` | classify; owns `readLockFiles` + `readActiveStateIssueNumbers` + `scanClaimedOverlap` | Primary change target |
| `scripts/kaola-workflow-claim.js` | all other subcommands; owns duplicate readers + `isIssueClosed` | Secondary change target; source of `isIssueClosed` |
| `scripts/simulate-workflow-walkthrough.js` | integration test suite | Epic Case 6 block (line 892) for new scenarios |
| `kaola-workflow/issue-64/workflow-state.md` | live active example | Schema reference |
| `kaola-workflow/archive/issue-45/workflow-state.md` | closed example | Schema reference |
