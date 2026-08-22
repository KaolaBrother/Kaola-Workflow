# Issue #1012 documentation docking evidence

## Scope

Documentation was reconciled in the issue worktree at
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1012`. The initial
write set was `docs/grok-edition.md`, `docs/architecture.md`, `CHANGELOG.md`, and
this evidence file; follow-up scope added the Grok summaries in `docs/README.md`
and `README.md`, then added the observed Grok CLI 1.0.5 limitation note to
`docs/grok-edition.md` and `CHANGELOG.md`. The mission list, production code,
tests, and generated trees were not edited by this documentation pass.

## Updated files

- `docs/grok-edition.md`: replaced the obsolete one-tier/inherited-effort
  description. The guide now records that generated agents retain `model: inherit`,
  canonical standard (`sonnet` / `standard`) classes emit `effort: medium`, and
  reasoning (`opus` / `reasoning`) classes emit `effort: high`. It also records that
  effort is frontmatter-owned, command cards continue to omit `model=`, the user
  Grok config is not rewritten, and the `GROK_RUNTIME_NATIVE.tiered_effort_pin`
  declaration covers the shipped effort binding while model inheritance is
  asserted independently. It now also records the live Grok CLI
  1.0.5 limitation: actual `tdd-guide`/`code-reviewer` close probes passed at
  medium/high from an xhigh parent, while three literal `implementer` A/B legs
  recorded high despite medium native/inline definitions. This is explicitly an
  observed runtime limitation/inference, not a generator failure.
- `docs/architecture.md`: changed only the Grok cell in the **model & tier
  handling** row to the `partial` tier label plus the pointer
  `docs/grok-edition.md` § **Two effort tiers**. The architecture table does not
  restate the Grok mechanism.
- `CHANGELOG.md`: added a concise #1012 entry under a new `[Unreleased]` / `Changed`
  section, covering the medium/high effort pins, inherited model, omitted command
  card model, and unchanged additive/vendor-neutral boundary; the entry now also
  records the live runtime limitation and its source-backed inference.
- `docs/README.md`: replaced the Grok runtime index's stale “inherit-only model and
  effort” summary with the session-inherited model plus standard/reasoning
  `medium`/`high` effort tiers.
- `README.md`: updated the four Grok summaries (overview, role model note, runtime
  overview, and install section) to describe the inherited model and canonical
  standard/reasoning `medium`/`high` effort tiers. Cursor's inherited-effort wording
  remains unchanged.

## Observed runtime-limitation follow-up

Source report: `kaola-workflow/issue-1012/.cache/live-grok.md`.

- Grok CLI 1.0.5 live close evidence passed for the actual `tdd-guide` at
  `medium` and `code-reviewer` at `high` from an `xhigh` parent, with the
  inherited model retained.
- Three A/B legs using the literal `implementer` name recorded `high` even when
  its native profile or a minimal inline definition carried `model: inherit` and
  `effort: medium`. The generator still emits `effort: medium` correctly; this is
  recorded as a runtime limitation/inference, not a generator failure.
- No config seeding, per-call model override, or second effort-pin path was added.

## Deliberately skipped surfaces

- `docs/api.md` was not changed: this subtask changes no API contract or CLI shape.
- `CLAUDE.md`, canonical `agents/`, canonical `commands/`, and routing templates
  were intentionally untouched. They must remain vendor-neutral; no Grok model
  slug was added to those consumer-facing prompt surfaces.
- Generated `.grok/` trees were intentionally not regenerated here; that belongs to
  the generator owner and remains a required close-time check after production work
  lands.

## Validation run

All commands below ran from the issue worktree unless stated otherwise.

- `git diff --check` — PASS (exit 0).
- `rg -n -i 'grok-[0-9]' CLAUDE.md agents commands templates` — PASS: no matches
  (exit 1 is the expected no-match result), so canonical prompt surfaces contain no
  Grok vendor slug.
- `rg -n -e 'Grok and Cursor inherit the session model and effort' -e 'On Grok and Cursor the' -e 'grok Edition.*inherit-only model and effort' -e 'There is \*\*no Reasoning/Standard two-tier mapping\*\*' -e '\.grok/agents/\*\.md.*Every subagent inherits the session model and effort' -e 'Grok-native way:.*Every subagent \*\*inherits the session model and effort\*\*' docs/grok-edition.md docs/architecture.md docs/README.md README.md CHANGELOG.md` — PASS: no obsolete
  inherited-effort wording matched (exit 1, expected no-match result).
- `git diff --name-only -- docs/grok-edition.md docs/architecture.md docs/README.md README.md CHANGELOG.md`
  — PASS: exactly the five assigned tracked documentation files.
- `git diff --stat -- docs/grok-edition.md docs/architecture.md docs/README.md README.md CHANGELOG.md` — PASS:
  35 insertions and 19 deletions across the five assigned docs.
- Follow-up `git diff --check` — PASS (exit 0) after the runtime-limitation note.
- Follow-up stale-prose sweep — PASS: the targeted Grok inherited-effort phrases
  returned no matches (exit 1, expected no-match result) across `docs/grok-edition.md`,
  `docs/architecture.md`, `docs/README.md`, `README.md`, and `CHANGELOG.md`.
- `test -f kaola-workflow/issue-1012/.cache/live-grok.md` — PASS: the exact source
  report is present.
- Follow-up `rg -n -i 'grok-[0-9]' CLAUDE.md agents commands templates` — PASS: no
  canonical Grok vendor slug matches (exit 1, expected no-match result).
- `git diff --name-only -- docs/grok-edition.md CHANGELOG.md` — PASS: the follow-up
  changed only the two assigned tracked docs.
- `git diff --stat -- docs/grok-edition.md CHANGELOG.md` — PASS: current scoped totals
  are 44 insertions and 15 deletions.
- Final contract-reference correction: the requested stale declaration-name scan
  over `docs/grok-edition.md` and the same scan over this evidence report — PASS:
  no stale current-contract reference matched (exit 1, expected no-match result).
- Final `rg -n 'tiered_effort_pin'` confirms the current declaration name in the
  Grok guide and this report; final `git diff --check` — PASS (exit 0).

`node scripts/test-grok-edition.js` was not claimed as documentation validation:
the suite and generator are owned by the parallel test/implementation missions,
and the generated tree was deliberately left untouched. At report time the shared
worktree also contained independent `scripts/sync-grok-edition.js` and
`scripts/test-grok-edition.js` edits from the implementation/test owners; both were
preserved and not included in this documentation diff.

## Remaining documentation risks

Generated `.grok/agents/` output and the edition suite must still be refreshed and
passed by the implementation/test owners; this report does not claim that
production behavior or generated parity is complete. The `implementer` discrepancy
is retained as a Grok CLI 1.0.5 runtime limitation/inference from the cited A/B
report; no documentation workaround or second pin path was introduced.
