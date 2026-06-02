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
  library + fixed models (`resolve-agent-model`), the three shapes
  (sequence / fan-out / bounded loop), a unique `finalize` sink, **post-dominance**
  gates (`code-reviewer` over every implement node; `security-reviewer` over every
  sensitive node — computed as reachability-after-gate-removal, so they hold over
  *any* topology), the caps, intra-issue write-set disjointness, and the durable
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
