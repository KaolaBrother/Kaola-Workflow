evidence-binding: n1-routing-integration cd37ab2c55e3
RED: After adding R25 regression cases, `node scripts/test-adaptive-node.js` failed all four required provisional-close combinations: `close-node` ordinary retry, `close-node` crash retry, `close-and-open-next` ordinary retry, and `close-and-open-next` crash retry. Each failure proved the non-last fan-out member lacked exactly one compliance row, close timing, and generation-bound close provenance entry.
GREEN: `node scripts/test-adaptive-node.js` passes 2038 assertions. R25 now proves both public close commands preserve the provisional result while recording exactly one compliance row, one close timing, and one nonce-bound provenance entry across ordinary repeated close and a simulated crash immediately after the durable plan/compliance write.

failed_review_attempt: n2-full-integration-review:1
failed_review_gate: n2-full-integration-review

repair_finding: R1 fanout-provisional-close-skips-compliance-and-provenance
execution_mode: main-session-inline-user-directed
implementation:
- Added shared `addCloseCompliance` and `appendCloseSidecarsOnce` helpers and routed provisional plus ordinary close bookkeeping through them.
- A provisional fan-out close durably writes ledger+compliance, repairs timing/provenance idempotently, then removes the running member. An unchanged retry completes any missing prefix without duplication.
- Close timing appends only while the node's latest timing state is open; a later legitimate reopen creates a new open generation. Close provenance deduplicates by `(event, nodeId, nonce)`.
- Bare `code-reviewer`/`security-reviewer` rows use their evidence binding to distinguish same-role fan-out members; legacy unbound rows retain backward-compatible role-level behavior.
- Propagated the canonical runtime to Codex, GitLab, and Gitea with `edition-sync --write`; no scheduler state, automatic owner selection, second repair state machine, or R17 behavior was added.

validation:
- `node --check` on all four adaptive-node runtime copies: pass.
- `node scripts/test-adaptive-node.js`: pass, 2038 assertions.
- `node scripts/generate-routing-surfaces.js --check`: pass, all 12 surfaces byte-match.
- generator self-test: 33 assertions; route reachability: 578 assertions; profile parity: 96 assertions; edition-sync tests: 41 assertions.
- edition sync and script sync: pass; root Claude/Codex and GitLab/Gitea contract validators: pass.
- `node scripts/simulate-workflow-walkthrough.js`: pass.
- `git diff --check 5d749661`: pass.
- Full four-chain `npm test` remains assigned to n3.
