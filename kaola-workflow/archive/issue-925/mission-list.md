# Make Codex standard-tier subagents always dispatch as Sol medium

- item: Locate every live Codex routing, test, and documentation surface carrying the superseded standard-tier policy from issue 924.
  status: done
  dispatched: self; findings will be recorded inline in this mission result
  result: The #924 commit identifies 15 touched files. Authoritative routing lives in two skeletons; six Codex skill files are generated from them; one reachability contract test mutation-checks the policy; README, API, architecture, conventions, decision record, and changelog carry the directly corresponding documentation.

- item: Replace the superseded standard-tier policy with one fixed mapping while preserving the reasoning tier and all strict scope boundaries.
  status: done
  dispatched: self; changes will land on workflow/issue-925 and generated Codex skills will be regenerated from their routing skeletons
  result: Two routing skeletons now fix standard at Sol/medium and reasoning at Sol/xhigh with no per-task exception; six Codex next/finalize skills were regenerated. README, API, architecture, conventions, D-687-01, and Unreleased changelog were updated. No workflow-init, profile, installer, preflight, feature, lifecycle, or non-Codex routing surface changed.

- item: Prove generated-surface parity, focused policy behavior, and the complete workflow walkthrough.
  status: done
  dispatched: focused routing-test custody to test_codex_dispatch_924, with output landing in scripts/test-route-reachability.js and its final message; primary session retains generated-surface and full-walkthrough validation
  result: Generated-surface check passed across 18 surfaces; route-reachability passed 426 assertions including five negative exception mutations on each of six Codex skills; the full workflow walkthrough passed all 202 scenarios.

- item: Prepare issue 925 for the final sink through documentation docking, review, closure readiness, and archive.
  status: done
  dispatched: self applying kaola-workflow-finalize; documentation docking to docs_codex_dispatch_924 with output in .cache/doc-updater.md and any necessary changes limited to the issue's existing documentation set; independent read-only diff review to review_codex_dispatch_924 in its final message; validation, closure, archive, and sink results will land in the run folder and repository history
  result: Documentation is DOCKED, independent Sol/xhigh review found no issues, all four chains are green, the gap sweep found none, and the finalize transaction archived the run with issue closure pending the merge sink.
