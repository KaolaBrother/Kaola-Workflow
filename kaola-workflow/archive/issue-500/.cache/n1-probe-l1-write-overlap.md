evidence-binding: n1-probe-l1-write-overlap 75faa2939541

# L1 — write_overlap_policy relaxation (writeOverlapRelaxable) — probe findings

## The gap (verified)
- `tryFormLaneGroup` (scripts/kaola-workflow-adaptive-node.js:3348-3362) shells the validator with `[planPath, '--parallel-safe', '--nodes', ids.join(','), '--json']` — **no `--write-overlap-consent`**.
- Validator side is fully wired: `--parallel-safe` handler reads `const writeConsent = args.includes('--write-overlap-consent')` at plan-validator.js:1878.
- `opts.writeOverlapConsent` IS parsed at adaptive-node.js:5124 and IS in scope at the call site (adaptive-node.js:3816) but is not forwarded.
- Minimal caller fix: add a `consent` param to `tryFormLaneGroup`, conditionally append the flag, pass `opts.writeOverlapConsent` at 3816. ~3–5 lines × 4 byte-identical editions = ~12–20 LOC. No validator/schema change.

## (a) CHEAP?
- The predicate `writeOverlapRelaxable` (plan-validator.js:596-614) requires ALL of: `write_overlap_policy != off` (Meta; default `off`, adaptive-schema.js:185), `consent` true, `gatePresent` (a code-reviewer post-dominates ALL co-opened leg node IDs, leg-scoped at plan-validator.js:1881), neither write set protected (classifier.js:311-318: CHANGELOG/ROADMAP/manifest/schema/lockfiles/kaola-workflow paths), kind != exact (exact NEVER relaxes, adaptive-schema.js:187), shared-infra requires `policy: coarse` (plan-validator.js:612).
- No current plan carries `write_overlap_policy` (default off).
- Prose: commands/kaola-workflow-plan-run.md names KAOLA_LANE_CONTAINMENT (line 130) but NOT `--write-overlap-consent` / `write_overlap_policy`. WIRE would require the #400 6-surface propagation (~40–80 lines) + new shared-infra-coarse test coverage (test-adaptive-node.js makeLaneRepo at 4918-4963 tests only the disjoint GREEN case).

## (b) SAFE? — the load-bearing finding
- Today (no WIRE): SAFE because unreachable — consent always false → writeOverlapRelaxable always false → all shared-infra sibling pairs serial-degrade.
- **NAIVE WIRE is UNSAFE.** Leg provisioning at adaptive-node.js:3899 requires BOTH `resolveLegIsolation(env)` AND `opts.writeOverlapConsent`. A naive consent-forward run with `KAOLA_LANE_CONTAINMENT=1 --write-overlap-consent policy:coarse` but `KAOLA_LEG_ISOLATION=0` would: (a) form the lane group, (b) SKIP leg provisioning (3899 false), (c) dispatch both agents into the SHARED parent worktree → two overlapping shared-infra writers, no per-leg isolation = corruption / guard-vacuity (the #283/#303 failure mode).
- **The safe WIRE must be LEG-COUPLED**: gate consent-forwarding on `resolveLegIsolation`, mirroring the existing 3899 conjunction — not the bare 3-line diff.
- Disjoint pairs short-circuit before the predicate: `if (dj.verdict === 'green') continue` (plan-validator.js:1895). The AC18 live probe exercised only the disjoint-GREEN case; `writeOverlapRelaxable` returning true for a shared-infra pair has NEVER been exercised end-to-end.

## (c) REAL makespan win?
- SHARED_INFRA = {scripts, hooks, plugins/kaola-workflow/scripts} (classifier.js:281). Only directory-level overlaps in these produce shared-infra kind.
- The realistic multi-implementer case (two NEW distinct scripts under scripts/) already classifies green/disjoint → forms a lane group WITHOUT relaxation. The shared-infra relaxation only triggers on directory-level (not exact-file) overlap — a narrow, discipline-dependent shape that no existing plan authors.
- `concurrentAmbiguousOverlap` (plan-validator.js:1549-1552) flows into blastRadius→decision:ask, NOT errors — does not refuse freeze.
- L1 (logical permission to co-open) is NOT independent of L2 (physical containment via legs). L1 without L2 is unsafe; the makespan win requires BOTH.

## FLIP-PREMISE (surfaced, not decided)
- WIRE if: (1) L2 leg-isolation is production-complete beyond the disjoint probe, (2) the WIRE is leg-coupled (consent gated on resolveLegIsolation), (3) #400 6-surface propagation + new shared-infra test accepted.
- RELABEL if: the shared-infra relaxation path is unexercised end-to-end / L2 incomplete / the narrow win doesn't justify the propagation+test burden.
- **The deciding fact lives in n2**: n2 found L2 is in fact COMPLETE/LIVE, not dormant — the plan's "dormant" premise is stale. So a leg-coupled L1 WIRE is technically safe; the open question is whether the narrow, end-to-end-unexercised shared-infra win justifies the WIRE cost now, vs RELABEL pending a live shared-infra probe.
