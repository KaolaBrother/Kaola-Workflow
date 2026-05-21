# Code Architect: issue-150 — GitLab and Gitea listOpenIssues Priority Sort

## Design Decisions

- **Direct port, no shared module.** Each forge gets its own copy of the two helpers.
- **Omit `labelName()` and `.map(labelName)`.** Both forges' `normalizeIssue()` already coerce labels to `string[]`. Labels in `issue.labels` are already strings when `listOpenIssues` sees them.
- **Preserve per-forge `forge.listIssues` state value.** GitLab: `state: 'opened'`; Gitea: `state: 'open'`. Must not be changed.
- **Preserve per-forge tiebreaker.** Both keep `Number(a.issue_iid || a.number) - Number(b.issue_iid || b.number)` — NOT GitHub's `Number(a.number)`.
- **Omit the `OFFLINE` guard.** Neither GitLab nor Gitea defines an `OFFLINE` constant.
- **Update existing no-arg `listOpenIssues()` test calls.** With `root` undefined, `path.join(undefined, ...)` throws a `TypeError` that escapes `readPriorityConfig`'s inner `try` and is caught by `listOpenIssues`'s outer `try`, returning `[]`. The existing assertion expects `[7, 9]` and would fail. Both existing test calls must pass a `tempRoot(...)` argument.
- **Export only `readPriorityConfig`.** `priorityTier` stays private, matching GitHub.

## Files to Create

None. All changes are modifications.

## Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Add `readPriorityConfig(root)` + `priorityTier` helpers above `listOpenIssues`; change `listOpenIssues()` → `listOpenIssues(root)` with priority sort; add `readPriorityConfig` to exports | Implements priority sort for GitLab |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Fix existing no-arg call at ~334; add `readPriorityConfig` 3-case unit test; add discriminating priority-sort test | Existing call breaks under new signature; new tests prove correctness |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same as GitLab claim, but keep `state: 'open'` in forge call | Implements priority sort for Gitea |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Same as GitLab test file | Existing call breaks; new tests prove correctness |

## Build Sequence

1. GL-1: GitLab claim script (no deps)
2. GL-2: GitLab test file (depends on GL-1)
3. GT-1: Gitea claim script (no deps, parallel with GL-1)
4. GT-2: Gitea test file (depends on GT-1)

## Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | GL-1 → GL-2 | GitLab files only |
| B | GT-1 → GT-2 | Gitea files only |

Groups A and B are fully parallel (disjoint write sets).

## Task List

### Task GL-1: GitLab Claim Script
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Test File: (validated via GL-2)
- Write Set: `kaola-gitlab-workflow-claim.js` only
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement:
  1. Grep for `function listOpenIssues` to find current line. Insert two helpers immediately above:
     ```js
     function readPriorityConfig(root) {
       const file = path.join(root, 'kaola-workflow', 'config.json');
       try {
         const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
         return Array.isArray(parsed.priority_top_tier_labels) ? parsed.priority_top_tier_labels : ['P0', 'P1'];
       } catch (_) { return ['P0', 'P1']; }
     }

     function priorityTier(issue, topTierLabels) {
       const labels = issue.labels || [];   // NO .map(labelName) — labels already strings
       for (const label of labels) {
         if (/^P\d+$/i.test(label)) return { tier: parseInt(label.slice(1), 10), priority_label: label };
       }
       if (labels.some(label => topTierLabels.includes(label))) return { tier: 1, priority_label: labels.find(label => topTierLabels.includes(label)) };
       return { tier: 99, priority_label: '' };
     }
     ```
  2. Change `function listOpenIssues()` → `function listOpenIssues(root)`. New body:
     ```js
     function listOpenIssues(root) {
       try {
         const topTierLabels = readPriorityConfig(root);
         return forge.listIssues({ state: 'opened', perPage: 100 })   // 'opened' — GitLab-specific
           .filter(issue => issue.state === 'open')
           .sort((a, b) => {
             const at = priorityTier(a, topTierLabels).tier;
             const bt = priorityTier(b, topTierLabels).tier;
             return at - bt || Number(a.issue_iid || a.number) - Number(b.issue_iid || b.number);
           });
       } catch (_) { return []; }
     }
     ```
  3. Grep for `module.exports` block. Add `readPriorityConfig,` to it. Do NOT add `priorityTier`.
- Mirror: `scripts/kaola-workflow-claim.js` lines 65–73 (readPriorityConfig), 79–86 (priorityTier minus .map), 88–102 (listOpenIssues shape), 727 (export pattern)
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

### Task GL-2: GitLab Test File
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Test File: self
- Write Set: `test-gitlab-workflow-scripts.js` only
- Depends On: GL-1
- Parallel Group: A
- Action: MODIFY
- Implement:
  1. Fix existing call: grep for `listOpenIssues()` in the file (around line 334). Change `claim.listOpenIssues()` → `claim.listOpenIssues(tempRoot('kw-gl-list-'))`.
  2. Add `readPriorityConfig` unit test (3 cases):
     - (a) Missing config → `deepStrictEqual(['P0','P1'])`
     - (b) Valid `priority_top_tier_labels: ['critical','hotfix']` → `deepStrictEqual(['critical','hotfix'])`
     - (c) Non-array value → `deepStrictEqual(['P0','P1'])`
     Use `fs.mkdtempSync(path.join(os.tmpdir(), ...))` for temp root; `fs.rmSync(..., {recursive:true,force:true})` in finally. Require `readPriorityConfig` from `./kaola-gitlab-workflow-claim`.
  3. Add discriminating priority-sort test:
     - Create temp root, write `kaola-workflow/config.json` with `{ priority_top_tier_labels: ['critical'] }`
     - `withForge({ listIssues() { return [ { issue_iid: 5, number: 5, state: 'open', labels: ['critical'] }, { issue_iid: 3, number: 3, state: 'open', labels: ['P0'] }, { issue_iid: 9, number: 9, state: 'open', labels: [] }, { issue_iid: 1, number: 1, state: 'open', labels: ['P2'] } ]; } }, () => { ... })`
     - Call `claim.listOpenIssues(root)`
     - Assert `deepStrictEqual([3, 5, 1, 9])` (P0→tier0, critical→tier1, P2→tier2, unlabeled→tier99)
     - **Labels MUST be plain strings** — withForge bypasses normalizeIssue
- Mirror: `readPriorityConfig` test → `scripts/simulate-workflow-walkthrough.js:1195–1220`; withForge → lines 21–32; tempRoot → line 34
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

### Task GT-1: Gitea Claim Script
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Test File: (validated via GT-2)
- Write Set: `kaola-gitea-workflow-claim.js` only
- Depends On: none
- Parallel Group: B
- Action: MODIFY
- Implement: Identical to GL-1 with one forge-specific difference:
  1. Verify `fs`/`path` imports exist in this script before editing (grep `require('fs')` and `require('path')`).
  2. Insert same two helpers above `listOpenIssues` (current line ~268).
  3. Change `listOpenIssues()` → `listOpenIssues(root)`. Keep `state: 'open'` (Gitea — **differs from GitLab's 'opened'**). Same sort logic. Same try/catch. Omit OFFLINE guard.
  4. Add `readPriorityConfig,` to exports (block at ~702). Do NOT export `priorityTier`.
- Mirror: Same as GL-1
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

### Task GT-2: Gitea Test File
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Test File: self
- Write Set: `test-gitea-workflow-scripts.js` only
- Depends On: GT-1
- Parallel Group: B
- Action: MODIFY
- Implement:
  1. Fix existing call (line ~341): `claim.listOpenIssues()` → `claim.listOpenIssues(tempRoot('kw-gt-list-'))`.
  2. Add `readPriorityConfig` 3-case unit test requiring from `./kaola-gitea-workflow-claim`.
  3. Add discriminating priority-sort test (same structure as GL-2 — same 4-issue stub, assert `[3, 5, 1, 9]`, labels as plain strings).
- Mirror: Same as GL-2 using Gitea equivalents
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

## External Dependencies

None beyond `path` and `fs` (already imported). `os` may be needed for `os.tmpdir()` in tests — check if already imported in test files; add if not.

## Advisor Load-Bearing Refinements (from Phase 2)

1. Grep for `function listOpenIssues` and `module.exports` before editing — do not rely on stale line numbers.
2. GitLab uses `state: 'opened'`, Gitea uses `state: 'open'` — preserve each forge's value.
3. Test stubs: labels MUST be plain strings `['P0']`, NOT objects `[{name:'P0'}]`.
4. `priorityTier` MUST NOT include `.map(labelName)` — omit entirely.
5. Export only `readPriorityConfig`, not `priorityTier`.
6. Discriminating test MUST have P-number label + custom top-tier label + plain strings + non-trivial ordering assertion.
7. Existing no-arg test calls (GitLab ~334, Gitea ~341) MUST receive a `root` argument.
8. Omit `OFFLINE` guard — neither forge defines it.
9. Tiebreaker: use `Number(a.issue_iid || a.number)`, not GitHub's `Number(a.number)`.
