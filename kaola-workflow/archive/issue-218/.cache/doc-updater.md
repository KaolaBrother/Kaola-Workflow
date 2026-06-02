# doc-updater — issue-218 (model: sonnet)

## CHANGELOG.md — UPDATED
Added one entry under `## [Unreleased]` → `### Fixed` (top), house style, naming the
two changed port files, the before/after behavior, the new reason strings
(`glab issue state unverified` / `tea issue state unverified`), root+Codex unchanged,
and the six new regression tests. "No version bump."

## Per-checklist verdicts (with evidence)
- README.md — NO CHANGE. grep for unavailable/probeIssueState/fail-closed → only unrelated hits (Codex local-fallback-tool-unavailable :378, KAOLA_WORKFLOW_OFFLINE/target_unavailable env table :552, python3 unavailable :728). #218 brings ports into conformance with already-documented behavior.
- docs/api.md — NO CHANGE. :15 enumerates probeIssueState returns generically as open/closed/unavailable across "all three forge editions" — the spec the ports violated; fix makes reality conform. Only documented reason string is 'timeout' (:32); new '... issue state unverified' strings are implementation-level, not an enumerated contract.
- docs/workflow-state-contract.md — NO CHANGE. No probe.state contract / reason enumeration (only delegation_policy/tool-unavailable hits).
- .env.example — NO CHANGE. KAOLA_GLAB_MOCK_SCRIPT/KAOLA_TEA_MOCK_SCRIPT already present (:40-41, from #191); no new vars in diff.
- Architecture docs — NO CHANGE. Behavioral correction to existing helper; no new modules/data flows.
- Inline comments — NO public-interface change. Diff adds only test-internal comments.

No BLOCK lines — all verdicts evidence-backed.
