evidence-binding: n3-probe-l3-speculative-open ef667b1d891e

# L3 — speculative_open_policy:consent — probe findings

## (a) Runtime-wired & functional?
- **YES, fully wired ×4 editions** (gitlab/gitea ports confirmed at kaola-{gitlab,gitea}-workflow-adaptive-node.js:3775; schema constant byte-identical ×4).
- Policy constant: adaptive-schema.js:164-171 — SPECULATIVE_OPEN_POLICY_DEFAULT='off', LEGAL=['off','consent']; `auto` is REFUSED_AT_FREEZE (explicitly out of scope).
- Parse: plan-validator.js:312-316 parseSpeculativePolicy reads `## Meta` `speculative_open_policy:`; resolveSpeculativePolicy shared into adaptive-node.js:83-92.
- Eligibility emit: next-action.js:200-242 builds `speculativePending` ONLY when policy==='consent' (omitted at off → byte-identical to pre-#439).
- Activation: adaptive-node.js:3780-3788 — speculative branch fires ONLY when `frontier.length === 0 && opts.speculativeConsent && resolveSpeculativePolicy===consent`. `speculativeConsent` from `--speculative-consent` (args parse at 5120).
- Close guard: adaptive-node.js:3581-3598 speculativeCloseGuard holds a speculative member (gate_not_complete) until its gate is complete. Discard: 3604-3705 runDiscardSpeculative rolls back on gate-fail (ledger reset → revert baseline SHA → --drop-base → remove from running-set). Refuse hint: 1651-1664 open-next of a gate-blocked node refuses gate_not_complete pointing at `open-ready --speculative-consent`.
- Tests: 10 T439 (test-adaptive-node.js:7142-7276) + 6 SPEC (test-next-action.js:506-590) — real subprocess git repos.
- **No env-toggle gate** (unlike L1/L2's KAOLA_LANE_CONTAINMENT). Sole gates: Meta policy + `--speculative-consent` flag. Nearer to WIRE-ready.

## Skeleton-level GAP
- The plan-run skeleton calls `open-ready` only on `enterBatch:true` (≥2 delegable pending frontier, adaptive-node.js:1684). The speculative case requires the OPPOSITE: zero normal-frontier nodes (the gate is the SOLE blocker). **No skeleton path passes `--speculative-consent`.** Only activation today is reactive: operator sees gate_not_complete from an explicit open-next and follows the operator_hint manually.
- INV-19 caveat: D-419-02:172 specifies consent is "captured per-run by the USER at decision:ask, never auto-granted by an agent"; as-built `--speculative-consent` is a plain flag with no enforced user checkpoint (discipline-dependent).
- Risk: D-419-02:199-201 — read-only speculative descendant has "near-zero blast radius (no writes to revert; evidence discard only)" = RECOMMENDED default. **Least risky of the three.**

## (b) Cheap to wire into prose?
- Prose omission was a KNOWN deferral: CHANGELOG.md:53 — "the per-leg plan-run prose for the speculative open discipline rides the combined prose pass per the issue."
- Cheapest form: 1 new `docs/plan-run-cards/speculative-open.md` card + six `<!-- CARD: speculative-open -->` markers in the 6 plan-run surfaces (cards do NOT propagate via #400 per docs/plan-run-cards/README.md:28-30) + a driver line: on `open-next` gate_not_complete with speculativeGate set AND plan policy consent → run `open-ready --speculative-consent`; drive `discard-speculative` on gate verdict:fail. The operator_hint text (adaptive-node.js:155) already names the command.
- `grep speculative_open_policy` over commands/ + plugins/ .md → ZERO matches (gap spans all 6 surfaces). Scripts already ported ×4 (no code change).

## (c) Real makespan win?
- Win = a read-only node on the critical path whose SOLE blocker is an in_progress gate that's very likely to pass; saved time = the gate's exec time.
- Eligibility (next-action.js:221-229): node pending + not already-ready + READ-ONLY (write set `—`) + exactly ONE unsatisfied dep that is a GATE_VERDICT_ROLES node in_progress. Constraint 3 (read-only) is binding.
- Topology gap: in typical plans read-only investigation nodes run BEFORE gates, not after; post-gate nodes are usually writers (doc-updater/finalize). The T439 fixture uses an artificially read-only doc-updater. A real eligible shape (e.g. impl → code-reviewer → post-gate read-only code-explorer) is possible but requires DELIBERATE planner authoring. No existing live plan uses it.

## FLIP-PREMISE (surfaced, not decided)
- WIRE if: adding the skeleton prose (6 markers + 1 card + the driver call) is SUFFICIENT for the mechanism to be realizable in an authored plan today (mechanism functional, planner capable when instructed).
- RELABEL (as "functional-but-unexercised until a planner rubric ships") if: the eligible topology is structurally absent from today's plans and no planner rubric teaches it, so prose alone yields no realizable win.
