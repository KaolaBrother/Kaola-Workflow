# Documentation docking — Issue #1018 / PR #1019

verdict: DOCKED

## Change-to-document map

| Changed behavior or contract | Required dock | Result |
|---|---|---|
| Canonical standard/reasoning/heavy axis and planner-class heavy roster | README, docs index, architecture, API, conventions, ADR 0019, Unreleased changelog | Docked |
| Codex live pairs: Luna/max, Sol/medium, Sol/high | README, architecture, API, conventions, ADR 0019, Unreleased changelog | Docked |
| Grok and Cursor medium/high/xhigh bindings | README, docs index, Grok guide, Cursor guide, architecture, ADR 0019, Unreleased changelog | Docked |
| OpenCode classifies fable with reasoning; Kimi remains session-inherited | Docs index, OpenCode guide, Kimi guide, architecture, ADR 0019, Unreleased changelog | Docked |
| Claude reviewers rest on opus and have one bounded fable re-dispatch; every reviewer dispatch states surface and acceptance | README, architecture, API, conventions, ADR 0019, Unreleased changelog | Docked |
| Generated additive runtimes omit Claude's dynamic reviewer escalation | README and all four additive runtime guides plus architecture/API/conventions | Docked |
| Live Grok planner xhigh child proof | Grok guide and ADR 0019 | Docked to `.cache/live-grok.md` without claiming mainline publication |

## Repository documentation checklist

- `README.md`: updated overview, role/runtime summaries, installation sections, and reviewer routing.
- `docs/api.md`: updated live three-pair dispatch contract and bounded reviewer exception.
- `CHANGELOG.md`: updated only `[Unreleased]`; historical release entries preserved.
- `docs/architecture.md`: updated runtime capability matrix and live Codex routing table.
- `docs/README.md`, `docs/conventions.md`, and the four current additive runtime guides: updated where the changed contract is consumed.
- `docs/decisions/0019-the-heavy-reasoning-tier.md`: candidate status and Grok live-probe cell updated; no unrelated historical ADR rewritten.
- Inline production/test comments that claimed only standard/reasoning classes: updated under their respective implementation and test custody.

## Explicit no-change surfaces

- Public API schema: no structural schema or envelope change; only dispatch-contract documentation changed.
- Environment variables and installation commands: no new variable or command introduced.
- Roadmap and issue topology: no roadmap artifact changed or recreated; Issue #1018 remains the sole delivery owner until sink.
- Dependencies, authentication, network behavior, secrets, and deployment: unchanged.

## Verification

- `git diff --check`: passed after all documentation and comment edits.
- Stale current-surface searches for two-tier Grok/Cursor wording, unverified Grok xhigh, and unshipped ADR status: no matches.
- Mapping audit: Codex current surfaces say Luna/max, Sol/medium, Sol/high; Grok/Cursor current surfaces say medium/high/xhigh.

Documentation docking is complete for the current candidate. Final suite and sink evidence are recorded separately.
