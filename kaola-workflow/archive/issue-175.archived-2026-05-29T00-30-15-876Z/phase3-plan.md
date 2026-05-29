# Phase 3 - Plan: issue-175

## Blueprint

### Files to Create
None — all changes are modifications to existing files.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | Add OFFLINE no-evidence guard at classifyIssue (~line 248) and cmdClassify (~line 288) | Source of truth for `target_unverified` verdict |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` | Same two guard insertions (~lines 253, 293) | Symmetric port to Gitea |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Insert `target_unverified` handler in `claimExplicitTarget` (~line 415) | Translate classifier verdict into startup status |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same handler insertion (~line 418) | Symmetric port to Gitea |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Replace IIFE at lines 814-830; add 4 new IIFE blocks | Fix wrong assertion; add regression coverage |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Replace IIFE at lines 809-825; add 4 new IIFE blocks | Symmetric |

### Build Sequence
1. **G1** — Task 1 + Task 2 (parallel): classifier files — no dependencies
2. **G2** — Task 3 + Task 4 (parallel, after G1): claim handlers — consume `target_unverified` verdict
3. **G3** — Task 5 + Task 6 (parallel, after G2): test files — spawn G1+G2 scripts

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| G1 | 1, 2 | Different plugin directories; no shared state |
| G2 | 3, 4 | Different plugin directories; reads G1 outputs |
| G3 | 5, 6 | Different plugin directories; reads G1+G2 outputs |

### External Dependencies
None. Pure Node.js stdlib (`fs`, `path`, `child_process.spawnSync`). No new packages, no schema changes, no new env vars.

---

## Task List

### Task 1: GitLab classifier — OFFLINE no-evidence guard
- **File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`
- **Test File:** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (Task 5)
- **Write Set:** classifyIssue OFFLINE block + cmdClassify OFFLINE block
- **Depends On:** none
- **Parallel Group:** G1
- **Action:** MODIFY

**Mirror:** `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js:334-358`

**Site A — classifyIssue (~line 248):**
Find:
```js
  if (OFFLINE) {
    return classify(localRoadmapIssue(issueIid, repoRoot), activeFolders);
  }
```
Replace with:
```js
  if (OFFLINE) {
    const roadmapFile = path.join(repoRoot, 'kaola-workflow', '.roadmap', 'issue-' + issueIid + '.md');
    if (!fs.existsSync(roadmapFile) && !activeFolders.some(f => f.issue_iid === issueIid)) {
      return {
        verdict: 'target_unverified',
        reasoning: 'OFFLINE and no local evidence for issue #' + issueIid + ' (no kaola-workflow/.roadmap/issue-' + issueIid + '.md and no active folder in this repository)'
      };
    }
    return classify(localRoadmapIssue(issueIid, repoRoot), activeFolders);
  }
```

**Site B — cmdClassify (~line 288):**
Find:
```js
  if (OFFLINE) {
    const result = classify(localRoadmapIssue(args.issue, repoRoot), activeFolders);
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }
```
Replace with:
```js
  if (OFFLINE) {
    const roadmapFile = path.join(repoRoot, 'kaola-workflow', '.roadmap', 'issue-' + args.issue + '.md');
    if (!fs.existsSync(roadmapFile) && !activeFolders.some(f => f.issue_iid === args.issue)) {
      process.stdout.write(JSON.stringify({
        verdict: 'target_unverified',
        reasoning: 'OFFLINE and no local evidence for issue #' + args.issue + ' (no kaola-workflow/.roadmap/issue-' + args.issue + '.md and no active folder in this repository)'
      }) + '\n');
      return;
    }
    const result = classify(localRoadmapIssue(args.issue, repoRoot), activeFolders);
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }
```

**Pre-check:** `fs` and `path` already required at top of file (used by `localRoadmapIssue`).
**Validate:** `node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js --help` (exit 0)

---

### Task 2: Gitea classifier — OFFLINE no-evidence guard
- **File:** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js`
- **Test File:** `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (Task 6)
- **Write Set:** classifyIssue OFFLINE block (~line 253) + cmdClassify OFFLINE block (~line 293)
- **Depends On:** none
- **Parallel Group:** G1
- **Action:** MODIFY

Apply same Site A + Site B replacements as Task 1 verbatim. Local variable names (`issueIid`, `repoRoot`, `args.issue`) are identical in both editions' classifiers.

**Validate:** `node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js --help` (exit 0)

---

### Task 3: GitLab claim — `target_unverified` handler in `claimExplicitTarget`
- **File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- **Test File:** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (Task 5)
- **Write Set:** single block insertion in `claimExplicitTarget` (~line 415)
- **Depends On:** Task 1
- **Parallel Group:** G2
- **Action:** MODIFY

**Mirror:** `plugins/kaola-workflow/scripts/kaola-workflow-claim.js:443-451`

Find (after the `target_unavailable` block and before `return claimProject(...)`):
```js
  if (classified.verdict === 'target_unavailable') {
    return { status: 'target_unavailable', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
  }
  return claimProject(...)
```
Insert between those two statements:
```js
  if (classified.verdict === 'target_unverified') {
    return {
      status: 'target_unverified',
      claim: 'none',
      issue: targetIssue,
      project: projectNameForIssue(root, targetIssue),
      reasoning: classified.reasoning
    };
  }
```

**Validate:** smoke test:
```bash
TMP=$(mktemp -d) && cd "$TMP" && KAOLA_WORKFLOW_OFFLINE=1 node <claim.js> startup --target-issue 999; echo "exit=$?"
```
Expected: exit 1, JSON `{"verdict":"target_unverified","claim":"none",...}`, no `kaola-workflow/issue-999/` created.

---

### Task 4: Gitea claim — `target_unverified` handler in `claimExplicitTarget`
- **File:** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- **Write Set:** single block insertion in `claimExplicitTarget` (~line 418)
- **Depends On:** Task 2
- **Parallel Group:** G2
- **Action:** MODIFY

Apply same handler insertion as Task 3 verbatim.

**Validate:** same smoke test as Task 3 against Gitea claim script.

---

### Task 5: GitLab tests — fix wrong assertion + add 4 regression IIFEs
- **File:** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- **Test File:** self
- **Write Set:** replace IIFE at lines 814-830; insert 4 new IIFE blocks immediately after
- **Depends On:** Task 1 + Task 3
- **Parallel Group:** G3
- **Action:** MODIFY

**IIFE 1 — Replace lines 814-830 (fix wrong assertion):**
Change `assert.strictEqual(out.verdict, 'green')` to:
```js
assert.strictEqual(out.verdict, 'target_unverified',
  'OFFLINE with no local evidence must return target_unverified, got: ' + out.verdict);
assert(/no local evidence/.test(out.reasoning),
  'reasoning must mention no local evidence, got: ' + out.reasoning);
```
Keep tempRoot prefix `kw-gl-offline-nofile-`. All other lines unchanged.

**IIFE 2 — roadmap-acquires (add after IIFE 1):**
```js
{
  const tempHome = tempRoot('kw-gl-offline-roadmap-acquires-');
  const root = tempRoot('kw-gl-offline-roadmap-acquires-root-');
  try {
    const roadmapDir = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(path.join(roadmapDir, 'issue-200.md'),
      'issue: #200\ntitle: roadmap-present\nstatus: open\nworkflow_project: issue-200\nnext_step: ready\n');
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '200'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.notStrictEqual(out.verdict, 'target_unverified',
      'roadmap-present OFFLINE must NOT return target_unverified, got: ' + out.verdict);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}
```

**IIFE 3 — owned-routes (active folder for target → 'owned', NOT 'target_unverified'):**
```js
{
  const tempHome = tempRoot('kw-gl-offline-owned-routes-');
  const root = tempRoot('kw-gl-offline-owned-routes-root-');
  try {
    writeState(root, 'issue-201', 201);
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '201'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'owned',
      'active folder for target must produce owned (NOT target_unverified), got: ' + out.verdict);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}
```

**IIFE 4 — unrelated-active-folder (active folder for different issue → 'target_unverified'):**
```js
{
  const tempHome = tempRoot('kw-gl-offline-unrelated-active-');
  const root = tempRoot('kw-gl-offline-unrelated-active-root-');
  try {
    writeState(root, 'issue-300', 300);
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '301'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'target_unverified',
      'unrelated active folder must NOT mask target_unverified for requested target, got: ' + out.verdict);
    assert(out.reasoning && out.reasoning.includes('#301'),
      'reasoning must reference requested target #301, got: ' + out.reasoning);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}
```

**IIFE 5 — startup end-to-end (covers Site A — classifyIssue production path):**
```js
{
  const tempHome = tempRoot('kw-gl-offline-startup-unverified-');
  const root = tempRoot('kw-gl-offline-startup-unverified-root-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '302'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 1, 'offline unverified startup must exit 1');
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'target_unverified');
    assert.strictEqual(out.claim, 'none');
    assert(!fs.existsSync(path.join(root, 'kaola-workflow', 'issue-302')),
      'offline unverified startup must not create an active folder');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}
```

**Validate:** `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (exit 0)

---

### Task 6: Gitea tests — fix wrong assertion + add 4 regression IIFEs
- **File:** `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- **Write Set:** replace IIFE at lines 809-825; insert 4 new IIFE blocks immediately after
- **Depends On:** Task 2 + Task 4
- **Parallel Group:** G3
- **Action:** MODIFY

Apply symmetric changes to Task 5 with `kw-gt-` tempRoot prefixes throughout. Issue numbers 200, 201, 300, 301, 302 can be reused (Gitea test uses its own tmp dirs).

**Validate:** `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (exit 0)

---

## Validation Plan

Run in order:
1. `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
2. `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
3. `node scripts/simulate-workflow-walkthrough.js` (GitHub regression — no GitHub files touched)
4. `npm test`

---

## Advisor Notes

- Blueprint approved. One required addition: add IIFE 5 (startup end-to-end) per edition to cover Site A (`classifyIssue`) which the subprocess `classify` tests don't reach. Already incorporated above.
- R1 resolved: `writeState()` confirmed to write `issue_iid:` fields; `readActiveFolders` returns `issue_iid`-keyed records. Fixture approach valid.
- R2: IIFE block style confirmed correct for this codebase (no `main()` runner exists).
- R3: Field check — `issue_number` must not appear in new guard code (`issue_iid` only).
- CHANGELOG: Deferred to Phase 6 doc-docking.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | Blueprint approved; no revision needed |
