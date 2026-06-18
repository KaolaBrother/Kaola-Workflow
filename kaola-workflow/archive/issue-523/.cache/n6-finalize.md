evidence-binding: n6-finalize f591fce97eed

## Finalize sink — main-session-direct

Compliance: main-session-direct (the finalize sink is non-delegable).
Deliverable written: `docs/decisions/D-523-01.md` (the only sink write; docs/decision-only, zero code blast radius).

AC#1 (profile breakdown): #16 `test-adaptive-node.js` ~122s + #37 `simulate-workflow-walkthrough.js` ~160s = ~75% of the chain; remaining ~25% spread across 34 mostly-cheap validators. 358s-measured vs 574s-reference gap = load jitter; structural ranking is load-invariant.

AC#2 (decision): genuine suite growth — no safe behavior-preserving reduction. H1 (spawn-count) REFUTED, H2 (avoidable redundancy) REFUTED, H3 (irreducible #292 anti-false-green coverage) CONFIRMED. Cross-command parallelism rejected for #523 (net-negative under accuracy precedence #1).

Recommended next step: close #523 on the documented-growth decision; no D-523-02 build run. Resolves the #512-deferred diagnosis (D-512-01).
