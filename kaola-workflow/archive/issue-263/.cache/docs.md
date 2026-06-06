# docs node evidence — issue #263 Classify-And-Act selective execution

## RED evidence (before change)

The `**Planned — Classify-And-Act**` paragraph at README.md L583 (before edit):

```
**Planned — Classify-And-Act (selective execution):** routing to *one of several mutually-exclusive arms* based on what exploration finds (e.g. "fix the CSV exporter **or** the HTML renderer, whichever is at fault") is not yet expressible — both arms must currently be authored as a fan-out, so both run. The design for a script-decidable selector that runs exactly one arm is tracked in issue #263 (`docs/investigations/2026-06-06-six-workflow-patterns.md`).
```

This was a standalone prose paragraph below the table, not a table row. The table had seven rows (Plan-then-implement, Fan-out-and-synthesize, Adversarial verification, Bounded loop, Generate-and-filter, Tournament, Composed); Classify-And-Act had no row entry.

The summary sentence read: "The first six are building blocks; the last row stacks three of them."

## GREEN evidence (after change)

Three surgical changes made to `/Users/ylpromax5/Workspace/Kaola-Workflow/README.md`:

1. New table row inserted between Tournament and Composed (README.md L579):

```
| **Classify-And-Act** | Routing to exactly one of several mutually-exclusive arms based on what a read-only classifier finds (e.g. "fix the CSV exporter **or** the HTML renderer, whichever is at fault"). | A read-only `code-explorer` classifier node writes `selector: <arm-id>` to its `.cache/<id>.md` evidence; each arm carries `shape: select(<group>)` and a `selector_source` pointing to the classifier. On the classifier's commit, `plan-validator --selector-check` reads the selector and fail-closes (exit 1) on a missing or foreign value; it returns `armsToNa` for the unselected arms, which the contractor marks `n/a` in the ledger — `next-action.js` then treats only the one selected arm as ready. Risk is assessed over the union of all arms; the selector is read-only (zero blast radius); `n/a` arms cannot smuggle unreviewed writes because they never execute. | `auto-run` (selector is read-only; write-role arms are mutually exclusive, not concurrent) |
```

Governance verdict (`auto-run`) pinned from live validator output:
```
node scripts/kaola-workflow-plan-validator.js select-valid-plan.md --json
=> result: in-grammar  decision: auto-run
```
(The fixture is the same 5-node plan the tripwire in `testAdaptivePatternLibrary` asserts.)

2. The `**Planned — Classify-And-Act**` paragraph removed entirely.

3. Summary sentence updated: "The first six are building blocks" → "The first seven are building blocks."

## Stale-reference verification

`grep -n "Classify-And-Act\|Planned\|not yet expressible\|#263" README.md` returns only the new supported table row at L579. No dangling stale references.

## Deferred USE-side caveat

plan.md §0a note 5 and the impl-commit-node SCOPE CAVEAT are explicit: the contractor prompt wiring (planner emitting `select()` nodes + contractor transcribing `armsToNa` to `n/a` ledger rows) is the USE side, which is "deferred / unowned by this plan." What #263 actually ships is the grammar + validation + the BLOCKING script-level fail-closure (`--selector-check` computes `armsToNa` and exits 1 on missing/foreign); `next-action.js` already handles `n/a` as terminal, but the rows only get written once the deferred contractor prompt wiring lands.

The row's mechanism description was revised to lead with the script-mechanical blocking guarantee and present the contractor `n/a` write as the intended bookkeeping that follows — not a wired, end-to-end pipeline assertion. This matches the plan's "implement not use" framing while still marking the pattern supported per the owner's AC.

## docs/investigations file note (out of write set)

The removed paragraph referenced `docs/investigations/2026-06-06-six-workflow-patterns.md`, which likely still frames Classify-And-Act as planned/future. That file is outside this node's write set (README.md only). A follow-up should reconcile it, or finalize should note it.

## Reviewer non-blocking notes — documentation decision

The reviewer (review.md) raised two non-blocking observations:

- MEDIUM: G-SEL-1b phantom-arm gap — a mix of `{arm-csv: classify, arm-html: blank}` passes validation but arm-html runs unconditionally. Reviewer suggests a follow-up requiring every select-shape member to carry a non-empty `selector_source`. This is an impl-level gap, not a pattern-description error. Decision: omitted from the user-facing README row (surgical-change + token-efficiency rules; it belongs in a follow-up issue, not a high-level pattern overview). Recorded here for the follow-up author.

- LOW: selectGroups keying — two independent `select(fix)` groups in different branches merge into one, causing a spurious "conflicting selector_source" refusal (over-blocks, never under-blocks). Note only for fanout-parity; the reviewer marked it acceptable. Decision: omitted from README row for the same reasons.
