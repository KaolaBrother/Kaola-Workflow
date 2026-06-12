evidence-binding: n8a-prose-planner-430 f055367f8adb
non_tdd_reason: prose-only doc update; verified by regression-green four-chain suite
regression-green

## Summary

### agents/workflow-planner.md

Two additions integrated into the existing Method section:

1. Under Method step 1 (Claim / starting contract), after the existing Refusal bullet: added a new "Bundle startup consistency (target_set_mismatch, #430)" bullet explaining that cmdStartup compares the persisted issue_numbers in workflow-state.md against the passed --target-issues set, refuses with target_set_mismatch on mismatch, and that the planner must surface it verbatim and stop — not retry with a different issue set.

2. Under Method step 4 (Run the handoff), after the existing paragraph: added a new "Bundle coherence guard (bundle_state_incoherent, #430)" bullet explaining that before freezing the handoff validates that when bundle_id is present in workflow-state.md, issue_numbers is also present and matches the bundle-N-M-K pattern; failure returns handoff_status:plan_invalid with reason:bundle_state_incoherent and the planner must return verbatim without retrying.

### plugins/kaola-workflow/agents/workflow-planner.toml
### plugins/kaola-workflow-gitlab/agents/workflow-planner.toml
### plugins/kaola-workflow-gitea/agents/workflow-planner.toml

Identical additions to each TOML (all three are byte-identical mirrors):

1. Step 1 extended with BUNDLE STARTUP CONSISTENCY (target_set_mismatch, #430) inline paragraph matching the .md addition in the dense prose style of the TOML.

2. Step 4 extended with BUNDLE COHERENCE GUARD (bundle_state_incoherent, #430) inline paragraph matching the .md addition in the dense prose style of the TOML.

All four test chains passed (exit code 0): claude, codex, gitlab, gitea.
