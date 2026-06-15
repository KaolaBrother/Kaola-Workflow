# 2026-06-15 — Issue #463 completeness audit (post-closure)

**Trigger.** #463 ("Maximize parallel write fan-out via runtime-neutral per-leg `.kw` worktree
isolation + a synthesizer-resolved commit barrier") was revised several times and CLOSED **COMPLETED**
by the repo owner on 2026-06-14T17:41Z. This audit answers: *was the entire issue actually delivered?*

**Method.** A multi-agent audit workflow (`audit-463-completeness`, 28 agents, ~2M tokens): 6 parallel
finders traced each of the 18 ACs + ADR-0010 + the cross-cutting ×4/6-surface propagation against the
**actual current code** (×4 editions), then an adversarial verifier independently re-derived every
verdict (burden inverted — refuted-if-not-independently-confirmed), then a synthesis pass. The
adversarial pass **refuted 2 finder verdicts** (AC11 satisfied→partial, AC6 partial→missing), both
toward *less* complete — including gaps in this session's own step-2/step-3 work. Final tally across
the AC set: **2 satisfied, 6 partial, the rest missing.**

The full per-AC verified data and the workflow script are in the session transcript
(`workflows/scripts/audit-463-completeness-*.js`); the synthesized report follows verbatim.

---

# Completeness Audit — Issue #463 (per-leg `.kw` worktree isolation + synthesizer commit barrier)

## 1. Bottom line

**#463 is NOT fully implemented.** Only the first 3 of 5 sequencing steps shipped, and even those carry gaps. The entire **load-bearing parallel-write runtime — Steps 4 and 5 — is unshipped**: there is no leg-worktree provisioning, no per-leg barrier, no parent-clean fence, no synthesizer merge execution, no dependency-level commit barrier, no telemetry, no live-harness probe, and no ADR-0010. What shipped (Steps 1–3) is **freeze-time scaffolding** — a validator relaxation that is *unreachable in production*, a typed HALT reason no code raises, and a synthesizer role no code dispatches. Of 18 ACs + ADR-0010 + the cross-cutting propagation: **2 satisfied, 6 partial, 11 missing.** The issue was CLOSED COMPLETED while its own shipped code (CHANGELOG.md:11/19/26, schema comments) explicitly documents the core mechanism as "the step-4 remainder."

## 2. Per-sequencing-step status

| Step | Status | ACs | Justification |
|------|--------|-----|---------------|
| **1 — Validator relaxation** | **PARTIAL** | AC1, AC12, AC13, AC8-delivery (RENAME family) | Policy field + `kind` + PROTECTED + `--parallel-safe` relax shipped ×4 and unit-tested (110 assertions). BUT the relaxation is **production-dormant** (sole production caller `adaptive-node.js` runOpenReady never passes `--write-overlap-consent`), only 1 of 3 declared callsites was downgraded (declared-fan-out-group + antichain shared-ancestor still hard-refuse), and the required `RENAME_NORMALIZED_FAMILIES` entry for the forge classifier ports was never added → forge drift machine-unenforced. |
| **2 — Schema + HALT wiring** | **PARTIAL** | AC10 | `merge_conflict` enumerated in `ESCALATION_MARKERS` ×4, write-halt allowlist + clear-halt + operator hints wired and tested (operator can manually halt). BUT **no producer raises `merge_conflict`** and the **K=3 bounded-repair branch the AC names was never delivered by any step** (Step 2 re-deferred it; Step 3 never added it). |
| **3 — Synthesizer role/grammar/floor** | **PARTIAL** | AC11, AC14 | `synthesizer` in `CANONICAL_ROLES`/`WRITE_ROLES`, grammar FREEZE/REFUSE test passes, `agents/synthesizer.md` + opus default + floor scaffolding shipped ×4. BUT the **4 contract validators do not token-pin `synthesizer`** (an explicit Step-3 delivery item), the reasoning-class **floor is defined-but-unenforced** (a manifest/frontmatter override silently lowers synthesizer to sonnet/haiku — proven empirically), and there is no Codex synthesizer agent profile. |
| **4 — Scheduler legs + commit barrier + lifecycle** | **NOT SHIPPED** | AC2, AC4, AC5, AC6, AC7, AC8, AC9, AC16, AC17 | Zero implementation. `legPath`/`legBranch`/`.kw/legs` absent from all 4 runtime editions; no `git worktree add` for legs; no per-leg barrier; no parent-clean fence; no synthesizer merge / mechanical octopus / Opus dispatch; no level commit barrier; no leg-aware reconcile; no `leg_opened`/`leg_committed`/`level_merged` telemetry. The `--group-barrier` still diffs a working-tree `snapshotWorktree` snapshot, NOT the merge commit M (the exact B1 false-green hole AC9 mandates fixing). `git log --grep=463` shows no step-4 commit. |
| **5 — Live probe + ADR-0010 + Codex deny** | **NOT SHIPPED** | AC18, AC15, AC3, ADR-0010 | No `docs/decisions/0010-*.md`; no recorded ≥2-leg live-harness run; no 2nd injected-conflict run; no documented Codex write-time-DENY verification; the K=2 thrash-nudge bound and absolute-path leg discipline prose exist nowhere (0/6 surfaces). |

## 3. Per-AC verdicts (FINAL/adversarial)

| AC | Step | Final verdict | One-line evidence-or-gap |
|----|------|---------------|---------------------------|
| **AC1** | 1 | **partial** | `--parallel-safe` relax + exact/PROTECTED/off floors shipped ×4 (110 assertions), but clause 5 ("out-of-lane writes fail the per-leg barrier") is unshipped Step-4 runtime, and the relaxation is unreachable in production (no consent carrier passed by the scheduler). |
| **AC12** | 1 | **satisfied** | `write_overlap_policy` defaults `off` (byte-identical-to-today), distinct from #439's field, exact-file refused at freeze, relax requires per-run consent — all 4 sub-claims test-backed, ×4 byte-identical. |
| **AC13** | 1 | **satisfied** | `disjointWriteSets` verdict pure; only additive `kind` added; T463-PURITY + the three caller-path regression tests (antichain/fan-out/G-SEL-4 in the walkthrough) pass green, establishing caller-indifference empirically. |
| **AC8-delivery (RENAME family)** | 1 | **partial** | PROTECTED/isProtected/kind hand-propagated ×4 (correct today), but **no `RENAME_NORMALIZED_FAMILIES` entry** for the forge classifier ports → drift machine-unenforced (proven: injected drift still passes `validate-script-sync.js`). |
| **AC10** | 2 | **partial** | `merge_conflict` enumerated + write-halt landing/clearing/hints/prose shipped and operator-invokable, but **no producer raises it** and the **K=3 bounded-repair branch is absent** (never delivered by any step). |
| **AC11** | 3 | **partial** *(refuted from satisfied)* | Role wiring + grammar FREEZE/REFUSE test + synthesizer.md + opus floor shipped ×4, but the AC's own "4 contract validators token-pin synthesizer" trace item is **confirmed unmet** (synthesizer=0 in all 5 validators while sibling `merge_conflict`=1). |
| **AC14** | 3 | **partial** | `synthesizer:'opus'` default + `REASONING_FLOOR_ROLES` + `isReasoningClass` shipped ×4, but the **floor is non-enforced** — a frontmatter/manifest override silently lowers it; zero consumers; post-G1 intent-verifier uncovered. |
| **AC2** | 4 | **missing** | No leg-worktree provisioning; `.kw/legs`/`legPath` absent from all runtime ×4; no nested-leg-corrupts-snapshotWorktree regression test. Both conjuncts wholly absent. |
| **AC4** | 4 | **missing** | No per-leg barrier (close-node barriers the parent only), no parent-clean fence, write-lane hook rule (a) is dead (no `worktreePath`/`legPath` ever written to running-set); own-lane parent slip remains uncaught. |
| **AC5** | 4 | **missing** | `legPath` count = 0 repo-wide; `snapshotWorktree` never called with a leg path; no script-owned leg-branch commit fallback; no agent-SHA cross-check seam. |
| **AC6** | 4 | **missing** *(refuted from partial)* | No mechanical `git merge`/octopus, no conditional Opus dispatch, and the reasoning-class floor is default-only + unenforced (silent downgrade possible). 0%+0%+(default-only) = missing, not partial. |
| **AC7** | 4 | **missing** | No level-by-level scheduler, no per-level synthesizer merge, no "refuse to open level N+1 until merge commit + HEAD advance"; synthesizer exists only as a grammar role. |
| **AC8** | 4 | **missing** | Singleton path is true only via pre-existing #437 behavior; the ≥2→legs/synthesizer alternative it must fast-path AROUND does not exist (no leg machinery at any width) → vacuous. |
| **AC9** | 4 | **missing** | Union barrier STILL diffs a working-tree `snapshotWorktree` snapshot, not merge commit M (active violation of the B1-fix the AC mandates); no per-leg barrier; no parent-clean fence. |
| **AC16** | 4 | **missing** | `reconcile-running-set` is ledger/lane-group only — not leg-aware; no durable per-leg branch state, no `git worktree remove` for legs, no idempotent re-synthesis. |
| **AC17** | 4 | **missing** | `leg_opened`/`leg_committed`/`level_merged` = 0 matches repo-wide; `appendNodeTiming` emits only {opened, evidence, closed, halted, halt_cleared}. |
| **ADR-0010** | 5 | **missing** | No `docs/decisions/0010-*.md`; highest is 0009; none of the three required decisions recorded anywhere. |
| **AC18** | 5 | **missing** | No recorded ≥2-leg live-harness run, no 2nd injected-conflict run; the only "2-leg probe" string is the read-axis #472 probe naming #463's as a not-yet-existing analog. Premature close against this release-gate AC. |
| **AC15** | 5 | **missing** | No #463-authored Codex write-time-DENY verification (only a pre-#463 "deny may differ, flag stays off" TODO); the per-leg-barrier backstop it names is itself unbuilt. |
| **AC3** | 5 | **missing** | The 3 prose statements (discipline-dependent isolation, fail-closed denial/overflow, K=2 thrash bound) are absent from all 6 surfaces; K=2 appears nowhere in the repo. |
| **cross-cutting ×4 / 6-surface** | 0 | **partial** | Shipped data (schema/classifier/resolver) is ×4 byte/content-aligned, but RENAME family entry missing, validators pin only `merge_conflict` (PROTECTED/write_overlap_policy/synthesizer = 0), synthesizer prose reaches 4/6 surfaces. |

## 4. Punch-list to actually complete #463

**Scaffolding already in place (reusable, do NOT rebuild):**
- `write_overlap_policy` field + `parseWriteOverlapPolicy` + freeze-legal sets (×4, byte-identical).
- `disjointWriteSets` additive `kind` + `PROTECTED`/`isProtected` classifier (×4, content-aligned).
- `writeOverlapRelaxable` predicate + `--parallel-safe` gate wiring (CLI-reachable, unit-tested).
- `merge_conflict` in `ESCALATION_MARKERS`; write-halt allowlist/clear/hints; resumable-consent-halt landing (×4).
- `synthesizer` role in `CANONICAL_ROLES`/`WRITE_ROLES`; grammar FREEZE/REFUSE test; `agents/synthesizer.md`; `synthesizer:'opus'` default + `REASONING_FLOOR_ROLES`/`isReasoningClass` (defined, exported, ×4).

**Load-bearing runtime — the actual parallel-write engine (Step 4), all unbuilt, in dependency order:**
1. **Leg provisioning** in `open-ready`/`runOpenReady`: `git worktree add .kw/legs/<project>/<node>` off feature-branch HEAD on `kw/legs/<project>/<node>`; record `{legPath, legBranch, baseline}` in `running-set.json` (two-phase opening→open). (AC2)
2. **Consent carrier wiring**: thread `--write-overlap-consent` from the scheduler/skill to `--parallel-safe` so the Step-1 relaxation is *reachable in production*; downgrade the remaining 2 callsites (declared-fan-out-group loop, antichain shared-ancestor) so the freeze-matrix rows the issue scopes actually relax. (AC1 remainder)
3. **Per-leg barrier** in `close-node`: `snapshotWorktree(legPath)` vs branch-point ⊆ declared set; script-owned leg-branch commit fallback; agent-SHA cross-check. (AC4, AC5)
4. **Parent-clean fence**: assert `git status --porcelain` empty in the parent before merge → routes own-lane slip to `merge_conflict`. (AC4)
5. **Synthesizer execution**: mechanical `git merge`/octopus for disjoint legs (no agent); conditional Opus synthesizer-agent dispatch only on a real 3-way conflict; **enforce** the reasoning-class floor at dispatch (refuse non-reasoning tier). (AC6, AC14 enforcement)
6. **Union barrier on merge commit M**: change `--group-barrier` from `snapshotWorktree` working-tree snapshot to `diff-tree <baseline> M` ⊆ union (the B1 false-green fix). (AC9)
7. **Dependency-level commit barrier**: drain level → synthesize → commit → advance HEAD → refuse to open level N+1 until advance; next level branches from new HEAD; singleton fast-path. (AC7, AC8)
8. **`merge_conflict` producers + K=3 bounded repair**: raise on unmergeable conflict / barrier overflow / K=2 thrash / no-op leg; route like `test_thrash` → `build-error-resolver` cap K=3 → escalate. (AC10 remainder, AC3 thrash bound)
9. **Leg-aware reconcile + teardown**: `reconcile-running-set` rolls a leg forward/back (revert→drop branch→`git worktree remove`), orphan-leg sweep, idempotent re-synthesis. (AC16)
10. **Telemetry**: `appendNodeTiming` emits `leg_opened`/`leg_committed`/`level_merged`. (AC17)

**Propagation / governance gaps (smaller, can ride alongside):**
11. Add the `RENAME_NORMALIZED_FAMILIES` entry for the two forge classifier ports (note: ports are NOT pure rename-normalized copies today — they carry forge-divergent `os` require + CI-path comments, so this needs reconciliation first). (AC8-delivery, Risk #8)
12. Token-pin `write_overlap_policy`, `PROTECTED`, and `synthesizer` in the 4 contract validators (only `merge_conflict` is pinned). (AC11, cross-cutting)
13. Propagate synthesizer/`write_overlap_policy` prose + absolute-path leg discipline + fail-closed-denial + K=2 thrash bound to all 6 routing surfaces (synthesizer reaches 4/6; the rest 0/6). (AC3, cross-cutting)
14. Codex synthesizer agent profile ×3 editions + `test-agent-profile-parity` coverage. (AC11 note)

**Step 5 deliverables (all unbuilt):**
15. Author `docs/decisions/0010-*.md` recording: ADR-0008 fulfilled-not-reversed, the `.kw/legs` substrate decision, the `isolation:'worktree'` rejection-for-neutrality. (ADR-0010)
16. Documented Codex write-time-DENY verification result. (AC15)
17. The **live-harness probe**: a recorded run with ≥2 `.kw/` legs committing their lanes + synthesizer merge + per-leg/union barriers + terminal four-chain + clean teardown, PLUS a 2nd injected-same-file-conflict run exercising the Opus synthesizer + `merge_conflict`. (AC18 — the explicit release gate)

## 5. Was the COMPLETED closure justified?

**No.** The closure is premature and, on the v2 scope, indefensible — not a borderline judgment call but a clear gap between the recorded state and the closure label:

- **The release gate itself (AC18) is entirely unmet.** AC18 is explicitly a "release gate" requiring a recorded live run of ≥2 leg worktrees + synthesizer merge + both barriers + teardown, plus a 2nd injected-conflict run. Zero of its six prongs have recorded evidence, and the runtime it would exercise does not exist. Closing COMPLETED with the designated release gate at 0% is the single strongest indictment.

- **The core mechanism the redesign is named for does not exist.** The issue title and v2 scope are "per-leg `.kw` worktree isolation + a synthesizer-resolved commit barrier." Neither the leg worktrees nor the commit barrier nor the synthesizer execution were built — `legPath`/`.kw/legs` appears in zero scripts. What shipped is the *narrow precursor* (Step 1, the original pre-v2 scope) plus two enabling-but-inert layers.

- **The shipped code self-documents the incompleteness.** CHANGELOG.md:11/19/26 and the schema/resolver comments repeatedly state the leg scheduler, synthesizer dispatch, merge_conflict-raising runtime, K=3 enforcement, and AC18 probe are "the step-4 remainder" / "#463 stays OPEN." The repo's own primary-source record contradicts the COMPLETED label.

- **Even the parts that "shipped" are largely non-functional in production.** The Step-1 relaxation is unreachable (no consent carrier on the production path); the Step-2 HALT has no producer; the Step-3 floor is silently lowerable. These are real, tested code, but they deliver no observable end-user behavior change because the runtime that would consume them was never built.

- **What WAS legitimately delivered:** AC12 and AC13 are genuinely satisfied, and Steps 1–3 are real, ×4-propagated, test-backed engineering — a defensible *partial* milestone. A correct status would have been "Steps 1–3 of 5 shipped; #463 remains OPEN pending the Step-4 runtime + Step-5 probe/ADR," which is exactly what the CHANGELOG entries say. The COMPLETED closure overstates that by two full sequencing steps and the entire load-bearing runtime.

**Relevant file paths:** `/tmp/issue-463-body.md` (AC + sequencing source); shipped Step 1–3 code lives in `scripts/kaola-workflow-plan-validator.js`, `scripts/kaola-workflow-classifier.js`, `scripts/kaola-workflow-adaptive-schema.js`, `scripts/kaola-workflow-resolve-agent-model.js`, `scripts/kaola-workflow-adaptive-node.js` (+ the 3 plugin edition trees); the missing runtime would land in `scripts/kaola-workflow-adaptive-node.js` (runOpenReady/runCloseNode/runReconcileRunningSet) and `scripts/kaola-workflow-plan-validator.js` (`--group-barrier`); the missing ADR belongs at `docs/decisions/0010-*.md`; the unenforced sync gap is `scripts/validate-script-sync.js` (`RENAME_NORMALIZED_FAMILIES`).
