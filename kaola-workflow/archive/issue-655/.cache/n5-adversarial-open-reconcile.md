evidence-binding: n5-adversarial-open-reconcile 0dc33d4d711d
verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=mixed_stable_plus_opening_topup_reconcile_now_retains_both_exact_override_members_and_remains_idempotent_orientable
upstream_read: n3-review d8ad5ba25480

# Adversarial falsification — issue #655 final open/reconcile candidate

## Claim under test

The final issue #655 candidate is claimed to preserve an authored `wait_budget_minutes` integer and `wait_budget_source: planner_override` end to end through descriptor projection, serial `open-next`, read and write `open-ready`, fused `close-and-open-next`, rolling top-up, durable running-set state, and crash reconciliation. In particular, the former R1 image — stable `r2` at `240/planner_override` plus newly opening `r3` at `300/planner_override`, cap 2, both ledger rows `in_progress` — must retain both members without an orphan wedge. Genuine over-cap rollback must be reported and ledger-reset. Omitted-model direct builder validation must not regress normal scheduler paths. No-override cards must remain byte-compatible, optimizer cards must remain `optimize_budget`, and the Join Protocol must treat the number only as a no-interrupt/no-re-nudge floor while retaining expiry escalation and complete-evidence requirements.

## Strongest disproof attempt — former R1 mixed top-up crash

I independently drove the real validator and adaptive-node CLI in a fresh hermetic git repository with read cap 2:

- `r1`: `code-explorer`, override 180
- `r2`: `code-explorer`, override 240
- `r3`: `code-explorer`, override 300
- `finalize` depended on all three

The first real `open-ready` admitted two members. I modeled one completed member and removed it from the live set, leaving `r2` stable. A second real `open-ready` admitted `r3`; its dispatch card carried exactly `300/planner_override`. I then reconstructed the exact phase-2 crash image: running-set `state:"opening"`, stable `r2` without an opening marker, `r3` with `opening:true`, and both ledger rows `in_progress`.

Observed result:

```text
topup_card: [300, planner_override]
rolledForward: [r3]
cappedOut: []
survivors: [r2,240,planner_override], [r3,300,planner_override]
second reconcile: reconciled=false, reason=not_opening
orient: result=ok
ledger in_progress: [r2,r3]
```

Former R1 is resolved. The repair targets only `opening:true` members for admission while counting stable members once (`scripts/kaola-workflow-adaptive-node.js:6024-6029`, `:6084-6092`), and the survivor filter retains stable plus admitted opening members (`:6163-6169`). Exact value and source survived; running-set and ledger remained equal; repeat reconciliation was idempotent; orient did not return `orphan_multi_in_progress`.

## Genuine rollback counterexample attempt

I constructed a second frozen hermetic plan at cap 2 with stable `r2` `240/planner_override` and two opening members: `r3` `300/planner_override`, `r4` `360/planner_override`; all three ledger rows began `in_progress`.

Observed result:

```text
rolledForward: [r3]
rolledBack: []
cappedOut: [r4]
survivors: [r2,240,planner_override], [r3,300,planner_override]
r4 ledger status: pending
orient: result=ok
ledger in_progress: [r2,r3]
```

The genuine cap rollback is explicit and consistent. `r4` is reported in `cappedOut`, reset to pending at `scripts/kaola-workflow-adaptive-node.js:6094-6104`, removed from the durable set, and does not strand an orphan ledger row.

## Other disproof probes that did not break

- Full adaptive-node harness: `node scripts/test-adaptive-node.js` passed 1,709 assertions. This covers authored serial open-next, read fan-out, speculative descriptors, fused advance, initial crash reconciliation, isolated real-git write legs, mixed stable/opening write-leg reconciliation, width-4 write cap, queued fifth-member drain, optimizer controls, and legacy controls. Expected EISDIR negative-fixture stacks were printed; process exit was 0.
- Next-action projection: `node scripts/test-next-action.js` passed 116 assertions. The former descriptor-drop path remains fixed.
- Direct omitted-model builder matrix: omitted-model `code-reviewer` rejected 20 and 39 and accepted 40; omitted-model `implementer` rejected 19 and accepted 20; explicit `reasoning` and `standard` cases had identical 40/20 boundaries. Accepted values emitted `planner_override`. All 9 expected outcomes matched, while the real scheduler crash probes above remained green.
- Full no-override compatibility against the pre-change `HEAD` module: standard, reasoning, and role-default dispatch objects were byte-identical under full `JSON.stringify`. SHA-256 prefixes matched `92464176d12a6b8b`, `4987d585d9f64ec3`, and `dfd9f1eef69f157a`; sources remained `planner_model`, `planner_model`, and `role_default`.
- Optimizer control against pre-change `HEAD`: full dispatch object remained byte-identical (SHA-256 prefix `397ce600ec464d70`), budget 55, source `optimize_budget`.
- Validator/optimizer focused walkthrough passed 2 scenarios. Frozen issue plan resume-check passed at plan hash `7ea7dad9bb394a916b78d483c51c77e4cecb0c3aed14d77729831ca282895a65`.
- Edition and routing integrity: `generate-routing-surfaces --check` reported all 12 generated surfaces byte-match the skeleton; route reachability passed 459 assertions; edition sync updated 0 files; script sync reported all common/byte-identical/rename-normalized families green; `git diff --check` passed.

## Join Protocol semantics

All six required plan-run command/SKILL surfaces carry the same contract: `planner_override` may extend but never shorten the no-interrupt floor; no interrupt or re-nudge may occur before expiry; after expiry the existing bounded escalation still runs; a complete governed deliverable remains mandatory; and `optimize_budget` is distinct. The detailed Join Protocol independently gates its three-rung escalation on budget expiry and records partial returns only as `returned_partial`. The evidence-persistence rule says missing or invalid cache evidence cannot continue, so the override never converts partial output into success.

## Verdict

NOT-REFUTED with high confidence (0.99). I reproduced the former R1 path through real open/top-up/reconcile operations, exercised a genuine capped-out rollback, ran the complete adaptive harness and projection tests, compared full legacy/optimizer cards against `HEAD`, and inspected generated Join Protocol surfaces. No in-scope counterexample remains.

## Scope and safety

Repository/product files were read-only. Hermetic probes wrote only under the system temporary directory and removed their temporary repositories. The sole repository write was this exact seeded evidence file; its binding header is preserved byte-for-byte. No commit, push, merge, issue closure, plan/ledger/state mutation, or product fix was performed.
