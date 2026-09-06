# Documentation updater evidence for issue #1051

candidate: 715c9f92ebcd660e5c600e7bf1e1e66b278100c9

## First pass (closed mission; result immutable)
README.md, docs/architecture.md, docs/conventions.md, docs/runtime-capabilities.md,
CHANGELOG `[Unreleased]`, ADR 0022/0023 supersession notes. Agent `2731fd2a-f913-4e68-9e1c-ddd9625787c1`.
That result recorded `docs/api.md` unchanged (CLI unchanged).

## Correction (appended mission)
docs/api.md: `/workflow-init` and Project instruction boundary (supplement + scoped exception / host safety;
granted-scope continue; no observed-failure refusal); Compact recovery full claim/run paths, reload Next
without intake/claim, no re-claim of in-flight work; `priority_top_tier_labels` as daily governance
reachable without Next/Finalize, organizing issues does not auto-claim, this repo has no config.json.
CHANGELOG `[Unreleased]` clause that api.md records those conventions. Agent `7cd1b6e5-5a72-479c-b37e-f689535adef7`.
No new CLI flags.

## Unchanged with reason
- docs/README.md: no new ADR file
- producer AGENTS.md: local stricter-constraints fact, not the universal exclusive rule
- scripts/kaola-workflow-global-contract.js comments: no old exclusive wording
- kaola-workflow/config.json: must not exist
