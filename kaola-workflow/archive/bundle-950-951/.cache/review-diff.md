# Code review — uncommitted working-tree diff, bundle-950-951

Reviewed: `git diff` at `/Users/ylpromax5/Workspace/Kaola-Workflow`, branch `main`, base `580c6019`.

**Scope note.** At review start the diff was three files (`docs/conventions.md`,
`docs/decisions/0017-the-mission-list.md`, `scripts/test-route-reachability.js`). `CHANGELOG.md`
landed **mid-review** (another agent's write) and is included below, since the dispatch scoped this
review to the working-tree diff rather than to a fixed file list.

Verdict in one line: **the mechanism of both repairs is right and every suite is green; three prose
accuracy defects remain, all in the annotations, none runtime-affecting.** The most serious is that
`docs/conventions.md` now says `test-route-reachability` was "re-anchored" while the source comment
this same diff writes says the opposite in the same breath.

---

## Findings

### R1 — MEDIUM — "(since re-anchored)" attributes an absolute to a floor that is still fully derived

**Anchors.** `docs/conventions.md:315` (primary); `docs/conventions.md:328-330`; `CHANGELOG.md:47-48`
and `CHANGELOG.md:44-45`; contradicted by `scripts/test-route-reachability.js:759-760` in the same diff.

**What the diff says.**

- `docs/conventions.md:315` — `| \`test-route-reachability\` *(since re-anchored)* | a universe derived
  from the edition tables | the forge term **was** the registry measuring itself … |`
- `docs/conventions.md:328-330` — "`test-route-reachability` held the green side of this contrast
  until **its forge term acquired an absolute of its own** — `codexEditions` is a hand-typed literal"
- `CHANGELOG.md:47-48` — "because a later fix **gave its forge term** a hand-typed absolute of its own"
  and "…when **the very repair the surrounding rule prescribes was applied to the guard** the rule was
  holding up as its counter-example."

**What is actually true.**

1. **Nothing was re-anchored.** The row's subject column is "a universe derived from the edition
   tables" — that is the MANIFEST anti-vacuity floor at `scripts/test-route-reachability.js:782`:

   ```js
   const expected = ROUTING_FORGES.length * (trackedRuntimes + RUNTIME_EDITION_MODULES.length);
   const actual   = MANIFEST_EDITIONS.command.length + MANIFEST_EDITIONS.skill.length;
   ```

   Its forge term is still `ROUTING_FORGES.length`, read from the registry under test. Under the
   forge-deletion mutation: `expected = 2 * (2 + 2) = 8`; `actual = 2 claude + (2 runtimes × 2 forges)
   + 2 skill = 8`. Equal — the floor still passes, exactly as before, and is *designed* to. The same
   diff says so at `scripts/test-route-reachability.js:759-760`: "THIS FLOOR stays green —
   mutation-proved, and **left registry-derived on that basis rather than re-anchored**."

2. **The absolute is not "its forge term" and was not "acquired".** What reds is `T19b universe`
   (`scripts/test-route-reachability.js:551-553`), whose expectation is `codexEditions.length * 2`
   over a *different* universe (6 Codex SKILL surfaces, not the 12 runtime×forge trees the row is
   about). `codexEditions` is not new: `git log -S "const codexEditions = ["` → **f61f4ce5,
   2026-06-11**. It has been a hand-typed literal for two months.

3. **`97df0d6f` was not a repair applied to that guard.** `git show --stat 97df0d6f --
   scripts/test-route-reachability.js` → **+232 lines, 0 deletions**, all of it the new T19b Codex
   role→tier roster band for #944. No pre-existing assertion was touched. So CHANGELOG's "the very
   repair the surrounding rule prescribes was applied to the guard" is false twice: the rule prescribes
   the absolute in a **different file**, and `codexEditions` is in the **same** file; and #944 was a
   new, unrelated guard, not a repair of this one.

**Failure scenario.** An agent reads the five-defect table — which this project treats as rules — sees
`test-route-reachability *(since re-anchored)*` plus the past-tense "the forge term **was** the
registry measuring itself", and concludes the edition-table-derived universe now carries an
independent forge anchor. Acting on that: (a) deletes the "THE BOUNDARY" note at `:755-760` as stale
history; (b) treats `test-generate-routing-surfaces`'s `registry derives 18 surfaces` as redundant for
the forge axis; or (c) cites the row as precedent that a partially-anchored universe *gets* re-anchored,
when the recorded decision — stated twice in this very diff — is to leave it derived. The sharpest
symptom: inside one paragraph, two structurally identical derived floors get opposite labels — the
walkthrough's is "left derived on purpose" (`:327-328`), route-reachability's is "(since re-anchored)".

**Repair direction** (the orchestrator's call, not mine): keep the historical row and the past tense,
but make the marker say what happened — the *suite* now reds on a separate, later assertion — rather
than that the guard in the row was anchored. Same for "its forge term acquired an absolute of its own"
and for the CHANGELOG's "the very repair … was applied to the guard".

---

### R2 — LOW — the new source comment inverts the nine-day interval

**Anchor.** `scripts/test-route-reachability.js:766-768`.

> "A comment asserting a mutation proof stays true only for the assertion it is written against; this
> one said 'this suite' **for nine days after** a sibling assertion had already broken the claim."

**Measured.** The comment was authored at **523f1241, 2026-08-01**
(`git log -S "surfaces to eight and this suite stays green" -- scripts/test-route-reachability.js`).
The claim broke at **97df0d6f, 2026-08-10**. Today is 2026-08-11.

- true for **nine days** (2026-08-01 → 2026-08-10)
- wrong for **one day** (2026-08-10 → 2026-08-11)

The sentence assigns the nine days to the wrong side of the break. The other two sites in this same
diff use the same numeral for the *correct* interval — `docs/conventions.md:332-333` ("exact when
written and false nine days later") and `CHANGELOG.md:46-47` ("was exactly true when written and broke
nine days later") — so one numeral now means opposite things at two sites of one change.

**Failure scenario.** A reader calibrating how long a rotted mutation-proof comment survives undetected
reads 9 days off the code comment; the measured detection latency was 1 day. Low impact, but this is the
diff whose entire subject is a claim that rotted.

---

### R3 — LOW — ADR row's line anchor for the opencode rule is off by one at both ends

**Anchor.** `docs/decisions/0017-the-mission-list.md:147` — "`docs/opencode-edition.md:362` carries the
line verbatim and its rule at `:348-352`".

**Measured.** `:362` is exact (the verbatim `No flag of this script clears …` line). The rule bullet is
**349-353**: `- **Anything only a source edit clears**` opens at 349 and the bullet ends with `fix.` at
353. Line 348 is the tail of the preceding `--write-config` bullet ("`--write` alone preserves that
file…"), which is a different rule.

**Failure scenario.** The ADR states that every row "carries its own recovery information inline" so
that "consulting the table never requires reading a closed issue". A reader following `:348-352` opens
one line early on an unrelated bullet and stops one line short of the rule's conclusion. Trivial, and a
one-character fix.

---

## Verified clean — checks that found nothing

**Markdown integrity (the dispatch's explicit ask).**

- ADR watch list is now **one contiguous table**: header at `:134`, separator `:135`, rows `:136-147`,
  blank line at `:148`, prose from `:149`. No blank line anywhere inside. The deliberate blank-line
  removal did what it was meant to.
- **Every row is 3 columns**, header included (measured by splitting on unescaped `|`; the pre-existing
  regex row at `:144` escapes its pipe correctly, and the new row `:147` contains no literal `|`).
- New ADR row `:147`: 26 backticks (even), 12 `**` markers (even), 2 single `*` (balanced pair around
  *token*). Balanced.
- `docs/conventions.md:315` with `*(since re-anchored)*`: 3 columns, 2 backticks, 2 single `*`.
  Balanced.
- Note, not a defect: the code span `` `FORGES.length × (2 + runtimeEditionCount)` `` at
  `docs/conventions.md:326-327` **wraps a hard line break**. CommonMark folds the newline to a space,
  so it renders correctly — but a literal grep for that span will not find it on one line.

**Comment/code agreement in `scripts/test-route-reachability.js`.** The repaired comment now describes
the code it sits above, with one caveat already filed as R1:

- "THIS FLOOR stays green" — verified by derivation against `:782` (8 == 8 under the mutation). Correct,
  and correctly narrowed from the old "this suite".
- "the same mutation now reds T19b, whose expectation is the hand-typed `codexEditions` literal above" —
  correct: `:551` asserts `routingSurfaces.length === codexEditions.length * 2`; the expectation is 6
  (hand-typed, does not shrink), the measurement falls to 4 (2 forges × 2 Codex SKILLs). `codexEditions`
  is indeed *above*, at `:141-145`.
- The quoted failure text `T19b universe: … 6 … found 4` matches the assert's own message template at
  `:552-553` verbatim under elision.
- "in the always-selected claude chain" — `test-generate-routing-surfaces.js:239` carries
  `eq(GENERATED_SURFACES.length, 18, 'registry derives 18 surfaces (3 topics x 6)')`; 18/3 forges = 6,
  so a deleted forge gives 12. The `18→12` claim is exact.

**The re-pointed counter-example is real.** `simulate-workflow-walkthrough.js:12024` computes
`routing.FORGES.length * (2 + runtimeEditionCount)` → 3 × 4 = 12 today, 2 × 4 = 8 under the mutation,
with `surfaces` shrinking in lockstep on both terms. The prose's "`FORGES.length × (2 +
runtimeEditionCount)`", "12→8", "still registry-derived" and "says so where it is written"
(`:12012-12021`) all hold. I did not re-run the walkthrough (another agent owns it, and the gaps report
already measured 209/209 both sides, differing on exactly one log line).

**No fourth stale site.** Swept tracked files with `git grep -nP "unchanged assertion|stays green
at|\b325\b"` and `git grep -n "route-reachability" -- ':!scripts/'`. Outside the three edited sites the
only hits are: `CHANGELOG.md:47`/`:55`, which *quote* the old sentence as history and are correct to;
`simulate-workflow-walkthrough.js:12017`, which is a different claim and is **true** (both terms
derived); and unrelated `stays green` prose in six ADRs and five suites. The known-bad set is three,
and all three moved.

**#951 scope — the ruling was honoured.** No code change: `scripts/sync-opencode-edition.js` is
untouched, the only `scripts/` edit in the diff is comment-only in `test-route-reachability.js`, and no
guard, wording pin or structural pin was added. The row states "two, neither built" and names both
sized mechanisms. Correctly **not** reported as missing coverage.

**#951 row accuracy — cross-checked against source, not just the premise report.**

- "A30 quantifies over `ADVICE_RE` runnable invocations and the footer is prose, so it never enters
  `advised`" — `ADVICE_RE` at `test-opencode-edition.js:2613` is
  `/node\s+\S*sync-opencode-edition\.js[^\n\`'"&;]*/g`; the footer names no `node` invocation. Correct.
- "563/563, exit 0" for both mutation legs, "unconditional leg byte-identical to baseline" — matches the
  premise measurement; today's unmutated baseline is 563 (I ran it).
- "+3 assertions (563→566) across the 3 of 6 scenarios where `flagProof` is non-empty, catching the
  conditional form on 2 of 3 and the unconditional on 3 of 3" — matches the premise report to the digit;
  `flagProof` exists at `:2736` as `ids.filter(i => CLASSES[i].clearedBy === 'none')`.
- "A prose-sentence pin is refused outright: A30's header derives against it" — accurate; the header at
  `:2556-2560` states the property "as an OUTCOME, never as a wording … a fourteen-way string pin would
  rot on the next class."
- "`K12` (`test-kimi-edition.js:1324-1414`)" — exact block bounds. "(521 / exit 0 → 2 failures / 518
  passed)" transcribes the suite's own printed output faithfully (the 521 vs 518+2 gap is the suite's
  own counting under an aborted assertion, not an arithmetic error in the row).
- "a *token*-level output pin has precedent at `:2818`" — `test-opencode-edition.js:2818` is the
  `PLUGIN_SCRIPTS` output pin. The bare `:2818` follows a `test-kimi-edition.js` reference, but resolves
  unambiguously (kimi's suite is 1421 lines). Not filed.

**Provenance boundary.** `#950`, `#951` and `2026-08-11` appear only in `docs/decisions/` and
`CHANGELOG.md`. Nothing was added to `agents/`, `commands/`, or any `SKILL.md`. No vendor, model or
non-resolving command name enters a consumer-facing artifact. Compliant.

**Speculative additions.** None found. The one addition beyond a minimal correction is the new
"Quote no assertion total in this paragraph" paragraph at `docs/conventions.md:332-335`, and it is
demanded by the observed failure it records (the stale numeral was still *reachable* under the
mutation, so re-checking it confirmed an inverted claim). That is additive derivation, not speculation.
Its second clause is also independently true: the mutation run executes 324 passed + 1 failed = 325.

---

## Suites run (exact)

| command | exit | result |
|---|---|---|
| `node scripts/test-route-reachability.js` | **0** | `Route-reachability test passed (331 assertions).` |
| `node scripts/test-generate-routing-surfaces.js` | **0** | `all 434 assertions passed.` |
| `node scripts/validate-workflow-contracts.js` | **0** | `Workflow contract validation passed` |
| `node scripts/validate-kaola-workflow-contracts.js` | **0** | `Kaola-Workflow Codex contract validation passed` |
| `node scripts/test-finalize-door.js` | **0** | `finalize-door tests passed (458 assertions)` then `(490 assertions)` |
| `node scripts/test-ledger-compare.js` | **0** | `Ledger-compare fence regression passed (40 assertions)` |
| `node scripts/test-opencode-edition.js` | **0** | `opencode-edition test passed (563 assertions). [drift-check: 3 tree(s) in parity]` |
| `node scripts/generate-routing-surfaces.js --check` | **0** | `all 18 surfaces byte-match the skeleton.` |

Not run, by instruction: `simulate-workflow-walkthrough.js` (~9 min, owned by another agent).

Note for the finalize step: `docs/conventions.md` is read by `validate-workflow-contracts.js`,
`validate-kaola-workflow-contracts.js` and `test-opencode-edition.js`, and ADR 0017 by
`test-ledger-compare.js`, `test-finalize-door.js` and `validate-kaola-workflow-contracts.js` — all four
consumers ran green above, so neither edit disturbs a pin.

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=docs/conventions.md:315 marks the guard "(since re-anchored)" and :328-330 plus CHANGELOG:47-48 say its forge term acquired an absolute; the floor at test-route-reachability.js:782 is still ROUTING_FORGES.length-derived and stays green, as the same diff's comment at :759-760 states, and the absolute belongs to the separate T19b band added whole by 97df0d6f using a literal that predates it (f61f4ce5, 2026-06-11)
finding: id=R2 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=scripts/test-route-reachability.js:766-768 says the comment said "this suite" for nine days AFTER the break; measured, it was true for nine days (523f1241 2026-08-01 to 97df0d6f 2026-08-10) and wrong for one, and the other two sites in this diff use the same numeral for the opposite interval
finding: id=R3 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=ADR 0017:147 cites docs/opencode-edition.md:348-352 for the source-edit rule; the bullet is 349-353, so the range opens on the previous bullet's tail and stops one line short of its conclusion (the companion :362 anchor is exact)

verdict: fail
findings_blocking: 3

review_conclusion: Both repairs are mechanically sound and every touched suite exits zero at the counts recorded above, with the #951 no-code ruling honoured exactly and no fourth stale site anywhere in the tracked tree; what remains is three accuracy defects in the annotations themselves, led by a table marker and two prose sentences that credit a re-anchoring which never happened and which the source comment landing beside them explicitly denies.
