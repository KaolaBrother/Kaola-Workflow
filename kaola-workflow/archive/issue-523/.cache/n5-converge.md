evidence-binding: n5-converge 8ece42278776

# n5-converge — localized cost + recommended shape (issue #523)

Cross-edition reach confirmed concretely: the `&&`-chain runner in `package.json:35-41` is shared across all four chains, and the walkthrough family has **6 sibling copies** across the four edition trees. Any change to the runner shape or the walkthrough's internal scheduling is squarely a #307 cross-edition change.

## Localized dominant cost

The ~574s lives in **two units that together are ~75% of the chain**, confirmed by n2's measured timings and n4's instrumented decomposition:

1. **#16 `scripts/test-adaptive-node.js` — ~122s avg (≈34% of the chain).** Stable across runs (128.81s / 115.11s; instrumented 131.49s). n4 instrumented it: 780 top-level spawns, of which **time-inside-spawns = 130.7s = 99.4% of the run**. The dominant slice is **112 real `kaola-workflow-adaptive-node.js` CLI calls = 104.7s at 935ms/call**. Per-call bare process startup is ~30ms (3%); the other 97% is **genuine work** — plan-hash validation, ledger splice, barrier diff, task-mirror regeneration composed across nested real validator / commit-node / next-action / task-mirror processes. Parent CPU is stably 46–51s while ~85–100s is blocked on child *work*. This is the **#292 anti-false-green discipline**: the cross-process on-disk state handoff (one process writes ledger+baseline to disk and exits; the next re-reads it) IS the property under test (documented `test-adaptive-node.js:4114-4115, 5104, 5163, 7159-7161, 7344`).

2. **#37 `scripts/simulate-workflow-walkthrough.js` — ~160s avg (≈44% of the chain).** Higher jitter (140.13s / 179.82s, ~28%). Cost is **distributed**, not point-concentrated: testAdaptive* (45 scenarios, 33s), testSink* (28, 29s), testFinalize*/shared-tmp (18s), testClosure* (22, 11s). Each E2E scenario runs a full real git worktree + finalize + sink-merge transaction — the project's named non-negotiable internal correctness gate.

The remaining **~25%** is the 34 other validators, mostly cheap (most <1s; a long tail at #9 ~14s install-config, #19 ~14s bundle-claim, #20 ~11s, #6 ~11s, #11 ~9s, #14 ~8s, #25 ~6s — all genuine subprocess setup, none pathological).

**On the 358s-measured vs 574s-reference gap:** **load jitter, not structure**. The walkthrough alone swung ~28% between two consecutive same-machine runs; under heavier load both dominant units expand proportionally and 358s → 574s with zero change in spawn count or per-invocation logic. The durable, load-invariant finding is the **structural ranking** (#16 + #37 = ~75%), not any absolute second-count. This resolves D-512-01: the #512-observed ~574s claude chain is genuine end-to-end transaction work in two correctness gates, not timer padding, not a regression, not avoidable scaffolding.

## AC#2 decision

**(B) Genuine suite growth — no safe behavior-preserving reduction exists.** Precedence-ordered evidence:

- **H1 REFUTED** (spawn-count is not the lever): startup tax is 7% honest / ≤17% inflated upper-bound of #16's time — below n3's 15% refute threshold. The cost is **inside per-invocation logic**, so reducing spawn *count* cannot help without removing the work itself.
- **H2 REFUTED** (no avoidable redundancy): clone-from-template `s_clone (158ms) ≈ s_init (159ms)`, `cp -r` is *slower* (214ms) → `N×Δ ≈ 0` (and git is only ~5% of #16's cost anyway). The 6× `--freeze --repair` builds are **6 structurally distinct plan DAGs** (linear/fan-out/solo/diamond/split-guard/speculative, each a different plan_hash over a different Nodes table for a different failure mode) — dedup *deletes coverage*, it does not share redundant work.
- **H3 CONFIRMED** (irreducible coverage): #16 is **already optimally partitioned** — 327 pure-seam (no-subprocess) assertions via injected shell/readFile/writeFile seams, and only ~112 deliberate real-CLI spawns that ARE the #292 discipline. Collapsing the 112 real spawns into one process, stubbing the integrity seams, or batching the sequential lifecycle re-introduces exactly the in-process false-green class #292 was filed to prevent — a coverage regression, rejected.

**Adversarial assessment of the one remaining candidate — chain-level parallelism — and why it does NOT rescue (A):**

The only coverage-preserving lever is **orthogonal cross-command / cross-scenario parallelism** (run the 37 `&&`-chained commands and/or the 231 self-contained walkthrough scenarios concurrently). It reduces *makespan* but not *CPU work*. Weighed against precedence #1 (accuracy non-negotiable; rework is the most expensive outcome), it is **not recommendable as a #523 quick win**, for five concrete reasons:

1. **It is the exact contention n2 deliberately avoided.** n2 timed serially *specifically* so the numbers stayed accurate; concurrent execution on one machine contends for CPU/IO — the source of the ~28% jitter already observed.
2. **Flakiness / race risk against real git+sink transactions.** The walkthrough and #16 perform real `git worktree add/remove`, `merge --no-ff`, `update-ref`, ledger splices. Running these concurrently risks inter-test interference and non-deterministic failures — the most expensive outcome under precedence #1 (a flaky gate is worse than a slow one).
3. **The shared-tmp group (15 members) must stay serial** — one indivisible isolation unit by construction (`simulate-workflow-walkthrough.js:12731-12747`, enforced at main() 13043/13060-13062). Any parallel scheduler must carve it out — scheduler complexity for no gain on that slice.
4. **It breaks deterministic failure attribution and `&&` short-circuit semantics.** `A && B && C` gives a precise first-failure point and clean exit code; a concurrent runner interleaves output and loses ordered short-circuit — degrading the gate's diagnostic value (itself a correctness property).
5. **It is a #307 cross-edition change** touching the shared `&&`-chain runner (`package.json:35-41`) and/or the **6-copy walkthrough family**. Substantial four-chain blast radius — far past a quick win.

A makespan lever whose downside is a flaky correctness gate violates precedence #1. The risk dominates the win here, so it must **not** be sold as a #523 optimization.

## Recommended next step

**Close #523 with the documented-growth decision (D-523-01). Do NOT re-plan a D-523-02 build run.**

D-523-01 records: *the ~574s `test:kaola-workflow:claude` runtime is localized to #16 `test-adaptive-node.js` (~122s, genuine adaptive-node CLI transaction work, #292 anti-false-green discipline) + #37 `simulate-workflow-walkthrough.js` (~160s, distributed real git/worktree/sink-merge transactions) = ~75% of the chain; the 358s↔574s spread is load jitter, structurally load-invariant. Investigation (probe→assume→adversarial-falsify→converge) refuted spawn-count (H1) and avoidable-redundancy (H2) and confirmed genuine irreducible coverage (H3): no behavior-preserving edit to #16 reduces it without dropping load-bearing #292 assertions. Resolves the #512-deferred diagnosis D-512-01.*

There is **no D-523-02 build deliverable** — the honest output of a #486 Case-B shaping run when the adversarial falsifier overturns the seed premise (the issue assumed spawn-overhead was reducible; it is genuine work). Shipping a parallelism change would be net-negative under precedence #1. Per CLAUDE.md, this is "genuine suite growth — no safe reduction"; the runtime is the price of the project's non-negotiable internal correctness gates.

If makespan reduction is later judged worth a dedicated, risk-bounded design effort, that belongs in a **separate design track**, not a #523 quick fix.

## Cross-edition / design-track notes

- **#307 reach (flag for any FUTURE parallelism track, NOT for #523 closure):** chain-level or scenario-level parallelism touches the shared `&&`-chain runner in `package.json:35-41` (all four chains) and/or the **six-copy walkthrough family**: `scripts/simulate-workflow-walkthrough.js`, `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`, `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`, `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js`, `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`, `plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js`. **The recommended D-523-01 closure is docs/decision-only with zero code blast radius — no #307 obligation attaches to closing #523.**
- **Design-track alignment:** a chain-level / scenario-level test-parallelism effort aligns with the project's existing open makespan-design tracks (parallelism-kernel #463 / token-efficiency direction), where the per-leg isolation and race-safety machinery to make concurrent real-git tests safe would be designed properly. It does **not** belong in #523. If the owner wants the makespan lever, file it against that track with the risk constraints above — do not bolt a concurrent runner onto a passing correctness gate as a speed fix.

**Relation to prior decisions:** converges D-512-01 (the #512-deferred "why ~574s" diagnosis); consistent with #501 (accuracy comes from inside; keep the internal self-contained gates including `simulate-workflow-walkthrough.js`). Settled answer: the gates are doing exactly the work they exist to do, and that work is correctly not reducible.
