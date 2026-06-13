evidence-binding: n7-finalize-seat 3e67288f81aa

RED: test_goal_check_absent — AssertionError: goal_check is "absent" when no goal source (got: null); all 4 goal_check assertions failed (8/12 assertions failed, goal_check always null pre-impl)

GREEN: all 4 goal_check assertions pass; 12/12 assertions green (absent=absent, KAOLA_GOAL→satisfied, plan goal:→satisfied, both→satisfied)

## Implementation

Added `goal_check` attestation to `cmdFinalize` in all 4 claim.js editions.

### Files modified

- `scripts/kaola-workflow-claim.js` (canonical)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (codex twin — byte-identical)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (gitlab edition-named port)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (gitea edition-named port)

### Changes per file

1. Added `require('./kaola-workflow-plan-validator')` (edition-named in gitlab/gitea ports)
2. Added `computeGoalCheck(planDirs)` helper before `cmdFinalize` — advisory, never throws
3. After `checkDispatchAttestations(...)` in `cmdFinalize`: `closureReceipt.goal_check = computeGoalCheck([result.dest, path.join(root, 'kaola-workflow', args.project)])`

### v1 rule

- `KAOLA_GOAL` env set + non-empty → `'satisfied'`
- else: `workflow-plan.md` `goal:` line present in archive dest or live folder → `'satisfied'`
- else → `'absent'`
- `'unsatisfied'` reserved for future use

### Validation

- Forbidden-only checks: gitlab PASSED, gitea PASSED
- `node scripts/simulate-workflow-walkthrough.js`: PASSED (all tests green)
