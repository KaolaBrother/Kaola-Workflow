# Architecture

Document system boundaries, major components, data flow, and deployment shape.

## Workflow Paths (fast / full / adaptive)

Kaola-Workflow runs an issue through one of three macro-shapes, selected by agent
judgment in `workflow-next.md` Step 0a-1 (scripts validate, never auto-pick — #44):

- **fast** — single-pass Plan+Execute+Review (`fast-summary.md`); one fixed shape.
- **full** — the fixed 6-phase ladder (P1→P6); the default and the answer to every doubt.
- **adaptive** (issue #227, opt-in via the `enable_adaptive` switch) — the agent
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

  **Lean-orchestrator boundary (issue #242 Part B; realigned to the original intent in v5.0.0).** The lean-orchestrator keeps the main Opus orchestrator's context lean by dividing responsibility along a strict judgment vs. mechanical line. The Opus orchestrator owns all **judgment**: which role runs next, whether work is correct, risk assessment, gating/consent decisions, the **sink** (merge/PR + `gh issue close` recheck), the **branch cut**, the research synthesis (`phase1-research.md`), and the adaptive freeze + risk-governance decision (#44: the agent owns reasoning; the `workflow-planner` front-end subagent authors the `## Nodes` DAG, but Opus governs and decides the freeze). A separate mechanical **contractor** agent (Sonnet) owns the mechanical block at **every** seam (except the router/startup bootstrap, which stays a deterministic main-session bash block — it summons every subagent and has nothing to capture before a dispatch, so offloading it would trade determinism for prose-transcribed shell state; the bootstrap exception is narrowed for `KAOLA_PATH=adaptive`, where the router skips its inline startup (Step 0b) and routes to `/kaola-workflow-adapt`, in which the `workflow-planner` front end performs the claim — the router stays dispatch-free and resume still wins: an existing frozen `workflow-plan.md` routes to `/kaola-workflow-plan-run` and is never re-authored) — the adaptive freeze + checkpoint + roadmap `init-issue`, the phase 1–6 post-dispatch bookkeeping + phase-file authoring, and the fast-path `.cache` mkdir / state writes / `fast-summary.md` authoring. The adaptive per-node lifecycle (open, record evidence, close, advance, halt) is now owned by `kaola-workflow-adaptive-node.js` — typed script transactions run directly by the main session in `/kaola-workflow-plan-run`, with no contractor subagent needed for those mechanical transitions. The main session always keeps the **dispatch** of role agents *and* the contractor (a subagent cannot dispatch a subagent, so the dispatch loop stays with Opus), and **hands its verdict into the contractor** for any judgment-bearing file (e.g. the phase-2 Selected Approach, the phase-5 Review Status, the fast `## Status` PASSED/ESCALATED); the contractor transcribes it verbatim and never judges, dispatches, sinks, closes, or asks. For the adaptive plan, the **`workflow-planner`** front-end subagent (a locally-authored Opus agent, distinct from the vendored read-only in-plan `planner` node) owns the claim + authors the `## Nodes` table; Opus then governs the risk decision and the contractor stamps the `plan_hash` freeze. The contractor is Sonnet and stays Sonnet even under `--profile=higher` (mechanical transcription cannot be judgment-upgraded; there is deliberately no `profiles/higher/contractor.md`). **Shell-var lifetime:** a subagent runs in its own shell, so the orchestrator captures sink/worktree metadata BEFORE a contractor dispatch and re-derives its own paths after; durable git/file state (worktree creation, the created `workflow-state.md`, commits, archives) persists across the boundary and is reused at the sink. The boundary in one line: **Opus decides *what* + dispatches *subagents* + owns synthesis + the sink/close + the branch cut; the contractor runs workflow scripts for phase 1–6 bookkeeping; `kaola-workflow-adaptive-node.js` owns the adaptive per-node lifecycle transactions; the aggregator scripts own the per-node barrier choreography.** The contractor's bookkeeping role (phase 1–6 + fast-path writes) is a deliberate design to keep the main Opus context free of transcription work; the adaptive per-node loop is a direct script call, not a contractor round-trip. See `docs/api.md` § Contractor Agent for the tools list and all-edition registration details.

  **Strict lean-orchestrator boundary (issue #277 — script-enforced seams).** #277 hardens the lean-orchestrator boundary from prose guidance to script enforcement via three complementary mechanisms:

  - **M3 — Procedure relocation (PREVENTION).** The complete Finalization procedure (scripts, bookkeeping, archive, roadmap regen) now lives solely in the `contractor` agent profile. The claim + author + adaptive-handoff procedure lives solely in the `workflow-planner` profile. Orchestrator command files (`finalize.md`, `kaola-workflow-adapt.md`) keep only thin dispatch handles. `validate-workflow-contracts.js` text-locks the contractor dispatch handle on all four editions — removing it from an orchestrator command file fails the contract gate.

  - **M4 — Run posture.** Adaptive claim always provisions a repo-local worktree (via `workflow-planner`-driven startup). Startup writes `run_posture: worktree|in-place` to the `## Sink` block of `workflow-state.md`, derived from the actual worktree resolution (`deriveRunPosture(worktreePath)` in `kaola-workflow-claim.js`: truthy path → `worktree`, falsy → `in-place`). The value is never env-forced or inherited; `in-place` persists as the automatic fallback only. No `--worktree` flag is needed.

  - **M1 — SubagentStart dispatch-log hook.** A `SubagentStart` hook (`hooks/kaola-workflow-subagent-dispatch-log.sh`, id `kaola-workflow:subagent-dispatch-log`) records each subagent spawn — `ts`, `agent_type`, `agent_id`, `cwd` — as one JSON line to `kaola-workflow/{project}/.cache/dispatch-log.jsonl` for every active project. The hook is fail-open (exit 0 always) and active on Claude-Code editions (claude/gitlab/gitea); Codex is deferred to #266.

  - **M2 — WARN-FIRST closure attestation.** `checkDispatchAttestations` (wired into the closure path at finalize time) reads the dispatch log and records `claim_planner_attested` / `finalize_contractor_attested` (enum: `attested|missing|failed`) in the closure receipt. It pushes warnings but never modifies `closure_invariants.violations` — missing attestation is advisory, never blocking. If the dispatch log is absent, both fields are set to `missing` and the detector is noted inactive. The honest limit: this catches casual zero-spawn bypasses; the log itself is in the project-controlled `.cache/` directory.

  **Codex harness hardening (issue #266).** Three additions harden the Codex edition of the adaptive path against config drift, silent inline execution, and state loss after compaction:

  - **Preflight gate (`kaola-workflow-codex-preflight.js`).** A hard gate that MUST pass before any `subagent-invoked` compliance row is written. It verifies that `.codex/agents/kaola-workflow/*.toml` role-profile files are present and that the managed `.codex/config.toml` block (delimited by `# BEGIN/END kaola-workflow agents`) includes every role in the current template. When the only problem is a stale managed block, it auto-reinstalls via `install-codex-agent-profiles.js`; when auto-install is unsafe (conflicting hand-authored tables outside the markers, missing template role, installer failure), it emits a typed refusal and exits non-zero. Never a silent `subagent-invoked`. See `docs/api.md` § Codex Harness Scripts for CLI and exit codes.
  - **Durable task mirror (`kaola-workflow-task-mirror.js`).** Generates `kaola-workflow/{project}/workflow-tasks.json` from the frozen `## Nodes` + `## Node Ledger`. The Codex UI task list mirrors this file; `workflow-tasks.json` is NOT the source of truth — the `## Node Ledger` is. Regenerated when missing, unparseable, or stale (hash mismatch). See `docs/workflow-state-contract.md` § Codex Task Mirror for the source-of-truth chain and schema.
  - **Compact/resume hook (`kaola-workflow-codex-compact-resume.js`).** A self-contained stdin/stdout filter (invoked `node <path> < session.json` on demand) that reads the four durable artifacts (`workflow-state.md`, `workflow-plan.md` `## Node Ledger`, `workflow-tasks.json`) and emits a deterministic 6-section resume packet: active project, next skill/command, in-progress node, pending gates, consent-halt markers, task-mirror summary. Does not mutate state. No `CLAUDE_PLUGIN_ROOT` dependency; edition-named ×3 (codex/gitlab/gitea). This is the Codex compact/resume entrypoint — Codex has no hooks manifest key, so the script is invoked on demand. See `docs/api.md` § Codex Harness Scripts for the packet format.

  **Main-direct carve-outs (explicitly out of attestation scope per §5).** The adaptive per-node lifecycle transactions (`kaola-workflow-adaptive-node.js`) and the Finalization sink (`sink-merge.js` / `sink-pr.js`) are intentionally main-direct. No provenance is added there; they are not expected to generate contractor or planner dispatch-log entries.

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
  at node END it runs `--barrier-check` (blocking) and `--gate-verify` (informational
  only at the per-node level, because the downstream reviewer is still pending); at
  a whole-plan invocation (no `--node-id`) both checks are blocking (a test-only mode — see the executor note below). The split between next-action
  and commit-node mirrors the executor's own dispatch/commit cycle: next-action resolves
  *what* to run next; commit-node proves *what was written* was in bounds.
  `kaola-workflow-adaptive-node.js` (#272) is the third aggregator and owns the complete
  per-node lifecycle for `/kaola-workflow-plan-run`: the `orient` (read-only resume scan — it
  also reconciles the durable task mirror `workflow-tasks.json` on every resume by shelling the
  task-mirror CLI, so the write stays out of `orient` itself, #282),
  `open-next` (ledger `pending → in_progress` + baseline), `record-evidence` (`.cache` write),
  `close-and-open-next` (evidence-shape check → barrier → close + compliance row → selector
  routing → fused advance), `write-halt` (consent/security/test_thrash escalation), and
  `reopen-node` (#308 first-class plan-repair: reset an already-`complete` node and its
  post-dominating gate(s) → `pending`, remove the stale `.cache/barrier-base-<id>` baselines,
  reopen the node to `in_progress`, and re-record a fresh baseline at the current merged state)
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
  tracks the five lifecycle states:

  | State | Meaning |
  |-------|---------|
  | `opening` | Crash-safe transaction marker: the manifest is written with the intended member set **before** any ledger row flips. Reconcilable via the `reconcile` subcommand (roll-forward to `open`, or `--abort` roll-back) — never left an orphan |
  | `open` | N ledger rows flipped to `in_progress`; N baselines recorded; members not yet evidence-complete |
  | `sealed` | All members passed their per-node barrier; all rows `complete` or `n/a` |
  | `joining` | Write-role path-scoped merge in progress; per-member `joined` flags track completion |
  | `joined` | Transient; manifest deleted; orchestrator re-enters `next-action` |

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
  on `sealed`/`joining`; delete manifest on `joined`). `seal-member` calls the unchanged
  `commit-node --node-id N` barrier; no new gate surface is introduced. Finalization
  `--barrier-check` sees normal `complete` rows after `join`. Full design at
  `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md`.

  **Enforcement boundary (script-enforced, #231).** The validator enforces gate
  *presence* statically at freeze: post-dominance proves a `code-reviewer` sits on
  every path from each code-producing node to the unique sink, and a `security-reviewer`
  on every path from each sensitive node. Gate *execution* at runtime is now
  **script-enforced** too. `--gate-verify` proves a *completed* reviewer post-dominates
  every completed code/sensitive node in the `## Node Ledger` — closing the leak where a
  required reviewer is marked `n/a` at runtime (audit G1/H5) — wired into `routeAdaptive`
  (surfaced as `pendingGates`, non-blocking on resume so a mid-run pending gate never
  bricks an in-flight plan) and enforced as a hard merge gate in Finalization. `--barrier-check`
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
  file edited without its mirror lane at freeze instead of post-merge at `npm test`.

  **No mid-run kill-switch once a plan is frozen (accepted, #236).** Flipping the
  `enable_adaptive` switch OFF stops *new* adaptive selection but does **not** halt an
  already-frozen, in-flight plan: the switch gates `claimProject` SELECTION (and the
  `/kaola-workflow-adapt` authoring entry, #235) only, while both resume surfaces —
  `routeAdaptive` and `resumeFallbackCommand` — and the resume re-validation
  (`revalidateForResume`, library + structure + `plan_hash` only) are deliberately
  **toggle-agnostic**. This is correct-by-design: a mid-run path-yank would brick an
  in-flight plan and break the `plan_hash` author-immutability contract. An explicit
  opt-in operator halt (`KAOLA_ADAPTIVE_HALT`, distinct from the selection switch) was
  considered and **deferred** — it adds a new resume-surface read and a brick vector for
  marginal benefit; the principled containment for a bad frozen plan is the per-tier
  runtime `--barrier-check` (#231), not a binary kill-switch.

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

## Model Resolution (Install-Time, Profile-Aware)

**Model resolution for adaptive subagent nodes** is install-time and profile-aware. `install.sh` writes a manifest `~/.claude/agents/.kaola-agent-models.json` (path honoring `KAOLA_AGENT_DIR`) that maps each agent name to its install-selected model string (e.g. `{ "planner": "claude-opus-4-5", "code-writer": "claude-sonnet-4-5" }`). `uninstall.sh` removes the manifest.

The resolver (`resolve-agent-model`) uses this precedence chain:

1. **Manifest** — value from `~/.claude/agents/.kaola-agent-models.json` for the agent name (if present and non-empty).
2. **Frontmatter** — agent frontmatter `model:` field, when it is not `inherit` or empty.
3. **`DEFAULT_AGENT_MODELS`** — the hardcoded per-role defaults in `kaola-workflow-adaptive-schema.js`.
4. **`''`** — empty string, letting the orchestrator's model inherit (last resort).

**Effect on adaptive nodes:** Dynamically dispatched nodes now resolve to their correct profile-aware model and render the model badge in the dispatch call. Previously, agents with `model: inherit` frontmatter resolved to `''` and silently inherited Opus regardless of the installed profile. Frontmatter remains `inherit` (the install-emitted manifest is the authoritative source); the dispatch carries an explicit `model=` so the badge is always visible.
