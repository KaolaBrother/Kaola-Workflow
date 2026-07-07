evidence-binding: n9-finalize c513e4522bdf
node: n9-finalize
role: finalize (main-session-direct sink)
compliance: main-session-direct

## Finalize — issue-630 (two-layer routing-surface generation seam)

Second build off the 2026-07-08 routing-generation-seam shaping design; completes the #630/#636 arc.

### Script-enforced barrier (4 gates, headSha 9f864b47)
- --resume-check: pass
- --gate-verify: pass (n6-review + n7-adversary post-dominate the 4 code nodes n2/n3/n4/n5, all complete)
- --barrier-check: pass (0 errors, 0 unattributed; 12-file impl+docs attributed; 12 routing surfaces byte-unchanged)
- --verdict-check: pass (n6-review verdict:pass + n7-adversary verdict:pass — n7 is the CHANGE-gate, covered)

### Chain-receipt gate (self-host, UNWAIVED)
- kaola-workflow-run-chains.js --project issue-630: claude/codex/gitlab/gitea ALL exit 0, accepted_red=false.
- NO waiver (#635 fixed). headSha 9f864b47 == HEAD. --finalize-check: pass.

### Run-gap sweep
- gap-sweep run-gaps.json sweptClasses: [] (empty); --check clean.
- No in_run_repair (all nodes passed first-try, no reopen), no deferred_red_chain (unwaived), no manual class.
- Goal-contract capture (finalization-summary ## Run gaps): R1 (n7 residual) → filed: #637; n6 R1/R2 → noise.

### The guarantee — LIVE-PROVEN by BOTH gates
- n6-review: planted --verdict-check drop on a finalize SKILL → test-route-reachability.js EXIT 1 (manifest
  missing-token); restored byte-identical. #624 whole-block-drop class closed.
- n7-adversary (change-gate): 8 planted drifts ALL red through the correct layer; repo byte-clean. P4 — an
  unpinned-prose mutation on a generated surface kept reachability + validator GREEN but redded --check
  (the old-regime-invisible drift class, now caught). P2 whole-block drop reds on manifest AND legacy T6.

### Deliverables
- Layer-1 manifest (18 blocks) + derived checker + 6-case red-proof + superset proof + orphan-sentinel.
- Layer-2 generator + skeletons/slots/rename-table + engine self-test (33 assertions); --check in all 4 chains.
- The 12 plan-run/next surfaces BYTE-UNCHANGED (behavior-preserving no-op capture).
- docs/decisions/D-630-01.md, docs/conventions.md § Routing/adaptive, CHANGELOG [Unreleased] ### Added #630.
- doc-docking.md: clean. finalization-summary.md: written.
- R1 hardening residual filed as #637 (fn-closure-audit distinctive-interior-token).

### Implementation commit
- 9f864b47 feat(routing): #630 two-layer routing-surface generation seam — 12 files (surfaces byte-unchanged).

goal_check: satisfied (KAOLA_GOAL set)
verdict: pass
findings_blocking: 0
