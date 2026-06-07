# Strict lean-orchestrator boundary — make subagent-seam delegation script-enforced, not prose

Tracking issue: **#277**.
Status: OWNER-APPROVED DESIGN (2026-06-07) — one comprehensive issue, two internal
phases (§7). Surfaced by the #276 run, where the orchestrator (main session) silently ran the
claim, the DAG authoring, AND the entire Phase-6 finalization **inline** — using
zero `workflow-planner` and zero `contractor` subagent dispatches — and the run
still completed green through every gate. The owner correctly flagged this as a
**design** defect, not an agent-discipline slip.

---

## 1. The defect (precise, grounded)

The lean-orchestrator boundary — *main decides/dispatches/judges; **workflow-planner**
claims + authors the DAG; **contractor** does the Phase-6 finalize bookkeeping;
main keeps only the per-node loop + the sink* (ADR 0002 / 0003 / 0004 / 0005,
#243) — is enforced **only** by prose + text-presence, never by runtime proof.

The smoking gun is already on file: **#92 (CLOSED)** diagnosed exactly this —
*"validators check for strings in skill files; they do not verify runtime
behavior, actual subagent spawn events"* — and scoped a "transcript/spawn-event
verifier" that **was never built**. The #276 run is that gap firing in the wild.

Concretely:

- `main_session_role: orchestrator` is a **static literal** written into every
  `workflow-state.md` at startup (`scripts/kaola-workflow-claim.js:315`) and is
  **never read back** by any script. It attests nothing.
- The contract validators assert the dispatch **block text exists** in the `.md`
  (e.g. `validate-workflow-contracts.js:550-551` for the planner) — this is
  **doc-drift prevention**, not execution proof. It stops the file regressing to
  advisory prose; it does not stop main copying and running the inline procedure.
- The **full mechanical procedure is *also* inline** in the orchestrator command
  files, immediately below each "delegated to …" dispatch block, runnable verbatim
  by main:
  - Phase-6 finalize: `commands/kaola-workflow-phase6.md:579-667` (Step 8a mirror,
    8b `cmdFinalize`, Step 7 roadmap, Step 8 `chore: finalize` commit) — the
    dispatch prompt even says *"exactly as written below in this command file."*
  - Adaptive claim + author: `commands/kaola-workflow-adapt.md:215` (the `startup …`
    + `Write` + `adaptive-handoff.js` literals inside the planner prompt).
  - The skills **explicitly permit** the inline fallback:
    `skills/kaola-workflow-adapt/SKILL.md:108`, `skills/kaola-workflow-finalize/SKILL.md:76`.
- The **contractor** finalize dispatch is **not even text-locked**: grep for
  `subagent_type="contractor"` / `CONTRACTOR_MODEL` across `scripts/` returns
  **zero hits**. It is the weakest seam — prose-only, no lock, and the one with
  documented evidence of being run inline (the intent-audit's "26 sites").
- The only "delegation receipt" is **self-reported, not proof**:
  `kaola-workflow-adaptive-node.js:561` hardcodes the literal `subagent-invoked`
  token regardless of who actually ran; `delegationPolicyCompliance` (#91) then
  checks those self-reported rows.
- **Run posture is env-only.** Worktree-vs-in-place is driven solely by
  `KAOLA_WORKTREE_NATIVE` (`claim.js:34`); there is **no CLI flag**, and a
  dispatched subagent shell **does not inherit** the orchestrator's env (the
  planner profile itself notes this re `KAOLA_PATH`). So a subagent **cannot
  deterministically choose** in-place vs worktree. This is the exact gap that, on
  #276, forced the orchestrator to hand-run `startup` with `KAOLA_WORKTREE_NATIVE=0`
  (to get in-place), which then made the planner's own `startup` refuse
  `target_occupied` → bypassing the planner entirely → authoring inline.

**Net:** every subagent-owned seam is silently inline-bypassable by main, and the
run completes green. Two seams are *intended* main-direct and are fine (§5).

## 2. Current-state map (what's enforced vs prose-only)

| # | Seam | Intended owner | Enforcement today | Gap |
|---|------|----------------|-------------------|-----|
| 1 | Adaptive claim (`startup`) | workflow-planner | PROSE + text-locked dispatch block | inline-runnable (`adapt.md:215`); fallback grant `adapt/SKILL.md:108`; no runtime provenance |
| 2 | DAG author + freeze (`Write` + `adaptive-handoff.js`) | workflow-planner | PROSE + text-locked dispatch block | same single planner dispatch; `plan_hash` proves *frozen*, not *who froze* |
| 3 | Per-node loop (`adaptive-node.js`) | **main (by design)** | SCRIPT-gated (barrier chain) | N/A — intended main-direct (ADR 0004/0005) |
| 4 | **Phase-6 finalize (8a/8b/7/8)** | **contractor** | **PROSE-ONLY, not even text-locked** | full procedure inline (`phase6.md:579-667`); 0 validator hits for the contractor dispatch; observed bypassed |
| 5 | Sink (`sink-merge.js`) | **main (by design)** | SCRIPT-gated (`assertNoLiveWorkflowFolder`) | N/A — intended main-direct (ADR 0002) |

Root absence shared by 1/2/4: **no runtime marker records which agent executed
the seam.**

## 3. Design principle

Apply the repo's own **#231 doctrine — "the script is the enforcement, not a
prose obligation"** — to the orchestration seams, reusing the existing fail-closed
`CLOSURE_INVARIANTS` + `checkClosureInvariants` pattern
(`closure-contract.js:35-46`, `claim.js:682-738`) as the extension point. This is
the *same* mechanism **#260 just used** (2026-06-07) to convert in-place
branch-creation from prose discipline into a script-owned step — the freshest
exemplar to follow.

## 4. The mechanisms (ordered: prevention first, detection second)

### M3 — Procedure relocation (PREVENTION; the high-leverage fix; no external dependency)
Move the **full** mechanical procedure **out** of the orchestrator command files
and into the subagent profiles as the **sole home**:
- `agents/contractor.md` owns the Step 8a/8b/7/8 procedure verbatim;
  `commands/kaola-workflow-phase6.md` keeps **only** a thin dispatch handle
  (task-specifics + the contractor `Agent(...)` block), no runnable body.
- `agents/workflow-planner.md` owns the claim + author + handoff procedure;
  `commands/kaola-workflow-adapt.md` keeps only the dispatch handle.
- **Add the missing contractor-dispatch text-lock** to the contract validators
  (currently 0 hits) and **drop the inline-procedure text-locks** (which perversely
  make the procedure *more* copyable). Lock the *handle*, not the *body*.
- Delete the "may run inline" fallback grants from the skills
  (`adapt/SKILL.md:108`, `finalize/SKILL.md:76`) except the genuinely-needed
  `local-fallback-tool-unavailable` escape, which must itself be logged (see M1/M2).

Why this is the real fix: with nothing to copy, the **casual** inline bypass
(what #276 was) simply stops — main has only a dispatch handle in front of it.
This is precisely the goal **#244 declared** ("move delegated procedure into the
subagent definitions") but **did not deliver for the finalize seam** — #244 closed
with the procedure still inline at `phase6.md:579-667` because its ≥20%-line
reduction AC proved structurally unreachable (closed ~3%; see
[[project_244_ac3_unreachable]]). M3 finishes that specific relocation, framed as
strict-enforcement rather than line-count compression.

### M4 — Deterministic, dispatch-driven run posture (removes the env-coupling that caused #276)
- The run posture is resolved **once**, up front, and is **not** settable by the
  orchestrator pre-setting env outside the subagent flow.
- Per the owner's chosen posture (**strict = always worktree** for adaptive),
  adaptive **always provisions a worktree via the planner-driven `startup`**;
  in-place remains **only** as the automatic offline / no-git / no-history
  fallback the resolver already does — never an orchestrator-forced mode.
- Record `run_posture: worktree|in-place` in `workflow-state.md` (derived by
  `startup`, not by inherited env) so downstream seams and resume read one source
  of truth.
- Fix the **stale** `agents/workflow-planner.md:99` ("adaptive does NOT provision
  a worktree" — false since #265) that contributed to the posture confusion.
- **No `--worktree=on|off` flag** (owner decision 2026-06-07): a flag would
  re-admit the orchestrator-forced in-place mode just rejected. Posture is
  always-worktree for adaptive, automatic-fallback otherwise — no knob.

M3 + M4 together are **provable with no harness facts** — pure repo edits +
validator assertions + simulate coverage. They are **Phase 1** of this issue.

### M1 — Harness-recorded invoker provenance (DETECTION backstop; harness-gated)
A `SubagentStart` hook records **actual** subagent spawns — `agent_type` +
`agent_id` + `cwd`, fired **harness-side** when the agent is spawned — appended to
a durable, append-only `kaola-workflow/{project}/.cache/dispatch-log.jsonl`.
*(Verified feasible on Claude Code via `SubagentStart`; see Honest Limits.)*

### M2 — Closure attestation invariants (DETECTION; extends the existing pattern)
Add fail-closed invariants checked by `checkClosureInvariants`:
- `claim-planner-attested` — a `workflow-planner` spawn is recorded **before**
  the plan froze (checkable post-freeze).
- `finalize-contractor-attested` — a `contractor` spawn is recorded in the
  finalize window. **Enforcement point:** *after* `cmdFinalize`, *before* the
  sink (the contractor runs *during* finalize, so it can't gate before it); on a
  missing attestation, route to **re-dispatch the contractor**, not a dead-end
  refuse on already-committed work.
- Receipts default to `failed` (fail-closed, like the existing 7 invariants).

M1 + M2 are **Phase 2** of this issue, gated on the harness-feasibility check and
the Codex story (#266). Strictness is **warn-first** (owner decision 2026-06-07):
a missing attestation logs a loud warning + records it in the closure receipt but
does **not** block; escalate to hard-refuse (route → re-dispatch contractor) only
once the detector proves stable. An imperfect detector must not hard-block.

## 5. Explicitly out of scope (do NOT add provenance here)
- The **per-node loop** (`adaptive-node.js orient/open-next/record-evidence/
  close-and-open-next`) is intended **main-direct** (ADR 0004/0005) and is already
  correctness-gated by the `close-and-open-next` barrier chain + `--barrier-check`
  / `--gate-verify` / `--verdict-check`.
- The **sink** (`sink-merge.js` Step 9) is intended **main-direct** (ADR 0002) and
  ordering-gated by `assertNoLiveWorkflowFolder`.

## 6. Honest limits (state these plainly — do not oversell)
- **M1/M2 detect the zero-spawn case, not deliberate spawn-and-ignore.** A spawn
  log proves *a contractor was spawned in the window*, not that *the contractor
  ran `cmdFinalize`*. And it is **not tamper-proof**: the main session can append
  to the same log file. Full execution-attribution would need a harness-minted
  per-spawn identity the script validates — which the harness does not provide
  (that is *why* #92 scoped it and it was never shipped). So the honest guarantee
  is: **catches the casual / accidental bypass (exactly #276), not a determined
  one.** Writing the log somewhere main can't easily reach (`/tmp`, or `.claude/`
  with strict perms) raises the bar but does not close it.
- **Codex edition:** `SubagentStart` is a Claude-Code hook; the Codex harness's
  dispatch observability is the **open #266** workstream. M1/M2 lands on
  claude/gitlab/gitea (all Claude-Code-hosted) now; Codex attestation is deferred
  to / co-designed with #266.
- **Caveats to verify empirically before building M1:** `SubagentStart`'s input
  schema is under-documented upstream (claude-code #19170); and **agent-teams**
  (enabled in this environment) may have a separate hook lifecycle — confirm
  `SubagentStart` fires for Task-dispatched subagents in that mode.
- M3 is **not** a strictness dial — the procedure text is simply removed; there is
  no "soft" version.

## 7. Delivery — ONE comprehensive issue, two internal phases (owner decision 2026-06-07)

Filed as a single issue; sequenced internally on dependency so the provable-now
work isn't blocked by the harness-gated work.

**Phase 1 — prevention + posture (no harness dependency; do first).**
M3 (relocate the procedure to the subagent profiles as sole home) + the
contractor-dispatch text-lock + M4 (adaptive always-worktree, deterministic
posture, stale-doc fix). Pure repo edits, validator assertions, simulate coverage,
×4 editions + byte-sync. Stops the casual bypass that caused #276. Self-contained
and shippable on its own.

**Phase 2 — attestation backstop (harness-gated; warn-first).**
M1 (`SubagentStart` dispatch log) + M2 (`claim-planner-attested` /
`finalize-contractor-attested` closure invariants). Lands on the Claude-Code
editions (claude / gitlab / gitea) — `SubagentStart` feasibility confirmed but
must be re-checked empirically (schema under-documented upstream #19170;
agent-teams lifecycle). **Codex attestation is deferred to / co-designed with
#266** (the Codex harness has no equivalent dispatch-observability hook yet).
Warn-first; escalate to hard-refuse only once stable.

## 8. Resolved decisions (owner, 2026-06-07)
1. **One comprehensive issue**, phased internally (§7) — not a 2-issue split.
2. **M1/M2 strictness = warn-first** (loud warning + closure-receipt record on a
   zero-spawn seam; no hard block until the detector is stable).
3. **M4 = adaptive always-worktree, no `--worktree` flag** (a flag would re-admit
   the rejected orchestrator-forced in-place mode).
4. **Codex M1/M2 deferred to #266** (Phase 2 ships on the Claude-Code editions
   first).

## References
- #92 (CLOSED, never-built spawn-event verifier) — the prior diagnosis.
- #243 (CLOSED) — the lean-orchestrator boundary this hardens.
- #244 (CLOSED) — declared the procedure-relocation goal; finalize seam left inline.
- #260 (CLOSED 2026-06-07) — the freshest "prose discipline → script-owned" exemplar.
- #266 (OPEN) — Codex harness dispatch observability; M1/M2's Codex dependency.
- #91 / #231 — existing delegation-ledger + script-enforced-gate patterns.
- ADR 0002/0003/0004/0005 — the boundary + main-direct carve-outs.
