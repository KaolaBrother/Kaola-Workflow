# Architect Blueprint — issue-147

## Files to Create
None.

## Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` | Add `regenerateRoadmap(root)` function + export; delegate `cmdGenerate` | Tests and claim script need this entry point; parity with GitHub |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Require roadmap module; extract `archiveIssueNumber`; insert cleanup block | Fixes the roadmap stale-entry bug for GitLab |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Replace watcher test body with plant + assert cleanup | Covers the bug fix |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` | Same as GL-1 but exports `refreshFromGitea` | Parity with GitHub; Gitea edition |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same as GL-2 but require `./kaola-gitea-workflow-roadmap` | Fixes roadmap stale-entry bug for Gitea |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Same as GL-3 for Gitea | Covers the bug fix |

## Build Sequence
1. GL-1 and GT-1 (parallel) — roadmap modules must exist before claim scripts import them and before tests call `roadmap.regenerateRoadmap()`
2. GL-2 and GT-2 (parallel, after GL-1/GT-1) — claim scripts require their respective roadmap modules
3. GL-3 and GT-3 (parallel, after GL-1/GT-1) — tests call `roadmap.regenerateRoadmap()`; must complete before validation

## Parallelization Plan
| Group | Tasks | Why Safe |
|-------|-------|----------|
| A | GL-1, GT-1 | Disjoint files; no inter-dependency |
| B | GL-2, GT-2 | Disjoint files; both depend on Group A completing |
| C | GL-3, GT-3 | Disjoint files; both depend on Group A completing |

Note: Groups B and C can run in parallel with each other once Group A is done.

## Task Details

### Task GL-1: Add regenerateRoadmap to GitLab roadmap module
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js`
- Action: MODIFY
- Depends On: none
- Parallel Group: A

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

Add `regenerateRoadmap` to the `module.exports` object (line 308).

Exports become: `{ buildRoadmapContent, createFileExclusive, guardAgainstMissingRoadmapSource, readRoadmapIssues, refreshFromGitLab, regenerateRoadmap, writeFileAtomicReplace, writeIssueRecord }`

### Task GT-1: Add regenerateRoadmap to Gitea roadmap module
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js`
- Action: MODIFY
- Depends On: none
- Parallel Group: A

Identical change to GL-1 except exports use `refreshFromGitea` instead of `refreshFromGitLab`.

### Task GL-2: Add cleanup block to GitLab claim script
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Action: MODIFY
- Depends On: GL-1 (requires the `regenerateRoadmap` export)
- Parallel Group: B

(a) After line 15, add:
```js
const roadmapModule = require('./kaola-gitlab-workflow-roadmap');
```

(b) In `archiveProjectDir` state-read try (lines 397-405), add before other field extractions:
```js
let archiveIssueNumber = null;
```
And inside the try block, add:
```js
archiveIssueNumber = parseInt(field(content, 'issue_number'), 10);
```

(c) Before `return { archived: true, dest };` (line 420), insert:
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

### Task GT-2: Add cleanup block to Gitea claim script
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Action: MODIFY
- Depends On: GT-1
- Parallel Group: B

Identical three changes as GL-2 but:
- require `'./kaola-gitea-workflow-roadmap'`
- `archiveProjectDir` is at lines 378-406, state-read try at lines 382-390, return at line 405

### Task GL-3: Update GitLab watcher test
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Action: MODIFY
- Depends On: GL-1 (uses roadmap.regenerateRoadmap)
- Parallel Group: C

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

### Task GT-3: Update Gitea watcher test
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Action: MODIFY
- Depends On: GT-1
- Parallel Group: C

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

## Validation Commands
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` (regression only, do not edit)
- `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` (regression only, do not edit)
- `node scripts/simulate-workflow-walkthrough.js`

## Advisor Strengthening Notes
1. Build order within each edition is mandatory: roadmap module (GL-1/GT-1) must be complete before tests (GL-3/GT-3) run.
2. Pre-assertion `assert(fs.readFileSync(roadmapMirror,'utf8').includes('#44'))` before watcher call confirms planting format was accepted.
3. Use `roadmapMirror` variable consistently in both test tasks.
4. Non-fatal `catch (_)` intentionally swallows `guardAgainstMissingRoadmapSource` throws — mirrors GitHub design.
