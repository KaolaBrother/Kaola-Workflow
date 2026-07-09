evidence-binding: n2-stale-culprits 4fecdfbaf431
upstream_read: n1-explore 51876192226e

assigned_task: n2-stale-culprits review R1 repair
repair_goal: Add positive truncation regression coverage for more than 20 validation-visible stale paths.

write_set:
- scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
- scripts/simulate-workflow-walkthrough.js

tests_changed:
- scripts/simulate-workflow-walkthrough.js
  - added a clean-stamped stale receipt case that creates 25 code-visible stale paths
  - asserts `stale_paths_truncated === true`
  - asserts emitted `stale_paths` is capped to the first 20 sorted paths
  - asserts `stale_kind === "code"` and the refusal remains `reason: "chains_stale"`

implementation_files_changed:
- none in this reopened repair; existing validator behavior already capped paths and set `stale_paths_truncated`

RED: not feasible for this repair. The review requested missing positive coverage, and the existing implementation already satisfied the new truncation test when it was added. No validator change was required.

GREEN: `node scripts/simulate-workflow-walkthrough.js` exited 0 after adding the truncation coverage.
green_signature: `Workflow walkthrough simulation passed`

validation_commands:
- `node scripts/simulate-workflow-walkthrough.js` -> exit 0; truncation regression passed and full walkthrough reported `Workflow walkthrough simulation passed`

sync_status: `npm run sync:editions` not run in this reopened repair because only `scripts/simulate-workflow-walkthrough.js` changed; validator code and generated edition ports were unchanged.

failure_classification: none
