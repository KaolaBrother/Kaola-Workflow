evidence-binding: n2-docs d88fb5121f4b

## n2-docs (doc-updater) — bundle-587-589

Read the n1-fix diff (`scripts/kaola-workflow-plan-validator.js`, `scripts/kaola-workflow-classifier.js`,
mirrored across all four editions) plus `scripts/simulate-workflow-walkthrough.js`, then read
`docs/conventions.md`, `docs/api.md`, and two recent ADRs (`D-584-01.md`, `D-582-02.md`) for style
before editing. Wrote to exactly the four declared files:

1. **`docs/conventions.md`** — added a new `## Freeze-time write-set hygiene and disjointness
   (#587)` section (placed after `## \`.md\` files as production surfaces (#424)`, before
   `## Barrier and write-halt triage payload (#440)`) documenting the three #587 rules:
   glob-token refusal (`glob_in_path`), the unconditional cross-node case-fold (scoped to
   `classifier.disjointWriteSets` + the antichain exact-clobber check, explicitly NOT touching
   `normalizeRepoPath` or the pre-existing same-node `case_collision` check), and the
   parallel-group allowband rule (`parallel_allowband_collision` — allowband surfaces declared on
   exactly one leg of a parallel group, excluding the per-project `.cache` band). Links to
   `docs/decisions/D-587-01.md`.

2. **`docs/api.md`** — in the `--freeze` write-set-shape-refusal bullet cluster (before the
   existing `Per-node model tier (issue #382)` bullet), added three new sub-bullets: `glob_in_path`
   typed refusal, `parallel_allowband_collision` typed refusal (covering both the declared
   fan-out-group arm and the inferred antichain-sibling arm), and a `Cross-node case-fold` note
   clarifying it reuses the EXISTING `fan-out group ... not pairwise disjoint` /
   `concurrent siblings ... both write` reasons (no new reason code) and does not touch the
   separate `--parallel-safe` exact-overlap loop. In the `--verdict-check` bullet, added the #589
   tie-break note: `majorityRefute` is now `refutes * 2 >= verdicts.length` (required-strict-
   majority-to-PASS, not to-refute), so an even-width fan-out's 1-1 split now refutes; odd-width
   unaffected; the `fanout majority-refute: ...` reason string is unchanged.

3. **`docs/decisions/D-587-01.md`** (new) — "Freeze-time disjointness-proof hardening": Context
   describes the three blind spots (glob tokens froze clean then died at the barrier; cross-node
   disjointness was case-sensitive on a case-insensitive filesystem; the `.md` allowband is
   invisible to both the disjointness proof and the barrier). Decision documents the three fixes
   with their freeze-only/unconditional scoping. Consequences notes the `--parallel-safe`
   exact-loop is deliberately NOT case-folded by this change (only its `disjointWriteSets`-backed
   coarse arm is, incidentally) and that no existing refusal is relaxed (plans that don't trigger
   the new checks stay hash-stable).

4. **`docs/decisions/D-589-01.md`** (new) — "Adversarial-verifier majority-refute ties break
   toward refuted": Context frames the old strict-`>` comparison as inverting the validator's own
   fail-closed/uncertain-is-risky posture for the tie case. Decision documents the `>=` change,
   odd-width invariance, and the unchanged reason string. Consequences notes a previously-passing
   tied 2-wide fan-out now needs `reopen-node` + a fresh review round.

No changes to CHANGELOG.md, README.md, or any script — those are out of this node's write set.
