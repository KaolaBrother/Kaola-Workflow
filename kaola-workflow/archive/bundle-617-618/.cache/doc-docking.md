evidence-binding: doc-docking (main-session, no nonce required for this record)

# Documentation Docking — bundle-617-618 (#617, #618)

## Changed files reviewed
- scripts/kaola-workflow-sink-merge.js (+ 3 edition ports) — SINK_STEPS reorder, closure-step ancestor gate
- scripts/kaola-workflow-claim.js (+ 3 edition ports) — mergeLaneDeferred, checkClosureInvariants wiring, verify-sink subcommand
- scripts/kaola-workflow-closure-contract.js (+ 3 edition ports) — invariant declaration (unchanged shape, now evaluated)
- scripts/kaola-workflow-run-chains.js (+ 3 edition ports) — signal-kill exitCode fail-closed mapping (sync+async)
- scripts/kaola-workflow-plan-validator.js (+ 3 edition ports) — chains_empty typed refusal
- package.json — test-run-chains.js wired into claude chain
- scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-{gitlab,gitea}/scripts/test-{gitlab,gitea}-sinks.js — stale push_main:'pending' assertion flipped to 'done' (mechanical consequence of the reorder)
- scripts/test-bundle-finalize.js, scripts/test-run-chains.js — new/extended test coverage

## Documents checked
- docs/decisions/D-617-01.md — NEW ADR, covers all five fix arms (close deferral, ancestor invariant, verify-sink, SINK_STEPS reorder, chain-receipt fail-closed). Present, grounded in the actual diff (written by n5-docs, verified by n3-review/n4-adversary review of the same commit).
- docs/workflow-state-contract.md — updated: chain-receipt.json fail-closed note + remote_closed_after_publish field / closure-last reorder note. Present, fits existing section structure.
- CHANGELOG.md — [Unreleased] entry added (n6-finalize), cites D-617-01.md and #617/#618.
- README.md — no public feature/usage/env-var surface changed; no edit needed.
- docs/api.md — no external API/endpoint changed (internal workflow scripts only); no edit needed.
- docs/architecture.md — no structural change (bug fixes to existing sink/chain logic, no new components); no edit needed.
- .env.example — no new environment variables introduced; no edit needed.

## Gaps found and fixed
None. All substantive documentation (decision record, state-contract, changelog) landed via n5-docs + n6-finalize before this docking check ran.

## Follow-ups filed (run-discovered defects, captured per the completion contract)
- #631 (verify-sink rebase-stale branch_head false-alarm) — filed, non-blocking, advisory-only tool.
- #632 (release.js chainReceiptGreenness still fails open on chains:[]/missing) — filed, non-blocking, informational-only today.
- #633 (lane-group synthesizer merge collision on untracked-vs-tracked evidence file) — filed, scheduler automation gap hit and manually worked around during this run.

## Final verdict: DOCKED
