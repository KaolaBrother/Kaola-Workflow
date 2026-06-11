b87017bb5c6e
evidence-binding: t418-forge-smoke b87017bb5c6e

task: Add testGitlabAdaptiveFreezeChecked and testGiteaAdaptiveFreezeChecked to the two forge walkthroughs, exercising the #408 --freeze-checked -> governance_ack_stale contract.

non_tdd_reason: forge-mock walkthrough scenarios are integration-glue against generated ports, not unit-testable logic with a natural failing assertion

verification_tier: regression-green

write_set:
- plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
- plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js

verification_commands:
  node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js  -> exit 0
  node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js    -> exit 0

before_result: both forge walkthroughs already passed (no testGitlab/GiteaAdaptiveFreezeChecked function existed)

after_result: both forge walkthroughs pass with testGitlabAdaptiveFreezeChecked: PASSED and testGiteaAdaptiveFreezeChecked: PASSED included in the run output

regression-green: both forge walkthroughs pass
