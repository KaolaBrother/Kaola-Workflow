# doc-updater — issue-153 (agent ab84cf43885293659, model=haiku, 2026-05-22)

## Files edited
- README.md (after the agent-model table, ~lines 114-120): added a paragraph explaining installed agent
  frontmatter is rewritten to `inherit`, command files render concrete model into Agent(...) calls, the badge
  renders only when concrete model= differs from frontmatter, and a reinstall + Claude Code restart is needed.
- CHANGELOG.md ([Unreleased] ### Added, before the #152 entry): full issue #153 entry — installed frontmatter
  → inherit so every dispatch badges; profiles preserved; reinstall + restart required; new
  assertEveryDispatchHasModel guard across all 3 forge validators preventing a dropped model= (which would
  silently run on parent/Opus).

## No-impact (with reasons)
- docs/architecture.md: does not document agent-model resolution / install flow (focuses on Phase 6 sink).
- docs/api.md: does not document the installer's model resolution contract (Sink API / env / roadmap).
- .env.example: no new env vars introduced.
- Inline comments: install.sh helpers self-explanatory; F1 ordering invariant captured in workflow artifacts +
  enforced by test; no over-commenting.

## Orchestrator verification: both diffs inspected — accurate, well-placed, match existing style.
