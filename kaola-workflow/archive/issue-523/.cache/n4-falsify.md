evidence-binding: n4-falsify c3ee9e742ffb
<!-- verdict: paste verdict here -->
verdict: pass — H1 REFUTED (startup tax = 7%, work-not-spawns); H2 REFUTED (s_clone≈s_init, 6× freeze build distinct DAGs); H3 CONFIRMED — genuine irreducible #292 anti-false-green coverage; NO safe behavior-preserving optimization exists.

## Job 1 — H1 refutation test

**Claim under test (H1, issue #523):** "Real-subprocess-spawn overhead (process-startup × N) dominates the runtime; #16 test-adaptive-node.js (~122s) is a 60-call-site spawn driver that fans into nested real subprocesses." Falsification criterion (n3-assume.md:16): REFUTE if `t × C` is a small fraction (< ~15%) of #16's time.

### Measured per-spawn startup tax `t` (this session, medians)
- `node -e ''`: median ~0.05s (20 samples: 0.02–0.08).
- `git --version`: ~0.00s (20 samples).
- **Real CLI module-load tax** (require + immediate usage-exit, the relevant `t`):
  - `kaola-workflow-adaptive-node.js`: **median 0.03s** (15 samples).
  - `kaola-workflow-plan-validator.js`: **median 0.02–0.03s** (15 samples).
  - `kaola-workflow-commit-node.js` / `next-action.js` / `task-mirror.js`: **median 0.02–0.03s** each (15 samples).
  - => `t_node ≈ 0.03s`, `t_git ≈ 0.005s`. n3/H1 assumed ~150–250ms; the real tax is **~5–10× smaller**.

### Effective spawn count `C` (instrumented run, execFileSync interceptor)
Instrumented `/usr/bin/time -p node --require <interceptor> scripts/test-adaptive-node.js` (131.49s wall; identical assertion count 1007):
- **780 top-level spawns**: 210 node (123.8s) + 570 git (6.9s). Time-inside-spawns = 130.7s = **99.4% of the run**.
- node breakdown: `kaola-workflow-adaptive-node.js` **112 calls = 104.7s (935ms/call avg)**; `plan-validator.js` 95 calls = 19.0s (200ms/call); task-mirror 2, stub 1.
- git breakdown: init 72, config 216, add 90, commit 84, rev-parse 51, worktree 24, merge 4, etc. — total **6.9s** (git is ~5% of cost).
- Nested fan-out decomposed directly (one real `open-next` = 592ms): fans into 5 node spawns (validator 69ms, next-action 28ms, commit-node 168ms, nested-validator 145ms, task-mirror 181ms) + 13 git. Depth-0/1/2 = 10/2/6 spawns.

### Ratio `(t × C) / 131s`
- Honest top-level tax: `210×0.03 + 570×0.005 = 6.30 + 2.85 = 9.15s` → **7.0%**.
- **Generous upper bound** (assume EVERY one of the 112 adaptive-node calls fans into 5 nested node spawns → +448 nested node startups): `9.15 + 448×0.03 = 22.6s` → **17.2%** — and this is a deliberate over-count (most of the 112 are not full close-and-open-next fan-outs).
- Per-call decomposition: adaptive-node call = **935ms; bare startup = ~30ms = 3%**. The other 97% is real work (plan-hash validation, ledger splice, barrier diff, task-mirror regeneration) across the nested validator/commit-node/next-action/task-mirror processes.

**H1 VERDICT: REFUTED (confidence: high).** Startup tax is 7% (honest) / ≤17% (inflated upper bound) of #16's time — below n3's 15% refute threshold. node spawns are 95% real work, 5% startup; git is only 5% of total cost. The runtime lives **inside per-invocation logic**, not in the spawn *count*. Isolation runs: 132.26s / 150.32s / 131.49s(instrumented) — parent CPU stably 46–51s (user+sys), so ~85–100s is blocked on child *work*, confirming the cost is compute inside children, not fork/exec overhead.

## Job 2 — AC#2: safe optimization or not

### H2 (avoidable redundancy) — REFUTED on both sub-claims
**Sub-claim A: `initGitRepo` → `git clone --local`/`cp -r` of a warmed template.** Measured (10 samples each, this repo's tiny baseline):
- `s_init` (init -b main + 3 config + add + commit) median = **159ms**.
- `s_clone` (`git clone --local` from prebuilt template) median = **158ms** — **identical** within noise.
- `cp -r` median = **214ms** — *slower*.
- n3's H2 refute criterion (n3-assume.md:25): REFUTE if `s_clone ≈ s_init`. It is. Both are dominated by ~5–6 git-process startups + fs ops at this repo size; clone has no advantage. `N × Δ ≈ 0`. **No material saving.** (Moot anyway for #16: all git there = 6.9s total, ~5% of cost.)

**Sub-claim B: the 6× `--freeze --repair` in #16 is "the same setup repeated; build once + copy."** FALSE. The 6 sites (test-adaptive-node.js:4147, 5156, 6022, 6168, 7201, 7380) freeze **6 structurally distinct plan DAGs**: linear a→review→finalize (#499b integrity-tamper); fan-out A,B→review (leg isolation); solo (single-leg); diamond A,B→C,D (multi-leg merge); A→review (#466 split-guard); impl→gate + docs→sink (#439). Each freeze computes a plan_hash over a *different* Nodes table for a *different* failure mode. There is no shared frozen plan to copy. One freeze-repair ≈ 571ms → 6× ≈ 3.4s total (a 2.6% slice), and de-duplicating would *delete distinct coverage*, not share redundant work.

### H3 (genuine irreducible coverage) — CONFIRMED
The test is **already optimally partitioned**: 327 pure-core assertions use injected `shell`/`readFile`/`writeFile` seams (NO subprocess — header line 6 doctrine), and only ~112 assertions spawn the real CLI. The real spawns are NOT an oversight — they are the **#292 anti-false-green discipline**, documented in-file:
- test-adaptive-node.js:4114-4115 — "Driving the real subprocess (not an injected ok:false stub) is the #292 anti-false-green discipline: a stubbed integrity test passes even if the wiring is wrong; this bites only the real path."
- :5104 "(#292 io-shim trap: a direct-call test with an injected git is a false-green)"; :5163, :7159-7161, :7344 — same doctrine.
Each real-CLI section carries a distinct issue tag (#292, #439, #466, #499b, #446-E, #446-F) asserting a separately-filed behavior; none are duplicative siblings. The task-mirror/validator/commit-node nested spawns are *production* hot-path behavior that the E2E sections legitimately exercise; the pure-core tests already stub them (e.g. :2535 injected task-mirror) where stubbing is safe.

**Batching the 112 real-CLI spawns into one process is NOT behavior-preserving:** the real-CLI calls are a **sequential lifecycle** (open-next writes ledger+baseline to disk and exits; the next process re-reads from disk) — the cross-process on-disk state handoff IS the property under test. Collapsing into one process re-introduces exactly the in-process false-green that #292 was filed to prevent. Converting real spawns → seams = a coverage regression, explicitly rejected by the adversarial mandate.

### AC#2 CALL: NO safe behavior-preserving optimization exists in #16.
- The dominant cost (104.7s = 112 adaptive-node CLI calls × 935ms) is **genuine end-to-end transaction work** (real ledger/git/barrier/task-mirror composition across real process boundaries) — H3, not H1 or H2.
- The two candidate "savings" both fail: clone-from-template (`s_clone ≈ s_init`, Δ≈0) and freeze dedup (6 distinct DAGs, deletes coverage).
- This is **genuine-growth / irreducible coverage**, not avoidable redundancy. Any speedup that removes the real subprocesses, batches the lifecycle into one process, or stubs the integrity seams **drops load-bearing #292 anti-false-green assertions** and is rejected.
- The only honest levers that preserve coverage are *orthogonal to #16's logic*: cross-command parallelism in the chain runner (run independent chain commands concurrently — out of #16's scope, doesn't touch the per-test work), or accepting the cost as the price of the project's non-negotiable internal correctness gate (CLAUDE.md precedence #1: accuracy is non-negotiable; rework is the most expensive outcome). Neither is a behavior-preserving edit to #16 itself.

## Worktree hygiene
`git status --porcelain` shows only `?? kaola-workflow/issue-523/` (this evidence folder). All scratch (/tmp/instrument_*.js, /tmp/drive_cycle.js, /tmp/*.txt, template repos) is outside the repo tree. Zero repo files touched.
