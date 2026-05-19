# Planner Output — Issue #88: GitLab Classifier and Repair-State Parity Gaps

## Recommended Approach: Two Grouped Tasks

Task A — Classifier gaps 1, 2, 3 in `kaola-gitlab-workflow-classifier.js`
Task B — Repair-state gaps 4, 5 in `kaola-gitlab-workflow-repair-state.js`
Both tasks append non-overlapping test sections to `test-gitlab-workflow-scripts.js`.

**Gap 3 `project` ref**: lazy `forge.discoverProject()` inside `issueHasRemoteClaimNotes()` wrapped in try/catch (mirroring `discoverProjectSafe` at `kaola-gitlab-workflow-claim.js:125`). Do NOT thread project through `classifyIssue()` signatures.

## Approaches Evaluated

### Option 1 — One mega-task (all 5 gaps)
- Pros: single review pass; minimum PR overhead.
- Cons: conflates classifier and repair-state concerns; hurts bisect; harder to revert.
- Risk: Medium-High.
- Verdict: rejected.

### Option 2 — Five independent tasks (one per gap)
- Pros: maximally granular; each gap individually revertable.
- Cons: gaps 1-3 all touch `cmdClassify` control flow; five sequential overlapping diffs in same function; merge ordering friction.
- Risk: Medium.
- Verdict: rejected — artificial split because gaps share control-flow location.

### Option 3 — Two grouped tasks (recommended)
- Pros: write sets fully partition by file; each task is one focused PR; matches existing GitLab plugin patterns.
- Cons: each PR moderately sized (~3 gaps for classifier, ~2 for repair-state).
- Risk: Low. The two PRs can land in either order since they touch disjoint files.

## Task A — Classifier Gaps (1, 2, 3)

### Key Implementation Decisions

**Gap 1 (parallel_mode bypass)**:
- Compute `CONFIG_PATH` inside `readOrCreateConfig()` (NOT at module top level) — keeps test seam via `process.env.HOME` override.
- Add `os` require; port `readOrCreateConfig()` from `scripts/kaola-workflow-classifier.js:60-69`.
- In `cmdClassify()`: call `readOrCreateConfig()` first; if `config.parallel_mode !== 'auto'`, output bypass green and return.

**Gap 2 (OFFLINE fallback)**:
- `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'` near top.
- `checkDependsOn()`: explicit OFFLINE branch → `{verdict: 'blocked', reasoning: 'OFFLINE and depends-on:#N label present; conservative block'}`.
- `cmdClassify()`: OFFLINE branch reads `.roadmap/issue-N.md` via `active.getRoot()`, parses `next_step` for `blocked by #N` → synthesize `depends-on` label, call `parseAreaLabelsFromText()`, call `classify()`, return.
- Place OFFLINE branch in `cmdClassify`, not `classifyIssue`, to keep `classifyIssue` export focused on online path.

**Gap 3 (remote claim detection)**:
- `issueHasWorkflowInProgressLabel(labels)`: `return (labels || []).includes(forge.CLAIM_LABEL)` — string array semantics (not GitHub's `{name}` objects).
- `issueHasRemoteClaimNotes(issueIid)`: if OFFLINE return false; lazy `forge.discoverProject()` in try/catch; call `forge.listIssueNotes(project, issueIid)`; match body against `/<!--\s*kw:claim\s+(project|sess)=/`; return true if matched AND `updated_at` within 24h (or absent).
- Remote claim guard in `classifyIssue()` after closed-state check, before `return classify()`.

### Tests for Task A
- parallel_mode bypass: write config with `parallel_mode: 'manual'`, spawn classifier, assert bypass green.
- OFFLINE no-block: roadmap file with benign body, assert green.
- OFFLINE depends-on: roadmap with `next_step: blocked by #99`, assert blocked.
- Remote claim via label: `withForge({viewIssue → labels: [forge.CLAIM_LABEL]})`, assert blocked.
- Remote claim via note: `withForge({listIssueNotes → [{body: '<!-- kw:claim sess=abc -->', updated_at: <now>}]})`, assert blocked.
- Stale note (>24h): same but old `updated_at`, assert NOT blocked.

## Task B — Repair-State Gaps (4, 5)

### Key Implementation Decisions

**Gap 4 (stateLooksValid + three-way branch)**:
- Add `stateLooksValid(root, project, content)` mirroring `scripts/kaola-workflow-repair-state.js:380-396`.
- Rewrite `repair()`: if state file exists AND `stateLooksValid()`:
  - Call `reconstruct()`. If `result.complete`: return no-op.
  - If `result.nextCommand !== field(existing, 'next_command')`: stale → write + return `{repaired: true, stale: true}`.
  - Else: valid-and-current → return `{repaired: false, valid: true}` WITHOUT writing.
- State file absent OR invalid: fall through to existing reconstruct-and-write path.

**Gap 5 (ownership block)**:
- In `stateContent()`: insert `## Ownership Rules` block after `## Pending Gates`, before `## Last Evidence`.
- `main_session_role: orchestrator`, `implementation_owner: tdd-guide` (phase 4) or `N/A`, `fix_owner: tdd-guide or build-error-resolver` (phase 4/5/6) or `N/A`, `inline_emergency_fallback_authorized: no`.
- Change `last_result: 'reconstructed'` → `'state_repaired_from_artifacts'`.
- Preserve `['GitLab', 'Sink']` blocks (GitLab-specific; do NOT collapse to just `['Sink']`).

### Tests for Task B
- stateLooksValid → no-write: valid state file; assert `result.valid === true` and mtime unchanged.
- Stale rewrite: state for phase=2 with phase3-plan.md present; assert `result.stale === true` and new state has phase=4.
- Ownership block presence (phase 4): assert state file contains all ownership fields with tdd-guide values.
- Ownership block N/A (phase 2): assert `implementation_owner: N/A`, `fix_owner: N/A`.
- last_result: assert `state_repaired_from_artifacts`.
- Section preservation regression: existing test at lines 405-415 must continue to pass.

## Risks & Mitigations

- CONFIG_PATH at module load makes Gap 1 untestable → compute inside `readOrCreateConfig()` (deviates from GitHub intentionally).
- `forge.discoverProject()` throws in CI → try/catch returning false; OFFLINE short-circuit first.
- Three-way branch breaks existing repair test → verify "state file absent" path still falls through to write.
- Notes API pagination → out of scope; mirrors GitHub one-page behavior.

## Items Explicitly NOT to Build

- No modifications to `kaola-gitlab-forge.js` or `kaola-gitlab-workflow-active-folders.js`.
- No new test framework.
- No threading `project` through `classify()` / `classifyIssue()` signatures.
- No change to `last_command` field text.
- No notes-API pagination.
