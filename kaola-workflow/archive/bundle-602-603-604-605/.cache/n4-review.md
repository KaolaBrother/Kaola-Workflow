evidence-binding: n4-review 3427c66aabb9
# n4-review — code-reviewer gate (opus) over the full bundle (issues 602/603/604/605)

Scope: full branch diff vs merge-base with origin/main (~29 files: engine lane ×10, contracts lane ×18, docs node ×1) + the four issue ACs.

verdict: pass
findings_blocking: 0

finding: id=R1 scope=in_scope action=fix status=resolved severity=medium fix_role=none rationale=n3-docs edit to docs/workflow-state-contract.md was correct but uncommitted (stranded in the working tree; branch HEAD fdc2441f lacked it, so the sink would have dropped it) resolution=committed to the branch as 33768cc9 (docs: state-contract coverage for the run-progress mirror and codex dispatch mode field) by the orchestrator between windows; working tree verified clean afterward

## Findings

[MEDIUM → RESOLVED] R1 — commit-hygiene gap, not a content defect: the n3-docs additions (codex_dispatch_mode field; run-progress.json generated mirror) were accurate and complete but existed only in the working tree. RESOLVED: committed as 33768cc9 before finalize; doc coverage now lands on main with the sink.

LOW (advisory, no action): cmdBootstrap lacks the literal-value check cmdStartup runs for --codex-dispatch-mode; it relies on writeState assertNoNewline + the read-side literal guard (fail-closed either way; the SKILL wiring only routes the flag to startup). The typed invalid_codex_dispatch_mode refusal would not fire on that path.
LOW (advisory, no action): the byte-identity walkthrough case proves default --json via stdout === JSON.stringify(parsed)+'\n' rather than a captured pre-feature baseline; sound as a proxy (also asserts the envelope still carries opened.dispatch).

## Verification (real exit codes)

- npm run test:kaola-workflow:claude exit 0 (walkthrough passed; the three new oracles testSummaryDispatchSegments602/testCodexDispatchModeThreading603/testRunProgressMirror605 PASSED; field-parity 61)
- npm run test:kaola-workflow:codex exit 0; gitlab exit 0; gitea exit 0 (run sequentially)
- edition-sync --check exit 0 (10 forge ports parity); validate-script-sync exit 0 (codex claim/adaptive-node twins byte-identical)
- test-route-reachability 233 assertions (T12 six plan-run surfaces; T13 six codex startup SKILLs); test-claim-hardening 155 assertions

## Per-issue verdicts (all clean)

- #602: dispatchSummarySegments gated on summaryMode only; single-open + batch shapes; effort=inherit on null; legs omitted; default --json byte-proven; prose matches the emitted format on all six surfaces.
- #603: validate-before-mutate ordering confirmed on both claim paths; assertNoNewline fence; state read threaded to ALL THREE buildDispatch sites; junk value → v1-thread-id fail-closed; adaptive-schema.js untouched; forge ports correctly hand-adapted; codex twin byte-identical; walkthrough covers persist/absent/invalid.
- #604: three formats + inline fallback verbatim and consistent ×6; no contradiction with the gate-role degradation notice; needle per format per edition; whitespace-normalized matching still reds on removal.
- #605: writeRunProgressMirror try/catch-wrapped → warn-only; post-ledger-write, linked-worktree-gated; main root via the main_root seam; never read back; root plan frozen (asserted); all four oracles proven.
- No provenance in any command/SKILL surface; no debug artifacts.
