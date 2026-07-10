# Architecture

Document system boundaries, major components, data flow, and deployment shape.
Read it as the anatomy of an engineered agent loop: the harness frame, the
verification loops, the exit conditions, and the durable state that make a run
safe to leave running.

## Workflow Paths (fast / full / adaptive)

Kaola-Workflow runs an issue through one of three macro-shapes, selected by agent
judgment in `workflow-next.md` Step 0a-1 (scripts validate, never auto-pick — #44):

- **fast** — single-pass Plan+Execute+Review (`fast-summary.md`); one fixed shape.
- **full** — the fixed 6-phase ladder (P1→P6); an install-time opt-in (`--with-full`), not the default.
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

  **A new shape of work composes with the existing library, rather than adding a new lane
  (issue #634).** Not every deliverable is task-shaped (a known acceptance criterion, one
  attempt). *Direction-not-destination* work — "make it faster / smaller / less flaky," with no
  destination knowable at freeze — is served by `metric-optimizer`: an ordinary `sequence`-shaped
  `IMPLEMENT_ROLES` member (G1/G3 post-dominance inherited automatically, no new node shape, no
  scheduler change), whose bounded budget-capped ratchet loop (propose → apply → regression-gate →
  measure → accept-or-revert) runs inside a single dispatch and whose contract lives in a `## Meta`
  `optimize(<node-id>)` block rather than new node columns. A change-gate `adversarial-verifier`
  always reproduces the final metric before finalize. It is the write-side sibling of the
  still-unshipped question-shaped design (#486). See `docs/api.md` § "`## Meta` field
  `optimize(<node-id>)`" and `docs/decisions/D-634-01.md`.

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

  - **M1 — SubagentStart dispatch-log hook.** A `SubagentStart` hook (`hooks/kaola-workflow-subagent-dispatch-log.sh`, id `kaola-workflow:subagent-dispatch-log`) records each subagent spawn — `ts`, `agent_type`, `agent_id`, `cwd`, plus `model_planned` (always resolved for a known role via `kaola-workflow-resolve-agent-model.js`, located fail-open across the plugin **and** opencode install layouts — #567) and `model` (the runtime-supplied tier when available — codex CLI only; empty for Claude Code `SubagentStart` and opencode) — as one JSON line to `kaola-workflow/{project}/.cache/dispatch-log.jsonl` for every active project. **Dual-root capture (#338):** the hook resolves BOTH its own cwd toplevel (the main session's repo) AND the dispatched agent's `cwd` (`AGENT_CWD`) toplevel, appending under each distinct active root — so a subagent dispatched into a linked **worktree** is logged where the worktree's `cmdFinalize` reads its `.cache/`. **Worktree enumeration (#568):** the hook ALSO scans the resolved repo's linked worktrees (`git worktree list --porcelain`) and appends under each worktree's active project — covering the inverse opencode worktree posture where the role agent runs in the MAIN repo while the active `workflow-state.md` is worktree-resident (both roots resolve to main, where no active project exists, so the #338 dual-root scan alone logged nothing). All appends are deduped by root path. In-place runs (the two roots coincide, no extra worktree) append exactly once. The hook is fail-open (exit 0 always) and active on all four editions (claude/codex/gitlab/gitea). On Codex it is wired from the global `~/.codex/hooks.json` installed by `install-codex-agent-profiles.js`, with hook scripts copied into `~/.codex/kaola-workflow/{hooks,scripts}`; it requires Codex `multi_agent` enabled — with it off the hook never fires and attestation reads `missing` (non-fatal, WARN-first).

  - **M2 — WARN-FIRST closure attestation.** `checkDispatchAttestations` (wired into the closure path at finalize time) reads the dispatch log and records `claim_planner_attested` / `finalize_contractor_attested` (enum: `attested|missing|failed`) in the closure receipt. It pushes warnings but never modifies `closure_invariants.violations` — missing attestation is advisory, never blocking. If the dispatch log is absent, both fields are set to `missing` and the detector is noted inactive. **Contractor self-attest back-fill (#338):** `cmdFinalize --attest-contractor-spawn` writes a `contractor`/`finalize-backfill` entry into the archived `.cache/dispatch-log.jsonl` (mirror of the claim-seam `--attest-planner-spawn`), so a genuinely delegated finalize reads `attested` even where the hook cannot fire (worktree dispatch, hookless harness). The contractor profile's Step 8b passes the flag; an inline main-session finalize that omits it still reads `missing`. The honest limit: this catches casual zero-spawn bypasses; the log itself is in the project-controlled `.cache/` directory.

  **Codex harness hardening (issue #266).** Three additions harden the Codex edition of the adaptive path against config drift, silent inline execution, and state loss after compaction:

  - **Preflight gate (`kaola-workflow-codex-preflight.js`).** A hard gate that MUST pass before any `subagent-invoked` compliance row is written. Since #332 it is a SCHEMA-VALID (not existence-only) gate: it verifies that `.codex/agents/kaola-workflow/*.toml` role-profile files are present AND schema-valid (a non-empty top-level `name` matching the role — codex ≥0.138 silently ignores a profile without one — the role-governed `model = "gpt-5.6-sol"` plus `model_reasoning_effort = "medium"|"xhigh"` standalone pin, and a non-blank durable-result `developer_instructions` contract), that the managed `.codex/config.toml` block (delimited by `# BEGIN/END kaola-workflow agents`) includes every current-template role and no retired/foreign role, and that no stale/retired Kaola `.toml` files survive (detected via the per-install `.kaola-managed-profiles.json` ownership manifest plus a known-retired list, e.g. the `docs-lookup.toml` removed in #249). The companion installer (`install-codex-agent-profiles.js`) writes that manifest and, default-on, validates the source tree → installs → prunes stale/retired files → post-verifies before printing its `status: ok` sentinel. When the only problem is autofixable (stale/missing/malformed block or profile, stale Kaola file) the preflight auto-reinstalls then re-verifies ALL checks; when unsafe (hand-authored `[agents.*]` outside the markers, an unsupported future manifest schema, missing template role, installer failure) it emits a typed refusal and exits non-zero. Unknown user-owned TOMLs are reported, never deleted. Since #571 the gate accepts a valid global `~/.codex` scope OR a valid project scope and **fails closed when neither is valid**: a fresh global scope (installed once via `--global`) satisfies the gate without any project-local copy; a non-fresh global falls through to the existing project-scope inspection + autofix path unchanged. Autofix continues to target project-local only — the gate never silently writes the user's machine-wide `~/.codex`. A READ-ONLY `--doctor` mode reports user/project/plugin-cache scope freshness with concrete per-scope repair commands (plugin-cache findings are evidence-only). Never a silent `subagent-invoked`. **Codex 0.144.1 V2 role-transport boundary.** MultiAgentV2 task prompts are Responses-encrypted only on the direct surface; nested `functions.exec`/Code Mode refuses as `codex_v2_encrypted_transport_unsafe`. Direct role dispatch has a second boundary: the server reserves `collaboration.spawn_agent` for hidden metadata, so visible `agent_type` fields there fail HTTP 400 and hidden fields remove Kaola role selection. The proven posture (`tool_namespace = "agents"`, `hide_spawn_agent_metadata = false`, `non_code_mode_only = true`) refuses any drift as `codex_v2_role_transport_unsafe`, and routing uses the direct `agents` namespace. **Dispatch-posture report (#598).** Tool exposure alone is not proof the runtime will accept a spawn: the Codex CLI injects a developer message that model-refuses sub-agent spawns unless the effective MultiAgentMode is `proactive`, which is effort-gated (a root-level `model_reasoning_effort = "ultra"` → `proactive`; any other value or absent → `explicitRequestOnly`; features off → `none` — version-guarded, verified on codex-tui 0.142.5 and may change). The installer (after a successful install) and the preflight/doctor gate (on every scope) additionally REPORT this posture and, when it is not `proactive`, the exact remediation — attestation-style and NON-FATAL by construction: it is a `warn:`/`dispatch_posture_warning` line, never a red install or preflight, since the installer never silently writes the user-owned `model_reasoning_effort` cost/latency setting. See `docs/api.md` § Codex Harness Scripts for CLI and exit codes.
  - **Durable task mirror (`kaola-workflow-task-mirror.js`).** Generates `kaola-workflow/{project}/workflow-tasks.json` from the frozen `## Nodes` + `## Node Ledger`. The Codex UI task list mirrors this file; `workflow-tasks.json` is NOT the source of truth — the `## Node Ledger` is. Regenerated when missing, unparseable, or stale (hash mismatch). See `docs/workflow-state-contract.md` § Codex Task Mirror for the source-of-truth chain and schema.
  - **Compact/resume hook (`kaola-workflow-codex-compact-resume.js`).** A self-contained stdin/stdout filter that reads the four durable artifacts (`workflow-state.md`, `workflow-plan.md` `## Node Ledger`, `workflow-tasks.json`) and emits a deterministic 6-section resume packet: active project, next skill/command, in-progress node, pending gates, consent-halt markers, task-mirror summary. Does not mutate state. No `CLAUDE_PLUGIN_ROOT` dependency; edition-named ×3 (codex/gitlab/gitea). On Codex this script is wired as a `SessionStart` (`compact`) hook (id `kaola-workflow:compact-context`) in the global `~/.codex/hooks.json` installed by `install-codex-agent-profiles.js`; it is also still invokable on demand via stdin (`node <path> < session.json`). Note: the Codex plugin manifest (`plugin.json`) has no `hooks` key — the wiring lives entirely in `~/.codex/hooks.json`, while agent profiles and the managed config block install **globally** into `~/.codex` by default (#571); project-local is a supported override (pass the repo path positionally to the installer). See `docs/api.md` § Codex Harness Scripts for the packet format.

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

  **Parallel ready-set execution (issue #281) — retired, superseded by the running-set
  scheduler.** The executor advances **one FRONTIER UNIT at a time** (a single node or a fan-out
  of eligible siblings) instead of strictly one node at a time — that frontier-unit model is
  still current; see the running-set scheduler below. The original #281 design added a fourth
  aggregator, `kaola-workflow-parallel-batch.js`, that owned a whole-frontier
  `active-batch.json` manifest (`opening → open → sealed → joined`) via `open-batch` / `top-up` /
  `seal-member` / `seal` / `join` / `reconcile` subcommands, gated on `next-action.js`'s additive
  `readyPending` (members of `readySet` whose own ledger status is `pending`, i.e. the openable
  frontier) and `active` (all currently `in_progress` nodes) fields.

  The aggregator was retired (D-586-01): nothing on the live executor path ever shelled it — the
  plan-run skeleton's own dispatch instructions already routed `enterBatch: true` to the per-node
  running-set scheduler's `open-ready` (documented next), which had fully absorbed the
  whole-frontier batch's responsibilities, including default-on disjoint write co-open
  (D-542-01), well before the retirement. `next-action.js` still carries `readyPending`/`active`;
  `readyPending.length >= 2` is the signal the plan-run skeleton uses to route to `open-ready`
  instead of the single-node `open-next` path. D-586-01 deliberately kept a `batch_active`
  backward-compat crash detection over a residual `active-batch.json` on disk (a leftover from a
  pre-retirement checkout), flagging its removal as a future call once the diagnostic's value no
  longer outweighed its maintenance cost. `kaola-workflow-adaptive-node.js`'s guard prologue no
  longer carries that detection: it was removed in full (D-594-01), along with the sibling
  `active_batch_exists` plan-repair-reopen arm — nothing writes `active-batch.json` anymore, so a
  stray pre-retirement file is now silently inert rather than refused. History at
  `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md`.

  **Per-node running-set scheduler — parallelism v2 (issue #377).** The now-retired #281 batch
  machine advanced **one whole frontier at a time** (`top-up` opened only same-frontier
  siblings). The running-set scheduler is the post-#364 **per-node** successor — and, since the
  #281 aggregator's retirement, the sole fan-out mechanism: `adaptive-node.js` carries
  `open-ready [--max N]`, `close-node --node-id`, and `reconcile-running-set` subcommands that
  open and close **individual** nodes against a `kaola-workflow/{project}/.cache/running-set.json`
  manifest (`{state:'opening'|'open', nodes:[{id,role,kind,baseline,opening?,openedAt?}]}`), so a
  downstream node unblocks the moment ITS dependencies close — even while a disjoint sibling is
  still `in_progress`. `open-ready` flips ready nodes priority-ordered by `next-action`'s additive
  `longestPathToSink` field (critical-path list scheduling), records per-node baselines, and
  two-phase writes the manifest (`opening` → flip ledger → `open`).
  `close-node` runs the same evidence-shape → `commit-node` barrier → ledger-complete → compliance
  → selector-arm contract as the serial close, removes the node, and returns the newly-ready
  frontier. The scheduler is **additive** to the single-node path (`open-next` /
  `close-and-open-next` stay the `max_concurrent = 1` aliases, unchanged). Read-only nodes fan out
  (they share the parent tree and never write); write nodes the planner proves **disjoint**
  co-open as isolated parallel legs **by default** (D-542-01), while genuinely-overlapping writes
  open **alone** (the serial fallback). Forcing every write frontier serial — the byte-identical
  pre-parallel-write behavior — is now the explicit opt-out path (`KAOLA_PARALLEL_WRITES=0`), not
  the default. A leg-contained **write** also co-opens *behind live reads* — the mirror of the #622
  read-direction relaxation — instead of waiting on `write_awaits_drain`, when four preconditions
  hold (`legCoupled`, clean parent, `--parallel-safe` ok, no live lane group); any miss returns the
  byte-identical hold with a typed `serialDegradeReason`. The `merge_awaits_read_drain` fence (§ the
  running-set close) still holds the leg's merge until the reads drain, so the parent tree the reads
  observe stays untouched — that isolation is what keeps the closed-work-observation invariant intact.
  A consent-tier `observes: scratch` annotation additionally permits a *legless* docs writer to
  co-open behind a scratch-only `adversarial-verifier` over a dirty parent (D-641-01).
  The **AC#5 / #293 legality re-keys to the running set**: `orient` accepts `in_progress` rows
  matching the running-set node set (`valid_running_set`) — the residual `active-batch.json` read
  is `orient`'s own read-only legality reconstruction (deliberately KEPT at #594 as a scope
  boundary distinct from the removed `batch_active` guard above; always `null` now that nothing
  produces the file), not a live alternate coordination path — and route a crashed `opening`
  running set to `reconcile-running-set`
  (`running_set_opening_incomplete`, never an orphan); `orient` reconstructs the live set from the
  manifest on every resume. Wall-clock overlap is claimed only via `node-timings.jsonl` (#373) on
  a real run — the scripts never spawn agents, so they never overclaim concurrency.

  **Scheduler mutual-exclusion lock (issue #585).** The guard prologue described above
  (`probeCoordination`/`coordinationRefusal`) was advisory-only — a pure read of state files
  followed by an in-memory decision, with no OS-level lock anywhere in the mutation path — so two
  concurrent scheduler invocations on ONE project could both pass it and race a lockless
  whole-file read-modify-write (a double-open on `open-ready`×2; a lost `complete` flip on
  `close-node`×2). `adaptive-node.js`'s `main()` now wraps every mutating subcommand body (the
  `SPLIT_GUARDED_SUBCOMMANDS` set — the same boundary the worktree-authority-split guard runs at)
  in a project-scoped O_EXCL lock (`kaola-workflow/{project}/.cache/scheduler.lock`), acquired
  before the layered guard prologue and released in a `finally`. Contention is a typed,
  non-blocking refusal (`scheduler_locked` for a live holder, `scheduler_lock_stale` for a
  dead/aged one — CLASSIFIED, never auto-removed); the read-only subcommands (`orient`,
  `mirror-project`, `record-evidence --verify`) stay lock-free. See `docs/decisions/D-585-01.md`
  and `docs/api.md` § Scheduler mutual-exclusion lock.

  **Serial `open-next` baseline-first ordering (issue #590).** `runOpenNext` (the `max=1` serial
  opener) now records the per-node barrier baseline BEFORE flipping the ledger row to
  `in_progress` — mirroring `open-ready`'s Phase 2 → Phase 3 order — so a crash between the two
  writes leaves the row `pending` (an idempotent re-open) rather than `in_progress` with no
  baseline on disk (a dead end the serial path's crash coverage could not recover, since there is
  no running set for `reconcile-running-set` to repair). See `docs/decisions/D-590-01.md`.

  **Baseline-first ordering extended to the fused advance and reopen-node (issue #621).** The
  same invariant is now also applied to `close-and-open-next`'s fused advance (`runCloseAndOpenNext`)
  and to `runReopenNode`: both record the barrier baseline for the node they are about to open
  BEFORE flipping that node's ledger row to `in_progress`, mirroring `runOpenNext`'s #590 ordering
  above (which neither path had previously received). On a baseline failure, the fused advance
  refuses `baseline_failed` with the just-closed node's own close half already landed and the next
  node's row left `pending` (never re-attempting the splice); `runReopenNode` persists its
  gates-reset/gates-folded write with the node still `pending` on disk, records the baseline against
  that on-disk `pending` row, and only then flips it `pending` → `in_progress` — a crash between the
  gates-write and the flip leaves the row genuinely `pending` (gates already folded), and a retried
  `reopen-node` call re-enters idempotently via an `alreadyAtTarget` tolerance on its own reset
  splice. No path can leave a ledger row `in_progress` without a recorded baseline.

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
  `running-set.json` + ≤ 1 `in_progress` row, every guard-prologue layer is vacuously-pass and
  the serial path is byte-identical to pre-#383 behavior. (The prior condition also named "no
  active-batch"; #594 removed the `batch_active` mutual-exclusion arm entirely, so it is no
  longer a coordination surface any guard-prologue layer checks.) Any refactor that makes
  `open-next` begin writing a `running-set.json` violates [INV-2] and is rejected.

  **Narrow #607 exception to [INV-2].** `open-next` and the `close-and-open-next` fused advance
  now write a minimal `running-set.json` when — and only when — the node being opened is a
  `main-session-gate`: a single `kind:'gate'` entry recording that a gate window is open, consumed
  solely by the write-lane hook's gate-window fence and excluded from every write-oriented
  scheduler count (`liveHasLeglessWrite`, `selectSpeculativeWriteGroup`, the `open-ready` slot math,
  and the `reconcile-running-set` roll-forward budget all explicitly filter out `kind:'gate'`). This is
  a disclosed narrowing of [INV-2], not a silent violation of it: the invariant's purpose — write-
  frontier concurrency accounting stays byte-identical when nothing is co-opening — is preserved (a
  gate carries no write set and never contributes to write concurrency); only the invariant's
  literal "`open-next` MUST NOT begin writing a `running-set.json`" text, which did not anticipate
  a non-write state channel riding the same file, is scoped to the non-gate case. See
  `docs/decisions/D-607-01.md`.

  **Writer kill-safety reconciliation — the Codex Join Protocol (issue #611, D-611-01).** A crash
  or a deliberate reclaim (an interrupted-agent escalation, or an ordinary crash-repair roll-back)
  can leave an in-place WRITER's worktree carrying partial, possibly out-of-declared-set edits — the
  same stray-write hazard `reconcile-running-set`'s existing roll-forward/roll-back machinery
  already navigates for the ledger, but previously blind to the writer's ACTUAL file changes.
  `reconcile-running-set` now diffs every writer member LEAVING the live set on that call (rolled
  back / capped out / stale) against its declared write set via `--barrier-check` — the SAME
  baseline+diff the per-node barrier uses — run BEFORE the existing `--drop-base` loop (which would
  otherwise remove the baseline the diff needs). Read/gate members are never writers and are skipped.
  The classifier (`classifyWriterReconcile`) is POSITIVE-CONFIRMATION and fail-closed: `adopt` is
  emitted only on an EXPLICIT barrier `result: 'pass'|'ok'`, or the vacuous `no_barrier_base` case (a
  writer that crashed before it ever wrote under tracking — nothing to reconcile); every other
  shape — a confirmed out-of-set overflow, an unshellable/non-object result, or a RESULTLESS result
  from a crashed/killed/non-JSON/missing-validator subprocess — halts, because `shellNode` never
  throws and a swallowed subprocess failure otherwise looks like an innocuous empty object. This
  positive-confirmation posture shipped only after an adversarial-verifier gate reproduced the
  opposite (fail-open) behavior of the first implementation end-to-end and it was repaired before
  merge. Reconcile stays non-destructive — it never auto-deletes; a `halt` verdict (surfaced per
  writer in `writerReconciliation[]`, plus a top-level `writerHalt` boolean) hands the named
  out-of-set paths to the orchestrator, which resolves them (`revert-overflow` / `repair-node` /
  a consent halt) before re-opening the node — never re-opening directly on a `halt`, which would
  be the halt-then-reopen laundering hole this mechanism closes. See `docs/api.md` §
  `reconcile-running-set` — writer kill-safety verdicts and `docs/decisions/D-611-01.md`.

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

  **Guard refusal taxonomy is two-armed (not collapsed).** The emit-envelope reason
  contract (#406) requires callers to classify failures structurally by stable `reason` code.
  `serial_node_live` and `scheduler_active` carry different repair pointers and MUST NOT be
  merged into one arm, even though the kernel model unifies serial and scheduler conceptually.
  (A third arm, `batch_active`, existed for the retired parallel-batch mutual-exclusion surface;
  #594 removed it in full once nothing could produce the `active-batch.json` it guarded.)

  **Canonical spec: `docs/decisions/D-419-01.md`** (Part 1).

  **Lane-group co-open and group-scoped close barrier — D-419 Part 2 implementation (issue #437),
  default-on since D-542-01.** Lane-attributed disjoint write co-open is now **on by default**
  (`parallelWritesDefaultOn(process.env)` true unless `KAOLA_PARALLEL_WRITES=0`); the legacy
  `KAOLA_LANE_CONTAINMENT` toggle is demoted to advanced/defense-in-depth (its `PreToolUse` hook
  is fail-open only). When co-open is active, `runOpenReady` (`adaptive-node.js` L2550) no longer
  unconditionally enforces `write_node_exclusive`; instead it calls `tryFormLaneGroup`
  (`adaptive-node.js` L2522) to attempt a co-open of the entire ≥2 disjoint write frontier as a
  **lane group**. The formation is gated on a `--parallel-safe` disjointness check
  (plan-validator.js L1627) over the frontier node ids; a raw overlap result is not necessarily
  final — the `writeOverlapRelaxable` predicate downgrades a `shared-infra` OR `coarse`
  (exact-file-disjoint) overlap to a co-open under the retained net (a post-dominating
  `code-reviewer` gate + no PROTECTED file in either set), with `write_overlap_policy` /
  `--write-overlap-consent` parsed for frozen-plan back-compat but vestigial at this seam. Only a
  genuine `exact` overlap (same path or a case-collision), or a `coarse` pair carrying a
  non-exactly-resolvable directory/glob entry, degrades to single serial write. A successful group
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

  **Read/write co-open relaxed to a leg-contained invariant, with a last-member merge fence
  (issue #622, `docs/decisions/D-622-01.md`).** `write_node_exclusive` previously refused ANY
  co-open — including a pure read frontier — whenever ANY write node was live, whether that write
  was a legless single serial writer or an already leg-isolated lane-group member. `runOpenReady`
  now computes `liveHasLeglessWrite` (true only for a live write node that is NOT a member of the
  currently-live `lane_group`) and refuses `write_node_exclusive` only in that legless case; a read
  may now open alongside a still-live leg-contained lane-group member, since that member's edits
  are isolated in its own leg worktree and never touch the parent tree the read observes. The
  eventual group merge is separately fenced: `closeGroupMember`'s last-member close refuses
  (typed, zero-mutation) with reason `merge_awaits_read_drain` while any live running-set member is
  a read, so the octopus-merge (or the legless snapshot group-barrier) never races a read still
  reading the pre-merge parent tree; the caller retries `close-node` once the read(s) drain. A
  legless or read-free group is unaffected (no live read ⟹ no-op, byte-identical).

  **Single-descriptor invariant and the R4 speculative-write exclusion.** `running-set.json`
  carries at most ONE `lane_group` descriptor at a time. Relaxing `write_node_exclusive` for reads
  exposed a gap in the pre-existing #596 speculative-write fallback — previously unreachable with a
  write group live, since a read could never before co-open alongside one — where a speculative
  write candidate whose only unsatisfied dependency was a read gate that had co-opened alongside a
  live group could itself be selected while that group was still live, form its OWN size-1 group,
  and unconditionally overwrite the live descriptor: silently dropping any still-open member from
  `lane_group` tracking (that member's later close would then miss `closeGroupMember` routing
  entirely, falling to the serial close path, orphaning its committed leg work and leaking its leg
  worktree). Caught by an adversarial-verifier pass and repaired within the same bundle (finding
  R4, never released in the vulnerable shape): `runOpenReady`'s speculative-write branch now
  excludes ALL speculative write candidates with a typed reason `lane_group_live` whenever a write
  lane_group descriptor is already live — sibling to the pre-existing `no_leg_capability` and
  `parent_dirty` exclusions. The excluded write simply waits; once the live group fully drains and
  clears its `lane_group` key, it opens normally (non-speculatively) with no lost parallelism.

  **Tracked-evidence-seeding at group formation (issue #633, `docs/decisions/D-622-01.md`).** A
  lane-group member self-writes its evidence file inside its own leg worktree, never synced back to
  the parent. `runOpenReady` now seeds and COMMITS every group member's evidence stub as a tracked
  file on the parent branch (via a new `legMirrorPath` helper) BEFORE `baseRev` is captured and legs
  branch off, so each leg inherits the stub as an ordinary tracked file and the leg's real content
  later merges in as a routine three-way change instead of colliding with an untracked parent file
  at the last-member merge. `runCloseNode`'s evidence read correspondingly prefers a live
  lane-group member's own leg copy (resolved via `legMirrorPath`) when present, falling back to the
  parent copy for every non-lane-group case (byte-identical to pre-#633 behavior there). See
  `docs/workflow-state-contract.md` for the full `.cache`/evidence-seeding contract.

  **Parent-cleanliness precondition on formation (D-615-01).** Lane-group formation is additionally
  gated on the parent worktree carrying no out-of-allowband production dirt — uncommitted writes
  left behind by already-closed SERIAL write siblings (serial nodes never commit; commits are
  finalize-owned). Without this gate, a group formed over such dirt hits a two-horned deadlock at
  its last-member close: the parent-clean fence refuses `parent_dirty` on the uncommitted serial
  file, but committing that file to clear the fence lands it in the merge commit and outside the
  group's declared union, tripping `write_set_overflow` at the commit-based group barrier.
  `parentCarriesProductionDirt(planPath, project, shell)` (`adaptive-node.js`) shells the SAME
  `--parent-clean-check` fence the last-member close already runs (fail-closed: any non-`pass`
  result — dirt, an unrelated refuse, or a crash/no-JSON — is treated as dirt), so the two checks
  can never classify a parent differently. It gates both formation sites: on dirt, the normal
  co-open path (`liveNodes.length === 0 && writeNodes.length > 0`) degrades to opening a single
  serial write instead of forming a group, and the speculative-write path (`openingSpeculative`)
  excludes all write candidates from that open via `speculativeWriteExcluded: { reason:
  'parent_dirty' }` — the write then waits for its gate normally. A pure-parallel or group-first
  plan carries no prior production dirt at formation time, so this loses no currently-safe
  parallelism; it bites only the genuinely-mixed serial-then-lane-group shape.

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
  also co-open by default** [`KAOLA_PARALLEL_WRITES=0` is the serial opt-out]; since D-593-01 a
  `coarse` (same non-shared top-level area, exact-file-disjoint) write frontier co-opens by
  default too, under the same retained net — only a genuine exact-path overlap, or a coarse pair
  with an unresolvable directory/glob entry, stays serial) and `docs/decisions/D-419-02.md` (Part 2: lane-attributed
  disjoint write parallelism — the validator stamps `parallel_safe` on disjoint write-node
  antichains and `open-ready` lifts `write_node_exclusive` for stamped pairs by default [serial
  opt-out via `KAOLA_PARALLEL_WRITES=0`]; Part 4: consent-gated speculative gate overlap — a `speculative_open_policy:
  consent` plan field allows a descendant to open `in_progress` speculatively while its
  gate runs, with baseline roll-back discard if the gate fails and post-dominance preserved
  by a `gate_not_complete` close-refusal). Since D-596-01, `consent` also admits WRITE-bearing
  descendants onto the identical single-open-gate bet — its declared set must be exactly
  resolvable, carry no PROTECTED file, and it must not be the plan's unique sink — and a
  write member opens WITH a provisioned per-member leg (the #463/D-542-01 leg machinery; even
  a lone speculative writer forms a size-1 lane group) rather than the parent worktree. On a
  gate `verdict: fail` a speculative write member is DISCARD-ONLY (leg torn down + evidence
  purged, no KEEP option — an asymmetry with the read half's KEEP-or-discard operator review).
  Since D-597-01 the D-419-02 consent CEREMONY is superseded as the default posture: the
  freeze-legal set is `off`/`consent`/`auto`, and `auto` — fully-automatic speculative
  activation with no per-run consent, under the identical structural safety net — is the
  freeze-time DEFAULT materialized when the field is absent (`consent` remains authorable;
  `off` is the explicit serial opt-out).
  The original D-419-02 write-overlap deferral rationale (rollback complexity against the
  PARENT worktree) is moot once the speculative write lands in an isolated leg instead: there
  is nothing to revert at the parent, only a leg to tear down. All 25 invariants
  [INV-1]..[INV-25] that bind downstream implementation are enumerated in those records. See
  also `docs/investigations/2026-06-12-parallelism-v3-design.md` for the runtime-grounded
  analysis, and `docs/decisions/D-596-01.md` for the write-graduation decision record.

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

  **Chain receipt (`.cache/chain-receipt.json`, #432) — self-host (npm) only.** `kaola-workflow-run-chains.js` runs all four edition test chains via `spawnSync` (real exit codes) and writes `.cache/chain-receipt.json` (`{headSha, workTreeHash, codeTreeHash, validationTestConsumes, startedAt, chains:[{name, exit}]}`). In a **self-host** repo (its `package.json` declares the `test:kaola-workflow:*` scripts) the Finalization `--finalize-check` gate reads this artifact and refuses with `chains_unverified` (no receipt), `chains_stale`, or `chains_red` (any chain exited non-zero). **#547 (D-547-01) freshness re-key:** `chains_stale` now compares the receipt's `codeTreeHash` (a content address of the code-relevant landable tree — `computeCodeTreeHash`, the #424 allowband + the whole `kaola-workflow/` state tree excluded, MINUS the test-consumed prose that stays code) against a recompute over the current tree. A commit touching only inert docs (narrative/ADRs, NOT the chain-asserted set) or workflow-state since the chains ran leaves the hash unchanged → the receipt stays fresh and the chains are NOT needlessly re-run (the #551 ~30-min repeat). A change to code, or to a chain-asserted doc (`SELF_HOST_TEST_CONSUMED` / the plan's `validation_test_consumes`), flips the hash → `chains_stale` (early regression detection retained). A legacy receipt lacking `codeTreeHash` falls back to the original headSha pin (fail-closed). The producer records the hash via the same exported helper the gate recomputes, so they never disagree. The contractor runs this script at Step 8c and cites the receipt path as evidence, replacing prose attestation. A `--accept-known-red name:issue` waiver acknowledges a known-red chain with an issue reference. **Consumer (non-npm) repos (#475)** do NOT run this producer — `--finalize-check` auto-detects them (no npm scripts) and gates instead on the agent-recorded `.cache/final-validation.md` (presence + a column-0 `verdict: pass`; `final_validation_unverified` / `final_validation_failed`), because the agent owns verification (#44). The v6.2.0 `kaola-workflow/chains.json` opt-in is retired; the attribution sweep runs for both modes.

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

## Agent Profile Structure and Edition Sync

**Profile layout.** Each role has a canonical `agents/<name>.md` (installed by `install.sh`
for the Claude edition) and a `.toml` triple across the three plugin editions:
`plugins/kaola-workflow/agents/<name>.toml` (codex),
`plugins/kaola-workflow-gitlab/agents/<name>.toml`, and
`plugins/kaola-workflow-gitea/agents/<name>.toml`. The current roster is 16 base-role
profiles (16 files, 16 triples) — 15 plus `metric-optimizer` (#634); the 6 `-max` xhigh effort-variant profiles were retired
in #451. Current Codex instead uses one standalone pair per role: eight carry-out profiles pin
`gpt-5.6-sol`/`medium`, and eight reasoning profiles pin `gpt-5.6-sol`/`xhigh`; legacy plan-tier
tokens `opus`/`sonnet` normalize to the corresponding static class (#610). All three `.toml` twins for a given profile are byte-identical
(forge-neutral by the §341 contract — no CLI binaries, no forge brands) and carry the same
`description` / `nickname_candidates` metadata as the managed `config/agents.toml` block.

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

**Runtime per-node tier:** The per-node `model` column in `workflow-plan.md` selects the portable `reasoning`/`standard` rank (or a legacy `opus`/`sonnet` alias) and is sealed at freeze. `next-action.js` surfaces it in every ready-set item; `open-next`/`open-ready` thread it into the running-set manifest for crash/reconcile re-dispatch. Claude and opencode can apply that rank dynamically. Current Codex is deliberately profile-static because its named-profile load order can erase transient overrides: a Codex plan tier must match the role's fixed profile class. Every dispatch/handoff emission carrying a non-null `model` additionally attaches a `model_display` object (`{ claude, codex, opencode }`, via `modelDisplay(tier)`) so a narrative echo of the tier reads natively per runtime instead of surfacing a foreign vendor noun — see `docs/api.md` § "`opened` payload — `dispatch` sub-object" for the field shape.

For Codex specifically, `dispatchEffort()` describes the pair that must appear in the child session: `reasoning`/legacy `opus` → `gpt-5.6-sol` + `xhigh`; `standard`/legacy `sonnet` → `gpt-5.6-sol` + `medium`. `codexProfilePolicy()` divides the registry into eight standalone Sol/medium carry-out profiles and eight standalone Sol/xhigh reasoning profiles; `buildDispatch()` emits `codex_profile_mode`, `codex_profile_tier`, and `codex_profile_compatible`. A blank plan cell first resolves through the same role-static tier. A conflicting explicit tier refuses as `codex_profile_tier_mismatch`; a null pair refuses as `codex_tier_unresolved`. Plan-run omits transient `model`/`reasoning_effort` arguments in both dispatch modes and accepts a profile class only after fresh child-session JSONL proves the expected `turn_context.model` and `turn_context.effort`; a mismatch refuses as `codex_profile_runtime_mismatch`. Each DAG node role writes its full nonce-bound deliverable directly to the seeded cache artifact and returns only a compact orchestrator summary. `record-evidence --verify` requires every current nonce-bound role token before node close and downstream exposure; for an unmerged isolated leg, both verification and `dispatch.upstream_evidence` resolve the leg artifact without parent fallback, and the merge waits for dependent reads to drain. A transport disconnect therefore cannot erase a valid filesystem handoff, while a seed-only, summary-only, or missing-leg artifact cannot advance the DAG. The out-of-ledger `workflow-planner` and `contractor` roles instead keep their complete workflow-state/plan/phase/finalization artifacts as the authoritative durable full result, return a compact summary, and mirror the full packet into a seeded cache when one is supplied.

## Concurrent Same-Repo Sessions — Main-Root Authority and Lane Classifier (#579)

Two mechanisms harden concurrent same-repo sessions: a **single main-root authority** that
eliminates the path-derivation split when running from a linked worktree, and a **four-bucket
lane classifier** that lets `cmdStatus` and `cmdResume` distinguish own/active/stale/unknown lanes
without stale-merging or prompt confusion.

### Single main-root authority

`getCoordRoot`, `mainRootFromCoord`, and `resolveMainRoot` are canonically defined **once** in
`scripts/kaola-workflow-adaptive-schema.js` (the byte-identical cross-edition drift anchor) and
re-exported by `kaola-workflow-claim.js`. Previously, the same three-line body was triplicated
across `claim.js`, `adaptive-node.js`, and `sink-merge.js` — any divergence caused an authority
split when launched from a linked or detached worktree.

`writeState` (claim.js) computes `resolveMainRoot(root)` once at claim time and writes
`main_root: <path>` into the `## Sink` block. The executor (`adaptive-node.js`) reads this field
back from the local `workflow-state.md` instead of re-deriving from cwd. Absent on pre-#579 state
files; the executor falls back to `getMainRoot(repoRoot)` (backward-compatible).

### Four-bucket lane classifier

`classifyLane(lane, ctx)` (`scripts/kaola-workflow-classifier.js`) is a pure function that
partitions any active-folder lane into one of four buckets, driven by three claim-time fields
stamped by `writeState` and surfaced by `active-folders.js`:

- `session_marker` — session identity produced by `resolveSessionMarker(env)` (also in
  `classifier.js`): `KAOLA_SESSION_MARKER` env var when set, otherwise `s-<pid>-<timestamp-base36>`.
- `claim_ts` — ISO-8601 claim timestamp, the liveness anchor.
- `LANE_STALENESS_MS = 86400000` (24 hours, exported from `adaptive-schema.js`) — single
  staleness constant. A claim newer than 24 hours may be an active co-tenant (`ambiguous`);
  older than 24 hours is a resumable leftover (`stale`).

All three fields are written once at claim time; no heartbeat/refresh path exists.

**Precedence ladder (first match wins):**

| Priority | Condition | Bucket | Meaning |
|---|---|---|---|
| 1 | `lane.session_marker === ctx.ownSession` | `mine` | Own lane |
| 2 | `ctx.explicitResumeIssues` intersects lane's issues | `stale` | Adopt as resumable (explicit instruction beats freshness) |
| 3 | `ctx.coTenantSignal` (`KAOLA_COTENANT=1`) | `live` | Leave untouched — active co-tenant declared |
| 4a | `claim_ts` present and age < `LANE_STALENESS_MS` | `ambiguous` | Ask before overwriting |
| 4b | `claim_ts` absent or age ≥ `LANE_STALENESS_MS` | `stale` | Old leftover or pre-#579 markerless folder |

`cmdStatus` annotates each active-folder item with `lane_bucket` + `lane_bucket_reason` (from
`classifyLane`). `cmdResume` excludes `live` lanes from the resume candidate set; `stale` and
`mine` are resumable; `ambiguous` or more than one candidate triggers the existing
`resume_ambiguous` refusal.

### Clean-check selectivity

The clean-worktree gates (`assertCleanWorktree`/`assertWorktreeClean` in `sink-merge.js`,
`treeDirty` in `claim.js`) apply `isParkedLanePath(relPath, ownedProjects)` (from
`adaptive-schema.js`) ON TOP of the existing probe-fault / catch-dirty handling. The predicate
exempts only non-owned lane scratch under `PARKED_LANE_PREFIXES`
(`['kaola-workflow/', '.kw/worktrees/', '.kw/legs/']`). Real code, shared durable state
(`kaola-workflow/.roadmap/`, `ROADMAP.md`, `config.json`, `archive/`), and own in-progress
state all remain strict — fail-closed posture is preserved (unverifiable → dirty). The
`ffMergeLoop` conflict handler and the true-conflict halt are byte-unchanged; the clean check
runs before the merge loop so the loosened non-owned exemption cannot change conflict handling.

See `docs/conventions.md` § Co-Tenant Lane Convention and `docs/decisions/D-579-01.md`.
