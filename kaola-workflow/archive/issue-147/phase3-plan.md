# Phase 3 - Plan: issue-147

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` | Add `regenerateRoadmap(root)` + export; delegate `cmdGenerate` | Parity with GitHub; claim script entry point |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Require roadmap module; extract `archiveIssueNumber`; cleanup block | Fixes stale ROADMAP.md on GitLab archive |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Replace watcher test body to plant + assert cleanup | Covers the bug fix |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` | Same as GL-1, exports `refreshFromGitea` | Gitea edition parity |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same as GL-2 with Gitea require | Fixes stale ROADMAP.md on Gitea archive |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Same as GL-3 for Gitea | Covers the bug fix |

### Build Sequence
1. GL-1 and GT-1 (parallel) — roadmap modules must exist before claim scripts import them and tests call `regenerateRoadmap`
2. GL-2, GT-2, GL-3, GT-3 (all parallel after Group A) — claim scripts and tests are disjoint; all depend only on Group A

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | GL-1, GT-1 | Disjoint files; no inter-dependency |
| B | GL-2, GT-2, GL-3, GT-3 | Disjoint files; all depend only on Group A |

### External Dependencies
None — all imports are existing internal modules.

## Task List

### Task GL-1: Add regenerateRoadmap to GitLab roadmap module
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement:
  Replace `cmdGenerate` (lines 227-234) with:
  ```js
  function regenerateRoadmap(root) {
    const repoRoot = root || getRoot();
    const dir = roadmapDir(repoRoot);
    const outFile = roadmapFile(repoRoot);
    guardAgainstMissingRoadmapSource(dir, outFile);
    const issues = readRoadmapIssues(dir);
    const content = buildRoadmapContent(issues);
    const wrote = writeFileAtomicReplace(outFile, content);
    return wrote ? 'generated' : 'up-to-date';
  }
  function cmdGenerate() {
    process.stdout.write(regenerateRoadmap(getRoot()) + '\n');
  }
  ```
  Add `regenerateRoadmap` to `module.exports` (line 308).
- Mirror: GitHub `regenerateRoadmap` at `scripts/kaola-workflow-roadmap.js:188-197`
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

### Task GT-1: Add regenerateRoadmap to Gitea roadmap module
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Same as GL-1; exports use `refreshFromGitea` instead of `refreshFromGitLab`
- Mirror: GitHub `regenerateRoadmap` at `scripts/kaola-workflow-roadmap.js:188-197`
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

### Task GL-2: Add cleanup block to GitLab claim script
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Depends On: GL-1
- Parallel Group: B
- Action: MODIFY
- Implement:
  (a) After line 15: `const roadmapModule = require('./kaola-gitlab-workflow-roadmap');`
  (b) In `archiveProjectDir` state-read try (lines 397-405): add `let archiveIssueNumber = null;` before try, then `archiveIssueNumber = parseInt(field(content, 'issue_number'), 10);` inside try
  (c) Before `return { archived: true, dest };` (line ~420):
  ```js
  if (statusValue === 'closed') {
    try {
      if (Number.isInteger(archiveIssueNumber) && archiveIssueNumber > 0) {
        const roadmapFilePath = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + archiveIssueNumber + '.md');
        try { fs.unlinkSync(roadmapFilePath); }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
      }
      roadmapModule.regenerateRoadmap(root);
    } catch (_) { /* roadmap mirror cleanup is non-fatal; archive already completed */ }
  }
  ```
- Mirror: GitHub cleanup block at `scripts/kaola-workflow-claim.js:459-468`
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

### Task GT-2: Add cleanup block to Gitea claim script
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Depends On: GT-1
- Parallel Group: B
- Action: MODIFY
- Implement: Identical to GL-2 but require `'./kaola-gitea-workflow-roadmap'`; `archiveProjectDir` at lines 378-406, state-read try at lines 382-390, return at line 405
- Mirror: GitHub cleanup block at `scripts/kaola-workflow-claim.js:459-468`
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

### Task GL-3: Update GitLab watcher test
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Test File: self
- Write Set: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Depends On: GL-1
- Parallel Group: B
- Action: MODIFY
- Implement:
  Replace body of watcher test block (lines 397-404) with:
  ```js
  const root = tempRoot('kw-gl-watch-mr-');
  writeState(root, 'mr-project', 44, 'mr_iid: 44');
  roadmap.writeIssueRecord(root, { issue_iid: 44, title: 'mr test' }, 'open', 'mr-project', 'ready');
  roadmap.regenerateRoadmap(root);
  const roadmapSrc = path.join(root, 'kaola-workflow', '.roadmap', 'issue-44.md');
  const roadmapMirror = path.join(root, 'kaola-workflow', 'ROADMAP.md');
  assert(fs.existsSync(roadmapSrc));
  assert(fs.readFileSync(roadmapMirror, 'utf8').includes('#44'));
  const stateFile = path.join(root, 'kaola-workflow', 'mr-project', 'workflow-state.md');
  fs.writeFileSync(stateFile, fs.readFileSync(stateFile, 'utf8').replace('sink: merge', 'sink: mr'));
  const result = claim.watchMergeRequests(root, {});
  assert.strictEqual(result.watched, 1);
  assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', 'mr-project', 'workflow-state.md')));
  assert(!fs.existsSync(roadmapSrc));
  assert(!fs.readFileSync(roadmapMirror, 'utf8').includes('#44'));
  ```
- Mirror: GitHub test pattern in `scripts/simulate-workflow-walkthrough.js`
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

### Task GT-3: Update Gitea watcher test
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Test File: self
- Write Set: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Depends On: GT-1
- Parallel Group: B
- Action: MODIFY
- Implement:
  Replace body of watcher test block (lines 410-417) with:
  ```js
  const root = tempRoot('kw-gt-watch-pr-');
  writeState(root, 'pr-project', 44, 'pr_url: https://gitea.example/group/repo/pulls/44');
  roadmap.writeIssueRecord(root, { issue_iid: 44, title: 'pr test' }, 'open', 'pr-project', 'ready');
  roadmap.regenerateRoadmap(root);
  const roadmapSrc = path.join(root, 'kaola-workflow', '.roadmap', 'issue-44.md');
  const roadmapMirror = path.join(root, 'kaola-workflow', 'ROADMAP.md');
  assert(fs.existsSync(roadmapSrc));
  assert(fs.readFileSync(roadmapMirror, 'utf8').includes('#44'));
  const stateFile = path.join(root, 'kaola-workflow', 'pr-project', 'workflow-state.md');
  fs.writeFileSync(stateFile, fs.readFileSync(stateFile, 'utf8').replace('sink: merge', 'sink: pr'));
  const result = claim.watchMergeRequests(root, {});
  assert.strictEqual(result.watched, 1);
  assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', 'pr-project', 'workflow-state.md')));
  assert(!fs.existsSync(roadmapSrc));
  assert(!fs.readFileSync(roadmapMirror, 'utf8').includes('#44'));
  ```
- Mirror: GitHub test pattern in `scripts/simulate-workflow-walkthrough.js`
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

## Advisor Notes
Blueprint approved with no blocking concerns. Strengthening notes applied:
1. Build order within each edition is mandatory — roadmap module must precede tests.
2. Pre-assertion (`assert(readFileSync(roadmapMirror).includes('#44'))`) before watcher call confirms planting format; failure = planting issue, not cleanup logic.
3. Use `roadmapMirror` variable consistently in both test tasks.
4. Non-fatal `catch (_)` intentionally swallows `guardAgainstMissingRoadmapSource` throws — mirrors GitHub design by design.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | Advisor found no gaps; no revision needed |
