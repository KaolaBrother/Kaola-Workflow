evidence-binding: n5-converge-recommendation 7b2cdb1763e4

# n5 — Convergence: Issue #500 Per-Lever Decision (WIRE vs RELABEL) — SURFACE-FOR-APPROVAL

This is a read-only shaping convergence. Every verdict is a RECOMMENDATION marked PENDING OWNER APPROVAL. #500 stays OPEN; a re-planned build run reaches the end-state.

## Provenance gap (recorded, not fabricated)
The cited audit doc `docs/investigations/2026-06-16-full-reliability-principle-audit.md` does NOT exist on disk (verified). Real adjacent docs to cite: docs/investigations/2026-06-15-463-completeness-audit.md (pre-completion audit that triggered #463 slices 3-6), docs/investigations/2026-06-15-463-live-probe-and-verification.md (AC18 PASS completion record), docs/decisions/0010-runtime-neutral-per-leg-worktree-isolation.md (ADR; mechanism shipped/complete).

## L1 — write_overlap_policy relaxation (writeOverlapRelaxable, plan-validator.js:606)
- Finding: makespan win is REAL (two new scripts/ files are shared-infra yellow → serial-degrade today; relaxed under coarse+consent). But "cheap AND safe" REFUTED (n4): formation (adaptive-node.js:3815-3816, gates only on resolveLaneContainment && >=2 writers — consent NOT a formation condition) decouples from leg-provisioning (3899, requires resolveLegIsolation && writeOverlapConsent). Cheap wire (bare forward at :3351) → LANE_CONTAINMENT=1 + consent + LEG_ISOLATION=0 → group forms, legs skipped → 2 overlapping writers in shared parent = #283/#303 corruption. Safe wire (leg-couple at :3816) not cheap; shared-infra-coarse relaxation never run end-to-end (lane tests form via green short-circuit at 1895; AC18 disjoint-only).
- RECOMMENDATION: GUARDED-WIRE-as-follow-up if the shared-infra co-open win is wanted; else near-free RELABEL floor (already labeled "#463 OPEN / step 1 / default-off" at CHANGELOG:52 — only a silent-serial-degrade warning is missing).
- FLIP-PREMISE: owner's makespan valuation of the shared-infra co-open shape — no live plan authors it today. Common/valuable enough → WIRE; narrow win not worth leg-couple+prose+new-test → RELABEL.
- Follow-up write-set (if guarded-wire): leg-couple tryFormLaneGroup/3816 ×4 (forge ports kaola-{gitlab,gitea}-workflow-adaptive-node.js) + new shared-infra-coarse end-to-end test in test-adaptive-node.js (extend makeLaneRepo ~4918-4963) + #400 6-surface prose naming --write-overlap-consent/write_overlap_policy + 4 validator pins + symbol-grep all 4 trees + 4 chains green.

## L2 — KAOLA_LEG_ISOLATION (per-leg worktree isolation / synthesizer-merge)
- Finding: the issue/plan "DORMANT-by-design" premise is STALE. #463 slices 2-6 ALL shipped; CHANGELOG:29 "parallel-write engine is COMPLETE ... Closes #463"; AC18 live probe PASS (real Agent dispatches wrote in-lane, octopus-merged, barrier-verified, torn down). Leg-dispatch DISCIPLINE prose already in all 6 surfaces (plan-run.md:132-140). ABSENT from live prose: activation toggle NAMES KAOLA_LEG_ISOLATION + --write-overlap-consent (only KAOLA_LANE_CONTAINMENT named, plan-run.md:130). Stale "DORMANT" code comments at adaptive-node.js:3366-3370 + 3890-3897 (the "S2 dormant" wording at :3895).
- RECOMMENDATION: WIRE (the only non-contradictory honest direction — shipped docs already say COMPLETE/Closes #463, so RELABEL-toward-dormant would make docs LESS honest). Document the COMPLETE recipe (KAOLA_LANE_CONTAINMENT + KAOLA_LEG_ISOLATION + --write-overlap-consent) in 6 surfaces + fix stale comments.
- FLIP-PREMISE (factually false today): undiscovered leg-routing incompleteness (provisioning-only). n2 + AC18 + SYNTH-DISJOINT-END-TO-END test found the opposite. Only flips on out-of-band incompleteness evidence.
- Follow-up write-set (if wire): 6-surface recipe prose + code-comment fix at 3366-3370/3890-3897 ×4 + optional 4-validator token-pins + CHANGELOG + 4 chains. PREREQUISITE/COMPANION to L1's safe wire (shared recipe) → if both approved, ONE cross-edition run.

## L3 — speculative_open_policy:consent
- Finding: fully runtime-wired ×4 editions, all tests green (10 T439 + 6 SPEC). LEAST risky (read-only, near-zero blast radius, evidence-discard rollback at 3604-3705, no env-toggle). Prose omission was a KNOWN deferral (CHANGELOG:53 "rides the combined prose pass"). Cheap: 1 card docs/plan-run-cards/speculative-open.md + 6 markers + driver line (on open-next gate_not_complete w/ speculative gate + policy consent → open-ready --speculative-consent; discard-speculative on gate verdict:fail). Operator_hint already names the command. Reachability (prose) ≠ realizable win (needs deliberate planner authoring of a post-gate read-only topology no live plan has).
- RECOMMENDATION: WIRE the prose (cheap, honest, deferral acknowledged) + file the planner-rubric as a SEPARATE follow-up.
- FLIP-PREMISE: reachability bar → WIRE; realizable-win-without-rubric bar → RELABEL as "functional-but-unexercised until a planner rubric ships."
- Follow-up write-set (if wire): prose-only, INDEPENDENT of L1/L2 — 1 card + 6 markers + driver line (cards don't propagate via #400, README.md:29-30), no script change, CHANGELOG, 4 chains. Separate optional rubric follow-up: agents/workflow-planner.md + 3 plugins/*/agents/workflow-planner.toml.

## EXECUTIVE RECOMMENDATION — PENDING OWNER APPROVAL
- L1: GUARDED-WIRE-as-follow-up if the shared-infra co-open win is wanted, else near-free RELABEL floor (add silent-serial-degrade warning).
- L2: WIRE (dormant premise stale; document the full activation recipe + fix stale comments) — clearest call.
- L3: WIRE-prose (reachable + honest) + planner-rubric filed separately.
- Build decomposition: L1-guarded + L2 collapse into ONE cross-edition run (shared recipe + leg-couple 3816 ×4 + new shared-infra e2e test + 4-validator pins + comment-fix + 4 chains); L3 independent prose-only run. If L2 alone approved (most likely given L1's guard), it is a docs/comment cross-edition run by itself.
- All verdicts PENDING OWNER APPROVAL; #500 stays OPEN for the re-planned build run.
