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
  phase artifacts or summaries. `.cache/dispatch-log.jsonl` is written by the
  `kaola-workflow-subagent-dispatch-log.sh` SubagentStart hook; each line is a
  JSON object recording a subagent spawn (`ts`, `agent_type`, `agent_id`, `cwd`).
  This file is used by `checkDispatchAttestations` at closure time for WARN-FIRST
  subagent-seam attestation (see `docs/api.md` § Closure Contract).
- `kaola-workflow/archive/{project}/` keeps completed, abandoned, or stale
  project folders after finalize or discard.
- Closure of a completed linked issue is governed by explicit invariants and an
  auditable receipt schema. See `docs/api.md` § Closure Contract for the nine
  closure invariants (seven hard-gating + two WARN-FIRST detection invariants added in #277),
  the receipt field/enum schema, and the flow mapping. The closure contract is
  implemented in `scripts/kaola-workflow-closure-contract.js`.

## Workflow State Fields

The `workflow-state.md` file contains several key blocks:

- `## Current Position` — Active phase, step, workflow path, runtime, and next command or skill. Key fields:
  - **workflow_path** — Workflow execution path (`full`, `fast`, or `adaptive`). Persisted from the `KAOLA_PATH` environment variable (set `KAOLA_PATH=fast` to request the fast path), or the `--workflow-path` startup flag when supplied; defaults to `full`. `claimProject` whitelists the persisted value: `{fast, full}` when the adaptive switch is OFF, `{fast, full, adaptive}` when ON — any other value (including `adaptive` under an OFF switch) is a **typed refusal**, never a silent downgrade.
  - **runtime** — The runtime that claimed the folder (`claude` or `codex`). Persisted from the `--runtime` startup flag; defaults to `claude`.
- `## Sink` — Issue number, sink mode (merge or pr), branch name, worktree path, and `run_posture` (`worktree` or `in-place`). `run_posture` is derived from the actual worktree resolution at startup via `deriveRunPosture(worktreePath)` in `kaola-workflow-claim.js`; it is never inherited from an environment variable. Adaptive runs always provision a worktree, so `run_posture: worktree` is the normal adaptive value.
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
