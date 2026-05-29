# Phase 3 - Plan: issue-192

## Blueprint

### Files to Create
None — all changes are edits to existing files.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-closure-audit.js` | Delete single line `.concat(Array.from(archiveClosed))` from `buildAuditReport()`'s candidates chain. Keep `archiveClosed` computed and passed to `detectStaleRoadmapSources`. | Canonical GitHub edition — removes the unbounded archive term from probe candidates |
| `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | Byte-identical edit to canonical above | Codex copy; enforced by `validate-script-sync.js` |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` | Same single-line deletion in `buildAuditReport()` | GitLab port; same structural fix |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` | Same single-line deletion in `buildAuditReport()` | Gitea port; same structural fix |
| `scripts/simulate-workflow-walkthrough.js` | Add `testClosureAuditArchiveOnlyNotProbed` + register its call | GitHub regression test: proves archive-only issues are not probed |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add mirror test + register | GitLab regression test |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Add mirror test + register | Gitea regression test |
| `CHANGELOG.md` | Add entry under `[Unreleased]` | Documentation checklist |

### Build Sequence
1. [TASK-GH-TEST] Write GitHub test — run suite, confirm new test FAILS with `got 2` (fail-first proof)
2. [TASK-GL-TEST] Write GitLab test in parallel with step 1 — run suite, confirm new test FAILS
3. [TASK-GT-TEST] Write Gitea test in parallel with steps 1-2 — run suite, confirm new test FAILS
4. [TASK-GH-PROD] Apply GitHub + Codex prod edit (atomic — both files, byte-identical) — run `validate-script-sync.js` then suite; PASSES
5. [TASK-GL-PROD] Apply GitLab prod edit — run suite; PASSES
6. [TASK-GT-PROD] Apply Gitea prod edit — run suite; PASSES
7. [TASK-DOC] CHANGELOG entry (any time, no dependency)
8. Final gate: `npm test`

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| B — test writes | TASK-GH-TEST ‖ TASK-GL-TEST ‖ TASK-GT-TEST | Disjoint files |
| A — prod edits | TASK-GH-PROD (bundles canonical + Codex) ‖ TASK-GL-PROD ‖ TASK-GT-PROD | Disjoint files; each after its forge's test |
| C — doc | TASK-DOC | Independent |

**IMPORTANT:** Per-forge ordering is TEST → PROD within each forge. Never fire a forge's prod task before its test task has been written AND run-red. The three forge pipelines run in parallel with each other.

### External Dependencies
None — uses only Node.js built-in `fs`, `child_process`, and existing test helpers.

---

## Task List

### Task 1: TASK-GH-TEST — Write GitHub regression test
- **File:** `scripts/simulate-workflow-walkthrough.js`
- **Test File:** (this IS the test file)
- **Write Set:** `scripts/simulate-workflow-walkthrough.js`
- **Depends On:** none
- **Parallel Group:** B
- **Action:** MODIFY
- **Implement:**
  - Define function `testClosureAuditArchiveOnlyNotProbed` immediately after `testClosureAuditDedupRoadmapAndArchive` (ends line ~3362)
  - Fixture: `plantRoadmapIssue(tmp, 920, '')` for one roadmap-source candidate; create `kaola-workflow/archive/issue-950/workflow-state.md` with `status: closed\nstep: complete\nissue_number: 950\n` — no `.roadmap/issue-950.md`
  - Counting shim: use `closureAuditShim(binDir, [...])` with disk read-increment-write counter at `path.join(binDir, 'view-count')`. On `issue view`: read, increment, write, emit `{"state":"open"}`. On `issue list`: emit `[]`. Else: emit `{}`.
  - Run: `runClosureAudit([], tmp, binDir)` (hardssets `KAOLA_WORKFLOW_OFFLINE:'0'`)
  - Assert: `viewCount === 1` ("archive-only 950 must not be probed; expected exactly 1 issue-view (roadmap 920 only), got N")
  - Secondary: assert 950 absent from `result.drift` fields (locks D3 — no drift-output change)
  - Register call after `testClosureAuditDedupRoadmapAndArchive();` (~line 3844)
- **Mirror:** `testClosureAuditDedupRoadmapAndArchive` (line 3318) for fixture pattern; marker-file pattern (line 3543) for disk-counter shim
- **Validate:** `node scripts/simulate-workflow-walkthrough.js` — MUST FAIL with `got 2` before TASK-GH-PROD; PASSES after

### Task 2: TASK-GH-PROD — Apply GitHub + Codex production fix
- **File:** `scripts/kaola-workflow-closure-audit.js` AND `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js`
- **Write Set:** both files (byte-identical edit)
- **Depends On:** TASK-GH-TEST (must be written and verified failing)
- **Parallel Group:** A
- **Action:** MODIFY
- **Implement:**
  - Read the actual candidates assembly in each file before editing — do NOT trust line numbers from summaries
  - In `buildAuditReport()`, delete the line `.concat(Array.from(archiveClosed))` from the candidates chain
  - Confirm resulting expression is syntactically valid (no dangling `.concat`, no orphaned `;`)
  - Keep `const archiveClosed = archiveClosedIssues(root);` and `detectStaleRoadmapSources(srcFiles, closedSet, archiveClosed)` intact
  - Pre-edit: grep `buildAuditReport` for uses of the `closed` set from `collectClosedSet` — must only be passed to detectors, not in returned object
  - Apply same edit to both files identically
- **Validate:** `node scripts/validate-script-sync.js && node scripts/simulate-workflow-walkthrough.js`

### Task 3: TASK-GL-TEST — Write GitLab regression test
- **File:** `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- **Write Set:** same file
- **Depends On:** none
- **Parallel Group:** B
- **Action:** MODIFY
- **Implement:** Mirror of TASK-GH-TEST with GitLab differences:
  - Prefix: `kw-gl-ca-archive-only-`
  - Roadmap: `plantClosureRoadmapSource(tmp, 920)` (not `plantRoadmapIssue`)
  - Archive fixture: `issue_iid: 950` (not `issue_number: 950`)
  - Shim branches: `a.includes('issue view')` / `a.includes('issue list')` — **singular** (same as GitHub)
  - Insert after `testClosureAuditDedupRoadmapAndArchive` (~line 2035); register after its call (~line 2415)
- **Validate:** `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — MUST FAIL before TASK-GL-PROD

### Task 4: TASK-GL-PROD — Apply GitLab production fix
- **File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js`
- **Write Set:** same file
- **Depends On:** TASK-GL-TEST
- **Parallel Group:** A
- **Action:** MODIFY
- **Implement:** Same single-line deletion as GitHub; read actual code first; verify chain syntax; keep `archiveClosed` decl and downstream usage
- **Validate:** `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js && node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`

### Task 5: TASK-GT-TEST — Write Gitea regression test
- **File:** `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- **Write Set:** same file
- **Depends On:** none
- **Parallel Group:** B
- **Action:** MODIFY
- **Implement:** Mirror of TASK-GH-TEST with Gitea differences:
  - Prefix: `kw-gt-ca-archive-only-`
  - Roadmap: `plantClosureRoadmapSource(tmp, 920)`
  - Archive fixture: `issue_iid: 950`
  - Shim branches: `a.includes('issues view')` / `a.includes('issues list')` — **PLURAL "issues"** (easy to miss)
  - Insert after `testClosureAuditDedupRoadmapAndArchive` (~line 1956); register after its call (~line 2369)
- **Validate:** `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — MUST FAIL before TASK-GT-PROD

### Task 6: TASK-GT-PROD — Apply Gitea production fix
- **File:** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js`
- **Write Set:** same file
- **Depends On:** TASK-GT-TEST
- **Parallel Group:** A
- **Action:** MODIFY
- **Implement:** Same single-line deletion; read actual code first; verify chain syntax; keep `archiveClosed` decl and downstream usage
- **Validate:** `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js && node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`

### Task 7: TASK-DOC — Update CHANGELOG
- **File:** `CHANGELOG.md`
- **Write Set:** `CHANGELOG.md`
- **Depends On:** none
- **Parallel Group:** C
- **Action:** MODIFY
- **Implement:** Add entry under `[Unreleased]` describing the fix
- **Validate:** visual check

---

## Advisor Notes

Advisor confirmed the plan is sound and implementable. Three downstream requirements:

1. **Delete by pattern, not line number.** Delete the text `.concat(Array.from(archiveClosed))`; verify resulting expression is syntactically valid in each of the 4 production files after editing. Ports may order `.concat` calls differently.

2. **Confirm `closedSet` is detector-only** before prod edit — grep `buildAuditReport` for any use of the returned `closed` set beyond being passed to detectors. If clean, add secondary assertion that issue 950 is absent from `result.drift` fields.

3. **Per-forge TEST→PROD ordering is mandatory.** Three independent forge pipelines run in parallel with each other; within each forge, test must be written and run-red before prod edit is applied.

---

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor approved plan without requesting revisions |
