evidence-binding: n7-review 87a259d42c82
verdict: pass
findings_blocking: 0

finding: id=R2 scope=in_scope action=fix status=resolved severity=low fix_role=implementer rationale=repo-only templates/axioms.md pointer removed from all consumer surfaces; consumer CLAUDE.md block is now the sole referent with tie-breaker + tighten-only retained
finding: id=R3 scope=in_scope action=fix status=resolved severity=low fix_role=implementer rationale=post-render "this placeholder" dangling prose reworded to "The model above is resolved at install time; the router does not substitute it" — coherent pre- and post-render

## Both nits VERIFIED FIXED at HEAD c4ae5c43 (2nd re-review)
1. R2 (dead pointer): grepped commands/, all plugins/*/commands/, plugins/*/skills/, agents/ — zero templates/axioms mentions remain on any prompt surface. Reworded pointer names only "the ## First Principles block in your project's workflow-init CLAUDE.md" and RETAINS tie-breaker (priority order + optional .cache derivation, never blocks a gate) + tighten-only ("never cite one to skip a typed gate, refusal, or barrier") in all 6 next surfaces. templates/axioms.md still exists (route-reachability existence pin + walkthrough byte-identity guard both green) — canonical file now enforced by the drift guard, not name-dropped at consumers.
2. obs1: zero "this placeholder" on any command/skill surface; new sentence correct post-render; new A27 command-surface guard pins the phrase absent on commands/workflow-next.md.
3. No R1 re-mangle: regenerated .opencode (sync --write exit 0); scout paragraph clean opencode-true rewrite; full-tree residue scan zero for empty span, "resolved at install time", "does not substitute", ISSUE_SCOUT_MODEL, templates/axioms. Re-anchored rewrite regex (sync-opencode-edition.js:360-363) fires on the reworded canonical paragraph; A27 negatives RED 3/3 on a reconstructed mangle — load-bearing, fail-closed.
4. Guards re-run green (real exit): test-opencode-edition (517), generate-routing-surfaces --check (12/12), test-route-reachability (333; 6/6 + 3/3; both required-blocks tokens still match), test-install-model-rendering (placeholder renders; manifest tiers hold), all 4 contract validators, validate-script-sync, simulate-workflow-walkthrough (REAL-EXIT=0; testAxiomBlockByteIdentity PASSED).

## Non-finding (pre-existing, not this bundle)
Running plugins/kaola-workflow/scripts/validate-workflow-contracts.js IN PLACE exits 1 (commands/kaola-workflow-phase1.md missing) — resolves paths against the plugin tree; IDENTICAL failure at base c4fff957 (verified via clean archive extraction). It is a distribution byte-mirror (byte-identity enforced by validate-script-sync, green), not a runnable entry point; the codex chain's actual validator scripts/validate-kaola-workflow-contracts.js is green. No action.
Downstream: #307 four-chain sequential gate owed before finalize.
