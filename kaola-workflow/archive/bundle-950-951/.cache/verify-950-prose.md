# verify-950-prose — adversarial falsification of the #950/#951 prose diff

- role: adversarial-verifier
- date: 2026-08-11
- repo: /Users/ylpromax5/Workspace/Kaola-Workflow, branch main, HEAD 580c6019
- surface: the uncommitted working-tree diff to `docs/conventions.md`,
  `docs/decisions/0017-the-mission-list.md`, `scripts/test-route-reachability.js`
- method: every mutation performed on `cp -Rc` scratch mirrors under
  `/private/tmp/claude-501/.../scratchpad/`. No tracked file in the real repo was written.
- analytical result: **refuted** (four demonstrated counterexamples; the remainder not refuted)

## Snapshot integrity note

At review start `git status --short` listed exactly three modified files. Partway through,
`CHANGELOG.md` also became modified by another agent in this session. The three assigned files
were re-hashed against my mirror at the end and are **byte-identical** to what I measured, so
every result below stands. The new `CHANGELOG.md` text was read and one finding (R5) reproduces
in it.

---

## Baselines (mirror-base = the working tree as given)

```
$ node scripts/test-generate-routing-surfaces.js
test-generate-routing-surfaces: all 434 assertions passed.          exit 0

$ node scripts/test-route-reachability.js
Route-reachability test passed (331 assertions).                    exit 0

$ node scripts/simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity
testAxiomBlockByteIdentity: PASSED (12 surfaces)                    exit 0

$ node scripts/simulate-workflow-walkthrough.js            # full, detached
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,
           "scenarios":209,"ran":209,"passed":209,"failed":0}
Workflow walkthrough simulation passed                              exit 0

$ node scripts/test-opencode-edition.js
opencode-edition test passed (563 assertions).                      exit 0

$ node scripts/test-kimi-edition.js
kimi-edition test FAILED: D0[github]: .kimi is present on disk and has DRIFTED   exit 1
```

The kimi red is **pre-existing local-tree state**, not the diff: `.kimi*` and `.opencode*` are
gitignored generated trees, and this checkout's `.kimi/skills/kaola-role-synthesizer/SKILL.md` is
stale. Regenerating the three kimi trees on a mirror
(`node scripts/sync-kimi-edition.js --forge={github,gitlab,gitea} --write`) yields
`kimi-edition test passed (521 assertions).` exit 0 — the baseline claim 10 asserts.

## The mutation

Delete one forge from **both** edition tables in `scripts/generate-routing-surfaces.js:66-75`.
Run twice, once removing `gitea` and once removing `gitlab`; **every number below is identical
for both**, so no result depends on which forge is chosen.

```
$ node -e "…remove { forge: 'gitea', … } from COMMAND_EDITIONS and SKILL_EDITIONS…"
$ node -e "const g=require('./scripts/generate-routing-surfaces.js');
           console.log(g.FORGES, g.GENERATED_SURFACES.length)"
[ 'github', 'gitlab' ] 12
```

---

# Claim-by-claim

## 1. `registry derives 18 surfaces` fails at 18→12 — **CONFIRMED**

```
$ node scripts/test-generate-routing-surfaces.js          # mutated mirror
  FAIL: registry derives 18 surfaces (3 topics x 6)
    expected: 18
    actual:   12
…19 further FAILs…                                        exit 1
```

Assertion name confirmed verbatim at `scripts/test-generate-routing-surfaces.js:239`
(`'registry derives 18 surfaces (3 topics x 6)'`); the prose quotes the leading fragment, which
is fair. Both numbers exact. Identical with `gitlab` removed instead.

Non-blocking nuance: the suite does not run to completion under this mutation — after the FAILs
it throws `TypeError: Cannot read properties of undefined (reading 'replace')` at
`test-generate-routing-surfaces.js:432`. The named assertion still fires first, so the claim is
true as written; the crash is not something the prose asserts about.

## 2. `testAxiomBlockByteIdentity` passes at 12→8 surfaces — **CONFIRMED**

```
base:    testAxiomBlockByteIdentity: PASSED (12 surfaces)   exit 0
mutated: testAxiomBlockByteIdentity: PASSED (8 surfaces)    exit 0
```

Stronger than claimed: the **full** walkthrough also passes on the mutant —
`scenarios:209,ran:209,passed:209,failed:0`, terminal marker
`Workflow walkthrough simulation passed` present in both the base and mutant full logs. So the
mutation reds nothing at all in the walkthrough.

## 3. Width is `FORGES.length × (2 + runtimeEditionCount)` — **CONFIRMED**

`scripts/simulate-workflow-walkthrough.js:12024`:

```js
const expected = routing.FORGES.length * (2 + runtimeEditionCount); // claude + codex + each additive runtime
```

`FORGES` is genuinely derived, not restated — `scripts/generate-routing-surfaces.js:134-141`
builds it from `COMMAND_EDITIONS.map(e => e.forge)` and throws if the skill table disagrees.
Measured to shrink: `["github","gitlab"]` under the mutation, giving 2 × (2 + 2) = 8.

## 4. `test-route-reachability` now reds at `T19b universe: … 6 … found 4` — **CONFIRMED**

(a) `codexEditions` is a hand-typed literal — `scripts/test-route-reachability.js:141-145`, three
object literals with `name`/`skillsDir` strings. Not registry-derived.

(b) and (c):

```
$ node scripts/test-route-reachability.js                  # mutated mirror
FAIL: T19b universe: the routing instruction ships on 6 generated surfaces — found 4 (…)

Route-reachability test FAILED: 1 failure(s), 324 passed.  exit 1
```

Text matches the prose's elision exactly.

(d) Causal claim confirmed at source and by bisect. `test-route-reachability.js:551-553` is
literally `routingSurfaces.length === codexEditions.length * 2`, so the expectation is the
hand-typed literal while `routingSurfaces` is filtered from the registry's `GENERATED_SURFACES`.
Bisected:

```
97df0d6f^  mutated → Route-reachability test passed (298 assertions).   exit 0
97df0d6f   mutated → FAILED: 1 failure(s), 324 passed.                  exit 1
```

97df0d6f is the commit that introduced the `T19b universe` assertion. Nothing earlier in the file
made the suite red under this mutation.

## 5. "exact when written and false nine days later" — **REFUTED (partially)**

The **green** half is exactly right. The **total** half is wrong by nine days.

Written at `40486659` (2026-08-01 07:08:51 +0800), which is the only commit that introduced
`325 assertions` into `docs/conventions.md`. At that commit:

```
$ node scripts/test-route-reachability.js                 # worktree at 40486659
base:    Route-reachability test passed (325 assertions).  exit 0
mutated: Route-reachability test passed (325 assertions).  exit 0
```

So "stays green at an unchanged 325 assertions" was **literally, exactly true** when written.

Broken at `97df0d6f` (2026-08-10 21:53:42 +0800). 2026-08-01 → 2026-08-10 is **nine days**
(9 d 14 h 45 m exact). The nine-day interval is correct — **for the green claim**.

But the sentence attributes the nine days to *"the total"*, and the total went stale the **same
day**, 4 h 43 m later:

```
$ git log -1 --format='%H %ad' --date=iso 6fdbf714
6fdbf714b1f05de14a95784dc1912b8cf69d54e7 2026-08-01 11:51:29 +0800
$ node scripts/test-route-reachability.js                 # worktree at 6fdbf714
base:    Route-reachability test passed (323 assertions).  exit 0
mutated: Route-reachability test passed (323 assertions).  exit 0
```

Full trajectory of the baseline total across the window:

| commit | date | baseline assertions |
|---|---|---|
| `40486659` | 2026-08-01 07:08 | **325** ← sentence written |
| `6fdbf714` | 2026-08-01 11:51 | 323 |
| `ce7ec829` | 2026-08-02 23:32 | 456 |
| `11e20a8d` | 2026-08-03 00:52 | 426 |
| `17296a65` | 2026-08-03 09:46 | 298 |
| `97df0d6f` | 2026-08-10 21:53 | 331 ← green claim breaks |

This matters because the sentence exists to teach *"quote no assertion total"*. The real lesson is
sharper than the one shipped: the numeral was stale within five hours, and what survived nine days
was the *claim*. Corrected wording the evidence supports:

> Quote no assertion total in this paragraph. The suites print their own, and the numeral this
> sentence once carried went stale the same day it was written — four hours later; what survived
> nine days was the claim it decorated, until a sibling assertion inverted that too.

## 6. "arithmetic coincidence left the stale numeral still reachable" — **CONFIRMED (arithmetic)**

```
Route-reachability test FAILED: 1 failure(s), 324 passed.
```

324 + 1 = **exactly 325**. Identical with `gitlab` removed. The clause is right.

The trailing causal claim — *"so checking it confirmed a sentence whose claim had already
inverted"* — is a statement about a past verification act and is **UNVERIFIABLE** from the repo.
It is also in mild tension with what the suite actually prints under the mutation: the terminal
line is `Route-reachability test FAILED`, and the numeral 325 never appears as such — a checker has
to sum 324 + 1 while ignoring the word FAILED. Non-blocking; flagged as narrative, not measurement.

## 7. The MANIFEST floor stays green at 12→8 — **CONFIRMED (the crux of the repair)**

Instrumented the floor on probe copies of both trees
(`console.error` of `expected`/`actual` inserted immediately after
`test-route-reachability.js:783`):

```
BASELINE: ##FLOORPROBE expected=12 actual=12 forges=3 tracked=2 modules=2
          Route-reachability test passed (331 assertions).   exit 0

MUTATED:  ##FLOORPROBE expected=8  actual=8  forges=2 tracked=2 modules=2
          FAIL: T19b universe: …
          Route-reachability test FAILED: 1 failure(s), 324 passed.
```

The floor's own assertion is **not** among the failures — the suite reports exactly one failure and
it is T19b. The repaired comment's crux holds: the floor is 12→8, expectation and measurement move
in lockstep, and it stays green.

## 8. T19b's expectation is the hand-typed literal — **CONFIRMED**

`scripts/test-route-reachability.js:551` uses `codexEditions.length * 2` (literal at :141-145,
i.e. genuinely "above" the comment at :755-768) against `routingSurfaces` filtered from
`GENERATED_SURFACES`. Under the mutation the expectation stays 6 while the measurement drops to 4 —
it does not shrink with the registry, exactly as stated.

## 9. Both `sourceEdits` mutations leave 563/563 exit 0 — **CONFIRMED, with the byte-identity qualifier REFUTED**

Two independent mirrors, one-line mutations at `scripts/sync-opencode-edition.js:854`:

```
leg A (conditional):   const sourceEdits = flag ? [] : mismatches.filter(…).map(m => m.rel);
leg B (unconditional): const sourceEdits = [];
```

```
baseline: opencode-edition test passed (563 assertions). […3 tree(s) in parity…]   exit 0
leg A:    opencode-edition test passed (563 assertions). […3 tree(s) in parity…]   exit 0
leg B:    opencode-edition test passed (563 assertions). […3 tree(s) in parity…]   exit 0
```

Green at 563/563, exit 0, for both legs — **confirmed**.

The qualifier *"the unconditional leg byte-identical to baseline"* singles out leg B. Measured,
**both legs are byte-identical**, on combined output, on split streams, and by md5:

```
$ md5 -q base-opencode.log oc-A.log oc-B.log
a567b3cbeb18cb11e079b65d48467332
a567b3cbeb18cb11e079b65d48467332
a567b3cbeb18cb11e079b65d48467332

$ # split streams, all three trees
mirror-base  exit=0 outbytes=307 errbytes=0
mirror-oc-A  exit=0 outbytes=307 errbytes=0
mirror-oc-B  exit=0 outbytes=307 errbytes=0
stdout md5 ×3: a567b3cb…   stderr md5 ×3: d41d8cd9… (empty)

$ # determinism control — baseline run twice
a567b3cbeb18cb11e079b65d48467332  ×2
```

Singling out one leg tells a reader the conditional leg left *some* trace. It left none. The
sentence is stronger without the qualifier, not weaker.

Supporting sub-claims all **confirmed**:

- *"A30 quantifies over `ADVICE_RE` runnable invocations and the footer is prose, so it never
  enters `advised`."* — `test-opencode-edition.js:2613`:
  `const ADVICE_RE = /node\s+\S*sync-opencode-edition\.js[^\n\`'"&;]*/g`. The footer
  (`No flag of this script clears … — apply the source edit …`) contains no such invocation.
- *"Severity is bounded for the conditional form only: the line reappears on the re-check once the
  advised command runs."* — measured on a planted leg-A scratch (rogue plugin + stale agent):

```
--- leg A, first --check (flag advised) ---
sync-opencode-edition[github]: PARITY FAILED (2 file(s)):
  - .opencode/agent/adversarial-verifier.md — stale — regenerate
  - templates/opencode/plugins/probe-rogue.js — unregistered plugin … add it to the allowlist
Fix: node scripts/sync-opencode-edition.js --forge=github --write        ← footer suppressed

--- after running the advised command, re-check ---
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - templates/opencode/plugins/probe-rogue.js — unregistered plugin … add it to the allowlist
No flag of this script clears templates/opencode/plugins/probe-rogue.js — apply the source edit
its reason names above.                                                  ← footer returns
```

- *"Under the unconditional form it never appears at all"* — measured on leg B with the
  source-edit class **alone** (no flag advised, the case most likely to surface it):

```
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - templates/opencode/plugins/probe-rogue.js — unregistered plugin … add it to the allowlist
exit=1
```

No remediation line of any kind. Confirmed, and it is the worse of the two.

## 10. K12 at `test-kimi-edition.js:1324-1414`, 521/exit 0 → 2 failures/518 passed — **CONFIRMED**

Line range exact: 1324 is the `// ---` banner opening the K12 comment; 1414 is the block's closing
brace; 1416 begins the epilogue. Both endpoints correct.

Mutation: delete `scripts/sync-kimi-edition.js:814`
(`console.error('Fix: node scripts/sync-kimi-edition.js --forge=' + forge + ' --write');`), on a
mirror whose `.kimi*` trees were first regenerated so the baseline is reachable.

```
baseline: kimi-edition test passed (521 assertions). […3 tree(s) in parity…]        exit 0
mutated:  FAIL: K12: --check hands the reader a runnable command — …
          FAIL: K12: running what --check advised clears the whole report — exit 1, left […]
          kimi-edition test FAILED: 2 failure(s), 518 passed.                       exit 1
```

Exactly two failures, both K12, exactly 518 passed. (518 + 2 = 520, one short of 521, because the
`--write-config` assertion nested inside `for (const cmd of advised)` no longer executes when
`advised` is empty — the arithmetic is self-consistent.)

## 11. "+3 assertions (563→566) across the 3 of 6 scenarios where `flagProof` is non-empty" — **CONFIRMED (arithmetic), with one wording inconsistency**

`test-opencode-edition.js:2723-2730` lists exactly 6 scenarios. `flagProof` is
`ids.filter(i => CLASSES[i].clearedBy === 'none')` (:2736), and the only class with
`clearedBy: 'none'` is `unregistered canonical plugin` (:2705). It appears in scenarios 3, 5 and 6
— **3 of 6**. One added assertion per such scenario is +3, 563→566. Self-consistent.

Catch rates are self-consistent too: under leg A the footer survives in scenario 3 (no flag
advised there) and is dropped in 5 and 6 → 2 of 3; under leg B it is dropped in all → 3 of 3.

Inconsistency: the row states the guard as *"assert the flag-irreducible path is named at least
twice **whenever a flag is also advised**"*. That guard fires in scenarios 5 and 6 only — **2**
scenarios, not 3 — which does not yield +3 and cannot catch leg B in scenario 3. The count is
right for a guard applied to all three flagProof-non-empty scenarios; the stated condition
describes a narrower guard. This is an unbuilt proposal, so it is low severity, but the two halves
of the same sentence size different mechanisms.

## 12. `docs/opencode-edition.md:362` verbatim, rule at `:348-352`, no consumer — **REFUTED on the line range**

Line 362, exact:

```
No flag of this script clears templates/opencode/plugins/probe-unregistered.js — apply the source edit its reason names above.
```

Verbatim, matching `sync-opencode-edition.js:856-857`'s single-file rendering. **Confirmed.**

The rule is at **349-353**, not 348-352 — off by one at both ends:

```
348	  `--write` alone preserves that file and would leave it stale while `--check` kept failing.
349	- **Anything only a source edit clears** (today: the plugin-allowlist class above — a `*.js` in
350	  `templates/opencode/plugins/` missing from `PLUGIN_SCRIPTS`) → the file is named with a line
351	  saying no flag of this script clears it. When the set contains *nothing else*, no invocation of
352	  this script is offered at all, so a command printed under the reasons is never mistaken for the
353	  fix.
```

348 is the tail of the *previous* bullet (about `--write-config`); 353 carries the rule's last
word. A reader following the citation opens on the wrong bullet and loses the rule's conclusion.
`docs/opencode-edition.md` is not modified by this diff, so the number is wrong as it stands.

"No script consumes that doc" — **confirmed**. `git grep -l "opencode-edition" -- ':!*.md'` returns
only `install-opencode.sh` (whose four matches are all `sync-opencode-edition.js`, the script) plus
archived `.cache/*.json` run records. No script reads the doc: `prose-census` scans only `.js` files
under `CENSUS_SCRIPT_DIRS` plus `GENERATED_SURFACES`; `gap-sweep` reads only `.cache/`; the only
doc paths any script pins are `docs/api.md`, `docs/workflow-state-contract.md` and
`docs/agents-source.md` (`kaola-workflow-adaptive-schema.js:908-910`,
`kaola-workflow-validation-runner.js:35-37`). Nothing globs `docs/*.md` for content.

## 13. Token-level output pin has precedent at `:2818` — **CONFIRMED**

`scripts/test-opencode-edition.js:2818`:

```js
        assert(c0.out.includes('PLUGIN_SCRIPTS'),
```

A raw-output substring assertion on a single token, exactly as characterised.

---

# Unprompted checks

## `*(since re-anchored)*` — **REFUTED**, and this is the sharpest finding

`docs/conventions.md:315`:

```
| `test-route-reachability` *(since re-anchored)* | a universe derived from the edition tables | the forge term was the registry measuring itself — 12→8 surfaces, unchanged assertion count |
```

The markdown renders fine (emphasis around parens; the table is 3 columns on every row, 309-315).
The **claim** does not survive.

The row's "Its subject" column names *a universe derived from the edition tables* — the MANIFEST
floor. That floor has **not** been re-anchored, and the same diff says so twice:

- `scripts/test-route-reachability.js:759-760` (added by this diff): "THIS FLOOR stays green —
  mutation-proved, and **left registry-derived on that basis rather than re-anchored**."
- `docs/conventions.md:327-328` (added by this diff): "That floor is left derived on purpose."

And measured: `##FLOORPROBE expected=8 actual=8` — still derived, still green, still in lockstep.

What actually changed is that a **sibling** assertion (T19b) began comparing a registry-derived
count against a pre-existing hand-typed literal, so the *suite* reds. The guard the row names was
not repaired. `*(since re-anchored)*` tells a reader this row is closed; the shipped code says it
was deliberately left open.

The past tense in the third cell compounds it: "the forge term **was** the registry measuring
itself" reads as no-longer-true, and it is still true.

Corrected wording the evidence supports:

> | `test-route-reachability` *(the suite now reds — via a sibling assertion, not this floor)* | a universe derived from the edition tables | the forge term is still the registry measuring itself — 12→8 surfaces, and this floor stays green |

## The nine-days sentence in the code comment — **REFUTED**

`scripts/test-route-reachability.js:767-768` (added by this diff):

> A comment asserting a mutation proof stays true only for the assertion it is written against;
> this one said "this suite" for nine days after a sibling assertion had already broken the claim.

"had already broken" is pluperfect: it places the nine days **after** the break. Measured, the
nine days are **before** it.

```
comment written  523f1241  2026-08-01 01:29:58 +0800   ("unchanged assertion count")
claim broken     97df0d6f  2026-08-10 21:53:42 +0800   (T19b universe added)
today                      2026-08-11
```

The comment was accurate for nine days and wrong for roughly one. As written it asserts nine days
of undetected wrongness, which is nine times the real exposure and inverts the timeline. Corrected
wording:

> …this one stayed true for nine days and then said "this suite" for a day after a sibling
> assertion had broken the claim.

## ADR watch-list table structure — **CONFIRMED as one table**

The removed blank line does what it was meant to. Header at :134, delimiter at :135, rows
:136-147, blank lines only at :133 and :148. Unescaped-pipe count is **4 on every one of the 14
lines → 3 columns throughout**:

```
$ perl -ne 'if($.>=134 && $.<=148){ $c=()=($_ =~ /(?<!\\)\|/g); printf "%d\t%d\n", $., $c }' \
    docs/decisions/0017-the-mission-list.md
134..147 → 4      148 → 0
```

Line 144's regex pipe is correctly escaped as `(project\|sess)`, so it does not split a cell. Before
the diff the `edition-sync` row sat below a blank line and therefore rendered as a literal
paragraph, not a table row — merging it was a real repair, and it landed correctly.

## Self-contradiction sweep

- `*(since re-anchored)*` vs. "left registry-derived … rather than re-anchored" — see above,
  same commit, direct contradiction.
- `docs/conventions.md:328-329`: "until **its** forge term acquired an absolute of its own". The
  *floor's* forge term acquired nothing; a different assertion in the same file has a hand-typed
  forge expectation. True at suite granularity, imprecise at the granularity the rest of the
  paragraph works at — and the code comment this diff writes gets it right ("The floor, not the
  suite"). Low severity, wording only.
- `docs/conventions.md:327-328` "That floor is left derived on purpose, and says so where it is
  written" — verified true: `simulate-workflow-walkthrough.js:12014-12021` says exactly that, and
  correctly scopes itself to "this floor", not the suite.
- `CHANGELOG.md:70` (joined the diff mid-review) repeats "the unconditional leg byte-identical to
  baseline" — the same over-selective qualifier as R5, now on a second surface.

## Suites the diff touches

`scripts/test-route-reachability.js` is the only script in the diff.

```
$ node scripts/test-route-reachability.js
Route-reachability test passed (331 assertions).                             exit 0
$ node scripts/test-generate-routing-surfaces.js
test-generate-routing-surfaces: all 434 assertions passed.                   exit 0
$ node scripts/simulate-workflow-walkthrough.js
209/209 scenarios, Workflow walkthrough simulation passed                    exit 0
$ node scripts/test-opencode-edition.js
opencode-edition test passed (563 assertions).                               exit 0
```

No script consumes `docs/conventions.md` or `docs/decisions/0017-the-mission-list.md` as content
(only `// See docs/conventions.md` pointers in error strings), so the two doc edits are inert to
every suite.

---

# Findings

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=docs/conventions.md:315 marks test-route-reachability "*(since re-anchored)*" while the same diff's code comment and prose both say the floor was deliberately left registry-derived; measured expected=8 actual=8, still derived, still green
finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=docs/conventions.md:332-333 attributes "false nine days later" to the assertion total; the total went stale the same day (325 at 40486659 07:08, 323 at 6fdbf714 11:51) — nine days is correct only for the green claim
finding: id=R3 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=scripts/test-route-reachability.js:767-768 places the nine days after the break; measured the comment was true for nine days (2026-08-01 to 2026-08-10) and wrong for about one
finding: id=R4 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=ADR row cites the opencode-edition.md rule at :348-352; it is at :349-353, so 348 lands on the previous bullet and the rule's last line is cut
finding: id=R5 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=ADR row and CHANGELOG.md:70 single out "the unconditional leg byte-identical to baseline"; both legs are byte-identical on stdout, stderr and md5, with a two-run determinism control
finding: id=R6 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=ADR row sizes the proposed guard as firing "whenever a flag is also advised" (2 scenarios) but counts +3 across the 3 flagProof-non-empty scenarios; the condition and the arithmetic size different mechanisms
finding: id=R7 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=docs/conventions.md:328-329 says "its forge term acquired an absolute"; the floor's forge term acquired nothing — a sibling assertion carries the hand-typed expectation, as the code comment in the same diff states correctly
finding: id=R8 scope=out_of_scope action=none status=open severity=low fix_role=none rationale=this checkout's gitignored .kimi tree is stale so test-kimi-edition.js reds at D0 before reaching its 521 baseline; pre-existing local state, not the diff, but claim 10's baseline is unreachable here without regenerating first

## Not refuted

Claims 1, 2, 3, 4, 6 (arithmetic), 7, 8, 9 (the 563/563 exit-0 result and every supporting
sub-claim), 10, 11 (arithmetic), 12 (verbatim line + no-consumer), 13, and the ADR table merge all
survived every counterexample attempted, including running the mutation twice with a different
forge removed each time and running the walkthrough at full scope on both trees.

## Confidence

High on R1-R5 and on every confirmed claim: each rests on a run with a stated command and exact
output, with controls (determinism re-run, forge-choice repeat, historical bisect with a green
parent). Moderate on R6-R7, which are readings of unbuilt-proposal wording rather than
measurements. The causal narrative in claim 6 ("checking it confirmed a sentence") remains
**unverifiable** and is reported as such, not as confirmed.

verdict: fail
findings_blocking: 7
