# Audit — #242 lean-orchestrator: as-built vs. original intent

**Date:** 2026-06-04
**Subject:** issue #242 lean-orchestrator (v4.0.0 Part A + v4.1.0 Part B)
**Trigger:** owner observed that, in real **adaptive** runs, the "starting contract" + connecting work
runs inline in the main Opus session instead of via subagents; owner restated the original intent and
asked for a full audit against it.
**Method:** two adversarially-verified multi-agent audits — (1) parity/correctness sweep, 21 agents;
(2) intent-deviation enumeration, 50 agents (62 main-session exposures classified, each verified by an
adversarial skeptic instructed to refute the deviation flag). Read-only; zero repo files mutated.

---

## Executive verdict

Two truths, at two different yardsticks:

- **The code is sound (correctness yardstick).** No correctness defects, no regressions, **4-edition
  parity entirely clean**, the v4.0.0 resolver/manifest fix is exactly as designed, the contractor is
  correctly registered and stays Sonnet, the two aggregator scripts faithfully implement their
  contracts, and the wired C1/C2/C3 seams respect the #44 judgment boundary. `npm test` and the
  walkthrough are green. Nothing is shipped-broken.

- **The architecture diverged from your intent (design yardstick).** Measured against the
  **owner-confirmed original intent** — *main session only decides-what + dispatches-roles +
  observes/validates; the contractor does everything that is just running scripts and writing durable
  files; the planner does the planning* — the main Opus session still performs mechanical
  script-running and durable-file writes at **26 confirmed sites across every path** (router, adaptive,
  full 6-phase, fast). The single biggest contributor is **Decision 1** (the adaptive per-node loop was
  made "aggregator-direct" — main runs the scripts itself) plus the **C4 drop** (phases 2–5 bracketing
  was never built).

These are not in conflict: the implementation is a *correct* realization of the **run-1 plan**
(`lean-orchestrator-part-b-plan.md`), which **overrode** the parent design intent
(`lean-orchestrator-contractor-2026-06-04.md`) via Decision 1 (aggregator-direct loop) and Decision 4
(orchestrator-authors-the-table). Those two overrides — authored by a `code-architect` *node*, and
Decision 4 explicitly flagged a "run-2 evaluation item" — are the deviations. Reversing them is a
design decision that is **yours**, and your message gives it.

---

## The hard constraint that bounds every fix

From the parent doc, "Governing constraints #1": **subagents cannot dispatch subagents.** No vendored
agent grants `Task`/`Agent`, and the harness disallows nested dispatch. Therefore:

- The **main session must always remain** the one that *summons* the contractor, the planner, and every
  role agent, and owns the **loop control flow** + **governance judgment**. This can never move to the
  contractor.
- Everything else that is "just running a script or writing a durable file" **can** move to a contractor
  dispatch — and per your intent, **should**.

Your described flow is fully consistent with this: *main summons contractor (startup bookkeeping) →
summons planner (proposes the plan) → per node, dispatches the role then summons the contractor for the
connecting writes → summons the contractor at finalize → otherwise observes the sequence and validates
results.* The main session is still the conductor; it just stops doing the mechanical work with its own
hands.

---

## Part I — Confirmed deviations from intent (the spine)

26 main-session exposures were adversarially confirmed as true deviations (main does mechanical
script/write work the intent assigns to the contractor). Grouped by surface; severity is the verifier's
corrected value. The adaptive loop + the dropped phases-2–5 bracketing are the centerpiece.

### A. Adaptive per-node loop — `commands/kaola-workflow-plan-run.md` (+ SKILL + gitlab/gitea) — **the centerpiece**
The parent intent names this verbatim: *"per node, contractor runs `commit-node`, verifies `.cache`,
writes ledger row + state pointer."* As-built (C1), the **main session** does all of it inline:

| Sev | Step | Location | What main does today |
|---|---|---|---|
| **high** | 1 start | `plan-run.md:95–100` | runs `commit-node --start` (record baseline) + marks node `in_progress` |
| medium | 1 ledger | `plan-run.md:95–97` | writes the `in_progress` row into `## Node Ledger` |
| medium | 3 verify | `plan-run.md:146–149` | reads `.cache/{node}.md`, tallies `test_thrash` *(the RED/GREEN **judgment** correctly stays Opus — transcription only moves)* |
| **high** | 4 state | `plan-run.md:150` | writes the `workflow-state.md` pointer (the "state pointer LAST" clause) |
| **high** | 5 complete | `plan-run.md:170–177` | marks `complete`/`n/a`, authors the `## Required Agent Compliance` row |
| low | ready-set | `plan-run.md:67–70` | runs `next-action.js` to compute the ready set |

*Verifier nuance:* it kept the **barrier `commit-node` run at step 4** (`:158`, `BC=$?`) and the
**consent-halt writes** (`:160–167`) on Opus, because the barrier's exit code drives an immediate
governance branch (revoke/halt). Under your **categorical** intent the run still moves to the contractor
— it simply *returns* the exit code for Opus to branch on (the exact phase6 pattern). I flag this as the
one genuinely debatable boundary in the loop.

### B. Adaptive start / authoring — `commands/kaola-workflow-adapt.md` (+ 3 mirrors)
- **freeze execution** (`adapt.md:195–196`): main runs `plan-validator … --freeze`, which stamps
  `plan_hash` into the durable plan. Soft-stay → **move to a contractor dispatch**, fired *after* Opus
  renders the freeze verdict (main keeps the authorize decision; contractor performs the stamp).
- **planning-evidence checkpoint** (`adapt.md:164`, "record the planning evidence in
  `workflow-state.md`"): a durable write — soft-stay → **move to the contractor**, bundled with freeze.
- **The `## Nodes` table authoring write** (`adapt.md:162–164`) is the **one piece that legitimately
  stays on main even under your intent** — and it's a subtlety worth being explicit about. "Summon
  planner to do the planning" resolves to: the **planner *proposes* the decomposition** (it has only
  `Read/Grep/Glob` — **no Write** — so it can never author the file), while **main still authors +
  governs + `plan_hash`-freezes the table** (main must comprehend the DAG to dispatch and freeze it; #44
  + freeze-integrity). The propose path already exists as an *optional* consult at `adapt.md:147–160`
  ("do NOT author the plan table"). So Decision 4 is **reframed, not simply reversed**: promote the
  optional planner consult to the *expected* proposal step; the authoring *write* is correctly Opus's.
- `adapt` has **zero** contractor reference in any of its 4 mirrors — the start seam was never assigned
  an owner in the design doc's seam table (it lists only per-node, phase6, phase1, phases 2–5).

### C. Router / startup — `commands/workflow-next.md` (shared by **all** paths)
The shared entry has zero contractor seam, so each deviation here multiplies across fast/full/adaptive:
- **medium** `workflow-next.md:153` — runs `claim.js startup` inline: creates `workflow-state.md` +
  provisions the git worktree (a durable mutation, not a read).
- **medium** `:148` — runs `watch-pr` inline: archives merged/closed PR folders + regenerates the
  roadmap mirror + clears claim labels.
- **medium** `:333–344` — the State Bootstrap block instructs the **main session to hand-author**
  `workflow-state.md` (the purest form of the disputed deviation; Opus keeps the "which next command"
  judgment, contractor does the field-by-field write).
- *(info)* `:246` roadmap `validate` (read-only); `workflow-init.md:289,347` one-time bootstrap.

### D. Full 6-phase path, phases 2–5 — `commands/kaola-workflow-phase{2,3,4,5}.md` (C4 was dropped)
The parent intent: *"Phases 2–5: contractor brackets each dispatch (post-dispatch barrier/ledger/state
writes)."* C4 was dropped, so all of it is inline. 9 confirmed deviations, highlights:
- **medium** `phase4.md:188–236` — main creates `phase4-progress.md` (purely mechanical derivation from
  `phase3-plan.md`).
- **medium** `phase4.md:313–342` — per-task ledger row + Build-Status + state writes after each dispatch
  (the highest-recurrence bookkeeping in the linear path; the canonical parent-intent seam).
- **medium** `phase3.md:142–197` — main authors `phase3-plan.md` (mostly transcription of architect
  output).
- low/info — `phase{2,3,5}` end-of-phase state pointers; `phase5-review.md` scaffolding (split: Opus
  keeps the Review-Status **verdict**, contractor scaffolds + transcribes).
- *Verifier kept on Opus:* pre-dispatch state pointers and `phase2-ideation.md` synthesis (more Opus
  judgment than transcription) — a defensible line.

### E. Fast path — `commands/kaola-workflow-fast.md`
The parent "## Why" names the fast path as a procedural-work path, but **neither design doc ever gave it
a seam** — a pure scope miss.
- **medium** `fast.md:251–281` — main authors `fast-summary.md` by synthesizing planner + tdd-guide +
  reviewer prose + `.cache`. This is the textbook "fuzzy/bulky authoring from subagent prose" that even
  the *narrowed* Decision-1 rule routes to the contractor — the strongest single fast-path item.
- low — per-step `workflow-state.md` pointer writes (`fast.md:90–101,144–155,201–212`).

### F. Residual leak at an already-offloaded seam — `commands/kaola-workflow-phase1.md`
- **medium** `phase1.md:245–253` **and** `:349–357` — bare prose still tells the **main session** to
  "Update `workflow-state.md`" with the *exact* Step-5 checkpoint the contractor was **just dispatched to
  write** (`:241`). As written it invites Opus to redo the offloaded write. Fix: delete/convert these to
  a non-actionable "verify the contractor's summary shows `step: complete`" note. (3 command editions;
  the Codex research SKILL is already clean.)

### The boundary — what stays on Opus, in **two tiers** (read this; it sets the true scope)
The verifier kept 17 exposures on the main session — but under *your categorical intent* they split into
two tiers, and the split matters: if the eventual fix treats all 17 as "legitimately main," it leaves you
half-exposed.

**Hard-stay** — true under *any* framing. The genuine invariant is that main only **(a) summons agents,
(b) judges returned results, (c) owns irreversible external mutation + the branch cut.**
- **Governance / judgment (#44):** issue **selection** (`workflow-next.md:47–70`; "scripts validate, not
  select"), git-freshness ask-before-sync, the consent-halt/escalation **decision**, the RED/GREEN gate
  and `test_thrash` **judgment**, the Review-Status verdict, the `authoring-allowed` guard (#235).
- **Dispatch + loop control:** summoning every agent; the per-node loop itself.
- **Irreversible external + branch cut:** the `phase1` Step-6 **branch cut** (worktree-HEAD semantics);
  the phase6 **merge/PR + `gh issue close` recheck**.
- **Comprehension authoring:** the `## Nodes` **table authoring write** (see §B — planner has no Write;
  main must comprehend + `plan_hash` + freeze), `phase2-ideation.md` synthesis, the research synthesis
  (`phase1-research.md`).

**Soft-stay** — the verifier *conservatively* left these on main while defending the status quo, but
"main is not exposed to JS scripts" **relocates them to the contractor, with the result returned to main
to judge.** This is the same argument I already make for the barrier `commit-node` case (§A), applied
uniformly: the barrier `commit-node` run + consent-halt *write*, the per-step `workflow-state.md` pointer
writes across phases 2–5 and fast, the `--freeze` *execution*, the planning-evidence checkpoint write,
the fast-path acceptance-check run.

**Therefore the effective deviation count under your yardstick is meaningfully higher than 26.** The 26
is the conservative floor an adversarial skeptic could not refute *even while arguing to keep the status
quo*; the soft-stay tier pushes the real surface higher.

---

## Part II — Correctness / parity / test / doc findings (parity audit, framing-independent)

These hold regardless of the intent debate.

- **[medium] Docs assert a code path that doesn't exist.** `docs/api.md:243`, `docs/architecture.md:49,
  62–66`, `CHANGELOG.md:19`, and the `commit-node.js:16` banner state that **phase6 calls
  `commit-node` whole-plan** — it does **not**; phase6 calls the raw validator directly
  (`phase6.md:31–32`). Fix the **docs** (do *not* rewire — routing phase6 through the aggregator would
  drop the `--resume-check`/`plan_hash` integrity check); mark the aggregator's whole-plan branch
  test-only.
- **[medium] `next-action` stalled-DAG + empty-Nodes typed refusals are untested.** CHANGELOG-claimed
  guarantees with zero assertions; mutation-proven invisible (neutering them keeps the suite green).
- **[medium] No git-backed test pins the live `commit-node → validator` token seam.** This was the
  CHANGELOG's *own* promised Stage-C follow-up; it never landed. A validator-token drift fail-closes in
  production while the stub-based unit test stays green.
- **[low] Adaptive (and fast) issues never appear in `ROADMAP.md` during active life.** `init-issue` is
  called only from phase1 Step 5b (`phase1.md:273`); the adaptive/fast paths skip phase1, and startup
  only *reads* an existing source. Harmless today (`rm -f` at closure is a no-op), but the mirror is
  silently incomplete. Folds into the adapt fix.
- **[low] tests/docs polish:** no `--profile=common` contractor→sonnet assertion; `commit-node` CLI
  early-refuses untested; `CLAUDE.md` "Key Scripts" omits both aggregators; README agent table still
  says 10, not 11 (no contractor row).
- **[low] phase1 dead capture:** `RESEARCH_PROJECT`/`RESEARCH_ISSUE` captured "before delegating"
  (`phase1.md:225–229`) but never reused — vestigial copy of phase6's pattern.

---

## Part III — Constraint-correct target architecture (in your terms)

```
START      main: select issue (judgment)  →  SUMMON contractor: run claim.js startup +
                 watch-pr, write workflow-state.md, provision worktree → returns {verdict, project,
                 worktree, claim}; main branches on it (governance).
PLAN       main: SUMMON planner → planner PROPOSES the decomposition (read-only; propose path already
                 exists at adapt.md:147). main: judge + author/freeze decision; SUMMON contractor to
                 run --freeze (stamp plan_hash) + write the planning-evidence checkpoint.
PER NODE   main: governance verdict + dispatch the role agent (must stay main) → SUMMON contractor:
                 run commit-node (--start, then barrier), read .cache evidence, write ledger row +
                 state pointer + compliance row → returns compact summary incl. barrier exit code;
                 main judges RED/GREEN + consent-halt/escalation.
PHASES 2-5 main: dispatch each role → SUMMON contractor: post-dispatch barrier + ledger + progress +
                 state writes + phase-file scaffolding/transcription; main keeps approach/verdict.
FAST       main: dispatch planner/tdd/reviewer → SUMMON contractor: author fast-summary.md (from prose)
                 + per-step state writes; main keeps the PASSED/ESCALATED verdict + acceptance judgment.
FINALIZE   (already built, C2) main keeps the sink merge/PR + gh-issue-close recheck; contractor does
                 the mechanical block.
OBSERVE    main otherwise watches the sequence + validates results.
```

**The honest tradeoff (the parent doc flagged it, `:180–186`):** a per-node contractor round-trip adds
latency + tokens. The aggregator scripts + a thin contractor prompt are what keep that cost low; the
parent doc's own fallback clause is *exactly* what Decision 1 invoked to make the loop aggregator-direct.
Choosing a lean Opus context over per-node latency is the call you're making — it is defensible and is
yours, but it is a real cost, highest at the per-node loop.

---

## Part IV — Prioritized fix backlog (unified)

Legend: **R** = pure relocation (move a script-run/write into a contractor dispatch — low risk, no
behavior change). **D** = reverses a documented decision (your sign-off, now given). **C** =
correctness/test/doc (framing-independent).

| # | Type | Sev | Area | Fix | Edition scope |
|---|---|---|---|---|---|
| 1 | D+R | high | **adaptive loop** | Reverse Decision 1: contractor owns the per-node `commit-node` + ledger/state/compliance writes; main keeps dispatch + RED/GREEN + consent-halt | plan-run cmd + github SKILL + gitlab/gitea cmd (4) |
| 5 | R | high | **adaptive start** | Contractor runs `--freeze` + planning-evidence write (after Opus's freeze verdict); record `adapt` in the seam table | adapt cmd + 3 mirrors |
| 6 | D-confirm | — | **planning** | Promote the optional planner consult to the expected **proposal** step; **main still authors + freezes** the `## Nodes` table | adapt surface (4) |
| 3 | R | med | router | Contractor owns the startup transaction + watch-pr + State-Bootstrap write; main branches on returned JSON | workflow-next (+ forge routers) |
| 2 | R | med | phases 2–5 | Build the dropped C4: contractor brackets each dispatch (barrier/ledger/progress/state + phase-file scaffolding) — *the adaptive principle extended to the linear path* | phase2–5 cmd + Codex plan/execute/review SKILLs + gitlab/gitea (~20) |
| 4 | R | med | fast path | Contractor authors `fast-summary.md` + per-step state writes; main keeps verdict | fast cmd + fast SKILLs (forge) |
| 7 | C | med | docs | Correct the "phase6 calls commit-node whole-plan" claim (api/architecture/CHANGELOG/banner); mark branch test-only | canonical docs |
| 8 | C | med | tests | `next-action` stalled-DAG + empty-Nodes refusal tests | canonical |
| 9 | C | med | tests | git-backed `commit-node → validator` token-seam integration test | canonical (+ forge) |
| 10 | C+R | low | durable state | Stage `init-issue` at adapt-time (+ fast) so non-phase1 issues hit ROADMAP.md | adapt (+ fast) |
| 11 | R | med | phase1 residual | Remove the two main-directed "Update workflow-state.md" prose blocks duplicating the contractor's write | 3 command editions |
| 12 | C | low | tests/docs | `--profile=common` contractor assertion; commit-node CLI tests; CLAUDE.md + README agent count | canonical |

**Sequencing note:** the aggregator scripts (`next-action`/`commit-node`) and the contractor charter
already exist and are correct — items 1–5 are mostly **relocating existing script-runs into contractor
dispatch prose**, not new logic. That is why this is a tractable, mostly-mechanical change despite the
edition count.

---

## Recommendation + the one decision that's actually open

**Recommended first cut — the adaptive path (items 1, 5, 6).** It is exactly where you felt the pain (both
messages), it is mostly relocation over existing aggregator scripts + the existing contractor charter (not
new logic), and it lands the whole intent for the path you run most: *main summons planner (proposes) +
contractor (start/freeze/node bookkeeping/finalize), dispatches roles, and validates.* The full 6-phase
bracketing (item 2) and the fast path (item 4) are the **same principle extended** — natural follow-ons,
medium priority, not co-urgent. The correctness/doc items (7–12) can ride along or land first as a quick
green-up.

Two things to settle:

1. **The genuinely open question — how far + the latency tradeoff.** A per-node contractor round-trip
   buys a lean Opus context but costs latency + tokens (the parent doc flagged this at `:180–186`, and it
   is the exact reason Decision 1 went aggregator-direct). You're choosing lean-main; the aggregator
   scripts keep the per-call prompt tiny. Decision needed: **adaptive-only first**, or **all paths in one
   release**?
2. **Decision 4 — confirming, not asking.** Per your message I'm treating it as decided: planner
   *proposes* the decomposition, **main still authors + `plan_hash`-freezes** the `## Nodes` table (the
   planner has no Write tool and main must comprehend the DAG to govern it). Flag me if you meant
   something stronger (e.g. a Write-capable authoring agent).

Nothing here is a code bug to hotfix — it's a deliberate architectural realignment back to the original
intent, gated only on the scope call above.
