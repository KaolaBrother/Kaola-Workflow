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
  - **workflow_path** — Workflow execution path (`full` or `fast`). Persisted from the `--path` startup flag.
  - **runtime** — The runtime that claimed the folder (`claude` or `codex`). Persisted from the `--runtime` startup flag; defaults to `claude`.
- `## Sink` — Issue number, sink mode (merge or pr), branch name, and worktree path
- `## Lease` — (Legacy, deprecated) Coordination metadata; preserved for backward compatibility
- `delegation_policy:` — User-authorized delegation mode for Codex workflows:
  - `delegate` — Invoke subagent roles when available (records `subagent-invoked` in compliance ledgers)
  - `local-authorized` — Execute locally with explicit user authorization (records `local-fallback-explicit`)
  - `tool-unavailable` — Subagent tooling unavailable; execute locally (records `local-fallback-tool-unavailable`)

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
