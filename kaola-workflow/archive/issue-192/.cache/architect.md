# Code Architect Output — issue-192

## Design Decisions

**D1: Remove ONLY `.concat(Array.from(archiveClosed))` from the candidates chain; keep `archiveClosedIssues(root)` computed and passed to `detectStaleRoadmapSources`.**
`detectStaleRoadmapSources(srcFiles, closedSet, archiveClosed)` reads `archiveClosed.has(n)` to emit the `archive_closed` reason. Dropping the computation or the arg silently breaks archive-closed drift detection while the probe-count test still passes.

**D2: Match the edit by pattern, not line number.** The single middle line to delete is `.concat(Array.from(archiveClosed))`. Sits at different line numbers across editions (GitHub/Codex 211-213, GitLab 213-215, Gitea 212-214).

**D3: The fix has no observable effect on any drift output** — an archive-only issue number never appears in any `drift.*` list. The ONLY observable signal is the remote probe count. Therefore the regression test must be a counting-shim test.

**D4: New mirrored counting test required in all three test suites** (GitHub, GitLab, Gitea). The Codex edition needs NO new test: `test:kaola-workflow:codex` runs only the 147-line Codex walkthrough (zero closure-audit coverage); the Codex production copy is guarded by `validate-script-sync.js` byte-identity and exercised transitively through the GitHub suite.

**D5: Port shim probe-branch strings differ:**
- GitLab: `a.includes('issue view')` — singular
- Gitea: `a.includes('issues view')` — PLURAL "issues"

**D6: Port archive fixtures use `issue_iid: 950` not `issue_number: 950`** (D4 iid-first convention in port test helpers).

**D7: `=== 1` assertion does double duty** — `!= 2` proves archive number dropped from candidates (fails on unfixed code); `!= 0` proves probing ran online (catches OFFLINE short-circuit false-pass).

---

## Files to Create

None — all changes are edits to existing files.

---

## Files to Modify

| File | Exact change | Priority |
|------|--------------|----------|
| `scripts/kaola-workflow-closure-audit.js` | Delete the middle line `.concat(Array.from(archiveClosed))` from `buildAuditReport()`'s candidates chain (line ~212). Keep `const archiveClosed = archiveClosedIssues(root);` and `detectStaleRoadmapSources(srcFiles, closedSet, archiveClosed)` untouched. | P0 |
| `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | Byte-identical edit to the GitHub file above (Codex copy; enforced by `validate-script-sync.js`). Same line deleted. | P0 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` | Same single-line deletion `    .concat(Array.from(archiveClosed))` in `buildAuditReport()` (line ~214). Keep `archiveClosed` decl and its use in `detectStaleRoadmapSources`. | P0 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` | Same single-line deletion (line ~213). Keep `archiveClosed` decl and its use. | P0 |
| `scripts/simulate-workflow-walkthrough.js` | Add `testClosureAuditArchiveOnlyNotProbed` after `testClosureAuditDedupRoadmapAndArchive` (ends line 3362); register call after `testClosureAuditDedupRoadmapAndArchive();` (line 3844). | P0 |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Mirror test after `testClosureAuditDedupRoadmapAndArchive` (~line 2035); register after its call (~line 2415). GitLab conventions (see below). | P0 |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Mirror test after `testClosureAuditDedupRoadmapAndArchive` (~line 1956); register after its call (~line 2369). Gitea conventions (plural `issues view`). | P0 |
| `CHANGELOG.md` | Add entry under `[Unreleased]` describing the closure-audit probe-set fix. | P2 |

---

## Build Sequence (per forge — cross-forge parallel)

For each forge independently, dependency order is **test-first (red) → prod edit (green)**:

1. **Write the regression test** in the forge's test file. Run the suite — the new test MUST fail with `got 2` against current (unfixed) code. This proves the test discriminates.
2. **Apply the single-line production deletion** in that forge's closure-audit.js.
3. **Re-run the suite** — new test passes with `got 1`; all existing closure-audit tests stay green.
4. **CHANGELOG** entry (any time; no dependency).
5. After GitHub/Codex prod edit: run `node scripts/validate-script-sync.js`.

The GitHub prod edit and the Codex prod edit are a **single atomic task** (byte-identity) — edit both files identically, then `validate-script-sync.js` must pass.

---

## Parallelization Groups (disjoint write sets)

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A — prod edits | TASK-GH-PROD, TASK-GL-PROD, TASK-GT-PROD | Disjoint files; TASK-GH-PROD bundles canonical + Codex copy |
| B — test edits | TASK-GH-TEST, TASK-GL-TEST, TASK-GT-TEST | Disjoint files |
| C — doc | TASK-DOC | Independent of all code |

Within a forge: TEST before PROD (red/green). Across forges: Group A ‖ Group B.

---

## Task List

### TASK-GH-TEST: Write GitHub regression test
- **File:** `scripts/simulate-workflow-walkthrough.js`
- **Write Set:** `scripts/simulate-workflow-walkthrough.js`
- **Depends On:** none (write first; verify it fails)
- **Parallel Group:** B
- **Action:** MODIFY
- **Implement:** `testClosureAuditArchiveOnlyNotProbed` function (see full spec below)
- **Mirror:** `testClosureAuditDedupRoadmapAndArchive` (line 3318) for fixture pattern; counting shim disk I/O mirrors marker-file pattern (line 3543)
- **Validate:** `node scripts/simulate-workflow-walkthrough.js` (must FAIL with `got 2` before prod edit; PASS after)

### TASK-GH-PROD: Apply GitHub and Codex production fix
- **File:** `scripts/kaola-workflow-closure-audit.js` AND `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js`
- **Write Set:** both files (byte-identical edit)
- **Depends On:** TASK-GH-TEST (test must be written and verified failing first)
- **Parallel Group:** A
- **Action:** MODIFY
- **Implement:** Delete single line `.concat(Array.from(archiveClosed))` from candidates chain in `buildAuditReport()` in each file
- **Validate:** `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js`

### TASK-GL-TEST: Write GitLab regression test
- **File:** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- **Write Set:** same file
- **Depends On:** none
- **Parallel Group:** B
- **Action:** MODIFY
- **Implement:** Mirror of GitHub test with GitLab conventions (see spec below)
- **Validate:** `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (must FAIL first)

### TASK-GL-PROD: Apply GitLab production fix
- **File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js`
- **Write Set:** same file
- **Depends On:** TASK-GL-TEST
- **Parallel Group:** A
- **Action:** MODIFY
- **Implement:** Delete single line `.concat(Array.from(archiveClosed))` from candidates chain (~line 214)
- **Validate:** `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js && node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`

### TASK-GT-TEST: Write Gitea regression test
- **File:** `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- **Write Set:** same file
- **Depends On:** none
- **Parallel Group:** B
- **Action:** MODIFY
- **Implement:** Mirror of GitHub test with Gitea conventions (plural `issues view`/`issues list`)
- **Validate:** `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (must FAIL first)

### TASK-GT-PROD: Apply Gitea production fix
- **File:** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js`
- **Write Set:** same file
- **Depends On:** TASK-GT-TEST
- **Parallel Group:** A
- **Action:** MODIFY
- **Implement:** Delete single line `.concat(Array.from(archiveClosed))` from candidates chain (~line 213)
- **Validate:** `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js && node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`

### TASK-DOC: Update CHANGELOG
- **File:** `CHANGELOG.md`
- **Write Set:** `CHANGELOG.md`
- **Depends On:** none
- **Parallel Group:** C (independent)
- **Action:** MODIFY
- **Implement:** Add entry under `[Unreleased]`
- **Validate:** visual check

---

## Regression Test Specification

### GitHub test: `testClosureAuditArchiveOnlyNotProbed`

**Placement:** define immediately after `testClosureAuditDedupRoadmapAndArchive` (ends line 3362). Register call after `testClosureAuditDedupRoadmapAndArchive();` (line 3844).

**Fixture:**
- ONE roadmap source via `plantRoadmapIssue(tmp, 920, '')` — issue 920 is always a candidate → always probed
- ONE archive-only entry for issue 950, NO roadmap source, NO active folder for 950:
  ```js
  const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-950');
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'),
    'status: closed\nstep: complete\nissue_number: 950\n');
  ```
  (GitHub archive uses `issue_number:` — matches `testClosureAuditArchiveClosedDrift` at line 3318)

**Counting shim disk I/O pattern:**
```js
const viewCountFile = path.join(binDir, 'view-count');
closureAuditShim(binDir, [
  "const fs = require('fs');",
  "const cf = " + JSON.stringify(viewCountFile) + ";",
  "const a = process.argv.slice(2).join(' ');",
  "if (a.includes('issue view')) {",
  "  let n = 0; try { n = parseInt(fs.readFileSync(cf, 'utf8'), 10) || 0; } catch (_) {}",
  "  fs.writeFileSync(cf, String(n + 1));",
  "  process.stdout.write('{\"state\":\"open\"}\\n');",
  "} else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
  "else { process.stdout.write('{}\\n'); }"
]);
```

**Run and assert:**
```js
const result = runClosureAudit([], tmp, binDir);
const viewCount = fs.existsSync(viewCountFile)
  ? parseInt(fs.readFileSync(viewCountFile, 'utf8'), 10) : 0;
assert(viewCount === 1,
  'archive-only 950 must not be probed; expected exactly 1 issue-view (roadmap 920 only), got ' + viewCount);
```

- `=== 1` (not 2): proves 950 dropped from candidates → fix is in place (fails on unfixed code)
- `=== 1` (not 0): proves probing ran online → defuses OFFLINE short-circuit false-pass

### GitLab differences:
- Prefix: `kw-gl-ca-archive-only-`
- Roadmap: `plantClosureRoadmapSource(tmp, 920)` (not `plantRoadmapIssue`)
- Archive fixture: `issue_iid: 950` (not `issue_number: 950`)
- Shim branches: `a.includes('issue view')` / `a.includes('issue list')` — singular (same as GitHub)
- Register after `testClosureAuditDedupRoadmapAndArchive();` (~line 2415)

### Gitea differences:
- Prefix: `kw-gt-ca-archive-only-`
- Roadmap: `plantClosureRoadmapSource(tmp, 920)`
- Archive fixture: `issue_iid: 950`
- Shim branches: `a.includes('issues view')` / `a.includes('issues list')` — **PLURAL "issues"** ← easy to miss
- Register after `testClosureAuditDedupRoadmapAndArchive();` (~line 2369)

---

## Over-Removal Guard (existing tests — do NOT modify)

These existing tests guard the correctness constraint (must keep `archiveClosed` computed + passed to `detectStaleRoadmapSources`):
- `testClosureAuditArchiveClosedDrift` — fails if `archiveClosed` is dropped or not passed
- `testClosureAuditDedupRoadmapAndArchive` — fails if archive plumbing breaks

Leave them untouched. Require they stay green after all edits.

---

## External Dependencies

None — uses only Node.js built-in `fs`, `child_process`, and existing test helpers.

---

## Out of Scope (explicit)

- `collectClosedSet`, `probeIssueState`, `archiveClosedIssues(root)` — unchanged
- `detectStaleRoadmapSources` signature/body — unchanged
- All other detectors (mirror, labels, active-folder, unarchived-pr/mr) — unchanged
- All existing closure-audit tests — unchanged
- Codex walkthrough `simulate-kaola-workflow-walkthrough.js` — NOT edited
- Hooks, install/uninstall scripts, README, docs/architecture — no change
- No new env vars, no API surface change, no pagination machinery

---

## Validation Commands

```bash
# After GitHub/Codex prod edit (byte-identity gate):
node scripts/validate-script-sync.js

# After GitHub test + prod:
node scripts/simulate-workflow-walkthrough.js

# After GitLab test + prod:
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js

# After Gitea test + prod:
node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js

# Full gate after all tasks:
npm test
```
