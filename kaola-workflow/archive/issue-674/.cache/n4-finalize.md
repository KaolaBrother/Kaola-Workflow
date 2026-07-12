evidence-binding: n4-finalize e9ba16448809

# n4-finalize — issue-674 sink

## docs_updated
CHANGELOG.md — one `[Unreleased]` `### Fixed` entry for #674: open-ready lane-group provisioning
`git add -f`'s the enumerated stubs (no serial-degrade on a gitignored `.cache/`) and drops recorded
member baselines on every group-form abort (no stale-baseline `write_set_overflow` misattribution).
Docs/state only — no code writes on the sink.

## no-impact classes
No public interface, env var, CLI flag, or architecture changed → no `docs/api.md`, README,
`.env.example`, or ADR update. Internal scheduler/baseline plumbing only.

## four-chain precondition
Cross-edition diff (adaptive-node GENERATED aggregator ×4) → Finalization requires all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green, recorded via the run-chains
receipt before the sink.

## run gaps
The adversary + review surfaced two out-of-scope residuals in the SAME open-ready baseline lifecycle:
R1 (low) — the GROUP baseline strands on the same 5 group-form aborts where #674 now drops MEMBER
baselines (the missing symmetric half; harm bounded — reconcile drops it when the descriptor persisted);
R2 (low, pre-existing) — a SIGKILL hard-crash window before the Phase-1 journal write strands baselines,
unreachable via any refusal return. Both filed together as follow-up #678 and mapped in
`finalization-summary.md` `## Run gaps` as `manual:open-ready-baseline-lifecycle-residuals`, `filed: #678`.
