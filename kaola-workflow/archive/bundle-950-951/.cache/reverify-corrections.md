# Re-verification of the corrections — adversarial pass

Date: 2026-08-11 · HEAD `580c6019` · uncommitted diff over `CHANGELOG.md`,
`docs/conventions.md`, `docs/decisions/0017-the-mission-list.md`,
`scripts/test-route-reachability.js`.

Method: every number re-derived from git and from runs on scratch mirrors under
`/private/tmp/claude-501/.../scratchpad/{hist,histmut,mut,oc,km}` (`cp -R`; no
`git checkout --` in the real tree; the real tree was never mutated — verified
clean-except-the-diff at the end). Prior `.cache/` reports were not read.

**Result: 4 of the 9 claim clusters carry a defect.** Two are new errors
introduced by the corrections themselves; one is a revert that reintroduced the
stale claim; one is a self-contradicting directive.

---

## Baseline measurements everything below rests on

The mutation throughout is "delete a forge from both edition tables": remove the
`gitea` rows from `COMMAND_EDITIONS` and `SKILL_EDITIONS` in
`scripts/generate-routing-surfaces.js` (registry rows 18 → 12, `FORGES` 3 → 2).

| measurement | command | result |
|---|---|---|
| suite baseline | `node scripts/test-route-reachability.js` | `Route-reachability test passed (331 assertions).` exit 0 |
| suite mutated | same, on mutated mirror | `FAIL: T19b universe: … ships on 6 generated surfaces — found 4 (…)` then `Route-reachability test FAILED: 1 failure(s), 324 passed.` exit 1 |
| anchor mutated | `node scripts/test-generate-routing-surfaces.js` | `FAIL: registry derives 18 surfaces (3 topics x 6) / expected: 18 / actual: 12` exit 1 |
| MANIFEST floor, instrumented | probe `console.error` above `assert(actual === expected …)` | baseline `expected=12 actual=12`; mutated `expected=8 actual=8`, assertion **executed and passed** |
| walkthrough counter-example | `node scripts/simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity` | baseline `testAxiomBlockByteIdentity: PASSED (12 surfaces)` exit 0; mutated `PASSED (8 surfaces)` exit 0 |

Git anchors (author dates, `%ad`, +0800):

| event | commit | date |
|---|---|---|
| source comment "this suite stays green at an unchanged assertion count" written | `523f1241` | 2026-08-01 01:29:58 |
| `docs/conventions.md` numeral "325 assertions" written | `40486659` | 2026-08-01 07:08:51 |
| suite total leaves 325 | `6fdbf714` | 2026-08-01 11:51:29 (325 → 323) |
| T19b band lands (whole band; `git log -S 'T19b'` returns this commit only) | `97df0d6f` | 2026-08-10 21:53:42 |
| `codexEditions` literal introduced (same commit that created the file) | `f61f4ce5` | 2026-06-11 21:50:42 |

Total under the mutation, walked commit-by-commit on a mirror
(`git checkout -q -f <sha>` then mutate then run):

```
40486659 2026-08-01 07:08:51 :: exit=0 :: passed (325 assertions)
6fdbf714 2026-08-01 11:51:29 :: exit=0 :: passed (323 assertions)
ce7ec829 2026-08-02 23:32:43 :: exit=0 :: passed (456 assertions)
11e20a8d 2026-08-03 00:52:01 :: exit=0 :: passed (426 assertions)
17296a65 2026-08-03 09:46:14 :: exit=0 :: passed (298 assertions)
97df0d6f 2026-08-10 21:53:42 :: exit=1 :: FAIL T19b universe … 1 failure(s), 324 passed
425474c6 2026-08-10 23:20:33 :: exit=1 :: same
580c6019 2026-08-11 01:03:36 :: exit=1 :: same
```

So the "stays green" claim held green for every intermediate state and inverted
exactly at `97df0d6f`. That is decisive, not inferred.

---

## Claim 1 — the conventions.md contrast — **CONFIRMED** (all four parts)

> "is still registry-derived and still passes at 12→8" … what reds is "the
> **suite**", at `T19b universe: … 6 … found 4`, from "a later, unrelated band
> measuring a different universe against a hand-typed `codexEditions` literal."

- **Floor still passes at exactly 12→8.** Instrumented probe: `expected=8
  actual=8` under the mutation, `expected=12 actual=12` at baseline; no
  `MANIFEST universe` line among the failures. The floor is
  `scripts/test-route-reachability.js:785`, width
  `ROUTING_FORGES.length * (trackedRuntimes + RUNTIME_EDITION_MODULES.length)`
  = `3 × (2 + 2)` → `2 × (2 + 2)`. Forge term registry-derived: confirmed.
- **The quoted red matches byte-for-byte.** Actual line:
  `FAIL: T19b universe: the routing instruction ships on 6 generated surfaces — found 4 (plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, …)`.
  The doc's elided rendering `T19b universe: … 6 … found 4` is faithful.
- **T19b is genuinely a different universe.** `test-route-reachability.js:548-553`:
  `GENERATED_SURFACES` filtered by `CODEX_MODEL_ROUTING_MARKER`, expectation
  `codexEditions.length * 2` = 6 Codex next/finalize SKILL surfaces. The floor's
  universe is the 12 runtime × forge `MANIFEST_EDITIONS` trees. Disjoint subjects.
- **`codexEditions` is hand-typed.** `test-route-reachability.js:141-145`, a
  three-entry object literal; the file's own comment at `:718-723` calls it "a
  hand-kept twin of the same two tables".
- **Later and unrelated.** `97df0d6f` (2026-08-10, #935/#944 role→tier roster)
  vs `523f1241` (2026-08-01, #881–#885 manifest-universe floor). Different
  issue, different subject, 9d20h apart.

## Claim 2 — "the literal sits inside the suite it rescues, not in a different file" — **REFUTED as a rule application** (true as a location statement)

File facts, all confirmed:

| thing | file |
|---|---|
| `codexEditions` literal | `scripts/test-route-reachability.js:141` |
| the floor it "rescues" | `scripts/test-route-reachability.js:785` — **same file** |
| the registry = the artifact under test | `scripts/generate-routing-surfaces.js:66-75` |
| the sanctioned anchor `registry derives 18 surfaces` | `scripts/test-generate-routing-surfaces.js:239` |

The rule as written is: *"Where a universe is derived from the artifact under
test, partially anchored is not anchored: one **absolute** count belongs in a
different file."* **Different from what is never stated.** Two readings exist and
the sanctioned exemplar satisfies both, so the exemplar cannot disambiguate it:
`test-generate-routing-surfaces.js` is a different file from the registry *and*
from the guard.

- Under **"different from the artifact under test"** — the reading the rule's own
  opening clause sets up — `codexEditions` **is** in a different file from
  `generate-routing-surfaces.js`. The disqualification collapses outright.
- Under **"different from the guard whose universe is derived"**, the sentence is
  accurate.

Worse, the *functional* ground for the rule is independence from the artifact,
and `codexEditions` has exactly that independence — hand-typed, reads nothing
from the registry — which is precisely why it reds. So the reason the sentence
gives does not do the work the sentence needs it to do, and rests on a reading
the rule never states. This is the second time this sentence has stated a file
relationship that does not follow.

**Corrected wording the evidence supports** — drop the file-location argument and
state the disqualifiers that are actually measurable:

> That is an incidental catch and not the anchor this rule asks for: it anchors a
> different universe — six Codex routing-marker SKILL surfaces, not the
> registry's eighteen rows — and it does so through a hand-kept twin of the very
> two edition tables being deleted from, one guard *inside* this same suite
> rather than one guard over. It is enough to stop the suite standing in for
> "stays green", and not enough to re-anchor anything.

## Claim 3 — "four hours later" / "nine days" — **CONFIRMED in substance; "four hours" is a floor, not a round**

Exact intervals:

```
numeral written (40486659) -> numeral stale (6fdbf714):  0d 4h 42m   (4.71 hours)
conventions sentence       -> T19b (97df0d6f):           9d 14h 44m  (9.614 days)
```

- **"went stale the same day it was written": CONFIRMED.** Both events are
  2026-08-01. `6fdbf714` is the *first* commit after `40486659` at which the
  total leaves 325 — verified by running the suite at all eleven intervening
  commits (`96e3b14c 367788cd 3c2f201f ac9eb224 1f2b94e5 c021e11a d05421b4
  d4f63794 f50d0b2c e7e5a458 fa5157b3`), every one of which printed
  `passed (325 assertions)`.
- **"four hours later": 4h 42m.** True as "more than four hours"; rounded to the
  nearest hour it is five. In a sentence whose entire subject is a numeral that
  rotted, an understating numeral is an avoidable target. Suggest "under five
  hours later" or "the same morning".
- **"survived nine days": 9d 14h 44m.** True as a floor; nearest day is ten.

## Claim 4 — "324 passed and 1 failed … on a line that reads `FAILED`" — **CONFIRMED**

Verbatim last line of the mutated run:

```
Route-reachability test FAILED: 1 failure(s), 324 passed.
```

324 + 1 = 325, the dead numeral. The line does read `FAILED`. Exit 1.

## Claim 5 — the reverted table row at `docs/conventions.md:315` — **REFUTED as a present-tense statement; the revert reintroduced the stale claim**

Row as it stands (unchanged from HEAD — the diff's only `conventions.md` hunk is
`@@ -322,8 +322,22 @@`, so line 315 was **not** touched):

```
| `test-route-reachability` | a universe derived from the edition tables | the forge term is the registry measuring itself — 12→8 surfaces, unchanged assertion count |
```

- "the forge term is the registry measuring itself" — **true**.
- "12→8 surfaces" — **true** (measured).
- "unchanged assertion count" — **false today**. Measured: 331 baseline → 324
  passed + 1 failed under the mutation. The count changes by 6 and the suite
  exits 1.

It was *exactly* true when written: at `40486659` the mutated run printed
`passed (325 assertions)` against a 325 baseline — genuinely unchanged. It is
the same rot the paragraph 15 lines below now documents, still live on the page
that documents it, and the corrected paragraph reconciles only the *first* half
("the floor the row above describes still holds it") while its next sentence
("What changed is the **suite**, which now reds under the same mutation")
contradicts the row's third clause without flagging it.

The table's preamble is past-tense narrative ("Five defects shipped…"), so
leaving the row *as history* is defensible — but nothing marks this clause as
historical, and a `git grep` confirms `docs/conventions.md:315` is now the last
live carrier of the stale claim in the repo (the only other hit,
`CHANGELOG.md:47`, is an explicit quotation of the old wording).

**Corrected wording:** either date it —
`… — 12→8 surfaces, and at the time an unchanged assertion count (325→325)` —
or trim it: `… — 12→8 surfaces, and this floor stays green`.

## Claim 6 — the source comment — **CONFIRMED**

- "was true for nine days": from `523f1241` (2026-08-01 01:29:58) to `97df0d6f`
  (2026-08-10 21:53:42) = **9d 20h 23m**. Same floor-rounding caveat as claim 3
  (nearest day is ten), and it is measured green at every intermediate
  suite-touching commit.
- "an unrelated band landing beside it **in the same file**": T19b is
  `scripts/test-route-reachability.js:430-660`; the floor is `:741-792`. Same
  file. `git log -S 'T19b' -- scripts/test-route-reachability.js` returns
  `97df0d6f` alone, so the whole band landed there.
- "falsified not by any change to the floor it describes": the floor's source
  region (`const RUNTIME_EDITION_MODULES` through the zero-width assertion) is
  **byte-identical** across `523f1241 40486659 17296a65 97df0d6f 425474c6
  580c6019` — sha256 prefix `53267526fc7dd1b0`, length 1577, at every one.
- "caught in test-generate-routing-surfaces.js's … assertion too, in the
  always-selected claude chain": `test-generate-routing-surfaces.js` is the
  second-to-last step of `test:kaola-workflow:claude` in `package.json:40`.
  Confirmed.

## Claim 7 — the ADR row's opencode measurements — **CONFIRMED (both parts)**

Baseline on a mirror: `opencode-edition test passed (563 assertions).` exit 0,
307 bytes of output.

| leg | edit | result |
|---|---|---|
| conditional | `if (sourceEdits.length)` → `if (sourceEdits.length && !flag)` at `sync-opencode-edition.js:855` | `passed (563 assertions)` exit 0; `cmp /tmp/oc-base.out /tmp/oc-mutA.out` → identical |
| unconditional | `const sourceEdits = mismatches.filter(…)` → `const sourceEdits = []` at `:854` | `passed (563 assertions)` exit 0; `cmp` → identical |

Both legs: green at 563/563, exit 0, **byte-identical** output. Confirmed.

Doc citations: `docs/opencode-edition.md:349-353` is exactly the
"**Anything only a source edit clears** … the file is named with a line saying no
flag of this script clears it …" bullet; `:362` is the rendered footer verbatim.
Both confirmed. `git grep -n 'opencode-edition\.md' -- scripts/ templates/ hooks/`
returns nothing, so "no script consumes that doc" holds.

Also re-derived, since the row cites it: `test-kimi-edition.js:1324-1414` is K12
(`K12 — THIS EDITION'S REMEDIATION LINE IS CORRECT, AND STAYS CORRECT.` … through
the closing brace at 1414). On a mirror with the three `.kimi*` trees regenerated
(`sync-kimi-edition.js --forge=<f> --write`; the checkout's own trees are stale
and red D0 before the baseline): baseline `kimi-edition test passed (521
assertions).` exit 0; deleting the `Fix:` line at `sync-kimi-edition.js:814`
gives `FAIL: K12: --check hands the reader a runnable command` +
`FAIL: K12: running what --check advised clears the whole report` and
`kimi-edition test FAILED: 2 failure(s), 518 passed.` The row's
"521 / exit 0 → 2 failures / 518 passed" is **exact**. (518+2=520≠521 is not an
error: one assertion sits inside `for (const cmd of advised)`, which ranges over
an empty list once the command is gone.)

## Claim 8 — the "+2 … cannot see the unconditional form at all" sizing — **REFUTED**

Built both variants as a probe guard inserted after
`const advised = advisedCommands(c0.out); adviceSeen += advised.length;` in
`scripts/test-opencode-edition.js`, asserting each `flagProof` path occurs ≥ 2
times in `c0.out`.

`flagProof` is non-empty in exactly 3 of the 6 `SCENARIOS`
(`test-opencode-edition.js:2723-2730`): `['unregistered canonical plugin']`,
`['stale user-owned opencode.json', 'unregistered canonical plugin']`,
`['stale generated agent', 'unregistered canonical plugin']`.

| variant | gate | baseline | conditional leg | unconditional leg |
|---|---|---|---|---|
| wide | `if (flagProof.length)` | **566** passed, exit 0 | 2 failures / 564 passed — scenarios 5 and 6; scenario 3 (advises no flag) survives | **3 failures** / 563 passed — all three |
| scoped | `if (flagProof.length && advised.length)` | **565** passed, exit 0 | 2 failures / 563 passed | **2 failures** / 563 passed — scenarios 5 and 6 |

- "+3 assertions (563→566)" — **CONFIRMED** (566 measured).
- "3 of 6 scenarios" — **CONFIRMED**.
- "conditional form on 2 of 3 (it survives the scenario that advises no flag)" —
  **CONFIRMED**; the survivor is `A30[unregistered canonical plugin]`, which has
  `someFlagHelps === false` and `advised === []`.
- "unconditional on 3 of 3" — **CONFIRMED**.
- "+2" for the flag-advised scoping — **CONFIRMED** (565 measured).
- **"and cannot see the unconditional form at all" — REFUTED.** The scoped guard
  reds under the unconditional leg, exit 1, on both scenarios it covers:

```
FAIL: A30[stale user-owned opencode.json + unregistered canonical plugin]: PROBE(scoped) …
FAIL: A30[stale generated agent + unregistered canonical plugin]: PROBE(scoped) …
opencode-edition test FAILED: 2 failure(s), 563 passed.
```

  Both partitions of "flag-advised" agree, so no reading rescues it:
  `advised.length` and `someFlagHelps` cut the six scenarios identically
  (scenario 3 is the only flagProof scenario with neither).

**Corrected wording the evidence supports:**

> Scope it to the flag-advised scenarios instead and it sizes to +2, still
> catches both forms, but loses the flag-free scenario — the pure
> flag-irreducible case — so the unconditional form is caught on 2 of 3 sites
> rather than 3 of 3.

## Claim 9 — the CHANGELOG #950 entry — **split: "nothing changed" CONFIRMED; "two months" ambiguous; two further defects in the same entry**

**9a — "nothing about the subject of the claim changed at all": CONFIRMED** for
the floor. Byte-identical source region across 2026-08-01 → 2026-08-11 (claim 6
evidence). Caveat: the *quoted* claim names `test-route-reachability` — the
suite, which did change (325 → 331, plus the new band). The surrounding two
sentences establish the floor framing, so this reads as intended, but "the
subject of the claim" is doing work the quoted sentence does not support. A
one-word fix removes it: "nothing about the **floor** the claim describes changed
at all."

**9b — "a hand-typed literal that predates it by two months": ambiguous
antecedent; true on one reading only.**

```
codexEditions (f61f4ce5) -> T19b band (97df0d6f):     60d 0h 3m
codexEditions (f61f4ce5) -> the sentence (40486659):  50d 9h 18m
```

`… An unrelated band landed beside it nine days later, measuring a different
universe against a hand-typed literal that predates **it** by two months …` —
the first `it` is the doc sentence, so a reader carries that referent forward,
and under it "two months" overstates 50 days. Under the band reading it is
60 days, one day short of two calendar months — accurate. **Fix by naming the
referent:** "…against a hand-typed literal that predates **that band** by two
months".

**9c — "All three sites carrying the stale claim moved together … the table row
above it (marked as history rather than rewritten)" — REFUTED.** Two sites moved.
The `docs/conventions.md` diff is a single hunk, `@@ -322,8 +322,22 @@`; line 315
is untouched and carries no marking — the only "history" framing is the table's
pre-existing past-tense preamble, which predates this change and was not written
for it. As written the sentence is also self-contradictory: a row "marked as
history rather than rewritten" did not "move".

**Corrected wording:** "Two of the three sites carrying the stale claim moved:
the prose and a source comment in `scripts/test-route-reachability.js` …. The
table row above is left standing as the historical observation it records."
(And see claim 5 — leaving it standing is only defensible if the clause is dated.)

**9d — "The paragraph quotes no assertion total." — REFUTED as written, and it
mirrors a self-contradiction now living in `docs/conventions.md`.** The new
second paragraph, `docs/conventions.md:336-340`, opens `Quote no assertion total
in this paragraph.` and closes `… the run evaluates **324** passed and **1**
failed, summing to the very **325** it used to assert`. Three assertion totals,
in the paragraph that forbids them. The intended referent is plainly the rule's
illustration above (which, correctly, now quotes none), but "this paragraph"
binds to the paragraph the reader is in.

**Corrected wording:** conventions.md → `Quote no assertion total in the rule's
illustration above.`; CHANGELOG → `The rule's illustration now quotes no
assertion total.`

---

## Cross-file contradiction sweep (all four files, corrected state)

Checked and **clean**:

- conventions.md's re-pointed counter-example (`testAxiomBlockByteIdentity`)
  matches the CHANGELOG's ("re-pointed at the walkthrough's
  `testAxiomBlockByteIdentity`") and the walkthrough's own comment at
  `simulate-workflow-walkthrough.js:12012-12021`, which does say so where it is
  written — satisfying "says so where it is written".
- The source comment's "hand-typed codexEditions literal above" agrees with
  conventions.md's "hand-typed `codexEditions` literal".
- CHANGELOG's "the plain total is indeed 331" agrees with the measured 331.
- CHANGELOG's #951 numbers agree with the ADR row's, and both agree with
  measurement (563/563, byte-identical, K12 521→518+2).
- The `test-route-reachability.js` diff is comment-only; the suite still runs at
  331, exit 0, in the real tree.
- The only remaining live carrier of the stale claim is
  `docs/conventions.md:315` (claim 5).

Contradictions found: claim 5 (row vs. the paragraph below it), 9c (CHANGELOG vs.
the diff), 9d (conventions.md vs. itself, and CHANGELOG vs. conventions.md).

## ADR watch-list table integrity — **CONFIRMED, and repaired by this diff**

`docs/decisions/0017-the-mission-list.md` lines 134-147: one contiguous table,
header + separator + 12 data rows, **3 columns on every row** (counted after
stripping the escaped `\|` inside the regex on line 144).

At HEAD there was a **blank line at 146** splitting it into two tables; the diff
removes it, so the "an edition-sync mismatch class shipped without a remedy" row
rejoins the table and the new opencode row appends cleanly. That is a real
repair, not a regression.

## Scope not measured

- The **full walkthrough** was not run. No claim under review depends on it: the
  diff is prose plus one comment block, the one walkthrough scenario that is
  load-bearing (`testAxiomBlockByteIdentity`) was run directly under both legs,
  and defects were already established, so an ~9-minute run could not change any
  verdict here. Stated rather than implied.
- The ADR row's "Severity is bounded for the conditional form only: the line
  reappears on the re-check once the advised command runs" was **not**
  independently measured. It is consistent with `remediationLines`
  (`sync-opencode-edition.js:842-859`: once the flag-clearable classes are gone,
  `flag` is `''` and the mutated guard's `&& !flag` no longer suppresses the
  footer) and with A30's outcome assertions staying green under that leg, but it
  is an inference here, not a run.
- Observation, not a defect: the newly chosen counter-example lives in the
  walkthrough, which the fast gate samples at `--shard auto/12`
  (`package.json:40`), whereas the retired one ran at full scope in that chain.
  The prose makes no coverage claim about it, so nothing is wrong — but the
  counter-example is now one the fast gate usually does not execute.
