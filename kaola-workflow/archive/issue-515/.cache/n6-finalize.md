evidence-binding: n6-finalize 4cc055e6af25

## n6-finalize (main-session-direct)

compliance: main-session-direct (finalize sink is non-delegable per plan-run contract)

- CHANGELOG.md: added `## [Unreleased]` → `### Fixed` entry for #515 (reciprocal switch-ON path guard; two levers + test-hermeticity fix).
- Finalization bookkeeping (archive, roadmap closure, finalize commit) delegated to the `contractor` per the lean-orchestrator seam contract (#276); the sink (worktree merge) is run main-session-direct.
- 4-chain green independently confirmed by the orchestrator (CLAUDE=0 CODEX=0 GITLAB=0 GITEA=0) against the full n2+n3 diff (#307).
