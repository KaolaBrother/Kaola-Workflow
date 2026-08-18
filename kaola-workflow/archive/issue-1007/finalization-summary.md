# Finalization — Summary: issue-1007

## Delivered

One issue, filed by the immediately preceding run in this repo. Its premise **held** and both of its
citations were accurate — and the measurement still found the issue understating the problem on two
axes, one of which was not a documentation defect at all.

- **The counts.** `docs/conventions.md` carried two further stale sites the issue did not know about
  (`:849`, `:852`, both saying *twelve*), plus `:335` quoting the guard's width formula with the
  `+ 2` missing. `README.md` was already correct at fourteen, so one subject carried a
  three-generation gradient: `D-645-01` = 6 → `conventions.md` = 12 → `README.md` = 14.
- **The real finding.** `D-645-01` §6's claim that a missing axiom pointer "reds `npm test`
  immediately" was **false**, not merely stale. The `nx-first-principles` entry it names as
  enforcement had been deleted in an unrelated extraction. Restored, and mutation-proven.
- **A third false claim**, surfaced by the guard work: §5 quotes a tighten-only clause that ships
  nowhere. Deliberately **not** restored — see *Follow-Up Items*.

## Files Changed

One commit, `05c95d56`: `templates/routing/required-blocks.js`, `scripts/test-route-reachability.js`,
`docs/conventions.md`, `docs/decisions/D-645-01.md`, `CHANGELOG.md`.

## Test Coverage

The pin **cannot be red at baseline** — all twelve `next` surfaces carry the pointer today, so this
restores an absent guard rather than catching a live defect. That was stated rather than papered
over, and the **blindness was measured instead**: on a scratch copy at `66ac0442` with the pointer
stripped from `commands/workflow-next.md`, `test-route-reachability` passed 368 assertions, exit 0.
Same tree, same mutation, pin installed: red, naming the surface and the absent token, exit 1.

Armed by mutation, **one surface at a time**. Each of the six tracked surfaces reds on its own when
stripped; a tracked *command* additionally names the two additive-edition renders derived from it,
which is how the six edition renders were shown to be transitively protected rather than assumed so.
Machinery mutants also fire: deleting the manifest block, narrowing `surface_type_tag` to `command`
(both width asserts, "got 9"), and replacing the token list with prose that survives the strip.

**The literal-vs-derived lesson reproduced itself independently here.** Dropping a forge (12 → 8)
fires the literal width while the derived comparison goes green over four unchecked surfaces — the
same failure mode the axiom guard's `+ 2` was written to avoid, found again in a different guard.

Suites re-run by the orchestrator, not taken on report: `test-route-reachability` 376/0,
`generate-routing-surfaces --check` 0 (18 byte-match), `validate-workflow-contracts` 0,
`testAxiomBlockByteIdentity` 14 surfaces/0, `test-generate-routing-surfaces` 434/0.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- scripts/test-route-reachability.js
- templates/routing/required-blocks.js

## Mission List

items: 5
carrying an outcome while their status is not `done`: 0

## Documentation Docking

`CHANGELOG.md` under `[Unreleased]`. `docs/conventions.md` corrected at all three sites, both count
sentences now **pointing at the producer that prints the number** rather than asserting it, per the
precedent already at `:141`. `docs/decisions/D-645-01.md` **annotated with a dated note, not
edited** — the contract validator excludes `docs/decisions/` as history by construction, on the
stated grounds that rewriting a decision record would falsify it.

## Run gaps

## Follow-Up Items

- **Settled as fact, not filed.** `D-645-01` §5 quotes "never cite an axiom to justify skipping a
  typed gate, refusal, or barrier" as text the axiom layer states. It ships nowhere. It was offered
  as a values call and resolved as a measurement instead: `typed gate` and `barrier` return **zero**
  matches across `templates/`, `commands/` and root `CLAUDE.md`, because that machinery was removed
  by later decisions and the run design now carries a refusal count of zero. Restoring the clause
  would add a rule about mechanisms that no longer exist, so its absence is correct. Recorded in the
  dated note.
- **Named, not filed.** What the restored pin cannot witness is recorded with the pin itself: an
  on-disk `.opencode`/`.kimi` tree gone stale (still only `test-opencode-edition.js` A25, still
  outside `npm test`), a pointer that is present but wrong, and a pointer whose referent never
  existed on a repo initialised before the axiom layer.
- **Unswept, and said so.** `docs/investigations/` and `docs/audits/` (34 files) were outside the
  measurement's scope and were not checked for the same stale counts.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1007/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1007/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-1007/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1007/.cache/run-gaps.json
- kaola-workflow/archive/issue-1007/finalization-summary.md
- kaola-workflow/archive/issue-1007/findings/premise-1007.md
- kaola-workflow/archive/issue-1007/findings/red-1007-pointer.md
- kaola-workflow/archive/issue-1007/mission-list.md
- kaola-workflow/archive/issue-1007/workflow-state.md
