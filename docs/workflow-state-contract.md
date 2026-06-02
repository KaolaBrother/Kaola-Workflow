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
  `phase6-summary.md`.
- Fast-path projects use `fast-summary.md` instead of the full Phase 1-5 set.
- Adaptive-path projects (`workflow_path: adaptive`, issue #227) use
  `workflow-plan.md` instead of the full Phase 1-5 set — the frozen DAG is the
  spine. It contains a `## Meta` block (frozen issue `labels:`), a machine-readable
  `## Nodes` table (`| id | role | depends_on | declared_write_set | cardinality | shape |`;
  `shape` ∈ `sequence` / `fanout(<group>)` / `loop(<cap>)`; a single unique
  `finalize` sink), a `## Node Ledger` (`status` ∈ `pending`/`in_progress`/`complete`/`n/a`),
  and a script-computed `plan_hash` (an HTML comment `<!-- plan_hash: <sha256> -->`)
  that **lives inside `workflow-plan.md`** — never in `workflow-state.md`, because
  repair-state runs precisely when `workflow-state.md` is missing. The validator/claim
  scripts (never the agent) compute and re-check it. **Gate compliance rows for
  `code-reviewer`/`security-reviewer` must use the bare role string** (the anchored
  `DELEGATION_CONTROLLED_REQUIREMENTS` matcher), with per-instance disambiguation in
  the Evidence column only. The barrier commit order is `.cache` evidence → Node
  Ledger row → `workflow-state.md` pointer LAST, so a crash mid-node is recoverable.
- `.cache/` files under an active project hold supporting evidence referenced by
  phase artifacts or summaries.
- `kaola-workflow/archive/{project}/` keeps completed, abandoned, or stale
  project folders after finalize or discard.
- Closure of a completed linked issue is governed by explicit invariants and an
  auditable receipt schema. See `docs/api.md` § Closure Contract for the seven
  closure invariants, the receipt field/enum schema, and the flow mapping.

## Workflow State Fields

The `workflow-state.md` file contains several key blocks:

- `## Current Position` — Active phase, step, workflow path, runtime, and next command or skill. Key fields:
  - **workflow_path** — Workflow execution path (`full`, `fast`, or `adaptive`). Persisted from the `KAOLA_PATH` environment variable (set `KAOLA_PATH=fast` to request the fast path), or the `--workflow-path` startup flag when supplied; defaults to `full`. `claimProject` whitelists the persisted value: `{fast, full}` when the adaptive switch is OFF, `{fast, full, adaptive}` when ON — any other value (including `adaptive` under an OFF switch) is a **typed refusal**, never a silent downgrade.
  - **runtime** — The runtime that claimed the folder (`claude` or `codex`). Persisted from the `--runtime` startup flag; defaults to `claude`.
- `## Sink` — Issue number, sink mode (merge or pr), branch name, and worktree path
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

## Generated Mirrors

- `kaola-workflow/ROADMAP.md` is generated from
  `kaola-workflow/.roadmap/issue-*.md`. Treat it as a mirror, not a source.
- Regenerate the mirror after issue state changes, after removing the source file
  for a closed issue, or after creating a new per-issue source file.
- `kaola-workflow-roadmap.js generate` must not replace a generated roadmap that
  still lists active issues with `none` solely because `.roadmap/` is missing.

## Legacy Or Transitional State

- `.locks/`, `.sessions/`, `.tickers/`, heartbeat files, lease blocks,
  startup receipts, and session id environment state are legacy coordination
  mechanisms. They may appear in archived historical artifacts only.
- Do not document legacy coordination folders as permanent contract items in
  generated root memory.
- If legacy state appears in an active folder, repair or migrate it toward the
  active-folder contract rather than preserving it as authoritative state.
