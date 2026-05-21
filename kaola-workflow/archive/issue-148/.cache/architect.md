# Code Architect — issue-148

## Design Decisions

- **Per-edition local helpers, no cross-edition sharing.** `extractIssueNumber` and `worktreeDirtyState` are added as small local functions in each claim script. Matches existing codebase pattern; advisor constraint "Do NOT unify helpers across editions."

- **Forge-specific branch prefixes everywhere.** `extractIssueNumber` regex and the `git for-each-ref` pattern use `workflow/gitlab-issue-` / `workflow/gitea-issue-` (not generic `workflow/`). Prevents cross-forge interference.

- **`cmdStaleWorktreeCheck` is NOT exported.** Matches GitHub root and advisor constraint.

- **Tests use a PATH-prepended CLI shim (`glab`/`tea`), NOT `withForge`.** CRITICAL deviation from Phase 2 brief's `withForge` suggestion. Rationale: `withForge` mutates the in-process `forge` singleton, but `cmdStaleWorktreeCheck` is unexported and only reachable by spawning a child process which `require()`s its own forge copy — parent stubs do not cross the process boundary. The only working precedent is `writeGhShimForStale` + `runClaimOnline` in `scripts/simulate-workflow-walkthrough.js:929`. Additionally, `runNode` in GL/GT suites does not set `KAOLA_WORKFLOW_OFFLINE`, so an un-shimmed subprocess would shell to the real `glab`/`tea` and fail. The shim approach resolves both problems.

- **Use `getRoot` (not `findProjectRoot`).** GL/GT import `getRoot` from their active-folders module; that is the local convention.

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Add `extractIssueNumber` + `worktreeDirtyState` helpers; add `cmdStaleWorktreeCheck()`; add dispatch line; update usage string | P0 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same as GL, with `gitea-` prefix | P0 |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add `testStaleWorktreeCheck()` (5 sub-cases) + `glab` shim helper + `runClaimOnline` helper | P1 |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Same with `tea` shim (incl. `--version`) | P1 |
| `docs/api.md` | Add GL + GT `stale-worktree-check` invocation examples | P2 |

## Build Sequence

1. **Group A (parallel):** GL-1 + GT-1 — claim-script changes (disjoint files). Must land first because tests invoke the new subcommand.
2. **Group B (parallel, after A):** GL-2 + GT-2 — test additions (disjoint files).
3. **Serial (after A + B):** Docs — `docs/api.md`.

## Task List

### Task GL-1 — GitLab claim script

- **File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- **Write set:** that one file only.
- **Depends on:** none.
- **Parallel group:** A.
- **Action:** MODIFY.

**Implement:**

1. Add two helpers immediately after `removeWorktree` (ends ~line 131), before `projectDir`:

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

Note: `listWorkflowWorktrees` returns entries whose `branch` field is `refs/heads/workflow/gitlab-issue-N`. The anchored regex `^workflow\/gitlab-issue-(\d+)$` will NOT match that prefixed form. Therefore in the cmd body, strip `refs/heads/` before calling `extractIssueNumber` on a worktree branch. The loose-branch loop uses `--format=%(refname:short)` which is already short, so no strip needed there.

2. Add `cmdStaleWorktreeCheck()` after `cmdWorktreeStatus` (~line 531):

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
    const raw = execFileSync('git', ['-C', root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/workflow/gitlab-issue-*'],
      { encoding: 'utf8' }).trim();
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

  output({ stale_worktrees: staleWorktrees, stale_branches: staleBranches, active_worktrees: activeWorktrees, count: staleWorktrees.length + staleBranches.length });
}
```

3. Usage string at line 617 — append `|stale-worktree-check` after `watch-mr`.

4. Dispatch — add before `throw new Error('unknown subcommand: ' + sub);`:
   `if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();`

5. Do **not** add to `module.exports`.

**Validate:** `KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js stale-worktree-check` from a git repo — must emit JSON and exit 0.

---

### Task GT-1 — Gitea claim script

- **File:** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- **Write set:** that one file only.
- **Depends on:** none.
- **Parallel group:** A.
- **Action:** MODIFY.

**Implement:** Identical to GL-1 with these substitutions:
- `extractIssueNumber` regex: `/^workflow\/gitea-issue-(\d+)$/`
- `git for-each-ref` pattern: `refs/heads/workflow/gitea-issue-*`
- Place helpers after `removeWorktree`; `cmdStaleWorktreeCheck` after `cmdWorktreeStatus` (~line 516).
- Usage string (line 602): append `|stale-worktree-check` after `watch-pr`.
- Dispatch: add `if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();` after the `worktree-status` dispatch line (~613).
- Same `wt.branch.replace(/^refs\/heads\//, '')` strip in the worktree loop.
- Do **not** export.

**Validate:** `KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js stale-worktree-check` from a git repo — JSON output, exit 0.

---

### Task GL-2 — GitLab tests

- **File:** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- **Write set:** that one file only.
- **Depends on:** GL-1.
- **Parallel group:** B.
- **Action:** MODIFY.

**Implement:**

Add `runClaimOnline(args, cwd, binDir)` helper near other run helpers (after `runNodeAsync` ~line 93):

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
```

Add `writeGlabShimForStale(binDir)` helper:

```js
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

Five sub-cases in `testStaleWorktreeCheck()`:
1. **Closed worktree → stale.** `git worktree add -b workflow/gitlab-issue-200 -- <kwRoot>/issue-200 HEAD`; run; assert issue 200 in `stale_worktrees`, NOT in `stale_branches`, `count >= 1`.
2. **Archived-open worktree → stale.** branch `workflow/gitlab-issue-300`; `fs.mkdirSync(path.join(tmp,'kaola-workflow','archive','issue-300'),{recursive:true})`; assert issue 300 in `stale_worktrees`.
3. **Open + active worktree → not stale.** branch `workflow/gitlab-issue-100`; plant active folder via `writeState(tmp, 'issue-100', 100)`; assert issue 100 in `active_worktrees`, NOT in `stale_worktrees`.
4. **Deleted-dir worktree → state:'missing'.** branch `workflow/gitlab-issue-200`; `fs.rmSync(wtPath, {recursive:true,force:true})` (NOT `git worktree remove`); assert issue 200 in `stale_worktrees` with `entry.state === 'missing'`.
5. **Loose branch (no worktree) → stale_branches.** `git branch workflow/gitlab-issue-400`; assert issue 400 in `stale_branches`.

Use `fs.realpathSync(fs.mkdtempSync(...))` for temp dirs (macOS symlink issue). Worktree dirs go in `tmp + '.kw'` sibling. Each sub-case invokes `runClaimOnline(['stale-worktree-check'], tmp, binDir)`. End with `console.log('testStaleWorktreeCheck: PASSED');`.

**Validate:** `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — exit 0, prints `testStaleWorktreeCheck: PASSED`.

---

### Task GT-2 — Gitea tests

- **File:** `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- **Write set:** that one file only.
- **Depends on:** GT-1.
- **Parallel group:** B.
- **Action:** MODIFY.

**Implement:** Same structure as GL-2 with:
- Branch prefix `workflow/gitea-issue-` everywhere.
- Shim binary named `tea`, handles `--version` FIRST:

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
- Same 5 sub-cases, `gitea-` prefix substituted.

**Validate:** `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — exit 0, prints `testStaleWorktreeCheck: PASSED`.

---

### Task Docs — `docs/api.md`

- **File:** `docs/api.md`
- **Write set:** that one file only.
- **Depends on:** GL-1, GT-1, GL-2, GT-2.
- **Parallel group:** serial (last).
- **Action:** MODIFY.

**Implement:** Find existing `stale-worktree-check` section. Add GL + GT invocation examples:
- GL: `node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js stale-worktree-check`
- GT: `node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js stale-worktree-check`
- Document JSON return shape `{ stale_worktrees, stale_branches, active_worktrees, count }`, noting GL/GT match forge-specific prefix.

**Validate:** `grep -n "stale-worktree-check" docs/api.md` shows GL + GT examples present.

---

## Integration Points and Edge Cases

1. **CRITICAL — `withForge` is empirically infeasible; use PATH shim.** `cmdStaleWorktreeCheck` is unexported → child process only. Parent stubs don't cross process boundary.

2. **`listWorkflowWorktrees` returns prefixed branch refs** (`refs/heads/workflow/...`). Must strip `refs/heads/` before calling `extractIssueNumber` in worktree loop.

3. **Gitea `tea --version` gate.** Gitea forge calls `tea --version` before any `issues view`; shim must intercept `--version` and emit version >= 0.9.2.

4. **Gitea uses `issues view` (plural), GitLab uses `issue view` (singular).**

5. **`realpathSync` on temp dirs.** macOS `/tmp` → `/private/tmp`; `git worktree list` reports real path.

6. **Sub-case 4 must delete dir with `fs.rmSync`, not `git worktree remove`** — otherwise registration disappears from `git worktree list`.

7. **Field name `issue_number`.** Both GL/GT folder objects carry `issue_number` alias (active-folders.js:102-103).

## Explicitly Out of Scope

- Do NOT touch `scripts/kaola-workflow-claim.js` or `scripts/simulate-workflow-walkthrough.js`
- Do NOT export `cmdStaleWorktreeCheck` from any `module.exports`
- Do NOT unify helpers across editions (no shared module)
- Do NOT add parity assertion to `validate-workflow-contracts.js`
- Do NOT add a 6th OFFLINE sub-case
- Do NOT use generic `workflow/` ref pattern
- Do NOT add new module imports (all needed symbols already in scope)
