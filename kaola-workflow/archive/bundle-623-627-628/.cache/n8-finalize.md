evidence-binding: n8-finalize 850efd567ffb
node: n8-finalize
role: finalize (main-session-direct, non-delegable sink)
compliance: main-session-direct

## Finalize sequence — bundle-623-627-628 (#623, #627, #628)

Terminal sink node. Ran the Phase-6 finalize choreography directly (not delegated).

### Script-enforced barrier (4 gates, headSha 45be0011)
- --resume-check: pass (plan_hash integrity + structure + closed library)
- --gate-verify: pass (n5-review + n6-adversary post-dominate every code node, both complete)
- --barrier-check: pass (0 errors, 0 unattributed — docs/** allowband absorbed the R1 out-of-write-set README edit)
- --verdict-check: pass (n5 + n6 both verdict:pass, findings_blocking:0; R1 finding marked status=resolved after the in-run fix)

### Chain-receipt gate (self-host, UNWAIVED)
- Four chains via kaola-workflow-run-chains.js: claude/codex/gitlab/gitea ALL exit 0, accepted_red=false.
- NO `--accept-known-red …:635` waiver — #635 is fixed (main 73ca26db); this is the SECOND consecutive
  genuinely-green unwaived receipt this session.
- headSha 45be0011 == HEAD; --finalize-check: pass.

### Run-gap sweep
- gap-sweep --project → run-gaps.json sweptClasses: [] (empty). --check: clean (exit 0).
- No in_run_repair (R1 was a main-session Trivial-Inline-Edit, not a reopen-node), no deferred_red_chain
  (unwaived receipt), no manual class.
- Goal-contract capture (recorded in finalization-summary ## Run gaps): #627 fix#2 deferred → filed: #636;
  R1 → noise: resolved-in-run-trivial-inline-edit.

### Deliverables
- doc-docking.md: clean — every behavioral-adjacent change reflected in an ADR + CHANGELOG.
- finalization-summary.md: written (path, gates, #633 3-member validation, run gaps, impl commits).
- CHANGELOG [Unreleased]: #623/#627/#628 routing-surface prose cluster entry.
- ADRs: D-623-01 (rolling-topup honesty), D-627-01 (debloat + fix#2 descope).
- Follow-up: #636 filed (fix#2 cross-runtime pin single-sourcing) + .roadmap/issue-636.md staged.

### Production validation
- #633 lane-group fix VALIDATED on a 3-member group: n1∥n2∥n3 legs merged via synthesizer (102b3411
  kw-synth 3-way octopus) to barrier: group_passed, synthesized:true — no conflict, no manual pre-seed.

### Implementation commits
- e661d2b8 / 36eb8ece (legs) + 102b3411 (kw-synth) — n1/n2/n3 debloat.
- 3464da53 — n4 planner top-up + README R1 fix.
- 45be0011 — D-623-01/D-627-01 ADRs + CHANGELOG.

goal_check: satisfied (KAOLA_GOAL set — standing session goal)
verdict: pass
findings_blocking: 0
