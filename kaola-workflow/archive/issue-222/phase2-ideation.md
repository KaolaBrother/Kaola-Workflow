# Phase 2 - Ideation: issue-222

Two design decisions settled against the phase-gate chain (this is why #222 is full-path — and why the issue text's suggestion is wrong).

## Decision 1 — resume point: PHASE 1 (not Plan/Ideation)
### Options
- A (issue's suggestion): route escalation into Plan/Ideation (Phase 2/3).
- B (chosen): route escalation into **Phase 1**.
### Decision: B (Phase 1). The issue's "Plan/Ideation" is WRONG — it re-wedges.
Hard evidence from the phase prerequisite gates:
- `commands/kaola-workflow-phase2.md:11-17`: phase1-research.md MUST exist, else STOP with "Phase 1 is not complete."
- `commands/kaola-workflow-phase3.md:11-14`: requires phase1-research.md AND phase2-ideation.md.
An escalated fast project has ONLY `fast-summary.md` — no phase1-research.md — so routing it to Phase 2/3 dead-ends at that phase's own gate (a different wedge). **Phase 1 is the only non-wedging resume point.** It is self-reinforcing: `reconstruct()`'s artifact ladder (repair-state.js :369-372) checks phase3→phase2→phase1(:371)→fast-summary(:372); once Phase 1 produces phase1-research.md, line 371 fires before the fast-summary branch and the project climbs the full ladder automatically — the fast-summary is never read again. A false-positive fast now costs only the Phase-1 ceremony, cleanly. This makes the `workflow-next.md:113-114` "escalate cleanly" claim honest.
Escalation write-side therefore sets: `workflow_path: full`, `next_command: /kaola-workflow-phase1 {project}`, `next_skill: kaola-workflow-research {project}`.

## Decision 2 — detection key: fast-summary status ESCALATED (not escalated_to_full in state)
### Options
- A: detect `escalated_to_full` in workflow-state.md.
- B (chosen): detect `fast-summary.md` status === `ESCALATED`.
### Decision: B.
`stateContent()` (repair-state.js:461) regenerates the whole state file preserving ONLY the Sink block, so `escalated_to_full` is NOT preserved across a repair rewrite. Keying the detection on the state field would make a second repair run non-idempotent (after the first rewrite clears the field, the second run no longer detects escalation). Keying on `fast-summary.md` status is idempotent: re-runs before Phase 1 completes keep routing to Phase 1; once `phase1-research.md` exists, the phase1 ladder rung (line 371) wins. The negative control falls out naturally — IN_PROGRESS/REVIEW/PASSED ≠ ESCALATED, so normal fast projects are untouched.

## Decision 3 — implementation locus: a single reconstruct() branch + dedicated builder
The load-bearing fix is ONE new branch in `reconstruct()` immediately BEFORE the fast-summary→routeFast rung (line 372). Both `main()` paths funnel through `reconstruct()` (valid :546 / invalid :571), and the rewrite fires because the new branch returns a `next_command` that differs from the stale `/kaola-workflow-fast` (line 552), and `stateContent()` then auto-clears the fast keying. The `fastStateValid`/`stateLooksValid` edits the issue names are redundant. The builder must be dedicated (modeled on `routeFast`), NOT `route()` — `route()`'s `readFile(phaseFile)` at :380 throws ENOENT on the not-yet-existing phase1-research.md; the builder points `phaseFile` at the existing `fast-summary.md` (the escalation evidence).

## Decision 4 — convert the prose half from review-only to validator-enforced
The escalation write-side and Resume forward-route live in fast command/SKILL prose — the walkthrough cannot bite them. Rather than ship them review-only, the contract validators (which already assert fast command/SKILL strings per edition) gain `assertIncludes` for the new escalation-rewrite and Resume-forward-route strings. This enforces parity across editions and the load-bearing prose.

## Cross-cutting
- Byte-sync: root↔Codex repair-state.js (cp). gitlab/gitea forge-port (hand-adapt). The `fast-summary.md exists -> /kaola-workflow-fast` ladder string is locked by 3 validators — add the escalation rung ABOVE it, keep the exact string.
- #225 (later) repoints the Codex fast-skill refs; it must rebase onto #222's new SKILL sections.
