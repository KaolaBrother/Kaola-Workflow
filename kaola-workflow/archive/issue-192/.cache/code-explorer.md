# Code Explorer Output — issue-192

## Entry Points

- `scripts/kaola-workflow-closure-audit.js` — main GitHub edition
- `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` — byte-identical Codex copy; enforced by `validate-script-sync.js:43`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` — GitLab port
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` — Gitea port

---

## Execution Flow (GitHub edition)

1. `main()` (closure-audit.js:296) → `buildAuditReport(root)` (line 299)
2. `buildAuditReport()` (line 206):
   - `readActiveFolders(root, { excludeClosedIssues: false })` — reads all non-archive subfolders
   - `roadmapSourceFiles(root)` — reads `.roadmap/issue-N.md` filenames
   - `archiveClosedIssues(root)` (lines 93–108) — reads `kaola-workflow/archive/*/workflow-state.md`, checks `field(content, 'status') === 'closed'`. Returns `Set<number>` of 111 archived-closed issue numbers.
   - Candidate assembly (lines 211–213): union of srcFiles + `Array.from(archiveClosed)` + active folders. All 111 archive numbers become candidates.
   - `collectClosedSet(candidates)` (lines 68–80): iterates ALL candidates, calls `probeIssueState(n)` **synchronously one by one** for each unique integer.

3. `probeIssueState(n)` (active-folders.js:56–70):
   - Returns `{state:'open', reason:'offline-or-null'}` when offline or null
   - Calls `ghExec(['issue', 'view', String(n), '--json', 'state'])` — **blocking `execFileSync` with `REMOTE_TIMEOUT_MS` (30s default)**
   - Returns `{state:'closed'|'open', reason:'ok'}` or `{state:'unavailable', reason:'timeout'|'gh issue fetch failed'|...}`

4. **WHERE THE HANG LIVES**: `collectClosedSet` for-loop (lines 73–79) processes all unique candidates serially. With 111 archived-closed issue numbers at 30s each = worst case 55 minutes.

---

## Critical Finding: Archive-Only Numbers Are Never Consumed by Detectors

Numbers that appear **only** via `archiveClosed` (no surviving `.roadmap` source, no active folder) are probed but their probe result is **never used** by any detector:
- `detectStaleRoadmapSources` already uses `archiveClosed.has(n)` directly (no remote probe needed)
- `detectMirrorClosed` only fires on numbers in `readRoadmapIssues` (not archive-only)
- `detectActiveClosedFolders` only fires on active (non-archive) folders
- `detectUnarchivedPrFolders` only fires on active folders

The remote probe for archive-only numbers only cosmetically changes the reason string from `'archive_closed'` to `'closed_remote'`. These probes are pure waste.

---

## Batch Pattern to Mirror

`detectStaleLabels()` (closure-audit.js:139–151, line 142):
```js
ghExec(['issue', 'list', '--state', 'closed', '--label', CLAIM_LABEL, '--json', 'number,title,url'])
```
One call returns all matching issues. GitLab/Gitea ports use `forge.listIssues({ state: 'closed', labels: [CLAIM_LABEL] })` (gitlab-audit.js:134, gitea-audit.js:133).

**This is the direct template for the fix**: replace N serial `gh issue view` calls with one `gh issue list --state closed --json number --limit 1000` call, then intersect returned numbers with candidates.

---

## Similar Implementations

- No `Promise.all` or async parallel gh-call patterns in production scripts
- All production `gh` calls use `execFileSync` (synchronous/blocking)
- Only batch pattern is `detectStaleLabels()` using `gh issue list` (as above)
- `simulate-workflow-walkthrough.js:236` has `Promise.all` but only in test harness

---

## File Organization and Forge Ports

| File | Role | Sync Requirement |
|------|------|-----------------|
| `scripts/kaola-workflow-closure-audit.js` | Canonical GitHub edition | Source of truth |
| `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | Byte-identical Codex copy | `validate-script-sync.js:43` enforces this |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` | GitLab port | Same `collectClosedSet` loop (lines 59–71); uses `forge.listIssues` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` | Gitea port | Same `collectClosedSet` structure (lines 58–70); uses `forge.listIssues` |
| `scripts/kaola-workflow-active-folders.js` | `probeIssueState`, `ghExec`, `REMOTE_TIMEOUT_MS` | Shared by GitHub edition |
| `scripts/validate-script-sync.js` | Enforces byte-identity between canonical and Codex copy | Must pass after any fix |

---

## Error Handling Patterns

- **Timeout detection** (active-folders.js:65): `err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT'` — consistent triple-check in every `catch`
- **Timed-out detector return**: `detectStaleLabels` returns `'skipped_timeout'` sentinel string; `detectUnarchivedPrFolders` returns `'skipped_timeout'` at first timeout
- **Per-probe timeout**: `probeIssueState` returns `{state:'unavailable', reason:'timeout'}` → feeds `unresolved[]` in `collectClosedSet`
- **Non-timeout gh failure**: returns `{state:'unavailable', reason:'gh issue fetch failed'}`; `detectStaleLabels`/`detectUnarchivedPrFolders` log to stderr and return `[]` or `continue`

---

## Test Locations and Framework

- **Test file**: `scripts/simulate-workflow-walkthrough.js` (3871 lines)
- **Framework**: Hand-rolled `assert(cond, msg)` (line 19–21); no jest/mocha/tap
- **Closure-audit section**: Lines 3253–3724
- **Timeout test pattern** (lines 3556–3598): hanging shim `['setInterval(() => {}, 1 << 30);']` + `KAOLA_GH_REMOTE_TIMEOUT_MS:'300'`
- **Mock pattern**: `closureAuditShim(binDir, [...])` writes `gh.js` mock via `writeShimFiles`; `runClosureAudit` sets `KAOLA_GH_MOCK_SCRIPT`
- **MISSING**: No large-archive-set regression test. No test plants 50+ archive entries to assert bounded probe count or time-to-completion.

---

## Env Vars and Config

| Env Var | Default | Effect |
|---------|---------|--------|
| `KAOLA_WORKFLOW_OFFLINE` | `'0'` | `=1` disables all gh calls; `probeIssueState` returns `{state:'open'}` immediately |
| `KAOLA_GH_REMOTE_TIMEOUT_MS` | `'30000'` | Per-call timeout for `execFileSync`. Clamped to 600000ms. NaN → 30000. |
| `KAOLA_GH_MOCK_SCRIPT` | unset | Routes `ghExec` through mock script (test use only) |

No feature flags for batch mode. No `KAOLA_AUDIT_*` namespace.

---

## Fix Design (from exploration)

1. **Batch list** (primary): Replace `collectClosedSet`'s serial `probeIssueState` loop with `gh issue list --state closed --json number --limit 1000`, extract returned numbers into a Set, intersect against candidates. One remote call instead of N.
2. **Skip archive-only candidates** (optimization): Numbers present only in `archiveClosed` (not in roadmap sources, not in active folders) can skip the probe entirely — no detector uses their remote result.
3. **Apply to 4 files**: canonical + Codex copy (must stay byte-identical per `validate-script-sync.js`) + GitLab port + Gitea port.
4. **Add large-archive regression test**: Plant 50+ archive folders with `status: closed`, use a call-counting gh shim, assert `gh issue list` called once (not N times) and audit completes.
5. **Keep `execFileSync`-only execution model**: Do not introduce async/`Promise.all` — all production scripts are synchronous.
