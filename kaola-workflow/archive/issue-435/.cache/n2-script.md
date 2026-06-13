evidence-binding: n2-script a6eabdf3af19
tdd-guide implemented scripts/kaola-workflow-gap-sweep.js (scanner --json + gate --check) + scripts/test-gap-sweep.js, test-first, per n1-design contract.
RED: pre-impl all 8 test cases failed (ENOENT, module absent) — 'gap-sweep tests FAILED (8 failures, 4 passed)'.
GREEN: orchestrator re-ran node scripts/test-gap-sweep.js => 'gap-sweep tests passed (38 assertions)' exit 0.
Coverage (AC): scan dedup-by-(reasonClass,sample) over provenance reopens (in_run_repair) + chain-receipt accepted_red (deferred_red_chain) + optional run-gaps-manual.md (manual:<slug>); --check refuses gaps_unswept when ## Run gaps section absent/unmapped (the injected-refusal case); passes after mapping to filed:#N (offline) or noise:<text>; empty sweep => vacuous pass. Scope-guarded to project .cache only. Envelope mirrors run-chains.js.
ORCHESTRATOR TRIVIAL FIX: the FORGE-NEUTRAL comment literally contained 'gh/glab/tea' which trips the gitlab validator's forbidden /\bgh\b/ pattern (would red the forge ports). Reworded to 'invokes no forge-specific CLI binary or brand name' (one-line, no behavior).
Forge-neutral: node scan for /\b(gh|glab|tea)\b/ => 0; gitlab+gitea --forbidden-only on the canonical => exit 0.
Scope: git status shows only the 2 declared files. All test fixtures in os.tmpdir().
