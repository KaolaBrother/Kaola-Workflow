# Code Architect — Issue #88: GitLab Classifier and Repair-State Parity Gaps

## Design Decisions

- **Gap 3 placement (remote claim notes check)**: Placed inside `cmdClassify`, not inside `classifyIssue`. Rationale: `classifyIssue` is a testable pure-ish function called from tests with stubbed `forge.viewIssue`. Adding a `forge.listIssueNotes` call inside it would require all existing test stubs to also stub `discoverProject` and `listIssueNotes`. The GitHub reference also places the check in `cmdClassify` (line 366).

- **OFFLINE + `checkDependsOn` interaction**: Add explicit OFFLINE short-circuit in `checkDependsOn` matching GitHub behavior exactly.

- **`['GitLab', 'Sink']` preservation**: Kept intact in `stateContent`. The `stateLooksValid` helper and the three-way branch do not touch `stateContent`.

- **Task serial order**: Task A completes first (classifier), then Task B (repair-state). Both append to the test file.

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | Add `os` import; add `OFFLINE` constant; add `field` helper; add `readOrCreateConfig`; add `issueHasWorkflowInProgressLabel`; add `issueHasRemoteClaimNotes`; rewrite `cmdClassify`; update `checkDependsOn`; update module.exports | P1 (Task A) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js` | Add `stateLooksValid`; rewrite `repair()` with three-way branch; update module.exports | P2 (Task B) |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add `classifierScript` constant at line 18; append Task A test block before line 451; append Task B test block after Task A block | P1+P2 |

## Files to Create

None.

## Files NOT to Touch

- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js`
- Any file in `scripts/` (GitHub reference files)

---

## Task A — Classifier Gaps 1, 2, 3

### Write Set

- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` (primary)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (append only)

### Build Sequence

1. Add `os` import and `OFFLINE` constant (after all requires, before `assert`)
2. Add `field` helper and `readOrCreateConfig` helper (after `parseArgs`)
3. Add `issueHasWorkflowInProgressLabel` and `issueHasRemoteClaimNotes` helpers (after `checkDependsOn`)
4. Rewrite `cmdClassify`; update `checkDependsOn`
5. Update `module.exports`
6. Add `classifierScript` constant to test file; append Task A test block

### Step A-1: Add `os` import and `OFFLINE` constant

**Current lines 1-8**:
```
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const forge = require('./kaola-gitlab-forge');
const active = require('./kaola-gitlab-workflow-active-folders');
```

**Replace with**:
```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const forge = require('./kaola-gitlab-forge');
const active = require('./kaola-gitlab-workflow-active-folders');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
```

### Step A-2: Add `field` helper and `readOrCreateConfig` helper

**Insertion point**: After `parseArgs` closing brace, before `FILE_PATH_REGEX` or first helper function.

```javascript
function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('^' + escaped + ':\\s*(.+)$', 'm'));
  return match ? match[1].trim() : '';
}

function readOrCreateConfig() {
  // CONFIG_PATH computed here (not module-level) so tests can override HOME via process.env.HOME
  const CONFIG_PATH = path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json');
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    const defaults = { parallel_mode: 'auto' };
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2) + '\n');
    return defaults;
  }
}
```

### Step A-3: Add `issueHasWorkflowInProgressLabel` and `issueHasRemoteClaimNotes`

**Insertion point**: After `checkDependsOn` closing brace, before `scanClaimedOverlap`.

```javascript
function issueHasWorkflowInProgressLabel(labels) {
  return (labels || []).some(function(label) {
    return labelName(label) === forge.CLAIM_LABEL;
  });
}

function issueHasRemoteClaimNotes(issueIid) {
  if (OFFLINE) return false;
  let project;
  try {
    project = forge.discoverProject();
  } catch (_) {
    return false;
  }
  if (!project || !project.project_id) return false;
  try {
    const notes = forge.listIssueNotes(project, issueIid) || [];
    return notes.some(function(note) {
      if (!note || !note.body || !/<!--\s*kw:claim\s+(project|sess)=/.test(note.body)) return false;
      if (!note.updated_at) return true;
      return Date.now() - new Date(note.updated_at).getTime() < 24 * 60 * 60 * 1000;
    });
  } catch (_) {
    return false;
  }
}
```

Note: `issueHasWorkflowInProgressLabel` uses `labelName(label)` — this helper already exists in the GitLab classifier for normalizing label objects vs strings (GitLab labels may be strings in some API responses).

### Step A-4: Update `checkDependsOn`

**Replace current `checkDependsOn`** (lines 92-99):
```javascript
function checkDependsOn(depIid) {
  if (OFFLINE) {
    return { verdict: 'blocked', reasoning: 'OFFLINE and depends-on:#' + depIid + ' label present; conservative block' };
  }
  let state = 'open';
  try {
    state = forge.viewIssue(depIid).state || 'open';
  } catch (_) {}
  if (state !== 'closed') return { verdict: 'blocked', reasoning: 'depends-on:#' + depIid + ' is still open' };
  return null;
}
```

### Step A-5: Rewrite `cmdClassify`

**Replace current `cmdClassify`** (lines 188-192):
```javascript
function cmdClassify() {
  const args = parseArgs(process.argv.slice(3));
  assert(Number.isFinite(args.issue) && args.issue > 0, '--issue <N> required for classify');

  const config = readOrCreateConfig();
  if (config.parallel_mode !== 'auto') {
    process.stdout.write(JSON.stringify({ verdict: 'green', reasoning: 'parallel_mode=' + config.parallel_mode + '; bypassing classifier' }) + '\n');
    return;
  }

  const repoRoot = active.getRoot();
  const activeFolders = active.readActiveFolders(repoRoot);

  if (activeFolders.some(function(folder) { return folder.issue_iid === args.issue; })) {
    process.stdout.write(JSON.stringify({ verdict: 'owned', reasoning: 'active local folder already exists' }) + '\n');
    return;
  }

  if (OFFLINE) {
    const roadmapFile = path.join(repoRoot, 'kaola-workflow', '.roadmap', 'issue-' + args.issue + '.md');
    let labels = [];
    let body = '';
    if (fs.existsSync(roadmapFile)) {
      const content = fs.readFileSync(roadmapFile, 'utf8');
      const nextStep = field(content, 'next_step');
      if (/blocked by #\d+/i.test(nextStep)) {
        const m = nextStep.match(/#(\d+)/);
        if (m) labels = [{ name: 'depends-on:#' + m[1] }];
      }
      for (const area of parseAreaLabelsFromText(content)) labels.push({ name: 'area:' + area });
      body = content;
    }
    const result = classify({ issue_iid: args.issue, labels: labels, body: body }, activeFolders);
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  let issue;
  try {
    issue = forge.viewIssue(args.issue);
  } catch (_) {
    process.stdout.write(JSON.stringify({ verdict: 'green', reasoning: 'issue fetch failed; defaulting to green' }) + '\n');
    return;
  }

  if ((issue.state || '').toLowerCase() === 'closed') {
    process.stdout.write(JSON.stringify({ verdict: 'red', reasoning: 'issue #' + args.issue + ' is already closed' }) + '\n');
    return;
  }

  if (issueHasWorkflowInProgressLabel(issue.labels || []) || issueHasRemoteClaimNotes(args.issue)) {
    process.stdout.write(JSON.stringify({ verdict: 'blocked', reasoning: 'issue #' + args.issue + ' has a remote workflow claim' }) + '\n');
    return;
  }

  const result = classify(issue, activeFolders);
  process.stdout.write(JSON.stringify(result) + '\n');
}
```

### Step A-6: Update `module.exports`

```javascript
module.exports = {
  classify,
  classifyIssue,
  extractCoarseAreas,
  extractFilePaths,
  issueHasRemoteClaimNotes,
  issueHasWorkflowInProgressLabel,
  parseDependsOn,
  readOrCreateConfig
};
```

### Step A-7: Test block for Task A

**Add to test file** (after line 18, `const classifierScript = path.join(__dirname, 'kaola-gitlab-workflow-classifier.js');`):

Then append before the `testGitLabRoadmapInitIssueExclusiveAndUpdate()` call:

```javascript
// --- Task A: Gap 1 — readOrCreateConfig creates defaults ---
{
  const tempHome = tempRoot('kw-gl-config-home-');
  try {
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '55'], {
      cwd: __dirname,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '1',
        HOME: tempHome,
        USERPROFILE: tempHome
      })
    });
    const configPath = path.join(tempHome, '.config', 'kaola-workflow', 'config.json');
    assert(fs.existsSync(configPath), 'readOrCreateConfig should create config.json on first run');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(config.parallel_mode, 'auto', 'readOrCreateConfig should write parallel_mode: auto as default');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

// --- Task A: Gap 1 — parallel_mode bypass ---
{
  const tempHome = tempRoot('kw-gl-config-bypass-');
  try {
    const configDir = path.join(tempHome, '.config', 'kaola-workflow');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ parallel_mode: 'off' }) + '\n');
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '56'], {
      cwd: __dirname,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '1',
        HOME: tempHome,
        USERPROFILE: tempHome
      })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'green');
    assert(/parallel_mode=off/.test(out.reasoning));
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

// --- Task A: Gap 2/3 — issueHasWorkflowInProgressLabel and issueHasRemoteClaimNotes ---
withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: 'open', labels: [forge.CLAIM_LABEL], body: '' };
  },
  discoverProject() {
    return { project_id: 77, path_with_namespace: 'group/project', web_url: 'https://gitlab.example/group/project' };
  },
  listIssueNotes(project, issueIid) {
    return [{ body: '<!-- kw:claim project=issue-' + issueIid + ' -->', updated_at: new Date().toISOString() }];
  }
}, () => {
  assert(classifier.issueHasWorkflowInProgressLabel([forge.CLAIM_LABEL]));
  assert(!classifier.issueHasWorkflowInProgressLabel([]));
  assert(classifier.issueHasRemoteClaimNotes(33), 'recent kw:claim note should return true');
});

withForge({
  discoverProject() {
    return { project_id: 77, path_with_namespace: 'group/project', web_url: 'https://gitlab.example/group/project' };
  },
  listIssueNotes() { return [{ body: '<!-- kw:claim sess=abc -->' }]; }
}, () => {
  assert(classifier.issueHasRemoteClaimNotes(34), 'missing updated_at should return true');
});

withForge({
  discoverProject() {
    return { project_id: 77, path_with_namespace: 'group/project', web_url: 'https://gitlab.example/group/project' };
  },
  listIssueNotes() {
    return [{ body: '<!-- kw:claim project=old -->', updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }];
  }
}, () => {
  assert(!classifier.issueHasRemoteClaimNotes(35), 'stale note (>24h) should return false');
});

// --- Task A: Gap 3 — OFFLINE branch in cmdClassify ---
{
  const tempHome = tempRoot('kw-gl-offline-classify-');
  const root = tempRoot('kw-gl-offline-root-');
  try {
    const roadmapDir = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(path.join(roadmapDir, 'issue-57.md'),
      'issue: #57\ntitle: Offline fixture\nstatus: open\nnext_step: blocked by #3\n');
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '57'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'blocked');
    assert(/depends-on:#3/.test(out.reasoning));
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  const tempHome = tempRoot('kw-gl-offline-nofile-');
  const root = tempRoot('kw-gl-offline-nofile-root-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '58'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'green');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}
```

---

## Task B — Repair-State Gaps 4, 5

### Write Set

- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js` (primary)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (append only, after Task A block)

### Build Sequence

1. Add `stateLooksValid` helper
2. Rewrite `repair()` with three-way branch; update `module.exports`
3. Append test block to test file

### Step B-1: Add `stateLooksValid` (Gap 4)

**Insertion point**: After `selectProject` closing brace, before `taskRows`.

```javascript
function stateLooksValid(root, project, content) {
  const phase = Number(field(content, 'phase'));
  const nextCommand = field(content, 'next_command');
  const nextSkill = field(content, 'next_skill');
  const phaseFile = field(content, 'phase_file');

  if (!PHASES[phase]) return false;
  const safeProject = project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const commandOk = new RegExp('^/kaola-workflow-phase' + phase + '\\s+' + safeProject + '$').test(nextCommand);
  const skillOk = new RegExp('^' + SKILLS[phase] + '\\s+' + safeProject + '$').test(nextSkill);
  if (!commandOk && !skillOk) return false;
  if (phaseFile && phaseFile !== 'N/A' && !exists(path.join(root, phaseFile))) return false;
  return /^status:\s*active\s*$/m.test(content);
}
```

### Step B-2: Rewrite `repair()` with three-way branch (Gap 5)

**Return shapes**:
- Fall-through (absent/invalid state): `{ repaired: true, project, phase, next_skill }` — preserves existing test assertion
- Valid + complete: `{ repaired: false, complete: true }`
- Valid + stale (nextCommand drifted): write + `{ repaired: true, stale: true, project, phase, next_skill }`
- Valid + current: no-write + `{ repaired: false, valid: true, project, phase, next_skill }`

```javascript
function repair(projectArg, startDir) {
  const location = findWorkflowLocation(startDir || process.cwd());
  if (!location) return { repaired: false, reason: 'workflow directory not found' };
  const selected = selectProject(location.workflowDir, projectArg);
  if (!selected.project) return { repaired: false, reason: selected.reason };

  const stateFilePath = path.join(location.workflowDir, selected.project, 'workflow-state.md');
  let existingContent = '';
  try { existingContent = readFile(stateFilePath); } catch (_) {}

  if (existingContent && stateLooksValid(location.root, selected.project, existingContent)) {
    const routeResult = reconstruct(location.root, location.workflowDir, selected.project);

    if (routeResult.complete) {
      return { repaired: false, complete: true };
    }

    if (routeResult.project && routeResult.nextCommand &&
        routeResult.nextCommand !== field(existingContent, 'next_command')) {
      routeResult.root = location.root;
      fs.writeFileSync(stateFilePath, stateContent(routeResult, existingContent), 'utf8');
      return { repaired: true, stale: true, project: selected.project, phase: routeResult.phase, next_skill: routeResult.nextSkill };
    }

    return {
      repaired: false,
      valid: true,
      project: selected.project,
      phase: Number(field(existingContent, 'phase')),
      next_skill: field(existingContent, 'next_skill')
    };
  }

  const result = reconstruct(location.root, location.workflowDir, selected.project);
  if (!result.project) return Object.assign({ repaired: false, project: selected.project }, result);
  result.root = location.root;
  fs.writeFileSync(stateFilePath, stateContent(result, existingContent), 'utf8');
  return { repaired: true, project: selected.project, phase: result.phase, next_skill: result.nextSkill };
}
```

### Step B-3: Update `module.exports`

```javascript
module.exports = {
  complianceRows,
  delegationPolicyCompliance,
  repair,
  reconstruct,
  stateLooksValid,
  stateContent,
  unresolvedCompliance
};
```

### Step B-4: Append Task B test block

(Appended after Task A test block, before `testGitLabRoadmapInitIssueExclusiveAndUpdate()`.)

```javascript
// --- Task B: Gap 4 — stateLooksValid ---
{
  const root = tempRoot('kw-gl-slv-');
  try {
    const dir = writeState(root, 'slv-project', 80);
    fs.writeFileSync(path.join(dir, 'phase3-plan.md'), '# Phase 3\n');
    const stateText = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8');
    assert(repair.stateLooksValid(root, 'slv-project', stateText), 'stateLooksValid should return true for valid state');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = tempRoot('kw-gl-slv-bad-');
  try {
    const dir = writeState(root, 'slv-bad-project', 81);
    const badState = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8')
      .replace('next_command: /kaola-workflow-phase1 slv-bad-project', 'next_command: /kaola-workflow-phase9 slv-bad-project')
      .replace('next_skill: kaola-workflow-research slv-bad-project', 'next_skill: kaola-workflow-phase9 slv-bad-project');
    assert(!repair.stateLooksValid(root, 'slv-bad-project', badState), 'stateLooksValid should return false for unknown phase');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// --- Task B: Gap 5 — three-way branch in repair() ---
{
  // valid + current (no write)
  const root = tempRoot('kw-gl-repair-valid-');
  try {
    const dir = writeState(root, 'valid-project', 82);
    fs.writeFileSync(path.join(dir, 'phase3-plan.md'), '# Phase 3\n');
    const stateText = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8')
      .replace(/phase: \d+/, 'phase: 4')
      .replace('phase_name: Research', 'phase_name: Execute')
      .replace('next_command: /kaola-workflow-phase1 valid-project', 'next_command: /kaola-workflow-phase4 valid-project')
      .replace('next_skill: kaola-workflow-research valid-project', 'next_skill: kaola-workflow-execute valid-project');
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), stateText);
    fs.writeFileSync(path.join(dir, 'phase4-progress.md'), '# Phase 4\n\n## Tasks\n| # | Task | Status |\n|---|------|--------|\n| A | Task A | open |\n');
    const statMtime = fs.statSync(path.join(dir, 'workflow-state.md')).mtimeMs;
    const result = repair.repair('valid-project', root);
    assert.strictEqual(result.repaired, false);
    assert.strictEqual(result.valid, true);
    const newMtime = fs.statSync(path.join(dir, 'workflow-state.md')).mtimeMs;
    assert.strictEqual(newMtime, statMtime, 'valid+current repair must not rewrite state file');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // valid + complete
  const root = tempRoot('kw-gl-repair-complete-');
  try {
    const dir = writeState(root, 'complete-project', 83);
    fs.writeFileSync(path.join(dir, 'phase6-summary.md'), '# Phase 6\n');
    const result = repair.repair('complete-project', root);
    assert.strictEqual(result.repaired, false);
    assert.strictEqual(result.complete, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // valid + stale (state says phase1, phase3-plan.md exists so reconstruct routes to phase4)
  const root = tempRoot('kw-gl-repair-stale-');
  try {
    const dir = writeState(root, 'stale-project', 84);
    fs.writeFileSync(path.join(dir, 'phase3-plan.md'), '# Phase 3\n');
    const result = repair.repair('stale-project', root);
    assert.strictEqual(result.repaired, true);
    assert.strictEqual(result.stale, true);
    const state = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8');
    assert(state.includes('## GitLab'), 'stale repair should preserve ## GitLab section');
    assert(state.includes('## Sink'), 'stale repair should preserve ## Sink section');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
```

---

## Data Flow

**Task A (cmdClassify)**:
```
argv → parseArgs → readOrCreateConfig
  → parallel_mode bypass (exit green)
  → active.readActiveFolders → owned check (exit owned)
  → OFFLINE branch: roadmap file → field(nextStep) → labels synthesis → classify → stdout
  → Online branch: forge.viewIssue → closed check → claim check → classify → stdout
```

**Task B (repair)**:
```
projectArg → findWorkflowLocation → selectProject
  → stateLooksValid(existing)?
      yes → reconstruct
        → complete? → {repaired:false, complete:true}
        → stale? → write stateContent → {repaired:true, stale:true}
        → current → {repaired:false, valid:true}
      no → reconstruct → write stateContent → {repaired:true, ...}
```

## Build Sequence (cross-task, SERIAL)

1. Task A: Add `os` import and `OFFLINE` constant
2. Task A: Add `field` + `readOrCreateConfig` helpers
3. Task A: Add `issueHasWorkflowInProgressLabel` + `issueHasRemoteClaimNotes`
4. Task A: Rewrite `cmdClassify` + update `checkDependsOn`
5. Task A: Update `module.exports` in classifier
6. Task A: Add `classifierScript` constant; append Task A test block to test file
7. Task B: Add `stateLooksValid`
8. Task B: Rewrite `repair()`; update `module.exports` in repair-state
9. Task B: Append Task B test block to test file

## Parallelization Safety

Tasks A and B are SERIAL. Both append to `test-gitlab-workflow-scripts.js`.

## Validation Commands

After Task A:
```bash
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
```

After Task B (full suite):
```bash
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
node scripts/simulate-workflow-walkthrough.js
```

## Out-of-Scope Items

- `classifyIssue` function signature — unchanged
- Exit-code-2 path for "already owned" issues — GitLab returns `{verdict:'owned'}` on stdout with exit 0; preserved
- `kaola-gitlab-forge.js` — read-only
- `kaola-gitlab-workflow-active-folders.js` — read-only
- `stateContent` ownership block — NOTE: architect blueprint is MISSING Gap 5's ownership block insertion in stateContent() — see advisor plan gate
- GitHub reference files in `scripts/` — read-only

## NOTE: Missing Gap from Architect

The architect blueprint omits **Gap 5's ownership block in `stateContent()`**:
- Insert `## Ownership Rules` section (after `## Pending Gates`, before `## Last Evidence`)
- Fields: `main_session_role: orchestrator`, `implementation_owner: tdd-guide` (phase 4) or `N/A`, `fix_owner: tdd-guide or build-error-resolver` (phase 4/5/6) or `N/A`, `inline_emergency_fallback_authorized: no`
- Change `last_result: 'reconstructed'` → `'state_repaired_from_artifacts'`
This must be added to the blueprint via architect revision.
