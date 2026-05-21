# Phase 3 - Plan: issue-148

## Blueprint

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Add `extractIssueNumber` + `worktreeDirtyState` helpers; add `cmdStaleWorktreeCheck()`; update usage string; add dispatch | Close GL stale-worktree-check gap |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same with `gitea-` prefix | Close GT stale-worktree-check gap |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add `runClaimOnline` + `writeGlabShimForStale` helpers; add `testStaleWorktreeCheck()` (6 sub-cases) | Verify GL implementation |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Add `runClaimOnline` + `writeTeaShimForStale` helpers; add `testStaleWorktreeCheck()` (6 sub-cases) | Verify GT implementation |
| `docs/api.md` | Add GL + GT invocation examples to `stale-worktree-check` section | Docs no longer overclaim |

### Build Sequence
1. Group A (parallel): GL-1 + GT-1 — claim script changes. Tests invoke the subcommand, so scripts must land first.
2. Group B (parallel, after A): GL-2 + GT-2 — test additions.
3. Serial (after A + B): Docs — `docs/api.md`.

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | GL-1, GT-1 | completely disjoint files |
| B | GL-2, GT-2 | completely disjoint files, depend only on Group A |
| serial | Docs | single shared file, after A+B |

### External Dependencies
None. All needed symbols are already imported in both claim scripts: `execFileSync`, `fs`, `path`, `output`, `OFFLINE`, `getRoot`, `readActiveFolders`, `listWorkflowWorktrees`, `issueIsClosed`.

## Design Deviation: PATH-shim instead of `withForge`

The Phase 2 advisor suggested using `withForge({ viewIssue })` for test stubs. The Phase 3 architect overrides this — correctly — because:

- `cmdStaleWorktreeCheck` is intentionally unexported (matches GitHub pattern, required constraint).
- An unexported function is only reachable by spawning the claim script as a subprocess.
- `withForge` mutates the **parent process's** in-process `forge` singleton; the subprocess `require()`s its own copy.
- Parent stubs do not cross the process boundary.

The working pattern is `writeGlabShimForStale`/`writeTeaShimForStale` + `runClaimOnline`, mirroring `writeGhShimForStale` + `runClaimOnline` from `scripts/simulate-workflow-walkthrough.js:929`. Phase 4 implementors must use this pattern; using `withForge` will produce tests that silently pass against real forge API.

## Task List

### Task GL-1: GitLab claim script — add stale-worktree-check
- **File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- **Test File:** none (validated by smoke check)
- **Write Set:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- **Depends On:** none
- **Parallel Group:** A
- **Action:** MODIFY

**Implement:**

Step 1 — Add two helpers immediately after `function removeWorktree` ends (lines ~119-131), before `function projectDir`:

```js
function extractIssueNumber(branch) {
  const m = String(branch || '').match(/^workflow\/gitlab-issue-(\d+)$/);
  return m ? Number(m[1]) : null;
}

function worktreeDirtyState(wtPath) {
  try {
    if (!fs.existsSync(wtPath)) return 'missing';
    const out = execFileSync('git', ['-C', wtPath, 'status', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.trim().length > 0 ? 'dirty' : 'clean';
  } catch (_) {
    return 'missing';
  }
}
```

Step 2 — Add `cmdStaleWorktreeCheck()` after `function cmdWorktreeStatus` (~line 531):

```js
function cmdStaleWorktreeCheck() {
  const root = getRoot();
  const activeFolders = readActiveFolders(root);
  const activeSet = new Set(activeFolders.map(f => f.issue_number).filter(n => n != null));

  const registeredWorktrees = listWorkflowWorktrees(root);
  const staleWorktrees = [];
  const activeWorktrees = [];
  const branchesWithWorktree = new Set();

  for (const wt of registeredWorktrees) {
    // listWorkflowWorktrees returns branch as refs/heads/... — strip for matching
    const shortBranch = String(wt.branch || '').replace(/^refs\/heads\//, '');
    const issueNumber = extractIssueNumber(shortBranch);
    if (issueNumber == null) continue;
    branchesWithWorktree.add(shortBranch);

    const projectName = 'issue-' + issueNumber;
    const isArchived = fs.existsSync(path.join(root, 'kaola-workflow', 'archive', projectName));
    const isClosed = OFFLINE ? false : issueIsClosed(issueNumber);
    const inActiveSet = activeSet.has(issueNumber);

    if ((isClosed || isArchived) && !inActiveSet) {
      staleWorktrees.push({
        path: wt.worktree,
        branch: wt.branch,
        head: wt.HEAD,
        issue_number: issueNumber,
        state: worktreeDirtyState(wt.worktree)
      });
    } else {
      activeWorktrees.push({ path: wt.worktree, branch: wt.branch, issue_number: issueNumber });
    }
  }

  let localBranches = [];
  try {
    const raw = execFileSync('git', ['-C', root, 'for-each-ref', '--format=%(refname:short)',
      'refs/heads/workflow/gitlab-issue-*'], { encoding: 'utf8' }).trim();
    localBranches = raw ? raw.split('\n') : [];
  } catch (_) {}

  const staleBranches = [];
  for (const branch of localBranches) {
    if (branchesWithWorktree.has(branch)) continue;
    const issueNumber = extractIssueNumber(branch);
    if (issueNumber == null) continue;

    const projectName = 'issue-' + issueNumber;
    const isArchived = fs.existsSync(path.join(root, 'kaola-workflow', 'archive', projectName));
    const isClosed = OFFLINE ? false : issueIsClosed(issueNumber);
    const inActiveSet = activeSet.has(issueNumber);

    if ((isClosed || isArchived) && !inActiveSet) {
      staleBranches.push({ branch, issue_number: issueNumber });
    }
  }

  output({ stale_worktrees: staleWorktrees, stale_branches: staleBranches,
    active_worktrees: activeWorktrees, count: staleWorktrees.length + staleBranches.length });
}
```

Step 3 — Update usage string (line 617): append `|stale-worktree-check` after `watch-mr`:
```
'usage: kaola-gitlab-workflow-claim.js <claim|release|status|patch-branch|bootstrap|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback|watch-mr|stale-worktree-check>'
```

Step 4 — Add dispatch before the final `throw new Error('unknown subcommand')` line:
```js
if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();
```

Step 5 — Do NOT add to `module.exports`.

- **Validate:** `KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js stale-worktree-check` from repo root — must emit valid JSON `{ stale_worktrees, stale_branches, active_worktrees, count }` and exit 0.

---

### Task GT-1: Gitea claim script — add stale-worktree-check
- **File:** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- **Test File:** none (validated by smoke check)
- **Write Set:** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- **Depends On:** none
- **Parallel Group:** A
- **Action:** MODIFY

**Implement:** Identical to GL-1 with these substitutions:
- `extractIssueNumber` regex: `/^workflow\/gitea-issue-(\d+)$/`
- `git for-each-ref` pattern: `refs/heads/workflow/gitea-issue-*`
- Add helpers after `function removeWorktree` ends (find via grep, ~lines 119-131)
- Add `cmdStaleWorktreeCheck` after `function cmdWorktreeStatus` (~line 516)
- Usage string (line 602): append `|stale-worktree-check` after `watch-pr`
- Dispatch: add `if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();` after `worktree-status` dispatch line (~613)
- Do NOT export

- **Validate:** `KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js stale-worktree-check` from repo root — JSON output, exit 0.

---

### Task GL-2: GitLab tests — add testStaleWorktreeCheck
- **File:** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- **Test File:** same file (self-testing)
- **Write Set:** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- **Depends On:** GL-1
- **Parallel Group:** B
- **Action:** MODIFY

**Implement:**

Add after `runNodeAsync` (ends ~line 93):

```js
function runClaimOnline(args, cwd, binDir) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: {
      ...process.env,
      KAOLA_WORKFLOW_OFFLINE: '0',
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'online claim killed: ' + result.signal + '\n' + result.stderr);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

function writeGlabShimForStale(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const shim = path.join(binDir, 'glab');
  fs.writeFileSync(shim, [
    '#!/usr/bin/env node',
    "const a = process.argv.slice(2).join(' ');",
    "if (a.includes('issue view 100')) process.stdout.write('{\"state\":\"open\"}\\n');",
    "else if (a.includes('issue view 200')) process.stdout.write('{\"state\":\"closed\"}\\n');",
    "else if (a.includes('issue view 300')) process.stdout.write('{\"state\":\"open\"}\\n');",
    "else if (a.includes('issue view 400')) process.stdout.write('{\"state\":\"closed\"}\\n');",
    "else if (a.includes('repo view')) process.stdout.write('{\"id\":77}\\n');",
    "else process.stdout.write('[]\\n');"
  ].join('\n'));
  fs.chmodSync(shim, 0o755);
}
```

Add `testStaleWorktreeCheck()` function with 6 sub-cases. Use `fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-gl-')))` for `tmp`. Worktrees go in `tmp + '.kw'` sibling dir. Each sub-case is isolated (fresh git repo per sub-case, or careful teardown). Clean up `tmp` and `tmp + '.kw'` in finally block.

The sub-cases for GitLab:

**Sub-case 1: closed worktree → stale**
- `initGitRepo(tmp)`, `writeGlabShimForStale(binDir)`
- `git worktree add -b workflow/gitlab-issue-200 -- <kwRoot>/issue-200 HEAD`
- Run: `result = runClaimOnline(['stale-worktree-check'], tmp, binDir)`
- Assert: `result.stale_worktrees.some(x => x.issue_number === 200)`, issue 200 NOT in `stale_branches`, `result.count >= 1`

**Sub-case 2: archived-open worktree → stale**
- Fresh tmp, `initGitRepo(tmp)`, add worktree for issue 300 (open per shim)
- `fs.mkdirSync(path.join(tmp,'kaola-workflow','archive','issue-300'),{recursive:true})`
- Run; assert issue 300 in `stale_worktrees`

**Sub-case 3: open + active worktree → not stale**
- Fresh tmp, `initGitRepo(tmp)`, add worktree for issue 100 (open per shim)
- `writeState(tmp, 'issue-100', 100)` — plants active folder
- Run; assert issue 100 in `active_worktrees`, NOT in `stale_worktrees`

**Sub-case 4: deleted-dir worktree → state:'missing'**
- Fresh tmp, `initGitRepo(tmp)`, add worktree for issue 200 (closed per shim)
- `fs.rmSync(wtPath, { recursive: true, force: true })` — delete dir WITHOUT `git worktree remove` (that strips the metadata; we need the registration to persist)
- Run; assert issue 200 in `stale_worktrees` AND `entry.state === 'missing'`

**Sub-case 5: loose branch (no worktree) → stale_branches**
- Fresh tmp, `initGitRepo(tmp)`
- `spawnSync('git', ['branch', 'workflow/gitlab-issue-400'], { cwd: tmp })` (branch without worktree add)
- Run; assert issue 400 in `stale_branches`, NOT in `stale_worktrees`

**Sub-case 6: OFFLINE + archived → stale (archive-only path)**
- Fresh tmp, `initGitRepo(tmp)`, add worktree for issue 300 (would be "open" if online)
- `fs.mkdirSync(path.join(tmp,'kaola-workflow','archive','issue-300'),{recursive:true})`
- Run using spawnSync with `KAOLA_WORKFLOW_OFFLINE: '1'` (no binDir needed — no API calls)
- Assert issue 300 in `stale_worktrees` (archive→stale path, no `issueIsClosed` call needed)

End `testStaleWorktreeCheck` with `console.log('testStaleWorktreeCheck: PASSED');`.

Call `testStaleWorktreeCheck()` at the bottom of the file alongside other test invocations.

- **Validate:** `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — exits 0, prints `testStaleWorktreeCheck: PASSED`

---

### Task GT-2: Gitea tests — add testStaleWorktreeCheck
- **File:** `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- **Test File:** same file (self-testing)
- **Write Set:** `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- **Depends On:** GT-1
- **Parallel Group:** B
- **Action:** MODIFY

**Implement:** Same structure as GL-2 with these differences:

- Branch prefix `workflow/gitea-issue-` everywhere.
- Shim binary named `tea`, **MUST handle `--version` first** (Gitea forge gates on version check):

```js
function writeTeaShimForStale(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const shim = path.join(binDir, 'tea');
  fs.writeFileSync(shim, [
    '#!/usr/bin/env node',
    "const a = process.argv.slice(2).join(' ');",
    "if (a.includes('--version')) { process.stdout.write('tea version 0.9.2\\n'); process.exit(0); }",
    "if (a.includes('issues view 100')) process.stdout.write('{\"state\":\"open\"}\\n');",
    "else if (a.includes('issues view 200')) process.stdout.write('{\"state\":\"closed\"}\\n');",
    "else if (a.includes('issues view 300')) process.stdout.write('{\"state\":\"open\"}\\n');",
    "else if (a.includes('issues view 400')) process.stdout.write('{\"state\":\"closed\"}\\n');",
    "else if (a.includes('repo view')) process.stdout.write('{\"id\":77}\\n');",
    "else process.stdout.write('[]\\n');"
  ].join('\n'));
  fs.chmodSync(shim, 0o755);
}
```

- Gitea uses `issues view` (plural), not `issue view` (singular).
- `runClaimOnline` helper is identical (add if not already present in the file).
- Same 6 sub-cases with `gitea-issue-` prefix substituted.
- `writeState` in the Gitea test file writes `branch: workflow/gitea-issue-N` (verify before writing — line ~38-68 of GT test file).

- **Validate:** `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — exits 0, prints `testStaleWorktreeCheck: PASSED`

---

### Task Docs: docs/api.md — add GL/GT invocation examples
- **File:** `docs/api.md`
- **Test File:** none
- **Write Set:** `docs/api.md`
- **Depends On:** GL-1, GT-1, GL-2, GT-2
- **Parallel Group:** serial (last)
- **Action:** MODIFY

**Implement:** Read `docs/api.md` to locate the existing `stale-worktree-check` section (search `stale-worktree-check`). Add GL + GT invocation examples alongside the existing GitHub example. Match surrounding heading depth and formatting. Example content to add:

```
**GitLab:**
node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js stale-worktree-check

**Gitea:**
node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js stale-worktree-check
```

Note: GL/GT match branches on forge-specific prefix (`workflow/gitlab-issue-*` / `workflow/gitea-issue-*`). JSON return shape `{ stale_worktrees, stale_branches, active_worktrees, count }` is identical across all three forges.

- **Validate:** `grep -c "stale-worktree-check" docs/api.md` shows count ≥ 3 (GitHub + GL + GT). No code execution needed.

---

## Advisor Notes

- `withForge` → PATH-shim pivot is **approved** by advisor, supersedes Phase 2 suggestion. Rationale: unexported cmd → subprocess only → in-process stubs don't cross process boundary. See `.cache/advisor-plan.md`.
- 6th OFFLINE sub-case recommended and included. It closes the `OFFLINE ? false : issueIsClosed(...)` branch in `cmdStaleWorktreeCheck`.
- Pre-flight symbol checks passed: `output`, `OFFLINE`, `execFileSync` all present in both claim scripts. No helper name collisions in test files.
- `wt.HEAD` field name confirmed correct from porcelain format.
- `writeState` in GL test file writes `issue_number: N` with `status: active`. Sub-case 3 works as designed.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | Advisor approved without gaps; no revision needed |
