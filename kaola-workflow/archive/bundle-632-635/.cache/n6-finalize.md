evidence-binding: n6-finalize 3c9fb433ec0c

# Finalize sink — n6-finalize (bundle-632-635)

Terminal sink (main-session-direct). Phase-6 work as evidence:
- 4 gates re-verified (headSha 755f5757): resume/gate/barrier/verdict all pass.
- CHANGELOG.md entry written; docs committed 755f5757 (D-632-01 + CHANGELOG). Code already committed via lane-group synthesizer (cfd7b0de).
- UNWAIVED four-chain receipt: all 4 chains exit 0, accepted_red=false — first unwaived receipt of the session (proof #635's flake fix landed). --finalize-check pass.
- gap-sweep --check pass: 0 mapped, 0 filed, 0 noise (empty — no deferred_red_chain since unwaived).
- doc-docking.md + finalization-summary.md written.
- #633 lane-group fix validated in production (group_passed, no manual pre-seed).

compliance: main-session-direct

Closes #632, #635 (all-or-nothing). Proceeding to contractor archive + sink-merge.
