# Phase 3 - Plan: issue-155

## Blueprint

### Files to Create
None. `probeIssueState` helper lives inside existing `*-active-folders.js` modules.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-classifier.js` | `cmdClassify` catch (`:356-359`): `green` → `target_unavailable` | Primary GitHub classifier fail-open |
| `scripts/kaola-workflow-claim.js` | 3 wrapper leaks → `target_unavailable`; `claimExplicitTarget` sibling branch; `claimProject` probe | Covers classifier path + `cmdClaim` bypass |
| `scripts/kaola-workflow-active-folders.js` | Add/export `probeIssueState` (ghExec variant) | Required by `claimProject` guard |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | Byte-identical copy of GitHub canonical | Byte-sync enforced by `validate-script-sync.js` |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical copy | Same |
| `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` | Byte-identical copy | Same |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | `cmdClassify` catch (`:297-300`) + in-process `classifyIssue` catch (`:255-257`) → `target_unavailable` | GitLab uses direct in-process call, not subprocess |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Wrapper catch + `claimExplicitTarget` sibling + `claimProject` probe | GitLab claim path |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js` | Add/export `probeIssueState` (forge.viewIssue variant) | Blocks GitLab claim.js |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` | `cmdClassify` catch (`:302-303`) + in-process catch (`:260-261`) → `target_unavailable` | Gitea uses direct in-process call |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same as GitLab | Gitea claim path |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js` | Add/export `probeIssueState` (forge.viewIssue variant) | Blocks Gitea claim.js |
| `commands/workflow-next.md` | Line `:334` add `target_unavailable` to "Parallel decision" brace | Doc accuracy |
| `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | Line `:335` same | GitLab doc |
| `plugins/kaola-workflow-gitea/commands/workflow-next.md` | Line `:335` same | Gitea doc |
| `scripts/simulate-workflow-walkthrough.js` | 3 new GitHub test cases | Regression coverage |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | 3 new `withFakeForge` test cases | GitLab coverage |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | 3 new test cases | Gitea coverage |
| `CHANGELOG.md` | `[Unreleased]` entry | Doc checklist |

### Build Sequence
1. **G-helpers** — T1 (GitHub `probeIssueState`), T2 (GitLab), T3 (Gitea) — parallel, disjoint files
2. **G-core** — T4 (GitHub classifier+claim+vendored), T5 (GitLab), T6 (Gitea) — T4-T6 parallel; each depends on respective helper
3. **G-docs** (T7) + **G-tests** (T8/T9/T10) + **T11 CHANGELOG** — parallel after core
4. **T12 Verify** — after all

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| G-helpers | T1, T2, T3 | Disjoint forge trees |
| G-core | T4, T5, T6 | Disjoint forge trees |
| G-docs/tests | T7, T8, T9, T10, T11 | Disjoint files; gated on respective core |

### External Dependencies
None. Pure Node.js changes using existing patterns.

## `probeIssueState` Helper Contract

Returns `{ state: 'closed'|'open'|'unavailable', reason: string }`.

GitHub (ghExec model):
- `OFFLINE || null` → `{ state: 'open', reason: 'offline-or-null' }`
- `ghExec` returns empty → `{ state: 'unavailable', reason: 'empty gh response' }`
- `ghExec` throws → `{ state: 'unavailable', reason: 'gh issue fetch failed' }`
- success → `{ state: 'closed'|'open', reason: 'ok' }`

GitLab/Gitea (forge.viewIssue model): same shape; `forge.viewIssue` throws → unavailable.

`claimProject` consumption (replaces `issueIsClosed` block):
```js
const probe = probeIssueState(issueNumber);
if (probe.state === 'closed') return { status: 'user_target_closed', ... };
if (!OFFLINE && probe.state === 'unavailable')
  return { status: 'target_unavailable', claim: 'none', issue: issueNumber, project, reasoning: `<forge> issue #${issueNumber} state probe failed; refusing outside KAOLA_WORKFLOW_OFFLINE=1` };
```

## Task List

### Task 1: GitHub probeIssueState helper
- File: `scripts/kaola-workflow-active-folders.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-active-folders.js`, `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js`
- Depends On: none
- Parallel Group: G-helpers
- Action: MODIFY
- Implement: Add `probeIssueState(issueNumber)` function (ghExec variant per contract above). Export it alongside `issueIsClosed`. Do NOT touch `issueIsClosed`.
- Mirror: `issueIsClosed` pattern at `active-folders.js:38-47`
- Validate: `node scripts/validate-script-sync.js` after copying to vendored

### Task 2: GitLab probeIssueState helper
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js`
- Write Set: same file
- Depends On: none
- Parallel Group: G-helpers
- Action: MODIFY
- Implement: Add `probeIssueState(issueIid)` (forge.viewIssue variant). Export alongside `issueIsClosed`.
- Mirror: `issueIsClosed` at GitLab `active-folders.js:40-47`
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

### Task 3: Gitea probeIssueState helper
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js`
- Write Set: same file
- Depends On: none
- Parallel Group: G-helpers
- Action: MODIFY
- Implement: Same as T2, Gitea forge
- Mirror: Gitea `issueIsClosed` pattern
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

### Task 4: GitHub classifier + claim core
- Files: `scripts/kaola-workflow-classifier.js`, `scripts/kaola-workflow-claim.js` + vendored copies
- Write Set: F1, F2, F4, F5
- Depends On: T1
- Parallel Group: serial (canonical then cp)
- Action: MODIFY
- Implement:
  1. `classifier.js:356-359`: `{ verdict: 'green' }` → `{ verdict: 'target_unavailable', reasoning: 'gh issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' }`
  2. `claim.js` wrapper 3 leaks (`:299`, `:307`, `:310`): each → `{ verdict: 'target_unavailable' }` with distinct reasoning
  3. `claim.js` `claimExplicitTarget`: add sibling branch BEFORE `claimProject` call — `if (classified.verdict === 'target_unavailable') return { status: 'target_unavailable', claim: 'none', issue: targetIssue, project: ..., reasoning: classified.reasoning }`
  4. `claim.js` destructure at `:7-13`: import `probeIssueState` from active-folders
  5. `claim.js` `claimProject:326`: replace `issueIsClosed` block with `probeIssueState` per contract
  6. `cp` to vendored after each file; run `validate-script-sync.js`
- Mirror: `user_target_blocked` branch at `claim.js:366`
- Validate: `node scripts/simulate-workflow-walkthrough.js` && `node scripts/validate-script-sync.js`

### Task 5: GitLab classifier + claim core
- Files: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`, `kaola-gitlab-workflow-claim.js`
- Write Set: F7, F8
- Depends On: T2
- Parallel Group: G-core
- Action: MODIFY
- Implement:
  1. `classifier.js:297-300` (`cmdClassify` catch): `green` → `target_unavailable`, GitLab reasoning
  2. `classifier.js:255-257` (in-process `classifyIssue` catch): same
  3. `claim.js:252-254` wrapper catch: same
  4. `claim.js` `claimExplicitTarget` sibling (after red branch, before `claimProject` call)
  5. Import `probeIssueState` in destructure
  6. `claimProject:299`: replace `issueIsClosed` with `probeIssueState`
- Mirror: T4 changes, GitLab naming
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

### Task 6: Gitea classifier + claim core
- Files: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js`, `kaola-gitea-workflow-claim.js`
- Write Set: F10, F11
- Depends On: T3
- Parallel Group: G-core
- Action: MODIFY
- Implement: Same as T5, Gitea forge. Classifier catches at `:302-303` and `:260-261`; claim wrapper at `:255-256`; `claimProject:302`
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

### Task 7: Docs — add target_unavailable to Parallel decision
- Files: `commands/workflow-next.md`, `plugins/kaola-workflow-gitlab/commands/workflow-next.md`, `plugins/kaola-workflow-gitea/commands/workflow-next.md`
- Write Set: F13, F14, F15
- Depends On: none
- Parallel Group: G-docs
- Action: MODIFY
- Implement: At "Parallel decision: {green|yellow|red|blocked|skipped" line (`:334`/`:335`), add `target_unavailable` inside the brace enumeration. Do NOT touch the `:152` typed-refusal enumeration line.
- Validate: grep check that line contains `target_unavailable`

### Task 8: GitHub regression tests
- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: F16
- Depends On: T4
- Parallel Group: G-tests
- Action: MODIFY
- Implement: 3 new test cases (grep for existing gh-shim helper first — `ghShim`/`writeGhShim`/`writeFileSync.*gh`):
  1. `testClassifierFailClosedOnGhError` — failing gh shim (`exit(1)` on `issue view`) → `startup --target-issue N` returns `verdict: 'target_unavailable'`, `claim: 'none'`, exit code 1, no active folder created
  2. `testClassifierFailClosedNoGhCli` — gh absent from PATH → same refusal
  3. `testClassifierOfflineBypassesFailClosed` — same failing shim + `KAOLA_WORKFLOW_OFFLINE=1` → green/expected (OFFLINE regression)
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task 9: GitLab regression tests
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Write Set: F17
- Depends On: T5
- Parallel Group: G-tests
- Action: MODIFY
- Implement: Grep actual forge mock helper name before writing. 3 cases:
  1. `testGitLabClassifierFailClosed` — `withFakeForge({ viewIssue() { throw new Error('boom'); } })` → classifier returns `{ verdict: 'target_unavailable' }`
  2. `testGitLabStartupFailClosed` — startup with failing forge → `{ status: 'target_unavailable' }`, exit 1
  3. `testGitLabOfflineBypassesFailClosed` — OFFLINE=1 + failing forge → green/expected
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

### Task 10: Gitea regression tests
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Write Set: F18
- Depends On: T6
- Parallel Group: G-tests
- Action: MODIFY
- Implement: Same 3 cases as T9, Gitea harness. Grep actual helper name.
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

### Task 11: CHANGELOG
- File: `CHANGELOG.md`
- Write Set: F19
- Depends On: none
- Parallel Group: G-docs
- Action: MODIFY
- Implement: Add entry under `[Unreleased]` — "fix: fail-closed when remote issue validation is unavailable outside KAOLA_WORKFLOW_OFFLINE=1 (#155)"
- Validate: read and confirm

### Task 12: Verify all
- Write Set: none
- Depends On: all
- Action: RUN
- Commands:
  ```bash
  node scripts/simulate-workflow-walkthrough.js
  node scripts/validate-script-sync.js
  node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
  node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
  npm test
  ```
- All must exit 0

## Advisor Notes

Blueprint confirmed sound. Key Phase 4 constraints:
1. `target_unavailable` sibling must go BEFORE `claimProject` call in `claimExplicitTarget`
2. Import `probeIssueState` in each `claim.js` destructure (missed import = ReferenceError at runtime)
3. Run `validate-script-sync.js` after every GitHub edit (not just at end)
4. Interpolate `issueNumber` in probe reasoning string (not placeholder `#N`)
5. Grep `withFakeForge`/`withForge` helper name in each test file before writing

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor found no blueprint gaps requiring revision |
