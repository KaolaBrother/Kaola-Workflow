# Advisor — issue-155 Phase 3 Plan Gate

## Verdict: Proceed to Phase 4 (no architect revision needed)

Blueprint is implementable and dependency-safe. Architect correctly caught:
- 4-tree reality (not 3) — validate-script-sync.js would fail CI otherwise
- Correct doc path (`commands/workflow-next.md:334`, not `:152`)
- `target_unavailable` already listed at `:152`; only `:334` Parallel-decision line needs change

## Constraints to carry into Phase 4 implementation

1. **`claimExplicitTarget` ordering** — new `target_unavailable` sibling must be placed BEFORE the `claimProject` call (immediately after the `red` branch). If placed after, both routes fire on the classifier path (technically harmless but wasteful).

2. **`probeIssueState` import** — Phase 4 must update the `require()` destructure in each of the three `claim.js` files. A missed import causes `ReferenceError` at runtime, not at lint — only the new tests would catch it.

3. **GitHub-tree `cp` discipline** — Run `node scripts/validate-script-sync.js` after every GitHub edit, not just at the end. Fix canonical then re-`cp`; never hand-patch the vendored copy.

4. **Test-name uniqueness** — New test cases need distinct names in simulate-workflow-walkthrough.js. Search for existing gh shim helper (`ghShim`/`writeGhShim`/`writeFileSync.*gh`) before inventing one.

5. **`withFakeForge` vs `withForge` helper name** — Grep actual name in each test file before writing; these are independent files that may differ.

6. **Probe reasoning string** — Interpolate `issueNumber` literally (e.g., `issue #${issueNumber} state probe failed`), not the placeholder `#N`.

## Belt-and-Suspenders Note

`claimExplicitTarget` calls classifier first (→ sibling fires), then `claimProject` (→ probe fires as fallback). Do NOT refactor this redundancy away — it correctly covers the two-path problem.

## Not a Concern

- Build order and parallelization are correct
- `cmdStartup` left untouched (auto-mapping confirmed)
- `e.status === 2 → owned` preserved
- CHANGELOG entry matches project doc checklist
