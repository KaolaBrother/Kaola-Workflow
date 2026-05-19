# Advisor — Phase 2 Ideation Gate: Issue #88

## Verdict: Plan sound. Proceed with two-grouped-task approach.

## Advisor Findings and Resolutions

### 1. `repair()` return-shape contract (HIGH risk — must enumerate before Phase 3)

Four branches in three-way logic:
- State absent OR `stateLooksValid()` false → fall-through write path → `{repaired: true, project, phase, next_skill}` (existing shape, regression-safe)
- State present + valid + complete → `{repaired: false, complete: true, project}`
- State present + valid + stale → write rebuilt state → `{repaired: true, stale: true, project, next_skill}`
- State present + valid + current → `{repaired: false, valid: true, project, next_skill}`

Resolution: The fall-through case preserves exactly the shape tested at `test-gitlab-workflow-scripts.js:405-415`. Phase 3 architect must enumerate these shapes explicitly in the task spec.

### 2. OFFLINE tests must be spawnSync, not withForge

Resolution: The OFFLINE env var is read at module load (`const OFFLINE = ...`). In-process `require()` + `classifyIssue()` cannot re-evaluate it after the module is loaded. All OFFLINE tests must use `runNode(...)` with `{ env: {..., KAOLA_WORKFLOW_OFFLINE: '1'} }`. Document in task spec.

### 3. `parseAreaLabelsFromText` already exists in GitLab classifier

Resolution: Confirmed at line 88 of `kaola-gitlab-workflow-classifier.js`. Not a gap; no addition needed. The OFFLINE path can call it directly. Remove from the write-set additions list.

### 4. `updated_at` absent → treat as recent (return true)

Resolution: Confirmed from `scripts/kaola-workflow-classifier.js:168`: `if (!comment.updated_at) return true;`. The planner's interpretation is correct. Mirror this behavior exactly.

### 5. `blocked by #N` pattern — single match, not a loop

Resolution: GitHub uses `/blocked by #\d+/i.test(nextStep)` (a `.test()` match, not a global regex loop). Only one depends-on label is synthesized per roadmap `next_step`. Mirror exactly.

### 6. Config path scope — deliberate choice

Resolution: `~/.config/kaola-workflow/config.json` is user-scoped and shared with the GitHub edition. The schema (`{ parallel_mode }`) is identical. This is a deliberate design choice, not an assumption. Document in phase2-ideation.md.

## Advisor Recommendation

Proceed. The two-grouped-task structure is correct. Phase 3 architect must:
- Enumerate `repair()` return shapes for all four branches.
- Note that OFFLINE tests require spawnSync (not withForge).
- Confirm `parseAreaLabelsFromText` is already present (not in write set).
- Apply `updated_at` absent → true behavior from GitHub reference line 168.
