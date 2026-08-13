# Acceptance test — #970 "an item can carry a result while still reading in-flight"

Test-only. **No production file touched.** The behaviour does not exist yet; the test is RED.

## What landed

| | |
|---|---|
| file | `scripts/simulate-workflow-walkthrough.js` (worktree `.kw/worktrees/bundle-969-970-971-972`) |
| diff | **+386 / −0**, two hunks: the scenario after `testFinalizeOfflineReportsSkippedClaimRelease` (`:7215`), and one `add(...)` registration line (`:12964`) |
| scenario | `testFinalizeReportsMissionListOutcomeWithoutDone` |
| isolate | `node scripts/simulate-workflow-walkthrough.js --shard 94/999999` (ordinal 93), or `--only testFinalizeReportsMissionListOutcomeWithoutDone` |

## RED on the baseline

Baseline `7e962bdc86d188e1da99af3309a13ae0dd3d9e97`. Literal output of
`node scripts/simulate-workflow-walkthrough.js --shard 94/999999`, **exit 1**:

```
Error: #970 [issue-9700]: nothing on the finalize envelope reports that this run record contradicts
itself. 2 of its 6 items carry an outcome while their status is not `done` (item lines 25, 52). The
report is located by NAME, not by shape: an envelope key that names the record it read, or a typed
finding that does — whichever channel is used, something on the envelope has to say `mission`.
    at assert (…/scripts/simulate-workflow-walkthrough.js:36:25)
    at assertReports (…/scripts/simulate-workflow-walkthrough.js:7371:5)
    at legWithRecord (…/scripts/simulate-workflow-walkthrough.js:7354:7)
    at Object.testFinalizeReportsMissionListOutcomeWithoutDone [as fn] (…:7489:3)
```

(The line wrapping above is this document's; the message is one line.)

## Suite counts

| | before | after |
|---|---|---|
| full walkthrough, main checkout at `7e962bdc` | `##KW-SHARD {"scenarios":209,"ran":209,"passed":209,"failed":0}` + `Workflow walkthrough simulation passed`, **exit 0** | — |
| full walkthrough, worktree, with the scenario | — | aborts at the new scenario, **exit 1**; the 92 ordinals before it pass (last line before the error: `testFinalizeOfflineReportsSkippedClaimRelease: PASSED`) |
| `--list` entries | 221 | 222 |

The suite stops at the first failure, so there is no "after" coverage line to quote — that is the
deliverable, not a gap. Every other scenario is untouched: the diff removes nothing, and the two new
module-level names (`MISSION_REPORT_NAME`, `missionRecordFixture`) are each defined exactly once.

## The three legs

1. **`issue-9700` — bullet form.** Six items; fields at two spaces under a `- item:` bullet, wrapped
   prose at four. Offenders: the item at **line 25** (`in-flight` + `result`) and the item at
   **line 52** (`todo` + `result`). Not offenders: line 38 (`in-flight`, no result), line 44
   (`in-flight` corrected to `done` on the next line, with a result), and two plainly finished items.
2. **`issue-9701` — column-0 form.** No bullet, fields at column zero, wrapped prose at column zero
   too, with `MY DECISION:` / `Note for whoever implements:` sitting at the same offset as a real
   field. One offender, at line 12.
3. **`issue-9702` — negative control.** No item in the state; it holds the two items nearest to it
   (in-flight with nothing to show; corrected in place from `in-flight` to `done`) plus one carrying
   nothing but a mission and a status. No item line number may be named. **This leg is green on the
   baseline** — verified by running it alone — as a negative control must be.

Every leg also asserts the run is otherwise unchanged: **exit 0**, `status: closed`, and the archived
`mission-list.md` byte-identical to the planted one (the report reads the record, never repairs it).
Two premise assertions guard against a green from the wrong lane: the archived
`finalization-summary.md` must exist and already carry `## Validation`, so an absent report is a real
absence.

## The duplicate-`status:` decision: LAST match wins

**Pinned: last wins** (the control's line-27 item is `in-flight` then `done` with a result, and must
NOT be reported).

Measured, not chosen by taste. All **11** duplicate-status items in the archive have the later line
as `done`; 10 of those have `in-flight` as the earlier line, 1 has `done` twice. **Zero
counter-examples** — the correction is always written under the stale line, never over it. First-wins
would therefore report ten items across the archive whose author wrote `status: done` directly
beneath the line being read as authoritative. That is the difference the premise report measured as
37 items/10 runs vs 27 items/9 runs.

## What is pinned, and what is deliberately not

**Pinned (the observable result):**

- The report is located **by name only** — an envelope key matching `/mission/i` at any depth, or a
  typed finding name that does; and a `##`/`###` section of the archived `finalization-summary.md`
  whose heading matches `/mission/i`. Both channels finalize already has are accepted; neither is
  required. The envelope search is over KEY NAMES, never a substring scan, because `closure_receipt`
  already carries the archived `mission-list.md` **path** — a text search would "find" this report in
  every run ever finalized.
- **Exact set equality on line numbers**: every offending item's `item:` line number is named, and no
  other item's is, on the envelope AND in the durable section.
- The durable section states the count **as a numeral**.
- Exit code, `status: closed`, and the record's own bytes are unchanged.

**Not pinned, and why:**

- **Which channel.** Shape A and Shape B both pass.
- **What counts as an outcome beyond the spec `result:` key.** The premise report flags this as a
  design call rather than a measurement, and it is: the archive holds `result so far:`,
  `earlier result:`, and decorated keys `result (test leg):` / `result (impl leg):` /
  `result (chains):` (8 items across the archive turn on the decorated form alone). **Every fixture
  item uses the plain `result:` key**, so a strict reading and a permissive one both pass. Whoever
  implements owns that call; it is not frozen here.
- **Heading and key wording**, beyond containing `mission`.
- **What a clean run emits.** Nothing, or a "none" section — both pass. The control asserts only that
  no item is named.

**One thing the implementer must know:** the issue's stated result puts the count and the line
numbers on the envelope, so a Shape-B-only implementation does not satisfy it — `flushFinalizeFindings`
de-duplicates `finalize_transaction.findings` down to type names, and the line numbers would exist
only in the summary. Shape B plus an envelope key is fine; Shape B alone is not.

**Two residual weaknesses, named rather than hidden:** the count assertion requires a numeral, so a
section that spells it ("two items") reds on wording; and the negative control cannot catch a report
that states a wrong non-zero count while listing no line numbers.

## The assertions are armed, not just the first one

A test whose deeper assertions are unreachable proves nothing, so they were mutation-proven against a
**scratch mirror** of `kaola-workflow-claim.js` carrying a simulated measurement — a satisfiability
probe, **not a design**, and deleted afterwards (the repo tree holds no `scratch970*` file).

With a straightforward correct simulation, **all three legs go green** — so the scenario is
satisfiable and nothing in it is vacuous. Each wrong reading reds the assertion it should:

| simulated defect | reds on |
|---|---|
| first-`status:`-wins | leg 1 names line 44; **and leg 3 alone** names line 27 |
| condition is `status == in-flight` | leg 1 misses line 52 (the `todo` + result item); **and leg 3 alone** names line 19 |
| `result:` matched anywhere in a line | leg 1 falsely names line 38 — its `dispatched` prose contains "the result:" |
| `status:` matched anywhere in a line | leg 1 misses line 25 — its `result` prose quotes "reads status: done" |
| envelope only, no durable write | the durability assertion |
| durable only, nothing on the envelope | the envelope assertion |
| section lists lines but states no count | the count assertion |
| report rewrites the record | the byte-identity premise |

The two prose traps are the measured variance, at the level the archive actually holds it: mid-line,
never at the front of a line. There is **no** spec field name at indent ≥ 3 anywhere in the archive
(425 bulleted item lines, 1194 two-space field lines, 80 column-zero field lines), so a trap keyed on
a deeper-indented `result:` would have punished a parser that reality does not punish, and was left
out.

---

# Increment 2 — the empty `result:` (review R1)

The scenario was **green** against the landed implementation before this change
(`--only …`, exit 0). It is RED again now. Same file, **+46 lines, −0**; total for the scenario
**+432 / −0**. No production file touched — `scripts/kaola-workflow-claim.js` carries the
implementer's `86/12` and nothing of mine.

## The defect, on the shipped bytes

Measured by extracting the three regex literals **out of the shipped source** rather than retyping
them, then walking all 36 archived mission lists:

```
shipped MISSION_ITEM_LINE   = /^(?:- )?item:/
shipped MISSION_STATUS_LINE = /^(?:- |  )?status:[ \t]*([A-Za-z][A-Za-z-]*)/
shipped MISSION_RESULT_LINE = /^(?:- |  )?result\b[^:]*:/
```

Exactly **two** empty `result:` lines exist in the whole archive, and the shipped predicate counts
both as outcomes:

```
issue-878:73  line="result:"   next: ""   +2: (EOF)
issue-899:53  line="result:"   next: ""   +2: (EOF)
```

Both are the `dock and finish` item of a run that stopped — `status: todo`, `dispatched:` empty,
`result:` empty, all four field names written ahead of the work. The item lines are issue-878:65 and
issue-899:45, which is what the review cited.

## Line-continuation values: they do not exist — the simple rule is safe to pin

The brief asked me to check before pinning. **There are two empty `result:` lines in the archive and
both are followed by an empty line and then EOF.** No archived `result:` carries its value only on a
following line, so a "non-whitespace value on the same line" rule breaks nothing that exists. I did
not pin that rule as a *method*, though: the fixture items are shaped like the archived ones (empty
`result:`, blank line, end of item), so an implementation that looks ahead for a continuation and
finds none passes just as well as one that only looks at the same line.

## The true archive count — 11 of 36, not 9, and not 13

All four readings, same walk, differing only where stated:

| reading | items | runs |
|---|---|---|
| plain `result:` only, empties counted | 29 | 11 of 36 |
| **plain `result:` only, empties skipped — the premise check's number** | **27** | **9 of 36** |
| **decorated keys, empties counted — what ships today** | **36** | **13 of 36** |
| **decorated keys, empties skipped — after the R1 fix** | **34** | **11 of 36** |

So **the CHANGELOG should say 11 of 36 (34 items)**, and the review's prediction of 11 is exact. The
`9 of 36` was never wrong *for its own reading* — the premise check counted only the plain `result:`
key and was already skipping empties. The gap is two separate things: the shipped predicate
deliberately widened to the decorated keys the archive uses (`result so far:`, `result (test leg):`),
which is +7 items / +2 runs, and the empty-result bug, which is +2 items / +2 runs. Only the second
is a defect.

I updated the same stale `9 of the 36` in my own scenario's header comment to `11 of the 36 … 34
items`, stating which reading produces it. The identical number at `claim.js:4109` is R2 and is the
implementer's, per your instruction — untouched.

## What landed, and the RED

Two places, because the two archived instances are both column-0 records and the control is bullet
form — this way the case is pinned in the form it actually occurs in, *and* in a file where a real
outcome must still be reported:

- **`issue-9701` (column-0, positive leg)** — a `dock and finish` item copied in shape from
  issue-878/issue-899, appended last. The genuine offender at line 12 must still be named; this one
  must not.
- **`issue-9702` (negative control)** — two scaffolded items: `result:` with nothing after the colon
  (`status: todo`), and `result:   ` with whitespace after it (`status: in-flight`). A key-only match
  cannot tell those two apart, which is the point.

The control's failure message now reads from a `coherentSilence` table — one reason per item, in
fixture order, with a length invariant — so the message names the state a wrong reading misread
instead of pointing at a seven-item file. That replaced prose that hard-coded item indexes and would
have silently gone stale the moment an item was inserted.

**RED 1 — the positive column-0 leg** (`--only testFinalizeReportsMissionListOutcomeWithoutDone`,
exit 1). This is the first failure, so it is what a plain run shows:

```
Error: #970 [issue-9701]: the item starting at line 31 does NOT carry an outcome while unfinished,
and the envelope report names it anyway. Expected exactly the items at 12. Envelope report:
mission_list = {"items":4,"outcome_while_not_done":[12,31]}
```

**RED 2 — the negative control**, which the abort above hides. Run alone against the real,
unmodified `claim.js`, exit 1:

```
Error: #970 [issue-9702]: no item in this record carries an outcome while its status is not `done`,
yet the report names 2 of them:
  - line 38 — was SCAFFOLDED — the field names were written ahead of the work and `result:` is still
    empty. An empty field is the absence of an outcome; reporting it tells a later reader that
    something landed on an item where nothing did. Two archived runs hold exactly this item
    (issue-878 and issue-899, both a `dock and finish` scaffolded at the end of the file)
  - line 43 — was SCAFFOLDED like the one above, with whitespace after the colon rather than
    nothing — the same absence, and a key-only match cannot tell the two apart
Envelope report:
mission_list = {"items":7,"outcome_while_not_done":[38,43]}
Section(s):
## Mission List

items: 7
carrying an outcome while their status is not `done`: 2

The record contradicts itself at these `item:` lines — the outcome landed and the status did not
follow. …
```

That last block is the harm in its durable form: the archived summary telling a successor that an
outcome landed on two items where nothing landed, under a heading that reads as evidence.

## Armed, and not satisfiable by narrowing

Same scratch-mirror method as before — a patched copy of `claim.js`, never the real one, deleted
afterwards (no `scratch970*` in the tree).

| simulated state of the predicate | result |
|---|---|
| shipped, unmodified | RED — leg 2 names line 31; leg 3 alone names lines 38 and 43 |
| one-line fix (require `\S` after the colon) | **all three legs GREEN** — the new case does not contradict the positive legs |
| nothing is ever an outcome (the "narrow it into uselessness" escape) | RED — leg 1 misses line 25, `outcome_while_not_done: []` |

And, because it is worth knowing before the fix goes in: the **full walkthrough passes 210/210
against the one-line fix** (`{"scenarios":210,"ran":210,"passed":210,"failed":0}`, exit 0). No other
scenario in the suite depends on an empty `result:` counting as an outcome. That is a probe, not a
design — the implementer owns the shape of the fix.

## R3, untouched

No case here forces a different reading of front-of-line column-0 prose. The scaffolded items are
distinguished by an **empty value**, never by where a name sits in a line, so the accepted trade
stays accepted and unpinned.
