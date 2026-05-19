# Phase 3 - Plan: issue-90

## Blueprint

### Files to Create
None.

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `.kw/issue-90/plugins/kaola-workflow-gitlab/agents/code-architect.toml` | Line 12: `enouglab` → `enough` | AC #1: fix typo |
| `.kw/issue-90/plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | Add `/\b[a-z]+glab\b/i` after `/pull request/i` in `forbidden` array | AC #2: catch `*glab` corruption artifacts |
| `.kw/issue-90/plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | Line 345: `require('../scripts/kaola-gitlab-workflow-sink-merge')` → `require('./kaola-gitlab-workflow-sink-merge')` | Bundle: #98 fix unblocks test runner |

### Build Sequence
1. Preflight grep — confirm only one `*glab` hit in plugin tree
2. Task 1: Fix `code-architect.toml` typo (write set: code-architect.toml)
3. Task 2: Append regex to validator forbidden array (write set: validate-kaola-workflow-gitlab-contracts.js)
4. Task 3: Fix fallback require in test-gitlab-sinks.js (write set: test-gitlab-sinks.js) [#98 bundle]
5. Validate: `npm run test:kaola-workflow:gitlab` from `.kw/issue-90/`
6. Validate: `node scripts/simulate-workflow-walkthrough.js` from `.kw/issue-90/`

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | 1, 2, 3 | Disjoint files: code-architect.toml, validate-…js, test-gitlab-sinks.js |
| B | validate gitlab, validate walkthrough | Both read-only after edits complete |

### External Dependencies
None.

## Task List

### Task 1: Fix `enouglab` typo in code-architect.toml
- File: `plugins/kaola-workflow-gitlab/agents/code-architect.toml`
- Write Set: `agents/code-architect.toml`
- Depends On: none (after preflight)
- Parallel Group: A
- Action: MODIFY
- Implement: Change `small enouglab for` to `small enough for` on line 12
- Mirror: N/A (typo fix)
- Validate: Task B

### Task 2: Add `*glab` corruption regex to validator
- File: `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- Write Set: `validate-kaola-workflow-gitlab-contracts.js`
- Depends On: none (after preflight)
- Parallel Group: A
- Action: MODIFY
- Implement: After `/pull request/i` add comma, then new line `    /\b[a-z]+glab\b/i` before closing `];`
- Mirror: existing `forbidden` array pattern (lines 43-58)
- Validate: Task B

### Task 3: Fix fallback require in test-gitlab-sinks.js (#98 bundle)
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Write Set: `test-gitlab-sinks.js`
- Depends On: none (after preflight)
- Parallel Group: A
- Action: MODIFY
- Implement: Change `require('../scripts/kaola-gitlab-workflow-sink-merge')` to `require('./kaola-gitlab-workflow-sink-merge')` on line 345
- Mirror: plugin-local require pattern already used elsewhere in the plugin
- Validate: Task B

## Advisor Notes
Baseline `npm run test:kaola-workflow:gitlab` run confirmed issue #98 is live (test fails before #90 fix can be validated). Bundling #98 fix into this branch per advisor recommendation. The fix is trivial (one `require` path), the plugin-local file exists, no validator rule changes needed. Remaining issues #99, #100, #101 are independent and will use fast-path workflow.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | Plan was complete; #98 bundle identified by advisor gate |
