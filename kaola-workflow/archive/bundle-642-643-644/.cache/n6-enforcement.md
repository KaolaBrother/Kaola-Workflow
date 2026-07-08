evidence-binding: n6-enforcement 5d12c6fd52f3
upstream_read: n1-architect 416c5fde30b3

# n6-enforcement (tdd-guide) — REOPEN: fail-closed manifest guard (gate nit R3)

Prior gate-reviewed scope STANDS unchanged (the n8-cr-surface gate verified the walls clean,
mutation-proven): future-agent wall in validate-vendored-agents.js, .toml needle mirrors in the
three plugin contract validators, command-prose pins in validate-workflow-contracts.js (+ codex
twin), and T16 node-briefs-relay pins + stale-enumeration grep-refusal in
test-route-reachability.js. This reopen adds ONLY the fail-closed manifest guard: an agent .md
with NO tools: front-matter line previously defaulted to read-kind (fail-open toward the weaker
needle — a tool-less agent inherits ALL tools at runtime, de-facto write-capable); now it draws
the typed refusal `agent_contract_manifest_missing`, in the wall AND in all three .toml mirror
blocks (checked first per dispatch: they shared the identical inline `tm ? ... : false`
derivation gap, since their kind derives from the canonical root .md manifest).

RED: pre-fix $TMPDIR harness (wall-manifest-redfirst.js) — a fixture agent .md with NO tools: line, carrying the READ needles + a 2-token registry row, PASSED the wall silently as read-kind: "FAIL-OPEN: tool-less agent PASSED the wall as read-kind (no typed refusal) — the R3 hole" / "MANIFEST GUARD TEST FAILED (fail-open present)" exit 1 (captured before any edit).
GREEN: post-fix the same fixture draws "TYPED-REFUSAL-OK: agent_contract_manifest_missing: node-role agent \"toolless-agent\" declares no tools: front-matter line — a tool-less agent inherits ALL tools (de-facto write-capable), so its evidence kind cannot be derived; declare the tool manifest" / "MANIFEST GUARD TEST PASSED (fail-closed)" exit 0; the full original 6-case wall harness re-run against the parent worktree stays green (2 fixture REDs + 2 real-agent mutation REDs + 2 GREENs — "SCRATCH WALL TEST PASSED" exit 0); live wall green (all 16 real agents declare tools:) — 1 manifest-guard assertion RED→GREEN, 6/6 prior harness cases still green.

## Fix detail
- `scripts/validate-vendored-agents.js`: `agentWritesEvidence` now returns null (not false) when
  the front matter has no `tools:` line; `checkFutureAgentWall` refuses
  `agent_contract_manifest_missing` on null instead of falling through to the read-kind needle.
- `scripts/validate-kaola-workflow-contracts.js`,
  `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`,
  `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`: the .toml
  mirror blocks derive kind from the canonical root agents/<role>.md manifest and shared the same
  `const writeKind = tm ? ... : false` fail-open — each now asserts `tm` with the same typed
  `agent_contract_manifest_missing` reason before deriving.
- NOT touched this reopen: `scripts/validate-workflow-contracts.js`, its codex twin (confirmed
  still byte-identical via diff -q), `scripts/test-route-reachability.js`. No edition-sync needed.
- No issue refs / decision IDs in any needle string or comment.

## Files changed this reopen (git diff --stat vs fresh baseline — all inside the declared write set)
- scripts/validate-vendored-agents.js                                        (+13/-4)
- scripts/validate-kaola-workflow-contracts.js                               (+5/-1)
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js (+5/-1)
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js   (+5/-1)

## Verification commands + exit codes (cwd .kw/worktrees/bundle-642-643-644)
1. PRE-fix: `node $SCRATCH/wall-manifest-redfirst.js` -> "MANIFEST GUARD TEST FAILED (fail-open present)" exit 1 (the RED).
2. POST-fix: `node $SCRATCH/wall-manifest-redfirst.js` -> "MANIFEST GUARD TEST PASSED (fail-closed)" exit 0.
3. POST-fix: `node $SCRATCH/wall-redfirst-wt.js` (original 6-case harness repointed at the parent worktree) -> "SCRATCH WALL TEST PASSED" exit 0.
4. `node scripts/validate-vendored-agents.js` -> "Vendored agent validation passed for 16 agents" exit 0.
5. `node scripts/test-route-reachability.js` -> "Route-reachability test passed (329 assertions)." exit 0 — n5's addition of security-reviewer to the read-gate example list on all six surfaces does NOT affect the T16 pins (verified green; the pinned literals are the anchor/relay/resume/manifest-sentence, not the example roster).
6. `node scripts/validate-kaola-workflow-contracts.js` -> "Kaola-Workflow Codex contract validation passed" exit 0.
7. `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` -> "Kaola-Workflow GitLab contract validation passed" exit 0.
8. `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` -> "Kaola-Workflow Gitea contract validation passed" exit 0.
9. `node scripts/validate-workflow-contracts.js` -> "Workflow contract validation passed" exit 0; `diff -q` root vs codex twin -> IDENTICAL (untouched this reopen).

## Prior-run record (leg n6-enforcement, nonce 06a8f01d4196, gate-verified clean)
Original deliverables: future-agent wall (registry >=2 tokens OR empty PRESENCE_ONLY_RATIONALE;
manifest-derived role-kind needles: write-kind SELF-WRITE+evidence-binding / read-kind
RETURN+record-evidence), .toml mirrors (read-kind .toml needle = /RETURN/i + /orchestrator
persists/i common denominator across producer and gate profiles), command-prose pins + stale
**READ-ONLY roles** / **WRITE-role agents** grep-refusal, T16 x6-surface node-briefs-relay pins
(287 -> 329 assertions). The walkthrough #433(5) doc-updater expect-map note handed to n3 in the
prior evidence is resolved upstream (verified in this tree: simulate-workflow-walkthrough.js:3432
now expects ['evidence-binding','docs_updated']).
