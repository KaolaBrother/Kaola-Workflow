# #463 AC18 live-harness probe + AC15 Codex write-DENY verification (release gate)

Date: 2026-06-15
Issue: #463 (Slice 6 — the issue-closing slice)
Status: **PASS** — both AC18 prongs recorded against the real runtime; AC15 verified.
Relates: `docs/decisions/0010-runtime-neutral-per-leg-worktree-isolation.md`,
`docs/investigations/2026-06-15-463-completeness-audit.md` (the audit that reopened #463 and named AC18 the
release gate), `project_parallel_read_dispatch_dormant` (the #472 read-axis live-probe precedent this mirrors).

## Why this document exists

AC18 is the explicit **release gate**: closing #463 honestly requires a *recorded live run* of ≥2 `.kw/` legs
committing their lanes + a synthesizer merge + the per-leg/union barriers + clean teardown, **plus** a second
injected-same-file-conflict run that exercises the **Opus synthesizer agent**. The original #463 closure
certified this gate at 0% (the sin that reopened it). The unit/integration suite (`test-adaptive-node.js`,
983 assertions) proves the runtime *state machine*; it **cannot** prove real concurrent dispatch — no unit
test can capture the ledger co-open span or a real agent writing into a leg. **The live dispatch IS the
artifact.** Both runs below were driven by the real scripts (`kaola-workflow-adaptive-node.js`,
`kaola-workflow-plan-validator.js`) in throwaway `mkdtemp` repos, with **real `Agent`-tool dispatches** (not
the test harness), and torn down.

---

## Run 1 — disjoint legs, real concurrent dispatch (the #463 core win)

A frozen 2-write-node plan (`AA → ax.js`, `BB → by.js`, disjoint; `write_overlap_policy: disjoint`) under a
real git repo. `open-ready` (`KAOLA_LANE_CONTAINMENT=1 KAOLA_LEG_ISOLATION=1 --write-overlap-consent`)
co-opened both legs; **two real agents were dispatched in ONE assistant message** (the only thing that yields
true concurrency), each instructed with its **absolute `legPath`** (the AC3 discipline) to write its declared
file. Then `close-node AA` (deferred) → `close-node BB` (last → synthesize → union barrier → teardown).

| prong | evidence |
|---|---|
| ≥2 `.kw/` legs provisioned | `.kw/legs/issue-463-probe/{AA,BB}`, each a real `git worktree` branched off base `190ea142` |
| **real concurrent dispatch** | 2 `Agent` calls in one message; each wrote ONLY its declared file (`?? ax.js` / `?? by.js`) via absolute `legPath` — in-lane, no cross-contamination |
| **co-open span (everConcurrent)** | `deriveMaxSimultaneousOpen` over the real timings → `{maxSimultaneousOpen: 2, everConcurrent: true}`. The timings show `AA opened 12:35:26.832Z`, `BB opened 12:35:26.980Z`, and the first `closed` (AA) at `12:36:24.110Z` — i.e. both legs were open simultaneously from `12:35:26.980Z` to `12:36:24.110Z`, ≈ 57s of genuine simultaneous open (the window spans the minute boundary) |
| legs commit their lanes | script-owned capture committed each leg; telemetry `leg_committed ×2` |
| synthesizer merge (mechanical, no agent) | `close BB` → `barrier: group_passed`, `synthesized: true`; merge commit **M = `fae6a606`**, parents = `190ea142`(base) + `376baa31`(AA) + `f7bdbb37`(BB) — a 3-parent octopus |
| **union barrier on M** | `diff-tree base→M` = `ax.js by.js` = exactly the legs' declared union; `HEAD == M` (the dependency-level commit advance) |
| full leg-lifecycle telemetry (AC17) | `leg_opened ×2 → leg_committed ×2 → level_merged ×1` |
| clean teardown | 0 leg worktrees left, 0 `refs/kaola-workflow/leg-base/*` refs left, ledger `AA/BB → complete` |

Recorded timings (verbatim):

```
{"node":"AA","event":"leg_opened",...}   {"node":"BB","event":"leg_opened",...}
{"node":"AA","event":"opened",...}        {"node":"BB","event":"opened",...}     ← both open, no close yet
{"node":"AA","event":"closed",...}
{"node":"AA","event":"leg_committed",...}{"node":"BB","event":"leg_committed",...}
{"node":"lg-AA-BB","event":"level_merged",...}
{"node":"BB","event":"closed",...}
```

> **AC17 gap caught + fixed by this probe.** The first probe run recorded `leg_opened ×2` + `level_merged ×1`
> but **no `leg_committed`** — the S4 synthesizer refactor moved the capture-commit into `synthesizeLevel`
> without carrying the telemetry emission. Fixed (`synthesizeLevel` now emits `leg_committed` per leg when a
> `planPath` is supplied; pinned by `SYNTH-DISJOINT-END-TO-END`). The trace above is the post-fix run. This is
> exactly what a live probe is for — a gap no unit test had surfaced.

## Run 2 — injected same-file conflict, **real synthesizer-agent dispatch** (the first-ever)

**This is a constructed-conflict harness, by design.** A genuine same-file overlap **cannot co-open in a
frozen plan** — Slice 5 established that the overlapping/exact tier is *freeze-refused*
(`WRITE_OVERLAP_POLICY_REFUSED_AT_FREEZE = ['exact']`). So Run 2 is not (and cannot be) a frozen-plan run; it
constructs two conflicting leg branches and exercises the conflict path directly — which is also the
**first-ever dispatch of the `synthesizer` agent** (the audit's "synthesizer role never dispatched" finding).

Two leg branches edited the **same region** of `fmt.js` (`CC` → bracket-wrap; `DD` → a `pad` parameter):

| prong | evidence |
|---|---|
| mechanical octopus **bails clean** | `git merge --no-ff CC DD` → CONFLICT → `git merge --abort`; post-abort `HEAD == base`, `git ls-files -u` empty, no `MERGE_HEAD` (no half-merge, no advance — the Slice-4 clean-bail) |
| **real Opus synthesizer dispatch** | a real `Agent` call (model `opus`) with the synthesizer brief resolved `fmt.js` BY INTENT, preserving BOTH legs: `fmt(x, pad)` → `"[" + String(x).padStart(pad \|\| 0) + "]"` (bracket-wrap ∧ pad), touching ONLY `fmt.js` (the union) |
| resolved merge commit M | **M = `fff3ad48`**, parents = `c82c3d58`(base) + `4dd20f11`(CC) + `6260cc81`(DD) — a true 3-parent merge |
| **union barrier valid on the agent-resolved M** | base + `CC` + `DD` all ∈ ancestors(M); `diff-tree base→M` = `fmt.js` ⊆ union — the agent-resolved M satisfies the same commit-union barrier the disjoint path uses (no structural gap between agentic and mechanical resolution) |
| no silent loss | both intents present in M (`padStart` ∧ `[`); the synthesizer reported and the diff confirms neither leg dropped |

The synthesizer correctly self-reported the fail-closed posture ("a clean merge is a weak signal, never a
verdict; the union barrier + the downstream review gate are the landing gates") — matching `agents/synthesizer.md`
and its three Codex `.toml` twins. A non-reasoning tier for this role is a freeze/dispatch refusal
(`REASONING_FLOOR_ROLES`, enforced at the readySet chokepoint, Slice 1).

---

## AC15 — Codex write-time-DENY verification result

**Claim under test (the pre-#463 TODO, `docs/investigations/2026-06-10-parallelism-redesign.md:153`):** the
Codex `.codex/hooks.json` write-lane hook's *capability to deny may differ* from Claude's, "so the flag stays
off." AC15 asks for a documented verification result.

**Static verification (the hook is wired + carries the deny path):**
- The write-lane hook is the **same script** in every edition (`hooks/kaola-workflow-write-lane.sh`); it
  DENIES an out-of-lane `Write`/`Edit` at write time via `exit 2` (Claude `PreToolUse` semantics) and emits a
  `BLOCKED (write-lane #376)` diagnostic.
- It is wired into the Codex/forge `.codex/hooks.json` (id `kaola-workflow:write-lane`, description "Deny an
  out-of-lane Write/Edit when write-lane containment is enabled (#376; **dormant until a running-set manifest
  exists**)").

**The deny-capability difference, and why it is no longer a blocker (the result):**
1. Codex command hooks stay **inert until trusted** per-content-hash via interactive `/hooks`
   (`reference_codex_hook_trust_activation`); there is no non-interactive trust path. So a Codex write-time
   deny cannot be asserted equivalent to Claude's `PreToolUse exit 2` in a headless run, and the deny
   *semantics may differ* between the runtimes.
2. **This does not weaken the fail-closed guarantee, by design.** The write-lane hook is — in *every* runtime —
   only a **coarse, best-effort cross-lane fence**: there is **no env var identifying which subagent made a
   tool call** (`reference_no_env_var_subagent_detection`), and the #386 self-exempt passes any open write
   node's own-lane write. It is explicitly *not* the per-node guarantee.
3. The fail-closed guarantee rests on **runtime-neutral, pure-git backstops** that work **identically** under
   Claude and Codex — built in Slices 3–4 (the backstops the original TODO said were "itself unbuilt"):
   - the **per-leg barrier** (close-time, every runtime) catches a cross-lane leg write → `write_set_overflow`;
   - the **parent-clean fence** (pre-merge, every runtime) catches an own-lane parent slip → `merge_conflict`;
   - the **commit-union barrier on M** (every runtime) catches any escape/omission in the merge lineage.

**Result:** the Codex write-time deny differing or remaining inert is **acceptable and no longer gates the
feature** — the deny is an early-fail convenience, not the safety mechanism. The per-leg barrier +
parent-clean fence + commit-union barrier provide the fail-closed guarantee runtime-neutrally. The pre-#463
TODO is resolved: "deny may differ, flag stays off" is correct *because* the deny is not load-bearing, now
that the barrier backstops exist.

---

## Teardown / clean-state

Both throwaway repos (`/tmp/s6-probe`, `/tmp/s6-probe-r2`) were removed after capture; the real checkout
carries **no** probe artifacts, leg worktrees, or `leg-base` refs. Run 1's own teardown left 0 leg worktrees
and 0 `leg-base` refs in its repo before removal.

## Verdict

Both AC18 prongs are recorded against the real runtime with real agent dispatches; AC15 is verified. Combined
with the unit/integration suite (983 `test-adaptive-node.js` assertions) and the four green chains, **#463's
release gate is met.** This is the slice whose merge legitimately closes #463.
