evidence-binding: n4-docs 8094c744d0f3

## CHANGELOG.md — entry added under new `## [Unreleased]` section

Inserted above `## [6.6.1] - 2026-06-18` (the prior latest release). Subsection: `### Fixed`.

Entry text (verbatim):

> **issue-scout: the scout now ranks candidate issues by roadmap priority/drive-order FIRST — scope-cohesion and actionability operate as within-tier tiebreaks only, so a lower-priority cluster can never displace the active frontier (#524).** Before this fix, the `issue-scout` agent profile scored candidates on cohesion + actionability alone, with no roadmap-priority axis. This caused live mis-rankings (observed on `vrpai-cli`): the scout picked adjacent environment/SDK issues (#82, then #652) over the `#488/#502/#561` epic frontier that the roadmap drives, rationalizing them as "the closest actionable proxy" — a silent substitution that violated the drive-order the `### Project rules` guardrails and master-epic `Next Step` ordering encode. Fix: the scout profiles (`agents/issue-scout.md` + the three `.toml` byte-identical forge ports) now make priority/drive-order the **hard tier** — the scout extracts `### Project rules` guardrails and the per-issue `next_step:` ordering emitted by `kaola-workflow-roadmap.js` as its primary signal; scope-cohesion and actionability rank only *within* that priority tier. A documented `### Project rules` guardrail (e.g. "X must not preempt the correctness frontier Y") is honored as a hard constraint, not a suggestion. When the top-priority frontier issue is genuinely blocked or unverifiable, the scout now says so EXPLICITLY (a "frontier blocked because…" basis statement) and only then falls to the next-priority actionable item — replacing the prior silent actionable-proxy substitution. A new required output field `priority_basis` reconciles the pick against the roadmap (sub-fields: `frontier`, `pick_vs_frontier`, `guardrails_honored`) and is consistent across the `.md` and `.toml` output surfaces. Pure agent-instruction-prose change; no code path. Cross-edition: the scout profile edit propagates to all four editions (the `.toml` ports are byte-identical to the prose blocks governed by them); all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains apply (#307). See `docs/decisions/D-524-01.md`.

## docs/decisions/D-524-01.md — new ADR authored

Path: `docs/decisions/D-524-01.md`

Frontmatter matches the D-5xx ADR format (Date / Status / Issue / Related header block, no YAML fences — same as D-512-01, D-522-01, D-523-01).

Outline:
- **Context** — the cohesion+actionability-only scout objective; the live vrpai-cli mis-ranking (#82 then #652 over #488/#502/#561 frontier) and why the prior model structurally produces it.
- **Decision** — three-tier strict ranking (priority/drive-order hard tier > scope-cohesion > actionability as within-tier tiebreaks); explicit-frontier-blocked-over-silent-proxy rule; new required `priority_basis` output field (frontier / pick_vs_frontier / guardrails_honored); locus = scout profile only, auto surfaces untouched.
- **Alternatives considered** — orchestrator post-scout filter (rejected: retry loop, wrong locus); weighted-sum priority dimension (rejected: can still violate priority under high cohesion+actionability advantage); roadmap generator exclusion-list extension (deferred: guardrails prose already encodes the signal).
- **Consequences** — frontier mis-ranking structurally eliminated; `priority_basis` makes every pick auditable; `### Project rules` guardrails are now machine-honored; cohesion+actionability retained as tiebreaks; pure prose change, four scout surface blast radius only.

## git status --porcelain output

```
 M CHANGELOG.md
 M agents/issue-scout.md
 M plugins/kaola-workflow-gitea/agents/issue-scout.toml
 M plugins/kaola-workflow-gitlab/agents/issue-scout.toml
 M plugins/kaola-workflow/agents/issue-scout.toml
?? docs/decisions/D-524-01.md
?? kaola-workflow/issue-524/
```

n4-docs declared write set: `CHANGELOG.md` (M) and `docs/decisions/D-524-01.md` (?? new untracked).
The `agents/issue-scout.md` and three `.toml` ports are prior-node work (n2-scout-impl, n3-review) — not touched by n4-docs.
`kaola-workflow/issue-524/` is the exempt evidence dir.
Scope confirmed clean.
