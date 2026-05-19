# Code Explorer Output — Issue #89

## Task
Bring `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` up to parity with GitHub `scripts/kaola-workflow-sink-merge.js` failure and fallback contract.

---

## 1. GitHub Sink-Merge Full Implementation

**File:** `scripts/kaola-workflow-sink-merge.js`

### Exit Codes

| Code | Trigger |
|------|---------|
| 0 | Success |
| 1 | Any thrown exception (rebase failure, git error, arg validation) — line 272 |
| 2 | FF race: `ffMergeLoop` returns false after MAX_AUTOMERGE_RETRIES (3) — lines 262-265 |
| 3 | Merge-impossible: `classifyMergeError` returns non-null token during push — lines 268, 179 |

### Step-by-step execution

- **Step 0** (lines 219-235): chdir to `os.tmpdir()` first (so `git worktree remove` won't fail because cwd is inside the worktree). Calls `readActiveFolders` then `removeWorktree`. Registers an `exit` hook to `chdir` back to `mainRoot`.
- **Step 1** (lines 238-241): `git fetch origin` (skipped in OFFLINE mode).
- Checkout branch (line 243).
- **Step 2** (lines 248-258): merge-base skip-check; if `merge-base HEAD origin/main == origin/main`, set `alreadyUpToDate=true`.
- **Step 3** (lines 74-88 via `doRebase`): `git rebase origin/main` with multi-line remediation message thrown as exit-1.
- **Step 4** (lines 92-95 via `doRebase`): `npm test` in `mainRoot` (skipped if `alreadyUpToDate` or `OFFLINE`).
- **Steps 5-6** (`ffMergeLoop`, lines 98-143): retry loop up to MAX_AUTOMERGE_RETRIES=3. Each iteration: checkout main, `git pull --ff-only`, checkout branch, checkout main, `git merge --ff-only -- {branch}`. Returns false on exhaustion → exit 2.
- **Step 7** (`postMergeCleanup`, lines 145-192): `git push origin main`. On error, calls `classifyMergeError`; if null re-throws (exit 1); if non-null, resets local main, writes receipt to `.cache/sink-fallback.json`, returns `{ exitCode: 3 }`.
- **Step 8** (lines 181-185): `gh issue close {issue} --comment "Merged via sink-merge."` (swallowed on error).
- **Step 9** (lines 187-191): `git branch -d -- {branch}` then `git push origin --delete -- {branch}` (both swallowed on error).

### `classifyMergeError` (lines 40-50)

Patterns applied to `e.stderr || e.message`:
- `/protected branch|GH006/i` → `'branch_protected'`
- `/rejected/` + `/non-fast-forward/` → `'non_fast_forward'`
- `/permission denied|403|not authorized/i` → `'permission_denied'`
- `/conflicts with target/i` → `'non_fast_forward'`
- Unclassified → `null` (re-throw, exit 1)

Test-only override: `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` env var (line 41).

### Fallback receipt (`sink-fallback.json`) format (lines 164-178)

```json
{
  "project": "{project}",
  "branch": "{branch}",
  "issue_number": {issue or null},
  "reason": "{token}",
  "timestamp": "{ISO8601}"
}
```

Path: `{mainRoot}/kaola-workflow/{project}/.cache/sink-fallback.json`

NOTE: The receipt is audit-only. `cmdSinkFallback` does NOT read it — it reads `--reason` from CLI arg.

### Env vars read

| Var | Purpose |
|-----|---------|
| `KAOLA_WORKFLOW_OFFLINE` | Skip all network calls |
| `KAOLA_WORKFLOW_FORCE_FF_FAIL` | Test: make first N FF merge attempts fail |
| `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` | Test: force classifyMergeError to specific token |
| `KAOLA_WORKFLOW_DEBUG_CWD` | Test: write final cwd to path after exit |

### Module export
```js
module.exports = { classifyMergeError };
```

---

## 2. GitLab Sink-Merge Current Implementation

**File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`

### What it does
- **Exit codes:** Only 0 (success) and 1 (catch in `main`, line 117). No exit 2 or 3.
- **`fastForwardMain`** (lines 75-87): Single-pass fetch → assertCleanWorktree → checkout branch → `git rebase origin/main` → checkout main → `git pull --ff-only` → `git merge --ff-only -- {branch}` → `git push origin main`. No retry loop. No error classification. No receipt writing. No branch deletion.
- **`closeLinkedIssue`** (lines 89-97): Requires `finalValidationPassed` before closing issue, creates a note via `forge.createIssueNote`, then calls `forge.closeIssue`.
- **`runDirectMerge`** (lines 99-109): Validates args, requires `finalValidationPassed`, calls `fastForwardMain`, then `closeLinkedIssue`.
- **No worktree removal.** No chdir dance.
- **No merge-base skip-check.** Always rebases unconditionally.
- **No `npm test` post-rebase validation.**
- **No FF retry loop.** Single attempt only.
- **No `classifyMergeError`.** Push errors → uncaught throw → exit 1.
- **No fallback receipt writing.**
- **No branch cleanup.**

### Module exports
```js
module.exports = { closeLinkedIssue, fastForwardMain, finalValidationPassed, runDirectMerge };
```

---

## 3. GitLab Forge API

**File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js`

### Merge-relevant functions

| Function | Line | Description |
|----------|------|-------------|
| `mergeMergeRequest(mrIid, opts)` | 202 | `glab mr merge {mrIid} --yes [...]` |
| `createMergeRequest(opts)` | 180 | `glab mr create --output json [...]` |
| `viewMergeRequest(mrIid, opts)` | 191 | `glab mr view {mrIid} --output json` |
| `listMergeRequests(opts)` | 196 | `glab mr list --output json` |
| `closeIssue(issueIid, opts)` | 144 | `glab issue close {issueIid}` |
| `createIssueNote(project, issueIid, body, opts)` | 150 | `glab api POST projects/{ref}/issues/{iid}/notes` |

**No native branch-delete helper.** Branch deletion via `git push origin --delete` directly.

---

## 4. Test File Structure

**File:** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`

### Existing tests (lines 144-220)
| Test | Lines | Coverage |
|------|-------|---------|
| finalValidationPassed gate rejects blocked | 144-148 | `closeLinkedIssue` throws on blocked |
| runDirectMerge with forge stubs | 150-174 | Happy-path close with `skipGit: true` |
| finalValidationPassed reads from archive | 176-191 | File resolution fallback |
| runDirectMerge succeeds after archive | 193-220 | Post-archive finalization |

**No tests for:** exit 2, exit 3, classifyMergeError, receipt writing, retry loop, worktree removal, branch cleanup.

### Test infrastructure pattern
- `withForge(stubs, fn)` (line 15): monkey-patches `forge` exports
- `tempRoot(name)` (line 28): `fs.mkdtempSync` in `os.tmpdir()`
- `writeWorkflow(root, project, issueIid, summary)` (line 32): writes workflow-state.md + phase6-summary.md
- `spawnSync(process.execPath, [sinkScript, ...], { cwd: root, env: {...} })` for subprocess tests
- Direct module calls with `{ root, skipGit: true }` for unit-level tests

---

## 5. Phase 6 Consumer

**File:** `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md`

Phase 6 already fully wired for exit 2/3 (lines 590-613):
```bash
if [ "$_SINK_MERGE_EXIT" -eq 3 ]; then
  cd "$_MAIN_ROOT"
  node "$CLAIM_JS" sink-fallback --project {project}
  node "$SINK_MR_JS" --branch ... $SINK_ISSUE_FLAG --project {project}
  exit $?
fi
```

**The gap is entirely in the script — it never produces exit 2 or 3.**

---

## 6. Available Imports

`kaola-gitlab-workflow-claim.js` already exports:
- `removeWorktree` (line 98, exported at line 617)
- `getCoordRoot` (line 373, exported)

---

## Gaps Summary

| Gap | GitHub location | GitLab status |
|-----|----------------|--------------|
| Exit 2: FF race retry loop (MAX_AUTOMERGE_RETRIES=3) | lines 98-143 | Missing |
| Exit 3: classifyMergeError with token → receipt | lines 40-50, 145-179 | Missing |
| Exit 3: fallback receipt at `.cache/sink-fallback.json` | lines 164-178 | Missing |
| Exit 3: `git reset --hard origin/main` on impossible | line 162 | Missing |
| Worktree removal (Step 0) | lines 219-235 | Missing |
| `chdir(os.tmpdir())` before worktree removal | line 225 | Missing |
| `process.on('exit', () => chdir(mainRoot))` hook | lines 210-218 | Missing |
| Merge-base skip-check (Step 2) | lines 248-258 | Missing |
| Post-rebase `npm test` validation (Step 4) | lines 92-95 | Missing |
| OFFLINE mode skipping all network calls | line 8 | Missing |
| KAOLA_WORKFLOW_FORCE_FF_FAIL test hook | line 9 | Missing |
| KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE test hook | line 10 | Missing |
| KAOLA_WORKFLOW_DEBUG_CWD test hook | lines 212-216 | Missing |
| `git branch -d -- {branch}` local cleanup | line 187 | Missing |
| `git push origin --delete -- {branch}` remote cleanup | lines 188-191 | Missing |
| GitLab-specific classifyMergeError patterns | — | Missing (note: GH006 is GitHub-only; use `protected branch`, `pre-receive hook declined`, `server rejected`) |
| Test coverage for exit 2/3 paths | — | Missing in test-gitlab-sinks.js |

## Deliberate Divergences (Not Gaps)
- `finalValidationPassed` gate — intentional GitLab extra safety check; keep it
- Issue close uses `forge.closeIssue` + `forge.createIssueNote` vs `gh issue close --comment`
- `cmdSinkFallback` writes `sink: mr` (GitLab) vs `sink: pr` (GitHub)
