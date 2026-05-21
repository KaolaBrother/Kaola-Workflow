# Phase 3 - Plan: issue-150

## Blueprint

### Files to Create
None. All changes are modifications.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Add `readPriorityConfig(root)` + `priorityTier` helpers; update `listOpenIssues` signature + sort; export `readPriorityConfig` | Implements priority sort for GitLab |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Fix existing no-arg call; add `readPriorityConfig` 3-case test; add discriminating priority-sort test | Existing call breaks under new signature; proves correctness |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same as GitLab claim, preserving `state: 'open'` (Gitea-specific) | Implements priority sort for Gitea |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Same as GitLab test | Existing call breaks; proves correctness |

### Build Sequence
1. GL-1: GitLab claim script (no deps)
2. GL-2: GitLab test file (depends on GL-1)
3. GT-1: Gitea claim script (no deps, parallel with GL-1/GL-2)
4. GT-2: Gitea test file (depends on GT-1)

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | GL-1, GL-2 | GitLab files only; disjoint write sets from Group B |
| B | GT-1, GT-2 | Gitea files only; disjoint write sets from Group A |

Groups A and B can run fully in parallel. Within each group, run GL-2 after GL-1 and GT-2 after GT-1.

### External Dependencies
None beyond `path` and `fs` (already imported in all files; verify `fs`/`path` in Gitea claim script — see GT-1).

## Task List

### Task GL-1: GitLab Claim Script — Add Helpers and Priority Sort
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Test File: (validated via GL-2)
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Pre-edit greps (run before touching the file):
  ```bash
  grep -n "^function listOpenIssues" plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
  grep -n "module.exports" plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
  ```
- Implement:
  1. Read the file. Find `function listOpenIssues`. Insert these two helpers immediately above it:
     ```js
     function readPriorityConfig(root) {
       const file = path.join(root, 'kaola-workflow', 'config.json');
       try {
         const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
         return Array.isArray(parsed.priority_top_tier_labels) ? parsed.priority_top_tier_labels : ['P0', 'P1'];
       } catch (_) { return ['P0', 'P1']; }
     }

     function priorityTier(issue, topTierLabels) {
       const labels = issue.labels || [];
       for (const label of labels) {
         if (/^P\d+$/i.test(label)) return { tier: parseInt(label.slice(1), 10), priority_label: label };
       }
       if (labels.some(label => topTierLabels.includes(label))) return { tier: 1, priority_label: labels.find(label => topTierLabels.includes(label)) };
       return { tier: 99, priority_label: '' };
     }
     ```
     NOTE: No `.map(labelName)` — labels are already strings in GitLab/Gitea. Do NOT add `labelName`.
  2. Replace `function listOpenIssues()` with:
     ```js
     function listOpenIssues(root) {
       try {
         const topTierLabels = readPriorityConfig(root);
         return forge.listIssues({ state: 'opened', perPage: 100 })
           .filter(issue => issue.state === 'open')
           .sort((a, b) => {
             const at = priorityTier(a, topTierLabels).tier;
             const bt = priorityTier(b, topTierLabels).tier;
             return at - bt || Number(a.issue_iid || a.number) - Number(b.issue_iid || b.number);
           });
       } catch (_) { return []; }
     }
     ```
     CRITICAL: Keep `state: 'opened'` (GitLab uses 'opened', NOT 'open'). Do NOT add `if (OFFLINE) return [];`.
  3. Find `module.exports` block. Add `readPriorityConfig,` to it. Do NOT add `priorityTier`.
- Mirror: `scripts/kaola-workflow-claim.js` lines 65–73 (`readPriorityConfig`), 79–86 (`priorityTier` minus `.map`), 88–102 (`listOpenIssues` shape), line 727 (export)
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

### Task GL-2: GitLab Test File — Fix Call + Add Tests
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Test File: self
- Write Set: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Depends On: GL-1
- Parallel Group: A
- Action: MODIFY
- Pre-edit greps:
  ```bash
  grep -n "claim.listOpenIssues(" plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
  grep -n "tempRoot\|mkdtempSync" plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
  ```
- Implement:
  1. **Fix existing call**: Find `claim.listOpenIssues()` (around line 334). Change to `claim.listOpenIssues(tempRoot('kw-gl-list-'))`. The `tempRoot` helper already exists in this file (line 34). Do NOT use `mkdtempSync` directly — use `tempRoot`.
  2. **Add `readPriorityConfig` unit test** (3 cases). At test time require `{ readPriorityConfig }` from `./kaola-gitlab-workflow-claim`:
     - Case (a): root with no `kaola-workflow/config.json` → `deepStrictEqual(readPriorityConfig(root), ['P0', 'P1'])`
     - Case (b): `fs.mkdirSync(path.join(root, 'kaola-workflow'), { recursive: true })` then `fs.writeFileSync(path.join(root, 'kaola-workflow', 'config.json'), JSON.stringify({ priority_top_tier_labels: ['critical', 'hotfix'] }))` → `deepStrictEqual(readPriorityConfig(root), ['critical', 'hotfix'])`
     - Case (c): write `{ priority_top_tier_labels: 'not-an-array' }` → `deepStrictEqual(readPriorityConfig(root), ['P0', 'P1'])`
     Use `tempRoot('kw-gl-rpc-')` for each case. Cleanup via `fs.rmSync(root, { recursive: true, force: true })` in finally.
  3. **Add discriminating priority-sort test**:
     - `const root = tempRoot('kw-gl-sort-')`
     - `fs.mkdirSync(path.join(root, 'kaola-workflow'), { recursive: true })`
     - `fs.writeFileSync(path.join(root, 'kaola-workflow', 'config.json'), JSON.stringify({ priority_top_tier_labels: ['critical'] }))`
     - `withForge({ listIssues() { return [ { issue_iid: 5, number: 5, state: 'open', labels: ['critical'] }, { issue_iid: 3, number: 3, state: 'open', labels: ['P0'] }, { issue_iid: 9, number: 9, state: 'open', labels: [] }, { issue_iid: 1, number: 1, state: 'open', labels: ['P2'] } ]; } }, () => { const result = claim.listOpenIssues(root); assert.deepStrictEqual(result.map(i => i.issue_iid || i.number), [3, 5, 1, 9]); })`
     - **Labels MUST be plain strings** — `withForge` bypasses `normalizeIssue`.
     - Order derivation: P0→tier 0, 'critical' (top-tier)→tier 1, P2→tier 2, unlabeled→tier 99; tiebreak by number. Result `[3,5,1,9]` differs from natural number order `[1,3,5,9]` — the ONLY test that discriminates correct priority sort.
     - Cleanup: `fs.rmSync(root, { recursive: true, force: true })`
- Mirror: `readPriorityConfig` tests → `scripts/simulate-workflow-walkthrough.js:1195–1220`; `withForge` → lines 21–32 of this file; `tempRoot` → line 34
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

### Task GT-1: Gitea Claim Script — Add Helpers and Priority Sort
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Test File: (validated via GT-2)
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Depends On: none
- Parallel Group: B
- Action: MODIFY
- Pre-edit greps:
  ```bash
  grep -nE "require\('(fs|path)'\)" plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
  grep -n "^function listOpenIssues" plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
  grep -n "module.exports" plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
  ```
  If `fs` or `path` is missing from imports, add it as part of this write set before adding the helpers.
- Implement: Identical to GL-1 with one critical difference:
  1. Insert same two helpers (`readPriorityConfig` + `priorityTier` without `.map`) above `listOpenIssues`.
  2. Replace `function listOpenIssues()` with `function listOpenIssues(root)`:
     - Keep `state: 'open'` (Gitea uses 'open', **NOT 'opened'** — differs from GitLab).
     - Keep `.filter(issue => issue.state === 'open')`.
     - Add `const topTierLabels = readPriorityConfig(root);`.
     - Sort: `at - bt || Number(a.issue_iid || a.number) - Number(b.issue_iid || b.number)`.
     - Keep `try { ... } catch (_) { return []; }`.
     - Omit `OFFLINE` guard.
  3. Add `readPriorityConfig,` to `module.exports`. Do NOT add `priorityTier`.
- Mirror: Same as GL-1
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

### Task GT-2: Gitea Test File — Fix Call + Add Tests
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Test File: self
- Write Set: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Depends On: GT-1
- Parallel Group: B
- Action: MODIFY
- Pre-edit greps:
  ```bash
  grep -n "claim.listOpenIssues(" plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
  grep -n "tempRoot\|mkdtempSync" plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
  ```
- Implement: Identical to GL-2 with Gitea-specific names:
  1. Fix existing call (~line 341): `claim.listOpenIssues()` → `claim.listOpenIssues(tempRoot('kw-gt-list-'))`. Use `tempRoot` (line 41 in this file).
  2. Add `readPriorityConfig` 3-case unit test requiring from `./kaola-gitea-workflow-claim`. Same structure as GL-2 (including `mkdirSync` before `writeFileSync`). Use `tempRoot('kw-gt-rpc-')`.
  3. Add discriminating priority-sort test. Same 4-issue stub as GL-2. `fs.mkdirSync(path.join(root, 'kaola-workflow'), { recursive: true })` before writing config. Assert `[3, 5, 1, 9]`. Labels as plain strings.
- Mirror: Same as GL-2 using Gitea equivalents; `withForge` line 27; `tempRoot` line 41
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

## Advisor Notes

Advisor approved with:
- **Blocker fixed**: `fs.mkdirSync(path.join(root, 'kaola-workflow'), { recursive: true })` required before every `writeFileSync` of `config.json` in GL-2 and GT-2. Without it, `writeFileSync` fails with ENOENT.
- **Refinement 1**: Use `tempRoot` helper consistently (already used in all task implementations above).
- **Refinement 2**: Verify `fs`/`path` imports in Gitea claim script via grep before editing (incorporated into GT-1 pre-edit greps).
- **Refinement 3**: Order-discrimination math documented in GL-2/GT-2 task bodies.
- No architect revision needed — all refinements are tactical and absorbed here.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | Refinements are tactical; absorbed in phase3-plan.md without re-running code-architect |
