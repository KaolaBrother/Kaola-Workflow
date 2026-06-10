# flake_margin — tdd-guide evidence (issue #358)

## RED stage
Before probeTimeoutEnv was defined: `node -e "probeTimeoutEnv()"` → ReferenceError: probeTimeoutEnv is not defined. RED confirmed. The testProbeTimeoutEnv assertion in each of the three drivers calls probeTimeoutEnv() and fails the same way pre-helper.

## GREEN stage
After adding the helper byte-verbatim ×3, all three testProbeTimeoutEnv assertions pass:
- TEST_PARALLEL='1' → { KAOLA_GH_REMOTE_TIMEOUT_MS: '2000' } — PASS
- unset → '300' — PASS
- TEST_PARALLEL='0' → '300' — PASS
GREEN confirmed.

## Helper placement (adjacent to runClosureAudit)
- scripts/simulate-workflow-walkthrough.js:2918 (runClosureAudit at 2948)
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:137 (runClosureAudit at 167)
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js:135 (runClosureAudit at 165)
Byte-identity: grep -h "^function probeTimeoutEnv" across 3 files | sort | uniq -c → single unique line, count 3.

## 13 substituted load-sensitive sites (final lines)
claude walkthrough (5): 6769 StaleLabelsTimeout, 6791 UnresolvedClosedState, 6895 ExecuteDetectionTimeoutPropagates, 6924 ExecuteLabelRemovalTimeoutBreaks, 6989 PrFolderTimeout.
gitlab (4): 2859, 2881, 3039, 3062 (MrFolderTimeout).
gitea (4): 2774, 2796, 2896, 2919.
Do-NOT-touch parse-behavior sites preserved with literal values: claude 6848 'not-a-number' / 6877 over-cap; gitlab 2936/2962; gitea 2851/2878.

## Suite results (all exit 0)
- node scripts/simulate-workflow-walkthrough.js → "Workflow walkthrough simulation passed" (incl. testProbeTimeoutEnv: PASSED)
- node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js → "GitLab workflow script tests passed"
- node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js → "Gitea workflow script tests passed"

## Diff summary
3 files changed, 118 insertions(+), 13 deletions(-): per file one 34-line block (comment + helper + testProbeTimeoutEnv) + 4-5 call-site substitutions + 1 run-sequence call insertion.
