# Code Architect Output — issue-38

## Design Decisions

1. **4-commit slicing**: C1 (bug fix + 17K test + phase4 contract check), C2 (17G-17J failure tests + LOW-3), C3 (claim.js MEDIUM-1/2/3 LOW-1/2/4 + plugin mirror), C4 (dispatcher-route + parity validator hardening). C4 must come after C3 so the `if (sub === ...)` strings exist.
2. **Extraction is verbatim, no rewrites**: MEDIUM-1 lifts exact lines into named helpers. No logic changes.
3. **LOW-2 inside MEDIUM-1**: The PHASE_ARTIFACTS lookup table replaces the 7-arm if/else that becomes the body of `scanPhaseArtifacts`. Both mutations land in one pass.
4. **MEDIUM-2 catch-variable**: `_.message` is valid JS. Keep `catch (_)` identifier; no rename required.
5. **Plugin mirror in C3**: Both claim.js files are byte-identical after C3.

---

## Files to Modify (no new files)

| File | Changes | Commit |
|------|---------|--------|
| `commands/kaola-workflow-phase4.md` | Fix line 63: replace `--show-toplevel` with porcelain awk | C1 |
| `scripts/simulate-workflow-walkthrough.js` | Add Case 17K (C1), Cases 17G-17J + LOW-3 fix (C2) | C1+C2 |
| `scripts/validate-workflow-contracts.js` | Phase4 content check (C1), dispatcher-route + parity checks (C4) | C1+C4 |
| `scripts/kaola-workflow-claim.js` | MEDIUM-1/2/3, LOW-1/2/4 | C3 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Mirror of C3 | C3 |

---

## Task List

### C1 — Bug fix + behavior test + phase4 contract check

**Dependencies:** None. Three edits are independent.

---

#### Task C1-A: Fix `commands/kaola-workflow-phase4.md:63`

- **File:** `commands/kaola-workflow-phase4.md`
- **Write Set:** `commands/kaola-workflow-phase4.md`
- **Action:** MODIFY line 63
- **Change:**
  ```bash
  # BEFORE:
  COORD_ROOT="$(git rev-parse --show-toplevel)"
  # AFTER:
  COORD_ROOT="$(git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}')"
  ```
- **Validate:** `node scripts/simulate-workflow-walkthrough.js`

---

#### Task C1-B: Add Case 17K to `scripts/simulate-workflow-walkthrough.js`

- **File:** `scripts/simulate-workflow-walkthrough.js`
- **Write Set:** `scripts/simulate-workflow-walkthrough.js`
- **Parallel Group:** C1 (disjoint from C1-A and C1-C)
- **Insert:** After the 17F `assert(fs.existsSync(...))` assertion (verifying `phase3-plan.md` in worktree), before `} finally {`. The insert point is the line `'17F: phase3-plan.md must exist in issue worktree after finalize');`.

  Add this block:
  ```js
  // Case 17K: COORD_ROOT resolved correctly from inside issue worktree
  const coordRootFromWT = execFileSync('bash', ['-c',
    'git worktree list --porcelain | awk \'/^worktree /{print substr($0,10); exit}\''
  ], { cwd: pick17a.worktree_path, encoding: 'utf8' }).trim();
  assert(coordRootFromWT === fs.realpathSync(epic17Tmp),
    '17K: COORD_ROOT from inside worktree should be main repo root, got ' + coordRootFromWT +
    ' expected ' + fs.realpathSync(epic17Tmp));
  ```

  **macOS note:** `os.tmpdir()` returns `/var/folders/...` but `git worktree list --porcelain` returns the realpath `/private/var/folders/...`. Compare against `fs.realpathSync(epic17Tmp)` to handle this.

- **Validate:** `node scripts/simulate-workflow-walkthrough.js`

---

#### Task C1-C: Add phase4 content check to `scripts/validate-workflow-contracts.js`

- **File:** `scripts/validate-workflow-contracts.js`
- **Write Set:** `scripts/validate-workflow-contracts.js`
- **Insert:** After `assertIncludes('commands/kaola-workflow-phase4.md', 'ACTIVE_WORKTREE_PATH');` (last line before `console.log`)
  ```js
  assertIncludes('commands/kaola-workflow-phase4.md', "git worktree list --porcelain");
  ```
- **Validate:** `node scripts/validate-workflow-contracts.js`

---

### C2 — Negative-path tests (17G-17J) + LOW-3 fix

**Dependencies:** C1 (so the finally block shape is stable for LOW-3 insertion).

**Single-pass note:** ALL changes to `scripts/simulate-workflow-walkthrough.js` in C2 are inside the Epic 17 try block. Do in one edit pass.

---

#### Task C2-A: Cases 17G–17J

- **File:** `scripts/simulate-workflow-walkthrough.js`
- **Insert:** After the 17K assertion block, before `} finally {`

  ```js
  // 17G: resume without --project on main branch returns resumed:false
  {
    const resumeOut17g = execFileSync(process.execPath, [claimJS, 'resume'],
      { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline });
    const resume17g = JSON.parse(resumeOut17g.trim());
    assert(resume17g.resumed === false,
      '17G: resume with no workflow branch must return resumed:false, got ' + JSON.stringify(resume17g));
    assert(resume17g.reason === 'cannot determine project',
      '17G: reason must be cannot determine project, got ' + resume17g.reason);
  }

  // 17H: worktree-finalize with no provisioned worktree exits non-zero
  {
    let threw17h = false;
    try {
      execFileSync(process.execPath,
        [claimJS, 'worktree-finalize', '--project', 'issue-999'],
        { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (_) {
      threw17h = true;
    }
    assert(threw17h, '17H: worktree-finalize with no provisioned worktree must throw');
  }

  // 17I: worktree-finalize with staged uncommitted file in kaola-workflow/{project}/ errors
  {
    const dirtyFile = path.join(pick17a.worktree_path, 'kaola-workflow', pick17a.project, 'dirty-staged.md');
    fs.mkdirSync(path.dirname(dirtyFile), { recursive: true });
    fs.writeFileSync(dirtyFile, '# dirty\n');
    execFileSync('git', ['-C', pick17a.worktree_path, 'add',
      'kaola-workflow/' + pick17a.project + '/dirty-staged.md'], { encoding: 'utf8' });
    let threw17i = false;
    try {
      execFileSync(process.execPath,
        [claimJS, 'worktree-finalize', '--project', pick17a.project],
        { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (_) {
      threw17i = true;
    }
    assert(threw17i, '17I: worktree-finalize with staged changes must throw');
    // Restore clean state for 17J
    execFileSync('git', ['-C', pick17a.worktree_path, 'restore', '--staged',
      'kaola-workflow/' + pick17a.project + '/dirty-staged.md'], { encoding: 'utf8' });
    fs.rmSync(dirtyFile, { force: true });
  }

  // 17J: worktree-finalize with new main-worktree artifact changes HEAD SHA
  {
    const headBefore17j = execFileSync('git', ['-C', pick17a.worktree_path, 'rev-parse', 'HEAD'],
      { encoding: 'utf8' }).trim();
    fs.writeFileSync(path.join(projDir17e, 'phase4-progress.md'), '# Phase 4\n');
    const finalizeOut17j = execFileSync(process.execPath,
      [claimJS, 'worktree-finalize', '--project', pick17a.project],
      { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline });
    JSON.parse(finalizeOut17j.trim()); // must be valid JSON
    const headAfter17j = execFileSync('git', ['-C', pick17a.worktree_path, 'rev-parse', 'HEAD'],
      { encoding: 'utf8' }).trim();
    assert(headBefore17j !== headAfter17j,
      '17J: HEAD must change after finalize with new artifact');
  }
  ```

- **Validate:** `node scripts/simulate-workflow-walkthrough.js`

---

#### Task C2-B: LOW-3 fix

- **File:** `scripts/simulate-workflow-walkthrough.js`
- **In the finally block**, replace:
  ```js
  const kwDir = epic17Tmp + '.kw';
  ```
  With:
  ```js
  const kwDir = path.dirname(pick17a.worktree_path);
  ```
- **Validate:** `node scripts/simulate-workflow-walkthrough.js`

---

### C3 — Claim script refactor + plugin mirror (single-pass, two files atomically)

**Dependencies:** C1. Do ALL changes to `scripts/kaola-workflow-claim.js` in one pass, then copy to plugin.

**Single-pass order within the file:**
1. Write helper functions above `cmdPickNext` (C3-A through C3-E)
2. Write `commitWorktreeArtifacts` above `cmdWorktreeFinalize` (C3-F)
3. Replace inline blocks inside `cmdPickNext`, `cmdResume`, `cmdWorktreeFinalize` with calls to helpers
4. Apply MEDIUM-2, MEDIUM-3, LOW-1, LOW-4 in their respective locations
5. Copy entire modified file to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`

---

#### Task C3-A: Extract `findMainWorktree` (from `cmdResume:2226-2237`)

Insert before `cmdResume` (currently line 2222). Exact lines to lift:
```js
function findMainWorktree() {
  let mainWorktree = null;
  try {
    const wtList = execFileSync('git', ['worktree', 'list', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const lines = wtList.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('worktree ')) {
        mainWorktree = lines[i].slice('worktree '.length).trim();
        break;
      }
    }
  } catch (_) {}
  return mainWorktree;
}
```

In `cmdResume`, replace the 12-line block (lines 2226-2237 + `let mainWorktree = null;`) with:
```js
const mainWorktree = findMainWorktree();
```

In `cmdWorktreeFinalize`, replace the 4-line block (lines 2360-2363: `const wtListOut = ...`, `const firstLine = ...`, `const mainWorktree = ...`) with:
```js
const mainWorktree = findMainWorktree() || root;
```

---

#### Task C3-B: Extract `buildClaimedBranchSet` (from `cmdPickNext:2137-2153`)

Exact lines to lift (verbatim from source):
```js
function buildClaimedBranchSet(root, offline) {
  let claimedBranches = new Set();
  try {
    const localBranches = execFileSync('git', ['branch', '--list', 'workflow/issue-*'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    localBranches.split('\n').filter(Boolean).forEach(b => claimedBranches.add(b.trim().replace(/^[*+]\s*/, '')));
  } catch (_) {}

  if (!offline) {
    try {
      const remoteBranches = execFileSync('git', ['ls-remote', '--heads', 'origin', 'refs/heads/workflow/issue-*'],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      remoteBranches.split('\n').filter(Boolean).forEach(line => {
        const branch = line.split('\t')[1]?.replace('refs/heads/', '');
        if (branch) claimedBranches.add(branch);
      });
    } catch (_) {}
  }
  return claimedBranches;
}
```

In `cmdPickNext`, replace the inline block (from `// Build set of already-claimed...` through the closing `}`) with:
```js
const claimedBranches = buildClaimedBranchSet(root, OFFLINE);
```

---

#### Task C3-C: Extract `fetchOpenIssues` (from `cmdPickNext:2155-2176`)

Exact lines to lift (verbatim from source):
```js
function fetchOpenIssues(root, offline) {
  let openIssues = [];
  if (!offline) {
    try {
      const ghOut = execFileSync('gh', ['issue', 'list', '--json', 'number,title,state,labels,assignees,updatedAt,url', '--state', 'open'],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      openIssues = JSON.parse(ghOut);
    } catch (_) {}
  }
  if (openIssues.length === 0) {
    // Offline fallback: read ROADMAP.md
    try {
      const roadmap = fs.readFileSync(path.join(root, 'kaola-workflow', 'ROADMAP.md'), 'utf8');
      const re = /#(\d+)/g;
      let m;
      while ((m = re.exec(roadmap)) !== null) {
        const n = parseInt(m[1], 10);
        if (!openIssues.find(i => i.number === n)) openIssues.push({ number: n });
      }
    } catch (_) {}
  }
  return openIssues;
}
```

In `cmdPickNext`, replace the inline block (from `// Fetch open issues` through `}`) with:
```js
const openIssues = fetchOpenIssues(root, OFFLINE);
```

---

#### Task C3-D: Extract `detectCurrentProject` (from `cmdResume:2244-2253`)

Exact lines to lift:
```js
function detectCurrentProject(args) {
  let project = args.project || null;
  if (!project) {
    try {
      const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      const m = branch.match(/^workflow\/issue-(\d+)/);
      if (m) project = 'issue-' + m[1];
    } catch (_) {}
  }
  return project;
}
```

In `cmdResume`, replace the block (from `// Determine project` through the closing `}` before `if (!project)`) with:
```js
const project = detectCurrentProject(args);
```

---

#### Task C3-E: Extract `scanPhaseArtifacts` (from `cmdResume:2263-2281`, incorporating LOW-2 PHASE_ARTIFACTS table)

```js
function scanPhaseArtifacts(projectDir) {
  const project = path.basename(projectDir);
  const PHASE_ARTIFACTS = [
    { file: 'phase6-summary.md',  phase: 6, next: 'complete' },
    { file: 'phase5-review.md',   phase: 5, next: '/kaola-workflow-phase6 ' + project },
    { file: 'phase4-progress.md', phase: 4, next: '/kaola-workflow-phase5 ' + project },
    { file: 'phase3-plan.md',     phase: 3, next: '/kaola-workflow-phase4 ' + project },
    { file: 'phase2-ideation.md', phase: 2, next: '/kaola-workflow-phase3 ' + project },
    { file: 'phase1-research.md', phase: 1, next: '/kaola-workflow-phase2 ' + project },
  ];
  const found = PHASE_ARTIFACTS.find(e => fs.existsSync(path.join(projectDir, e.file)));
  const currentPhase = found ? found.phase : 0;
  const nextCommand = found
    ? (found.phase === 6 ? 'complete' : found.next)
    : '/kaola-workflow-phase1 ' + project;
  return { currentPhase, nextCommand };
}
```

In `cmdResume`, replace the 7-arm if/else block (from `// Scan phase artifacts` through the closing `}`) with:
```js
const { currentPhase, nextCommand } = scanPhaseArtifacts(projectDir);
```

---

#### Task C3-F: Extract `commitWorktreeArtifacts` (from `cmdWorktreeFinalize` dirty-check through commit)

Insert before `cmdWorktreeFinalize`. Exact lines to lift (verbatim):
```js
function commitWorktreeArtifacts(worktreePath, project, root) {
  // Dirty-check ONLY kaola-workflow/{project}/ in the issue worktree
  const statusOut = execFileSync('git', ['-C', worktreePath, 'status', '--porcelain',
    '--', 'kaola-workflow/' + project + '/'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert(!statusOut, 'worktree-finalize: uncommitted changes in kaola-workflow/' + project + '/: ' + statusOut);

  const mainWorktree = findMainWorktree() || root;

  // Copy kaola-workflow/{project}/ from main to issue worktree
  const srcDir = path.join(mainWorktree, 'kaola-workflow', project);
  const dstDir = path.join(worktreePath, 'kaola-workflow', project);
  fs.mkdirSync(dstDir, { recursive: true });
  fs.cpSync(srcDir, dstDir, { recursive: true });

  // Stage and commit
  execFileSync('git', ['-C', worktreePath, 'add', 'kaola-workflow/' + project + '/'],
    { stdio: ['ignore', 'pipe', 'pipe'] });

  // Check if anything staged
  let staged = false;
  try {
    execFileSync('git', ['-C', worktreePath, 'diff', '--cached', '--quiet'],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    staged = false; // exit 0 = nothing staged
  } catch (_) {
    staged = true; // exit 1 = something staged
  }

  if (staged) {
    execFileSync('git', ['-C', worktreePath, 'commit', '-m',
      'chore: sync phase artifacts for ' + project],
      { stdio: ['ignore', 'pipe', 'pipe'] });
  }
}
```

In `cmdWorktreeFinalize`, replace the block from the `// Dirty-check ONLY kaola-workflow/{project}/` comment through the staged commit (i.e., everything between the `assert(fs.existsSync(worktreePath), ...)` and `let branch = null;`) with:
```js
commitWorktreeArtifacts(worktreePath, args.project, root);
```
(`root` is already in scope in `cmdWorktreeFinalize` via `const root = getRoot();`)

---

#### Task C3-G: MEDIUM-2 — Add stderr in `cmdPickNext` catch block

After the MEDIUM-1 extraction, the catch block for `provisionWorktree` becomes:
```js
} catch (_) {
  process.stderr.write('pick-next: provisionWorktree failed for ' + project + ': ' + _.message + '\n');
  // Lost race or provisioning failed — try next
}
```

---

#### Task C3-H: MEDIUM-3 — parseInt in `cmdResume` output

In `cmdResume`'s `process.stdout.write` call, change:
```js
issue: project.replace(/^issue-/, ''),
```
To:
```js
issue: parseInt(project.replace(/^issue-/, ''), 10),
```

---

#### Task C3-I: LOW-1 — Anchor refs/heads/ regex in `cmdWorktreeStatus`

In `cmdWorktreeStatus`, change:
```js
const branch = branchFull.replace('refs/heads/', '');
```
To:
```js
const branch = branchFull.replace(/^refs\/heads\//, '');
```

---

#### Task C3-J: LOW-4 — Reformat `module.exports`

Replace the multi-fragment module.exports with:
```js
module.exports = {
  buildSinkBranchName, getCoordRoot, removeWorktree, archiveProjectDir,
  findMainWorktree,
  cmdPickNext, cmdResume, cmdWorktreeStatus, cmdWorktreeFinalize
};
```

---

#### Task C3-K: Plugin mirror

Copy `scripts/kaola-workflow-claim.js` to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`. Both files must be identical.

**Validate (C3):** `node scripts/simulate-workflow-walkthrough.js`

---

### C4 — Harden validate-workflow-contracts.js (MEDIUM-6)

**Dependencies:** C3 (dispatcher `if (sub === ...)` strings must exist before these checks pass).

---

#### Task C4-A: Dispatcher-route checks

Replace the three bare-string checks:
```js
assertIncludes('scripts/kaola-workflow-claim.js', 'pick-next');
assertIncludes('scripts/kaola-workflow-claim.js', 'worktree-status');
assertIncludes('scripts/kaola-workflow-claim.js', 'worktree-finalize');
```
With:
```js
assertIncludes('scripts/kaola-workflow-claim.js', "if (sub === 'pick-next')");
assertIncludes('scripts/kaola-workflow-claim.js', "if (sub === 'worktree-status')");
assertIncludes('scripts/kaola-workflow-claim.js', "if (sub === 'worktree-finalize')");
```

---

#### Task C4-B: Plugin mirror parity check

After the dispatcher-route checks, add:
```js
// Plugin mirror parity
const claimContent = read('scripts/kaola-workflow-claim.js');
const pluginContent = read('plugins/kaola-workflow/scripts/kaola-workflow-claim.js');
['cmdPickNext', 'cmdResume', 'cmdWorktreeStatus', 'cmdWorktreeFinalize',
 "if (sub === 'pick-next')", "if (sub === 'worktree-status')", "if (sub === 'worktree-finalize')",
].forEach(needle => {
  assert(pluginContent.includes(needle),
    'plugins/kaola-workflow/scripts/kaola-workflow-claim.js must include: ' + needle);
  assert(claimContent.includes(needle),
    'scripts/kaola-workflow-claim.js must include: ' + needle);
});
```

(`read()` and `assert()` are already defined in validate-workflow-contracts.js lines 9 and 17.)

**Validate (C4):** `node scripts/simulate-workflow-walkthrough.js && node scripts/validate-workflow-contracts.js`

---

## Build Sequence

1. **C1** (no deps): Fix phase4.md:63 + Case 17K + phase4 content-check assertion
2. **C2** (after C1): Cases 17G-17J + LOW-3 in simulate-workflow-walkthrough.js
3. **C3** (after C1): claim.js full refactor (MEDIUM-1/2/3 LOW-1/2/4) + plugin mirror — single pass
4. **C4** (after C3): validate-workflow-contracts.js dispatcher-route + parity checks

**Validation after every commit:** `node scripts/simulate-workflow-walkthrough.js`
**Additional validation after C4:** `node scripts/validate-workflow-contracts.js`

## Pre-Implementation Checks Required

1. **MEDIUM-3 consumer scan:** Before implementing C3-H, grep `commands/*.md` for any consumer that parses `resume.issue` as a string (expected answer: none).
2. **17K macOS path:** Case 17K must use `fs.realpathSync(epic17Tmp)` for comparison because `git worktree list --porcelain` returns realpath on macOS.
3. **17G behavior:** On the main repo's `main` branch (not a workflow branch), `resume` without `--project` returns `{ resumed: false, reason: 'cannot determine project' }`. Verified from actual cmdResume code.
4. **17I dirty check scope:** The check is path-scoped to `kaola-workflow/{project}/`. A staged file at that path triggers it. An untracked file does NOT. File must be staged.
