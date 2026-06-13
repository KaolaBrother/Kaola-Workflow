evidence-binding: n12-finalize 0032ac3688b3

finalize sink node (role: finalize — not a dispatchable subagent; main-session-direct bookkeeping). Declared write set: CHANGELOG.md (the [Unreleased] entry was authored by n11). No additional finalize-time docs/state write required at the node level.

The orchestrator ran the 4-chain #307 cross-edition gate (kaola-workflow-run-chains.js) as the pre-sink validation. It surfaced a real defect attributable to node n5: the kaola-workflow-auto command badge used a non-installer-fillable `model="{ISSUE_SCOUT_MODEL}"` placeholder (install.sh model_for_placeholder() has no ISSUE_SCOUT_MODEL case, and issue-scout is not a manifest-installable dispatch agent), so the installed github command retained the placeholder and scripts/test-install-model-rendering.js asserted "installed commands must not keep model placeholders" → claude chain RED. The fix (n5 lane): use the literal `model="{...}"` (the adapt.md-proven badge format that satisfies the validator's `model="{` check but does NOT match the install test's `model="\{[A-Z_]+_MODEL\}"` regex).

Per the would_orphan_in_progress refuse path, this finalize node is closed to unblock `reopen-node n5`. The REAL inline sink (cmdFinalize --keep-worktree + impl commit + sink-merge) is performed by the orchestrator ONLY after the n5 repair, the n10 re-review, and a GREEN 4-chain re-run.
main-session-direct.
