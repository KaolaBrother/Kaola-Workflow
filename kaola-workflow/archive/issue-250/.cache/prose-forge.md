# Node `prose-forge` evidence — issue #250

Mirror the `implementer` planner-heuristic + three-way evidence-contract prose into the GitLab/Gitea
command editions (closes cross-edition drift). PROSE node → change-type-appropriate proof (no RED→GREEN).

(The role agent crashed on an API socket error after completing the edits; the orchestrator verified
the result, reverted out-of-lane writes, and wrote this evidence.)

## Files changed (4 declared — in lane)
1. `plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md` — added the "choose the right implement role" heuristic in `## Shaping guidance` + `implementer` in the "Free" enumeration.
2. `plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md` — same.
3. `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md` — added the `implementer` dispatch block (`subagent_type="implementer"`, `model="{IMPLEMENTER_MODEL}"`, "You MUST pass model=" sentence) + extended the contractor commit-bracket evidence rule + barrier-judge to cover implementer (non_tdd_reason + change-type-appropriate check in place of RED→GREEN).
4. `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md` — same.

Substance is identical in meaning to what `prose-commands` landed in the root/github edition (verified by side-by-side: same heuristic, same default-tdd-guide / asymmetric-tie-breaker / bug-fixes-always-tdd-guide / equal-burden fences; same dispatch-block shape; `implementer`=3 in each adapt.md, `implementer`=4 + IMPLEMENTER_MODEL=2 + subagent_type="implementer"=1 in each plan-run.md, matching root).

## GREEN proof (change-type-appropriate)
Forge contract validators + simulate walkthroughs were run by the orchestrator with the count bumps
present and all passed exit 0:
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` → exit 0 ("GitLab contract validation passed")
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` → exit 0 ("Gitea contract validation passed")
- `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` → exit 0 ("GitLab workflow walkthrough simulation passed")
- `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` → exit 0 ("Gitea workflow walkthrough simulation passed")

The forge contract validators pass once the ORTHOGONAL agent-profile count assertion (12→13) is
applied. That count bump is NOT a prose concern — it is required purely because `impl-profiles` added
a new agent toml to each forge edition. It was factored OUT of this node (it falls in no command
file) into a new node **`impl-forge-counts`** (declared write set = the 4 forge
`validate-*-contracts.js` + `test-*-workflow-scripts.js` files), added via a `--freeze` plan repair so
the count bumps land inside a declared write set (else Phase 6's whole-plan barrier would refuse them
as `outOfAllow` — they are production paths, not `isTestPath`-exempt). prose-forge's own declared lane
is clean: only its 4 command files changed since its baseline.

test_thrash: 0 (prose node; no RED→GREEN cycle).
non_tdd_reason: cross-edition documentation/prose (planner heuristic + contractor evidence rule); verified by forge contract + simulate gates, not a unit test.
