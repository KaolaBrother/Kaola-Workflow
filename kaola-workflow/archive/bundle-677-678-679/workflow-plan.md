# Workflow Plan — bundle-677-678-679

<!-- plan_hash: 4dbac45bdba5a52e28ce12bec1a38b3f21b3cd09eb9584bb05c0123865c8270d -->

## Meta
labels: workflow:in-progress
sink: CHANGELOG.md
validation_command: npm test
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-claim-677 | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/test-claim-hardening.js | 5 | sequence | standard |
| n2-node-678 | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 5 | sequence | standard |
| n3-gap-679 | tdd-guide | — | scripts/kaola-workflow-gap-sweep.js, plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js, scripts/test-gap-sweep.js | 5 | sequence | standard |
| n4-review | code-reviewer | n1-claim-677, n2-node-678, n3-gap-679 | — | 1 | sequence | reasoning |
| n5-adversary | adversarial-verifier | n4-review | — | 1 | sequence | reasoning |
| n6-finalize | finalize | n5-adversary | CHANGELOG.md | 1 | sequence | |

## Node Ledger

| id | status |
| --- | --- |
| n1-claim-677 | complete |
| n2-node-678 | complete |
| n3-gap-679 | complete |
| n4-review | complete |
| n5-adversary | complete |
| n6-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-claim-677) | subagent-invoked | deferred_to_group | |

| tdd-guide (n2-node-678) | subagent-invoked | deferred_to_group | |
| tdd-guide (n3-gap-679) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review 8fe77b9f5fd0 | |
| adversarial-verifier (n5-adversary) | subagent-invoked | evidence-binding: n5-adversary d0d32315e98d | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 3629fe5e48f8 | |
## Node Briefs

### n1-claim-677

Fix #677 test-first (RED before GREEN), across all four editions. Two coupled defects in the `claim.js` legacy/stale worktree-cleanup surface, both in the SAME fail-open family #672 partially closed.

**A2 (the defect) — `existsSync` stat-failure still fails open.** `worktreeDirtyState` (`scripts/kaola-workflow-claim.js:480`) opens with `if (!fs.existsSync(wtPath)) return 'missing';` (line 481) — hoisted OUT of the porcelain probe try/catch to distinguish `'missing'` (path absent) from `'unprobeable'` (path exists, probe threw, kept by both sweep consumers, line 492). But `fs.existsSync` returns **false for an existing path** when the *parent* dir is unreadable (`chmod 000`), so a genuinely-present worktree is misrouted to `'missing'` → the destructive consumers prune its registry entry + delete its merged-branch ref (content-safe — dir contents survive — but a wrong classification in the same fail-open family). **Fix (S):** replace the bare `existsSync` gate with a fail-CLOSED stat inside try/catch — `fs.lstatSync(wtPath)` in try/catch; on success + exists proceed to the porcelain probe as today; classify a thrown `EACCES`/`ENOTDIR`-on-parent (parent unreadable / not a dir) as the EXISTING `'unprobeable'` state (keep), NOT `'missing'`. Only a genuinely-absent path (`ENOENT`) returns `'missing'`. Do NOT invent a new state — reuse `'unprobeable'` (both consumers already keep it).

**A1 (test gap) — stale-sweep unprobeable-keep untested.** The #672 regression drives only `cmdLegacyWorktreeCleanup`; the sibling destructive consumer `cmdStaleWorktreeCleanup` (see line 439 comment) also keeps `'unprobeable'` but has NO shipped unit test — a future refactor could silently reintroduce the destructive path with a green suite. Add a MIRRORED `cmdStaleWorktreeCleanup` unprobeable-keep regression in `scripts/test-claim-hardening.js` (the file that already covers this surface): assert the worktree + its branch are KEPT when the state is `'unprobeable'`, exercised across the `--execute`/`--force`/`--archive`/`--export` modes the sweep supports. Also add the A2 parent-unreadable regression (a `chmod 000` parent on the container makes `existsSync` false while the path exists → assert KEPT, not pruned) — guard it to skip when run as root (root ignores the mode bit).

**Cross-edition:** `claim.js` is COMMON canonical↔codex (byte-identical, regenerate the codex twin via `node scripts/edition-sync.js --write`) + DIVERGENT gitlab/gitea forge HAND-ports (mirror the identical `worktreeDirtyState` fail-close diff into each forge body, preserving forge-only parts). After editing, `node scripts/edition-sync.js --check` must be clean and `validate-script-sync` export-superset intact. Run the walkthrough locally; the authoritative all-four-chain receipt runs once at n6-finalize over the merged branch (do NOT redundantly full-run all four chains here — verify your own diff + the walkthrough + edition-sync check).

### n2-node-678

Fix #678 test-first, across all four editions. `adaptive-node.js` is a GENERATED_AGGREGATOR (the four edition files are declared together per generated_port_split; regenerate the codex twin + forge ports via `node scripts/edition-sync.js --write`, then `--check` clean).

**R1 (in scope — the symmetric gap).** #674 made `open-ready`'s group-provisioning transaction drop each recorded MEMBER baseline before every post-baseline group-form abort via `dropRecordedBaselines(recordedBaselineIds)` (`scripts/kaola-workflow-adaptive-node.js:5205`, called at the 5 abort paths: mid-loop `baseline_failed` :5214, `stub_commit_failed` :5238, `leg_provision_failed` base-HEAD :5249, per-node :5263, `leg_base_anchor_failed` :5277). But the SHARED GROUP baseline — recorded ONCE BEFORE the member loop at :5146–5157 (`groupBaselineSha`; the `barrier-base-lg-<group_id>` file + `refs/kaola-workflow/barrier/<project>/lg-<...>` ref) — is NOT dropped on those same 5 aborts (adversary observed `file=true ref=true` post-abort on all 5). **Fix (S):** extend the abort-path cleanup so each of the 5 paths ALSO drops the group baseline (file + ref) whenever `groupBaselineSha` was recorded. Reuse the EXISTING group-baseline drop mechanism already used on the close/merge path (`--drop-base --node-id <group_id>`, see :6022) — e.g. a `dropGroupBaseline()` helper invoked alongside `dropRecordedBaselines`, idempotent (a `group_id` has no ledger row, so the #424 window-lock permits it). Keep it guarded so a pre-baseline abort (before :5157) never tries to drop a group baseline that was never recorded. **RED (`scripts/test-adaptive-node.js`):** drive `open-ready` to a post-baseline group-form abort (force one of the 5, e.g. a `leg_provision_failed`), assert PRE-fix the group `barrier-base-lg-*` file + ref STRAND (present post-abort), and POST-fix both are GONE while the ledger + lane_group stay untouched.

**R2 (redesign — DEFER unless trivially clean).** A hard-crash (SIGKILL-class) between recording the baselines and writing the Phase-1 running-set `opening` journal strands baselines with no `opening` marker for `reconcile-running-set` — unreachable via any refusal-return code, so it predates #674. Reordering the durable `opening`/breadcrumb write BEFORE baseline recording (or adding an orphan-baseline reconcile sweep) is an M-effort journal-ordering change with real crash-recovery blast radius. **Default: DEFER** — do NOT force a risky journal-ordering redesign into this bundle (First-Principle: correctness over scope). Assess whether the reorder is *trivially* clean and low-risk; if there is ANY doubt, leave R2 unfixed and record it so n6-finalize files it as **#680** in the `## Run gaps` section (`action=fix status=deferred filed=#680`). Only implement R2 if the reorder is provably clean AND you add a crash-window regression proving no baseline strands.

**Cross-edition:** GENERATED aggregator — the canonical edit propagates to the codex twin + gitlab/gitea forge ports via `node scripts/edition-sync.js --write`; `--check` must be clean. Run the walkthrough locally; the authoritative four-chain receipt runs at n6-finalize.

### n3-gap-679

Fix #679 test-first, across all four editions. One pre-existing edge in `gap-sweep.js`'s explicit-`--output` handling, OUTSIDE #675's archived-project refusal.

**The defect.** `runScan` (`scripts/kaola-workflow-gap-sweep.js:160`) fires the `project_archived` refusal only when the ACTIVE project dir is gone AND an archive exists (`!fs.existsSync(projectDir) && fs.existsSync(archiveDir)`, :172). When a LIVE project dir AND a same-named leftover archive BOTH exist, and the scan runs with an explicit `--output` (:434) pointed at the archive's `run-gaps.json`, the refusal does NOT fire (projectDir exists) → the live scan's result CLOBBERS the archived `run-gaps.json`, silently destroying a prior cycle's durable archived gap evidence. **Fix (S):** guard the explicit-`--output` write directly — refuse (or re-anchor) when the resolved `--output` path would overwrite an existing `run-gaps.json` that lives OUTSIDE the scanned project's own `.cache/` (e.g. any path under `kaola-workflow/archive/`, or more generally a `run-gaps.json` not equal to the scanned project's `kaola-workflow/<P>/.cache/run-gaps.json`). Emit a typed refusal (`--json`: `{ result: 'refuse', reason: <typed>, ... }`; else stderr + non-zero exit) rather than overwrite. NEVER clobber an archived/foreign `run-gaps.json`. Mirror the existing refusal shape/convention used by `project_archived`. **RED (`scripts/test-gap-sweep.js`):** set up a LIVE project `.cache` AND a same-named `kaola-workflow/archive/<P>/.cache/run-gaps.json` (non-empty), run a scan with `--output` aimed at the archive copy, assert the refusal fires and the archived `run-gaps.json` is byte-UNCHANGED; assert a normal in-project `--output` (the project's own `.cache/run-gaps.json`) still writes as before (no over-refusal). Use `KAOLA_GAP_ROOT` for the temp root (existing test convention).

**Cross-edition:** `gap-sweep.js` is COMMON canonical↔codex (byte, `node scripts/edition-sync.js --write`) + rename-normalized gitlab/gitea forge ports (HAND-EDIT the identical diff modulo the rename map). `--check` must be clean, `validate-script-sync` export-superset intact. Run the walkthrough locally; the four-chain receipt runs at n6-finalize.

### n4-review

G1 code-review gate over all three legs (post-dominates n1/n2/n3; the three legs are a parallel_safe antichain merged into the branch before this node runs). Verify each fix on the merged diff:
- (#677) `worktreeDirtyState` now fails CLOSED on a stat fault — a parent-unreadable/`EACCES` existing path is classified `'unprobeable'` (kept), only a genuine `ENOENT` returns `'missing'`; no new state was invented; BOTH destructive consumers still keep `'unprobeable'`; the new `cmdStaleWorktreeCleanup` unprobeable-keep regression + the A2 parent-unreadable regression are present and meaningful (not vacuous), guarded against root.
- (#678) all 5 post-baseline group-form abort paths now drop the GROUP baseline (file + ref) as well as the member baselines, idempotently, guarded so a pre-baseline abort never over-drops; the R1 regression asserts strand-pre / gone-post. Confirm the R2 disposition is explicit (fixed-with-regression OR deferred→#680), never silently dropped.
- (#679) the explicit-`--output` write refuses on a foreign/archived `run-gaps.json` target and does NOT over-refuse a normal in-project `--output`; the regression proves both.
Confirm edition parity — codex twins/forge ports faithfully mirror canonical, `node scripts/edition-sync.js --check` clean, `validate-script-sync` export-superset intact. Reasoning-tier review over a fail-open / silent-loss / crash-recovery correctness diff.

### n5-adversary

Adversarial change-gate (read-only; has Bash to RUN scenarios, writes nothing) over the merged three-leg diff. Try to REFUTE that each fix closes its class — these are fail-open / silent-loss / crash-recovery defects where a single missed path is a ship-blocker:
- (#677) construct a `chmod 000` parent so `existsSync` is false while the worktree exists, drive BOTH `cmdLegacyWorktreeCleanup` AND `cmdStaleWorktreeCleanup`, assert the worktree + branch are KEPT (no prune, no ref delete); probe whether any OTHER stat/existsSync gate in the cleanup surface still fails open.
- (#678) force each of the 5 post-baseline group-form abort paths and assert the group `barrier-base-lg-*` file + ref are GONE (not just the member baselines); assert the drop is idempotent and a pre-baseline abort does not error. If R2 was implemented, attempt the crash-window strand; if deferred, confirm it is filed (#680), not silently lost.
- (#679) run a live scan with `--output` at a same-named archive's `run-gaps.json` and assert refuse + byte-unchanged archive; attempt to trip an over-refusal on a legitimate in-project `--output`.
Emit a verdict (pass ONLY if no path leaks; fail with the concrete leak otherwise). Reasoning-tier.

### n6-finalize

Bundle sink closing #677, #678, #679 (all-or-nothing, one sink). Add THREE `CHANGELOG.md` `[Unreleased] ### Fixed` bullets:
- #677 — `worktreeDirtyState` now fails closed on a stat fault (a parent-unreadable existing worktree is classified `unprobeable`/kept, not `missing`/pruned); `cmdStaleWorktreeCleanup` unprobeable-keep now has a shipped regression.
- #678 — `open-ready` now drops the shared GROUP baseline (file + ref) alongside the member baselines on all 5 post-baseline group-form aborts (symmetric-gap close for #674). [If R2 fixed: note the pre-journal crash window closed; else note R2 deferred as #680.]
- #679 — `gap-sweep` now guards the explicit `--output` write, refusing to clobber a `run-gaps.json` outside the scanned project's own `.cache/` (protects a same-named leftover archive's gap evidence).
Each bullet notes the four-edition sync + all-four-chains-green. No decision record needed — three determinate bug fixes with the direction given in the issues (no value-laden fork); the only judgment (R2 defer) is a routine scope call recorded in `## Run gaps`, not an ADR. Run the authoritative run-chains receipt (serial, `--project`, all four editions) over the merged branch BEFORE the sink — a green claude chain alone is insufficient (`npm test` `&&`-short-circuits). If R2 was deferred, file #680 in `## Run gaps` (`action=fix status=deferred filed=#680`).
