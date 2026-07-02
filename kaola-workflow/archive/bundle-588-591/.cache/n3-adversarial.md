evidence-binding: n3-adversarial cedd99611aaf
verdict: pass

NOT-REFUTED (high confidence) — change-gate adversarial verification of the bundle-588-591 implementation; all six disproof avenues failed, each independently reproduced.

1. Serial/read byte-identity: buildDispatch attaches leg_path/leg_branch conditionally (goal_line pattern), guarded ctx.leg_path != null && trim() !== ''; other buildDispatch call sites (orient/open-next :1859, close-and-open-next :2331) pass no leg fields; legs only populated inside the >=2 write co-open branch (groupForm) -> reads/serial always omit the keys. Independently reproduced with KAOLA_PARALLEL_WRITES=0: zero leg-* keys in the serial payload.
2. leg_path member-own correctness: real-git 2-leg co-open — A.dispatch.leg_path -> .../A, B -> .../B, branches kw/legs/proj/{A,B}, A !== B; legs[n.id] and dispatch keyed by the same n.id (alignment by construction); legPathFor/legBranchFor embed the id.
3. #588 cap fix all branches: maxConcurrent = groupForm ? laneGroupCeiling : read-cap; laneGroupCeiling assigned atomically with groupForm (write-group branch only, never null when groupForm); read/serial max_concurrent unchanged (no read regression); real write group records max_concurrent: 4. Stale pre-fix manifest (8) reconciled by new code provably harmless (keptAll bounded by <=4 present members).
4. Test honesty / prose-vs-code: (a)-(d) assert durable artifacts (ledger, running-set.json, worktree/branch existence, rev-list --parents octopus counts, diff-tree vs declared union); (b) deterministically pins max_concurrent===4 (its RED caught the 8-bug); (c)'s reads-open/writes-defer (write_awaits_drain) is CONSISTENT with the six surfaces — "co-open BY DEFAULT" is scoped to pure >=2 write frontiers and the card lists write_awaits_drain; no surface promises read||write co-scheduling.
5. Six-surface consistency: changed regions byte-identical across all six (added-line shasum 8224019a...); zero residual laneGroup cross-reference instructions; zero provenance tokens on prompt surfaces; all four aggregator copies carry the changes; edition-sync --check 10 ports parity.
6. Suites (real exit codes): test-adaptive-node 1219 exit 0; test-next-action 97 exit 0; walkthrough exit 0; validate-script-sync exit 0; edition-sync --check exit 0; route-reachability 185 exit 0.

Residual notes (non-blocking): stale-8-manifest cross-version reconcile not directly tested but provably harmless; gitlab/gitea npm chains deferred to the finalize four-chain gate (ports byte-parity-verified, syntax-valid).
