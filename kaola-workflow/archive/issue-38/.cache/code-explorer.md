# Code Explorer Output — issue-38

## 1. Main Worktree Detection Pattern (to mirror into phase4 bash block)

`cmdResume` (lines 2225–2237) and `cmdWorktreeFinalize` (lines 2359–2363) already use the correct pattern:

```js
// From cmdResume (scripts/kaola-workflow-claim.js:2228-2236)
const wtList = execFileSync('git', ['worktree', 'list', '--porcelain'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const lines = wtList.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('worktree ')) {
    mainWorktree = lines[i].slice('worktree '.length).trim();
    break;
  }
}
```

Bash equivalent (to use in commands/kaola-workflow-phase4.md):
```bash
COORD_ROOT="$(git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}')"
```

**Bug location**: `commands/kaola-workflow-phase4.md:63`
```bash
# CURRENT (broken inside a worktree):
COORD_ROOT="$(git rev-parse --show-toplevel)"

# FIXED:
COORD_ROOT="$(git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}')"
```

## 2. provisionWorktree Error Handling (MEDIUM-2)

`cmdClaim` at `scripts/kaola-workflow-claim.js:1361-1368` logs failures:
```js
try {
  const wtResult = provisionWorktree(root, args.project, legacyBranch);
} catch (e) {
  process.stderr.write('claim: provisionWorktree failed: ' + e.message + '\n');
  process.exitCode = 2;
  return;
}
```

`cmdPickNext` at line 2194 swallows silently:
```js
try {
  const wtResult = provisionWorktree(root, project, branch);
  // ... success path
} catch (_) {
  // Lost race or provisioning failed — try next  ← no stderr write
}
```
Fix: add `process.stderr.write('pick-next: provisionWorktree failed for ' + project + ': ' + _.message + '\n');`

## 3. Issue Field Type Inconsistency (MEDIUM-3)

| Function | `issue` field | Type | Line |
|---|---|---|---|
| `cmdPickNext` | `issue.number` | integer ✓ | ~2204 |
| `cmdResume` | `project.replace(/^issue-/, '')` | string ✗ | ~2291 |
| `cmdWorktreeStatus` | `issueNum` (parseInt result) | integer ✓ | ~2336 |

Fix for `cmdResume`:
```js
// BEFORE:
issue: project.replace(/^issue-/, ''),
// AFTER:
issue: parseInt(project.replace(/^issue-/, ''), 10),
```

## 4. Functions Exceeding 50-Line Cap (MEDIUM-1)

All in `scripts/kaola-workflow-claim.js`:

- `cmdPickNext`: lines 2133–2220 = **87 lines**
  - Extractable helpers:
    - `buildClaimedBranchSet(root, offline)` → lines 2138–2153
    - `fetchOpenIssues(root, offline)` → lines 2155–2176
  
- `cmdResume`: lines 2222–2298 = **76 lines**
  - Extractable helpers:
    - `findMainWorktree()` → lines 2225–2242 (also reusable in cmdPickNext and cmdWorktreeFinalize)
    - `detectCurrentProject(args)` → lines 2244–2259
    - `scanPhaseArtifacts(projectDir)` → lines 2263–2281

- `cmdWorktreeFinalize`: lines 2342–2404 = **62 lines**
  - Extractable helpers:
    - `findMainWorktree()` → lines 2359–2363 (shares pattern with cmdResume)
    - body is tightly coupled; extract dirty-check + stage+commit into `commitWorktreeArtifacts(worktreePath, project)`

Both `scripts/kaola-workflow-claim.js` and `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` must receive identical changes.

## 5. Case 17 in simulate-workflow-walkthrough.js (MEDIUM-5)

Location: lines 4703–4815

Current sub-cases (17A–17F) — happy path only:
- **17A**: `pick-next` acquires issue 701
- **17B**: second `pick-next` returns `none` (dedup)
- **17C**: `worktree-status` lists the worktree
- **17D**: `resume` with no phase artifacts routes to phase1
- **17E**: `resume` with `phase3-plan.md` routes to phase4
- **17F**: `worktree-finalize` copies artifacts and commits

Missing failure paths (to add as 17G–17J):
- **17G**: `resume --project <nonexistent>` → `resumed: false`
- **17H**: `worktree-finalize` with no provisioned worktree → assertion error
- **17I**: `worktree-finalize` with dirty `kaola-workflow/{project}/` → assertion error
- **17J**: `worktree-finalize` with committed artifact → assert `staged=true` / commit hash changed

## 6. validate-workflow-contracts.js Lines 319–325 (MEDIUM-6)

Current checks just verify strings appear anywhere in the file:
```js
assertIncludes('scripts/kaola-workflow-claim.js', 'pick-next');
assertIncludes('scripts/kaola-workflow-claim.js', 'worktree-status');
assertIncludes('scripts/kaola-workflow-claim.js', 'worktree-finalize');
```

Should verify dispatcher routes each subcommand. Use `assertIncludes` with the `if (sub === '...')` form:
```js
assertIncludes('scripts/kaola-workflow-claim.js', "if (sub === 'pick-next')");
assertIncludes('scripts/kaola-workflow-claim.js', "if (sub === 'worktree-status')");
assertIncludes('scripts/kaola-workflow-claim.js', "if (sub === 'worktree-finalize')");
```
Existing dispatcher lines (confirmed present): lines 2425–2428.

## 7. LOW-1: Unanchored refs/heads/ Replace (cmdWorktreeStatus:2319)

```js
// BEFORE (unanchored — could match mid-string):
const branch = branchFull.replace('refs/heads/', '');

// AFTER (anchored regex):
const branch = branchFull.replace(/^refs\/heads\//, '');
```

## 8. LOW-2: Phase-Routing If/Else Chain in cmdResume (lines 2267–2281)

```js
// BEFORE: 7-arm if/else chain
if (fs.existsSync(path.join(projectDir, 'phase6-summary.md'))) {
  currentPhase = 6; nextCommand = 'complete';
} else if (fs.existsSync(path.join(projectDir, 'phase5-review.md'))) { ... }
...

// AFTER: lookup table
const PHASE_ARTIFACTS = [
  { file: 'phase6-summary.md', phase: 6, next: 'complete' },
  { file: 'phase5-review.md',  phase: 5, next: '/kaola-workflow-phase6 ' + project },
  { file: 'phase4-progress.md',phase: 4, next: '/kaola-workflow-phase5 ' + project },
  { file: 'phase3-plan.md',    phase: 3, next: '/kaola-workflow-phase4 ' + project },
  { file: 'phase2-ideation.md',phase: 2, next: '/kaola-workflow-phase3 ' + project },
  { file: 'phase1-research.md',phase: 1, next: '/kaola-workflow-phase2 ' + project },
];
const found = PHASE_ARTIFACTS.find(e => fs.existsSync(path.join(projectDir, e.file)));
currentPhase = found ? found.phase : 0;
nextCommand = found ? found.next : '/kaola-workflow-phase1 ' + project;
```

## 9. LOW-3: Case 17F .kw Path (simulate-workflow-walkthrough.js:4808-4812)

```js
// BEFORE (string concatenation):
const kwDir = epic17Tmp + '.kw';

// AFTER (derive from pick17a.worktree_path):
// pick17a.worktree_path = epic17Tmp.kw/issue-701
// parent of that is epic17Tmp.kw
const kwDir = path.dirname(pick17a.worktree_path);
```

## 10. LOW-4: module.exports Formatting (kaola-workflow-claim.js:2434-2436)

```js
// CURRENT (line-break mid-object, irregular alignment):
module.exports = { buildSinkBranchName, getCoordRoot, removeWorktree, archiveProjectDir,
                   cmdPickNext, cmdResume, cmdWorktreeStatus, cmdWorktreeFinalize };

// CONSISTENT (all on one line, or all split per line):
module.exports = {
  buildSinkBranchName, getCoordRoot, removeWorktree, archiveProjectDir,
  cmdPickNext, cmdResume, cmdWorktreeStatus, cmdWorktreeFinalize
};
```

## Test Framework & Structure

- No external framework — hand-rolled `assert()` and `assertIncludes()` in `scripts/simulate-workflow-walkthrough.js`
- Tests run via `npm test` → `node scripts/simulate-workflow-walkthrough.js`
- Epic Cases use temp dirs (`fs.mkdtempSync`) for isolation
- Cleanup in `finally` blocks with `fs.rmSync(... { recursive: true, force: true })`

## Config & Feature Flags

- `KAOLA_WORKTREE_NATIVE=1` enables worktree-native mode
- Checked at: `commands/kaola-workflow-phase4.md:62`, `scripts/kaola-workflow-claim.js` (pick-next branch in startup)
- `KAOLA_WORKFLOW_OFFLINE=1` disables network calls in tests
