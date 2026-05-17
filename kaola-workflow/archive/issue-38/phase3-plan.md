# Phase 3 - Plan: issue-38

## Blueprint

### Files to Modify (no new files)

| File | Changes | Commit |
|------|---------|--------|
| `commands/kaola-workflow-phase4.md` | Fix line 63: replace `--show-toplevel` with porcelain awk | C1 |
| `scripts/simulate-workflow-walkthrough.js` | Case 17K (C1); Cases 17G-17J + LOW-3 fix (C2) | C1+C2 |
| `scripts/validate-workflow-contracts.js` | Phase4 content check (C1); dispatcher-route + parity checks (C4) | C1+C4 |
| `scripts/kaola-workflow-claim.js` | MEDIUM-1/2/3, LOW-1/2/4, extract helpers (C3) | C3 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical mirror of C3 changes | C3 |

### Build Sequence

1. C1-A: Fix `commands/kaola-workflow-phase4.md:63` (no deps)
2. C1-B: Add Case 17K (no deps; disjoint file)
3. C1-C: Add phase4 content check to validator (no deps; disjoint file)
4. **Commit C1** — `fix: use git worktree list --porcelain for COORD_ROOT in phase4 + Case 17K`
5. C2-A: Add Cases 17G-17J after 17K block (depends on C1-B so 17K insert point is stable)
6. C2-B: Fix LOW-3 in finally block (depends on C1-B for finally block shape)
7. **Commit C2** — `test: add failure-path tests (17G-17J) and fix LOW-3 kwDir derivation`
8. C3-A through C3-J: All claim.js edits in one pass; then C3-K mirror copy (depends on C1)
9. **Commit C3** — `refactor: extract helpers, MEDIUM-1/2/3, LOW-1/2/4, mirror to plugin`
10. C4-A+C4-B: Harden validator (depends on C3 so dispatcher strings exist)
11. **Commit C4** — `test: harden dispatch-route and plugin-parity contract checks`

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| C1 | C1-A, C1-B, C1-C | Disjoint files |
| C3 (internal order) | Serial within same file | Same-file edits, must be single pass |

### External Dependencies

None. All tooling (`execFileSync`, `fs.cpSync`, `path`, `assert`) already imported.
`fs.cpSync` requires Node ≥ 16.7 — confirmed Node v25.5.0 in project environment.

---

## Task List

### Task C1-A: Fix `commands/kaola-workflow-phase4.md:63`

- **File:** `commands/kaola-workflow-phase4.md`
- **Write Set:** `commands/kaola-workflow-phase4.md`
- **Depends On:** none
- **Parallel Group:** C1
- **Action:** MODIFY
- **Implement:**
  ```bash
  # BEFORE (line 63):
  COORD_ROOT="$(git rev-parse --show-toplevel)"
  # AFTER:
  COORD_ROOT="$(git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}')"
  ```
- **Mirror:** Same porcelain pattern used in `cmdResume:2226-2237` and `cmdWorktreeFinalize:2360-2363`
- **Validate:** `node scripts/simulate-workflow-walkthrough.js`

---

### Task C1-B: Add Case 17K to `scripts/simulate-workflow-walkthrough.js`

- **File:** `scripts/simulate-workflow-walkthrough.js`
- **Write Set:** `scripts/simulate-workflow-walkthrough.js`
- **Depends On:** none
- **Parallel Group:** C1
- **Action:** MODIFY
- **Insert point:** After `'17F: phase3-plan.md must exist in issue worktree after finalize');`, before `} finally {`
- **Implement:**
  ```js
  // Case 17K: COORD_ROOT resolved correctly from inside issue worktree
  const coordRootFromWT = execFileSync('bash', ['-c',
    'git worktree list --porcelain | awk \'/^worktree /{print substr($0,10); exit}\''
  ], { cwd: pick17a.worktree_path, encoding: 'utf8' }).trim();
  assert(coordRootFromWT === fs.realpathSync(epic17Tmp),
    '17K: COORD_ROOT from inside worktree should be main repo root, got ' + coordRootFromWT +
    ' expected ' + fs.realpathSync(epic17Tmp));
  ```
  **macOS note:** `os.tmpdir()` returns `/var/folders/...` but git returns realpath `/private/var/folders/...`. Must compare against `fs.realpathSync(epic17Tmp)`.
- **Validate:** `node scripts/simulate-workflow-walkthrough.js`

---

### Task C1-C: Add phase4 content check to `scripts/validate-workflow-contracts.js`

- **File:** `scripts/validate-workflow-contracts.js`
- **Write Set:** `scripts/validate-workflow-contracts.js`
- **Depends On:** none (C1-A runs independently; validator just checks the string is present)
- **Parallel Group:** C1
- **Action:** MODIFY
- **Insert point:** After `assertIncludes('commands/kaola-workflow-phase4.md', 'ACTIVE_WORKTREE_PATH');` (last assert before `console.log`)
  ```js
  assertIncludes('commands/kaola-workflow-phase4.md', "git worktree list --porcelain");
  ```
- **Validate:** `node scripts/validate-workflow-contracts.js`

---

### Task C2-A: Add Cases 17G–17J to `scripts/simulate-workflow-walkthrough.js`

- **File:** `scripts/simulate-workflow-walkthrough.js`
- **Write Set:** `scripts/simulate-workflow-walkthrough.js`
- **Depends On:** C1-B (17K block defines insert point)
- **Parallel Group:** C2 serial
- **Action:** MODIFY
- **Insert point:** After the 17K assertion block, before `} finally {`
- **Implement:** (see `.cache/architect.md` C2-A for full code blocks)
  - 17G: `resume` with no project/branch context → `resumed: false, reason: cannot determine project`
  - 17H: `worktree-finalize --project issue-999` (never provisioned) → `threw17h === true`
  - 17I: staged dirty file in `kaola-workflow/{project}/` → `threw17i === true` then restore
  - 17J: new artifact written → HEAD before !== HEAD after
- **Validate:** `node scripts/simulate-workflow-walkthrough.js`

---

### Task C2-B: LOW-3 — Fix `kwDir` in finally block

- **File:** `scripts/simulate-workflow-walkthrough.js`
- **Write Set:** `scripts/simulate-workflow-walkthrough.js`
- **Depends On:** C1-B (finally block shape stable)
- **Parallel Group:** C2 serial (same file as C2-A, do in same pass)
- **Action:** MODIFY
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

### Task C3 (single pass): Claim script refactor + plugin mirror

All C3 sub-tasks apply to `scripts/kaola-workflow-claim.js` in one edit pass, then the file is copied.

- **File:** `scripts/kaola-workflow-claim.js`
- **Write Set:** `scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- **Depends On:** C1 (tests must be green before refactor)
- **Parallel Group:** serial

**Sub-task C3-A: Extract `findMainWorktree`**
- Insert before `cmdResume` (currently line ~2222):
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
- In `cmdResume`, replace 12-line porcelain block (lines 2226-2237) with: `const mainWorktree = findMainWorktree();`
- In `cmdWorktreeFinalize`, replace 4-line porcelain block (lines 2360-2363) with: `const mainWorktree = findMainWorktree() || root;`

**Sub-task C3-B: Extract `buildClaimedBranchSet`**
- Insert before `cmdPickNext` (verbatim lift of lines 2137-2153)
- In `cmdPickNext`, replace inline block with: `const claimedBranches = buildClaimedBranchSet(root, OFFLINE);`

**Sub-task C3-C: Extract `fetchOpenIssues`**
- Insert before `cmdPickNext` (verbatim lift of lines 2155-2176)
- In `cmdPickNext`, replace inline block with: `const openIssues = fetchOpenIssues(root, OFFLINE);`

**Sub-task C3-D: Extract `detectCurrentProject`**
- Insert before `cmdResume` (verbatim lift of lines 2244-2253)
- In `cmdResume`, replace inline block with: `const project = detectCurrentProject(args);`

**Sub-task C3-E: Extract `scanPhaseArtifacts` (incorporating LOW-2 PHASE_ARTIFACTS table)**
- Insert before `cmdResume`:
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
- In `cmdResume`, replace 7-arm if/else block with: `const { currentPhase, nextCommand } = scanPhaseArtifacts(projectDir);`

**Sub-task C3-F: Extract `commitWorktreeArtifacts`**
- Insert before `cmdWorktreeFinalize` (verbatim lift of dirty-check + cpSync + stage + commit block):
  ```js
  function commitWorktreeArtifacts(worktreePath, project, root) {
    const statusOut = execFileSync('git', ['-C', worktreePath, 'status', '--porcelain',
      '--', 'kaola-workflow/' + project + '/'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    assert(!statusOut, 'worktree-finalize: uncommitted changes in kaola-workflow/' + project + '/: ' + statusOut);

    const mainWorktree = findMainWorktree() || root;

    const srcDir = path.join(mainWorktree, 'kaola-workflow', project);
    const dstDir = path.join(worktreePath, 'kaola-workflow', project);
    fs.mkdirSync(dstDir, { recursive: true });
    fs.cpSync(srcDir, dstDir, { recursive: true });

    execFileSync('git', ['-C', worktreePath, 'add', 'kaola-workflow/' + project + '/'],
      { stdio: ['ignore', 'pipe', 'pipe'] });

    let staged = false;
    try {
      execFileSync('git', ['-C', worktreePath, 'diff', '--cached', '--quiet'],
        { stdio: ['ignore', 'pipe', 'pipe'] });
      staged = false;
    } catch (_) { staged = true; }

    if (staged) {
      execFileSync('git', ['-C', worktreePath, 'commit', '-m',
        'chore: sync phase artifacts for ' + project],
        { stdio: ['ignore', 'pipe', 'pipe'] });
    }
  }
  ```
- In `cmdWorktreeFinalize`, replace the entire dirty-check-through-commit block with: `commitWorktreeArtifacts(worktreePath, args.project, root);`

**Sub-task C3-G: MEDIUM-2 — stderr in `cmdPickNext` catch**
- After extraction, add to provisionWorktree catch block:
  ```js
  process.stderr.write('pick-next: provisionWorktree failed for ' + project + ': ' + _.message + '\n');
  ```

**Sub-task C3-H: MEDIUM-3 — parseInt in `cmdResume` output**
- Change: `issue: project.replace(/^issue-/, ''),`
- To: `issue: parseInt(project.replace(/^issue-/, ''), 10),`

**Sub-task C3-I: LOW-1 — Anchor refs/heads/ regex in `cmdWorktreeStatus`**
- Change: `const branch = branchFull.replace('refs/heads/', '');`
- To: `const branch = branchFull.replace(/^refs\/heads\//, '');`

**Sub-task C3-J: LOW-4 — Reformat `module.exports`**
- Replace existing multi-fragment exports with:
  ```js
  module.exports = {
    buildSinkBranchName, getCoordRoot, removeWorktree, archiveProjectDir,
    findMainWorktree,
    cmdPickNext, cmdResume, cmdWorktreeStatus, cmdWorktreeFinalize
  };
  ```

**Sub-task C3-K: Plugin mirror**
- Copy `scripts/kaola-workflow-claim.js` to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`

- **Validate (C3):** `node scripts/simulate-workflow-walkthrough.js`

---

### Task C4-A: Strengthen dispatcher-route checks in `scripts/validate-workflow-contracts.js`

- **File:** `scripts/validate-workflow-contracts.js`
- **Depends On:** C3 (dispatcher strings must exist in claim.js)
- **Action:** MODIFY
- **Change:** Replace bare-string checks with exact dispatcher strings:
  ```js
  // BEFORE:
  assertIncludes('scripts/kaola-workflow-claim.js', 'pick-next');
  assertIncludes('scripts/kaola-workflow-claim.js', 'worktree-status');
  assertIncludes('scripts/kaola-workflow-claim.js', 'worktree-finalize');
  // AFTER:
  assertIncludes('scripts/kaola-workflow-claim.js', "if (sub === 'pick-next')");
  assertIncludes('scripts/kaola-workflow-claim.js', "if (sub === 'worktree-status')");
  assertIncludes('scripts/kaola-workflow-claim.js', "if (sub === 'worktree-finalize')");
  ```

---

### Task C4-B: Add plugin mirror parity check to `scripts/validate-workflow-contracts.js`

- **File:** `scripts/validate-workflow-contracts.js`
- **Depends On:** C3-K (plugin file must exist), C4-A (insert after dispatcher checks)
- **Action:** MODIFY
- **Add after dispatcher checks:**
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
  (`read()` and `assert()` are defined at lines 9 and 17 of `validate-workflow-contracts.js`)
- **Validate (C4):** `node scripts/simulate-workflow-walkthrough.js && node scripts/validate-workflow-contracts.js`

---

## Advisor Notes

From `.cache/advisor-plan.md` (second advisor gate):

- **C3-F regression fixed**: `commitWorktreeArtifacts` now takes `root` as third parameter and uses `findMainWorktree() || root` (matching original `cmdWorktreeFinalize:2363`). Call site: `commitWorktreeArtifacts(worktreePath, args.project, root)`.
- **scanPhaseArtifacts advisory**: The helper does not distinguish "phase 4 in-progress" from "phase 4 complete → phase 5". This is acceptable — `cmdResume` is a hint, not the authoritative router. No disambiguation logic added.
- **Node.js compatibility**: `fs.cpSync` requires ≥16.7. Environment is v25.5.0. No shim needed.
- Advisor verdict: plan ready.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | correction applied inline | One-line fix documented in advisor-plan.md; no full re-invocation needed per advisor verdict |
