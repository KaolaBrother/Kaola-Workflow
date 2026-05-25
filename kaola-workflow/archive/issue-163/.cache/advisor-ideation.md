# Advisor Gate — issue-163 Phase 2 Ideation

## Status: RESPONDED (advisor available this round)

## Advisor Confirmation
Option B confirmed. Proceed.

## Key Decisions Locked By Advisor

### D1 — GitHub-only audit/repair subcommands
GitLab/Gitea get receipt wiring only. Half-finished cross-forge subcommands cause more confusion than absent ones. If forge audit is needed later, file dedicated follow-ups.

### D2 — Offline invariant SKIPS (not FAILS)
When `OFFLINE=1`, `in-progress-label-removed` invariant must SKIP, not violate. Receipt value `'skipped_offline'`; cannot verify without remote read. Treating as violation → every offline finalize reports `closure_invariants.ok === false`. Blueprint must be explicit about this.

### D3 — Test surface is highest-cost item
Need ≥5 tests with stateful gh.js shim:
1. Finalize happy path (label removed, `claim_label_removed: 'removed'`)
2. Finalize null-folder fallback (issue already closed before finalize; fallback reads from archive path)
3. Finalize offline (`claim_label_removed: 'skipped_offline'`, invariant SKIPPED)
4. Watch-pr receipt populated (MERGED path includes `claim_label_removed`)
5. Audit dry-run (lists stale labels) + execute (removes them)

### D4 — `removed` vs `already_absent` (planner decision confirmed)
API success → `'removed'`. Probe-first `already_absent` detection is future work.

## Advisory: Context Risk
Advisor flagged trajectory concern: #164 and #165 remain at non-trivial complexity. If context pressure starts dropping quality (test gaps, partial multi-forge sync, skipped review fixes), pause and report to user rather than declaring success on weak signals.
