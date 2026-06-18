evidence-binding: n4-docs 43dd42a90707

## n4-docs execution evidence

**Node:** n4-docs
**Date:** 2026-06-18
**Write set:** CHANGELOG.md, docs/decisions/D-522-01.md

### Files written

1. **CHANGELOG.md** — appended a `### Fixed` bullet for #522 after the #521 bullet under `[Unreleased]`. One dense bullet in house style: bold lead-in, describes the fail-open gap (archive commit was unconditional; contractor Step 8c could not await run-chains across the Bash 600s ceiling), the fix (cmdFinalize gates on `--finalize-check --json` before archiveProjectDir, unconditional for both worktree and in-place paths when workflow-plan.md is present, returns `reason: finalize_gate_unverified` with exit 1 on non-pass), the procedure change (receipt generation moves to main session, contractor Step 8c demoted to verify-or-fail), and cross-edition status. References `docs/decisions/D-522-01.md`.

2. **docs/decisions/D-522-01.md** — new decision record. Sections: Context (the fail-open gap — unconditional archive commit; contractor-subagent-can't-run-run-chains root cause; observed live in #520 run), Decision (gate-before-commit inside cmdFinalize; reuse existing `--finalize-check`; main session owns run-chains; no bypass flag), Alternatives considered (resumable run-chains mode — rejected as large/uncertain vs. cheapest-sufficient; bypass flag — rejected as reintroducing fail-open), Implementation (byte-identical to codex twin; rename-normalized to gitlab/gitea ports; all four chains green), Consequences (dogfood: this run's own finalize is gated; non-adaptive runs unaffected; plan-validator.js and run-chains.js unchanged).

### Verification

```
git status --short
```

Shows:
- M CHANGELOG.md
- ?? docs/decisions/D-522-01.md
- (plus the pre-existing n1/n2 worktree changes: agents/contractor.md, commands/, plugins/ trees, scripts/kaola-workflow-claim.js, scripts/simulate-workflow-walkthrough.js, scripts/test-claim-hardening.js)

### Anti-fabrication check

- Diff read: `git diff HEAD -- scripts/kaola-workflow-claim.js` confirmed the exact block inserted before `archiveProjectDir`, with `reason: 'finalize_gate_unverified'`, `inner_reason`, `operator_hint`, exit 1.
- Real identifiers used: `finalize_gate_unverified`, `inner_reason` (snake_case), `operator_hint`, `adaptiveSchema.PLAN_FILE`, `execFileSync`, `timeout: 120000`.
- "Unconditional" scoped correctly: across worktree/in-place paths when plan is present; non-adaptive runs (no plan) skip the gate.
- Bash 600s ceiling language used (not "run-chains' timeout") to avoid contradiction with #512 entry in [6.4.0].
