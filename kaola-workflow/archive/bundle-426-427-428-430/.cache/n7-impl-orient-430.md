evidence-binding: n7-impl-orient-430 9c7dc9e48657
non_tdd_reason: glue/wiring — adding a coherence guard into the existing orient subcommand pipeline, wiring it identically to the handoff guard; no new behavioral logic surface beyond the guard connection
regression-green

## Task

Implement bundle state coherence check in the `orient` subcommand of `kaola-workflow-adaptive-node.js` (issue #430 orient piece). If `bundle_id` is set in `workflow-state.md` but `issue_numbers` is absent/empty or mismatched, orient must return a typed refusal with `reason: 'bundle_state_incoherent'` and `resume_state: 'corrupt_incoherent_bundle'` before building the main result. Add tests (d) and (e) to `scripts/test-bundle-state.js`.

## Files Changed

- `scripts/kaola-workflow-adaptive-node.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` (byte-identical twin)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` (edition port)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` (edition port)
- `scripts/test-bundle-state.js`

## Change Description

In `runOrient`, after the bundle fields are parsed from `stateContent` (lines ~620-628) and before `planContent` is read, inserted a 25-line coherence check block. The check mirrors `kaola-workflow-adaptive-handoff.js` exactly:
- If `bundleId` is non-null and `issue_numbers` parses to zero positive integers: refuse with `bundle_state_incoherent`.
- If `bundleId` is non-null but does not equal `bundle-<sorted issue numbers>`: refuse with `bundle_state_incoherent`.
- On refusal: `{ result: 'refuse', reason: 'bundle_state_incoherent', errors: [...], resume_state: 'corrupt_incoherent_bundle' }`.

Applied identically to all four edition files. The plugins/kaola-workflow twin diff is empty (byte-identical confirmed).

Added two new tests to `scripts/test-bundle-state.js`:
- Test (d): orient on bundle project with `bundle_id` set but `issue_numbers` line absent → exits 1, JSON output has `reason: 'bundle_state_incoherent'` and `resume_state: 'corrupt_incoherent_bundle'`.
- Test (e): orient on bundle project with `bundle_id: bundle-42-99` but `issue_numbers: 42,47,53` → exits 1, JSON output has `reason: 'bundle_state_incoherent'`, errors mention the mismatched bundle_id.

Both orient tests create a minimal `workflow-plan.md` so `planProbe.planExists` passes; `--resume-check` and `nextAction` shell calls fail gracefully (shellNode catches errors), and the coherence check fires before the final result is assembled.

## Verification Commands

```
node scripts/test-bundle-state.js
# Exit 0: all 37 tests passed

node scripts/simulate-workflow-walkthrough.js
# Exit 0: Workflow walkthrough simulation passed

npm run test:kaola-workflow:claude
# Exit 0

npm run test:kaola-workflow:codex
# Exit 0

npm run test:kaola-workflow:gitlab
# Exit 0

npm run test:kaola-workflow:gitea
# Exit 0

diff scripts/kaola-workflow-adaptive-node.js plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
# (empty — byte-identical)
```

## Before Result

- `node scripts/test-bundle-state.js` — 25 tests passed (no orient coherence tests)
- `node scripts/simulate-workflow-walkthrough.js` — passed
- All four chains green

## After Result

- `node scripts/test-bundle-state.js` — 37 tests passed (25 original + 12 new assertions in 2 new orient tests)
- `node scripts/simulate-workflow-walkthrough.js` — passed
- All four chains green
- Byte-identical diff between root and plugins/kaola-workflow twin: empty
