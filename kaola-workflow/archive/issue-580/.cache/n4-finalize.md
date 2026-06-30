evidence-binding: n4-finalize 803294a63d31
## n4-finalize — main-session-direct

Wrote the CHANGELOG.md [Unreleased] ### Added entry for #580 (SHARED_STATE_FIELDS forge active-folders parity contract), above the #579 entry. CHANGELOG.md is the sole file in this node's declared write set; written before the four-chain validation run so the chain receipt covers the chain-asserted CHANGELOG (no chains_stale).

Sink: merge, run_posture: worktree. Proceeding to: barrier prerequisite -> run-chains (HEAD-matched receipt) -> gap-sweep -> finalization-summary -> contractor cmdFinalize --keep-worktree -> sink-merge --sink.
