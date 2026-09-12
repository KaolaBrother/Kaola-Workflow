# Complete #1065–#1067 through minimal subtraction and verified archive identity repair

- item: Repair #1067 same-name historical archive handling across finalize mirroring, sink own-archive/journal routing, and scoped closure audit, with reproducing regression tests and preserved crash-resume/foreign-work protection.
  status: done
  dispatched: archive_fix subagent owns canonical claim/sink/closure-audit and regression tests in .kw/worktrees/bundle-1065-1066-1067; handback source diff and actual failing/passing regression commands to this thread.
  result: Canonical and all three forge editions fixed at bb4b7e6f. Parent reviewed claim/sink/audit diff and rejected timestamp-newest selection; exact claim/receipt authority retained. Four-edition regression passed 84 checks, including linked crash resume, suffix journal/audit, divergent foreign work and symlink controls. Native sink/walkthrough and registry suites passed; evidence in /Users/ylpromax5/Documents/Codex/issue-1062-validation/1067-regression-evidence.

- item: Remove #1066 unused command model-placeholder rendering while preserving command installation and verifying shipped command bytes.
  status: done
  dispatched: self; install.sh deletion and shipped-command byte-equivalence evidence in .kw/worktrees/bundle-1065-1066-1067 and /Users/ylpromax5/Documents/Codex/issue-1062-validation.
  result: install.sh removes the unused extractor/resolver/placeholder loop, preserving agent_source_file (still used) and command install via cp. Baseline renderer output equals source bytes for all 9 shipped command files. bash -n, test-install-model-rendering.js and test-install-upgrade-rewrite.js exit 0; logs saved under /Users/ylpromax5/Documents/Codex/issue-1062-validation/1066-*.log. No tests removed. README/API/CHANGELOG docking is in the documentation mission.

- item: Resolve #1065 evidence overclaims and clarify actual dispatch versus outcome evidence using existing documentation, without new gates or record fields. Dock all user-visible changes in current docs.
  status: done
  dispatched: self; #1065 evidence correction on forge and current docs in the bundle worktree; existing dispatch contract remains sufficient, no new gating surface.
  result: #1065 correction comments 5646286996 and 5646351712 distinguish retained historical summary from unavailable raw exports, real tool dispatch from simulated prose, and child result from model telemetry. Fresh Fusion sidekick event proves a native child read; child model remains unknown. README, API, architecture, Devin edition, docs index and CHANGELOG dock all bundle behavior at bb4b7e6f. No gate or run-record field added.

- item: Review the integrated candidate and run affected suites plus required cross-forge validation and walkthrough, establishing readiness for finalization.
  status: done
  dispatched: self; frozen bb4b7e6f producer chains in worktree, /Users/ylpromax5/Documents/Codex/issue-1062-validation/bundle-final-chains.log; generator/parity checks and additive suites already passed.
  result: bb4b7e6f chain FAILED twice on real gaps, each repaired surgically and re-frozen: 0be4de1a restores the required "native routes" phrase in the Devin adapter wording (test-runtime-agent-architecture A10-delegation/adapter[devin]) and commits the pending docs/runtime-capabilities.md live-schema correction; a153c215 converts test-issue-1067-archive-identity.js from a self-respawn per edition to an in-process loop (spawn-classification ceiling 0, 21 checks x 4 editions unchanged). Final candidate a153c215: run-chains all-four claude/codex/gitlab/gitea exit 0, 53 claude steps, receipt kaola-workflow/bundle-1065-1066-1067/.cache/chain-receipt.json bound headSha a153c215 workTreeHash clean; simulate-workflow-walkthrough.js 178/178 passed. Failed-run logs: bundle-final-chains.log (bb4b7e6f), bundle-final-chains-0be4de1a.log; the a153c215 stdout logs were not persisted, the receipt is the artifact of record. Ready for finalization.
