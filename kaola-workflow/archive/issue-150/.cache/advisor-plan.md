# Advisor: issue-150 Plan Gate

## Verdict
Approve. One concrete test-setup blocker, three small refinements. Architect's plan is implementable end-to-end. Build sequence is dependency-safe (GitLab and Gitea fully independent). Scope is right-sized — no missing files, no missing integration points.

## Blocker — Test setup missing `mkdirSync` for the config directory

Both new tests write to `<root>/kaola-workflow/config.json`:
- `readPriorityConfig` case (b) — valid array
- Discriminating priority-sort test — temp config with `priority_top_tier_labels: ['critical']`

Architect's plan creates `<root>` via `tempRoot` but does NOT create the `<root>/kaola-workflow/` subdirectory. `fs.writeFileSync('<root>/kaola-workflow/config.json', ...)` will fail with `ENOENT`.

Phase 4 task instructions for GL-2 and GT-2 must specify, before each `writeFileSync` of `config.json`:
```js
fs.mkdirSync(path.join(root, 'kaola-workflow'), { recursive: true });
```

Verify by reading `scripts/simulate-workflow-walkthrough.js:1195-1220` at edit time — same pattern used in the reference tests.

## Refinement 1 — Use `tempRoot` helper consistently
Both test files have a `tempRoot` helper (GitLab:34, Gitea:41). Use `tempRoot` for all three sites in each test file (existing-call fix + readPriorityConfig tests + discriminating test). This avoids needing a manual `os` import.

## Refinement 2 — Verify fs/path imports in Gitea claim script
At edit time for GT-1:
```bash
grep -nE "require\('(fs|path)'\)" plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
```
If either is missing, add it as part of GT-1's write set.

## Refinement 3 — Order-discrimination math
Discriminating test `[3, 5, 1, 9]` order derivation (verify stub is correct):
- issue 3 (labels=['P0']) → tier 0  (P-number regex: 0)
- issue 5 (labels=['critical'], topTier=['critical']) → tier 1  (custom top-tier)
- issue 1 (labels=['P2']) → tier 2  (P-number regex: 2)
- issue 9 (labels=[]) → tier 99  (no label)

Differs from natural number order `[1, 3, 5, 9]` — a no-op implementation cannot pass this test.

## Pre-Phase-4 Confirmation Greps
Before editing, run:
```bash
grep -n "^function listOpenIssues" plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
grep -n "^function listOpenIssues" plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
grep -n "claim.listOpenIssues(" plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
grep -n "claim.listOpenIssues(" plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
grep -n "module.exports" plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
grep -n "module.exports" plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
```

## Edge Cases Covered
- `issue.labels === undefined` → `|| []` → tier 99 ✓
- Mixed P-label + top-tier label → for-loop returns P first ✓
- Empty `topTierLabels` array → `some` returns false → tier 99 ✓
- Invalid JSON / non-array `priority_top_tier_labels` → inner catch returns default ✓
- `root === undefined` at runtime → `path.join` throws → outer catch returns `[]` ✓

## Next Steps
1. Write `phase3-plan.md` incorporating blocker + refinements.
2. No architect revision needed — refinements are tactical.
3. Mark: `architect revisions | N/A | | refinements absorbed in phase3-plan.md`
