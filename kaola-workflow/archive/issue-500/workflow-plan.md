# Workflow Plan — issue-500

<!-- plan_hash: 4c6881ca19c89292cd0d68906f903f957169a106e772696ad4d390fa2d9ee855 -->

## Meta

labels: enhancement, area:scripts
issue_number: 500

## Plan Notes

DECISION/QUESTION-shaped issue (#486 Case B — shape-first read-only shaping run,
then re-plan). #500 is explicitly "a decision, not a build": decide PER LEVER,
between WIRE (make the makespan lever reachable on the live path) and RELABEL
(mark experimental/deferred + fix docs/CHANGELOG so the 'shipped' status is
honest). A mix is allowed ("cheapest sufficient, pick one per lever").

CHECKPOINT / CASE-B INTENT (read by downstream finalize): this is a READ-ONLY
SHAPING run that produces decision inputs ONLY — it wires/relabels NOTHING.
Issue #500 MUST stay OPEN after this run so the orchestrator can re-plan the
implementation (WIRE and/or RELABEL per approved lever) as a FRESH run. The
finalize sink records findings + a pending-approval recommendation; it does NOT
close #500. The finalize goal_check for THIS run is the SHAPING goal ("produce +
surface the per-lever decision inputs: cost/safety/makespan finding +
flip-premise, recommendation marked pending approval"), NOT the end-state goal
("every lever reachable-or-honestly-labeled") — the end-state goal is satisfied by
the re-planned build run, not here. Do not let a sink goal_check assert the
end-state.

WHY CASE B, NOT CASE A. The implementation SHAPE depends on the per-lever value
call, and that value call is forbidden to be made silently (the issue requires it
SURFACED for approval). If WIRE wins for lever 1, the write set is the
cross-edition build (`adaptive-node.js` + `plan-run.md` prose + the 6-surface
#400 routing/adaptive-prose propagation + the 4 plugin trees + every
symbol-grep'd file). If RELABEL wins, it is docs/CHANGELOG only. Two radically
different DAGs gated behind an owner decision = Case B by definition. Authoring a
build DAG that bakes in any WIRE/RELABEL choice would launder an unvalidated value
call into a frozen plan and sail through a green artifact-vs-plan verdict (the
#486 anti-pattern). Therefore this run is READ-ONLY: it investigates each lever
(cheap? safe? real makespan win?), records a per-lever recommendation WITH the
premise that would flip the call, and returns `decision:ask` so the orchestrator
re-plans the implementation (WIRE and/or RELABEL) as a FRESH run after the owner
approves per lever.

Every non-sink node is read-only (`declared_write_set: —`): three independent
per-lever probes form a read-only ANTICHAIN (no dep edges, empty write sets → the
validator derives `parallel_safe` and the running-set scheduler overlaps them at
the read cap — the shipped #472 read-frontier seam), an `adversarial-verifier`
refutes the riskiest lever's "cheap AND safe" claim, a `planner` converges the
recommendation into `.cache`, and the `finalize` sink writes ONLY docs/state. No
code-producing node ⇒ no G1/G2 gate is required, by construction. If any node
needed `tdd-guide`/`implementer`, that would signal drift into building — there is
none here. (These are independent read NODES, not a write-partitioning
`fanout(<group>)`: they partition no write set, so the correct shape is `sequence`
with no group annotation — the antichain/read-cap path, NOT the parallel-batch
member-scoped-barrier path.)

THE THREE LEVERS (verified independently against the live code):
- L1 write_overlap_policy relaxation (`writeOverlapRelaxable`,
  plan-validator.js:606) — UNREACHABLE: the only live caller `tryFormLaneGroup`
  (adaptive-node.js:3351) invokes `--parallel-safe` WITHOUT
  `--write-overlap-consent`, so the relaxation short-circuits false outside tests.
  This is the #378 headline shared-infra co-open win and the RISKIEST to wire
  (concurrent write nodes touching OVERLAPPING files). L1 gets the adversarial
  critique.
- L2 KAOLA_LEG_ISOLATION (synthesizer-merge / per-leg `.kw` worktree isolation,
  adaptive-node.js LEG_ISOLATION_ENV) — in NO live command/SKILL prose (only
  CHANGELOG + docs/decisions/0010 + docs/investigations). Provisioning is
  DORMANT-by-design in the current slice (legs provisioned + telemetered but
  nothing written into them; routing-into-legs is a later slice); the
  safe-write-parallel path is proven only by a throwaway-repo probe. The probe
  must distinguish "wire the toggle into prose" from "the underlying capability is
  not yet complete" — relabel may be the honest call even if naming the toggle is
  cheap.
- L3 speculative_open_policy:consent — runtime-wired but in ZERO live
  skill/command prose (only CLAUDE.md/CHANGELOG/docs/architecture/api/decisions).

OUT OF SCOPE — DO NOT TOUCH OR "FIX" (working as intended, honestly labeled
designed-but-deferred / freeze-refused): #379 map dynamic fan-out,
speculative_open_policy:auto, write_overlap_policy:exact tiers.

PROVENANCE GAP (must be recorded in the findings, NOT fabricated): the audit doc
the issue cites — `docs/investigations/2026-06-16-full-reliability-principle-audit.md`
— does NOT exist on disk (verified). The closest real docs are
`docs/investigations/2026-06-15-463-completeness-audit.md` (mentions
writeOverlapRelaxable) and `docs/decisions/0010-runtime-neutral-per-leg-worktree-isolation.md`.
The converge/sink nodes cite the REAL adjacent docs and note the missing audit.

GOAL (issue end-state, for the LATER build run — NOT this run's goal_check): a
shipped capability should be either reachable on the live path or honestly
labeled — never advertised-but-dormant. This run produces the DECISION INPUTS
(per-lever recommendation + flip-premise) and SURFACES the value call; the
re-planned build run reaches the end-state.

PARALLELISM: n1/n2/n3 are an independent read-only ANTICHAIN (no dep edges among
them, all `—` write sets) → the validator derives `parallel_safe` and the
running-set scheduler overlaps them at the read cap. n4 (adversarial critique of
L1) depends_on n1 only — a clean sequence dependency (n1 is a plain read node, not
a fanout member). n5 (converge) joins all four. The longest dependency chain is
n1 → n4 → n5 → n6; n2/n3 overlap it for free.

DECISION-RECORD NUMBERING: D-500-01 is the next free number (verified: no D-500
records exist; no D-500 mention in docs/CHANGELOG/README). The sink writes
D-500-01 as INVESTIGATION-FINDINGS-AND-RECOMMENDATION marked PENDING APPROVAL
(not a chosen/settled decision) — the value call is surfaced, not made here.

The finalize sink writes ONLY docs/state: the investigation findings doc
(`docs/investigations/2026-06-16-500-makespan-levers-decision.md`), the
recommendation record (`docs/decisions/D-500-01.md`), and the CHANGELOG entry.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-probe-l1-write-overlap | code-explorer | — | — | 1 | sequence | sonnet |
| n2-probe-l2-leg-isolation | code-explorer | — | — | 1 | sequence | sonnet |
| n3-probe-l3-speculative-open | code-explorer | — | — | 1 | sequence | sonnet |
| n4-critique-l1-safety | adversarial-verifier | n1-probe-l1-write-overlap | — | 1 | sequence | opus |
| n5-converge-recommendation | planner | n1-probe-l1-write-overlap, n2-probe-l2-leg-isolation, n3-probe-l3-speculative-open, n4-critique-l1-safety | — | 1 | sequence | opus |
| n6-finalize | finalize | n5-converge-recommendation | docs/investigations/2026-06-16-500-makespan-levers-decision.md, docs/decisions/D-500-01.md, CHANGELOG.md | 1 | sequence | — |

probe_scope[n1-probe-l1-write-overlap]: READ-ONLY. For L1
(write_overlap_policy relaxation / writeOverlapRelaxable, plan-validator.js:606;
dead caller tryFormLaneGroup, adaptive-node.js:3351) determine: (a) is forwarding
`--write-overlap-consent` from tryFormLaneGroup CHEAP (what guards/policy must
gate it; what plan-run.md prose names the toggle)? (b) is it SAFE (what protects
two concurrent write nodes over OVERLAPPING files — protected-path bail,
gate-present requirement, coarse/shared-infra class limits)? (c) what is the REAL
makespan win (which authored DAGs actually form a shared-infra lane group)? State
the premise that would flip WIRE↔RELABEL. Write evidence to
`kaola-workflow/issue-500/.cache/n1-probe-l1-write-overlap.md`.

probe_scope[n2-probe-l2-leg-isolation]: READ-ONLY. For L2 (KAOLA_LEG_ISOLATION /
synthesizer-merge per-leg worktree isolation; LEG_ISOLATION_ENV in
adaptive-node.js; docs/decisions/0010) determine whether the underlying
write-parallel capability is COMPLETE enough to wire into live prose, or whether
provisioning is still DORMANT-by-design (legs provisioned but nothing routed into
them) such that naming the toggle in prose would advertise a non-functional path.
Distinguish "cheap to name the toggle" from "capability not yet shipped." State
the flip-premise. Write evidence to
`kaola-workflow/issue-500/.cache/n2-probe-l2-leg-isolation.md`.

probe_scope[n3-probe-l3-speculative-open]: READ-ONLY. For L3
(speculative_open_policy:consent — runtime-wired, zero live skill/command prose)
determine: is wiring it into plan-run prose cheap AND safe (it is a
runtime-already-wired consent path, the least risky of the three)? what is the
real makespan win? State the flip-premise. Write evidence to
`kaola-workflow/issue-500/.cache/n3-probe-l3-speculative-open.md`.

critique_scope[n4-critique-l1-safety]: READ-ONLY (has Bash; writes nothing).
Adversarially REFUTE the leading L1 claim "wiring write_overlap_policy relaxation
is cheap AND safe" against n1's probe evidence. L1 is the riskiest lever
(concurrent overlapping writes). Attack: can a hostile/ordinary plan form a lane
group whose overlapping write sets corrupt each other; does the protected-path /
gate-present / shared-infra-class guard actually hold; is the makespan win real or
marginal. Verdict feeds the converge node's per-lever recommendation. Write
findings to `kaola-workflow/issue-500/.cache/n4-critique-l1-safety.md`.

converge_scope[n5-converge-recommendation]: READ-ONLY. Synthesize n1-n4 into a
PER-LEVER recommendation (WIRE vs RELABEL) with, for each lever: the
cost/safety/makespan finding, the premise that would FLIP the call (both-outcomes
baseline), and the explicit note that this is SURFACED FOR APPROVAL, not chosen.
Record the provenance gap (the cited audit doc does not exist; cite the real
adjacent docs). Recommend the SHAPE of the follow-up build run per approved lever
(WIRE → cross-edition build honoring #400 6-surface propagation + 4 plugin trees +
symbol-grep'd write-set; RELABEL → docs/CHANGELOG-only). Write to
`kaola-workflow/issue-500/.cache/n5-converge-recommendation.md`.

finalize_scope[n6-finalize]: docs/state ONLY. Write the findings doc
(`docs/investigations/2026-06-16-500-makespan-levers-decision.md`), the
recommendation record (`docs/decisions/D-500-01.md` — framed as
investigation-findings-and-recommendation PENDING APPROVAL, never a settled
decision), and the CHANGELOG `[Unreleased]` entry. D-500-01 is the next free
record number. Keep #500 OPEN (checkpoint — the build run closes it).

## Node Ledger

| id | status |
| --- | --- |
| n1-probe-l1-write-overlap | complete |
| n2-probe-l2-leg-isolation | complete |
| n3-probe-l3-speculative-open | complete |
| n4-critique-l1-safety | complete |
| n5-converge-recommendation | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1-probe-l1-write-overlap) | subagent-invoked | evidence-binding: n1-probe-l1-write-overlap 75faa2939541 | |
| code-explorer (n2-probe-l2-leg-isolation) | subagent-invoked | evidence-binding: n2-probe-l2-leg-isolation 4f716663b522 | |
| code-explorer (n3-probe-l3-speculative-open) | subagent-invoked | evidence-binding: n3-probe-l3-speculative-open ef667b1d891e | |
| adversarial-verifier (n4-critique-l1-safety) | subagent-invoked | evidence-binding: n4-critique-l1-safety 42bcc86ae2f1 | |
| planner (n5-converge-recommendation) | subagent-invoked | evidence-binding: n5-converge-recommendation 7b2cdb1763e4 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 5f0ff11db1d8 | |
