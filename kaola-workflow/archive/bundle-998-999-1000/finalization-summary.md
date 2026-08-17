# Finalization — Summary: bundle-998-999-1000

## Delivered

Three issues, closed by stating a rule rather than by widening a parser.

**#998 and #1000** asked the same values question at two points in `parseGapSection` — may a
`## Run gaps` heading carry a qualifier, and may a section be a markdown table. Both were put to the
owner in conversation before the claim, and the owner ruled **strict-and-state-it**: the parser is
byte-untouched and the grammar is now stated where the section is written. Both issues therefore
close with **no code change to the scanner**, which is why the change log files this under Added.

Stating it turned up the finding neither issue had. The authoring surface was **misleading, not
silent**: its one sentence about the section named the row's *tail* and omitted its *head*, and every
literal completion of it parses to zero rows. Only `- <reasonClass> (<sample>): filed: #N` parses, and
no prompt surface stated that form; the heading rule was stated on no shipped surface at all. Four
sentences now ship from `templates/routing/finalize.skeleton.md`, reusing `docs/conventions.md`'s
existing two-form wording verbatim rather than inventing a fourth variant, and a new content-led
`fn-run-gaps-grammar` block pins each one.

**#999** was a comment stating "9 of the 30" content-led blocks where the manifest measured 10 of 19.
The number was deleted rather than restated, and no pin was added — a guard on the figure would
re-create the hand-maintained count being removed.

## Files Changed

Two commits on `workflow/bundle-998-999-1000`.

`0d97df5d` — 12 files, +167/−2:

- `templates/routing/finalize.skeleton.md` (+11/−0) — the four sentences.
- `templates/routing/required-blocks.js` (+18/−0) — the `fn-run-gaps-grammar` block, 4 tokens.
- 6 rendered finalize surfaces (+11/−0 each) — 3 commands + 3 SKILLs, all regenerated, never hand-edited.
- `docs/conventions.md` (+4/−0) — the heading rule, in the same two load-bearing clauses.
- `docs/decisions/0017-the-mission-list.md` (+1) — the watch-list row for the declined widening.
- `CHANGELOG.md` (+65/−0) — two entries under the existing `### Added` and `### Fixed` headings.
- `scripts/test-route-reachability.js` (+2/−2) — #999, comment lines only.

`83b997e0` — 2 files, +11/−5: figure and wording corrections found by the docking audit (below).

`scripts/kaola-workflow-gap-sweep.js` is **byte-untouched**, in the canonical copy and all three
plugin copies — `git diff --stat` and `git status --short` both empty for all four. That is the
ruling's central claim and it is proven, not asserted.

## Test Coverage

No test was authored for this change, deliberately and in two senses.

The prose is graded by a **manifest pin**, not a test: `fn-run-gaps-grammar`'s four tokens, authored
by `tdd-guide` rather than by the role that wrote the prose, because an implementer must not pin what
it built. Each token is **mutation-proven armed**, one mutant at a time, by removing that one
statement from the skeleton and regenerating so the mutation reaches what ships. Verified
independently by the orchestrator as well as by the authoring role: removing the heading clause took
`test-route-reachability.js` to exit 1 with
`MANIFEST missing-token: block fn-run-gaps-grammar token "Write the heading exactly \`## Run gaps\`,
with nothing else on the line" absent from …` across **12 obligated surfaces**, and named no other
block or token. The skeleton and all six rendered surfaces were restored from a byte snapshot
afterwards and re-verified `cmp`-identical.

For #999 no pin was added on purpose: an assertion on the figure would re-create the drift being
removed.

One measurement worth recording because it looks like a failure and is not: adding a four-token block
left the suite at **331 assertions, unchanged**. The per-surface findings are detail under a single
rollup assertion, so a stable assertion count is not evidence that a new pin is dead. The mutant is
what settles it; the count cannot.

## Validation

The finalize transaction classified the receipt **`chains_green`**, `green: true`, mode
`chain-receipt`, detail `4 chain(s) green over this tree`, `operator_hint: null`.

Four chains, all green and unwaived, bound to `headSha 83b997e0` with the code-tree hash matching the
tree at finalize: claude 477s / 38 steps, codex 11s / 2, gitlab 91s / 3, gitea 88s / 3, plus 10
preamble steps all zero. Every chain `exitCode: 0`, `signal: null`, `timed_out: false`,
`accepted_red: false` — nothing was killed and nothing was waived. Scope `all-four` by
`edition_coupling`, `changedFileCount: 13`.

**The chains were stamped twice, and the second stamp was owed.** The first receipt was green
four-chain at `0d97df5d`; the documentation audit then found two defects in this run's own prose, and
correcting them moved the code-tree hash from `b19cb926…` to `5517873452…`, so `finalize --check`
reported `chains_stale`. It was re-stamped rather than reasoned around. Docs sit inside the code-tree
hash on a self-host repo by design — prose is this repo's product — while the run folder is excluded
by path, so writing this summary did not stale it again.

## Changed Paths

The transaction reported 9 code-relevant paths:

- `commands/kaola-workflow-finalize.md`
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md`
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md`
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- `scripts/test-route-reachability.js`
- `templates/routing/finalize.skeleton.md`
- `templates/routing/required-blocks.js`

Nothing here does not belong: the six rendered surfaces are regenerated output of the skeleton, the
manifest carries the pin that grades them, and the test file is #999's comment-only fix. `CHANGELOG.md`
and the two `docs/` files are absent from this list because it reports the code-relevant set, not the
diff — the full diff is 12 files in `0d97df5d` plus 2 in `83b997e0`.

## Mission List

The transaction read **8 items** and reported `outcome_while_not_done: [174]` — one item carrying a
`result` while still marked `in-flight`.

That finding was correct and has been acted on rather than softened: line 174 was this finalization
item itself, which was appended as `in-flight` and given its `result` as the phase progressed. It is
now `done`. The report is left recorded here because a reader should see that the check fired and
what it caught, not only that the file ended up tidy.

## Documentation Docking

`DOCKED`, per `.cache/doc-docking.md`.

An independent read-only audit checked every document in `CLAUDE.md`'s Documentation Update
Checklist, re-derived every figure in the change log against the tree, and searched for live copies of
a known corpus imprecision. It found **no documentation gap** — and two defects in this run's own
prose, both fixed in `83b997e0`:

- **The rate figures mixed corpora and were stale against the tree shipping them.** "1 of 128"
  reproduces only at the run's base; "2 of 154" paired a numerator counting an `.archived-*` sibling
  with a denominator excluding siblings. Re-measured over all **160** tracked archived summaries at
  this commit: **133** `## Run gaps` headings, **132** of which the parser can enter — the one it
  cannot is exactly the parenthetical heading — and **2** of those located sections are tables.
- **"so the human doc and the runtime surface cannot drift" claimed a mechanism that does not
  exist.** `fn-run-gaps-grammar` pins the 12 runtime surfaces against the skeleton and nothing binds
  `docs/conventions.md` to either. True of the present state, false as a guarantee — the exact shape
  this project forbids in a brief. It now states the result and names what is unpinned.

Two deliberate non-changes, both audited and upheld: `docs/api.md`'s tail-only phrasing stays,
because it describes what `--check` verifies rather than how to author a row — an incomplete
description of a checker misleads nobody into producing an artifact, where an incomplete instruction
does — and a fourth prose home for the grammar is how N-way drift starts. `docs/README.md`'s missing
gap-sweep index entry is out of scope for this change.

The T14/T20 citation imprecision this run inherited has **no live copy** in the tree; the only copies
are in the immutable archive, and the new watch-list row states the correction.

## Run gaps

- manual:finalize-surface-omits-scanner (the finalize surface splices only the --check gate, never the --json scanner run that produces run-gaps.json): filed: #1001
- manual:chains-stale-culprit-absent (finalize --check --json reports validation chains_stale as a bare token with no culprit paths): filed: #1002
- manual:docs-commit-stales-chain-receipt (on a self-host repo a docs-only commit changes the code-tree hash): noise: the intended behaviour of a shipped rule, not a defect — #648 closed with a stamp-last sequencing rule, docs are inside the hash on self-host by design because prose is this repo's product, and the re-stamp this run paid was the correct consequence of a late, genuine documentation correction
- manual:t14-t20-citation (T14 is cited as the free-text-bullet silence pin, but the silence is T20): noise: corrected in the new watch-list row, and a tree-wide search found no live copy outside the immutable archive, so there is nothing left to repair
- manual:docs-index-omits-gap-sweep (docs/README.md indexes no gap-sweep section): noise: discoverability of a reader doc only, and the grammar now ships on the runtime surface the author actually reads, which is the path that mattered
- manual:manifest-assertion-count-insensitive (adding a four-token manifest block left the suite assertion count unchanged): noise: by design — per-surface findings roll up into one assertion; recorded because a stable count is not evidence a pin is dead, and the mutant is what settles it
- manual:scanner-owns-grammar-phrase (the finalize surface still defers with "whose grammar the scanner owns"): noise: true of the code, and not a claim the grammar is undocumented now that it is stated some forty lines above; changing it costs a 12-surface regeneration for no correctness gain

## Follow-Up Items

Two filed, both open, both tiered, each verified to exist with a non-empty body after filing:

- **#1001** (P2, `bug`, `area:scripts`) — the finalize surface splices only the gap-sweep gate and
  never the scan that produces the artifact the gate reads. The same class of defect as #998/#1000,
  one level up: a surface stating half a procedure.
- **#1002** (P3, `bug`, `area:scripts`) — `finalize --check` reports `chains_stale` as a bare token
  with none of the culprit paths #648 shipped for exactly that blindness. Scoped honestly: observed
  on the `--check` path only.

Filed as independent slices on disjoint surfaces, so a later run can take both or either.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-998-999-1000/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-998-999-1000/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-998-999-1000/.cache/doc-docking.md
- kaola-workflow/archive/bundle-998-999-1000/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-998-999-1000/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-998-999-1000/.cache/run-gaps.json
- kaola-workflow/archive/bundle-998-999-1000/finalization-summary.md
- kaola-workflow/archive/bundle-998-999-1000/mission-list.md
- kaola-workflow/archive/bundle-998-999-1000/workflow-state.md
