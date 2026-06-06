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
  claim ──► branch / worktree ──► [ FREE DESIGN ] ──► Phase-6 sink
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
  ahead of the phaseN ladder. The Phase-6 sink, claim/branch/worktree lifecycle, and
  the nine canonical roles are **inherited unchanged** — only small adaptive-aware
  touches are added. The switch gates selection only; resume is toggle-agnostic.

  **Lean-orchestrator boundary (issue #242 Part B; realigned to the original intent in v5.0.0).** The lean-orchestrator keeps the main Opus orchestrator's context lean by dividing responsibility along a strict judgment vs. mechanical line. The Opus orchestrator owns all **judgment**: which role runs next, whether work is correct, risk assessment, gating/consent decisions, the **sink** (merge/PR + `gh issue close` recheck), the **branch cut**, the research synthesis (`phase1-research.md`), and the adaptive freeze + risk-governance decision (#44: the agent owns reasoning; the `workflow-planner` front-end subagent authors the `## Nodes` DAG, but Opus governs and decides the freeze). A separate mechanical **contractor** agent (Sonnet) owns the mechanical block at **every** seam (except the router/startup bootstrap, which stays a deterministic main-session bash block — it summons every subagent and has nothing to capture before a dispatch, so offloading it would trade determinism for prose-transcribed shell state; the bootstrap exception is narrowed for `KAOLA_PATH=adaptive`, where the router skips its inline startup (Step 0b) and routes to `/kaola-workflow-adapt`, in which the `workflow-planner` front end performs the claim — the router stays dispatch-free and resume still wins: an existing frozen `workflow-plan.md` routes to `/kaola-workflow-plan-run` and is never re-authored) — the adaptive freeze + checkpoint + roadmap `init-issue`, the adaptive per-node loop (the *advance* and *commit* brackets around each role dispatch: the `next-action`/`commit-node` runs plus the ledger/state/compliance writes), the phase 1–6 post-dispatch bookkeeping + phase-file authoring, and the fast-path `.cache` mkdir / state writes / `fast-summary.md` authoring. The main session always keeps the **dispatch** of role agents *and* the contractor (a subagent cannot dispatch a subagent, so the dispatch loop stays with Opus), and **hands its verdict into the contractor** for any judgment-bearing file (e.g. the phase-2 Selected Approach, the phase-5 Review Status, the fast `## Status` PASSED/ESCALATED, the per-node consent-halt markers); the contractor transcribes it verbatim and never judges, dispatches, sinks, closes, or asks. For the adaptive plan, the **`workflow-planner`** front-end subagent (a locally-authored Opus agent, distinct from the vendored read-only in-plan `planner` node) owns the claim + authors the `## Nodes` table; Opus then governs the risk decision and the contractor stamps the `plan_hash` freeze. The contractor is Sonnet and stays Sonnet even under `--profile=higher` (mechanical transcription cannot be judgment-upgraded; there is deliberately no `profiles/higher/contractor.md`). **Shell-var lifetime:** a subagent runs in its own shell, so the orchestrator captures sink/worktree metadata BEFORE a contractor dispatch and re-derives its own paths after; durable git/file state (worktree creation, the created `workflow-state.md`, commits, archives) persists across the boundary and is reused at the sink. The boundary in one line: **Opus decides *what* + dispatches *subagents* + owns synthesis + the sink/close + the branch cut; the contractor runs every workflow script + writes every durable bookkeeping file; the aggregator scripts own the per-node barrier choreography.** This is a deliberate trade — a per-node contractor round-trip costs latency/tokens to buy a lean Opus context. See `docs/api.md` § Contractor Agent for the tools list and all-edition registration details.

  **Atomicity layer (issue #242 Part B Stage A, wired in Stage C).**
  Two aggregator scripts form the atomicity interface the adaptive executor calls (via the contractor):
  `kaola-workflow-next-action.js` reads a frozen `workflow-plan.md` and computes the
  ready-set (nodes whose dependencies are all `complete`/`n/a` and whose own status is
  non-terminal), the `nextNode` (first ready node), and the resolved model for each
  candidate, via the validator's exported `parseNodes`/`parseLedger` (no reimplementation);
  model resolution delegates to `resolveAgentModel` (a separate module). An empty ready-set with all nodes terminal is the Phase-6
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
  In the wired executor (`kaola-workflow-plan-run`), the **contractor** runs
  `kaola-workflow-next-action.js` to compute the ready set and
  `kaola-workflow-commit-node.js --node-id X --start` at node start (the *advance* bracket) and
  `--node-id X` at node end (the *commit* bracket), returning the ready set and the barrier exit
  code to the main session, which dispatches the role and owns the consent-halt decision. v5.0.0
  reversed the earlier "aggregator-direct" wiring in favor of the original intent — the main
  session is not exposed to the loop scripts; the per-node contractor round-trip is the accepted
  cost of a lean Opus context. The aggregator's whole-plan mode (no `--node-id`, both checks
  blocking) is exercised by unit tests; Phase 6 runs its merge gate by calling the plan-validator
  directly (preserving the `--resume-check`/`plan_hash` integrity check), not via the aggregator.
  Both scripts ship in all four editions (canonical `scripts/` + Codex copy in
  `plugins/kaola-workflow/scripts/`, plus GitLab and Gitea forge-named ports); all are
  registered in `validate-script-sync.js` COMMON_SCRIPTS and the three `install.sh`
  SUPPORT_SCRIPT_NAMES blocks.

  **Enforcement boundary (script-enforced, #231).** The validator enforces gate
  *presence* statically at freeze: post-dominance proves a `code-reviewer` sits on
  every path from each code-producing node to the unique sink, and a `security-reviewer`
  on every path from each sensitive node. Gate *execution* at runtime is now
  **script-enforced** too. `--gate-verify` proves a *completed* reviewer post-dominates
  every completed code/sensitive node in the `## Node Ledger` — closing the leak where a
  required reviewer is marked `n/a` at runtime (audit G1/H5) — wired into `routeAdaptive`
  (surfaced as `pendingGates`, non-blocking on resume so a mid-run pending gate never
  bricks an in-flight plan) and enforced as a hard merge gate in Phase 6. `--barrier-check`
  re-scans the files actually written and refuses a sensitive write with no `security-reviewer`
  node (audit H1) or an out-of-allowlist production write (audit H3). It runs in two modes: the
  **whole-plan** Phase-6 merge gate diffs vs the merge-base of HEAD and `origin/main` (so a
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

## Phase 6 Finalization and Sink Flow

Phase 6 delivers completed work through one of two sink paths:

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

**Failure handling**: On merge-impossible error (branch protected, non-fast-forward, permission denied), sink-merge exits code 3 and Phase 6 automatically pivots to PR sink.

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
3. **Auto-fallback**: When merge is configured but fails with exit 3, Phase 6 automatically pivots to PR sink.

### Gitea Sink Layer (Complete — GitHub/GitLab Parity)

Gitea edition (`plugins/kaola-workflow-gitea/`) now includes a complete Phase 6 sink implementation:

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
