evidence-binding: n1-receipt-diet 8176ed345212
<!-- RED: paste RED here -->
RED: node scripts/test-run-chains.js — 9 new Phase-B assertions fail pre-impl (175 pre-existing pass): T32 "chains[0].steps has 2 decomposed step entries" got undefined (no B0 step decomposition); T33 "claude-only diff selects the claude chain ONLY" got "claude,codex,gitlab,gitea" + scope.decision undefined (no B1 diff-scope); T34 scope.decision/touchedEditionPaths/base all undefined; T35 "hoisted shared step A.js executed EXACTLY once" got 4 + preamble undefined (no B2 hoist); T37 scope base-unresolved reason undefined (no fail-closed scope).
<!-- GREEN: paste GREEN here -->
GREEN: node scripts/test-run-chains.js — 186 assertions pass (T32 per-step steps[] decomposition; T33 claude-only diff -> chains=[claude] + scope.decision=claude-only; T34 edition diff -> all-four + touchedEditionPaths + base recorded; T35 hoisted shared step A.js runs EXACTLY once via receipt.preamble; T36 bare run stays full four-chain; T37 unresolved base fails closed to all-four). Forge ports: gitlab 26 + gitea 26 (G4 per-step timings, G5 claude-only scope, G6 all-four scope). simulate-workflow-walkthrough.js passed. validate-script-sync + edition-sync --check green (4 run-chains editions in parity). All four npm chains PASS (claude/codex/gitlab/gitea). Real-chain end-to-end: run-chains --project issue-725 auto-selected all-four (scope.decision=all-four, reason=edition_coupling) and all four green via the decomposed path.

## BEFORE / AFTER measurements (clean, serial, 10-core host)

Per-chain wall-clock (authoritative `npm run test:kaola-workflow:<edition>`, serial, nothing else running):

| chain  | duration | share |
|--------|----------|-------|
| claude | 696.5 s  | 80.0% |
| codex  |  17.2 s  |  2.0% |
| gitlab |  79.8 s  |  9.2% |
| gitea  |  76.8 s  |  8.8% |
| **all-four serial (sum)** | **870.3 s** | 100% |

- **BEFORE** all-four serial = **870.3 s**; all-four concurrent (this 10-core host, pool 4) ≈ max = **~696.5 s** (claude is the bottleneck).
- **AFTER (common case) claude-only** = **696.5 s** (npm) / 677.7 s (decomposed path, agrees within variance).
  - **Common-case cut = (870.3 − 696.5) / 870.3 = 20.0% (serial); ≈ 0% (concurrent).**  ← does NOT meet the >=50% AC-B target.
- **AFTER all-four (decomposed + B2 hoist, serial)** = 840.0 s (claude 677.5 + codex 16.0 + gitlab 74.5 + gitea 71.7 + preamble 0.32). B2 dedup of the 5 shared validators (validate-script-sync/validate-vendored-agents/field-parity/routing-check/edition-sync --check, 324 ms combined) saves ≈ **0.6 s** — negligible, because the shared steps are trivial validators; the real cost is the (unshared) walkthroughs.

## AC-B verdict (instrument-first, per B0's own mandate)

**AC-B (>=50% common-case cut) is NOT met by the specified B0–B3 design.** Root cause: the CLAUDE chain is ~80% of the all-four cost (its ~40 `&&`-joined test steps + the 4700-line walkthrough), so B1 (drop the forge chains on a non-edition diff) can only remove the ~20% the forge chains contribute; B2 (hoist) saves ~0.6 s; B3 (cross-chain concurrency) does not reduce the claude bottleneck. Reaching >=50% requires cutting the CLAUDE chain itself — intra-claude-chain step parallelism (run its mostly-independent steps concurrently) or splitting `test:kaola-workflow:claude` in package.json. Both are OUTSIDE the specified B0–B3 design AND this node's run-chains-only write set; intra-chain parallelism also carries a correctness risk (step mutual-independence must be proven or the finalize gate flakes — axiom 1). Escalated to the orchestrator/planner as a design gap, not implemented unilaterally.

Tie-breaker derivation (First Principles): axiom 1 (Correct first) + axiom 4 (escalate value/risk calls) → do NOT trade finalize-gate correctness for the speed target by asserting an unproven intra-chain step independence; report the measured gap and let the human/planner decide scope.

## Decisions

- **B0 (step decomposition + per-step timing): implemented.** Real chains parsed READ-ONLY from package.json (split on `&&`); each step runs `sh -c "<step>"` and is recorded as {command, duration_ms, exitCode} in chains[].steps[]. A MOCKED / single-command chain reduces to one step → every pre-#725 mock-based test path is byte-unchanged (all 186 canonical assertions pass).
- **B1 (diff-scoped selection): implemented.** Auto-scopes ONLY in finalize context (--project/--plan, no --chains/--mock); the bare release path is left unscoped so release.js's all-four receipt is untouched (T36). Edition-coupling rule is self-contained (no cross-script import a forge port couldn't resolve): plugins/ prefix, package.json, forge-chain-referenced scripts, or a root scripts/ file mirrored into the codex tree (filesystem existence). Fail-closed to all-four on an unresolved base/diff (T37).
- **B2 (hoist repeats): implemented** but the measured saving is ~0.6 s (the shared steps are trivial validators). Kept — it is correct and additive, and larger future shared steps would benefit.
- **B3 (parallel forge chains): KEPT.** The existing core-gated concurrency + per-chain TMPDIR isolation still holds under step decomposition (each chain's ordered steps run within the chain's single isolated TMPDIR). Verified by T30/T31 (isolation) + T14–T17/T22/T27/T28 (concurrency) still green.
- **Cross-edition:** canonical `scripts/kaola-workflow-run-chains.js` edited; codex twin byte-copied; gitlab/gitea ports regenerated via the exact `renameNormalize` transform; validate-script-sync + edition-sync --check green. The Phase-B diff self-selects all-four (correct end-to-end self-test).
