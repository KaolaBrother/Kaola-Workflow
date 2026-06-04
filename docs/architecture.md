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
  library + fixed models (`resolve-agent-model`; see **Model resolution** below), the three shapes
  (sequence / fan-out / bounded loop), a unique `finalize` sink, **post-dominance**
  gates (`code-reviewer` over every code-producing node — implement roles, plus any
  write role writing a non-docs file, plus non-docs writes declared on the `finalize`
  sink; `security-reviewer` over every sensitive node — computed as
  reachability-after-gate-removal, so they hold over *any* topology), the caps,
  intra-issue write-set disjointness, and the durable
  `workflow-plan.md` + `## Node Ledger` + `plan_hash` resume contract.

  **Components.** `kaola-workflow-adapt` authors `workflow-plan.md`;
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

  **Lean-orchestrator boundary (issue #242 Part B, wired in Stages C–D).** The lean-orchestrator design keeps the main Opus orchestrator's context lean by dividing responsibility along a strict judgment vs. mechanical line. The Opus orchestrator owns all judgment: which role runs next, whether work is correct, risk assessment, gating decisions, and any user-facing question (#44: the agent owns reasoning). A separate mechanical **contractor** agent owns the mechanical block at **both** fuzzy/bulky seams: **Phase 6** (the finalization scripts — `cmdFinalize` archive, artifact mirror, roadmap regen, the `chore: finalize` commit gate) and **Phase 1** (the research/scout phase checkpoint — the `workflow-state.md` checkpoint write preserving the `## Sink` block, and the per-issue roadmap `init-issue` staging). Phase 1's split is a partial offload: the **completeness gate**, the **`phase1-research.md` synthesis** (interpretation of research findings — never the contractor's), and the **Step 6 branch cut** (git mutation) all remain with Opus; only the deterministic bookkeeping is delegated. The per-node loop in `kaola-workflow-plan-run` is **not** contractor-mediated — Opus calls the aggregator scripts directly (see Atomicity layer below). The contractor is Sonnet and stays Sonnet even under `--profile=higher` (mechanical transcription cannot be judgment-upgraded by installing a higher profile; there is deliberately no `profiles/higher/contractor.md`). **Shell-var lifetime:** a subagent runs in its own shell, so the orchestrator captures sink and worktree metadata BEFORE the contractor dispatch; the contractor's commit and archive are durable git state that persists across the shell boundary and is reused at the Step-9 sink. The boundary in one line: **Opus decides *what* + dispatches *roles* + owns synthesis + owns the sink/close; the contractor runs scripts + writes durable bookkeeping; the aggregator scripts own the per-node barrier choreography.** The lean-orchestrator wiring is now complete: the contractor is dispatched at both phase1 and phase6 seams, and the adaptive executor loop is aggregator-direct. See `docs/api.md` § Contractor Agent for the tools list and all-edition registration details.

  **Atomicity layer (issue #242 Part B Stage A, wired in Stage C).**
  Two aggregator scripts form the atomicity interface the executor and Phase-6 now call:
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
  whole-plan (Phase-6 merge gate) both checks are blocking. The split between next-action
  and commit-node mirrors the executor's own dispatch/commit cycle: next-action resolves
  *what* to run next; commit-node proves *what was written* was in bounds.
  In the wired executor (`kaola-workflow-plan-run`), Opus calls `kaola-workflow-next-action.js`
  to compute the ready set and `kaola-workflow-commit-node.js --node-id X --start` at node
  start and `--node-id X` at node end — all directly from the main session with no
  contractor round-trip (the scripts are already self-contained; a per-node contractor
  dispatch would add latency with no isolation benefit).
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
