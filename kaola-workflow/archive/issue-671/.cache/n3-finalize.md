evidence-binding: n3-finalize b466f3d5314c

# n3-finalize — issue-671 sink

## docs_updated
CHANGELOG.md — added one `[Unreleased]` `### Fixed` entry for #671: the task-mirror write fault now
emits a one-line `mirror_write_failed` envelope instead of a raw multi-line stack trace, fail-open in the
invoker preserved. Docs/state only — no code writes on the sink.

## no-impact classes
No public interface, env var, CLI flag, API, or architecture changed → no `docs/api.md`, README,
`.env.example`, or ADR update. The new `mirror_write_failed` reason is an internal task-mirror emit
consumed fail-open by `refreshTaskMirror` (unchanged).

## four-chain precondition
Cross-edition diff (touches the four `kaola-workflow-task-mirror.js` editions incl. the gitlab/gitea
forge ports) → Finalization requires all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`
chains green, recorded via the run-chains receipt before the sink.

## run gaps
None. No deferred reviewer finding (n2 verdict pass, 0 blocking), no adversary node, no in-run repair,
no deferred/red chain — the gap sweep is empty (`## Run gaps` section omitted from the summary per the
finalize template).
