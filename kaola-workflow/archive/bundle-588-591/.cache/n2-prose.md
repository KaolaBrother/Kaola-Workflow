evidence-binding: n2-prose fb74ac35a6ba
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: glue/wiring — mechanical prose propagation of issue #591's dispatch payload
  field rename (laneGroup cross-reference -> per-member dispatch.leg_path/dispatch.leg_branch)
  to the six routing surfaces + the frontier-batch card, mirroring n1's already-landed code
  change; no behavioral logic in these markdown files, verified by contract/route-reachability
  validators (which machine-enforce six-surface propagation) rather than a unit test.
<!-- regression-green|build-green|smoke-integration -->
regression-green: verification_tier=smoke-integration (contract/route-reachability validators +
  full walkthrough regression suite, no unit-test fit for markdown prose)

task: update plan-run routing prose (six surfaces) + the frontier-batch card so write-leg
dispatch references the NEW per-member `dispatch.leg_path`/`dispatch.leg_branch` payload
fields instead of the retired top-level laneGroup cross-reference (issue #591 prose half;
n1-impl already landed the code in scripts/kaola-workflow-adaptive-node.js + the 3 forge
ports + scripts/test-adaptive-node.js).

write_set (all 7 touched, nothing else):
- commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md
- docs/plan-run-cards/frontier-batch.md

verification_commands (all exit 0):
- node scripts/test-route-reachability.js -> "Route-reachability test passed (185 assertions)." EXIT:0
- node scripts/validate-workflow-contracts.js -> "Workflow contract validation passed" EXIT:0
- node scripts/validate-kaola-workflow-contracts.js -> "Kaola-Workflow Codex contract validation passed" EXIT:0
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js -> "Kaola-Workflow GitLab contract validation passed" EXIT:0
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js -> "Kaola-Workflow Gitea contract validation passed" EXIT:0
- node scripts/simulate-workflow-walkthrough.js -> "Workflow walkthrough simulation passed" EXIT:0 (full regression net, run as extra confidence)
No validator pinned the old wording ("legPath"/"absolute `legPath`") as a needle -
grep across scripts/test-route-reachability.js + all 4 validate-*-contracts.js for
legPath/leg_path/leg_branch/"laneGroup cross-reference" returned nothing, so no pin
conflict arose and no validator edit was needed.

before_result: baseline (pre-edit) — six surfaces read "Dispatch each leg with its
**absolute `legPath`**" (old top-level laneGroup-cross-reference-derived field);
card `docs/plan-run-cards/frontier-batch.md` read "dispatch each leg member with its
absolute `legPath`" with no per-member dispatch-field documentation. All 5 validators
+ walkthrough were green before touching prose (validators don't pin this wording, so
pre-edit state was already 0-exit; confirmed post-edit state is unchanged 0-exit,
i.e. no regression introduced).

after_result: all six surfaces reworded identically (byte-diff-confirmed across all
six changed regions) to reference the member's OWN `dispatch.leg_path` (and
`dispatch.leg_branch`) from the open-ready payload, explicitly stating this removes
the need for a laneGroup cross-reference (the laneGroup descriptor/`laneGroup.legs`
remains for observability only). Surrounding fail-closed containment prose
(relative-path own-lane slip -> parent-clean fence -> merge_conflict/repair,
K=2 bounded thrash) left intact verbatim. No `<!-- PIN: ... -->` marker lines touched.
No provenance (issue refs / decision IDs) added to the six prompt-facing surfaces.
docs/plan-run-cards/frontier-batch.md: reworded the open-ready write-frontier bullet
+ added a new "Per-member leg fields on `dispatch`" paragraph documenting
`dispatch.leg_path`/`dispatch.leg_branch` (both conditionally attached like
`dispatch.goal_line`; absent/null on serial/read path) against the actual code
(scripts/kaola-workflow-adaptive-node.js buildDispatch()/runOpenReady() diff,
verified before writing prose — d.leg_path/d.leg_branch set from
ctx.leg_path/ctx.leg_branch, sourced from legs[n.id].legPath/legBranch).
Post-edit grep confirms zero remaining occurrences of the bare old field name
`legPath` anywhere in the seven touched files.
All 5 validators + the full walkthrough suite green after the edit (see
verification_commands above).
