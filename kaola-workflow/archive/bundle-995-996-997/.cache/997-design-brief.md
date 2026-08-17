# #997 design brief — the `parseGapSection` contract surface

Read-only mapping. Every path absolute below the repo root
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow`. No file was edited except this one.

**Tooling limit, stated rather than worked around:** this session has no Bash tool, so `gh issue view
848`, `gh issue view 997` and `git log --all --grep="848"` could not be run. Section 7 reconstructs
#848 from the surviving in-repo record (`CHANGELOG.md:2895`, which is a full-paragraph account of what
shipped) and from a grep proving the code it shipped no longer exists in the tree. The issue's own
comment thread was not read; if a comment overrode the body, this brief does not know it.

---

## 1. The function itself — `scripts/kaola-workflow-gap-sweep.js:234-294`

### Return points

Two `return` statements, three logical outcomes:

| line | statement | when |
|---|---|---|
| `:235` | `return null` | `fs.existsSync(summaryPath)` false — no summary file |
| `:293` | `return inSection ? entries : null` | `null` when the `## Run gaps` heading never appeared; otherwise the `entries` array, **possibly empty** |

There is no throw path of its own — `fs.readFileSync` at `:236` can throw, and the one caller that
cares wraps it (`claim.js:2462`). `runCheck` does not wrap it.

### The scan loop (`:242-291`)

- Every line is `trim()`ed into `l` first (`:243`), so indented bullets and trailing whitespace are
  tolerated everywhere below.
- `:244` `/^## Run gaps\s*$/` sets `inSection = true` and `continue`s. Note this test precedes the
  break test, so a **second** `## Run gaps` heading re-enters the section rather than ending it.
- `:249` `if (inSection && /^## /.test(l)) break;` — the section ends at the next `##` heading. This
  is what makes finalize's own `persistValidationToSummary` output (`## Validation` / `## Changed
  Paths`, appended after the orchestrator's section) harmless.
- `:250-251` skip everything outside the section and every line not starting with `- `.

### The strict row regex, `:265`

```js
const m = l.match(/^-\s+(\S+)\s+\((.+?)\):\s+(filed:\s*#(\d+)|noise:\s+(.+))$/);
```

Capture groups:

| group | binds | used at |
|---|---|---|
| `m[1]` | `reasonClass`, `(\S+)` — no whitespace, so `manual:flaky-probe` and `deferred_red_chain` both qualify | `:283`, `:287`, `:289` |
| `m[2]` | `sample`, **lazy** `(.+?)` inside the parens | `:284` |
| `m[3]` | the whole tail, `filed:\s*#(\d+)` or `noise:\s+(.+)` | `:285`, discriminated at `:286` |
| `m[4]` | the issue digits, **without** the `#` | `:287` → `ref` |
| `m[5]` | the noise justification text | `:289` → `ref` (`|| ''`) |

Emitted entry shapes: `{ reasonClass, sample, kind: 'filed', ref: m[4] }` or
`{ reasonClass, sample, kind: 'noise', ref: m[5] || '' }`.

The lazy quantifier carries a 9-line comment (`:256-264`) deriving it in **both** directions — a
negated class `([^)]+)` breaks paren-bearing samples (#726), a greedy `(.+)` backtracks to the last
`): ` and mis-carves a noise justification that contains `): filed: #N`. It ends *"Do not 'simplify'
this quantifier."* Any candidate that rewrites this line is out of scope for #997.

Anchoring detail that matters downstream: the strict regex is anchored at **both** ends (`^`…`$`) and
demands `\s+` after the `):`.

### The free-text / advisory branch, `:266-282`

```js
if (!m) {
  // …comment, :267-274…
  if (/^-\s+.*\(.*\):\s*(filed:|noise:)/.test(l)) {
    process.stderr.write('gap-sweep: ignoring malformed ## Run gaps mapping line (expected …): ' + l + '\n');
  }
  continue;
}
```

- **The loose probe (`:275`) is the existing definition of "a row that was attempted".** It is
  unanchored at the end and accepts `\s*` (not `\s+`) after the colon, so it is strictly looser than
  `:265` on the tail and *equal-or-looser* everywhere else. It requires a parenthesised span followed
  by `):` and then a `filed:` or `noise:` marker.
- **It fires on stderr only.** The comment (`:272-274`) states three properties explicitly: advisory,
  "never changes the parse result or the exit code", "never contaminates the single `--json` line on
  stdout". Those three are pinned by `test-gap-sweep.js` T20 (§6).
- **The back-compat reason, verbatim from `:270-272`:** *"Free-text bullets (`- none`, prose notes)
  are ignored by design for back-compat and must never warn — they carry no `(<sample>): filed:|noise:`
  shape, so they cannot reach this branch's condition."*
- Consequence worth stating: there is a population that fails strict **and** fails loose — e.g.
  `- manual:typo: filed: #7` (no parens). Those are invisible to the advisory today and would stay
  invisible under any candidate keyed on the loose probe. The fix's coverage is exactly the loose
  population, no wider; widening the loose probe would collide with T20's three must-not-warn bullets.

### The overload

`entries` is `[]` in **two** unrelated situations: the section is present and genuinely carries
nothing, and the section is present and every bullet in it failed `:265`. Nothing in the return
distinguishes them. The information exists — the stderr advisory at `:276` is emitted for exactly the
second population — it is simply not returned.

---

## 2. Every caller

`parseGapSection` is exported at `:590` (`module.exports = { main, parseGapSection };`) with a
rationale comment at `:587-589`. That export shipped in #993 (bundle-992-993-994) precisely so the
closure block would not restate the grammar.

**Two distinct consumers, ×4 editions = 8 call sites. Neither is a test; no test imports the parser
directly.**

| # | call site | distinguishes `null` from `[]`? |
|---|---|---|
| 1 | `scripts/kaola-workflow-gap-sweep.js:339` (`runCheck`) | **Yes, at three points** |
| 2 | `scripts/kaola-workflow-claim.js:2462` (`computeBacklogDelta`) | **Yes, at one point** |
| 1′ | `plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js:339` | byte-identical to 1 |
| 2′ | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js:2462` | byte-identical to 2 |
| 1″ | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js:340` | generated port of 1 |
| 2″ | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:2208` | **hand-ported** mirror of 2 |
| 1‴ | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js:340` | generated port of 1 |
| 2‴ | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:2207` | **hand-ported** mirror of 2 |

### Caller 1 — `runCheck`, `gap-sweep.js:339`

Four reads of the return value:

- `:345` `if (gapEntries !== null && gapEntries.length > 0)` — guards the reverse-containment block
  that emits `observed_gap_unseeded`.
- `:371` `if (sweptClasses.length === 0 && (gapEntries === null || gapEntries.length === 0))` — the
  vacuous pass. `null` and `[]` are **deliberately equivalent** here.
- `:384` `if (gapEntries === null)` — the "section absent, swept non-empty ⇒ all unmapped"
  `gaps_unswept` arm, with its own stderr sentence `'## Run gaps section absent in ' + summaryPath`.
- `:407` `gapEntries.find(...)` inside the forward-matching loop over `sweptClasses`.

So `runCheck` treats `null` and `[]` as **the same** at `:345` and `:371`, and **differently** at
`:384` (where `null` short-circuits to a refusal whose JSON is, as it happens, identical to the one
the loop would produce — see §4).

**Would a third return state break it?** Depends entirely on the shape:
- A non-array object (`{rows, unmappable}`): `:345` `undefined > 0` is false ⇒ **the
  `observed_gap_unseeded` block is silently skipped**; `:371` `undefined === 0` is false ⇒ vacuous
  arm skipped (falls through to the loop, which coincidentally emits the same pass JSON); `:384`
  false; `:407` `gapEntries.find` ⇒ **uncaught `TypeError`, stack trace, no JSON line**. Loud in the
  swept-non-empty case, **silent in the refusal that matters most**.
- An array carrying an extra property: nothing changes. All four reads are index/length/method reads.
- Reusing `null`: nothing changes structurally; the semantics of `:384`'s message change (§9c).

### Caller 2 — `computeBacklogDelta`, `claim.js:2457-2479`

```js
2459  for (const dir of (projectDirCandidates || [])) {
2460    if (!dir) continue;
2461    let entries = null;
2462    try { entries = parseGapSection(path.join(dir, 'finalization-summary.md')); } catch (_) { entries = null; }
2463    if (entries !== null) { filed = entries.filter(e => e.kind === 'filed'); break; }
2464  }
```

Note the `try` wraps **only** the parse call. `entries.filter` at `:2463` is outside it, so a
non-array return would throw an uncaught `TypeError` out of `cmdFinalize` — loud, but at the worst
possible moment (mid-archive). This is the strongest structural argument against candidate (a) being
done carelessly.

The import carries the project's own ruling against candidate (d), verbatim at `claim.js:29-32`:

> *"the `## Run gaps` row grammar has ONE owner — the gate that refuses on it — and the closure block
> now reports over the same rows. Import that parser instead of restating its regex: a second spelling
> would count filings the gate does not, and the two would disagree silently."*

---

## 3. The closure stamp consumer

**The branch, `scripts/kaola-workflow-claim.js:2465-2478`:**

```js
2465  if (filed === null) {
2466    return { issuesClosed: issuesClosed, followUpsFiled: 'unknown',
2467      followUpNumbers: 'unknown', netBacklogDelta: 'unknown' };
2468  }
2469  const net = filed.length - issuesClosed;
2470  return {
2471    issuesClosed: issuesClosed,
2472    followUpsFiled: String(filed.length),
2474    followUpNumbers: filed.length > 0 ? filed.map(e => e.ref).join(',') : 'none',
2477    netBacklogDelta: net === 0 ? '0' : (net > 0 ? '+' + net : String(net)),
2478  };
```

`filed` stays `null` **iff** every candidate directory yielded `null` (or threw). One array — even an
empty one — sets `filed` and takes the measured branch. That is the whole defect: `[]` from an
unreadable section is indistinguishable from `[]` from an empty one.

**Where the values land:** `computeBacklogDelta` is called once, at `claim.js:4843-4845`, on the
finalize path only, with `issuesClosed` = `closure.attempted.length` (0 when `--keep-open`) and
candidates `[result.dest, path.join(root, 'kaola-workflow', args.project)]` — archive-first, then
live. The four fields are handed to `appendClosureBlock(result.dest, {...})` at `:4849-4858` and
rendered at `:2434-2437`:

```js
2425  const delta = key => (fields[key] === undefined || fields[key] === null) ? 'unknown' : fields[key];
2434  'issues_closed: '     + delta('issuesClosed')   + '\n' +
2435  'follow_ups_filed: '  + delta('followUpsFiled') + '\n' +
2436  'follow_up_numbers: ' + delta('followUpNumbers')+ '\n' +
2437  'net_backlog_delta: ' + delta('netBacklogDelta')+ '\n';
```

`appendClosureBlock` is **write-once** (`:2421` returns false if `## Closure` already exists), so
there is no later chance to revise the stamp. The `delta()` helper is a second, independent source of
`unknown` — for the watch-pr and sink-sole-archiver lanes, which pass the fields as `undefined`
(`:2422-2424`). A fix must not disturb that: two different lanes already produce `unknown` for two
different reasons, and #997 would add a third.

**Documentation surface:** `docs/workflow-state-contract.md:291-296` is the only doc that specifies
these fields. Its current sentence — *"A lane that could not locate that section stamps `unknown`
rather than a `0` nobody measured"* — says **locate**, and would need rewording under every candidate
that widens the degradation to "located but unreadable".

`follow_ups_filed` has no other reader anywhere in the tree: grep across `**/*.js` finds only
`claim.js` ×4, `test-finalize-door.js`, `test-bundle-finalize.js`.

---

## 4. The two refusal directions — what a fix must not change

### `observed_gap_unseeded` — `gap-sweep.js:345-368` (reverse containment)

Fires when **all three** hold: `gapEntries !== null`, `gapEntries.length > 0`, and at least one entry
has no `sweptClasses` member with an **exact** `reasonClass` match *and* a `samplesMatch` sample.
Emits `{result:'refuse', reason:'observed_gap_unseeded', unseeded, detail}` and returns 1.

Parser output it depends on: **a non-empty array of entries.** An all-malformed section produces
`[]`, so this refusal is *already* unreachable in the #997 state today — nothing a fix does to the
empty case can weaken it. What *would* weaken it: any shape whose `.length` stops being a number
(candidate (a)), and any shape that returns `null`/`[]` when some rows *did* parse (which is why (c)
cannot be widened to partial malformation — see §9c).

### `gaps_unswept` — two emit sites, one token

- **`:384-399`** — `gapEntries === null` and `sweptClasses` non-empty. `unmapped` = *every* swept
  class. stderr sentence: `'gap-sweep: ## Run gaps section absent in ' + summaryPath`.
- **`:419-433`** — the forward loop found ≥1 swept class with no matching entry. `unmapped` = the
  unmatched subset.

Both emit `{result:'refuse', reason:'gaps_unswept', unmapped}` and return 1. **The `--json` payloads
of the two arms are byte-identical whenever `gapEntries` is empty**, because with zero entries the
loop marks every swept class unmapped — the same list `:385` builds. Only the human stderr text
differs. This is the fact that makes candidate (c) machine-invisible and prose-wrong.

Ordering constraint for any fix: `:371`'s vacuous pass sits *between* the two, so "both sides empty"
must keep exiting 0.

---

## 5. `samplesMatch` — `gap-sweep.js:296-312`

```js
function samplesMatch(a, b) {
  const left  = String(a === undefined || a === null ? '' : a).trim();
  const right = String(b === undefined || b === null ? '' : b).trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}
```

Compares a `## Run gaps` row's **`sample`** (i.e. `m[2]` from `:265`) against a seeded
`sweptClasses[i].sample`, symmetrically by containment (#836 — a summary may abbreviate or elaborate).
An empty side never matches. It consumes **only** `entry.sample`; it never sees `kind`, `ref`, or the
array as a whole. Two call sites, both in `runCheck`: `:347` (reverse containment) and `:408`
(forward matching). `reasonClass` stays an exact `===` at both.

**Bearing on #997: none, under any candidate.** No proposed shape touches `sample`. It is listed here
to close the question, not because it constrains the design.

---

## 6. The pinning tests

### `scripts/test-finalize-door.js` T14 — `:2686-2836`, the degradation pair

Iterates `CLAIM_EDITIONS` (`:1633-1638`: root, codex, gitlab, gitea). Helper `legFields(...)` writes
the summary at `fx.mainProj/finalization-summary.md`, runs finalize keep-worktree, asserts exit 0 and
`status: 'closed'`, and returns the archived `## Closure` block parsed by `closureBlockOf` (`:2715`).

Three legs, per edition:

| leg | summary written | assertions |
|---|---|---|
| **absent** (`:2765-2791`) | none — finalize's own writer creates a summary with no `## Run gaps` heading | `follow_ups_filed === 'unknown'`, `net_backlog_delta === 'unknown'`, `follow_up_numbers === 'unknown'`, and `issues_closed === '1'` (degradation must not spread) |
| **empty** (`:2794-2806`) | `'# Finalization Summary\n\n## Run gaps\n\n'` | `follow_ups_filed === '0'`, `follow_up_numbers === 'none'`, `net_backlog_delta === '-1'` |
| **freetext** (`:2810-2817`) | `'# Finalization Summary\n\n## Run gaps\n\n- none\n'` | `follow_ups_filed === '0'`, `follow_up_numbers === 'none'` |

Plus the three **pair** assertions (`:2820-2834`) that absent ≠ empty on each of the three fields —
the ones no constant implementation can satisfy.

The `freetext` assertion, quoted:

```js
assert(freeText.follow_ups_filed === '0',
  base + ' freetext: `- none` is a free-text bullet the gap grammar ignores by design, so the '
  + 'section carries zero FILINGS — counting bullets rather than `filed:` refs reads 1; got '
  + JSON.stringify(freeText.follow_ups_filed));
```

Its header comment (`:2705-2708`) states the rule a fix must respect: *"FREE TEXT IS NOT MALFORMED …
a section carrying one is a section carrying zero filings — a MEASUREMENT … An implementation counting
`- ` bullets reads 1 there and is wrong twice over."*

**Would any candidate turn T14 red?** `- none` matches neither `:265` nor the loose probe at `:275`,
so under (a), (b), (c) and (d) the freetext leg still yields "zero attempted, zero mapped" ⇒ measured
`0`. All three legs stay green under all four. The one build that reds it is a bullet-counter — which
the #993 record says was tried and rejected for this reason.

### `scripts/test-finalize-door.js` T13 — `:~2600-2684`

The `.roadmap/_rules.md` staging test (#991). It touches finalize's `git add -A -- kaola-workflow/.roadmap`
narrowing and its `roadmap_staged` control. **Unrelated to the parser** — it appears in the mission
brief only because it is T14's neighbour and shares the four-edition loop. No candidate affects it.

### `scripts/test-bundle-finalize.js:1003-1230` — the #992/#993/#994 closure-delta legs

Three legs, all through the merge lane with a four-member bundle:

- **A** (`:1123-1129`) — five rows, four `filed:` and one `noise:`, all in strict grammar ⇒
  `follow_ups_filed === '4'` (`:1165`), `follow_up_numbers === '7001,7002,7003,7004'` (`:1169`),
  `net_backlog_delta === '0'` (`:1173`).
- **B** (`:1131`) — fourteen `filed:` rows ⇒ `'14'`, the full number list, `'+10'`.
- **C** (`:1136`) — `runClosureDeltaLeg([])`, i.e. heading present, zero rows ⇒ `follow_ups_filed
  === '0'` (`:1188`), `follow_up_numbers === 'none'`, `net_backlog_delta === '-4'`.

Its fixture comment at `:1096-1098` is a constraint on any new test: *"`## Run gaps` rows are in the
scanner's STRICT grammar … because a free-text bullet is dropped by design and would make this
fixture measure nothing."* Also asserts **zero new forge calls** (`:1198-1215`) — a fix that re-read
anything over the wire would red here. All three legs carry only well-formed or zero rows, so no
candidate reds them.

### `scripts/test-gap-sweep.js` T20 — `:751-794` (#726), the advisory pin

Fixture: `sweptClasses: []`, summary carrying four bullets — `- none`; a prose bullet with two
parenthesised spans; a prose bullet naming `#635`; and `- manual:typo (some sample): filed: 726`
(missing `#`). Asserts:

```js
assert(r20.exitCode === 0, 'T20: the diagnostic must not change the exit code, …');
assert(r20.jsonOut !== null && r20.jsonOut.result === 'pass', 'T20: result still pass (diagnostic is advisory only)');
assert(warnLines.length === 1, 'T20: exactly ONE diagnostic line, …');
assert(warnLines[0].indexOf('- manual:typo (some sample): filed: 726') !== -1, 'T20: the diagnostic quotes the offending line verbatim, …');
assert((r20.stderr||'').indexOf('- none') === -1, 'T20: "- none" must NOT warn (free-text bullets are ignored by design)');
assert((r20.stdout||'').indexOf('malformed') === -1, 'T20: the diagnostic must never contaminate stdout (--json consumers parse it)');
```

**T20 is the single most useful existing asset for #997.** Its fixture is already an all-malformed
section (one attempted row, zero mapped, three free-text bullets), and it already pins the loose
probe's population precisely — so a fix that reuses `:275` as its "attempted" predicate inherits a
mutation-relevant definition instead of inventing one.

**Would any candidate red T20?** It asserts `exitCode === 0` and `result === 'pass'` with an empty
sweep. Under (c) the parser returns `null` there, and `:371`'s vacuous arm accepts `null` identically
⇒ still exit 0, still `pass`. Under (a)/(b)/(d), unchanged. **T20 stays green under all of them** —
which means T20 is *not* a discriminator, and the tests-custody item must add red-first coverage
rather than lean on it.

Other T-numbers in that file bearing on the null path: **T2** (`:139-173`, section absent + swept
non-empty ⇒ refuse) and **T5** (`:244-274`, empty sweep + no section ⇒ vacuous pass, exit 0). Both
constrain the `null` arm and both stay green under (a)/(b)/(d); under (c) T2 and T5 are untouched
because their summaries have no heading at all.

### Coverage gap, stated plainly

**No test today distinguishes "section present, all rows malformed" from "section present, empty" at
the stamp.** That is the red-first test the custody item owes, and it belongs as a fourth T14 leg
(`malformed`, four editions), e.g. summary `'# Finalization Summary\n\n## Run gaps\n\n- manual:typo
(some sample): filed: 726\n'`, asserting `follow_ups_filed !== '0'` against the `empty` leg in the
same pair style T14 already uses. It is red on today's tree (stamps `0`) and green under (a), (b),
(c) and (d) alike.

---

## 7. Precedent — what #848 actually shipped

**The code is gone.** `grep -rn "absent_anchor|schema_mismatch"` across the whole repository returns
**one file: `CHANGELOG.md`**. The four condition tokens (`finding_anchor_index_unavailable`,
`candidate_partition_unavailable`, `candidate_digest_unavailable`, `baseline_partition_unavailable`)
appear nowhere in `scripts/`. There is no `docs/decisions/D-848-*.md`. #848 lived in
`adaptive-node.js` / `plan-validator.js`, both since deleted. So its shape survives only as prose.

**The surviving record — `CHANGELOG.md:2895`, paraphrased tightly and quoted where load-bearing:**

Title: *"Four conditions stopped claiming a value was absent when it was produced and failed a shape
check (#848) — **but this is a LATERAL move, not a strict improvement.**"*

What it did: the four conditions rendered the `absent_anchor` sentence — *"the anchor this proof
stands on is not there"* — for a probe that had **answered**, in a shape the reader could not use.
They were **moved to the existing `schema_mismatch` kind**, "which carries the same route and the
same `auto_remediable: false`, so **the sentence moves and nothing else**."

So the shipped shape was: **no return-shape change, no new state, no emit-site change — a
reclassification of an existing report's *kind*, keyed on the token, reusing a kind that already
existed.**

And its own self-criticism, which is the part that matters most here:

> **"Why it is not a win:** the reclassification is keyed on the TOKEN, while each of these tokens is
> emitted from several mixed sites — `candidate_digest_unavailable`, for instance, comes from a single
> `try/catch` wrapping three git operations, so a genuinely missing tree object and a malformed one
> arrive at the same token. The new sentence is therefore true for the sites #848 names and false for
> the genuinely-absent ones; **the error class did not shrink, it moved.**"
>
> **"The truthful fix — splitting the catches so absence and malformation are distinguished at the
> emit site, and passing `kind` per event — is NOT done."**

**What transfers to #997.** The reclassification half does not: a `## Closure` field has no `kind` to
move, and there is no second existing token to move it to. What transfers is the *verdict* the entry
records about its own shape — that relabelling at a distance from the observation leaves the
conflation intact one layer down, and that the honest fix **distinguishes at the emit site and carries
the distinction outward per event.**

For #997 the emit site is `parseGapSection` itself: it is the only code that knows which lines it
attempted. #848 is therefore evidence **for** an in-parser distinction (a)/(b), and evidence
**against** (c) (relabel at a distance) and **against** (d) (decide it somewhere other than where it
was observed).

Related precedent, already cited in the filing: **#726** (closed) — the same parser, the paren-bearing
sample; proof that individually-unmappable rows are real. Whether an *all*-rows-unmappable section has
ever occurred is the open question the archive-scan mission is measuring.

---

## 8. Propagation cost — the same for every candidate, and asymmetric between the two files

| file | sync class | authored edits |
|---|---|---|
| `kaola-workflow-gap-sweep.js` | `COMMON_SCRIPTS` (`validate-script-sync.js:75`) ⇒ root↔codex byte-identical; gitlab/gitea are **GENERATED** by `edition-sync.js` (`GENERATED_AGGREGATORS`, `:63`) | **one** authored edit + copy + regenerate |
| `kaola-workflow-claim.js` | `COMMON_SCRIPTS` (`:46`) ⇒ root↔codex byte-identical; gitlab/gitea are **HAND-PORTED** (`edition-sync.js:30-34`: "the data-layer forge ports (claim / sink-merge / …) stay HAND-PORTED … and are NOT touched here") | **three** authored edits (root+codex byte copy, then gitlab and gitea by hand) |

This is a real cost difference: a candidate confined to `gap-sweep.js` costs one authored edit; a
candidate touching `claim.js` costs three, two of them on files T14's four-edition loop exists
specifically to police (`test-finalize-door.js:2710-2711`: *"the GitLab and Gitea claim ports are
hand-mirrored and policed by nothing, so a fix applied to three copies and missed on the fourth is
caught here or not at all"*).

Note also `#868`'s trap, recorded at `validate-script-sync.js:78-84`: gap-sweep `require()`s the
base-named kernel, so it must stay in the **generated** family — do not move it into
`RENAME_NORMALIZED_FAMILIES` for any reason.

---

## 9. The candidate shapes

Assessed against: (i) the two refusals unchanged, (ii) T13/T14/T20/bundle-finalize green, (iii) diff
size, (iv) #848's stated lesson.

### (a) return an object `{rows, unmappable}`

**Breaks, concretely:**
- `gap-sweep.js:345` — `gapEntries.length` is `undefined`, `undefined > 0` false ⇒ **the
  `observed_gap_unseeded` block never runs, silently.** This is a refusal the mission says must not
  change, and it fails *quietly*.
- `gap-sweep.js:371` — `undefined === 0` false ⇒ vacuous arm skipped; falls through and (by luck)
  emits the same pass JSON from the loop.
- `gap-sweep.js:384` — dead if `null` is retired; live if `null` is kept for absence.
- `gap-sweep.js:407` — `gapEntries.find` ⇒ **uncaught `TypeError`**, no JSON, stack trace.
- `claim.js:2463` — `entries.filter` ⇒ **uncaught `TypeError` out of `cmdFinalize`**, outside the
  `try` at `:2462`.

**Must change:** four sites in `runCheck` plus one in `computeBacklogDelta`, ×4 editions (three
authored edits on claim). Every one of the four `runCheck` edits is a hand-rewrite of a condition
guarding a refusal — the highest-risk way to satisfy "must not change either refusal."
**After correct edits:** all pinning tests green. The risk is not the tests; it is the four unpinned
conditions.

### (b) keep the array, attach the count as a property

E.g. `Object.defineProperty(entries, 'unmappable', { value: attempted })` at the return, or a plain
`entries.unmappable = attempted` (equivalent in effect here — `JSON.stringify` ignores non-index
properties on arrays, and nothing stringifies this array anyway).

**Breaks:** nothing. `Array.isArray`, `.length`, `.find`, `.filter` and both `!== null` tests are all
unaffected. `runCheck` diff is **zero lines**; both refusals are untouched by construction rather than
by inspection.
**Must change:** the parser's return (`gap-sweep.js`, one authored edit) and `claim.js:2463`'s
condition (three authored edits) — e.g. degrade when `entries.unmappable > 0` and nothing mapped.
**Tests:** all green; the new T14 leg goes red-first and then green.
**Objection:** a side-channel property on an array is the least legible of the shapes, in a project
whose standing rule is *"there is already too much in this project."* It is also the only shape that
makes the count available for a **partial**-malformation policy later without a further reshape.
**#848 fit:** good — the distinction is made and carried at the emit site.

### (c) return `null` when nothing mapped but rows were attempted

**Breaks:** nothing structurally. Both consumers already handle `null`.
- `observed_gap_unseeded`: unreachable in this state either way (needs `length > 0`). Unchanged.
- `gaps_unswept`: routes from the `:419` arm to the `:384` arm. **The `--json` payload is
  byte-identical** — same `reason`, and with zero entries the `:411` loop marks every swept class
  unmapped, which is exactly the list `:385` builds. Only the **stderr sentence** changes, to
  `'## Run gaps section absent in <path>'` — **false prose for a section that is present.**
- Vacuous pass (`:371`) accepts `null` and `[]` identically ⇒ T20 and T5 unchanged.

**Must change:** `gap-sweep.js` only — **one authored edit, ~3 lines, `claim.js` untouched in all four
editions.** By a wide margin the cheapest.
**Tests:** T14 (all three legs), T20, T2, T5 and all three bundle-finalize legs stay green.

**Two objections, one of them decisive:**
1. It reintroduces the exact absent-vs-present conflation one layer down, in the sentence the gate
   prints to a human — which is precisely what `CHANGELOG.md:2895` calls "the error class did not
   shrink, it moved." (Repairable by rewording `:394`, at the cost of a second edit and a wording
   that must then be true of both causes.)
2. **It cannot express a partial-malformation policy, ever.** If the archive scan finds sections with
   *some* valid rows and *some* malformed ones, (c) has no way to degrade them: returning `null` when
   any row failed would hide the valid entries from `:345`, silently disarming
   `observed_gap_unseeded` for rows that *were* correctly mapped — a refusal regression the mission
   explicitly forbids. (c) is expressible **only** for the all-rows-fail case as filed.

### (d) leave the parser alone; the caller re-scans

**Breaks:** nothing mechanically. Both refusals untouched; all tests green.
**Must change:** `claim.js` only — but **three authored edits** (two hand-ported), each adding a second
copy of the loose probe and a second read of the same file.
**Objection:** it is the shape this repository argued against **in writing, one release ago**, at the
very call site in question — `claim.js:29-32`: *"Import that parser instead of restating its regex: a
second spelling would count filings the gate does not, and the two would disagree silently."* It also
contradicts the standing `## Non-Negotiable` rule "one rule, one wording", and the follow-up body's own
hypothesis (*"the honest fix belongs inside `parseGapSection` … because only the parser knows which
lines it attempted to map"*). #848 fit: poor — it decides the question away from the observation.

### (e) "whatever shape #848 used, applied here"

**Does not transfer.** #848 moved a report's `kind` token from one existing kind to another existing
kind. Here there is no `kind` field on a `## Closure` line and no second existing token to move to —
the stamp's vocabulary is `unknown` | a number. The nearest literal transliteration would be
"introduce a new stamp token for unreadable" (§10), which is a *different* decision from #848's and
carries doc and test consequences #848 did not have. What #848 contributes to this decision is its
self-assessment, not its mechanism.

---

## 10. The one design fork the candidates do not settle — flagged, not chosen

**Does the unreadable case stamp the existing `unknown`, or a new third token?**

The issue as filed wants `unknown`: the follow-up body's remedy (`archive/bundle-992-993-994/.cache/
followup-malformed-gap-rows.body:49-51`) says *"so the closure stamp can degrade those to `unknown`
alongside the section-absent case"*, and mission-list item at `:31` says *"degrades to `unknown` rather
than a measured-looking `0`"*. On that reading **the parser gains a third state and the stamp keeps
two output tokens** — mission-list item `:34`'s "three-state stamp (absent / measured / unreadable)"
describes the three *inputs*, not three rendered values.

If the owner instead wants the record to distinguish *why* it is unmeasured, that is a different and
larger change: a new token would contradict T14's `absent` assertions only if it replaced `unknown`
there (it would not), but it **would** require updating `docs/workflow-state-contract.md:291-296`, and
it collides with `delta()`'s independent `unknown` at `claim.js:2425` — three causes, one token,
already. Worth one sentence of owner input before the shape is cut, because it decides whether
`claim.js` must be touched at all: **under "stamp `unknown`", candidate (c) needs no `claim.js` edit
whatsoever; under "new token", every candidate does.**

A second, smaller fork, which the archive scan will inform: **degrade when zero rows mapped and ≥1 was
attempted, or whenever ≥1 row was attempted-and-failed regardless of how many mapped?** As shown in
§9c, (c) can only ever express the first; (a), (b) and (d) can express either.

---

## 11. Summary table

| | refusals provably untouched | gap-sweep edits | claim.js authored edits | pinning tests | #848 lesson |
|---|---|---|---|---|---|
| (a) object | **no** — 4 conditions rewritten by hand, one fails silently | 1 (+4 sites) | 3 | green after correct edits | good |
| (b) array + property | **yes, by construction** | 1 | 3 | green | good |
| (c) reuse `null` | yes for JSON; gate's stderr prose becomes false | 1 | **0** | green | poor — moves the conflation |
| (d) caller re-scan | yes | 0 | 3 (+ a duplicated grammar) | green | poor — decides away from the observation |
| (e) #848 literal | n/a | — | — | — | mechanism does not transfer |

Every candidate passes the existing suite. **The existing tests do not discriminate between them** —
which is itself a finding: whoever holds test custody must write the fourth T14 leg first, and it will
go green under all four shapes.
