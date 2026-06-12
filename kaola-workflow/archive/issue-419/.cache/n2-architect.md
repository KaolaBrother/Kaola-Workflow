8ea49bd30cfc
evidence-binding: n2-architect 8ea49bd30cfc

# Architecture: Parallelism v3 — Settled Design (issue #419)

This is the authoritative settled design. The doc-updater (n3) writes D-419-01 (Parts 1+3,
the coordination kernel + scheduler-default posture) and D-419-02 (Parts 2+4, disjoint-write
parallelism + speculative gate overlap) directly from the decisions, invariants, and open
questions recorded here. Every downstream implementation issue is constrained by the invariants
marked **[INV-N]**.

The design is grounded in the n1-survey evidence and a direct re-read of:
- `scripts/kaola-workflow-adaptive-node.js` — `readCoordinationState` (L1947), `runOpenReady`
  (L2109), `runCloseNode` (L2269), `mutationGuardPrologue` (L2058), `coordinationRefusal` (L2018).
- `scripts/kaola-workflow-plan-validator.js` — concurrent-sibling disjointness (L1007-1057),
  fan-out group disjointness (L880-928), post-dominance gates (L1059+), `disjointWriteSets` reuse.
- `scripts/kaola-workflow-classifier.js` — `disjointWriteSets` (L327, the shared verdict engine).
- `scripts/kaola-workflow-adaptive-schema.js` — `RUNNING_SET_NAME`, `DEFAULT_FANOUT_CAP_READONLY`,
  `LANE_CONTAINMENT_ENV`, `resolveLaneContainment` (default FALSE).
- `hooks/kaola-workflow-write-lane.sh` — the dormant #376 PreToolUse(Write|Edit) containment hook.

---

## OVERARCHING PRINCIPLE (binds all four parts)

The repo already CONTAINS every mechanism v3 needs; what is missing is **wiring + a stamp**, not
new machinery. Specifically:

1. The validator already COMPUTES disjointness at freeze time (`disjointWriteSets` over antichain
   write pairs, L1028-1056) — it just throws the verdict away after deciding pass/refuse instead
   of recording it on the node.
2. `open-ready` already has the running-set scheduler with two-phase crash-safe writes, baselines,
   longest-path-to-sink priority — it is just gated to `write_node_exclusive` for ALL write nodes.
3. The guard prologue already proves the three surfaces are mutually exclusive.
4. The write-lane hook already enforces lane containment — it is just dormant
   (`KAOLA_LANE_CONTAINMENT` default FALSE) and Bash-blind by deliberate layering.

v3 is therefore a **consolidation + activation** design, not a rewrite. This keeps the permanent
serial fallback byte-identical (the hard invariant of the whole adaptive path) and lets every new
capability degrade to today's behavior under its OFF condition.

---

## PART 1 — One Coordination Kernel (serial = running-set max=1)

### Decision P1

Unify the serial loop and the running-set scheduler conceptually onto ONE kernel where **serial is
running-set with `max_concurrent = 1`**, BUT do so by **subsumption, not deletion**. `open-next` /
`close-and-open-next` are RETAINED as the `max=1` fast-path aliases; they are NOT deprecated and NOT
rewritten into thin wrappers in this issue. The unification is a SEMANTIC contract (one invariant
defining "serial") plus a thin shared-derivation refactor — not a behavioral merge that would risk
the byte-identical fallback.

Rationale: `readCoordinationState` (L1965) ALREADY treats serial as a derived, degenerate predicate
(`inProgressIds.length === 1 && !runningSetLive && !batchLive && ...`). The kernel concept is already
half-built. A full collapse of `open-next` into `open-ready --max 1` is a tempting but dangerous move
because the serial path has a deliberately DIFFERENT guard matrix (open-next: `excl:['scheduler','batch']`,
NO integrity layer because orient already ran `--resume-check`; open-ready: `integrity:true,
excl:['serial','batch']`) and a DIFFERENT no-running-set.json on-disk footprint that the
byte-identity invariant depends on. We unify the MODEL and leave the two code paths as the kernel's
`max=1` and `max=N` entry points.

### P1.1 — The exact invariant that defines "serial" under the unified kernel

**[INV-1] Serial mode ⟺ `max_concurrent = 1` enforced by the kernel.** Concretely, the kernel's
"serial" predicate is the EXISTING `serialLive` derivation, re-stated as a cap statement:

> A run is in serial mode at instant T iff at most one node is `in_progress` AND that single
> `in_progress` node was opened under a `max=1` schedule. Equivalently (the on-disk witness):
> either there is no `running-set.json` (the legacy `open-next` footprint) OR the running-set
> carries `max_concurrent: 1`.

The kernel does NOT require a `running-set.json` to exist to be "in serial mode" — the absence of
the file IS the `max=1` witness for the legacy `open-next` path. This preserves the byte-identical
fallback: a serial `open-next` run continues to write NO running-set.json.

**[INV-2] (byte-identity, the hard invariant — carried verbatim from L2066):** With
`KAOLA_LANE_CONTAINMENT` off + no running-set + no active-batch + ≤1 in_progress row, every guard
layer is vacuously-pass and the serial path is byte-identical to pre-#383 behavior. P1 must NOT
break this. Any kernel refactor that makes `open-next` start writing a `running-set.json` VIOLATES
[INV-2] and is rejected.

### P1.2 — Data-structure changes

Add an OPTIONAL `max_concurrent` integer field to `running-set.json`:
`{ state, max_concurrent?, nodes:[...], updatedAt }`.

- **Set at claim/open time, NOT at plan-freeze time.** Rationale: concurrency is a RUNTIME
  resource limit (the same reasoning that makes `FANOUT_CAP_READONLY` a runtime cap, not a
  validity cap — see validator L706 "FANOUT_CAP is a RUNTIME concurrency limit"). The plan hash
  covers Meta + Nodes only; concurrency must NOT enter the frozen plan or the hash, or a re-run at
  a different concurrency would spuriously fail `governance_ack_stale` / resume-check tamper
  detection. `open-ready` resolves the effective cap from `--max` and `KAOLA_FANOUT_CAP_READONLY`
  at open time (it already does this at L2174-2179); `max_concurrent` simply PERSISTS that
  resolved value into the manifest so a `reconcile-running-set` roll-forward re-uses it.
- **Absence ⟹ `max_concurrent = 1`** (the legacy `open-next` default). A missing field is read as 1,
  never as "unbounded". Fail-closed.
- **[INV-3]** `max_concurrent` is advisory metadata for crash-resume continuity; the ENFORCED cap
  at each `open-ready` call remains `min(KAOLA_FANOUT_CAP_READONLY default 8, --max)`. The two must
  agree (open-ready re-resolves and overwrites on each open); `max_concurrent` is the witness, not
  the source of truth, so a tampered manifest cannot raise concurrency beyond the env-resolved cap.

### P1.3 — Fate of `open-next` / `close-and-open-next`

**RETAINED as the `max=1` serial aliases.** They are the kernel's degenerate entry points. Not
deprecated, not rewritten into wrappers in THIS issue (a wrapper rewrite is a separate, riskier
follow-up that must re-prove [INV-2] under the four-chain gate). What changes:

- **Documentation/model unification only:** the doc records state that serial = kernel `max=1`,
  and that `open-next`/`open-ready --max 1` are the two surfaces of one kernel.
- **Shared derivation (optional, low-risk):** the longest-path-to-sink ordering that `open-ready`
  consumes (next-action `readyPending`, sorted) could also order `open-next`'s single pick — today
  `open-next` picks the first pending in document order. Aligning `open-next` to pick the SAME
  highest-priority node `open-ready --max 1` would pick is a behavior change (different node first)
  and is therefore flagged as an **open question**, NOT silently adopted (it changes the serial
  pick order, which adversarial fixtures may pin).

### P1.4 — Typed states and crash-resume paths that MUST be preserved exactly

**[INV-4] The four ledger states are invariant:** `pending`, `in_progress`, `complete`, `n/a`. No
new ledger state is introduced by P1 (or by any other part — see P4).

**[INV-5] The running-set crash state `opening` is invariant.** The two-phase write (Phase 1
`state:'opening'` with the full intended node set → Phase 2 baselines+ledger flips → Phase 3
promote to `state:'open'`, L2210-2251) and its `reconcile-running-set` roll-forward/back must
survive byte-for-byte. Adding `max_concurrent` to the manifest must NOT alter the three-phase
ordering or the reconcile semantics.

**[INV-6] The serial fallback for write-role nodes is invariant** (a write node opens ALONE). P1
does not change this; Part 2 is the ONLY part that conditionally lifts it.

### P1.5 — Guard-prologue change: merge `serial_node_live` into `scheduler_active`?

**Decision: DO NOT merge the two refusal arms.** Keep `serial_node_live`, `scheduler_active`, and
`batch_active` as THREE distinct typed reasons.

Rationale: the emit-envelope contract (#406) requires callers to classify failures STRUCTURALLY by
a stable `reason` code, never by string-match. `serial_node_live` and `scheduler_active` carry
DIFFERENT repair pointers (`coordinationRefusal` L2047 → "close the live serial node
(close-and-open-next)"; L2027 → "close-node / reconcile-running-set"). The two refusals point the
operator at two different recovery subcommands. Collapsing them would degrade the repair guidance and
break any downstream `reason`-matching test. The `serialLive` PREDICATE remains a derived view in
the kernel model, but the REFUSAL taxonomy stays three-armed.

**[INV-7]** The `serialLive ⟺ crossCheckStatus single_in_progress` cross-consistency invariant
(L1962-1964, the #293 invariant, tested explicitly) survives unchanged. P1 must not perturb the
`serialLive` derivation in `readCoordinationState`.

### P1 open questions for the doc author
- OQ-P1-a: Should `open-next` adopt longest-path-to-sink pick order to match `open-ready --max 1`?
  (Behavior change; defer, flag in D-419-01 as a known divergence between the two `max=1` surfaces.)
- OQ-P1-b: The full `open-next` → `open-ready --max 1` wrapper collapse is explicitly OUT OF SCOPE
  for the v3 design issue; record it as a future consolidation contingent on re-proving [INV-2].

---

## PART 2 — Lane-Attributed Disjoint Write Parallelism (#376 graduation)

### Decision P2

Graduate #376 by having the validator **STAMP the disjointness verdict it already computes** onto
write nodes at freeze time, and having `open-ready` lift `write_node_exclusive` ONLY for a candidate
whose declared write set is disjoint from EVERY currently-open write node per that stamp. This is a
behind-`KAOLA_LANE_CONTAINMENT` capability; with the flag OFF (the permanent default) it is fully
dormant and the serial-write fallback [INV-6] holds.

### P2.1 — Freeze-time contract (the stamp)

The validator already classifies every antichain write pair (L1028-1056): EXACT-file overlap ⟹ RED
refuse; coarse/shared-infra overlap with a shared ancestor ⟹ ASK (`concurrentAmbiguousOverlap`);
truly disjoint ⟹ silently pass. v3 captures the third outcome.

**Decision: stamp a per-node `parallel_safe: true` boolean computed pairwise, recorded as a derived
annotation in the frozen plan's Node Ledger / node metadata — NOT a separate sidecar.** Concretely:

- For each WRITE-bearing node N, `parallel_safe(N) = true` iff for EVERY other write-bearing node M
  that is in an ANTICHAIN with N (neither reaches the other — the existing L1032 antichain test),
  `disjointWriteSets([N.writeSet, M.writeSet]).verdict === 'green'`. Otherwise `parallel_safe(N) =
  false`.
- **Pairwise, not global:** a node is parallel_safe only relative to its concurrent peers. A node
  whose only overlaps are with its own ancestors/descendants (ordered, never co-scheduled) is
  parallel_safe. This matches the existing antichain-only disjointness scope exactly.
- **[INV-8] The stamp is DERIVED, never authored.** The planner does NOT write `parallel_safe`; the
  validator computes it from declared write sets at freeze and stamps it. An author-supplied
  `parallel_safe` is ignored/overwritten (fail-closed: a hand-stamped `true` on overlapping sets
  must never grant concurrency). This keeps the existing RED-refuse on exact overlap intact — a
  RED pair never reaches the stamp because freeze refuses first.
- **Overlapping (non-refused, ASK-class coarse) write sets:** stamp `parallel_safe: false`. The ASK
  governance path (`concurrentAmbiguousOverlap` → decision:ask) is UNCHANGED; coarse-overlap pairs
  stay serial even when the human acks the plan. (Acking the plan authorizes the PLAN; it does not
  grant write concurrency to a coarse-overlap pair.)
- **Hash question — RESOLVED:** the stamp is a DERIVED projection of the write sets, which are
  already inside the hashed Node block. Stamping it into the ledger would change the hash. Decision:
  the `parallel_safe` stamp lives in `running-set.json` (written at open time by recomputing from
  the frozen, hash-covered write sets) **and/or** as a `--resume-check`-recomputable derived field
  the scheduler reads — it does NOT enter the frozen plan body and does NOT change `plan_hash`.
  Rationale: identical to the P1.2 reasoning — derived runtime metadata stays out of the hash.
  **[INV-9]** `parallel_safe` is recomputed deterministically from the hash-covered write sets on
  every read; a tampered annotation cannot grant concurrency (the scheduler recomputes, never
  trusts a persisted bool blindly).

### P2.2 — Runtime contract (`open-ready` use)

Replace the unconditional `liveHasWrite ⟹ write_node_exclusive` gate (L2151-2156) with a
lane-checked variant, ACTIVE ONLY when `resolveLaneContainment(env) === true`:

- Flag OFF (default): behavior is IDENTICAL to today — any live write node ⟹ `write_node_exclusive`,
  write nodes open alone. [INV-6] preserved verbatim.
- Flag ON: a candidate write node W may co-open with currently-open write nodes iff
  `disjointWriteSets([W.writeSet, ...each open write node's writeSet]).verdict === 'green'` for the
  candidate against EVERY open write node (recomputed, per [INV-9]). On overlap ⟹ candidate is held;
  return reason `write_awaits_drain` (the existing L2188 reason — no new reason code needed for the
  hold). The read-only fan-out path is unchanged.
- **[INV-10]** The check is against ALL currently-open write nodes, transitively pairwise — open a
  write node only if it is green against the live write SET, not merely against one member. This is
  the same all-pairs guarantee the freeze-time stamp provides.

### P2.3 — Carrying the #283 seal-vacuity guard forward

**[INV-11] (the #283 non-empty-in-lane guard MUST survive the lane-attribution shift).** Under v3
disjoint-write parallelism, write nodes still run in the PARENT worktree (per ADR 0008: the harness
cannot force a subagent CWD; member-worktree isolation was EXCISED). Therefore the #283 vacuity
guard takes its post-#364 form, NOT the worktree form:

> At close (`close-node` step (b), the per-node `--barrier-check`), the barrier's own-lane allowlist
> IS the ground truth. A write node that produced NO writes inside its declared lane is caught by
> the barrier: zero in-lane changes against a non-empty declared write set is the vacuity signal.
> The barrier already enforces "every change ∈ declared write set"; v3 adds the dual "declared
> write set was actually written" via the existing evidence-shape + barrier composition. The
> seal-time `git -C status --porcelain non-empty AND in-lane` check from the batch path is
> SUBSUMED by the per-node barrier in the running-set scheduler (close-node runs the barrier per
> node, L2324-2328) — there is no member worktree to check, so the porcelain check collapses to
> the parent-side barrier allowlist. The guard SURVIVES as: barrier allowlist (no out-of-lane
> write lands) + the write-lane hook (no out-of-lane write at write time, when flag ON). Two layers,
> both parent-side, both already present.

**[INV-12]** The barrier remains the ground truth (verbatim from ADR 0008 reintroduction note + the
write-lane hook header "Hook = fast-fail containment; barrier = ground truth"). The hook is a
fast-fail convenience; if the hook is somehow bypassed, the barrier still refuses the close.

### P2.4 — `out-of-lane` writes: exact failure mode

Two distinct, LAYERED failure modes (defense in depth — both must be documented as such):

1. **Write-time (hook, flag ON only):** the #376 PreToolUse(Write|Edit) hook DENIES (exit 2) an
   out-of-lane Write/Edit before it lands. Self-exempt for the open write node's own lane (#386
   arch ii, hook L107). This is the FAST-FAIL layer. **Bypass surface (documented honestly,
   verbatim posture from #386):** the hook intercepts `Write|Edit` ONLY; Bash-mediated writes
   (`echo >`, `sed -i`, redirections) bypass it. This is INTENTIONAL layering, not a hole.
2. **Close-time (barrier, ALWAYS — flag-independent):** the per-node `--barrier-check` allowlist
   refuses the close if ANY change (including a Bash-mediated one that slipped past the hook) is
   out of the node's declared write set. Reason: `barrier_failed` (the existing close-node L2327
   refusal), with the underlying validator reason in the emit envelope (`write_set_overflow` /
   `write_set_granularity` / `sensitive_write_unreviewed` / `foreign_archive`).

**Decision: there is NO new `unattributed_write` reason code.** An out-of-lane write surfaces as
either a hook `exit 2` (write-time) or the EXISTING `barrier_failed` / `write_set_overflow` family
(close-time). Adding a fifth reason would fork the emit envelope; reuse the existing taxonomy.

**[INV-13]** A Bash-mediated out-of-lane write CAN bypass the hook but CANNOT bypass the barrier.
The barrier is the security boundary; the hook is the ergonomics boundary. Any design doc must state
this asymmetry explicitly so the reader does not assume the hook is a security control.

### P2.5 — Precondition on Part 1

**Part 2 does NOT strictly require the full P1 kernel collapse, but it DOES require the P1.2
`max_concurrent` field semantics** — concurrent write nodes need the running-set scheduler
(`open-ready`/`close-node`) to be the active surface, which is the `max>1` arm of the kernel. So:

**[INV-14] Part 2 requires the running-set scheduler (the `max=N` kernel arm) to be active; it
cannot work on the serial `open-next` surface.** Concurrent disjoint writes are dispatched via
`open-ready` (which can hold a set in the running set), never via `open-next` (one row only). In
practice this means Part 2 is layered ON the unified-kernel MODEL of Part 1 (serial = max 1,
scheduler = max N), but does not require the optional `open-next` wrapper collapse. State the
dependency as: **P2 depends on the P1 kernel MODEL + `max_concurrent` field, not on the P1.3 wrapper
collapse.**

### P2 open questions for the doc author
- OQ-P2-a: Where physically does `parallel_safe` live — recomputed-only (scheduler computes from
  write sets on each open) vs persisted-in-running-set.json (witness, recomputed-verified)?
  Recommendation: recompute-on-open + persist as a witness for reconcile continuity, mirroring
  `max_concurrent`. The doc should pin "recompute is authoritative; persisted value is a witness."
- OQ-P2-b: The classifier `disjointWriteSets` coarse/exact verdict granularity is the SAME engine
  freeze and the scheduler use; confirm the doc cites the single-source-of-truth reuse (no second
  disjointness implementation, per the L924/L1001/L1053 reuse pattern).

---

## PART 3 — Scheduler-Default Posture

### Decision P3

Make the running-set scheduler (background dispatch + rolling top-up) the DOCUMENTED default
posture across the six plan-run surfaces. Serial (`max=1`) remains the documented DEGRADED mode.
This is a PROSE + planner-rubric change; the runtime default behavior already supports both.

### P3.1 — The exact change to the six plan-run frontmatter surfaces

Current frontmatter (all six surfaces, identical): "...via a running-set scheduler; each frontier
unit dispatched when its dependencies complete. Resume-safe."

**New frontmatter (must reach ALL SIX surfaces — the 3 Claude commands + 3 Codex SKILL packs, per
the #400 six-surface propagation rule):**

> "...via a running-set scheduler; ready nodes are dispatched concurrently (background dispatch +
> rolling top-up) up to the runtime fan-out cap, with critical-path nodes first; serial (one node at
> a time) is the degraded fallback for write nodes and when lane containment is off. Resume-safe."

Body prose ("dispatching one frontier unit at a time and checkpointing between calls") changes to:
"dispatching the ready frontier concurrently up to the fan-out cap, topping up as nodes close, and
checkpointing between calls; serial when a write node is live or lane containment is off."

**[INV-15] Six-surface propagation is mandatory.** Per CLAUDE.md Validation Policy and #400: this
prose reaches the 3 Claude commands + 3 Codex SKILL packs (including the two forge-codex packs).
The route-reachability contract (`scripts/test-route-reachability.js` + all four
`validate-*-contracts.js`) machine-enforces it. A change reaching only 4 of 6 is a propagation gap.
**[INV-16] Cross-edition: all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains
must be green, run sequentially, before finalization.** A green claude chain alone is insufficient.

### P3.2 — The planner rubric line rewarding overlap via `longestPathToSink`

Add to the `workflow-planner` authoring rubric:

> "Prefer a WIDE ready frontier over a long serial chain when nodes are independent: author parallel
> read-only analysis/review nodes (they fan out to the read cap) and parallel write nodes with
> DISJOINT declared write sets (they co-schedule under lane containment). The scheduler opens
> highest `longest-path-to-sink` nodes first (critical-path-first list scheduling), so place the
> longest dependency chain on the critical path and let short independent branches overlap it. Do
> NOT serialize independent work behind a single chain merely for ordering simplicity — every
> serialized independent node adds its full duration to the makespan; every overlapped node hides
> behind the critical path for free."

Concrete heuristic: "If two write nodes touch DISJOINT files and neither depends on the other, do
not add a dep edge between them — leave them as an antichain so the validator stamps them
`parallel_safe` and the scheduler overlaps them. Only serialize (add a dep) when their write sets
overlap (the validator will otherwise RED-refuse the exact-overlap antichain)."

**[INV-17]** The rubric REWARDS overlap but never INSTRUCTS the planner to author `parallel_safe`
(that is validator-derived, [INV-8]). The planner authors TOPOLOGY (deps) and DISJOINT write sets;
the validator derives concurrency-safety.

### P3.3 — When serial remains the documented degraded mode

Serial (`max=1`) is the documented degraded mode in ALL of these cases (any one ⟹ serial):

1. **A write node is live AND lane containment is off** (`KAOLA_LANE_CONTAINMENT != true`) — the
   permanent default; the [INV-6] write-alone fallback.
2. **A write node is live whose write set OVERLAPS a candidate** even with containment ON (the
   `parallel_safe: false` case) — overlapping writes never co-schedule.
3. **`KAOLA_LANE_CONTAINMENT` off** generally — no write parallelism at all; reads still fan out.
4. **A `main-session-gate` node** — excluded from fan-out (L2162); the main session cannot run
   concurrently with itself.
5. **A frontier with only one ready node** — trivially `max=1` for that step (degenerate, not a
   mode switch).
6. **Integrity / halt / cross-surface refusal** — any guard-prologue trip forces a stop, not a
   silent serial degrade (it is a refusal, distinct from degraded-but-running).

**[INV-18]** "Scheduler-default" is a DOCUMENTATION/posture change; it does NOT change the OFF
default of `KAOLA_LANE_CONTAINMENT`. Read fan-out is default-on (the scheduler already fans reads to
cap 8); WRITE parallelism remains gated behind the flag. "Default scheduler posture" means
"the scheduler is the documented primary executor and reads fan out by default," NOT "write
parallelism is on by default." This distinction must be explicit in D-419-01 to avoid a reader
assuming v3 turns on write concurrency by default.

### P3.4 — Dependency on Parts 1 and 2

- **P3 requires the P1 kernel MODEL** (serial = scheduler max 1) so "serial is the degraded mode"
  is a coherent statement (degraded = the `max=1` arm of the SAME kernel, not a separate machine).
- **P3 read-fan-out posture does NOT require P2.** Reads already fan out today; documenting the
  scheduler as default for reads is independent of write-lane attribution.
- **P3 WRITE-parallelism posture requires P2** (the `parallel_safe` stamp + lane check). State the
  split: **P3 depends on P1 (kernel model); the write-overlap half of P3's rubric additionally
  depends on P2; the read-fan-out half depends on neither beyond what ships today.**

### P3 open questions for the doc author
- OQ-P3-a: Should the frontmatter mention `KAOLA_LANE_CONTAINMENT` by name, or keep it abstract
  ("lane containment")? Recommendation: abstract in frontmatter (length), name it in the body +
  the env-var docs section.
- OQ-P3-b: Confirm the exact six surface file paths with the doc author so the route-reachability
  contract stays green (3 commands + 3 SKILL packs).

---

## PART 4 — Optional Consent-Gated Speculative Gate Overlap

### Decision P4

Allow a NON-gate descendant node to open SPECULATIVELY (`in_progress`) while its post-dominating
gate node is still `in_progress`, with the speculative work DISCARDABLE if the gate fails. This is
the highest-risk part and is OPT-IN, OFF by default, and bounded by an explicit invariant that
post-dominance over the COMPLETE state is never weakened.

### P4.1 — The consent model

**Decision: a per-PLAN `speculative_open_policy: off | consent | auto` field, default `off`, with
`consent` requiring a per-RUN user grant at `decision:ask` time.**

- `off` (default): no speculative open. Today's behavior — a descendant cannot open until its gate
  is `complete`. The permanent fallback.
- `consent`: the planner MAY mark specific edges as speculative-eligible; the scheduler opens a
  speculative descendant ONLY after the USER grants consent for THIS run (at the existing
  `decision:ask` checkpoint — which is already audit metadata, per CLAUDE.md "decision:ask is audit
  metadata, not a gate," but here it becomes the consent capture point). Consent is per-run, not
  persisted in the frozen plan (so it does not enter the hash).
- `auto`: reserved/unsupported in v3 (documented as future; the doc records it as a named-but-
  -inactive value so the schema is forward-compatible). **Decision: ship only `off` and `consent`;
  reject `auto` at freeze with a typed refusal until a future issue defines its risk envelope.**

**[INV-19]** Consent is captured per-run by the user (the human at decision:ask), never auto-granted
by an agent. The policy field gates ELIGIBILITY (plan-level); the per-run consent gates ACTIVATION.
Both must be true to speculatively open.

### P4.2 — The discard path

If the gate node closes with `verdict != pass` (gate fails), the speculative descendant's work is
discarded as follows, in order:

1. **Ledger:** reset the speculative node's row `in_progress -> pending` (NOT a new state — [INV-4]
   holds; reuse the existing reopen/reset transition). It becomes re-runnable.
2. **Baseline:** drop its per-node baseline (`commit-node --drop-base`, the SAME mechanism
   `reconcile-running-set` uses to drop a dropped member's baseline, L survey §1b).
3. **Running set:** remove the speculative node from `running-set.json` (the existing close-direction
   removal, mirroring close-node step (e), L2369-2379).
4. **Evidence:** discard its `.cache/{node-id}.md` evidence file (it is bound to the now-dropped
   baseline nonce; a stale evidence file would fail the next open's evidence-binding check anyway,
   but discard it explicitly to avoid an `evidence_stale` confusion on re-run).
5. **On-disk writes:** if the speculative node WROTE files, they must be reverted to the gate's
   baseline. **Decision: a speculative node that writes is BOUND to its own baseline; the discard
   does `git`-level revert of the speculative node's declared write set back to the baseline
   snapshot** (the baseline that `commit-node --start` recorded). This is why the baseline drop
   (step 2) is ordered AFTER the revert in practice — the revert TARGET is the baseline.

**[INV-20] The discard is a roll-BACK to the speculative node's recorded baseline, never a
roll-forward.** No partial speculative write survives a gate failure. The baseline-snapshot revert
is the existing barrier-base mechanism; v3 adds the revert-on-gate-fail wiring, not a new snapshot
machine.

### P4.3 — How post-dominance is preserved

**[INV-21] (the load-bearing invariant of Part 4): "speculative open" means the descendant is
`in_progress`, NEVER `complete`, while the gate is `in_progress`. The gate's `close` (to `complete`
with `verdict: pass`) remains the STRICT prerequisite for the descendant's OWN
`close-and-open-next` / `close-node`.**

Concretely, post-dominance (a gate G post-dominates descendant N iff, after removing every G-role
node, N can no longer reach the sink — validator L26-27, `gateUncovered`) is enforced at the
COMPLETE boundary, not the in_progress boundary:

- Freeze-time post-dominance (G1/G3 gates, L1059+) is UNCHANGED. The static gate-coverage check
  still requires a gate to post-dominate every code-producing node.
- Runtime: a descendant may be `in_progress` concurrently with its `in_progress` gate (speculative),
  BUT `close-node`/`close-and-open-next` for the descendant MUST refuse if its post-dominating gate
  is not `complete` with a passing verdict. **Add a close-time precondition:** before closing a node
  N whose gate G is a post-dominator, assert `ledger[G] === 'complete'` AND G's verdict is pass
  (the `--verdict-check` / `--gate-verify` already verifies gate EXECUTION over the ledger,
  validator L408). If G is still `in_progress`, the descendant's close returns a typed refusal
  (`gate_not_complete` — a NEW reason, since no existing code path closes a node ahead of its gate).

**[INV-22]** The existing `--gate-verify` post-dominance EXECUTION check (validator L408, "verify
gate EXECUTION over the runtime Node Ledger") is the enforcement point. Speculative open does not
touch it; it adds a sibling close-time guard that the gate is `complete` before the descendant's
close. No descendant reaches `complete` ahead of its gate ⟹ post-dominance over the complete-set is
preserved exactly.

### P4.4 — Precondition on Part 1

**[INV-23] Part 4 REQUIRES the P1 kernel `max>1` arm** (the running-set scheduler), because
speculative overlap means TWO nodes (gate + descendant) are `in_progress` simultaneously — which is
exactly the running-set fan-out the serial `open-next` surface cannot represent (one row only).
Part 4 cannot work on the serial-only surface. State the dependency: **P4 depends on P1 (the
scheduler/`max>1` arm) AND is independent of P2** (the gate may be a read-only review node and the
speculative descendant may be read-only — no write-lane attribution needed for the read case).
Where the speculative descendant WRITES, P4 additionally inherits P2's lane discipline (the
speculative write must be in-lane and disjoint from any concurrent write, [INV-10]).

### P4.5 — Blast radius and the guard

**Risk:** a speculative descendant that WRITES files which conflict with the gate's eventual review
findings. E.g., a `code-reviewer` gate finds a security defect; meanwhile a speculative `implement`
descendant already wrote code building ON the defective code. If not contained, the speculative
write pollutes the tree and the gate failure's blast radius widens.

**[INV-24] (the guard): a speculative descendant that WRITES is opened ONLY when (a) its write set
is disjoint from the gate's review surface AND from every concurrent write node ([INV-10] / P2 lane
discipline), AND (b) the discard path ([INV-20] baseline roll-back) is wired and tested.** The
strongest containment: **a speculative WRITE descendant is gated behind BOTH `speculative_open_policy:
consent` AND `KAOLA_LANE_CONTAINMENT=true`** (so the write-lane hook + barrier bound its writes).
A speculative READ-ONLY descendant (the common case: pre-fetching the next analysis while review
runs) has near-zero blast radius (no writes to revert; evidence discard only) and is the
RECOMMENDED default scope for v3 — the doc should frame speculative WRITE overlap as the advanced,
double-gated case and speculative READ overlap as the primary use.

**[INV-25]** If the gate fails, ALL speculative descendants opened under it roll back ([INV-20]),
not just the conflicting one — the gate failure invalidates the entire speculative frontier opened
behind it. This is conservative-correct: a gate failure means the premise the speculation built on
is void.

### P4 open questions for the doc author
- OQ-P4-a: Should `speculative_open_policy` be a Meta field (hash-covered, so it is frozen and
  resume-stable) or a runtime flag? Recommendation: Meta field (frozen) for ELIGIBILITY +
  per-run consent for ACTIVATION — the eligibility SHOULD be in the hash (it changes the legal
  execution shape and must be tamper-evident), unlike concurrency caps which are pure resource
  limits. This is the one new field that SHOULD enter the hash; flag the asymmetry vs P1.2/P2.1
  for the doc author to state deliberately.
- OQ-P4-b: The new `gate_not_complete` close-refusal reason must be added to the emit-envelope
  precedence family; confirm its precedence rank with the validator's reason ordering.
- OQ-P4-c: Recommend v3 SHIP only speculative READ overlap (`off`/`consent` for read descendants);
  defer speculative WRITE overlap to a follow-up issue with its own adversarial gate, given the
  double-gating and roll-back complexity. The doc should record write-overlap as DESIGNED-but-
  -deferred so the schema is forward-compatible without shipping the risk.

---

## CROSS-PART DEPENDENCY SUMMARY (for the doc author's "sequencing" section)

| Part | Depends on | Independent of | Default state |
|------|-----------|----------------|---------------|
| P1 kernel model (serial = max 1) | nothing (precondition for 2-4) | — | always |
| P1.3 open-next wrapper collapse | P1 model | — | OUT OF SCOPE (future) |
| P2 disjoint write parallelism | P1 model + max_concurrent + scheduler max>1 arm | P3, P4 | OFF (KAOLA_LANE_CONTAINMENT default false) |
| P3 scheduler-default posture (reads) | P1 model | P2 | reads fan out (already today) |
| P3 scheduler-default posture (writes) | P1 model + P2 | P4 | OFF (writes serial unless P2 flag on) |
| P4 speculative read overlap | P1 (max>1 arm) | P2 | OFF (speculative_open_policy default off) |
| P4 speculative write overlap | P1 + P2 + P4 consent | — | DESIGNED-but-DEFERRED |

**Build sequence (for downstream implementation issues, by dependency):**
1. P1: `max_concurrent` field + kernel-model documentation + [INV-2/INV-7] byte-identity tests.
2. P2: validator `parallel_safe` derivation/stamp + `open-ready` lane-checked write co-open +
   write-lane hook activation tests, all behind KAOLA_LANE_CONTAINMENT.
3. P3: six-surface frontmatter/body prose + planner rubric + four-chain green.
4. P4: `speculative_open_policy` Meta field + `gate_not_complete` close-refusal + baseline
   roll-back discard path; SHIP read-overlap, DEFER write-overlap.

**Invariants that bind EVERY downstream issue:** [INV-2] serial byte-identity; [INV-4] four ledger
states only; [INV-5] running-set `opening` crash state + reconcile; [INV-6] write-alone fallback
(unless P2 flag on + disjoint); [INV-9]/[INV-12] barrier is ground truth, stamps/hooks are derived/
fast-fail; [INV-16] four-chain cross-edition green; [INV-21] speculative = in_progress never
complete; gate close is the strict prerequisite for the descendant's close.

docs: complete
