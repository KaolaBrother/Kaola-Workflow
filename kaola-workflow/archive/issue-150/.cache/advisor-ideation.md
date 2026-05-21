# Advisor: issue-150 Ideation Gate

## Verdict
Option A (Direct Port) is correct. Approved with refinements.

## No Missed Approaches
Risks read accurate, recommendation sound. The "no external callers" verification confirms the required-positional `root` signature is safe.

## Refinements

**Refinement 1 — CHANGELOG → Phase 6 doc-updater**
Don't add CHANGELOG as a Phase 4 task. Doc-updater in Phase 6 adds the CHANGELOG entry. Docs already describe priority labels as cross-forge; the change makes code match docs (no new public behavior to document, just a bug fix note). Phase 6 doc-updater handles it.

**Refinement 2 — Line numbers are stale-able; grep fresh in Phase 4**
GitLab:265, Gitea:268, exports:723/708 will likely have drifted by Phase 4. Task instructions must say "grep for `function listOpenIssues` and the module.exports block before editing."

**Refinement 3 — Load-bearing per-forge details require explicit Phase 4 callouts**
- **State value preservation**: GitLab uses `state: 'opened'`, Gitea uses `state: 'open'` in the `forge.listIssues` call. A port that hardcodes one value silently breaks the other forge. Phase 4 tasks must explicitly call this out.
- **Test stub label shape**: `withForge` stubs `listIssues` directly and bypasses `normalizeIssue`. Test authors who mirror GitHub's `gh issue list --json` shape will supply `{name:'P0'}` objects, causing every issue to fall to tier 99 (false-passing tests). Labels in new tests MUST be plain strings: `['P0']` not `[{name:'P0'}]`.
- **`priorityTier` body must NOT include `.map(labelName)`**: Labels are already strings post-`normalizeIssue`. Including `labelName` would be harmless but signals a copy error. Phase 4 tasks must explicitly say: omit `.map(labelName)`.
- **Export shape**: Export only `readPriorityConfig`, not `priorityTier` (matches GitHub's export at line 727).

**Refinement 4 — New test is the only discriminating test**
The existing `listOpenIssues` test uses unlabeled issues and passes regardless of whether priority sort is added. Phase 4 GREEN from the existing test is not evidence of correctness. Phase 3 must specify that the new test MUST include at least one `P\d+` label AND one custom-top-tier label (from a temp config), with labels as strings, asserting a specific non-trivial ordering. This is the only test that can prove the implementation is correct.
