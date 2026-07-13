# Workflow Plan — bundle-680-681

<!-- plan_hash: d3db62f9f8b90f11b3b1590cc4f63adba75aa5b0fbc3cbccc7e5e33c11407f5c -->

## Meta
labels: workflow:in-progress
sink: CHANGELOG.md
validation_command: npm test
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-node-680 | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 5 | sequence | reasoning |
| n2-gap-681 | tdd-guide | — | scripts/kaola-workflow-gap-sweep.js, plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js, scripts/test-gap-sweep.js | 5 | sequence | standard |
| n3-review | code-reviewer | n1-node-680, n2-gap-681 | — | 1 | sequence | reasoning |
| n4-adversary | adversarial-verifier | n3-review | — | 1 | sequence | reasoning |
| n5-finalize | finalize | n4-adversary | CHANGELOG.md | 1 | sequence | |

## Node Ledger

| id | status |
| --- | --- |
| n1-node-680 | complete |
| n2-gap-681 | complete |
| n3-review | complete |
| n4-adversary | complete |
| n5-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-node-680) | subagent-invoked | deferred_to_group | |

| tdd-guide (n2-gap-681) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review d2be1e19875e | |
| adversarial-verifier (n4-adversary) | subagent-invoked | evidence-binding: n4-adversary 15d47c7946f4 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 6e539f13cbfd | |
## Node Briefs

### n1-node-680

Fix #680 test-first (RED before GREEN), across all four editions. `adaptive-node.js` is a GENERATED_AGGREGATOR (the four edition files are declared together per generated_port_split; edit the CANONICAL `scripts/kaola-workflow-adaptive-node.js`, then `node scripts/edition-sync.js --write` to regenerate the codex twin + gitlab/gitea forge ports; `--check` must be clean). Two coupled residuals in the SAME `runOpenReady` lane-group baseline lifecycle (both crash/race-window-only, pre-existing, non-regressive — the #678 R2 defer + the #678 n5 adversarial-verifier R1 finding).

**Part A (S — the Phase-2 non-drop).** `runOpenReady`'s Phase-2 ledger-seeding/promotion loop (`scripts/kaola-workflow-adaptive-node.js` ~5357–5384, AFTER the Phase-1 baseline record + leg provisioning) has TWO aborts that strand baselines: `baseline_failed` (~5368) and `node_not_in_ledger` (~5374). Neither drops the shared GROUP baseline (`barrier-base-lg-<group_id>` file + `refs/kaola-workflow/barrier/<project>/lg-<...>` ref) NOR the per-MEMBER baselines. **The prior justifying rationale is FACTUALLY WRONG** — the reasoning that "`--drop-base` is illegal in Phase-2 because the ledger is flipping" does not hold: the on-disk ledger is not written (`writeFile(planPath, planContent)`, ~5384) until AFTER the Phase-2 loop completes, so `--drop-base` is legal at BOTH abort points (a `group_id` has no ledger row regardless, and member ids are not yet flipped on disk). **Fix:** at BOTH Phase-2 aborts, drop the group baseline (`dropGroupBaseline`, already defined ~5218 from #678) AND the member baselines (`dropRecordedBaselines(recordedBaselineIds)`, already defined ~5205 from #674), guarded so a path with no recorded group/member baseline never over-drops. Correct/remove the misleading "--drop-base illegal in Phase-2" comment. **RED (`scripts/test-adaptive-node.js`):** force a Phase-2 abort (e.g. a `baseline_failed` on the Phase-2 idempotent `--start` re-record, or a `node_not_in_ledger` via a concurrent ledger mutation), assert PRE-fix that BOTH the group `barrier-base-lg-*` file+ref AND the member baselines STRAND (present post-abort), and POST-fix both classes are GONE while the ledger + lane_group stay untouched.

**Part B (M — the pre-journal SIGKILL window). PREFER THE ADDITIVE, SAFER APPROACH (orphan-reconcile sweep).** A hard-crash (SIGKILL-class, executes no cleanup) between recording the member/group baselines (Phase-1, ~5146–5157 group + the leg-provisioning member loop) and writing the Phase-1 running-set `opening` journal (`writeFile(runningSetPath, ...openingSet...)`, ~5355) strands those baselines with NO `opening` marker for `reconcile-running-set` to find — unreachable via any refusal-return path. Two ways to close it:
1. Reorder the durable `opening`/breadcrumb write BEFORE baseline recording, OR
2. Add an **orphan-baseline reconcile sweep** — extend `runReconcileRunningSet` (`~6120`) with a pass that enumerates `barrier-base-*` files/refs and DROPS those with NO live owner (no live ledger-row `in_progress`/terminal owner AND not referenced by any live running-set member / lane_group descriptor).

**Strongly PREFER (2).** This is a self-hosting workflow engine: REORDERING the hot-path crash-recovery ordering carries real blast radius, whereas an additive orphan-reconcile sweep is safe and directly testable. **The correctness hazard to reason about carefully: the sweep must NEVER drop a LIVE baseline.** Scope the "orphan" predicate to no-owner baselines ONLY — a `barrier-base-<id>`/`barrier-base-lg-<gid>` whose id/group_id has NO `in_progress`-or-terminal ledger row AND is NOT present in the current `running-set.json` (`nodes[]` ids, `lane_group.group_id`, `lane_group.members`). A baseline whose owner is any live/terminal ledger row or any live running-set member is KEPT. Prefer running this sweep alongside the existing orphan-leg sweep at the top of `runReconcileRunningSet` (which already runs even on the `no_running_set` lost-manifest path — the exact crash shape here); make it fail-soft (reconcile must never throw). **RED:** simulate an orphan baseline — a recorded `barrier-base-*` file+ref with no live ledger/running-set owner — assert it SURVIVES `reconcile-running-set` pre-fix; GREEN: the sweep drops it. Add a companion assertion that a LIVE baseline (owner is an `in_progress` ledger row / live running-set member) is NOT dropped by the sweep (guard the false-positive).

**Fallback ladder (a real judgment delegated to you, recorded in evidence):** if (2) is genuinely infeasible, you MAY fall back to a carefully-scoped (1) with a crash-window regression — but (2) is the DEFAULT. If BOTH prove too risky to land SAFELY in this cycle, implement Part A ONLY and DEFER Part B with a recorded gap (n5-finalize files it: `action=fix status=deferred filed=#<new>`). Do NOT force an unsafe reorder — First Principle: correctness over scope.

**Cross-edition:** GENERATED aggregator — the canonical edit propagates to the codex twin + gitlab/gitea forge ports via `node scripts/edition-sync.js --write`; `--check` must be clean; `validate-script-sync` export-superset intact. Run `node scripts/simulate-workflow-walkthrough.js` locally; do NOT redundantly full-run all four chains here — the authoritative all-four-chains receipt runs ONCE at n5-finalize over the merged branch.

### n2-gap-681

Fix #681 test-first (RED before GREEN), across all four editions. Trivial belt-and-suspenders on #679's `foreign_run_gaps_output` guard in `gap-sweep.js`. `gap-sweep.js` is COMMON canonical↔codex (byte-identical; regenerate the codex twin via `node scripts/edition-sync.js --write`) + rename-normalized gitlab/gitea forge HAND-ports (mirror the identical diff modulo the rename map). NOT in GENERATED_AGGREGATORS, but all four edition files move together for cross-edition parity.

**The defect.** `runScan` (`scripts/kaola-workflow-gap-sweep.js` ~200–204) refuses `foreign_run_gaps_output` only when `path.basename(outputPath) === 'run-gaps.json' && path.resolve(outputPath) !== path.resolve(ownArtifactPath) && fs.existsSync(outputPath)`. The `&& fs.existsSync(outputPath)` clause means an explicit `--output` at a **non-existent** foreign `run-gaps.json` is NOT refused → the live scan writes a stray fresh `run-gaps.json` outside the scanned project's own `.cache/`. **Fix:** DROP the `&& fs.existsSync(outputPath)` existence precondition — refuse ANY foreign `run-gaps.json` `--output` target regardless of pre-existence, so a scan NEVER writes a `run-gaps.json` outside its own `kaola-workflow/<P>/.cache/`. Keep the legitimate in-project `--output` (== the project's own default `ownArtifactPath`) UNAFFECTED — the `path.resolve(outputPath) !== path.resolve(ownArtifactPath)` clause already exempts it; do NOT over-refuse it. Update the refusal `detail` string that currently says "and already exists there" so it no longer claims pre-existence is required.

**RED (`scripts/test-gap-sweep.js`, `KAOLA_GAP_ROOT` temp-root convention):** an explicit `--output` at a **non-existent** foreign `run-gaps.json` (e.g. under `kaola-workflow/archive/<P>/.cache/` or any other project's `.cache/`) must ALSO refuse `foreign_run_gaps_output` and write NOTHING (assert no file created at that path). Assert the legitimate in-project `--output` (== the project's own `.cache/run-gaps.json`) still WRITES as before (no over-refusal). Keep the existing #679 already-exists refusal regression green.

**Cross-edition:** COMMON byte canonical↔codex via `node scripts/edition-sync.js --write` (`--check` clean) + hand-mirror the identical one-line diff into the gitlab/gitea forge ports modulo the rename map; `validate-script-sync` export-superset intact. Run the walkthrough locally; the four-chain receipt runs at n5-finalize.

### n3-review

G1 code-review change-gate over BOTH legs (post-dominates n1-node-680 + n2-gap-681; the two legs are a parallel_safe antichain merged into the branch before this node runs — serial before the adversary so review is never bypassed). Verify each fix on the merged diff:
- (#680 Part A) BOTH Phase-2 aborts (`baseline_failed`, `node_not_in_ledger`) now drop the GROUP baseline (file + ref) AND the member baselines, idempotently and guarded so a pre-baseline abort never over-drops; the wrong "--drop-base illegal in Phase-2" rationale is corrected/removed; the RED regression asserts strand-pre / gone-post for BOTH baseline classes.
- (#680 Part B) confirm the disposition is EXPLICIT (orphan-reconcile sweep implemented WITH the false-positive guard test, OR a carefully-scoped reorder with a crash-window regression, OR Part-A-only with Part B deferred+filed — never silently dropped). If the sweep landed, verify the orphan predicate scopes to NO-live-owner baselines only (no live/terminal ledger row AND not in running-set.json) and that a LIVE baseline is provably NOT dropped; verify it is fail-soft (reconcile never throws).
- (#681) the explicit-`--output` write now refuses a foreign `run-gaps.json` target REGARDLESS of pre-existence (the `fs.existsSync` precondition is gone), and does NOT over-refuse a legitimate in-project `--output`; the regression proves both.
Confirm edition parity — codex twins/forge ports faithfully mirror canonical, `node scripts/edition-sync.js --check` clean, `validate-script-sync` export-superset intact. Reasoning-tier review over a crash-recovery / silent-loss correctness diff on a self-hosting engine.

### n4-adversary

Adversarial change-gate (read-only; has Bash to RUN scenarios, writes nothing) over the merged two-leg diff. Try to REFUTE that each fix closes its class — these are crash-recovery / silent-loss defects where a single missed path is a ship-blocker. **Especially stress #680 Part B:**
- (#680 Part B — the priority) if the orphan-reconcile sweep landed: does it have FALSE-POSITIVE risk — can it drop a LIVE baseline? Construct a LIVE baseline (owner is an `in_progress` ledger row AND/OR a live running-set member / lane_group member) and assert the sweep does NOT drop it. Construct a genuine orphan (recorded `barrier-base-*` file+ref, no live ledger/running-set owner, incl. the lost-manifest `no_running_set` path) and assert it IS dropped. Probe boundary cases: a terminal (complete / n.a) ledger owner (must KEEP — teardown is the close path's job, not an orphan), a group baseline whose group_id is still in a live `lane_group` descriptor (KEEP), a member baseline for a `pending` row that is a live running-set member mid-open (KEEP). Confirm fail-soft (a malformed baseline file / unreadable ref never throws out of reconcile). If Part B was DEFERRED instead, confirm it is filed (not silently lost) and that Part A alone is complete.
- (#680 Part A) force BOTH Phase-2 aborts and assert the group `barrier-base-lg-*` file + ref AND the member baselines are GONE (not just one class); assert the drop is idempotent and a pre-baseline abort does not error.
- (#681) run a live scan with `--output` at a NON-EXISTENT foreign `run-gaps.json` and assert refuse + nothing written; attempt to trip an over-refusal on a legitimate in-project `--output` (== own default path); confirm the #679 already-exists case still refuses.
Emit a verdict (pass ONLY if no path leaks / no live baseline is droppable; fail with the concrete leak otherwise). Reasoning-tier.

### n5-finalize

Bundle sink closing #680 AND #681 (all-or-nothing, one sink). Add TWO `CHANGELOG.md` `[Unreleased] ### Fixed` bullets:
- #680 — `open-ready` now drops the shared GROUP baseline (file + ref) and the per-member baselines on BOTH Phase-2 aborts (`baseline_failed`, `node_not_in_ledger`), closing the #674/#678 symmetric-gap residual; the wrong "--drop-base illegal in Phase-2" rationale is corrected. [If Part B fixed: note the pre-journal SIGKILL crash-window closed via the orphan-baseline reconcile sweep (or reorder); else note Part B deferred → filed #<new>.]
- #681 — `gap-sweep` now refuses a foreign/archived `run-gaps.json` `--output` target regardless of pre-existence (dropped the `fs.existsSync` precondition), so a scan never writes a `run-gaps.json` outside its own `.cache/`; legitimate in-project `--output` unaffected.
Each bullet notes the four-edition sync + all-four-chains-green. No decision record needed — both are determinate bug fixes with direction given in the issues (machines decide facts; no value-laden fork). The only judgment (Part B sweep-vs-reorder-vs-defer) is a routine scope/risk call recorded in the node evidence + `## Run gaps` if deferred, NOT an ADR. Run the authoritative run-chains receipt (serial, `--project`, all four editions) over the merged branch BEFORE the sink — a green claude chain alone is INSUFFICIENT (`npm test` `&&`-short-circuits on the first failure). This is the final run before the release cut. If Part B was deferred, file it in `## Run gaps` (`action=fix status=deferred filed=#<new>`).
