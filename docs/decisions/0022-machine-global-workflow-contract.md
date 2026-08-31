# ADR 0022 — Machine-global workflow contract

Status: Accepted; project-instruction migration clauses superseded by ADR 0023

## Context

The same universal workflow prose was copied into every project `AGENTS.md`, while compact-risk
runtimes also carried recovery prose. A fresh measurement found 5,404 B of project-global behavior
before runtime recovery was counted. Cursor and Grok could compact, but their useful carrier is a
persistent Rule rather than hook stdout; Claude and Codex can inject static text after compact.
OpenCode, Kimi, and ZCode have no measured need for a productized compact lifecycle in this scope.

Per-tool injection was the wrong unit: it repeatedly spends context, starts subprocesses, and does
not specifically bind recovery to compact. Inference-time JavaScript was also unnecessary; the
runtime and carrier are already known at installation.

## Decision

1. Author universal behavior once in `templates/global/kaola-workflow-global.md`.
2. Declare the nine real host surfaces in `runtime-contract-adapters.json`. An adapter may specify
   only measured discovery, carrier, precedence, reload, and compatibility reads.
3. Render and install native carriers only in `kaola-workflow-global-contract.js`. Local install is
   one batch-preflighted transaction; Cursor Cloud is an explicit selected-repository transaction.
4. `workflow-init` consumes the runtime-loaded contract and never locates or executes installation
   internals. If that authority is absent or inconsistent, it preserves project rules and routes a
   separate release-tree installation check.
5. Preserve every active run and owner-authored project instruction unchanged unless the Agent has
   an evidence-backed reason and owner authorization to edit it.
6. Keep the dispatch contract mandatory. V2 compact text contains the global contract, a thin
   durable-state router, the complete dispatch contract, and the measured runtime adapter.
7. After compact, reread `AGENTS.md`, `workflow-state.md`, and `mission-list.md`, then completely
   reload installed Workflow Next or Finalization. V2 never substitutes for either operation.
8. Claude/Codex use one static `SessionStart(source=compact)` carrier. Grok/Cursor use one
   persistent Rule. Their edition installers retire the former duplicate Rule. No PreToolUse,
   PostToolUse, Stop, parser, sidecar, or inference-time JavaScript belongs to recovery.

## Transaction invariants

- Whole-batch preflight precedes the first local write.
- Cursor CLI/App may share one physical carrier only when group and rendered bytes agree.
- Managed-region carriers preserve surrounding owner bytes; dedicated carriers refuse foreign
  bytes. Symlinks and non-regular paths fail before mutation.
- Receipt rows bind source, registry, render, install, candidate, and target. Uninstall re-derives
  target paths from the current registry and removes only unchanged owned bytes.
- Local installation reports Cursor Cloud as `REMOTE_REQUIRED`; it never guesses remote state.

## Consequences

Universal maintenance becomes one edit plus adapter rendering. New projects are smaller, and
ordinary tool use adds zero recovery bytes and starts zero recovery subprocesses. Compact-capable
runtimes recover the complete operation rather than a summary of it. Runtime-specific carrier files
remain separate generated artifacts, which is intentional: measured differences are adapter data,
not duplicated behavioral authority.

The installer transaction is more important than any individual edition install, so
`install-all.sh --check` now requires the global receipt to be current before reporting the edition
commands. A standalone edition installer does not impersonate that transaction.

## Rejected alternatives

- **Pre/post tool hooks:** spend context on every tool and do not target compact.
- **A JavaScript prompt composer after compact:** adds executable inference-time machinery for a
  decision already known at install time.
- **One physical file shared by every vendor:** ignores native carrier and reload differences.
- **A short recovery summary:** can leave the full Workflow Next or Finalization prompt absent.
- **Optional dispatch recovery:** an agent cannot be expected to discover a contract it does not
  know it needs to read.

## Supersession note

ADR 0023 superseded the original project-contract writer and exact-template migration parts of
decisions 4–5; their wording above reflects the active boundary. The Agent maintains repository
instructions from verified facts with owner authorization before rewriting existing content. The
machine-global transaction and compact-recovery design remain active.
