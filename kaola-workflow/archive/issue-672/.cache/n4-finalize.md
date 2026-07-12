evidence-binding: n4-finalize 03427229d7ca

# n4-finalize — issue-672 sink

## docs_updated
CHANGELOG.md — one `[Unreleased]` `### Fixed` entry for #672: two porcelain-probe fail-opens made
fail-CLOSED — `synthesizeLevel` leg-drop now loudly refuses (`leg_dirty_probe_failed`) and
`worktreeDirtyState` gained a distinct `'unprobeable'` state kept by both sweep consumers. Docs/state
only — no code writes on the sink.

## no-impact classes
No public interface, env var, CLI flag, or architecture changed → no `docs/api.md`, README,
`.env.example`, or ADR update. The new `leg_dirty_probe_failed` reason and `'unprobeable'` state are
internal.

## four-chain precondition
Cross-edition diff (adaptive-node GENERATED aggregator ×4 + claim COMMON+divergent forge ports) →
Finalization requires all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green,
recorded via the run-chains receipt before the sink.

## run gaps
The adversary surfaced two out-of-scope residuals in the SAME cleanup surface but a DIFFERENT family
(not the porcelain probe #672 fixed): A2 — the `existsSync` stat path still fails open (a chmod-000
parent routes an existing worktree to `'missing'` → registry+branch prune, content-safe); A1 — the
`cmdStaleWorktreeCleanup` `'unprobeable'` keep is behavior-verified (review code-read + adversary
live-repro) but has no shipped regression test. Both filed together as follow-up #677 and mapped in
`finalization-summary.md` `## Run gaps` as `manual:sweep-consumer-residuals`, `filed: #677`.
