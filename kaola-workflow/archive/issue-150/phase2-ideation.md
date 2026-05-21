# Phase 2 - Ideation: issue-150

## Approaches Evaluated

### Option A: Direct Port (SELECTED)
- Summary: Mirror GitHub reference exactly — add `readPriorityConfig(root)` and `priorityTier(issue, topTierLabels)` helpers, update `listOpenIssues` to accept `root` and sort by tier. Skip `labelName()` since GitLab/Gitea `normalizeIssue()` already coerces labels to `string[]`. Export `readPriorityConfig` from both plugin claim scripts.
- Pros: Maximal fidelity to GitHub reference. Surgical change (~2 helpers + 1 signature change per plugin). No drift-guard conflict. Requires updating only 4 files.
- Cons: Signature change is "breaking" for export, but only caller is the test (which gets updated).
- Risk: Low
- Complexity: Small

### Option B: Optional `root` with `getRoot()` default
- Summary: `listOpenIssues(root = getRoot())` — backward-compatible, no test signature churn.
- Pros: No test signature update needed.
- Cons: Diverges from GitHub reference signature. `getRoot()` shells out to git — wrong in unit tests.
- Risk: Medium (silent behavior differences)
- Complexity: Small
- **Rejected**

### Option C: Shared priority module
- Summary: Extract helpers into a common module required by all three forks.
- Pros: Single source of truth.
- Cons: Fights the intentional-independent-forks architecture. Over-engineered for ~15 lines.
- Risk: Medium (new sync surface)
- Complexity: Medium
- **Rejected**

## Advisor Findings

Advisor approved Option A with four load-bearing refinements:

1. **CHANGELOG → Phase 6 doc-updater**: Do not add CHANGELOG as a Phase 4 task. Doc-updater in Phase 6 handles the CHANGELOG entry. Docs already describe priority labels as cross-forge; the change makes code match docs (no new public behavior, just a bug fix note).

2. **Grep fresh in Phase 4**: Line numbers in research artifacts (GitLab:265, Gitea:268, exports:723/708) will likely have drifted. Phase 4 task instructions must say "grep for `function listOpenIssues` and the module.exports block before editing."

3. **Per-forge details are load-bearing**:
   - **State value preservation**: GitLab uses `state: 'opened'`, Gitea uses `state: 'open'` in the `forge.listIssues` call. A port that hardcodes one value silently breaks the other forge.
   - **Test stub label shape**: `withForge` stubs `listIssues` directly and bypasses `normalizeIssue`. Labels in new tests MUST be plain strings: `['P0']` not `[{name:'P0'}]`.
   - **`priorityTier` body must NOT include `.map(labelName)`**: Labels are already strings post-`normalizeIssue`. Omit `.map(labelName)` entirely.
   - **Export shape**: Export only `readPriorityConfig`, not `priorityTier` (matches GitHub's export pattern).

4. **New test is the only discriminating test**: The existing `listOpenIssues` tests use unlabeled issues and pass regardless of whether priority sort is added. Phase 3 must specify the new test MUST include at least one `P\d+` label AND one custom-top-tier label (from a temp config), with labels as plain strings, asserting a specific non-trivial ordering. This is the only test that can prove the implementation is correct.

## Selected Approach

**Option A: Direct Port**

Rationale: Mechanical 2-helper-per-plugin port with no new abstractions or shared modules. All label normalization is already handled by `normalizeIssue()` in each forge, so `labelName()` is unnecessary. The only callers of `listOpenIssues` are the tests — signature change is safe. Drift guard does not cover GitLab/Gitea plugins, so no sync ceremony required.

## Out of Scope (explicit)

- `labelName()` helper — not needed (labels already strings in GitLab/Gitea)
- Exporting `priorityTier` — only `readPriorityConfig` exported (matches GitHub)
- Modifying `forge.listIssues` API call or its `state` value
- Using `readConfig()` from sink scripts (wrong path, wrong purpose)
- Extracting shared module or touching drift guard
- Modifying GitHub claim scripts — already correct
- Modifying README/init docs — they already describe the intended behavior
- Adding `listOpenIssues` priority sort tests to the GitHub script (out of scope for this issue)
- CHANGELOG entry — handled by Phase 6 doc-updater

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
