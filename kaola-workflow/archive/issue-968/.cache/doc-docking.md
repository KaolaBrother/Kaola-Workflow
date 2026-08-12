# doc-docking — issue #968

## Changed files reviewed (29, `git diff --stat` in `.kw/worktrees/issue-968`)

1. `CHANGELOG.md` — the record itself (see below)
2. `CLAUDE.md`
3. `README.md`
4. `commands/kaola-workflow-finalize.md` (rendered)
5. `commands/workflow-init.md` (rendered)
6. `commands/workflow-next.md` (rendered)
7. `docs/architecture.md`
8. `docs/decisions/0017-the-mission-list.md`
9. `docs/workflow-state-contract.md`
10-24. `plugins/kaola-workflow-{gitea,gitlab}/{commands,skills}/*` and
   `plugins/kaola-workflow/skills/*` (15 rendered surfaces across finalize/init/next ×3 forges +
   the github-codex SKILL trio)
25. `scripts/test-bundle-claim.js` (comment-only)
26. `templates/routing/finalize.skeleton.md` (authoring source)
27. `templates/routing/init.skeleton.md` (authoring source)
28. `templates/routing/next.skeleton.md` (authoring source)
29. `templates/routing/slots.js` (authoring source — `nx-claim-run`, `fz-issue-closure`)

## Documents checked

`README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/api.md`, `docs/conventions.md`,
`docs/workflow-state-contract.md`, `docs/decisions/0017-the-mission-list.md`, `docs/README.md`,
`docs/opencode-edition.md`, `docs/kimi-edition.md`, `docs/agents-source.md`, `agents/*.md` (14
role profiles), `.env.example`, `kaola-workflow/ROADMAP.md` / `.roadmap/issue-968.md`,
`CHANGELOG.md`, and the issue's own `next_step:` proposal text.

## Gaps found and fixed

- `.env.example:37-38` restated the retired "per-issue repo-local worktree" framing that
  `README.md`'s "Per-issue Git worktrees" → "Per-claim Git worktrees" section retitled. Fixed —
  see `.cache/doc-updater.md` for the full before/after and the verification (18/18 surfaces
  byte-match via `--check`, no trailing whitespace, no banned tokens).

No other gap found. Full detail, including everything checked and found already clean, is in
`.cache/doc-updater.md`; this file is the docking verdict, not a duplicate of that audit.

## No-impact reasons (real, checked — not asserted)

- `docs/api.md`, `docs/conventions.md`, `docs/README.md`, `docs/opencode-edition.md`,
  `docs/kimi-edition.md`, `docs/agents-source.md`, `agents/*.md` — grepped for the shape/admission
  vocabulary the change touches (`bundle`, `per-issue`, `same-scope`, `coherent scope`, `which
  issue`, `one issue`, `target-issue`); every hit in `api.md`/`conventions.md` is mechanical
  (exit codes, field shapes, cross-edition test obligations) and none of the other five files
  mentions issue-count or bundle admission at all. No-impact because these surfaces never encoded
  the retired rule in the first place, verified by absence rather than assumed from the issue
  category.
- `docs/decisions/D-*.md` (other than 0017) and `docs/investigations/*.md` — historical records
  describing the #328-era design as shipped at the time; several correctly use "same-scope" in
  that historical sense. No-impact because these are the CHANGELOG-history class of doc, which the
  project convention never rewrites to match a later rule (ADR 0017 itself states the older ADRs
  "remain accurate as history").
- `kaola-workflow/ROADMAP.md`, `kaola-workflow/.roadmap/issue-968.md` — quote the *old* rule as
  #968's own problem statement, not a live claim; generated/durable state the CLAUDE.md contract
  forbids hand-editing, and the source is removed at this issue's own closure regardless.
- `commands/*.md`, `plugins/*/commands/*.md`, `plugins/*/skills/*/SKILL.md` — no independent
  review needed; verified byte-identical to the regenerated skeletons via
  `generate-routing-surfaces.js --check` (18/18), so their content is the skeleton content already
  docked above.
- `scripts/test-bundle-claim.js` — comment-only (`git diff` confirms only `//` lines changed); the
  test it documents is unaffected because no script logic changed anywhere in this diff.
- No script (`scripts/kaola-workflow-claim.js` or any of its editions) appears in the 29-file diff,
  matching the issue statement and the CHANGELOG's own "No script changed" line — confirmed by
  absence in `git diff --stat`, not assumed from the CHANGELOG text.
- `CHANGELOG.md`'s own quantitative claims were spot-verified rather than trusted: "renders to 18
  tracked surfaces" ⇔ `generate-routing-surfaces.js --check` → `all 18 surfaces byte-match`; "four
  hand-maintained places" in `README.md` ⇔ exactly four occurrences of "three to five" found
  (`README.md:132`, `:884`, `:1179`, `:1301`); `BUNDLE_SIZE_ADVISORY` untouched at
  `scripts/kaola-workflow-claim.js:1907`, still `= 8`.

## Flagged, not touched (out of my scope as doc-updater)

- The issue's own `next_step:` proposal (`kaola-workflow/.roadmap/issue-968.md`) opens with
  **"ANSWER THE VALUE CALL FIRST — item 2 partially reverses 328's stated same-scope intent and is
  a judgement about what a run is, not a fact settleable from the tree."** This is a First
  Principle 4 (machines decide facts; humans decide values) flag the issue filed against itself.
  Whether the user was consulted on that value call before this bundle-width change was
  implemented is a fact about the run's conversation history that I have no way to check from the
  tree, and it is the Closure Decision Gate's concern, not documentation docking's. I am not
  treating it as a docking gap, but flagging it for the team lead to confirm before closure.
- The issue's proposal listed a fourth prose item, "filing follow-ups as independent slices to
  keep the next bundle wide" — I could not find this phrase or an equivalent instruction rendered
  anywhere in the shipped diff. It reads as forward-looking working practice (how *future* issues
  should be filed) rather than a mechanism needing its own documented artifact, so I am listing it
  rather than treating it as a doc gap — the team lead should confirm whether it was meant to land
  as prose somewhere or was intentionally left as practice guidance.

## Verdict

DOCKED
