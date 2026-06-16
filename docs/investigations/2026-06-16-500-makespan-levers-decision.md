# 2026-06-16 — #500: parallel-write makespan levers — wire-or-relabel decision inputs

**Type:** Case-B (#486) read-only shaping run. Produces decision inputs ONLY; wires/relabels nothing.
**Status of #500:** OPEN (checkpoint). A re-planned build run implements the approved direction and closes #500.
**Run shape:** three per-lever read-only probes (antichain) → adversarial critique of the riskiest lever → converge → this docs sink.

## Provenance gap (recorded, not fabricated)

The audit doc #500 cites — `docs/investigations/2026-06-16-full-reliability-principle-audit.md` — **does not exist on disk** (verified). The real adjacent docs are:

- `docs/investigations/2026-06-15-463-completeness-audit.md` — the pre-completion audit that triggered #463 slices 3–6.
- `docs/investigations/2026-06-15-463-live-probe-and-verification.md` — the AC18 completion record (Status: PASS).
- `docs/decisions/0010-runtime-neutral-per-leg-worktree-isolation.md` — ADR; states the per-leg mechanism is shipped/complete.

## The three levers (verified against live code)

### L1 — `write_overlap_policy` relaxation (`writeOverlapRelaxable`, `plan-validator.js:606`)

The only live caller, `tryFormLaneGroup` (`adaptive-node.js:3351`), invokes the validator's `--parallel-safe` **without** `--write-overlap-consent`, so the shared-infra relaxation short-circuits false on the live path; only unit tests exercise the predicate. This is the #378 headline shared-infra co-open win and the riskiest of the three.

**Finding.** The makespan win is **REAL** (n4 empirically refuted the "illusory win" reading): two *new, distinct* `scripts/*.js` files — the default multi-implementer decomposition — classify shared-infra **yellow** (`disjointWriteSets`, `classifier.js:378-385`; both `areaForPath = scripts ∈ SHARED_INFRA`, `classifier.js:281`) and serial-degrade today; `+ write_overlap_policy: coarse + --write-overlap-consent` → `result: ok, relaxed:[shared-infra]` (verified live via `--parallel-safe`).

But **"cheap AND safe" is REFUTED** (n4, `verdict: refuted`, high confidence):
- **Cheap wire is unsafe.** Lane-group *formation* (`adaptive-node.js:3815-3816`) gates only on `resolveLaneContainment && writeNodes.length >= 2` — consent is **not** a formation condition. `opts.writeOverlapConsent` enters only at leg *provisioning* (`:3899`, which also requires `resolveLegIsolation`). So a bare consent-forward at `:3351` decouples formation from provisioning: with `KAOLA_LANE_CONTAINMENT=1 --write-overlap-consent` but `KAOLA_LEG_ISOLATION=0`, the group forms but legs are skipped → two overlapping shared-infra writers in the **shared parent worktree** = the #283/#303 corruption mode.
- **Safe wire is not cheap.** Leg-coupling the forward at `:3816` on `resolveLegIsolation(process.env) && opts.writeOverlapConsent` + the #400 6-surface activation prose + a **new shared-infra-coarse end-to-end test** (none exists; `makeLaneRepo`, `test-adaptive-node.js:4918-4963`, is disjoint-only) — and the integrated relaxation→form→provision→synthesize path has **never run end-to-end** (lane tests form via the green short-circuit at `plan-validator.js:1895`; AC18 was disjoint-only).
- **Safety-by-construction holds where exercised:** the directory-entry same-file attack is dead at the grammar (`directory_shaped` refusal, `plan-validator.js:1117-1131`); `exact` overlaps never relax (`:613`); the octopus merge **bails** to `merge_conflict` on a genuine same-line conflict (`synthesizeLevel`, `:3568-3572`) — no silent drop; the per-leg barrier (anchored base ref, `--expect-base`) + `member_vacuity` + parent-clean fence (`--parent-clean-check`) close the #283/#292 leak modes.

### L2 — `KAOLA_LEG_ISOLATION` (per-leg worktree isolation / synthesizer-merge)

**Finding.** The issue's own **"DORMANT-by-design" premise is STALE.** #463 slices 2–6 have **all shipped** (CHANGELOG: "the parallel-write engine is COMPLETE … Closes #463"); the AC18 live probe is **PASS** — real `Agent`-tool dispatches wrote in-lane, octopus-merged, barrier-verified, torn down clean. The capability is complete and **live on the gated path**.

- The leg-dispatch **discipline** prose (use the absolute `legPath`) is already in all 6 surfaces (`commands/kaola-workflow-plan-run.md:132-140`).
- **Absent** from live command/SKILL prose: the **activation toggle names** `KAOLA_LEG_ISOLATION` and `--write-overlap-consent` (only `KAOLA_LANE_CONTAINMENT` is named, `:130`). The toggle strings appear only in CHANGELOG/docs.
- **Stale code comments** mislabel the live mechanism "DORMANT": `adaptive-node.js:3366-3370` and `:3890-3897` (the "S2 dormant" wording at `:3895`). The `working_dir`-stays-parent-side behavior is **correct by design** per ADR-0010 §3 ("containment, not construction"), not an incomplete state.

### L3 — `speculative_open_policy:consent`

**Finding.** Fully runtime-wired across all four editions; all tests green (10 T439 + 6 SPEC, real-subprocess git repos). **Least risky** of the three — read-only descendant, near-zero blast radius (evidence-discard rollback at `adaptive-node.js:3604-3705`), and no env-toggle (sole gates: the `## Meta` `speculative_open_policy: consent` field + the per-run `--speculative-consent` flag). The prose omission was a **known, acknowledged deferral** (CHANGELOG: "the per-leg plan-run prose … rides the combined prose pass per the issue").

- **Reachability ≠ realizable win.** Prose makes the consent path reachable via the operator's reactive `gate_not_complete` path; the *makespan win* (a post-gate read-only node whose sole blocker is an in_progress gate likely to pass) needs **deliberate planner authoring** of a topology that no live plan or planner rubric provides today.

## Out of scope (working as intended — honestly labeled designed-but-deferred)

#379 map dynamic fan-out, `speculative_open_policy:auto`, `write_overlap_policy:exact` (freeze-refused). Not touched.

## Per-lever recommendation (PENDING OWNER APPROVAL — see `docs/decisions/D-500-01.md`)

| Lever | Recommendation | One-line basis | Flip-premise |
| --- | --- | --- | --- |
| L1 | **GUARDED-WIRE as follow-up** if the shared-infra co-open win is wanted; else near-free **RELABEL** floor | win real, but cheap wire unsafe + safe wire non-trivial & unexercised e2e | owner's makespan valuation of a shape no live plan authors today |
| L2 | **WIRE** | "dormant" premise is factually stale; document the full activation recipe + fix stale comments | undiscovered leg-routing incompleteness (factually false today) |
| L3 | **WIRE prose** + file planner-rubric separately | cheap, honest, deferral acknowledged; reachable now | reachability vs realizable-win-without-a-rubric bar |

**Cross-lever coupling:** L1's *safe* wire depends on L2's leg-isolation (which is complete), and L1+L2 share one activation recipe (`KAOLA_LANE_CONTAINMENT` + `KAOLA_LEG_ISOLATION` + `--write-overlap-consent`). If both L1-guarded and L2 are approved, they collapse into **one** cross-edition build run. L3 is an independent prose-only run.

**Only L1 is a genuine owner value-call.** L2 (WIRE = the honesty fix for a stale premise) and L3-prose (cheap, honest, already-promised) are near-determined by the evidence.
