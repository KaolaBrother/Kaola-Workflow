# Architecture

Document system boundaries, major components, data flow, and deployment shape.

## Workflow Paths (fast / full / adaptive)

Kaola-Workflow runs an issue through one of three macro-shapes, selected by agent
judgment in `workflow-next.md` Step 0a-1 (scripts validate, never auto-pick — #44):

- **fast** — single-pass Plan+Execute+Review (`fast-summary.md`); one fixed shape.
- **full** — the fixed 6-phase ladder (P1→P6); the default and the answer to every doubt.
- **adaptive** (issue #227, the unconditional default) — the agent
  **freely composes a task-shaped DAG** of role nodes inside a fixed lifecycle frame:

  ```text
  claim ──► branch / worktree ──► [ FREE DESIGN ] ──► Finalization sink
  (atomic, classifier-checked)     agent composes      (close, archive,
                                   the orchestration    roadmap regen)
  ```

  The agent owns the *middle* (how many explorers, whether to fan out `tdd-guide`
  over disjoint sub-areas, extra review passes, ordering, bounded loops). The
  **harness owns the frame and the computed gates**: the runtime-closed role
  library + fixed models (`resolve-agent-model`; see **Model resolution** below), the four shapes
  (sequence / fan-out / bounded loop / selective-execution `select`), a unique `finalize` sink, **post-dominance**
  gates (`code-reviewer` over every code-producing node — implement roles, plus any
  write role writing a non-docs file, plus non-docs writes declared on the `finalize`
  sink; `security-reviewer` over every sensitive node — computed as
  reachability-after-gate-removal, so they hold over *any* topology), the caps,
  intra-issue write-set disjointness, and the durable
  `workflow-plan.md` + `## Node Ledger` + `plan_hash` resume contract.

  **Components.** `kaola-workflow-adapt` dispatches the `workflow-planner` front-end
  subagent, which claims + authors `workflow-plan.md`;
  `kaola-workflow-plan-validator.js` proves it in-grammar + computes the governance
  decision (low-risk → provisional auto-run; risky/uncertain → ask, fail-closed;
  out-of-grammar → typed refusal) + freezes `plan_hash`; `kaola-workflow-plan-run`
  executes the DAG node-by-node with a per-node checkpoint barrier
  (`.cache → ledger → state-pointer`), a runtime risk re-scan that revokes a
  provisional auto-run (halt for consent) when a write turns out sensitive, and a
  quorum/decision step over read-only fan-out (e.g. `adversarial-verifier`
  skeptics). `repair-state.js` `routeAdaptive` resumes by traversing the frozen plan
  ahead of the phaseN ladder. The Finalization sink, claim/branch/worktree lifecycle, and
  the nine canonical roles are **inherited unchanged** — only small adaptive-aware
  touches are added. The switch gates selection only; resume is toggle-agnostic.
  **Note (issue #260):** when `KAOLA_WORKTREE_NATIVE=0` (explicit worktree opt-out), claim/startup now creates and checks out the feature branch in-place rather than leaving work on the default branch; the pre-checkout branch is recorded as `base_branch` in the Sink block and restored (with feature branch deleted) on `discard`/`release`.

  **Lean-orchestrator boundary (issue #242 Part B; realigned to the original intent in v5.0.0).** The lean-orchestrator keeps the main Opus orchestrator's context lean by dividing responsibility along a strict judgment vs. mechanical line. The Opus orchestrator owns all **judgment**: which role runs next, whether work is correct, risk assessment, gating/consent decisions, the **sink** (merge/PR + `gh issue close` recheck), the **branch cut**, the research synthesis (`phase1-research.md`), and the adaptive freeze + risk-governance decision (#44: the agent owns reasoning; the `workflow-planner` front-end subagent authors the `## Nodes` DAG, but Opus governs and decides the freeze). A separate mechanical **contractor** agent (Sonnet) owns the **Finalization** mechanical block only (the Step 8a artifact mirror, the `cmdFinalize` archive, the roadmap-mirror regen, and the `chore: finalize` staging commit) — the SOLE remaining contractor seam (ADR 0004 keeps Phase 6 contractor-owned pending a dedicated finalization transaction script). Every other mechanical transition is now script-owned and run directly by the main session: the adaptive freeze/handoff (`kaola-workflow-adaptive-handoff.js`, #255), the fast path (`kaola-workflow-fast-advance.js`, #456), and the full path's Phase 1/2/3/5 checkpoints + phase-file authoring and Phase 4 progress/task/failure-ledger bookkeeping (`kaola-workflow-full-advance.js` / `kaola-workflow-phase4-advance.js`, #457/#458). The router/startup bootstrap also stays a deterministic main-session bash block (for `KAOLA_PATH=adaptive` the router skips its inline startup and routes to `/kaola-workflow-adapt`, where the `workflow-planner` front end performs the claim; an existing frozen `workflow-plan.md` routes to `/kaola-workflow-plan-run` and is never re-authored). The adaptive per-node lifecycle (open, record evidence, close, advance, halt) is now owned by `kaola-workflow-adaptive-node.js` — typed script transactions run directly by the main session in `/kaola-workflow-plan-run`, with no contractor subagent needed for those mechanical transitions. The main session always keeps the **dispatch** of role agents *and* the contractor (a subagent cannot dispatch a subagent, so the dispatch loop stays with Opus), and **hands its verdict into the transaction script** for any judgment-bearing file (e.g. the phase-2 Selected Approach and phase-5 Review Status via `kaola-workflow-full-advance.js`, the fast `## Status` PASSED/ESCALATED via `kaola-workflow-fast-advance.js`, and — at Finalization — the verdict handed into the contractor); the script (or, at Finalization, the contractor) transcribes it verbatim and never judges, dispatches, sinks, closes, or asks. For the adaptive plan, the **`workflow-planner`** front-end subagent (a locally-authored Opus agent, distinct from the vendored read-only in-plan `planner` node) owns the claim + authors the `## Nodes` table; Opus then governs the risk decision and `kaola-workflow-adaptive-handoff.js` stamps the `plan_hash` freeze (#255). The contractor is Sonnet and stays Sonnet even under `--profile=higher` (mechanical transcription cannot be judgment-upgraded; there is deliberately no `profiles/higher/contractor.md`). **Shell-var lifetime:** a subagent runs in its own shell, so the orchestrator captures sink/worktree metadata BEFORE a contractor dispatch and re-derives its own paths after; durable git/file state (worktree creation, the created `workflow-state.md`, commits, archives) persists across the boundary and is reused at the sink. The boundary in one line: **Opus decides *what* + dispatches *subagents* + owns synthesis + the sink/close + the branch cut; the contractor runs the Finalization mechanical block only; `kaola-workflow-fast-advance.js` / `kaola-workflow-full-advance.js` / `kaola-workflow-phase4-advance.js` own the fast/full phase transitions and `kaola-workflow-adaptive-node.js` owns the adaptive per-node lifecycle transactions, all main-session-direct; the aggregator scripts own the per-node barrier choreography.** The contractor's bookkeeping role (Finalization only) is a deliberate design to keep the main Opus context free of transcription work; the fast/full phase transitions and the adaptive per-node loop are direct script calls, not contractor round-trips. See `docs/api.md` § Contractor Agent for the tools list and all-edition registration details.

  **Strict lean-orchestrator boundary (issue #277 — script-enforced seams).** #277 hardens the lean-orchestrator boundary from prose guidance to script enforcement via three complementary mechanisms:

  - **M3 — Procedure relocation (PREVENTION).** The complete Finalization procedure (scripts, bookkeeping, archive, roadmap regen) now lives solely in the `contractor` agent profile. The claim + author + adaptive-handoff procedure lives solely in the `workflow-planner` profile. Orchestrator command files (`finalize.md`, `kaola-workflow-adapt.md`) keep only thin dispatch handles. `validate-workflow-contracts.js` text-locks the contractor dispatch handle on all four editions — removing it from an orchestrator command file fails the contract gate.

  - **M4 — Run posture.** Adaptive claim always provisions a repo-local worktree (via `workflow-planner`-driven startup). Startup writes `run_posture: worktree|in-place` to the `## Sink` block of `workflow-state.md`, derived from the actual worktree resolution (`deriveRunPosture(worktreePath)` in `kaola-workflow-claim.js`: truthy path → `worktree`, falsy → `in-place`). The value is never env-forced or inherited; `in-place` persists as the automatic fallback only. No `--worktree` flag is needed.

  - **M1 — SubagentStart dispatch-log hook.** A `SubagentStart` hook (`hooks/kaola-workflow-subagent-dispatch-log.sh`, id `kaola-workflow:subagent-dispatch-log`) records each subagent spawn — `ts`, `agent_type`, `agent_id`, `cwd` — as one JSON line to `kaola-workflow/{project}/.cache/dispatch-log.jsonl` for every active project. **Dual-root capture (#338):** the hook resolves BOTH its own cwd toplevel (the main session's repo) AND the dispatched agent's `cwd` (`AGENT_CWD`) toplevel, appending under each distinct active root — so a subagent dispatched into a linked **worktree** is logged where the worktree's `cmdFinalize` reads its `.cache/`. In-place runs (the two roots coincide) append exactly once. The hook is fail-open (exit 0 always) and active on all four editions (claude/codex/gitlab/gitea). On Codex it is wired from the global `~/.codex/hooks.json` installed by `install-codex-agent-profiles.js`, with hook scripts copied into `~/.codex/kaola-workflow/{hooks,scripts}`; it requires Codex `multi_agent` enabled — with it off the hook never fires and attestation reads `missing` (non-fatal, WARN-first).

  - **M2 — WARN-FIRST closure attestation.** `checkDispatchAttestations` (wired into the closure path at finalize time) reads the dispatch log and records `claim_planner_attested` / `finalize_contractor_attested` (enum: `attested|missing|failed`) in the closure receipt. It pushes warnings but never modifies `closure_invariants.violations` — missing attestation is advisory, never blocking. If the dispatch log is absent, both fields are set to `missing` and the detector is noted inactive. **Contractor self-attest back-fill (#338):** `cmdFinalize --attest-contractor-spawn` writes a `contractor`/`finalize-backfill` entry into the archived `.cache/dispatch-log.jsonl` (mirror of the claim-seam `--attest-planner-spawn`), so a genuinely delegated finalize reads `attested` even where the hook cannot fire (worktree dispatch, hookless harness). The contractor profile's Step 8b passes the flag; an inline main-session finalize that omits it still reads `missing`. The honest limit: this catches casual zero-spawn bypasses; the log itself is in the project-controlled `.cache/` directory.

  **Codex harness hardening (issue #266).** Three additions harden the Codex edition of the adaptive path against config drift, silent inline execution, and state loss after compaction:

  - **Preflight gate (`kaola-workflow-codex-preflight.js`).** A hard gate that MUST pass before any `subagent-invoked` compliance row is written. Since #332 it is a SCHEMA-VALID (not existence-only) gate: it verifies that `.codex/agents/kaola-workflow/*.toml` role-profile files are present AND schema-valid (a non-empty top-level `name` matching the role — codex ≥0.138 silently ignores a profile without one — an optional `model_reasoning_effort` that must be a legal value when present but may be omitted since #451, and a non-blank `developer_instructions`), that the managed `.codex/config.toml` block (delimited by `# BEGIN/END kaola-workflow agents`) includes every current-template role and no retired/foreign role, and that no stale/retired Kaola `.toml` files survive (detected via the per-install `.kaola-managed-profiles.json` ownership manifest plus a known-retired list, e.g. the `docs-lookup.toml` removed in #249). The companion installer (`install-codex-agent-profiles.js`) writes that manifest and, default-on, validates the source tree → installs → prunes stale/retired files → post-verifies before printing its `status: ok` sentinel. When the only problem is autofixable (stale/missing/malformed block or profile, stale Kaola file) the preflight auto-reinstalls then re-verifies ALL checks; when unsafe (hand-authored `[agents.*]` outside the markers, an unsupported future manifest schema, missing template role, installer failure) it emits a typed refusal and exits non-zero. Unknown user-owned TOMLs are reported, never deleted. A READ-ONLY `--doctor` mode reports user/project/plugin-cache scope freshness with concrete per-scope repair commands (plugin-cache findings are evidence-only). Never a silent `subagent-invoked`. See `docs/api.md` § Codex Harness Scripts for CLI and exit codes.
  - **Durable task mirror (`kaola-workflow-task-mirror.js`).** Generates `kaola-workflow/{project}/workflow-tasks.json` from the frozen `## Nodes` + `## Node Ledger`. The Codex UI task list mirrors this file; `workflow-tasks.json` is NOT the source of truth — the `## Node Ledger` is. Regenerated when missing, unparseable, or stale (hash mismatch). See `docs/workflow-state-contract.md` § Codex Task Mirror for the source-of-truth chain and schema.
  - **Compact/resume hook (`kaola-workflow-codex-compact-resume.js`).** A self-contained stdin/stdout filter that reads the four durable artifacts (`workflow-state.md`, `workflow-plan.md` `## Node Ledger`, `workflow-tasks.json`) and emits a deterministic 6-section resume packet: active project, next skill/command, in-progress node, pending gates, consent-halt markers, task-mirror summary. Does not mutate state. No `CLAUDE_PLUGIN_ROOT` dependency; edition-named ×3 (codex/gitlab/gitea). On Codex this script is wired as a `SessionStart` (`compact`) hook (id `kaola-workflow:compact-context`) in the global `~/.codex/hooks.json` installed by `install-codex-agent-profiles.js`; it is also still invokable on demand via stdin (`node <path> < session.json`). Note: the Codex plugin manifest (`plugin.json`) has no `hooks` key — the wiring lives entirely in `~/.codex/hooks.json`, while agent profiles and config remain project-local under `.codex/`. See `docs/api.md` § Codex Harness Scripts for the packet format.

  **Main-direct carve-outs (explicitly out of attestation scope per §5).** The adaptive per-node lifecycle transactions (`kaola-workflow-adaptive-node.js`) and the Finalization sink (`sink-merge.js` / `sink-pr.js`) are intentionally main-direct. No provenance is added there; they are not expected to generate contractor or planner dispatch-log entries. Consistent with this, the adaptive `finalize` DAG sink node — whose bookkeeping the main session performs directly (no `Agent()` dispatch) — records its Required Agent Compliance row as `main-session-direct`, NOT `subagent-invoked` (#338); certifying it `subagent-invoked` would falsely claim a delegation the sink contract forbids. This is a distinct contract from the Finalization-phase mechanical bookkeeping, which IS delegated to the `contractor` and attested separately via `finalize_contractor_attested`.

  **Atomicity layer (issue #242 Part B Stage A, wired in Stage C; completed in #272).**
  Three aggregator scripts form the atomicity interface for the adaptive executor:
  `kaola-workflow-next-action.js` reads a frozen `workflow-plan.md` and computes the
  ready-set (nodes whose dependencies are all `complete`/`n/a` and whose own status is
  non-terminal), the `nextNode` (first ready node), and the resolved model for each
  candidate, via the validator's exported `parseNodes`/`parseLedger` (no reimplementation);
  model resolution delegates to `resolveAgentModel` (a separate module). An empty ready-set with all nodes terminal is the Finalization
  handoff signal (`allDone:true`); an empty ready-set with non-terminal nodes remaining
  is a stalled DAG, and results in a typed refusal.
  `kaola-workflow-commit-node.js` composes the plan-validator barrier subcommands into
  one auditable call by shelling the validator: at node START it runs `--record-base`
  (idempotent, capturing the full-worktree snapshot so the barrier has a clean baseline);
  at node END it runs `--barrier-check` (blocking) plus `--gate-verify` and
  `--verdict-check` (both informational only at the per-node level, because the
  downstream reviewer is still pending); at
  a whole-plan invocation (no `--node-id`) all three checks are blocking (a test-only mode — see the executor note below). The split between next-action
  and commit-node mirrors the executor's own dispatch/commit cycle: next-action resolves
  *what* to run next; commit-node proves *what was written* was in bounds.
  `kaola-workflow-adaptive-node.js` (#272) is the third aggregator and owns the complete
  per-node lifecycle for `/kaola-workflow-plan-run`: the `orient` (read-only resume scan — it
  also reconciles the durable task mirror `workflow-tasks.json` on every resume by shelling the
  task-mirror CLI, so the write stays out of `orient` itself, #282; #335: it now fails closed
  with a typed `plan_not_mirrored` / `plan_missing` refusal when the plan file is absent, instead
  of swallowing the missing path), the `mirror-project` (#335: a main-direct transaction run at
  plan-run entry that copies the frozen `kaola-workflow/<project>/` from the MAIN checkout into the
  provisioned worktree — atomic copy → `plan_hash` re-verify → rename promote, idempotent and
  never overwriting an existing worktree copy; read-only on the ledger/state),
  `open-next` (ledger `pending → in_progress` + baseline), `record-evidence` (`.cache` write),
  `close-and-open-next` (evidence-shape check → barrier → close + compliance row → selector
  routing → fused advance), `write-halt` (consent/security/test_thrash escalation), and
  `reopen-node` (#308 first-class plan-repair: reset an already-`complete` node and its
  post-dominating gate(s) → `pending` — including a gate still `in_progress` (the #343 mid-gate
  repair); any other `in_progress` row is a typed `would_orphan_in_progress` refusal — remove
  the stale `.cache/barrier-base-<id>` baselines, reopen the node to `in_progress`, and
  re-record a fresh baseline at the current merged state)
  transactions. It is a pure composition layer: it shells `next-action.js` and `commit-node.js`
  via `child_process` and read-only-imports the validator's `parseNodes` parser; the engine
  scripts never call back into it (acyclic, recursion-safe). The main session in
  `kaola-workflow-plan-run` calls `kaola-workflow-adaptive-node.js` transactions directly —
  no contractor subagent is needed for the per-node mechanical transitions. The contractor
  exception from ADR 0004 (Finalization) remains in effect.
  The aggregator's whole-plan `commit-node` mode (no `--node-id`, both checks
  blocking) is exercised by unit tests; Finalization runs its merge gate by calling the plan-validator
  directly (preserving the `--resume-check`/`plan_hash` integrity check), not via the aggregator.
  All three aggregator scripts ship in all four editions (canonical `scripts/` + Codex copy in
  `plugins/kaola-workflow/scripts/`, plus GitLab and Gitea forge-named ports); all are
  registered in `validate-script-sync.js` COMMON_SCRIPTS and the three `install.sh`
  SUPPORT_SCRIPT_NAMES blocks.

  **Parallel ready-set execution — fourth aggregator (issue #281).** The executor advances
  **one FRONTIER UNIT at a time** (a single node or a batch of eligible siblings) instead of
  strictly one node at a time. `kaola-workflow-parallel-batch.js` is the fourth aggregator and
  owns the batch lifecycle STATE; the plan-run SKILL (main session) owns concurrent DISPATCH via
  multiple `Agent()` calls in one message. Like `adaptive-node.js`, `parallel-batch.js` is
  pure composition over `next-action.js`, `commit-node.js`, and `plan-validator.js`; it never
  imports-and-mutates them and never spawns an agent.

  `next-action.js` gains two additive fields — `readyPending` (members of `readySet` whose own
  ledger status is `pending`, i.e. the openable frontier) and `active` (all currently
  `in_progress` nodes). Existing `readySet`, `nextNode`, and `allDone` are byte-unchanged. The
  distinction lets the plan-run SKILL decide: `readyPending.length >= 2` → batch path;
  `readyPending.length == 1` → legacy single-node path; `readyPending.length == 0` with active
  members → resume an in-progress batch.

  The batch manifest lives at `kaola-workflow/{project}/.cache/active-batch.json` — a
  non-hashed runtime artifact (the `plan_hash` covers only `## Meta` and `## Nodes`) that
  tracks the four lifecycle states:

  | State | Meaning |
  |-------|---------|
  | `opening` | Crash-safe transaction marker: the manifest is written with the intended member set **before** any ledger row flips. Reconcilable via the `reconcile` subcommand (roll-forward to `open`, or `--abort` roll-back) — never left an orphan |
  | `open` | N ledger rows flipped to `in_progress`; N baselines recorded; members not yet evidence-complete |
  | `sealed` | All members passed their per-node barrier; all rows `complete` or `n/a` |
  | `joined` | Transient terminal state; `join` transitions a fully-sealed manifest here (batches are read-only since #364 — nothing to merge parent-side); manifest deleted; orchestrator re-enters `next-action` |

  The executor does **rolling bounded dispatch**: it opens up to `KAOLA_FANOUT_CAP`
  members at once, queues the rest, and a `top-up` subcommand drains the queue as
  earlier members seal. A logical fan-out MAY therefore be wider than the cap — the cap
  bounds runtime concurrency, not plan validity.

  **AC#5 invariant.** Multiple `in_progress` ledger rows are **legal only** when a valid
  `active-batch.json` exists whose currently-opened members exactly match the `in_progress`
  set (under rolling dispatch the manifest's full `members` set may name queued members not
  yet opened, and the transient `opening` window is reconciled by `reconcile`). Any
  other configuration is a typed refusal (`orphan_multi_in_progress`). The `orient` subcommand
  of `adaptive-node.js` enforces this gate: it enumerates all `in_progress` rows, reads the
  manifest via `parallel-batch status`, and either confirms the batch is valid, routes to the
  legacy single-node path, or refuses. A manifest that stays whole-batch `open` but carries a
  member with `opening:true` is an **interrupted rolling top-up** (the in-flight member was
  appended before its ledger row flipped); both `crossCheckStatus` and `orient` route it to
  `reconcile` with the typed reason `batch_topup_incomplete` — consistently before and after the
  in-flight row flips — and every mutating batch command refuses `reconcile_first` while the
  marker exists, so a crash mid-top-up is never mis-classified as orphan/valid (#305).

  Crash/resume is a pure function of durable artifacts: each state has a deterministic
  reconstruction path (run `reconcile` on `opening` to repair an interrupted open or
  `top-up` — roll-forward to `open`, or `--abort` roll-back; re-dispatch on `open`; run `join`
  on `sealed`; delete manifest on `joined`). `seal-member` calls the unchanged
  `commit-node --node-id N` barrier; no new gate surface is introduced. Finalization
  `--barrier-check` sees normal `complete` rows after `join`. Full design at
  `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md`.

  **Per-node running-set scheduler — parallelism v2 (issue #377).** The batch machine above
  advances **one whole frontier at a time** (`top-up` opens only same-frontier siblings). The
  running-set scheduler is the post-#364 **per-node** successor: `adaptive-node.js` gains
  `open-ready [--max N]`, `close-node --node-id`, and `reconcile-running-set` subcommands that
  open and close **individual** nodes against a `kaola-workflow/{project}/.cache/running-set.json`
  manifest (`{state:'opening'|'open', nodes:[{id,role,kind,baseline,opening?,openedAt?}]}`), so a
  downstream node unblocks the moment ITS dependencies close — even while a disjoint sibling is
  still `in_progress`. `open-ready` flips ready nodes priority-ordered by `next-action`'s additive
  `longestPathToSink` field (critical-path list scheduling), records per-node baselines, and
  two-phase writes the manifest (`opening` → flip ledger → `open`) exactly like `open-batch`.
  `close-node` runs the same evidence-shape → `commit-node` barrier → ledger-complete → compliance
  → selector-arm contract as the serial close, removes the node, and returns the newly-ready
  frontier. The scheduler is **additive**: the single-node and batch paths are
  unchanged. Read-only nodes fan out (they share the parent tree and never write); write nodes
  the planner proves **disjoint** co-open as isolated parallel legs **by default** (D-542-01),
  while genuinely-overlapping writes open **alone** (the serial fallback). Forcing every write
  frontier serial — the byte-identical pre-parallel-write behavior — is now the explicit opt-out
  path (`KAOLA_PARALLEL_WRITES=0`), not the default.
  The **AC#5 / #293 legality re-keys to the running set**: `crossCheckStatus` and `orient` accept
  `in_progress` rows matching the running-set node set (`valid_running_set`) as well as the batch
  member set, and route a crashed `opening` running set to `reconcile-running-set`
  (`running_set_opening_incomplete`, never an orphan); `orient` reconstructs the live set from the
  manifest on every resume. Wall-clock overlap is claimed only via `node-timings.jsonl` (#373) on
  a real run — the scripts never spawn agents, so they never overclaim concurrency.

  **Coordination kernel — serial = running-set `max_concurrent = 1` (D-419-01 Part 1).**
  The serial loop and the running-set scheduler are two surfaces of ONE coordination kernel.
  Serial is not a separate code path — it is the scheduler operating with `max_concurrent = 1`.
  The two kernel entry points are:

  - **`open-next` / `close-and-open-next`** — the `max = 1` serial aliases. These are
    RETAINED as the degenerate case of the kernel; they are NOT deprecated and do NOT write
    a `running-set.json`. The absence of `running-set.json` is itself the `max = 1` witness
    for the legacy path ([INV-1]).
  - **`open-ready [--max N]`** — the `max = N` scheduler entry point. When `--max 1` is
    passed the behavior is functionally equivalent to the serial path with the exception that
    a `running-set.json` IS written (distinct on-disk footprint).

  The unification is **by SUBSUMPTION, not deletion**. The runtime code paths are preserved
  byte-for-byte; what changes is the conceptual model and documentation. The hard
  byte-identity invariant ([INV-2]) is: with `KAOLA_LANE_CONTAINMENT` off + no
  `running-set.json` + no active-batch + ≤ 1 `in_progress` row, every guard-prologue layer
  is vacuously-pass and the serial path is byte-identical to pre-#383 behavior. Any refactor
  that makes `open-next` begin writing a `running-set.json` violates [INV-2] and is rejected.

  **`max_concurrent` in `running-set.json`.** `open-ready` writes an optional `max_concurrent`
  integer into the manifest at open time:
  `{ state: 'opening'|'open', max_concurrent?: number, nodes: [...], updatedAt }`.
  Absence of the field is read as `max_concurrent = 1` — fail-closed, never "unbounded."
  The field is set at OPEN time (a runtime resource limit), NOT at freeze time, so it does
  NOT enter the frozen plan body or `plan_hash`. Its role is crash-resume continuity:
  `reconcile-running-set` re-reads `max_concurrent` to cap how many nodes it rolls forward
  (budget = `max_concurrent` − count-of-already-live nodes), so a crash during a multi-node
  open is never reconciled into a state that exceeds the original concurrency ceiling.
  The persisted value is the WITNESS, not the source of truth — the env-resolved cap
  (`min(KAOLA_FANOUT_CAP_READONLY, --max)`) is always re-derived at the next `open-ready`
  call and overwrites the manifest ([INV-3]).

  **Guard refusal taxonomy is three-armed (not collapsed).** The emit-envelope reason
  contract (#406) requires callers to classify failures structurally by stable `reason` code.
  `serial_node_live`, `scheduler_active`, and `batch_active` carry different repair pointers
  and MUST NOT be merged into fewer arms, even though the kernel model unifies serial and
  scheduler conceptually.

  **Canonical spec: `docs/decisions/D-419-01.md`** (Part 1).

  **Lane-group co-open and group-scoped close barrier — D-419 Part 2 implementation (issue #437),
  default-on since D-542-01.** Lane-attributed disjoint write co-open is now **on by default**
  (`parallelWritesDefaultOn(process.env)` true unless `KAOLA_PARALLEL_WRITES=0`); the legacy
  `KAOLA_LANE_CONTAINMENT` toggle is demoted to advanced/defense-in-depth (its `PreToolUse` hook
  is fail-open only). When co-open is active, `runOpenReady` (`adaptive-node.js` L2550) no longer
  unconditionally enforces `write_node_exclusive`; instead it calls `tryFormLaneGroup`
  (`adaptive-node.js` L2522) to attempt a co-open of the entire ≥2 disjoint write frontier as a
  **lane group**. The formation is gated on a `--parallel-safe` disjointness check
  (plan-validator.js L1627) over the frontier node ids; an overlap result degrades immediately to
  single serial write (only a genuinely-overlapping frontier stays consent-gated via
  `--write-overlap-consent` + `write_overlap_policy`). A successful group
  open records ONE shared group baseline (keyed by `group_id`, reusing the per-node
  `--record-base` machinery), writes `lane_group` into `running-set.json`, and stamps each
  member's node entry with `group_id`. The running-set schema is additive: `lane_group` is an
  optional top-level key; absent ⟹ flag-OFF serial behavior (byte-identical, INV-6).

  The close side (`runCloseNode` L2838 → `closeGroupMember` L2996) detects group membership from
  `running-set.json` at close time. A non-last member runs evidence-shape and per-member in-lane
  vacuity (`memberInLaneChanges`, ~L2826) only — the diff barrier is DEFERRED; the compliance
  row carries the literal `deferred_to_group` marker. The LAST member (every other member in
  `closed_members`) shells `--group-barrier --group-id <id>` (plan-validator.js L1914), which
  diffs the group baseline → now against the UNION of all members' declared write sets via
  `barrierCheck` with `opts.groupMembers`. Out-of-union paths land in the EXISTING rank-4
  `unattributed_write` / `write_set_overflow` arm — no new reason code. A barrier pass clears
  `lane_group` and drops the group baseline; a refuse is a typed refusal with no ledger advance.

  **Cross-lane runtime protection** is advisory: while co-open writers share the parent worktree,
  nothing prevents A writing into B's declared lane at runtime. Enforcement is retrospective:
  (a) the group barrier at the last close, and (b) the `--finalize-check` attribution sweep
  (#424). The `KAOLA_LANE_CONTAINMENT` `PreToolUse` hook (#376) emits warnings but is fail-open.

  **Serial opt-out invariant (INV-6, re-anchored by D-542-01).** The co-open gate is now keyed on
  `legCoupled = parallelWritesDefaultOn(process.env)` (true by default; `false` only under
  `KAOLA_PARALLEL_WRITES=0`). The flag-OFF (serial) configuration is now the **opt-out** path, not
  the default: under `KAOLA_PARALLEL_WRITES=0`, `legCoupled` is `false`, the
  `if (legCoupled && writeNodes.length >= 2)` co-open guard in `runOpenReady` and the close-side
  group-member guard in `runCloseNode` are both dead, the existing
  `else { toOpen=[writeNodes[0]]; openKind='write'; }` serial path and the existing
  `commit-node --node-id` per-node barrier run verbatim, and the result is byte-identical to
  pre-parallel-write behavior. (`KAOLA_LANE_CONTAINMENT` is no longer the gating predicate — it
  survives only as the advanced/defense-in-depth `PreToolUse` hook, fail-open.) The #498 invariant
  is preserved: co-open ALWAYS provisions legs (`groupForm ⟺ legCoupled ⟺ legs provisioned`) —
  never the legless attribution-blind union barrier. Canonical specs:
  `docs/decisions/D-437-01.md` and `docs/decisions/D-542-01.md`.

  **Parallelism v3 design (issue #419).** Two decision records define the v3 design built
  on the v2 running-set foundation: `docs/decisions/D-419-01.md` (Part 1: one coordination
  kernel — serial = running-set `max_concurrent=1` by subsumption, not deletion; Part 3:
  scheduler-default posture — reads fan out by default, and since D-542-01 **disjoint writes
  also co-open by default** [`KAOLA_PARALLEL_WRITES=0` is the serial opt-out], while overlapping
  writes stay serial/consent-gated) and `docs/decisions/D-419-02.md` (Part 2: lane-attributed
  disjoint write parallelism — the validator stamps `parallel_safe` on disjoint write-node
  antichains and `open-ready` lifts `write_node_exclusive` for stamped pairs by default [serial
  opt-out via `KAOLA_PARALLEL_WRITES=0`]; Part 4: consent-gated speculative gate overlap — a `speculative_open_policy:
  consent` plan field allows a descendant to open `in_progress` speculatively while its
  gate runs, with baseline roll-back discard if the gate fails and post-dominance preserved
  by a `gate_not_complete` close-refusal). All 25 invariants [INV-1]..[INV-25] that bind
  downstream implementation are enumerated in those records. See also
  `docs/investigations/2026-06-12-parallelism-v3-design.md` for the runtime-grounded analysis.

  **Enforcement boundary (script-enforced, #231).** The validator enforces gate
  *presence* statically at freeze: post-dominance proves a `code-reviewer` sits on
  every path from each code-producing node to the unique sink, and a `security-reviewer`
  on every path from each sensitive node. Gate *execution* at runtime is now
  **script-enforced** too. `--gate-verify` proves a *completed* reviewer post-dominates
  every completed code/sensitive node in the `## Node Ledger` — closing the leak where a
  required reviewer is marked `n/a` at runtime (audit G1/H5) — wired into `routeAdaptive`
  (surfaced as `pendingGates`, non-blocking on resume so a mid-run pending gate never
  bricks an in-flight plan) and enforced as a hard merge gate in Finalization. `--verdict-check`
  (#251) goes one step further than `--gate-verify`: where gate-verify proves the reviewer
  *executed*, verdict-check proves it *approved* — it reads each completed gate node's
  `.cache/{node-id}.md` evidence and requires a parseable `verdict: pass` with
  `findings_blocking: 0` (an `adversarial-verifier` fan-out applies **majority-refute** over the
  sibling per-instance evidence files; missing/unparseable counts as a refute), fail-closed on a
  fail/missing/unparseable verdict — informational per-node in `kaola-workflow-commit-node.js`
  and a hard blocking merge gate in Finalization. `--barrier-check`
  re-scans the files actually written and refuses a sensitive write with no `security-reviewer`
  node (audit H1), an out-of-allowlist production write (audit H3), or a foreign-project `kaola-workflow/archive/<X>/` write whose `<X>` is not the finalized project (#261 — scoping the blanket `kaola-workflow/` artifact exemption so a stray cross-issue archive folder cannot reach a protected branch undetected; companion defense-in-depth: `cmdFinalize` stages only the finalized project's own archive/rename/roadmap paths, and the Finalization Staging Guard typed-blocks a staged foreign `archive/<other>/`). It runs in two modes: the
  **whole-plan** Finalization merge gate diffs vs the merge-base of HEAD and `origin/main` (so a
  committed sensitive write is not invisible) against the **union** of declared write sets; the
  **per-node** barrier (#239) tree-diffs the current full-worktree snapshot against the node's
  recorded node-start snapshot (`--record-base`, idempotent for resume-safety) against the node's
  **own** declared set — attributing exactly that node's writes (new/modified/deleted, tracked or
  untracked) without over-attributing prior nodes' still-uncommitted source or pre-existing strays,
  and needing no committed baseline. Both checks are PURE + toggle-agnostic (they never read the install switch). Only the
  quorum tally and the `validateNodeOutput` schema checkpoints remain agent-discipline
  prose. The 2026-06-03 audit (`docs/investigations/adaptive-path-audit-2026-06-03.md`)
  hardened the *static* floor — write-set extraction (root-level + dot-leading paths),
  `finalize`-sink writes, `## Meta`-scoped label reading, and fence-aware hashing — so the
  `auto-run` verdict is no longer computed over a write set that under-counts sensitive files.
  Freeze (#274) now also cross-checks the repo's byte-identity/sync-group obligations
  (COMMON_SCRIPTS + BYTE_IDENTICAL_GROUPS from `validate-script-sync.js`), catching a synced
  file edited without its mirror lane at freeze instead of post-merge at `npm test`. Freeze (#340)
  adds two further write-set completeness cross-checks: an **agent-registration gap** check (an
  agent-set delta must carry its full 22-path exact-match registration surface — invisible to #306
  symbol-grep, anchor-gated to the Kaola-Workflow repo, union-across-nodes, additions only) and a
  **forge-port ordering gap** check (a gitlab/gitea edition-named port must be a transitive
  descendant of every node editing its root source, so the mirror's canonical spec — the full
  accumulated root diff — exists before the port is written). Both refuse at freeze, never on
  `--resume-check` (in-flight frozen plans are never bricked).

  **No mid-run kill-switch once a plan is frozen (accepted, #236).** There is no
  per-session toggle that halts an already-frozen, in-flight plan: both resume surfaces —
  `routeAdaptive` and `resumeFallbackCommand` — and the resume re-validation
  (`revalidateForResume`, library + structure + `plan_hash` only) are deliberately
  **toggle-agnostic** (a frozen plan finishes regardless of any config change). This is
  correct-by-design: a mid-run path-yank would brick an in-flight plan and break the
  `plan_hash` author-immutability contract. An explicit opt-in operator halt
  (`KAOLA_ADAPTIVE_HALT`) was considered and **deferred** — the principled containment for
  a bad frozen plan is the per-tier runtime `--barrier-check` (#231), not a binary
  kill-switch.

  **`.md` allowband — narrow, not blanket (#424).** `.md` files are no longer blanket-exempt from the `--barrier-check`. The declared allowband is: `docs/**`, `CHANGELOG.md`, `README.md`, `kaola-workflow/{project}/**`. `.md` files outside this band — including `agents/*.md`, `commands/*.md`, `plugins/*/agents/*.toml` — are treated as production surfaces and must appear in a node's `declared_write_set`. Plans frozen before #424 that relied on the blanket exemption will classify non-allowband `.md` writes as `write_set_overflow` at barrier time.

  **Barrier attribution sweep and new finalize-check refusals (#424).** At Finalization `--finalize-check`, an attribution sweep verifies that every file in the diff vs `origin/main` is attributed to a `complete` node's write set. Files declared only by a non-complete (`n/a` or `pending`) node yield the typed refusal `unattributed_change`. Two further finalize-check refusals: `drop_base_window_open` (`--drop-base` is forbidden while any node is `in_progress`) and `root_mismatch` (the plan-path root does not match the expected project root).

  **Evidence seeding lifecycle (#433).** When a node is opened (`open-next` / `open-ready` / fused advance), `kaola-workflow-adaptive-node.js` seeds `.cache/<node-id>.md` with a binding header (`evidence-binding: <node-id> <nonce>`) and role-specific token stubs drawn from `ROLE_TOKEN_REGISTRY` (the single vocabulary source, exported from `kaola-workflow-plan-validator.js`). The `opened` payload carries `evidence_file` and `required_tokens` so the dispatched role agent knows exactly what to fill. The close gate verifies the binding header against the per-open nonce. On `reopen-node`, the evidence file is re-seeded entirely with fresh stubs and the prior body is discarded — preventing stale evidence from a prior open being replayed as current evidence.

  **Dispatch descriptor single builder (#444 / D-444-01).** All three openers (`open-next`, `open-ready`, fused advance) assemble their `opened.dispatch` sub-object through one shared `buildDispatch(nodeInfo, context)` function, eliminating the #411-class drift where adding a field to one opener could silently miss the others. The `dispatch` sub-object carries all per-node dispatch metadata (`node_id`, `role`, `model`, `declared_write_set`, `evidence_file`, `nonce`, `required_tokens`, `forge_rider`, `guards`, optional `goal_line`). Guard derivation (`deriveGuards`) is a pure function computed once here rather than at each call site. The `record-evidence --verify` READ-ONLY subcommand added in the same issue enables proactive pre-close evidence validation without side effects, using the same `checkEvidenceShape` checker the close gate uses. See `docs/api.md` § `opened` payload — `dispatch` sub-object.

  **Provenance log (`.cache/provenance-log.jsonl`).** Each `open-next` / `open-ready` append a provenance entry (node-id, opened-at, nonce, evidence-file path) to `.cache/provenance-log.jsonl` — an append-only audit artifact that survives plan-repair and reopen cycles. Not hashed by `plan_hash`; barrier-exempt.

  **Chain receipt (`.cache/chain-receipt.json`, #432) — self-host (npm) only.** `kaola-workflow-run-chains.js` runs all four edition test chains via `spawnSync` (real exit codes) and writes `.cache/chain-receipt.json` (`{headSha, workTreeHash, startedAt, chains:[{name, exit}]}`). In a **self-host** repo (its `package.json` declares the `test:kaola-workflow:*` scripts) the Finalization `--finalize-check` gate reads this artifact and refuses with `chains_unverified` (no receipt), `chains_stale` (headSha mismatch), or `chains_red` (any chain exited non-zero). The contractor runs this script at Step 8c and cites the receipt path as evidence, replacing prose attestation. A `--accept-known-red name:issue` waiver acknowledges a known-red chain with an issue reference. **Consumer (non-npm) repos (#475)** do NOT run this producer — `--finalize-check` auto-detects them (no npm scripts) and gates instead on the agent-recorded `.cache/final-validation.md` (presence + a column-0 `verdict: pass`; `final_validation_unverified` / `final_validation_failed`), because the agent owns verification (#44). The v6.2.0 `kaola-workflow/chains.json` opt-in is retired; the attribution sweep runs for both modes.

  **Run-gap sweep gate (`.cache/run-gaps.json`, #435).** `kaola-workflow-gap-sweep.js` is a self-contained SUPPORT-script CLI run by the contractor at Step 8c.2 (after the chain-receipt step). The scanner reads only the project's `.cache/` (scope guard) for three machine-reliable defect signals: provenance reopens (`nodeId` with more than one `open` event = `in_run_repair`), chain-receipt `accepted_red:true` entries (`deferred_red_chain`), and operator-seeded `.cache/run-gaps-manual.md` lines (`manual:<slug>`). It deduplicates items by `(reasonClass, sample)` and writes `.cache/run-gaps.json` (result is always `swept`; exit 0). The `--check` gate then reads the artifact and the `## Run gaps` section of `finalization-summary.md`; each swept tuple must be mapped as `filed: #N` or `noise: <reason>`. An unmapped tuple causes a typed `gaps_unswept` refusal (exit 1), blocking finalization. There is NO coupling to `cmdFinalize` (`kaola-workflow-claim.js`); the gate is purely contractor-owned, mirroring the chain-receipt pattern from D-432-01. Cross-edition: canonical + Codex byte-twin + two forge-named ports, registered in `COMMON_SCRIPTS` and all three `install.sh` `SUPPORT_SCRIPT_NAMES` blocks. See `docs/conventions.md` § Run-gap capture is gated at finalize (#435) and `docs/decisions/D-435-01.md`.

## Finalization and Sink Flow

Finalization delivers completed work through one of two sink paths:

### Merge Sink (Default)

```
Final commit on feature branch
    ↓
Fetch and rebase onto origin/main
    ↓
Fast-forward merge with retry loop (3 attempts)
    ↓
Push to origin/main
    ↓
GitHub issue closure
    ↓
Branch cleanup
    ↓
Archive active folder to kaola-workflow/archive/{project}/
    ↓
Clean up .roadmap/issue-N.md and regenerate ROADMAP.md
```

**Success condition**: Branch merges without conflicts, push succeeds.

**Failure handling**: On merge-impossible error (branch protected, non-fast-forward, permission denied), sink-merge exits code 3 and Finalization automatically pivots to PR sink.

### PR Sink (Intent-Based or Fallback)

```
Final commit on feature branch
    ↓
Push branch to origin
    ↓
Create PR via gh pr create / glab mr create / tea pr create
    ↓
Record PR metadata (URL, number) in workflow-state.md
    ↓
Create metadata follow-up commit (chore: record PR metadata for {project})
    ↓
Worktree is clean, folder remains active
    ↓
Next /workflow-next startup: watch-pr detects MERGED/CLOSED
    ↓
Archive folder to kaola-workflow/archive/{project}/
    ↓
Clean up .roadmap/issue-N.md and regenerate ROADMAP.md (MERGED only)
```

**Success condition**: Branch pushed, PR created, metadata recorded, follow-up commit written.

**Worktree state**: Clean after PR sink completes. The metadata follow-up commit is intentional and necessary — it captures the `pr_url` and `pr_number` that downstream workflows need.

**Folder lifecycle**: Active folder remains open until `watch-pr` (on next `/workflow-next` startup) detects the PR state. MERGED and CLOSED results both archive the folder.

### Sink Selection

1. **Intent detection** (recommended): If user prompt contains PR keywords ("open a PR", "create a PR", "pull request", "sink=pr"), agent sets `KAOLA_SINK=pr` before startup, and sink-pr is used.
2. **Default merge**: `sink: merge` is the fallback when no PR intent is detected.
3. **Auto-fallback**: When merge is configured but fails with exit 3, Finalization automatically pivots to PR sink.

### Gitea Sink Layer (Complete — GitHub/GitLab Parity)

Gitea edition (`plugins/kaola-workflow-gitea/`) now includes a complete Finalization sink implementation:

- **`kaola-gitea-workflow-sink-merge.js`**: Fetch, rebase, fast-forward merge with retry, push, close issue, worktree cleanup. Same exit codes and error classification as GitHub/GitLab editions.
- **`kaola-gitea-workflow-sink-pr.js`**: Create or reuse PR, record metadata in workflow-state.md, automatic metadata commit.
- **Squash-merge gating**: `checkRepoSquashEnabled(project, opts)` validates repository configuration before attempting squash merge via `mergePullRequest(project, prNumber, {squash: true})`.
- **Test coverage**: 18 offline integration tests in `test-gitea-sinks.js` covering PR reuse, creation, state updates, and edge cases.

## Multi-Issue Bundle Execution Shape (issue #328)

The bundle lane is an additive capability on the adaptive path. The overall execution shape is:

```
issue-set selection (explicit --target-issues A,B,C  OR  issue-scout recommendation)
    ↓
all-or-nothing multi-claim (claimExplicitBundle validates every target before any mutation)
    ↓
one worktree at .kw/worktrees/bundle-A-B-C/
one branch  workflow/bundle-A-B-C  (forge editions prefix the edition, e.g. workflow/gitlab-bundle-A-B-C)
one active folder  kaola-workflow/bundle-A-B-C/
    ↓
one adaptive workflow-plan.md  (authored by workflow-planner; covers all N issues as a unit)
    ↓
one plan-run  (the existing adaptive executor; no separate bundle scheduler)
    ↓
one finalization  →  close N issues  →  remove N .roadmap/issue-N.md files
                  →  regenerate ROADMAP.md once
                  →  archive single bundle folder
```

**Single-issue path unchanged.** Passing `--target-issue N` alone produces byte-identical behavior to prior releases; no bundle fields are written to `workflow-state.md`.

**No separate scheduler.** The bundle shares the existing `kaola-workflow-plan-run` executor and `kaola-workflow-adaptive-node.js` per-node lifecycle. The plan itself covers the combined scope of all N issues as a single adaptive DAG.

**`issue-scout` role — read-only only.** The `issue-scout` agent reads forge issues, the local roadmap, and active folders to recommend a same-scope issue set for bundling. It returns a structured recommendation to the orchestrator. Hard constraints:

- MUST NOT claim issues.
- MUST NOT write files, author plans, or modify durable state.
- MUST NOT close issues or dispatch other agents.
- The orchestrator decides whether to accept the recommendation and proceed as a bundle.

`issue-scout` is not a write role, not an implement role, and not a gate node. It is advisory input only.

## Autopilot Driver (`kaola-workflow-autopilot.js`, issue #443 — D-420 P1)

`kaola-workflow-autopilot.js` is a **forge-neutral stage state-machine aggregator** that automates
the multi-bundle loop (scout → claim → plan → run → finalize) by reading merged receipt contracts.
It is exposed as the `/kaola-workflow-auto` command (×6 surfaces: 3 Claude commands + 3 Codex
SKILLs; ×4 script editions: canonical + byte-identical Codex twin + two edition-named forge ports).

**Lean-orchestrator boundary (#44).** The driver sequences stages and records receipts; it never
dispatches agents, invokes forge CLIs, or mutates the plan. The agent owns issue selection,
consent decisions, and dispatch; the script owns stage atomicity and the digest receipt.

**Subcommands.**

- `next --goal <text> [--project <name>] [--scout-result <path>] [--json]` — stateless function
  of goal, project, on-disk receipts, and optional scout JSON. Reads the last digest line + the
  relevant stage receipt and emits either a stage descriptor
  (`{stage, action, project, goal, inputs:{…}, receipt_path, repair?:{kind,node,paths}}`) or a
  typed stop payload (`{stop, stage, project, details:{…}, receipt_path}`). Exit 0 on a clean
  descriptor or stop; exit 1 on an internal or argument error.
- `digest --project <name> --stage <s> --result <r> [--receipt-path <path>] [--repair <json>] [--json]`
  — appends one JSONL transition line to
  `kaola-workflow/<project>/.cache/autopilot-digest.jsonl`.

**Digest crash-resume.** The digest is append-only (never rewritten). On a restart, `next` reads
the last non-empty JSON line to determine the current stage position and re-emits the next
descriptor without re-executing already-completed stages.

**Receipt seams.** The driver gates on four merged contracts:

| Receipt | Field / check | Meaning |
|---------|---------------|---------|
| `kaola-workflow/<project>/.cache/sink-receipt.json` (#429) | `steps.push_main === 'done'` | Finalize-complete witness (terminal sink step) |
| `.cache/chain-receipt.json` (#432) | every chain `exitCode === 0 \|\| accepted_red === true` | Tests-green witness |
| cmdFinalize stdout `closure_receipt` (#441) | `goal_check === 'satisfied'` | Goal-satisfied terminal condition |
| `.cache/barrier-failed.json` (#440) | `triage.class` + `proposed_repair` | Barrier-failure triage for repair routing |

**Six typed stop reasons** (all driven by ground-truth fields, never prose):

| Stop | Ground-truth binding |
|------|----------------------|
| `goal_satisfied` | `closure_receipt.goal_check === 'satisfied'` (cmdFinalize stdout, #441) |
| `backlog_empty` | scout JSON `backlog_empty === true && recommended_bundle === null` |
| `consent_halt` | `escalated_to_full: consent` in state, OR `consent_halt: pending` in ledger (#440) |
| `security_halt` | `escalated_to_full: security` in state WITHOUT concurrent consent marker (#440) |
| `typed_refusal` | `barrier_failed` envelope carrying #440 triage; OR claim/handoff/validator `{result:'refuse',reason}` |
| `repair_limit` | two same-node `barrier_failed` events after a `repair_applied` digest entry under `auto` mode |

**Repair consent (`KAOLA_AUTOPILOT_REPAIR ∈ {ask(default), auto}`).**
Mechanical-class = exactly `{add_to_write_set, write_set_swap}` — these two `proposed_repair.kind`
values are auto-applicable under `auto` mode, bounded to 1 repair per node (2nd same-node
failure → `repair_limit`). `revert_overflow` and `unclassified` always halt even under `auto`.
The driver surfaces a `repair` descriptor in the next descriptor for the orchestrator to apply; it
never edits the plan itself. `ask` mode (the default) stops on ANY `barrier_failed` envelope with
a `typed_refusal` stop.

**`backlog_empty` output shape.** `agents/issue-scout.md` + 3 TOML twins accept an alternative
top-level envelope `{backlog_empty: true, recommended_bundle: null}` in addition to the standard
`{recommended_bundle: {…}}` shape. The driver gates on this field; any `backlog_empty === true`
at the scout stage emits a `stop:'backlog_empty'` payload (exit 0).

**`readPlanAllDone` ledger-last fix.** The section-boundary regex uses `$(?![\s\S])` (not `\Z`)
to correctly capture the last `## Node Ledger` section in the JS engine. All ledger rows
`status === 'done'` with at least one data row → `allDone: true` → advances to `finalize` stage.

**One-bundle-per-invocation.** A successful finalize with `goal_check !== 'satisfied'` emits
`result:'goal_progress'` (plus the scout's next recommendation) and exits; the operator re-invokes
for the next bundle. No in-process chaining between bundles.

**Edition strategy.** Forge-neutral (zero forge-CLI tokens). Byte-identical claude↔codex
(`scripts/` === `plugins/kaola-workflow/scripts/`); body-identical prefix-rename gitlab/gitea
ports. Registered in `COMMON_SCRIPTS`, `RENAME_NORMALIZED_FAMILIES`, and the install-manifest
`SUPPORT_SCRIPTS`. Route-reachability enforced via `test-route-reachability.js` + 4
`validate-*-contracts.js` pin ×6 (#400). `kaola-workflow-adaptive-schema.js` (×4) exports
`AUTO_COMMAND='/kaola-workflow-auto'` and `AUTO_SKILL='kaola-workflow-auto'`. Decision record:
`docs/decisions/D-443-01.md`.

## Agent Profile Structure and Edition Sync

**Profile layout.** Each role has a canonical `agents/<name>.md` (installed by `install.sh`
for the Claude edition) and a `.toml` triple across the three plugin editions:
`plugins/kaola-workflow/agents/<name>.toml` (codex),
`plugins/kaola-workflow-gitlab/agents/<name>.toml`, and
`plugins/kaola-workflow-gitea/agents/<name>.toml`. The current roster is 14 base-role
profiles (14 files, 14 triples); the 6 `-max` xhigh effort-variant profiles were retired
in #451 (effort is now session-inherited, not a per-role pin — see
`docs/decisions/D-451-01.md`). All three `.toml` twins for a given profile are
byte-identical (forge-neutral by the §341 contract — no CLI binaries, no forge brands).

**md↔toml token-pin parity contract (#422).** Adding a feature paragraph to an
`agents/<name>.md` requires mirroring the feature token into all three `.toml` twins before
the token can be pinned in `scripts/test-agent-profile-parity.js` `FEATURE_TOKENS`. The
regression guard (`test-agent-profile-parity.js`) checks every pinned token against every
`.md`+triple pair and reds the claude chain on any drift. `validate-script-sync.js`
`BYTE_IDENTICAL_GROUPS` programmatically enforces byte identity across each triple (auto-
expands when a new `.toml` is added to the codex tree). See
`docs/decisions/D-422-01.md` for the full contract and consequences.

## Model Resolution (Install-Time, Profile-Aware)

**Model resolution for adaptive subagent nodes** is install-time and profile-aware. `install.sh` writes a manifest `~/.claude/agents/.kaola-agent-models.json` (path honoring `KAOLA_AGENT_DIR`) that maps each agent name to its install-selected model string (e.g. `{ "planner": "claude-opus-4-5", "code-writer": "claude-sonnet-4-5" }`). `uninstall.sh` removes the manifest.

The resolver (`resolve-agent-model`) uses this precedence chain:

1. **Manifest** — value from `~/.claude/agents/.kaola-agent-models.json` for the agent name (if present and non-empty).
2. **Frontmatter** — agent frontmatter `model:` field, when it is not `inherit` or empty.
3. **`DEFAULT_AGENT_MODELS`** — the hardcoded per-role defaults in `kaola-workflow-adaptive-schema.js`.
4. **`''`** — empty string, letting the orchestrator's model inherit (last resort).

**Effect on adaptive nodes:** Dynamically dispatched nodes now resolve to their correct profile-aware model and render the model badge in the dispatch call. Previously, agents with `model: inherit` frontmatter resolved to `''` and silently inherited Opus regardless of the installed profile. Frontmatter remains `inherit` (the install-emitted manifest is the authoritative source); the dispatch carries an explicit `model=` so the badge is always visible.

**Runtime per-node override:** At RUNTIME, the per-node `model` column in `workflow-plan.md` beats install-time profile selection — see the #382 per-node model tier. A node's `model` cell (`opus` or `sonnet`) is sealed at freeze and surfaced by `next-action.js` in every ready-set item; `open-next`/`open-ready` thread it into the running-set manifest for crash/reconcile re-dispatch.
