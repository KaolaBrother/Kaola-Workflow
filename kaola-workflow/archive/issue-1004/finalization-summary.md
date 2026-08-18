# Finalization — Summary: issue-1004

## Delivered

Three issues, one claim. The claim record carries #1004 alone; #1005 and #1006 joined at owner
direction mid-run and are closed explicitly after the sink.

- **#1004 — the finalize summary silenced its own findings.** `appendSummarySection` declined to
  write whenever the heading already existed, and the Step 6 surface instructs orchestrators to
  pre-create exactly `## Validation`, `## Changed Paths` and `## Mission List`. Obeying the
  instruction is what dropped the transaction's own three findings. Now idempotent by **content**:
  absent heading appended as before, empty heading filled **in place**, a heading carrying content
  left exactly as written, `replace: true` untouched including its relocation to the tail.
- **#1005 — the axiom layer had four wordings, two of them unguarded.** Root `CLAUDE.md` and
  `README.md` each stated the axioms in their own words; the guard reported `PASSED (12 surfaces)`
  while both were stale. Both converged byte-identically on `templates/axioms.md`, surviving second
  wordings folded, guard extended to 14 surfaces. No declared divergent region anywhere.
- **#1006 — the premise check had no rule surface.** Near-universal in practice (62 of 406 archived
  runs; 19 of the 20 most recent) and absent from every rule surface. Added as a fourth standing
  default, with the intro sentence re-scoped so a standing default is not read as a tie-breaker.

## Files Changed

Three commits on `workflow/issue-1004`:

- `2d57c604` — #1004: the four `claim.js` copies, both `sink-merge.js` byte-identical copies
  (comment only), `test-finalize-door.js`, `simulate-workflow-walkthrough.js`, `CHANGELOG.md`,
  `docs/api.md`.
- `e82adb6d` — #1005: `CLAUDE.md`, `README.md`, `simulate-workflow-walkthrough.js`, `CHANGELOG.md`.
- `d7b29e01` — #1006: `templates/axioms.md`, `templates/routing/init.skeleton.md`, the 6 regenerated
  tracked init surfaces, `CLAUDE.md`, `README.md`, `CHANGELOG.md`.

## Test Coverage

Every guard added this run was **mutation-proven, one site at a time**, never argued from a green
suite or an assertion count.

- **#1004 behavioural** — `T17a/b/c` in `test-finalize-door.js` drive real `finalize` subprocesses
  over planted summaries. Suite 791 → **846 assertions**, exit 0. A *relocating* fill candidate reds
  exactly three of those 846, and all three are the new ones: nothing else in the suite could tell a
  relocating fill from an in-place one.
- **#1004 four-copy port pin** — `testFillIfEmptySummarySectionPortedToAllEditions1004` lifts each
  copy's function from its own file and drives it against real bytes. Mutants: gitea-unported reds
  naming gitea; canonical-unported reds naming canonical; gitlab+gitea reds naming gitlab; all four
  patched passes. It deliberately departs from #1002's regex idiom, because `if (!replace) return
  false;` is *correct* nested inside a non-empty branch and a regex would have forbidden a valid fix.
- **#1005 guard extension** — `testAxiomBlockByteIdentity` 12 → **14 surfaces**. Its anti-vacuity
  floor adds a literal `+ 2`, **not** `NAMED_SURFACES.length`, and mutant M8 is the counter-proof:
  written the derived way, dropping a surface from the list and re-staling it yields
  `PASSED (13 surfaces)` — green over a fully stale file, because expectation and measurement shrink
  in lockstep. Ten mutants total; each named surface reds independently; a one-word change and a
  re-wrap with no word changed both red.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- CLAUDE.md
- commands/workflow-init.md
- plugins/kaola-workflow-gitea/commands/workflow-init.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitlab/commands/workflow-init.md
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js
- plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md
- scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-sink-merge.js
- scripts/simulate-workflow-walkthrough.js
- scripts/test-finalize-door.js
- templates/axioms.md
- templates/routing/init.skeleton.md

## Mission List

items: 16
carrying an outcome while their status is not `done`: 0

## Documentation Docking

`CHANGELOG.md` under `[Unreleased]` for all three. `docs/api.md` § *The three reports* gained the
writing rule — the sentence "the durable half is not optional … is a deletion, not a conversion" was
**aspirational rather than descriptive** before this run and is now true; it was left byte-untouched
because rewriting it would have deleted the claim that justifies the fix. `README.md`'s
surface-count sentence was corrected by hand: it sits outside the checked block, so the guard is
structurally blind to it.

## Run gaps

## Follow-Up Items

- **Filed: #1007** — `docs/decisions/D-645-01.md` states the axiom block's reach as **six** surfaces
  in three places (`:34`, `:39`, `:69-70`); the guard now checks **14**. Stale in two steps: the
  additive editions took it to 12 before this run touched anything, and #1005 took it to 14.
  Surfaced by the #1006 implementer, outside its write set, left unedited — filed rather than fixed,
  because retroactively rewriting an ADR's factual claims is a different decision from recording
  that the claim has expired, and that decision is not this run's to take unilaterally.
- Watch, not filed: `D-645-01` §3 puts a pointer to the tie-breaker rule on the six `next` surfaces.
  The new standing default carries no such pointer. Extending it is a six-surface obligation #1006
  does not grant, so it was deliberately not taken.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1004/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1004/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-1004/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1004/.cache/run-gaps.json
- kaola-workflow/archive/issue-1004/finalization-summary.md
- kaola-workflow/archive/issue-1004/findings/blast-radius.md
- kaola-workflow/archive/issue-1004/findings/docs-1004.md
- kaola-workflow/archive/issue-1004/findings/implementation-1004.md
- kaola-workflow/archive/issue-1004/findings/implementation-1005.md
- kaola-workflow/archive/issue-1004/findings/implementation-1006.md
- kaola-workflow/archive/issue-1004/findings/premise-1005-history.md
- kaola-workflow/archive/issue-1004/findings/premise-recheck.md
- kaola-workflow/archive/issue-1004/findings/red-1005-guard.md
- kaola-workflow/archive/issue-1004/findings/red-baseline.md
- kaola-workflow/archive/issue-1004/mission-list.md
- kaola-workflow/archive/issue-1004/workflow-state.md
