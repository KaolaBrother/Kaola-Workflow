# Planner: issue-150 — GitLab and Gitea listOpenIssues Priority Sort

## Verified Facts (corrections to Phase 1)

1. **No internal callers of `listOpenIssues` in any claim script.** `cmdStartup` and `cmdPickNext` in both plugins call `claimExplicitTarget`, not `listOpenIssues`. The only references are: (a) function definition, (b) `module.exports`, (c) one test assertion per plugin.
   - GitLab: definition at line 265, export at ~723, test at test-gitlab:334
   - Gitea: definition at line 268, export at ~708, test at test-gitea:341

2. **Drift guard does NOT cover GitLab/Gitea.** `validate-script-sync.js` only enforces parity between `scripts/` and `plugins/kaola-workflow/scripts/`. GitLab and Gitea are intentionally independent forks.

3. **Labels in new tests must be plain strings** (not `{name:'P0'}` objects) because `withForge` stubs `listIssues` directly and bypasses `normalizeIssue`. Existing tests already supply labels as strings in other stubs.

4. **Existing `listOpenIssues` tests don't exercise priority.** Both use 3 unlabeled issues and assert `[7, 9]` — they pass with or without priority sort. A NEW test with labeled issues is required.

---

## Option A: Direct Port (RECOMMENDED)

Mirror GitHub reference exactly, minus `labelName()`, with `root` as a required positional parameter.

Add to each claim script:
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

Change `listOpenIssues` to accept `root`, call `readPriorityConfig(root)`, sort by tier then IID. Preserve existing `state: 'opened'`/`'open'`, `.filter`, and `issue_iid || number` per-forge values. Export `readPriorityConfig` from both scripts.

- Pros: Maximal fidelity to GitHub reference. Surgical (2 helpers + 1 signature change per plugin). No drift-guard conflict.
- Cons: Signature change is "breaking" for export, but only caller is the test (which gets updated).
- Risk: Low
- Complexity: Small

## Option B: Optional `root` with `getRoot()` default

`listOpenIssues(root = getRoot())` — backward-compatible, no test signature churn.

- Pros: No test signature update.
- Cons: Diverges from GitHub reference signature. `getRoot()` shells out to git — wrong in unit tests.
- Risk: Medium (silent behavior differences)
- Complexity: Small
- **Rejected**

## Option C: Shared priority module

Extract helpers into a common module required by all three forks.

- Pros: Single source of truth.
- Cons: Fights the intentional-independent-forks architecture. Over-engineered for ~15 lines.
- Risk: Medium (new sync surface)
- Complexity: Medium
- **Rejected**

---

## Recommended: Option A

Four files, two per plugin:
1. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — add helpers, update listOpenIssues, add export
2. `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — update existing test (add root arg), add priority sort test
3. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — same as #1
4. `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — same as #2

---

## NOT to Build

- `labelName()` — not needed (labels already strings)
- Export `priorityTier` — only `readPriorityConfig` exported (matches GitHub)
- Don't change `forge.listIssues` API call or its `state` value
- Don't use `readConfig()` from sink scripts (wrong path, wrong purpose)
- Don't extract shared module or touch drift guard
- Don't modify GitHub scripts — already correct
- Don't modify README/init docs — they already describe the intended behavior

---

## Missing Fact

Whether any skill markdown or external agent code invokes the exported `listOpenIssues` zero-arg. Grep of `plugins/**` found only the tests; if a skill calls it CLI-style with different arg convention, Option B's optional root becomes preferable. Quick confirm recommended.
