# Node `prose-planner` evidence — issue #250

## Files changed

1. `agents/workflow-planner.md`
   - Added "Choose the right implement role" bullet to the grammar section (after the Gates paragraph, lines 70-73). Guidance: default tdd-guide; implementer only for enumerated non-test-first categories + record non_tdd_reason; asymmetric tie-breaker (meaningful failing unit test can be written → tdd-guide; doubt → tdd-guide); "hard to test" NOT a reason; both implement roles require code-reviewer post-dominance (G1).

2. `plugins/kaola-workflow/agents/workflow-planner.toml`
   - Added identical implement-role choice guidance as a continuation of the step 2 grammar bullet in `developer_instructions`.

3. `plugins/kaola-workflow-gitlab/agents/workflow-planner.toml`
   - Same addition as kaola-workflow edition (substance identical across all 3 TOML files).

4. `plugins/kaola-workflow-gitea/agents/workflow-planner.toml`
   - Same addition as kaola-workflow edition.

## Substance added (identical meaning across all 4 files)

Use `tdd-guide` for test-first work (behavioral logic, bug fixes — failing test first). Use `implementer` for implementation with NO natural failing-unit-test: behavior-preserving refactors, scaffolding/boilerplate/wiring, config/IaC/scripts, UI/markup, migrations/fixtures, integration glue. Record a `non_tdd_reason`. Default to `tdd-guide`; if a meaningful failing unit test can be written, choose `tdd-guide`; doubt → `tdd-guide`. "Hard to test" is NOT an `implementer` reason. Both implement roles require `code-reviewer` post-dominance (G1).

## Gate exit codes

- `node scripts/validate-vendored-agents.js` → exit 0
- `node scripts/simulate-workflow-walkthrough.js` → exit 0
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` → exit 1 (DEFERRED: fails only on "expected 12 GitLab agent profiles" count assertion = 13 vs 12; this is the deliverable of node `impl-forge-counts`, not this node. No other assertion failed.)
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` → exit 1 (DEFERRED: fails only on "expected 12 Gitea agent profiles, got 13" count assertion; same `impl-forge-counts` dependency. No other assertion failed.)

## Change-type note

This node is prose (agent profile documentation edits only); no failing unit test applies. Proof is vendored-agents-green + walkthrough-green — change-type-appropriate verification for a prose node. Forge-count failures are a pre-existing deferred dependency on node `impl-forge-counts` (those validators assert agent count 12; the implementer agent file was added by a prior node, raising the count to 13 before the validators are updated).
