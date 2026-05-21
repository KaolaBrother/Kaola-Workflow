# Advisor Ideation Gate Output: issue-137

## Advisor Review of Planner Output

### Verdict: Approach A approved with multi-forge scope addition

### Missed Approaches
None. Approach A (sibling `assertX` helper) is the correct pattern. Approach C (shared module) would force a larger refactor than warranted; the gitlab/gitea sink-merge scripts diverge in other places, so a shared module is speculative abstraction.

### Risks Assessment
Accurate. The key risk is no-upstream case (branch not pushed yet, no tracking ref). Planner's strict policy (block with remediation hint `git push -u origin <branch>`) is correct.

### Recommendation Assessment
Sound. Approach A repeated per forge file is the cleanest path.

### Gotchas / Changes to Decision

**Multi-forge blind spot (action required before Phase 3):**
The guard must go into all three sink-merge scripts:
1. `scripts/kaola-workflow-sink-merge.js` (Claude/Codex, main)
2. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
3. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`

Verification result (confirmed before writing this file):
- Both gitlab and gitea scripts have `assertCleanWorktree` at line 75, `assertNoLiveWorkflowFolder` at line 80, and `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'` at line 13 — same shape as the main script.
- Insertion points: after `assertNoLiveWorkflowFolder` call, before `doRebase` call.
  - gitlab: after line 307, before line 319
  - gitea: after line 306, before line 318
  - main: after line 266, before line 283 (from phase1-research.md)

**Note on `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`:**
This is the Codex plugin copy (must be byte-identical to `scripts/kaola-workflow-sink-merge.js` per validate-script-sync.js). It receives the guard automatically when the main script is updated and synced.

**Approach per forge file:**
Repeat Approach A per file — do not extract to a shared module. This keeps forge scripts independently deployable and avoids coupling them at a shared boundary they don't currently share.

### Summary
Approach A is approved. Phase 3 blueprint must include all three forge sink-merge scripts in its write set, plus the Codex plugin sync copy.
