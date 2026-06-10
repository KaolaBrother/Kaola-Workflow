# Parallelism v2 — Event-Driven Per-Node Scheduling on Harness-Native Isolation

**Date:** 2026-06-10
**Status:** Design (investigation)
**Relates to:**
- Issue #364 (excise the unreachable write-role batch machinery) — this document supplies the
  "reintroduction condition" #364 asks the excise PR to record, restructured per-node.
- `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md` (#281 design — the
  predecessor whose load-bearing constraint has partially expired, §2 below)
- The 2026-06-10 five-agent architecture audit (root cause F: dormant batch machinery)

---

## 0. Verdict of the 2026-06-10 parallelism investigation

After #303 the **plan grammar is no longer the conservative part** — fan-out width is a
non-blocking diagnostic (`plan-validator.js:737-739`), and the planner profile explicitly
instructs efficient wide DAGs (`agents/workflow-planner.md:117`). The conservatism is all
runtime:

| Work shape | Plan-time | Run-time reality today |
|---|---|---|
| Read-only siblings | any width | ≤ `FANOUT_CAP` (4) concurrent — the only real parallelism |
| Write-role siblings, disjoint lanes | in-grammar, `ask` | **always serial** — `cwd_unenforceable` degrade before dispatch (`plan-run.md:243-259`) |
| Review of lane A while lane B implements | in-grammar (antichain) | never happens — one frontier unit at a time (`plan-run.md:193-195`), never mix read+write (`:220`) |
| Downstream node whose deps completed, siblings still running | in-grammar | never happens — `top-up` is same-frontier only (`plan-run.md:285-286`) |

Three structural serializers stack on top:

1. **Gang dispatch is itself a barrier.** "Multiple `Agent()` calls in ONE message" blocks the
   orchestrator until *all* members return, so rolling `top-up` cannot actually roll — realized
   read-only concurrency is wave scheduling. The skill already hedges this
   (`plan-run.md:288-290`).
2. **Disjointness granularity kills write fan-out for this repo specifically.** Top-level-dir
   RED (`classifier.js:108-115, 317-340`) plus `SHARED_INFRA = {scripts, hooks,
   plugins/kaola-workflow/scripts}` being unsplittable ("must serialize, not fan out",
   `plan-validator.js:746`) means the project's own `scripts/`-resident work can never be
   parallelized at all.
3. **No dynamic fan-out.** All nodes are enumerated at freeze (`plan_hash` covers `## Nodes`);
   the `cardinality` column is parsed but dead. Discovered work (per-edition ports, per-site
   fixes) cannot widen a running plan except via a full repair-refreeze.

And **no wall-clock telemetry exists anywhere** — the ledger records no timestamps, so the cost
of all of the above is unmeasured.

## 1. The expired premise

`adaptive-schema.js:261-268` states why everything write-side is serial:

> "This harness cannot FORCE a dispatched subagent's CWD (the `Working directory:` line is
> advisory prose)... Set only by a future harness that gains a real cwd-forcing primitive."

The 2026-06-07 design doc generalized it: *"The harness's only real concurrency is the MAIN
SESSION issuing multiple `Agent()` calls in ONE message."*

As of Claude Code current (2026-06), three primitives change this:

- **`run_in_background: true` on the `Agent` tool** + completion notifications + `SendMessage`:
  the orchestrator can dispatch members asynchronously and act on each completion while the
  rest run. The "one message" constraint is no longer the only concurrency. (Still true and
  unchanged: a script cannot spawn agents; a subagent cannot dispatch a subagent.)
- **PreToolUse hooks with deny semantics**: this project already runs one
  (`hooks/hooks.json:18`, the pre-commit guard). A hook can mechanically reject a `Write`/`Edit`
  whose resolved path is outside an assigned lane — converting "advisory cwd prose" into
  fail-closed containment, which is exactly the bar `KAOLA_BATCH_CWD_ENFORCED` was defined to
  wait for. Hooks fire for subagent tool calls too (the `SubagentStart` dispatch-log hook is
  the existing in-repo evidence of hook visibility into dispatched agents; a PreToolUse probe
  inside a dispatched subagent is an explicit acceptance item, §3 D4).
- **`isolation: "worktree"` on the `Agent` tool**: harness-provisioned per-agent worktrees.
  Noted for completeness; **not** the recommended mechanism here (lifecycle is harness-owned
  and the path is not script-knowable in advance), but it corroborates that per-agent
  isolation is now a harness concern, not a prose request.

## 2. Relationship to the locked #364 excise — excise the mechanism, keep the goal

#364 (locked) removes the batch-as-a-unit write-role machinery (~400 lines: per-member
worktrees at `.kw/batch/<projTag>/<id>` (`parallel-batch.js:543`), seeded snapshots, mergeRef
joins). **This design endorses the excise** — the batch state machine is the wrong shape even
with working isolation, because `active-batch.json`'s batch-global lifecycle
(`opening→open→sealed→joining→joined`) is what bakes in wave scheduling and same-frontier
top-up.

Parallelism v2 is rebuilt on the **per-node primitives that already exist and are live**:

- per-node baselines, gc-anchored at `refs/kaola-workflow/barrier/<projTag>/<nodeId>`
  (`plan-validator.js:1153-1185`),
- per-node barrier with own-lane allowlist (`plan-validator.js:540-544`),
- per-node ledger rows, per-node evidence (`.cache/<node-id>.md`), `seal-member`-grade
  per-member gates (evidence-shape, `empty_member` vacuity),
- a continuously recomputed ready frontier (`next-action.js:14-21` — `readySet`,
  `readyPending`, `active`).

Sequencing: D1–D3 below are independent and can land any time. D4–D5 land **after #364**
(they are the reintroduction, per-node-shaped). D6–D7 land after D5, design-first.

## 3. The design

### D1. Wall-clock telemetry (independent; smallest)

`kaola-workflow-adaptive-node.js` lifecycle subcommands (`open-next`, `record-evidence`,
`close-and-open-next`, `write-halt`) and `parallel-batch.js` (`open-batch`, `seal-member`,
`top-up`, `join`) append one JSON line per transition to
`kaola-workflow/{project}/.cache/node-timings.jsonl`:
`{"node":"<id>","event":"opened|evidence|closed|...","ts":"<ISO8601>"}`.
`.cache/` is already a barrier-exempt workflow band, so no validator change. No ledger format
change (the ledger has five parser/slicer consumers; not worth the churn). This makes every
subsequent claim in this document measurable.

### D2. Background member dispatch (independent; prose-only)

Rewrite the dispatch step of `plan-run` (×4 surfaces: `commands/kaola-workflow-plan-run.md`,
the Codex SKILL, gitlab/gitea forks): members are dispatched with `run_in_background: true`;
on each completion notification the orchestrator immediately runs `record-evidence` →
`seal-member` → `top-up` (when `status --json` says `nextRoute:'top-up'`), starting the next
queued sibling while others still run. Gang dispatch (all calls in one message) remains the
documented fallback for harnesses without background dispatch. No script changes — the
aggregators are already pure state machines, and `top-up` was *designed* for exactly this
loop; the harness primitive finally makes it reachable. Until #364/v2, this benefits
read-only batches only (write frontiers are serial anyway).

### D3. Split concurrency caps (independent; small)

`adaptive-schema.js` (byte-identical ×4 — the cross-edition drift anchor) gains
`KAOLA_FANOUT_CAP_READONLY` (default 8) beside the existing `KAOLA_FANOUT_CAP` (default 4,
becomes the write-side cap). `parallel-batch.js` `capMembers` picks the cap by batch kind.
Read-only members are zero-blast-radius (no worktrees, no writes, evidence recorded
parent-side by the orchestrator) — a flat cap of 4 under-uses the cheap half of the system.

### D4. Write-lane containment hook (after #364) — the successor to `KAOLA_BATCH_CWD_ENFORCED`

A new `hooks/kaola-workflow-write-lane.sh`, registered as PreToolUse on `Write|Edit` (pattern
follows the existing pre-commit guard: `hooks/hooks.json`, fail-open on unparseable input,
short timeout):

- **No lane manifest present** (`.cache/running-set.json`, D5) → exit 0. Non-adaptive sessions
  and serial runs are untouched.
- Manifest lists open write-nodes, each with `worktreePath` (`.kw/node/<projTag>/<id>`) and
  `declared_write_set`. The hook resolves the target path and **denies**:
  - a write inside a member worktree that is outside that member's
    `declared_write_set` ∪ workflow bands (`kaola-workflow/`, `.cache/`) — cross-lane and
    overflow containment;
  - a write inside the **parent** worktree matching any open node's declared lane — the #320
    leak shape, caught at the moment of the write instead of stranded at seal-time
    (`empty_member` after the work was already done, the failure #364 documents).
- **Layered enforcement, honestly scoped:** the hook intercepts `Write`/`Edit` (the dominant
  edit path for role agents). Bash-mediated writes are NOT hook-intercepted; they remain
  covered by the existing fail-closed accounting (per-node `--barrier-check` own-lane
  allowlist + seal `empty_member`). Hook = fast-fail containment; barrier = ground truth.
- Flag story: #364 retires `KAOLA_BATCH_CWD_ENFORCED`. Its successor
  **`KAOLA_LANE_CONTAINMENT`** (schema-resolved, fail-closed default false, same shape as
  `resolveBatchCwdEnforced`, `adaptive-schema.js:290-293`) is set only where the hook is
  registered and verified. install.sh wires the hook ×4 editions (Claude `hooks/hooks.json`;
  Codex `.codex/hooks.json` per #284 — capability to deny may differ, so the flag stays
  per-edition fail-closed).
- **Acceptance must include a live harness probe**: a dispatched subagent attempting an
  out-of-lane `Write` is denied (the walkthrough cannot simulate hook firing; this is a
  manual/scripted harness check recorded as run evidence).

### D5. The running-set scheduler (after #364 + D4) — the core

Replace "advance one frontier unit" with an event-driven loop over a **running set**:

- **State:** `kaola-workflow/{project}/.cache/running-set.json` — the post-#364 successor of
  `active-batch.json`: `{ nodes: [{id, role, kind: "readonly"|"write", worktreePath?,
  baseline, openedAt}], updatedAt }`. The #293 legality invariant re-keys to it: multiple
  `in_progress` ledger rows are legal iff they exactly match the manifest's open set
  (`orient`/`crossCheckStatus` updated accordingly). Crash safety keeps the existing two-phase
  pattern (manifest written before ledger flips; `reconcile` generalizes to roll
  forward/back).
- **Open:** `adaptive-node.js` gains `open-ready [--max N]`: flips up to N ready-pending
  nodes (read-only cap D3 / write cap, independently), records per-node baselines, provisions
  `.kw/node/<projTag>/<id>` worktrees for write nodes **only when `KAOLA_LANE_CONTAINMENT`
  resolves true** — otherwise write nodes still open strictly one-at-a-time (today's serial
  behavior is the permanent fallback, never a regression).
- **Close (per node, immediately on completion):** `adaptive-node.js close-node --node-id`:
  evidence-shape gate → per-node `--barrier-check` → **join-on-close** (per-declared-path
  checkout/rm from the node worktree into the parent — the #292 join semantics, applied
  per-node instead of per-batch) → ledger `complete` → fused readiness recompute, returning
  the newly-ready set. Downstream nodes unblock **per node**, not per batch.
- **Dispatch loop (plan-run prose ×4):** dispatch every opened node `run_in_background`; on
  each completion notification run `record-evidence` → `close-node` → `open-ready` → dispatch
  the newly opened. Mixed read/write co-scheduling is now safe by construction (read-only
  members share the parent tree; write members are containment-hooked in their own trees).
  **Gates pipeline for free:** a `code-reviewer` whose targets closed dispatches while a
  disjoint lane still implements — join-on-close guarantees the reviewer sees its targets'
  changes in the parent tree. Post-dominance (`plan-validator.js:25-27, 881-907`) is a
  placement rule and needs zero changes.
- **Drain points (unchanged semantics):** `main-session-gate` (never concurrent with the main
  session, `plan-run.md:211-213`), consent/security/test_thrash halts, and plan-repair all
  stop new dispatch, let the running set drain, then proceed — exactly today's escalation
  contract.
- **Priority:** `next-action.js` orders `readyPending` by longest-path-to-sink over the frozen
  DAG (classic list scheduling; the DAG is already parsed there). Purely additive field.
- **Coordination:** #366 (batched validator subcommands) and #353/#354 (atomic IO / unified
  parsers) touch the same files — sequence v2 after or alongside them per the Phase-4 wave.

### D6. Optimistic lane concurrency (after D5; design-first)

With real isolation + per-node baselines, plan-time serialization can relax from *prevent* to
*detect-and-repair*:

- `plan-validator.js:746` (shared-infra fan-out → refuse "must serialize") and the
  coarse-area RED for declared groups downgrade to risk `ask` — same governance row that
  already covers write-role fan-out (`:1027-1032`). **Exact-path overlap stays a refusal**
  (`:853-864` — guaranteed conflict).
- Join-on-close upgrades from path-checkout to a **3-way merge** per overlapping path
  (`git merge-file`/`merge-tree` between the node's anchored baseline, the node tree, and the
  parent tree). Clean merge → proceed; conflict → new typed escalation `merge_conflict` in
  `adaptive-schema.js` HALT vocabulary, routed like `test_thrash` (bounded repair via
  `build-error-resolver`, or consent-halt).
- This is the unlock for the repo's own bread-and-butter: two nodes editing *different files
  in `scripts/`* finally run in parallel.

### D7. `map(<group>)` dynamic fan-out (after D5; design-first)

The grammar's first runtime-width shape, built from the `select` precedent (#263):

- `parseShape` accepts `map(<group>)`. The `## Nodes` table carries **one template row**
  (role ∈ WRITE_ROLES ∪ read-only, a `declared_write_set` **pattern** containing an
  `{instance}` placeholder, `selector_source`-style reference to a read-only **generator**
  node) — all hash-covered.
- The generator emits `map: <token>` lines in its `.cache/<id>.md` (parser sibling of
  `parseSelectorToken`, `adaptive-schema.js:131-137`). `adaptive-node.js expand-map --node-id`
  validates: token count ≤ `MAP_CAP` (new schema const, default 8), instance write sets =
  pattern substitution, pairwise-disjoint, and appends instance rows to a `## Map Expansions`
  section **outside the plan_hash** — exactly the `## Node Ledger` precedent for
  runtime-mutable state under a frozen plan.
- Instances clone the template's edges, so freeze-time post-dominance over the template covers
  every instance by construction; per-instance barriers use the substituted write set.
- Canonical use case: "apply X across the N editions" — today hand-enumerated per plan, the
  single most repeated DAG idiom in this repo's history.

## 4. What does not change

The post-dominance gate grammar, the unique `finalize` sink, `plan_hash` freeze semantics,
per-node barrier + evidence discipline, the consent/security/test_thrash escalation contract,
and the validator's fail-closed refusal style. **Every item above changes when nodes run,
never what must be proven.** D6 is the only item that touches a validator verdict, and it
moves one verdict between two *existing* governance classes (refuse → ask).

## 5. Verification policy (carried over from the #281 design, still binding)

- A green walkthrough proves STATE correctness only. **Claim wall-clock parallelism only from
  D1 telemetry on a real harness run**, never from the unit suite.
- D4's hook requires a live dispatched-subagent denial probe as recorded evidence.
- Everything ships ×4 editions; `adaptive-schema.js` stays byte-identical; new scripts
  register in `COMMON_SCRIPTS` + the three install.sh `SUPPORT_SCRIPT_NAMES` blocks; full
  `npm test` (or `test:parallel`) before any sink.
