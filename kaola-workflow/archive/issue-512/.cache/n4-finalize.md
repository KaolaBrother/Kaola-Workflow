evidence-binding: n4-finalize 081f258c3132

finalize sink — main-session-direct (non-delegable per plan-run contract).

CHANGELOG.md: added the #512 entry under [Unreleased] ### Fixed — parameterized
run-chains spawnSync timeout via KAOLA_RUN_CHAINS_TIMEOUT_MS (default raised
600000 → 900000), resolveTimeoutMs(env) helper, receipt schema unchanged, all
four editions in lockstep, deferred speed-up rationale (D-512-01).

Write set: CHANGELOG.md (only). No code on the sink node.

Mechanical packing (doc-docking, finalization-summary, roadmap closure, archive,
commit) delegated to the contractor; chain receipt + sink-merge driven by the
orchestrator (Step 9).
