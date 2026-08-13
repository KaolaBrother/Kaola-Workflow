# Implementation — #970 "a mission-list item can carry a result while still reading in-flight"

Worktree `.kw/worktrees/bundle-969-970-971-972`, branch `workflow/bundle-969-970-971-972`.
**No test file touched.** `scripts/simulate-workflow-walkthrough.js` is unchanged by this work.

**Verification tier: `tests-green`** (the authored scenario, plus the full walkthrough at full
scope). The three hand-ported editions carry no authored scenario, so they are additionally covered
by a `smoke-integration` run described below.

## Files changed

| file | change |
|---|---|
| `scripts/kaola-workflow-claim.js` | +86 / −12 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | identical (`cp` from canonical) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | identical (hand-ported) |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | identical (hand-ported) |

Nothing else. No `CHANGELOG.md`, no `docs/`, no template, no rendered surface.

The four copies were proved to carry the *same* change rather than a similar one: the `-U0` diff
body of each (added and removed lines only, no context) hashes to `cbdbdec3fa00bb5966cab2dc7a2d47a3`
in all four, 97 lines each. Canonical and codex are byte-identical files (`cmp` clean).

The two forge ports were applied by explicit string replacement, not by fuzzy `patch`: a dry-run of
the canonical patch at zero fuzz failed 2 of 5 hunks on context alone, and at fuzz 3 it placed hunk 5
at gitlab line 5292 when the real site is near 4983 — a silently wrong landing. The port script
asserted **exactly one** occurrence of every anchor in every file before writing a byte.

## Which channel, and why

**Shape A** — a measurement key on the envelope plus an idempotent-by-heading section in
`finalization-summary.md`, beside `validation` / `changed_paths`:

- envelope: `mission_list` = `{ "items": <n>, "outcome_while_not_done": [<item: line numbers>] }`,
  set at `claim.js:5383`, present only when the run wrote a record.
- durable: `## Mission List` in the archived `finalization-summary.md`, written by
  `persistMissionListToSummary` (`claim.js:4153`) via the existing `appendSummarySection`, from the
  `:4512-4539` block that runs **before** `archiveProjectDirSafely`, so it lands in the copy that is
  kept.

Shape B was rejected on cost with nothing to buy: `flushFinalizeFindings` de-duplicates
`finalize_transaction.findings` down to type names, so the line numbers — the whole point of the
report — would never reach the envelope. Shape B would therefore have needed an envelope key *as
well*, i.e. all of Shape A plus a registry type in four `claim.js` copies plus two `docs/api.md`
sites pinned by `test-forge-finalize-findings.js` part B. Strictly more surface for strictly less.

The `--check` lane (`evaluateFinalizePreconditions`, `checks.*`) was deliberately **not** touched.
`--check` is a preflight over preconditions and archives nothing; the issue's stated result is about
what finalize emits and what the archive keeps. Adding it there is silence-is-an-answer territory.

## The predicate I implemented

`claim.js:4128-4152` (`probeMissionListCoherence` at `:4131`). An item is reported iff **it carries an
outcome AND it has a `status` line AND that status is not `done`.**

Three regexes, all keyed on the field name **at the front of a line**, never a substring scan:

```js
const MISSION_ITEM_LINE = /^(?:- )?item:/;
const MISSION_STATUS_LINE = /^(?:- |  )?status:[ \t]*([A-Za-z][A-Za-z-]*)/;
const MISSION_RESULT_LINE = /^(?:- |  )?result\b[^:]*:/;
```

Accepted prefixes are the three forms the archive actually uses: `- ` bullet, exactly two spaces, or
column zero. Nothing at indent ≥ 3 is a field — measured, and the reason the wrapped-prose traps
(`Note for whoever implements:`, `MY DECISION:`, `...reads status: done`) cannot reach the parse.

**The calls the brief left to me, stated:**

1. **What counts as an outcome — a field name that STARTS with `result`.** This covers the plain
   `result:`, the `result so far:` form that replaced it once in the pre-repair #968 record, and the
   decorated `result (test leg):` / `result (impl leg):` / `result (chains):` forms (8 items across
   the archive turn on the decorated form alone). It does **not** cover `earlier result:`. That is
   deliberate: `earlier result` appears once in the whole archive, as a *fifth* field on an item that
   already carries a plain `result`, so including it changes no verdict anywhere — while a
   contains-`result` rule would widen the false-positive surface in the column-zero record form,
   where continuation prose sits at the same offset as a field and a line like
   `one result of the sweep: ...` would parse as a field.
2. **An item with an outcome and NO `status` line is NOT reported.** Nothing there contradicts
   anything — there is no status for the outcome to disagree with. Calling that item defective would
   be judging the record's *sufficiency*, which ADR 0017 `:50-53` puts on the wrong side of the line
   (the move ADR 0016 deleted). Same reasoning as the control's item carrying nothing but a mission.
3. **A coherent record still reports** (`items: 5`, `carrying ...: 0`). A key that appears only on a
   contradictory run is indistinguishable from a report that never ran. A run with **no record at
   all** emits nothing — no key, no section: the mission list is a convention, not a precondition,
   and that is the one silence worth keeping (it also means every finalize without a record emits
   exactly the envelope it emitted before).

**Duplicate `status:` inside one item: LAST wins**, as measured and as pinned by the control.

**What it does not do:** it does not refuse (exit code, `status: closed` and `reasons` are all
untouched), it does not repair the record (the archived `mission-list.md` is byte-identical to the
planted one — asserted on every leg), and it says nothing about "in flight with nothing to show".

Durable section as it actually lands:

```
## Mission List

items: 5
carrying an outcome while their status is not `done`: 2

The record contradicts itself at these `item:` lines — the outcome landed and the status did not follow. Reported, never repaired, and the finalize is unaffected: this record is the run's own bookkeeping, and what to do about it is the reader's call.

- line 16
- line 29
```

## Success criteria — literal output

### 1. `node scripts/simulate-workflow-walkthrough.js --shard 94/999999`

BEFORE (baseline, worktree with the authored scenario and no implementation) — **exit 1**:

```
Error: #970 [issue-9700]: nothing on the finalize envelope reports that this run record contradicts itself. 2 of its 6 items carry an outcome while their status is not `done` (item lines 25, 52). The report is located by NAME, not by shape: an envelope key that names the record it read, or a typed finding that does — whichever channel is used, something on the envelope has to say `mission`.
    at assert (.../scripts/simulate-workflow-walkthrough.js:36:25)
    at assertReports (.../scripts/simulate-workflow-walkthrough.js:7371:5)
    at .../scripts/simulate-workflow-walkthrough.js:7490:5
    at legWithRecord (.../scripts/simulate-workflow-walkthrough.js:7354:7)
    at Object.testFinalizeReportsMissionListOutcomeWithoutDone [as fn] (.../scripts/simulate-workflow-walkthrough.js:7489:3)
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":15}
EXIT=1
```

AFTER — **exit 0**:

```
testFinalizeReportsMissionListOutcomeWithoutDone: PASSED
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":94,"total":999999,"scenarios":210,"ran":1,"passed":1,"failed":0}
Workflow walkthrough simulation passed
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":35}
EXIT=0
```

### 2. `node scripts/simulate-workflow-walkthrough.js` (full scope)

AFTER — **exit 0**:

```
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":210,"ran":210,"passed":210,"failed":0}
Workflow walkthrough simulation passed
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":2430}
EXIT_full=0
```

**210 ran / 210 passed.** The brief's baseline of 209 is main at `7e962bdc`; this worktree carries
`testFinalizeReportsMissionListOutcomeWithoutDone` on top of it, so 210 is 209 + this scenario.
No BEFORE line exists at full scope: the suite stops at the first failure and this scenario aborted
it at ordinal 93.

### 3. `node scripts/validate-script-sync.js` — **exit 0**

```
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
EXIT_sync=0
```

### 4. `node scripts/test-forge-finalize-findings.js` — **exit 0**

```
behavioural[claude/canonical] archive-staging fault names the live run folder: done
behavioural[codex] archive-staging fault names the live run folder: done
behavioural[gitlab] archive-staging fault names the live run folder: done
behavioural[gitea] archive-staging fault names the live run folder: done
behavioural-C[claude/canonical] a partially-staged `git add` is reported honestly: done
behavioural-C[codex] a partially-staged `git add` is reported honestly: done
static: finding-type registries and their docs/api.md statements: done

133 passed, 0 failed
EXIT_findings=0
```

### 5. `node scripts/test-bundle-finalize.js` — **exit 0**

```
test-bundle-finalize: all 179 tests passed
EXIT_bundle=0
```

### 6. `node scripts/test-finalize-door.js` — **exit 0**

```
EXIT_door=0
...
finalize-door tests passed (458 assertions)
T12b: the two archive doors name `release` in the `reasoning` they already emit
finalize-door tests passed (490 assertions)
```

(Exit code captured from the process, not through a pipe.)

### Extra, not asked for: the four suites that read `finalization-summary.md`

`## Mission List` is a new section in a file several suites slice by heading, so:

```
test-forge-archive-scoping EXIT=0  | 188 passed, 0 failed
test-claim-hardening       EXIT=0  | claim-hardening tests passed (766 assertions)
test-kernel-conformance    EXIT=0  | kernel conformance tests passed (254 assertions)
test-sink-merge            EXIT=0  | Sink-merge (...) test suite passed: 830 assertions.
test-generate-routing-surfaces EXIT=0 | test-generate-routing-surfaces: all 434 assertions passed.
```

(`test-gap-sweep.js` is the one remaining summary-reading suite; it is under active edit by another
agent in this bundle, so its result would be about their work, not mine. My change touches neither
the gap sweep nor any routing surface.)

### Extra: cross-edition smoke — the three hand-ported copies proved LIVE

The authored scenario drives the canonical `claim.js` only. A scratch smoke
(`scratchpad/smoke-970-editions.js`, not a repo artifact) plants one record carrying all four
discriminating cases and finalizes it with each of the four copies:

```
canonical: exit 0, mission_list={"items":5,"outcome_while_not_done":[16,29]}
codex: exit 0, mission_list={"items":5,"outcome_while_not_done":[16,29]}
gitlab: exit 0, mission_list={"items":5,"outcome_while_not_done":[16,29]}
gitea: exit 0, mission_list={"items":5,"outcome_while_not_done":[16,29]}

smoke-970: all four editions OK
EXIT_smoke=0
```

That fixture is the discrimination proof, not just a pass: each of its five items flips under exactly
one wrong reading, and all four editions gave the same verdict on all five.

| item at line | state | reported? | the reading it discriminates |
|---|---|---|---|
| 16 | `in-flight` + a `result` whose prose says "reads status: done" | **yes** | `status:` matched mid-line would read this item as done and miss it |
| 20 | `in-flight`, no result, `dispatched` prose says "the result:" | no | `result:` matched mid-line would falsely name it |
| 24 | `in-flight` then `done` on the next line, with a result | no | first-`status:`-wins would falsely name it |
| 29 | `todo` + a result | **yes** | "the condition is in-flight" would miss it |
| 12 | `done` + a result | no | the plainly-finished control |

Each edition also had its archived `mission-list.md` asserted byte-identical to the planted one, and
its `## Mission List` section asserted to name 16 and 29, to name none of 12/20/24, and to state the
count as a numeral.

I did **not** re-mutate the shipped code in place: `tests-970.md` records the scenario already
mutation-proven against a scratch mirror (all three legs satisfiable, each wrong reading redding the
assertion it should), and the table above gives the same discrimination against the bytes that ship.

## Prose my change makes stale — reported, not edited

All of these are *incomplete* rather than false: each enumerates the finalize's durable measurements
as exactly two. None is machine-pinned to the count (I checked: the finalize-findings registry pin
covers `recordFinalizeFinding` types only, and the walkthrough / door / routing pins assert the
presence of `## Validation` and `## Changed Paths`, never their exhaustiveness — which is why every
suite above is green as-is).

| site | what is now incomplete |
|---|---|
| `docs/api.md:268` | heading `### The two reports` |
| `docs/api.md:270` | "`probeFinalizeValidationGate` takes two measurements" — still true of that function, but the section it heads is now the finalize's three reports |
| `docs/api.md:275-278` | the two-row Envelope-field / Durable-heading table; a `mission_list` / `## Mission List` row belongs here |
| `docs/api.md:292-307` | the `### Finalize envelope` JSON sample carries no `mission_list` key |
| `docs/architecture.md:192` | "Two measurements ride the emitted envelope…" |
| `docs/architecture.md:196-197` | the two-bullet list of envelope → durable-heading pairs |
| `docs/workflow-state-contract.md:113-115` | "the only place the finalize transaction's own **two** measurements survive the process that took them (`## Validation` and `## Changed Paths`)" |

One prompt surface is also now incomplete, and I left it alone deliberately — it is under active
edit by another agent in this bundle, and changing it means the skeleton **plus** its block pin
**plus** every rendered surface, which is a coordinated change and not mine to take unilaterally:

- `templates/routing/finalize.skeleton.md:215` — the `finalization-summary.md` section template lists
  `## Validation` and `## Changed Paths` but not `## Mission List`.
- `templates/routing/finalize.skeleton.md:222` — "`## Validation` and `## Changed Paths` are where the
  finalize transaction's own findings land — do not delete them, and do not soften them." A third
  script-written section now lands there and is not covered by that sentence.
- `templates/routing/required-blocks.js:219` pins that block list, so it would move with the skeleton.
- Rendered mirrors of the same two lines: `commands/kaola-workflow-finalize.md:190,197` and the three
  per-forge `commands/` + `skills/kaola-workflow-finalize/SKILL.md` copies.

`CHANGELOG.md` untouched, as instructed — the `[Unreleased]` entry for #970 is the lead's to dock.

---

# Review round — R1 and R2 fixed

Same worktree, same four files, no test file, no `CHANGELOG.md`.
**Verification tier: `tests-green`.**

## THE NUMBER FOR THE CHANGELOG

Measured by driving the **shipped** `finalize` once per record over all 36 archived
`kaola-workflow/archive/*/mission-list.md`, reading `mission_list` off each envelope — not by
reimplementing the predicate, which would have measured my second guess at the code rather than the
code:

> **11 archived runs, 34 items** — out of **36 records and 445 items** read.

The CHANGELOG's current "27 such items across 9 runs" is wrong twice over. It came from the premise
check, which measured a predicate that is not the one that shipped. Suggested replacement wording:
**"34 such items across 11 of the 36 archived runs"**.

Per-record, the whole flagged set:

```
  8  bundle-881-882-883-884-885  (19 items)  lines 50, 55, 65, 70, 75, 85, 90, 101
  1  bundle-896-897-898  (14 items)  lines 464
  1  bundle-900-901-902-903  (53 items)  lines 176
  4  bundle-911-912-913-914-916-917  (14 items)  lines 11, 38, 43, 74
 10  bundle-940-941-942-943-944  (21 items)  lines 3, 8, 13, 18, 23, 28, 38, 59, 64, 103
  1  bundle-945-946-947-948  (8 items)  lines 41
  2  bundle-956-957-958-959-960-961-962  (26 items)  lines 111, 136
  3  issue-932  (10 items)  lines 117, 138, 147
  2  issue-933  (7 items)  lines 18, 30
  1  issue-949  (8 items)  lines 27
  1  issue-967  (4 items)  lines 10

records read       : 36 of 36
items read (total) : 445
RUNS with >=1      : 11
ITEMS flagged      : 34
```

**R1's effect on real data, measured rather than predicted.** The same sweep against a scratch mirror
of `claim.js` carrying only the pre-fix regex gives **13 runs / 36 items**. The diff between the two
sweeps is exactly two lines:

```
< 1  issue-878  (4 items)  lines 65
< 1  issue-899  (2 items)  lines 45
< RUNS with >=1      : 13
< ITEMS flagged      : 36
> RUNS with >=1      : 11
> ITEMS flagged      : 34
```

Exactly the two records the review named, and nothing else moved. The scratch mirror was an untracked
`scripts/.kw-scratch-970-before.js` — the shipped file was never mutated — and it was deleted
afterwards (`git status --short scripts/` shows no such file).

## R1 — an outcome must carry a value

`scripts/kaola-workflow-claim.js:4136`, and the same line in the three ported copies:

```js
const MISSION_RESULT_LINE = /^(?:- |  )?result\b[^:]*:[ \t]*\S/;   // was: .../result\b[^:]*:/
```

`[ \t]*\S` is the whole fix. It requires a non-whitespace character after the colon, which collapses
the two forms the review warned are indistinguishable to a key-only match — nothing after the colon,
and whitespace after the colon — into one case: absence. Empty decorated keys (`result so far:` with
no value) fall out for free, since the value test sits after the name test.

The comment above the regexes now states the reason as a result, not a mechanism: an orchestrator
scaffolding an item writes the four field names ahead of the work, so an empty `result:` is the
absence of an outcome, and counting the key alone would tell a successor that something landed where
nothing did — the same wrongness this report exists to catch, arriving through the report.

`MISSION_STATUS_LINE` needed no change: it already required `[A-Za-z][A-Za-z-]*` after the colon, so
an empty `status:` was never read as a value.

**R3 was not touched.** The predicate is still front-of-line only, and column-0 prose that could fake
an outcome or suppress an offender is still out of scope — zero instances across all 36 archives.

## R2 — the number in the comment

`scripts/kaola-workflow-claim.js:4109` now reads:

```
// one. It is not a one-off: measured by the predicate below over this repo's own archive, 11 of the
// 36 records carry at least one, 34 items in all out of 445.
```

That is my own measurement above, not the review's prediction and not the premise's number, and it
names what measured it so a later reader can re-run it.

**One clause in that same comment block I did NOT re-measure, flagged rather than left silent:**
`claim.js:4114-4115` still says the two conditions are "near-orthogonal" over the archive. That is
the premise check's qualitative finding (27 vs 21 items, 3 runs carrying both) under a predicate that
is not the one that shipped, and re-measuring it needs a second predicate — "in-flight with nothing
to show" — that does not exist in the code. It is not a number the code beneath it contradicts, so it
is not the R2 class, but it is an inherited claim rather than one I can vouch for.

## Four copies, same change

The `-U0` diff body of each copy (added and removed lines only, no context) is 103 lines and hashes
to `09aa7a65b9abe6740d4cfd4bc133aff2` in all four. Canonical and codex are byte-identical (`cmp`
clean). The two forge ports were again applied by explicit string replacement with a one-occurrence
assertion per anchor, never by fuzzy `patch`.

`scripts/kaola-workflow-claim.js` is now +92/−12 against HEAD.
`scripts/simulate-workflow-walkthrough.js` is `432 0` — additions only, untouched by me.

## Success criteria — literal output, real exit codes

### `node scripts/simulate-workflow-walkthrough.js --only testFinalizeReportsMissionListOutcomeWithoutDone`

BEFORE the fix — **exit 1**, on the new case, against my shipped bytes:

```
Error: #970 [issue-9701]: the item starting at line 31 does NOT carry an outcome while unfinished, and the envelope report names it anyway. Expected exactly the items at 12. Envelope report:
mission_list = {"items":4,"outcome_while_not_done":[12,31]}
```

AFTER — **exit 0**:

```
testFinalizeReportsMissionListOutcomeWithoutDone: PASSED
Walkthrough --only subset passed (1 scenarios)
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":35}
EXIT_only=0
```

### `node scripts/simulate-workflow-walkthrough.js` (full scope) — **exit 0**

```
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":210,"ran":210,"passed":210,"failed":0}
Workflow walkthrough simulation passed
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":2432}
EXIT_full=0
```

**210 scenarios, 210 ran, 210 passed** — unchanged from the previous round, so no other scenario
depended on an empty `result:` counting as an outcome.

### `node scripts/validate-script-sync.js` — **exit 0**

```
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
```

### `node scripts/test-forge-finalize-findings.js` — **exit 0**

```
static: finding-type registries and their docs/api.md statements: done

133 passed, 0 failed
```

### Re-run, not asked for: the finalize-specific suites

```
test-finalize-door   EXIT=0  | finalize-door tests passed (490 assertions)
test-bundle-finalize EXIT=0  | test-bundle-finalize: all 179 tests passed
```

### Re-run: the cross-edition smoke, now carrying both empty forms

The scratch fixture gained the two scaffolded items the review named — one with nothing after the
colon (line 33), one with whitespace after it (line 38). All four copies skip both:

```
canonical: exit 0, mission_list={"items":7,"outcome_while_not_done":[16,29]}
codex: exit 0, mission_list={"items":7,"outcome_while_not_done":[16,29]}
gitlab: exit 0, mission_list={"items":7,"outcome_while_not_done":[16,29]}
gitea: exit 0, mission_list={"items":7,"outcome_while_not_done":[16,29]}

smoke-970: all four editions OK
EXIT_smoke=0
```

Seven items now, of which five must draw silence: the plainly-finished one, the in-flight-with-nothing
one whose `dispatched` prose says "the result:", the corrected-in-place one, and the two scaffolded
ones. Each flips under exactly one wrong reading, and all four editions agreed on all seven.

## Stale prose — unchanged from the first round

The R1/R2 fixes reach no doc. The seven `docs/` sites and the `templates/routing/` prompt surface
listed above are exactly as reported, still unedited.

---

# Review round 2 — the "near-orthogonal" clause: MEASURED, and it was FALSE

Comment-only change, ported to all four `claim.js` copies. No test file, no `CHANGELOG.md`, no doc.
**Verification tier: `regression-green`** — the full suite green before and after a change that
alters no behaviour.

## THE THREE COUNTS

Over all 36 archived `kaola-workflow/archive/*/mission-list.md`, **445 items**:

| | items | runs |
|---|---|---|
| **A** — the SHIPPED condition: outcome present, status not `done` | **34** | **11** |
| **B** — the other one: status `in-flight`, no outcome | **14** | **9** |
| **runs carrying BOTH** | — | **5** |

A only: 6 runs. B only: 4 runs. Neither: 21 runs. **15 runs carry either.**

The 5 that carry both: `bundle-881-882-883-884-885`, `bundle-900-901-902-903`,
`bundle-940-941-942-943-944`, `bundle-945-946-947-948`, `issue-967`.

Condition B in full:

```
  2  bundle-881-882-883-884-885  (19 items)  lines 97, 111
  4  bundle-900-901-902-903  (53 items)  lines 114, 123, 132, 184
  2  bundle-904-905-906-907-908-909-910  (28 items)  lines 88, 120
  1  bundle-937-938-939  (18 items)  lines 90
  1  bundle-940-941-942-943-944  (21 items)  lines 81
  1  bundle-945-946-947-948  (8 items)  lines 28
  1  issue-877  (27 items)  lines 107
  1  issue-880  (5 items)  lines 8
  1  issue-967  (4 items)  lines 25
```

**How it was measured, and why you can trust filter A.** The throwaway lifts the three regexes out
of the shipped `claim.js` by reading the file and eval'ing the literals — the field-position rule and
last-status-wins come from the bytes that ship, not from a retype — and then applies two filters
written locally. Before reporting anything it asserts that **filter A reproduces the shipped
per-record output exactly**, record for record and line number for line number, against the earlier
sweep that drove the real `finalize`:

```
lifted from shipped claim.js: MISSION_ITEM_LINE = /^(?:- )?item:/
lifted from shipped claim.js: MISSION_STATUS_LINE = /^(?:- |  )?status:[ \t]*([A-Za-z][A-Za-z-]*)/
lifted from shipped claim.js: MISSION_RESULT_LINE = /^(?:- |  )?result\b[^:]*:[ \t]*\S/

fidelity: filter A reproduces the shipped per-record output EXACTLY (11 records).
```

If that check had failed the script exits 1 and reports nothing. So filter B, written the same way in
the same pass, is measuring the archive rather than my second guess at the parse. The script lives in
the scratchpad and never entered the tree — `git status --untracked-files=all scripts/ plugins/`
reports no untracked file.

## The verdict: the clause was wrong, and stating it plainly

**"Near-orthogonal" is false at the run level.** A third of the affected runs — 5 of 15 — carry both
conditions. That is not near-orthogonality by any reading; it is *more* co-occurrence than chance
would give (independence over 36 records at 11/36 and 9/36 predicts ≈2.75 runs, and 5 were observed).
The premise check's 3-of-36 came from a predicate that is not the one that shipped.

**But the justification for the condition survives, and it survives on a stronger footing than the
claim it replaces.** The reason a mixed count says nothing about either is not that they mark
different runs — it is that **no item can be in both states**: A requires an outcome and B requires
its absence. That disjointness is *structural*, true by construction on every record that will ever
exist, and it does not depend on a measurement that can rot. The false clause was arguing the right
conclusion from the wrong premise.

Per your instruction I did **not** adjust the mechanism. The shipped condition is unchanged; only the
comment moved.

`scripts/kaola-workflow-claim.js:4112-4116` now reads:

```
// This READS the record. It never repairs it, never refuses, and never judges whether a record is
// SUFFICIENT — an item carrying nothing but its mission is silent, not deficient, and an item with
// no `status` at all contradicts nothing, so neither is reported. Nor is "in flight with nothing to
// show", which is a different and louder problem: NO ITEM can be in both states — this one needs an
// outcome, that one needs none — which is why a count mixing them says nothing about either. That
// disjointness is structural and does NOT extend to runs. Measured over the archive: 34 items in 11
// runs here against 14 items in 9 runs there, and of the 15 runs carrying either, 5 carry both.
```

Every number in that comment is now one I measured, and the structural claim is checkable by reading
the predicate ten lines below it.

## Four copies, same change

The comment does live in the ported region, so all four moved together — a comment-only divergence
between canonical and codex would have redded `validate-script-sync`. `-U0` diff body: 105 lines,
digest `96b49fb358bcdf11b0d643bda1f75312` in all four. Canonical vs codex `cmp` clean.

## Verification

| command | exit | output |
|---|---|---|
| `simulate-workflow-walkthrough.js --only testFinalizeReportsMissionListOutcomeWithoutDone` | 0 | `testFinalizeReportsMissionListOutcomeWithoutDone: PASSED` |
| `simulate-workflow-walkthrough.js` (full scope) | 0 | `{"scenarios":210,"ran":210,"passed":210,"failed":0}` |
| `validate-script-sync.js` | 0 | `OK: 15 common scripts, 27 byte-identical groups, … committed kernel parity: 4 Oracle Kernel copies identical at HEAD.` |
| `test-forge-finalize-findings.js` | 0 | `133 passed, 0 failed` |

210/210 before and after, as a comment-only change must be.
