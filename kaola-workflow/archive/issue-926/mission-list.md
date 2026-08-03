# Replace recurring Codex profile freshness gates with install-time verification only

- item: Map every authoritative, generated, test, and documentation surface coupled to the recurring Codex profile preflight and record the exact baseline behavior.
  status: done
  dispatched: self; findings will be recorded in this mission result and used to constrain the issue-926 worktree diff
  result: The recurring session gate is authored only in templates/routing/{next,finalize}.skeleton.md and rendered into exactly six forge-specific Codex skills. T19 in scripts/test-route-reachability.js currently requires and executes that gate; README.md and docs/conventions.md describe it as authoritative. Baseline route reachability passed 426 assertions, all 18 generated surfaces byte-matched, and standalone install-model rendering tests passed.

- item: Make focused tests require absence of the recurring gate across all six Codex next/finalize surfaces while preserving installer, doctor, and fixed model-routing contracts.
  status: done
  dispatched: self; focused contract changes will land in scripts/test-route-reachability.js on workflow/issue-926
  result: T19 now mutation-checks nine forbidden recurring-gate signatures across both authoritative skeletons and every one of the six generated Codex skills, while retaining the existing per-spawn model-routing and call-site mutations. The baseline implementation produces exactly eight expected failures: two skeletons plus six generated skills; 290 other assertions pass.

- item: Remove the gate from the two Codex routing skeletons, regenerate only their six skill surfaces, and update directly coupled Codex documentation.
  status: done
  dispatched: self; edits will land in the two routing skeletons, their six generated Codex skills, README.md, docs/conventions.md, and CHANGELOG.md on workflow/issue-926
  result: The bounded gate regions are gone from both skeletons and only the six intended Codex skills changed when all 18 surfaces were rendered. README, API, architecture, conventions, D-687-01, and Unreleased changelog now put readiness at install/upgrade, retain explicit doctor diagnostics, and state that ordinary sessions do not recertify profile/config bytes. Focused validation is green: route reachability 298 assertions, generated-surface parity 18/18, install-model rendering, eight-surface absence, and eight-surface model-routing presence.

- item: Prove the focused contracts, installer/doctor behavior, full walkthrough, and complete project test suite with no non-Codex behavior delta.
  status: done
  dispatched: self; validation output will be recorded in this mission result and the issue-926 chain receipt
  result: Codex contract validation and the Codex walkthrough passed; npm test completed the Claude, Codex, GitLab, and Gitea chains through each final generated-surface check; the full unsharded walkthrough passed 202/202 scenarios with 2,145 simulated spawns and exit 0. The explicit doctor remains callable and read-only, reporting the observed user managed_block_drift as stale/exit 1 without blocking the workflow. The diff is exactly 15 intended paths, with zero installer, preflight-script, workflow-init, command, or other non-Codex surface changes; git diff --check passes.

- item: Finalize issue 926 through review, documentation docking, issue closure, roadmap reconciliation, archive, sink, commit, and push.
  status: done
  dispatched: self applying kaola-workflow-finalize; review, documentation docking, chain receipt, closure, archive, sink, commit, and push results will land in the run folder and repository history
  result: Acceptance passed with no deferred work; review and documentation are DOCKED; all four candidate-bound chains are green; gap sweep found no class; implementation commit 17296a65 is ready; finalization-summary.md is the durable locator that the finalize and merge-sink transactions will append and archive.
