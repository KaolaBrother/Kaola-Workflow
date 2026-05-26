# Planner: issue-168 — sink-merge stale CWD fix

## Selected Approach: A — `{ cwd: mainRoot }` at each forge call site

## Approaches Evaluated

### Approach A: Pass `{ cwd: mainRoot }` at call sites
- Pros: surgical; matches existing `-C mainRoot` discipline for git calls; no new functions; uniform shape across all three editions; uses existing exec-options seam
- Cons: must touch every forge call site (not just `closeIssue`)
- Risk: Low
- Complexity: Small

### Approach B: Restore CWD to `mainRoot` before Step 8
- Rejected: the `process.chdir(os.tmpdir())` at Step 0 is documented as intentional fail-fast discipline (forces every CWD-sensitive call to explicitly pass mainRoot). Restoring CWD silently re-enables the whole bug class.

### Approach C: `--repo`/`-R` flag
- Rejected: non-uniform syntax across `gh`/`glab`/`tea`; would require new `discoverProject` call just to bypass CWD; more code than the bug warrants.

## Recommended: Approach A

## Implementation Steps

### Step 1: Fix GitHub canonical
- File: `scripts/kaola-workflow-sink-merge.js` lines 237-239
- Pass `{ cwd: mainRoot }` to both `ghExec` calls (`issue close` and `issue edit --remove-label`)
- Change `closeIssue` catch from `catch (_)` to `catch (e)` + stderr warning:
  `sink-merge: WARNING: issue close failed for N (cwd=...); receipt.remote_issue_closed=failed. Manually run: gh issue close N`

### Step 2: Sync plugin copy (mechanical)
- File: `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Use `cp scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Do NOT hand-edit; `validate-script-sync.js:47` enforces byte-identical parity

### Step 3: Fix GitLab edition
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` lines 267-269
- Pass `{ execOptions: { cwd: mainRoot } }` to all three forge calls:
  `createIssueNote(project, id, body, opts)`, `closeIssue(id, opts)`, `updateIssue(id, opts)`
- `closeIssue` catch → `catch (e)` + stderr warning

### Step 4: Fix Gitea edition
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` lines 267-269
- Pass `{ execOptions: { cwd: mainRoot } }` to all three forge calls:
  `createIssueComment(project, id, body, opts)`, `closeIssue(id, opts)`, `updateIssueLabels(project, id, opts)`
- Note: `createIssueComment` currently passes `{}` — replace with `{ execOptions: { cwd: mainRoot } }`
- `closeIssue` catch → `catch (e)` + stderr warning

### AC#3 Warning Contract (apply in Steps 1, 3, 4)
- Exit stays 0 (merge already succeeded)
- `remoteIssueClosed = 'failed'` unchanged
- One stderr line: `sink-merge: WARNING: issue close failed for N (cwd=...); receipt.remote_issue_closed=failed. Manually run: <forge close command>`
- Label-removal and comment/note catches remain silent `catch (_)` (documented best-effort)

### Step 5: GitHub regression test
- File: `scripts/simulate-workflow-walkthrough.js`, `testSinkMergeMockabilityAndReceipt` (line 2927)
- Make the `gh` shim CWD-aware: add `.git` existence check, exit 1 when CWD is not a git repo
- With bug: shim exits 1 → `remote_issue_closed: 'failed'` → existing assertion fails
- With fix: shim runs from `mainRoot` → `'closed'` → passes

### Step 6: GitLab subprocess regression test
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Add new online subprocess test using `KAOLA_GLAB_MOCK_SCRIPT` with CWD-aware shim + bare remote
- Assert exit 0 and `closure_receipt.remote_issue_closed === 'closed'`

### Step 7: Gitea subprocess regression test
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Same as Step 6 with `KAOLA_TEA_MOCK_SCRIPT`; ensure fixture includes `full_name` field

## Explicitly NOT in Scope

- Do NOT restore CWD before Step 8
- Do NOT add `--repo`/`-R` flag plumbing
- Do NOT add retry/backoff
- Do NOT refactor `ghExec`/`glabExec`/`teaExec` signatures
- Do NOT fix `discoverProject` fallback in Gitea (separate issue — only triggers on degraded state file)
- Do NOT extend `checkClosureInvariants` to assert `remote_issue_closed`
- MR/PR sinks (`sink-mr.js`, `sink-pr.js`) — verified no `process.chdir(tmpdir)` or `closeIssue`; out of scope

## Key File Paths

- `scripts/kaola-workflow-sink-merge.js` (lines 237-239 fix; 296-299 invariant)
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` (cp sync)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` (lines 267-269)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` (lines 267-269)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` (glabExec seam, lines 14-17)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` (teaExec seam, lines 12-35)
- `scripts/simulate-workflow-walkthrough.js` (test, line 2927)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- `scripts/validate-script-sync.js` (enforces plugin-copy parity, line 47)
