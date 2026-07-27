selection_mode: single-issue

selection_bundle: 819

selection_priority_basis: frontier = #819 — it is the ONLY open issue in the backlog (`gh issue list --state open` returns exactly one row) and the only row in `kaola-workflow/ROADMAP.md`'s Active Work table, whose `Next Step` column reads `adaptive`. `kaola-workflow/.roadmap/` holds only `issue-819.md` and there is no `### Project rules` block, so there is no drive-order guardrail to honor or violate. The pick IS the frontier: no issue was skipped, nothing outranks it, and no lower-priority substitution occurred. It is a correctness `bug` in the workflow's own recovery contract (First Principle 1) and its acceptance is verifiable inside this repository.

selection_rejected: none — the survey found no other open issue. `gh issue list --state open --limit 100` returned a single row (#819); every other candidate is already closed. `node scripts/kaola-workflow-claim.js status --json` returned `{"active":[],"drift":[],"count":0}`, so no lane was excluded as `live`, `stale`, or `ambiguous`, and no candidate was excluded for a red write-set overlap or an unresolved external dependency.

selection_disjointness: Single-issue selection, so no cross-issue disjointness was required. Within #819 the work partitions into three write lanes that share no file: the four `adaptive-node` script editions (the behavior), `scripts/test-adaptive-node.js` (the judgment of that behavior, held in separate custody), and the plan-run routing prose layer (the skeleton, the routing-contract token table, and the six rendered surfaces). The documentation surfaces are held out of all three and written once downstream, because a document describing a refusal code that has not landed yet is a guess rather than a record.
