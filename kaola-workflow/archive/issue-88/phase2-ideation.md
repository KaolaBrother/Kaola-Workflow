# Phase 2 - Ideation: issue-88

## Approaches Evaluated

### Option A: Two Grouped Tasks (recommended)
- Summary: Task A covers classifier gaps 1-3 in `kaola-gitlab-workflow-classifier.js`; Task B covers repair-state gaps 4-5 in `kaola-gitlab-workflow-repair-state.js`. Both tasks append non-overlapping test sections to `test-gitlab-workflow-scripts.js`.
- Pros: Write sets fully partition by file; each task is one focused PR; bisect granularity at file level; contiguous test blocks; matches existing GitLab plugin PR patterns.
- Cons: Each PR is moderately sized (~3 gaps for classifier, ~2 for repair-state).
- Risk: Low
- Complexity: Medium

### Option B: One Mega-task (all 5 gaps)
- Summary: Single task covering all 5 gaps across both files.
- Pros: Single review pass; minimum PR overhead.
- Cons: Conflates classifier and repair-state concerns; hurts bisect; harder to revert individual gaps; oversized diff.
- Risk: Medium-High
- Complexity: Medium

### Option C: Five Independent Tasks (one per gap)
- Summary: One task per gap.
- Pros: Maximally granular; each gap independently revertable.
- Cons: Gaps 1-3 all touch `cmdClassify` control flow — three sequential overlapping diffs in same function; merge ordering friction.
- Risk: Medium
- Complexity: Small per task but high coordination overhead

## Advisor Findings

Plan structure is sound. Key resolutions from advisor gate:
1. **`repair()` return shapes**: Four branches enumerated — fall-through (no state or invalid) preserves existing `{repaired: true, project, phase, next_skill}` shape; valid+stale returns `{repaired: true, stale: true}`; valid+current returns `{repaired: false, valid: true}`. Phase 3 must enumerate all four.
2. **OFFLINE tests must be spawnSync**: `OFFLINE` constant is evaluated at module load; `withForge` in-process tests cannot re-trigger it. All OFFLINE test cases use `runNode()` with `KAOLA_WORKFLOW_OFFLINE: '1'` in env.
3. **`parseAreaLabelsFromText` already exists in GitLab classifier at line 88** — not a gap; not in write set.
4. **`updated_at` absent → treat as recent**: Confirmed from GitHub reference line 168. Mirror exactly.
5. **`blocked by #N` — single `.test()` match, not a loop**. Only one depends-on label synthesized.
6. **Config scope is user-level (`~/.config/kaola-workflow/config.json`)**: Deliberate shared schema with GitHub edition (`{ parallel_mode }`). Not an assumption.

## Selected Approach

**Option A — Two Grouped Tasks**

Rationale: The five gaps naturally partition by file (classifier vs. repair-state) with no cross-file dependencies. Option A respects this boundary, keeps each PR reviewable, and matches how prior GitLab plugin issues have been shipped (one PR per script surface area). Option B creates a monolithic diff that conflates unrelated concerns. Option C introduces artificial ordering constraints where none need to exist — gaps 1-3 are all in `cmdClassify`/`classifyIssue` and need a single contiguous block of additions, not three separate PRs.

### Task A: Classifier Gaps (1, 2, 3)
Write file: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`
Test file: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (append)

**Gap 1 — parallel_mode bypass**:
- Add `const os = require('os')`
- `readOrCreateConfig()`: compute `CONFIG_PATH` inside the function (NOT at module top) so tests can override `HOME`; reads `~/.config/kaola-workflow/config.json`; on failure creates `{ parallel_mode: 'auto' }`
- In `cmdClassify()`: call `readOrCreateConfig()` first; if `config.parallel_mode !== 'auto'`, output `{ verdict: 'green', reasoning: 'parallel_mode=X; bypassing classifier' }` and return

**Gap 2 — OFFLINE fallback**:
- Add `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'` near top
- `checkDependsOn()`: explicit OFFLINE branch → `{ verdict: 'blocked', reasoning: 'OFFLINE and depends-on:#N label present; conservative block' }`
- `cmdClassify()`: OFFLINE branch reads `.roadmap/issue-N.md` via `active.getRoot()`, matches `/blocked by #\d+/i` against `next_step` field, synthesizes `depends-on` label, calls `parseAreaLabelsFromText()` (already exists at line 88), calls `classify()`, returns. Place in `cmdClassify`, not `classifyIssue`.

**Gap 3 — Remote claim detection**:
- `issueHasWorkflowInProgressLabel(labels)`: `return (labels || []).includes(forge.CLAIM_LABEL)` (string array, not `{name}` objects)
- `issueHasRemoteClaimNotes(issueIid)`: if OFFLINE return false; lazy `forge.discoverProject()` in try/catch; call `forge.listIssueNotes(project, issueIid)`; match body against `/<!--\s*kw:claim\s+(project|sess)=/`; `!note.updated_at → true`; else `Date.now() - new Date(note.updated_at) < 24h`
- Remote claim guard in `classifyIssue()` after closed-state check, before `return classify()`: if label present OR recent note, return `{ verdict: 'blocked', reasoning: 'issue #N has a remote workflow claim' }`

### Task B: Repair-State Gaps (4, 5)
Write file: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js`
Test file: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (append)

**Gap 4 — stateLooksValid + three-way branch**:
- Add `stateLooksValid(root, project, content)` mirroring `scripts/kaola-workflow-repair-state.js:380-396`
- Rewrite `repair()` three-way logic: state absent/invalid → fall-through write → `{repaired: true, project, phase, next_skill}`; valid+complete → `{repaired: false, complete: true}`; valid+stale → write + `{repaired: true, stale: true}`; valid+current → no-write + `{repaired: false, valid: true}`

**Gap 5 — Ownership block**:
- In `stateContent()`: insert `## Ownership Rules` section after `## Pending Gates`, before `## Last Evidence`
- `main_session_role: orchestrator`, `implementation_owner: tdd-guide` (phase 4) or `N/A`, `fix_owner: tdd-guide or build-error-resolver` (phase 4/5/6) or `N/A`, `inline_emergency_fallback_authorized: no`
- Change `last_result: 'reconstructed'` → `'state_repaired_from_artifacts'`
- Keep `['GitLab', 'Sink']` section preservation (GitLab-specific; do NOT collapse to `['Sink']`)

## Out of Scope (explicit)

- No changes to `kaola-gitlab-forge.js` or `kaola-gitlab-workflow-active-folders.js`
- No new test framework — extend hand-rolled `assert` + `withForge` style
- No threading `project` through `classify()` / `classifyIssue()` signatures
- No change to `last_command` field text
- No notes-API pagination handling
- No CHANGELOG entry per gap — one entry per task

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
