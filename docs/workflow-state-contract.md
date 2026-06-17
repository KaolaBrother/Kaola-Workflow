# Workflow State Contract

This map is the detailed state inventory for Kaola-Workflow. Keep root memory
files such as `CLAUDE.md` and `AGENTS.md` limited to durable invariants and link
here for the full contract.

## Durable Sources

- Forge issues (GitHub, GitLab, or Gitea) are the canonical backlog and closure source when online.
- `kaola-workflow/.roadmap/issue-*.md` files are the durable local source for
  active roadmap rows. Do not purge the directory; closing an issue removes only
  that issue source file before regenerating the mirror.
- `kaola-workflow/{project}/workflow-state.md` is the active resume pointer. It
  records status, phase, step, pending gates, next command or skill, issue
  number, sink mode, branch, worktree path when known, and delegation policy.
  See the Workflow State Fields section below for the complete field inventory.
- Phase artifacts under `kaola-workflow/{project}/` are durable evidence while
  the project is active: `phase1-research.md`, `phase2-ideation.md`,
  `phase3-plan.md`, `phase4-progress.md`, `phase5-review.md`, and
  `finalization-summary.md`.
- Fast-path projects use `fast-summary.md` instead of the full Phase 1-5 set.
- Adaptive-path projects (`workflow_path: adaptive`, issue #227) use
  `workflow-plan.md` instead of the full Phase 1-5 set — the frozen DAG is the
  spine. It contains a `## Meta` block (frozen issue `labels:`), a machine-readable
  `## Nodes` table (`| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |`;
  `shape` ∈ `sequence` / `fanout(<group>)` / `loop(<cap>)` / `select(<group>)` (issue #263 Classify-And-Act);
  `selector_source` names the read-only classifier node whose `.cache` evidence determines which
  `select` arm executes — absent or `—` for non-arm nodes (backward-compatible: missing column treated as non-arm);
  a single unique `finalize` sink; `cardinality` is a reserved/advisory column — parsed but not
  validated or used by the grammar or gates, though its text still feeds `plan_hash`
  as part of `## Nodes`, so keep it present and stable), a `## Node Ledger` (`status` ∈ `pending`/`in_progress`/`complete`/`n/a`),
  and a script-computed `plan_hash` (an HTML comment `<!-- plan_hash: <sha256> -->`)
  that **lives inside `workflow-plan.md`** — never in `workflow-state.md`, because
  repair-state runs precisely when `workflow-state.md` is missing. The validator/claim
  scripts (never the agent) compute and re-check it. **Gate compliance rows for
  `code-reviewer`/`security-reviewer` must use the bare role string** (the anchored
  `DELEGATION_CONTROLLED_REQUIREMENTS` matcher), with per-instance disambiguation in
  the Evidence column only. The barrier commit order is `.cache` evidence → Node
  Ledger row → `workflow-state.md` pointer LAST, so a crash mid-node is recoverable.
- `.cache/` files under an active project hold supporting evidence referenced by
  phase artifacts or summaries. Key `.cache/` entries:
  - `dispatch-log.jsonl` — written by the `kaola-workflow-subagent-dispatch-log.sh`
    SubagentStart hook; each line is a JSON object recording a subagent spawn
    (`ts`, `agent_type`, `agent_id`, `cwd`). Used by `checkDispatchAttestations`
    at closure time for WARN-FIRST subagent-seam attestation (see `docs/api.md` § Closure Contract).
  - `running-set.json` — tracks which nodes are currently in the running set
    (`{ state: 'opening'|'open', max_concurrent?: number, nodes: [...], updatedAt }`; per-node fields: `id`, `role`, `kind`,
    `baseline`, optional `opening` marker and `openedAt`). `max_concurrent` is set at
    `open-ready` time (`min(cap, --max || cap)`) and read by `reconcile-running-set` to
    cap roll-forward re-opens; absence implies 1 (fail-closed). Prevents double-open;
    a crashed `opening` state routes to `reconcile-running-set`. See the **`lane_group` extension** below.

    **`lane_group` key (issue #437, `KAOLA_LANE_CONTAINMENT` ON only).**
    When `open-ready` forms a write lane group, an optional top-level `lane_group` key is added to
    `running-set.json`. Its full schema is documented in `docs/api.md` § Lane-group co-open. State
    contract notes:

    - **Absent when flag OFF.** With `KAOLA_LANE_CONTAINMENT` unset (the permanent default),
      `running-set.json` is never written with a `lane_group` key. A serial or read-only run's
      `running-set.json` is byte-identical to pre-#437 regardless of the key's presence
      (absent `lane_group` ⟹ `null` ⟹ `closeGroupMember` is never entered).
    - **Absent when no group is live.** The key is cleared (the whole key is deleted, not set to
      `null`) when the last group member passes the group barrier and the group is dissolved.
    - **Outside `plan_hash`.** `lane_group` is a runtime scheduler artifact, not plan structure.
      It is written into `running-set.json` (a non-hashed `.cache/` artifact), not into
      `workflow-plan.md`. The `plan_hash` covers only `## Meta` and `## Nodes` — `lane_group`
      changes never invalidate the frozen plan hash.
    - **Two-phase crash-safety.** The group open follows the same crash-safe two-phase pattern as
      the single-node open: `running-set.json` is first written with `state:'opening'` AND `lane_group`
      present BEFORE any ledger row flips; then promoted to `state:'open'` after all baselines and
      ledger flips succeed. A crash with `state:'opening'` routes to `reconcile-running-set`.
    - **Group baseline co-residence.** The group baseline is stored in `.cache/barrier-base-<group_id>`
      and anchored at `refs/kaola-workflow/barrier-base/<sanitized-group_id>` — the same mechanism
      as per-node baselines, keyed by `group_id`. It is recorded BEFORE the `opening` manifest write
      (orphan-baseline direction is safe). It is dropped via `--drop-base --node-id <group_id>` after
      a barrier pass, or during reconcile rollback when all members roll back.
    - **`closed_members` vs `members`.** `members` is the FULL bare id list, stable during the group
      lifetime. `closed_members` is an accumulating id list updated at each non-last-member close.
      The last-member detector reads `closed_members` (not the ledger) so a group-barrier invocation
      can safely run while the last member's ledger row is still `in_progress`.
    - **Reconcile-running-set.** The `#437` block in `reconcile-running-set` carries forward group
      survival logic: `lane_group` survives if ≥1 member id is in `survivorIds`; if all members roll
      back, `lane_group` is deleted and the group baseline is dropped.
  - `active-batch.json` — parallel-batch manifest with `state: 'opening'|'open'|'sealed'|'joined'`
    (crash-safe two-phase: written with `opening` before any ledger row flips, then
    promoted to `open`). Reconcilable via the `reconcile` subcommand.
  - `barrier-base-<id>` — per-node baseline commit tree SHA recorded by `--record-base`
    at node-open time. Used by `--barrier-check --node-id <id>` to tree-diff exactly
    that node's own writes. Idempotent (reused on re-entry, never re-snapshotting a
    dirty tree). Dropped by `--drop-base` on rollback/close-direction reconcile.
  - `barrier-open-<id>` — freshness token recording the HEAD SHA at node-open time;
    used to detect `stale:head_advanced` (the worktree advanced between baseline
    recording and the barrier check). Absent on disk → binding check is skipped
    (backward-compatible).
- `kaola-workflow/archive/{project}/` keeps completed, abandoned, or stale
  project folders after finalize or discard.
- **Closure normalization (#324):** when `archiveProjectDir` archives a project with
  `status: closed`, it also normalizes the terminal state so a later audit reading only the
  archive cannot mistake it for an in-flight run: the `## Pending Gates` body is rewritten to
  `- none`, `last_command`/`last_result` become `finalize`/`closed`, any
  `finalization-summary.md` has its pre-sink sentinels (`READY FOR FINAL GIT GATE`,
  `Pending final git gate. …`) neutralized, and the known false-absolute phrase
  (`No files changed after those runs`) in `.cache/final-validation.md` is rewritten to a
  reuse-boundary caveat (#324 AC3 backstop) — all before the folder is renamed into `archive/`. A
  `discard`/`release` archive (non-`closed`) deliberately keeps mid-run state. The accurate
  validation-reuse boundary is stated by the agent per the finalize Validation De-Duplication
  guidance; the archive-time rewrite is only a mechanical backstop for the known phrase.
- **Terminal stamp + closure receipt (#333):** the #324 normalization is extended (and extracted
  into the pure `stampTerminalState` helper) so a `closed` archive is fully terminal. In addition
  to the #324 rewrites, the archived `workflow-state.md` gets `next_command`/`next_skill` rewritten
  to `none (archived)` (an archived run must not advertise an active resume command — an adaptive
  archive would otherwise keep `/kaola-workflow-plan-run {project}` forever); the Planning Evidence
  `plan_hash` refreshed from the FINAL `workflow-plan.md` frozen `<!-- plan_hash: … -->` comment (a
  mid-run re-freeze re-stamps only the plan file, leaving the state on the claim-time hash); and the
  `## Last Updated` line refreshed to the archive timestamp. After the rename, a compact `## Closure`
  block is appended recording `archived_at`, `issue_disposition`, `claim_label_removed`,
  `worktree_removed`, and `closure_invariants` (presence-guarded / idempotent). `issue_disposition`
  enum: `kept-open | close-pending | closed | unknown`. On the `cmdFinalize` lane disposition is
  DECISION-derived — the default merge lane is honestly `close-pending` because the orchestrator
  closes the issue AFTER sink-merge, and `--keep-open` records `kept-open` + `last_result:
  closed_keep_open`; on the `watch-pr`/`watch-mr` MERGED lane it is OBSERVATION-derived via
  `probeIssueState` (a merged PR/MR does not imply a closed issue — `kept-open` when the probe sees
  the issue open, `unknown` when the probe is unavailable). A **manual-archive backstop** in
  `cmdFinalize` heals a state that was archived by a manual `mv`/`git mv` (live folder gone,
  `status: active` in the archive): re-running `finalize` over it stamps it terminal in place and
  reports `archive_state_stamped: repaired` (`not_needed` when already terminal, `failed` on error).
  The keep-worktree commit choreography runs commit-last so the `## Closure` append + backstop
  writes land inside the `chore: archive` commit. NOTE for out-of-repo tooling: a `next_command:
  none (archived)` only ever appears under `kaola-workflow/archive/`; `resume`/`status`/`repair-state`
  read active folders only and never see it.
- Closure of a completed linked issue is governed by explicit invariants and an
  auditable receipt schema. See `docs/api.md` § Closure Contract for the nine
  closure invariants (seven hard-gating + two WARN-FIRST detection invariants added in #277),
  the receipt field/enum schema, and the flow mapping. The closure contract is
  implemented in `scripts/kaola-workflow-closure-contract.js`.

  **Sink-receipt schema extensions (#517, #518):**

  - **`branch_head`** (cycle-identity binding, #518) — the branch-tip SHA stamped into
    `sink-receipt.json` at `loadOrInitReceipt` init time. At load time, a receipt whose
    `branch_head` is absent (pre-#518), does not equal the current branch tip, AND is not
    an ancestor of the current branch tip is treated as a stale prior-cycle receipt and
    reinitialized (emits `stale_sink_receipt`). A receipt whose `branch_head` is an ancestor
    of the current tip belongs to the current cycle and is resumed normally. The #484 ancestry
    backstop (post-step-loop check that the feature branch tip is an ancestor of the default
    branch) is preserved as a defense-in-depth layer. Absent in receipts written before #518;
    conservatively treated as unbound at load time.

  - **`remote_issue_closed: "reopened_after_autoclose"`** (post-push keep-open verification,
    #517) — a new value in the `remote_issue_closed` enum, recorded when `keepIssueOpen` is
    true and a post-`push_main` probe finds the issue was auto-closed by GitHub's commit-keyword
    mechanism, and the workflow successfully reopened it. Distinguishes a corrected auto-close
    event from the nominal `"kept_open"` path (no auto-close interference) and from the failure
    `"failed"` path (reopen attempted but failed). The existing enum values are unchanged:
    `"closed"` (workflow closed it), `"kept_open"` (bypassed and confirmed open),
    `"partial"` (mixed bundle outcome), `"close_pending"` (deferred to sink-merge),
    `"failed"` (close attempted and failed).

## Workflow State Fields

The `workflow-state.md` file contains several key blocks:

- `## Current Position` — Active phase, step, workflow path, runtime, and next command or skill. Key fields:
  - **workflow_path** — Workflow execution path (`full`, `fast`, or `adaptive`). Persisted from the `KAOLA_PATH` environment variable (set `KAOLA_PATH=fast` to request the fast path), or the `--workflow-path` startup flag when supplied; defaults to `full`. `claimProject` whitelists the persisted value: `{fast, full}` when the adaptive switch is OFF, `{fast, full, adaptive}` when ON — any other value (including `adaptive` under an OFF switch) is a **typed refusal**, never a silent downgrade.
  - **runtime** — The runtime that claimed the folder (`claude` or `codex`). Persisted from the `--runtime` startup flag; defaults to `claude`.
- `## Sink` — Issue number, sink mode (merge or pr), branch name, worktree path, and `run_posture` (`worktree` or `in-place`). `run_posture` is derived from the actual worktree resolution at startup via `deriveRunPosture(worktreePath)` in `kaola-workflow-claim.js`; it is never inherited from an environment variable. Adaptive runs always provision a worktree, so `run_posture: worktree` is the normal adaptive value. An optional `issue_action: close | comment_keep_open` line (default `close` when absent, issue #336) marks a keep-open partial-close terminal: the main session writes `comment_keep_open` at the Closure Decision Gate to keep the issue OPEN — `finalize`/`sink-merge` then preserve the roadmap source, comment instead of closing, and refuse a PR/MR sink (keep-open is merge-sink-only).
- `## Lease` — (Legacy, deprecated) Coordination metadata; preserved for backward compatibility
- `delegation_policy:` — Delegation mode for Codex workflows. Defaults to
  `delegate`, established without prompting the user; `local-authorized` is an
  explicit opt-out and `tool-unavailable` is auto-detected, not a user choice:
  - `delegate` — Default. Invoke subagent roles when available (records `subagent-invoked` in compliance ledgers); when role profiles are absent, keep `delegate` and record evidenced `local-fallback-tool-unavailable` rows
  - `local-authorized` — Execute locally; set only when the user explicitly disables delegation (records `local-fallback-explicit`)
  - `tool-unavailable` — Legacy/explicit value for locally-executed runs when subagent tooling is unavailable (records `local-fallback-tool-unavailable`); new runs detect this per-row under `delegate` rather than selecting it at startup

Phase artifacts record delegation decisions in their **Required Agent Compliance** ledgers
using the same four-token vocabulary: `subagent-invoked`, `local-fallback-explicit`,
`local-fallback-tool-unavailable`, or `N/A`. This audit trail documents what authority
was invoked for each delegated task.

When `delegation_policy:` is present, Codex repair-state checks phase compliance
ledgers before crossing a phase boundary. Codex role rows must match the policy:
`delegate` requires `subagent-invoked` unless every role row is an evidenced
`local-fallback-tool-unavailable`; `local-authorized` requires
`local-fallback-explicit`; `tool-unavailable` requires evidenced
`local-fallback-tool-unavailable`. Plain `invoked` remains reserved for
non-Codex-role workflow gates such as advisor review, final validation,
documentation docking, roadmap refresh, archive, and final commit.

**Adaptive `finalize` sink row — `main-session-direct` (issue #338).** The adaptive plan's
mandatory `finalize` DAG sink node is, by the plan-run contract, executed by the main session
directly (no `Agent()` dispatch). Its Required Agent Compliance row therefore carries the status
`main-session-direct` — a sink-node-only token that sits OUTSIDE the four-token delegation
vocabulary above and is NOT delegation-controlled (a `finalize (<node>)` requirement matches none
of repair-state's `DELEGATION_CONTROLLED_REQUIREMENTS`, so the token never trips a delegation
check). It is deliberately NOT `local-fallback-*`: inline sink execution is the designed behavior,
not a fallback. This row is distinct from the Finalization-phase mechanical bookkeeping, which is
delegated to the `contractor` and attested separately via the closure receipt's
`finalize_contractor_attested` field.

## Bundle Project State Fields (issue #328)

On a bundle project, three additive fields are written to `workflow-state.md` alongside the existing `issue_number` field. **Single-issue projects retain only `issue_number` — these fields are absent on non-bundle projects (AC#1 invariant).**

```
issue_number: 42
issue_numbers: 42,47,53
bundle_id: bundle-42-47-53
closure_policy: all_or_nothing
```

- **`issue_number`** — Primary issue (first in the sorted set). Preserved verbatim for all tooling that reads single-issue state (backward-compatible).
- **`issue_numbers`** — Full comma-separated sorted set of issue numbers. Presence of this field identifies the project as a bundle project.
- **`bundle_id`** — Canonical identifier for the bundle: `bundle-<N1>-<N2>-...` (issues in ascending numerical order). Used as the project folder name (`kaola-workflow/bundle-42-47-53/`) and as the branch name stem.
- **`closure_policy`** — Always `all_or_nothing` for v1 bundle projects. Every issue in the set must be closeable before any issue is closed; partial closure is not a success state. Enforced (#369) by `sink-merge` closing every member of `issue_numbers` on the success path and by the `remote-members-closed` closure invariant, which flags (warn-first-but-VISIBLE) any member left unclosed while online — so a partial close trips `closure_invariants.ok = false` rather than reporting a clean success.

### Bundle coherence invariant (issue #430)

`bundle_id` and `issue_numbers` must be mutually consistent at all times:

```
bundle_id == "bundle-" + sorted(issue_numbers).join("-")
```

This invariant is enforced at three independent points:

1. **Claim time (`cmdStartup`)** — a `target_set_mismatch` refusal fires if the `--target-issues` set does not match the persisted `issue_numbers`.
2. **Handoff time (`adaptive-handoff.js runHandoff`)** — a `bundle_state_incoherent` refusal fires if `bundle_id` is present but `issue_numbers` is absent or the derived bundle ID from `issue_numbers` does not match `bundle_id`.
3. **Orient time (`adaptive-node.js orient`)** — the same `bundle_state_incoherent` refusal fires at every plan-run entry.

**Do not hand-edit `issue_numbers` or `bundle_id` independently.** If a repair is needed, update BOTH fields together so the invariant holds, then re-verify at the next startup or orient.

### Bundle project and branch naming

| Artifact | Naming convention |
|----------|------------------|
| Active folder | `kaola-workflow/bundle-42-47-53/` |
| GitHub branch | `workflow/bundle-42-47-53` |
| GitLab branch | `workflow/gitlab-bundle-42-47-53` |
| Gitea branch | `workflow/gitea-bundle-42-47-53` |
| Worktree path | `.kw/worktrees/bundle-42-47-53/` |

The numbers in the bundle identifier are always in ascending sorted order, matching the order in `issue_numbers`.

## Adaptive Path Switch (`enable_adaptive`)

The adaptive path (issue #227) is opt-in at install time, gated by a single
shared switch.

- **Location & default.** A boolean `enable_adaptive` in the existing global store
  `~/.config/kaola-workflow/config.json` (the same file as `parallel_mode`; one
  shared path, no per-edition namespace). **Default OFF** — absent reads as OFF.
- **On-test.** The OFF guarantee rests on the strict `config.enable_adaptive === true`
  test (never `!== false`), so an absent field is falsy → OFF without any reliance on
  a defaults object. Precedence: env `KAOLA_ENABLE_ADAPTIVE` (`1`/`0`) > config
  `enable_adaptive` > default OFF.
- **install.sh** writes the field only on `--enable-adaptive=yes` (a read-modify-write
  merge preserving `parallel_mode`); the default path writes nothing, and a reinstall
  without the flag never revokes an existing `enable_adaptive:true`.
- **Selection-only semantics.** The switch gates **new selection/claim only**, read in
  exactly two logical sites: the router prose (`workflow-next.md` Step 0a-1, which omits
  `adaptive` from the menu when OFF) and `claimProject` (typed refusal on an `adaptive`
  claim when OFF). It is **not** read by `repair-state.js`/`routeAdaptive`, by
  `kaola-workflow-plan-validator.js`, or by the two `claim.js` resume surfaces.
- **Finish-in-flight.** An already-frozen adaptive project (a `workflow-plan.md`
  exists) **resumes to completion even after the switch flips OFF** — re-running
  availability checks on a frozen plan would brick legitimate in-flight work. Both
  `claim.js` resume surfaces (`writeState` next_command default and
  `resumeFallbackCommand`) and `routeAdaptive` recognize `workflow_path: adaptive` and
  emit `/kaola-workflow-plan-run {project}` toggle-agnostically — never
  `/kaola-workflow-phase{N}`.

## Codex Task Mirror (issue #266, AC-C + AC-D)

`kaola-workflow/{project}/workflow-tasks.json` is a **durable artifact** generated
by `kaola-workflow-task-mirror.js` from the frozen `workflow-plan.md`. It is part of
the adaptive-path durable state and must be treated as a generated mirror — never
hand-authored.

**Runtime generation/reconcile (issue #282):** generation is wired into the runtime, not
left to a manual CLI call. The adaptive handoff (`kaola-workflow-adaptive-handoff.js`)
generates the mirror once the plan is frozen, so it exists from the first plan-run entry,
and `kaola-workflow-adaptive-node.js orient` reconciles it on **every** plan-run resume by
shelling the task-mirror CLI (the write lands in that subprocess, so `orient` stays
read-only with respect to the plan/ledger/state). Both are best-effort: a non-frozen plan
degrades silently and the compact-resume hook tolerates an absent mirror.

**Source of truth chain (important):**

The three levels of task state must never be confused:

1. `## Node Ledger` in `workflow-plan.md` — **correctness truth**. The authoritative
   record of node lifecycle state. Scripts and barrier logic read only this.
2. `workflow-tasks.json` — **durable mirror** derived from the `## Node Ledger` (and
   the `## Nodes` table). Generated; regenerated on resume when missing, unparseable,
   or when the stored `source_plan_hash` does not match the current plan hash.
3. Codex UI task list — **ephemeral UI mirror** of `workflow-tasks.json`. It mirrors
   the file; it is **NOT correctness state** and must never be treated as the reverse.
   Writing a task item complete in the UI does not update the `## Node Ledger` and
   confers no workflow guarantees. When the UI task list and `workflow-tasks.json`
   disagree, `workflow-tasks.json` (and by extension the `## Node Ledger`) is
   authoritative.

**When to regenerate:** on plan-run resume, compare the on-disk
`workflow-tasks.json.source_plan_hash` against `readStoredHash` from the current
`workflow-plan.md`. Regenerate when the file is missing, unparseable, or the stored
hash does not match. When the hashes match, regeneration is still idempotent and
cheap (the ledger advances under a fixed `plan_hash`); run it to keep the mirror
current.

**Schema:**

```json
{
  "source_plan_hash": "<64-hex, from the frozen plan_hash>",
  "tasks": [
    { "id": "explore", "role": "code-explorer", "status": "completed", "ledger_status": "complete" }
  ],
  "last_synced_from_ledger": "<ISO timestamp>"
}
```

Field rules:
- `source_plan_hash`: the `plan_hash` from `workflow-plan.md` (`readStoredHash`); absent on an unfrozen plan — the mirror is only meaningful for a frozen plan, and the generator refuses with `{ "status": "plan_not_frozen" }` when the hash is absent.
- `tasks[]`: ordered by `## Nodes` row order. `ledger_status` is the raw value from `## Node Ledger` (`complete`/`in_progress`/`pending`/`n/a`); `status` is the UI-facing mapping: `n/a` ledger → `status:"completed"` (for Codex UI compatibility, the skipped arm still appears completed), all others map one-to-one.
- `last_synced_from_ledger`: the timestamp at which the mirror was last written; injected deterministically in tests via `generateMirror({ planContent, now })`.

See `docs/api.md` § Codex Harness Scripts for the generator CLI and the full `ledger_status → status` mapping table.

## Script-Owned Mechanical Transitions (issues #456 / #457 / #458 / #272)

Every mechanical transition that mutates `workflow-state.md` or a phase file is owned
by a typed transaction script the main session runs directly (ADR 0004) — the
`contractor` subagent is no longer in the per-phase loop. Each writes in crash-safe
order (`.cache`/phase file first, the `workflow-state.md` pointer last), is idempotent
on resume, and preserves any `## Sink` block byte-for-byte.

| Path | Script | Owns |
|------|--------|------|
| Fast | `kaola-workflow-fast-advance.js` (#456) | `.cache`/`fast-summary.md` + `## Status` lifecycle + the fast `step` pointer |
| Full Phase 1/2/3/5 | `kaola-workflow-full-advance.js` (#457) | the per-phase checkpoint + `phase{2,3,5}-*.md` authoring |
| Full Phase 4 | `kaola-workflow-phase4-advance.js` (#458) | `phase4-progress.md` (Tasks / Failure Routing Ledger / compliance rows) + the per-task `step`/`task` pointer |
| Adaptive per-node | `kaola-workflow-adaptive-node.js` (#272) | the `## Node Ledger` per-node lifecycle |
| Finalization (Phase 6) | `contractor` subagent | the archive, roadmap-mirror regen, `chore: finalize` staging commit (SOLE remaining contractor-owned transition) |

The full/Phase-4 scripts author each phase file's `## Required Agent Compliance` table
with RESOLVED rows whose status is `delegation_policy`-aware (a `delegate` project gets
`subagent-invoked`, etc.) and self-validate the rendered file against
`repair-state.unresolvedCompliance(content, stateContent)` before writing, so a phase
file can never advance the pointer into a boundary the resume/finalize router would
reject. The packets handed to these scripts on stdin (the Selected Approach, blueprint,
review verdict, per-task outcome) are transient inputs, not durable state fields. The
#459 contract validators forbid a contractor dispatch from returning to any migrated
surface.

## Generated Mirrors

- `kaola-workflow/ROADMAP.md` is generated from
  `kaola-workflow/.roadmap/issue-*.md`. Treat it as a mirror, not a source.
- Regenerate the mirror after issue state changes, after removing the source file
  for a closed issue, or after creating a new per-issue source file.
- **Single-owner finalize invariant**: during issue finalize, the per-issue source
  removal (`kaola-workflow/.roadmap/issue-N.md`) and `ROADMAP.md` regeneration are
  performed exactly once by `cmdFinalize` / `archiveProjectDir` (Finalization Step 8b).
  The Mechanical-Finalization Step 7 (in `agents/contractor.md`) only stages
  the result with `git add`; it does not re-run the rm or the regenerate.
- `kaola-workflow-roadmap.js generate` must not replace a generated roadmap that
  still lists active issues with `none` solely because `.roadmap/` is missing.
- An **optional** project-local file `kaola-workflow/.roadmap/_rules.md` may carry
  standing project-specific workflow rules. When present and non-empty, `generate`
  (and `validate`, and the GitLab/Gitea `refresh`) appends its contents to the
  `ROADMAP.md` `## Rules` section under a `### Project rules` sub-heading. The `_`
  prefix keeps it out of the `^issue-\d+\.md$` issue-row matcher, so it is never
  read as a roadmap row. When the file is absent or empty the generated output is
  byte-identical to the built-in Rules block (zero behavior change). Because the
  content lives in the project's own committed repo, it survives both regeneration
  and plugin updates — unlike a hand-edit of the generated mirror (wiped on regen)
  or an edit of the shared `RULES_BLOCK` (leaks into every project).

## Legacy Or Transitional State

- `.locks/`, `.sessions/`, `.tickers/`, heartbeat files, lease blocks,
  startup receipts, and session id environment state are legacy coordination
  mechanisms. They may appear in archived historical artifacts only.
- Do not document legacy coordination folders as permanent contract items in
  generated root memory.
- If legacy state appears in an active folder, repair or migrate it toward the
  active-folder contract rather than preserving it as authoritative state.
