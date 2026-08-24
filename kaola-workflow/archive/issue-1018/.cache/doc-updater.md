# Documentation docking evidence — Issue #1018 / PR #1019

## Scope and source of truth

- Repository worktree: `/Users/ylpromax5/.codex/worktrees/Kaola-Workflow/issue-1018-pr-review`
- Candidate reviewed: `f36fab89` (PR #1019 branch)
- Comparison base: `origin/main` at `ed7e35c9`
- Documentation status wording: the three-tier implementation is present on this branch and pending merge to `main`; no documentation claims that it is already on `main`.
- Runtime ladder reconciled against the current routing skeletons and Issue #1018 evidence: Codex standard `gpt-5.6-luna/max`, reasoning `gpt-5.6-sol/medium`, heavy `gpt-5.6-sol/high`; Grok and Cursor standard/reasoning/heavy map to medium/high/xhigh.

## Documentation files updated

- `README.md` — synchronized the three-tier runtime summaries, role/runtime sections, and Codex configuration notes; documented planner/code-architect as canonical heavy roles, Claude reviewer resting `opus` with one bounded command-runtime `fable` escalation, reviewer surface/acceptance packets, and generated additive-runtime omission of dynamic escalation.
- `docs/README.md` — synchronized the edition index and added the ADR 0019 pointer with the shipped-candidate/pending-merge status and per-runtime mapping notes.
- `docs/grok-edition.md` — documented medium/high/xhigh frontmatter tiers, heavy `xhigh`, and the live #1018 probe result; recorded the generated-runtime escalation limitation accurately.
- `docs/cursor-edition.md` — documented raw bracket-effort medium/high/xhigh pins and heavy `xhigh`; recorded model-free Task dispatch and the generated-runtime escalation limitation.
- `docs/kimi-edition.md` — clarified that Kimi inherits the session model rather than exposing a per-dispatch three-tier effort mapping, including the heavy marker and generated-runtime scope/acceptance behavior.
- `docs/opencode-edition.md` — clarified that the canonical fable/heavy class is classified with reasoning for optional OpenCode model pinning, including planner/code-architect, with no separate heavy effort pin.
- `docs/architecture.md` — synchronized the capability matrix, Codex model table, heavy roster, reviewer carve-out, and edition pointers.
- `docs/api.md` — documented the live three Codex model/effort pairs, heavy roles, bounded reviewer escalation, and reviewer dispatch packet contract.
- `docs/conventions.md` — updated the three-pair routing convention and reviewer scope/acceptance plus Claude/additive-runtime rules.
- `docs/decisions/0019-the-heavy-reasoning-tier.md` — changed the status from former two-tier/unshipped wording to implementation present on this branch and pending merge to `main`; closed the Grok xhigh probe cell with the live cache evidence while preserving historical context.
- `CHANGELOG.md` — updated only the `[Unreleased]` heavy-tier entry; prior release entries remain historical and unchanged.

## Deliberately skipped

- `docs/adr/0019-heavy-reasoning-tier.md` — this path does not exist in the repository; the actual ADR is `docs/decisions/0019-the-heavy-reasoning-tier.md` and was updated.
- Production code, tests, generated command/runtime files, and existing dirty implementation edits — outside documentation ownership and preserved for the implementer/TDD agent.
- Historical ADR wording and old changelog entries — intentionally retained per the task; only current/Unreleased documentation was reconciled.
- Other docs without a behavior, API, setup, architecture, environment, roadmap, or user-facing workflow change evidenced by this review — not edited.

## Checks run

- `git diff --check` — exit 0, no whitespace errors.
- `git diff --check origin/main...HEAD` — exit 0, no whitespace errors in the committed PR diff.
- Current-surface stale-claim search for `Two effort tiers`, unverified Grok xhigh, and “nothing here is shipped yet” across the edition docs and ADR — exit 1 with no matches (expected clean result).
- Current-surface stale model-phrase search for two-tier/medium-high-only wording across the owned docs — exit 1 with no matches after excluding intentional historical context (expected clean result).
- Required Codex pair search — exit 0; found standard Luna/max, reasoning Sol/medium, and heavy Sol/high in the owned overview/API/architecture/conventions/ADR/Unreleased surfaces.
- Required Grok/Cursor/additive mapping search — exit 0; found medium/high/xhigh and fable-reasoning/additive-runtime notes in the relevant owned docs.
- Reviewer surface/acceptance and bounded-escalation search — exit 0; found the reviewer packet and Claude/additive-runtime notes across the relevant owned docs.

## Remaining documentation risks

- Full runtime suites and final PR/merge validation were not run by the doc-updater; those remain with the implementation/review workflow.
- The branch is still pending merge to `main`; the Grok xhigh result is the Issue #1018 candidate cache evidence, not a claim about the default branch.
- Generated additive command/runtime trees may be regenerated by implementation work; if their final behavior changes, recheck the documented dynamic-escalation limitation.
- Older changelog entries intentionally retain their historical two-tier values and should not be interpreted as the current routing contract.

## Result

Documentation changes and this evidence record are present in the worktree. No commit, push, merge, or finalization was performed.
