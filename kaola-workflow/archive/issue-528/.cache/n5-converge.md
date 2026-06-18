evidence-binding: n5-converge 0112470d4340

# n5-converge — Convergence record for #528 (fork B)

Read-only planner. n4 rendered `verdict: refuted` for Disposition A → **FORK B (docs-only D-528-01)**. I do not overturn n4; I converge on the fork it supported. No code ships; no #307 build obligation.

## 1. Localized finding
#528 reopened the C1 cross-chain axis (D-526-01 labelled it "SAFE but FUTILE" for the SINGLE claude chain) on a frame D-526-01 never measured: the FOUR-chain `npm test` gate (Σ t_chain ≈ 25-28min vs concurrent ideal max ≈ ~10min). Established: (a) the four-chain frame is NOT futile the way single-chain C1 was — ideal-core win is a real ~460-860s (light 460 vs 232 bar; heavy 860 vs 395), well above the realistic serial-Σ jitter bar, AND attribution is structurally CLEAN (A-KILL-3: 0 mismatches / 5000 trials / all 24 completion orderings via KNOWN_CHAINS.indexOf re-sort; receipt consumers set-wise/order-independent), no cross-chain race observed (A-KILL-4, 5 runs). BUT (b) the make-or-break — whether the win SURVIVES contention on a ≤4-core host — cannot be settled on this 18-core machine: macOS has no hard core-cap (no taskset/cgroups/cpuset); 16 background spinners did NOT invert (N=4 510ms vs serial 1820ms) and oversub to M/cores=4.0 never inverted → the ≤4-core inversion regime is un-reproducible here; every favorable number is the forbidden non-transferable upper bound. Under inverted burden (precedence #1), an un-settleable affirmative win-claim is REFUTED, not "probably fine."

## 2. Recommended disposition
TERMINATE with docs-only D-528-01. NO code ships, NO #307 build obligation (A-KILL-5 unexercised, never needs to be on fork B). NO follow-on build run / Case-A re-plan authored now (freeze-once; a build is authored later ONLY if the flip-premise is met). Practical lever available today: SELECTIVE EXECUTION — run-chains.js already honors `requestedChains` (`--chains <list>`/`--only`, :208) → a contributor who touched only some editions runs only those chains. Real makespan reduction, zero concurrency risk, no new code.

## 3. EXPLICIT flip-premise (only thing that flips B→A)
> A benchmark on a CONTENDED ≤4-core host (real CI runner / constrained cloud VM / physical box with cores disabled — NOT an 18-core dev box) showing a median four-chain makespan win decisively exceeding 2× the serial-Σ jitter band (~232s light / ~395s heavy) WHILE reproducing deterministic ordered chain-level first-failure attribution (already structurally confirmed by A-KILL-3 — so the benchmark need only NOT REGRESS it). Until that number exists, the null (serial) stands.

Recordable REOPEN condition mirroring D-526-01's two-part gate; the attribution half is already discharged for the four-chain frame, the OPEN half is purely the contended ≤4-core makespan number this 18-core host cannot produce.

## 4. D-528-01.md draft → see n6 deliverable (committed near-verbatim)
Title: "Cross-chain (C1) four-chain parallelism is not finalizable on an 18-core host — serial `npm test` stays; reopen only on a contended ≤4-core benchmark". Status: Accepted. Date 2026-06-18. Issue #528. Related #526/D-526-01, #523/D-523-01, #512/D-512-01, #307, #501, #486. Sections: Context, Investigation method (node table), Question, Decision (NOT finalizable on 18-core → serial stays, no code), Evidence (host caveat + A-KILL-1/2 proxy numbers + A-KILL-3 attribution + A-KILL-4 race + decision-bar arithmetic), Consequences (no code; selective execution lever; 900s timeout stays; D-526-01 refined-not-overturned; no follow-on build), Alternatives (A refuted / B chosen), Reopen condition (both: attribution-not-regressed AND ≤4-core decisive win).

## 5. CHANGELOG draft
CHANGELOG.md currently has NO `[Unreleased]` section — opens directly with `## [6.6.2] - 2026-06-18`. n6 ADDS a fresh `## [Unreleased]` block above `## [6.6.2]` with `### Changed`, one entry scoped to the local four-chain `npm test` gate (NO CI/CD mention per #501), referencing D-528-01 + the cross-chain investigation outcome + selective-execution lever + reopen condition.

## Handoff to n6-finalize
- Commit TWO files: docs/decisions/D-528-01.md (NEW; no existing D-528-* confirmed) + CHANGELOG `[Unreleased]`/`### Changed` entry prepended above `## [6.6.2]`.
- Roadmap closure: close #528 (docs-only; no version bump — `[Unreleased]`, not a release cut).
- Do NOT run the four-chain #307 gate as a build precondition — fork B ships no code; the only files touched are docs/decisions/D-528-01.md + CHANGELOG.md (neither an edition-tree script). A-KILL-5 stays unexercised by design.
- Do NOT author/pre-plan a concurrent-dispatch build run (freeze-once).
- Evidence chain: n1(1c4c9e7e41dc) n2(9eaa57246095) n3(bbecf0e1db29) n4(66cacf514ac5 verdict:refuted) — converged on the fork n4 supported; nothing overturned.
