# Plan-Run Reference Cards

These cards document rare-branch recovery procedures for the adaptive plan-run. The main
`/kaola-workflow-plan-run` skeleton (`commands/kaola-workflow-plan-run.md`) points at these
cards via `<!-- CARD: name -->` markers. Read the relevant card when the plan-run encounters
that situation.

## Cards

| Card | When to read |
|---|---|
| [resume.md](resume.md) | Crash/interrupt during a run — how to resume |
| [governance.md](governance.md) | Plan freeze / governance-ack handshake |
| [repair-routing.md](repair-routing.md) | Barrier refusal / route-findings / repair dispatch |
| [reopen-complete-node.md](reopen-complete-node.md) | Reopening a complete writer node |
| [frontier-batch.md](frontier-batch.md) | Parallel frontier fan-out — running-set scheduler (open-ready / close-node / reconcile-running-set) |
| [speculative-open.md](speculative-open.md) | Speculative open (policy consent → open-ready --speculative-consent / discard-speculative) |
| [join-protocol.md](join-protocol.md) | Codex Join Protocol — wait budgets, long-poll join loop, escalation ladder, writer kill-safety (reconcile-running-set), typed delegation_outcome, frontier dispatch + slot awareness |

## How to use these cards

The `/kaola-workflow-plan-run` skeleton runs the common path (orient → open → dispatch →
record evidence → close-and-advance) inline. Each `<!-- CARD: name -->` marker in the skeleton
is a pointer to the relevant card for that rare branch.

When the plan-run produces a `result: refuse` or `result: halt` envelope, the `operator_hint`
field (D-445-01) gives you a one-sentence pointer and the exact next command. Use the
`operator_hint` to identify which card to read. Then follow the card's procedure to resolve the
situation and re-enter the run loop.

These cards are NOT part of the six-surface resident prose (the `#400` propagation rule does not
apply to them). They live once under `docs/plan-run-cards/` and are pointed at by the skeleton.

## Related ADRs

- **D-445-01** — `operator_hint` on every typed envelope + skeleton/card split
- **D-446-01** — `--summary` mode + `route-findings` companion record
- **D-434-01** — sanctioned repair primitives (`revert-overflow` / `repair-node`)
- **D-424-01** — `--drop-base` window-lock / anti-laundering model
- **D-586-01** — retirement of the standalone `parallel-batch` aggregator; `frontier-batch.md` now documents the running-set scheduler
- **D-611-01** — the Codex Join Protocol (wait budgets, writer kill-safety reconciliation, typed delegation outcomes); `join-protocol.md` documents the full mechanics
