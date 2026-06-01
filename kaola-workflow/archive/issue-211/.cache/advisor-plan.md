# Advisor — Phase 3 Plan Gate (issue-211)

Plan is sound and implementable — proceed to Phase 4. Blueprint is unusually complete (exact code, anchors, byte-sync handled, both failure directions planned). No gaps → SKIP architect-revision loop.

## Gate answers
- **Dependency-safe?** Yes. Edit root → cp mirror → sync-check → tests correctly ordered (negative tests mutate SKILL.md, not the validator, so they don't perturb sync). Clean-pass-first is right.
- **Missing files/integration?** No. Write set (root + mirror) complete; riding the existing `:claude`-chain invocation satisfies AC#2 — no package.json change. Mirror copy is never executed by any chain (verified), so its `__dirname`-relative cross-forge read() can't misresolve at runtime.
- **Implementable from plan alone?** Yes, with one robustness fix (caveat 1).
- **Edge/error paths?** Non-empty baseline guard closes the deletion hole; missing forge file throws ENOENT (acceptable loud failure). Adequate.

## Phase-4 execution caveats (priority order)
1. **Edit by anchor text, NOT line number.** Edit tool matches strings; L55/L361 will drift if anything above shifts. Block 1 → anchor on close of `assertEveryDispatchHasModel` + the `const retired = [` line. Block 2 → anchor on end of codex-manifest `for` loop + the CHANGELOG `assert(`. Key Edits off those, not line counts.
2. **Negative tests are TDD-red — make them rigorous.** No test framework: the parity `assert` IS the test, planted divergence IS failing-test-first. Before each sed, print target line (`sed -n '33p' …`) to confirm it's inside the compared slice; after, confirm BOTH non-zero exit AND that the message is the intended one (DC assert for A, resume assert for B — not the other). A wrong line number silently yields exit 0 → signal to re-target. Single most likely stumble.
3. **AC#3 evidence = the clean pass, not the negative tests.** "Forge-specific prose not falsely flagged" is proven by validator PASSING against the untouched tree with all real glab/tea/MR prose present. Record that run explicitly as the AC#3 artifact. Negative tests prove AC#1, not AC#3.

## Phase-6 flag (does NOT block Phase 3/4)
Block 2 lands right before an existing CHANGELOG `assert` (~L363). It currently passes; the change doesn't perturb it — but confirm what that assert enforces before Phase 6 adds any `[Unreleased]` entry, so the docs step doesn't trip a release-discipline check. Pure sequencing awareness.

## Verdict
Nothing blocks. Skip architect-revision loop. Route to Phase 4.
