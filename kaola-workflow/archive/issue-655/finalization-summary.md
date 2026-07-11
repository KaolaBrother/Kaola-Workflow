# Finalization - Summary: issue-655

## Delivered

Frozen, evidence-backed per-node wait budgets with fail-closed compatibility and
durable persistence through dispatch, running-set top-up, and crash reconciliation.
Legacy plans without an override retain their prior behavior.

## Final Validation Evidence

The terminal `.cache/chain-receipt.json` records the exact sequential Claude,
Codex, GitLab, and Gitea commands with exit code 0 after the final documentation
and changelog updates. Finalization verifies this receipt and does not rerun it.

## Review Evidence

- n3 code review: `verdict: pass`, `findings_blocking: 0`.
- n4 adversarial freeze/compatibility: `verdict: pass`, `findings_blocking: 0`.
- n5 adversarial open/reconcile: `verdict: pass`, `findings_blocking: 0`.
- n6 doc-updater: completed with `docs_updated: pass`.

## Documentation Docking

DOCKED. Evidence: `.cache/doc-docking.md` and `.cache/doc-updater.md`.

## Closure Decision

Close issue #655. No unresolved in-scope finding or user decision is recorded.

Follow-ups are tracked separately:

- #658 — fanout evidence path mismatch.
- #659 — GitLab fixture hermeticity.
- #660 — fenced heading parser.

## Run gaps

- in_run_repair (n2-planner-routing-contract): filed: #655
- in_run_repair (n3-review): filed: #655
- in_run_repair (n4-adversarial-freeze-compat): filed: #655
- in_run_repair (n5-adversarial-open-reconcile): filed: #655
- manual:fanout-evidence-path-mismatch (Finalization required role-prefixed adversarial instance receipts in addition to runtime-seeded node receipts; filed as #658.): filed: #658
- manual:gitlab-claim-fixture-nonhermetic (GitLab claim classification unit fixture reached ambient note discovery and produced an environment-dependent chain failure; filed as #659.): filed: #659
- manual:fenced-section-heading-decoy (A fenced Nodes heading was selected before the real workflow table; filed as #660.): filed: #660

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| final validation | invoked | `.cache/final-validation.md`, `.cache/chain-receipt.json` | |
| doc-updater | subagent-invoked | `.cache/n6-document-contract.md`, `.cache/doc-updater.md` | |
| documentation docking | invoked | `.cache/doc-docking.md` | |
| roadmap refresh | invoked | `kaola-workflow/ROADMAP.md` | |
| archive completed folder | invoked | `kaola-workflow/archive/issue-655` | |
| final commit | invoked | `chore: finalize issue-655` | |

## Attestation
claim_planner_attested: attested
finalize_contractor_attested: attested
