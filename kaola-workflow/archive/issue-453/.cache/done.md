evidence-binding: done 796d31e6c071

finalize sink node (role: finalize — not a dispatchable subagent; main-session-direct phase-6 bookkeeping). Declared write set: CHANGELOG.md (the [Unreleased] ### Removed entry was authored by the docs node; no additional finalize-time write required at the node level).

Phase-6 proof gathered before this close (the real git sink follows, post-allDone):
- FINAL VALIDATION — 4-chain #307 cross-edition gate GREEN: node scripts/kaola-workflow-run-chains.js --json → {"result":"pass","failed":[]}. Per-chain (.cache/chain-receipt.json, all exitCode:0, none accepted_red): claude 0 (153.0s), codex 0 (8.4s), gitlab 0 (70.0s), gitea 0 (50.8s). HEAD 2fe52e71.
- ACCEPTANCE — all 8 nodes complete; G1 review verdict:pass findings_blocking:0; adversarial-verifier verdict:pass (12-vector disproof attempt failed to break any wall, all 4 editions). The headline AC (a >6-file exact node freezes in-grammar) is asserted by the flipped A2 walkthrough fixture; every other write-safety wall confirmed intact.
- DOC DOCKING — docs node rescoped docs/api.md (grammar + #381/#431/agent-registration cross-refs) + added the CHANGELOG [Unreleased] ### Removed entry; docs/architecture.md + README.md confirmed no-impact (no FILE_CEILING; README's six-file mention already fast-path-only); planner profile (.md + 3 .toml) + 3 adapt SKILL packs rescoped to the semantic-grouping rubric. DOCKED.
- KNOWN DEFERRED (gap-sweep): scripts/kaola-workflow-classifier.js (×4) carries a COMMENT-only FILE_CEILING mention with zero functional coupling; out of every frozen node write set → captured as a justified gap (no functional impact; the classifier's token-counting G1/G2 rationale is unaffected).

main-session-direct.
