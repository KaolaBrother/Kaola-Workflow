evidence-binding: n8-contract-pins 81205d012dd5

non_tdd_reason: contract-pin additions — structural assertions added to existing validators; no natural failing unit test prior to the feature being present

regression-green: all validators pass

validate-workflow-contracts.js: PASSED (pins added for OPERATOR_HINT_REGISTRY x4, route-findings, --summary, findings-route.json, VERDICT_ROLES)
codex validate-kaola-workflow-contracts.js: PASSED (same pins added for codex plugin paths)
test-route-reachability.js: PASSED (T5 non-blocking frontier-unit pin added; n9 pending)
walkthrough (simulate-workflow-walkthrough.js): PASSED

files changed:
- scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- scripts/validate-kaola-workflow-contracts.js
- scripts/test-route-reachability.js

verification commands:
  KAOLA_WORKFLOW_OFFLINE=1 node scripts/validate-workflow-contracts.js        # exit 0
  KAOLA_WORKFLOW_OFFLINE=1 node scripts/validate-kaola-workflow-contracts.js  # exit 0
  KAOLA_WORKFLOW_OFFLINE=1 node scripts/test-route-reachability.js            # exit 0
  KAOLA_WORKFLOW_OFFLINE=1 node scripts/simulate-workflow-walkthrough.js      # exit 0
