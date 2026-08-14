# Documentation docking — bundle-976-977-978

## Verdict: DOCKED

## Changed files reviewed

Production: `install.sh`, `install-opencode.sh`, `install-kimi.sh`, `uninstall.sh`,
`scripts/kaola-workflow-adaptive-schema.js` (+3 edition copies),
`scripts/kaola-workflow-validation-runner.js` (+3 edition copies),
`scripts/kaola-workflow-sink-merge.js` (+3 edition copies).
Tests: `test-sink-merge.js`, `test-kimi-edition.js`, `test-opencode-edition.js`,
`test-install-upgrade-rewrite.js`, `test-install-adaptive-config.js`,
`test-relative-tmpdir-escape.js` (new), six `simulate-*walkthrough.js` entry points, `package.json`.
Roadmap: `.roadmap/issue-97{6,7,8}.md` (removed at closure), `.roadmap/issue-98{0,1,2,3}.md` and
`issue-979.md` (new follow-ups), `ROADMAP.md` mirror.

## Documents checked

`README.md` · `CHANGELOG.md` · `docs/api.md` · `docs/architecture.md` · `docs/conventions.md` ·
`docs/workflow-state-contract.md` · `docs/opencode-edition.md` · `docs/kimi-edition.md` ·
`docs/README.md` · `docs/decisions/` · `kaola-workflow/ROADMAP.md`. No `.env.example` in this repo.

## Gaps found and fixed

Four documents carried claims the bundle made **false**, not merely incomplete — all corrected:
`docs/opencode-edition.md` (the "exactly two things" count), `docs/kimi-edition.md` (an uninstall
sentence already stale before this bundle), `docs/conventions.md` ("three shapes this widening still
cannot see"), and `docs/api.md`'s `worktree_dirty` entry. Two numeric misattributions in the new
CHANGELOG prose were caught and corrected before landing.

## Per-issue reflection

- **#976** — CHANGELOG entry covering both halves (installer sites and the Node choke point), plus the
  separately-called-out kimi GNU install abort, which is a user-visible bug fix on Linux.
- **#977** — CHANGELOG entry covering all four strands; `docs/opencode-edition.md` and
  `docs/kimi-edition.md` corrected; `docs/conventions.md`'s retirement walk-list extended so it is
  actually complete, which is the property that table exists to have.
- **#978** — CHANGELOG entry covering the three shapes plus the R1 addendum; `docs/api.md` and
  `docs/conventions.md` corrected.

## No-impact reasons

- **Routing skeletons / rendered command and SKILL surfaces** — untouched. `generate-routing-surfaces
  --check` reports all 18 surfaces byte-matching, so no regeneration is owed.
- **`docs/decisions/`** — deliberately not edited. ADRs are historical records of decisions made at a
  point in time; rewriting one to match new behaviour would destroy the record. Audited for
  present-tense claims that are now false: none found.
- **`README.md`** — no mechanism claims about the sink guard, retirement model or temp handling, so
  nothing to correct.
- **The walkthrough TMPDIR entry-point work** — deliberately excluded from #976's CHANGELOG entry: it
  is test-infrastructure hygiene, not a user-visible change.

## Deliberate silences, recorded so they are not read as oversights

- The `EACCES`/unreadable-file stage trigger appears in the CHANGELOG in **neither** direction. It is
  not claimed as covered, and it is not claimed as broken — mechanically it would likely take the same
  refusal path, so even the negative claim would be unverified. Filed as #983 instead.
- The suite assertion counts (1058, 210/210, 48/0) are recorded here and in the run record, **not** in
  the CHANGELOG, for the same reason the 497 figure was dropped: a suite count in a changelog entry
  rots on the next test file.
