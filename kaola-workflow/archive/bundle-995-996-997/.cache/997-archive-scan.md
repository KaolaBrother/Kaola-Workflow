# Investigation: #997 — does a fully-unreadable `## Run gaps` section exist in the archive?

## Setup

- Commit: `8deb8eae59d6449a097a9cfbf2a3868377088386` (main, clean apart from the untracked
  `kaola-workflow/bundle-995-996-997/`)
- Node: `v24.18.0`
- Corpus: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/kaola-workflow/archive/`
  — 404 directories, 0 loose files. **154** carry a consumer-visible
  `archive/<run>/finalization-summary.md`; **5** more carry only a nested
  `<run>/.cache/finalization-summary.md`; the remaining 245 carry none.
- Live folders: `kaola-workflow/bundle-995-996-997/` is the only non-archive run folder and has no
  `finalization-summary.md` yet, so the live corpus contributes nothing.

### Method — the real parser, the real literals

`parseGapSection` **is exported** (`scripts/kaola-workflow-gap-sweep.js:590`), so every `null`-vs-array
result below is the shipped function's own return value, and every advisory warning below is the
shipped function's own `process.stderr.write`, captured by temporarily swapping `process.stderr.write`
around the call. No parse was reimplemented.

The four literals used for the *sub-classification* (which bullets strict-matched, which tripped the
advisory) were **extracted from the source bytes** of `parseGapSection` and printed for verification
rather than retyped:

```
$ SHOW_LITERALS=1 node <scratchpad>/scan-997.js
heading        /^## Run gaps\s*$/                                              (:244)
next-heading   /^## /                                                          (:249)
strict         /^-\s+(\S+)\s+\((.+?)\):\s+(filed:\s*#(\d+)|noise:\s+(.+))$/     (:265)
loose-advisory /^-\s+.*\(.*\):\s*(filed:|noise:)/                              (:275)
bullet-prefix  "- "                                                            (:251)
```

Harnesses (scratchpad, throwaway):
`<scratchpad>/scan-997.js` (bullet taxonomy + synthetic controls) and
`<scratchpad>/census-997.js` (final census with the table/prose sub-splits), where `<scratchpad>` =
`/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/6e4866d9-e586-44a4-8841-5c26dacf1a34/scratchpad`.

### What the consumer does with the result — grounded, not assumed

`scripts/kaola-workflow-claim.js:2457-2479` `computeBacklogDelta`:

```js
try { entries = parseGapSection(path.join(dir, 'finalization-summary.md')); } catch (_) { entries = null; }
if (entries !== null) { filed = entries.filter(e => e.kind === 'filed'); break; }
...
followUpsFiled: String(filed.length),
followUpNumbers: filed.length > 0 ? filed.map(e => e.ref).join(',') : 'none',
```

Two consequences that shape this scan:

1. `follow_ups_filed` counts **`kind === 'filed'` entries only**, so a lost `noise:` row costs the
   stamp nothing; a lost `filed: #N` row costs it one.
2. The candidate path is `<projectDir>/finalization-summary.md`. The 5 nested
   `<run>/.cache/finalization-summary.md` copies are **not** read — those runs degrade to `unknown`,
   which is the correct answer for them. They are excluded from the headline counts and reported
   separately.

---

## Observations

### Headline census — 154 consumer-visible summaries

| Measurement | Command | Result | Exit |
|---|---|---|---|
| corpus size | `find .../archive -maxdepth 1 -mindepth 1 -type d \| wc -l` | 404 | 0 |
| consumer-visible summaries | `ls -1d .../archive/*/finalization-summary.md \| wc -l` | 154 | 0 |
| full census | `node <scratchpad>/census-997.js > census.json` | see table | 0 |
| filed refs lost | derived from `census.json` | **18 across 6 sections** | 0 |
| parser advisory warnings, whole corpus | captured stderr, summed | **0** | 0 |

| cat | meaning | today's stamp | count | correct? |
|---|---|---|---|---|
| **A** | `parseGapSection` returned `null` (heading absent) | `unknown` | **28** | yes |
| **B-empty** | heading, zero content lines | `0` | **0** | — |
| **B-prose** | heading, prose only, no bullets, no table | `0` | **42** | yes (all are "no gaps" statements) |
| **B-table** | heading, **markdown table**, zero bullets | `0` | **2** | **NO — silent loss of 8 refs** |
| **C** | heading, bullets, all strict-matching | real count | **67** | yes |
| **D-benign** | some strict, some not; no `filed:` ref lost | real count | **3** | yes (lost rows are `noise`) |
| **D-lossy** | some strict, some not; a `filed:` ref lost | undercount | **1** | **NO** |
| **E-loose** | bullets, none strict, ≥1 tripping the advisory | confident `0` | **0** | — (see control) |
| **E-silent** | bullets, none strict, mapping intent present, advisory never fires | confident `0` | **8** | **NO for 3 of them** |
| **F** | bullets, none strict, genuinely free text | `0` | **3** | yes, by design |

Category A splits into two populations: 28 summaries that exist but carry no `## Run gaps` heading,
plus the 245 archived run folders with no summary file at all — both return `null` and stamp
`unknown`, which is the designed degradation.

`B-empty` is **zero**: no archived section is literally empty. The 42 `B-prose` members are all
prose "nothing swept" statements — verbatim samples: `(sweep was empty — no items)`,
`(gap-sweep swept 0 classes — no waived chains, no deferred reviewer findings, no reopens)`,
`Sweep clean: \`run-gaps.json\` records \`sweptClasses: []\` and \`--check\` exits 0.` These stamp a
correct `0` and lose nothing.

### Answer to the claim as #997 phrased it

> Claim to test: scan archived runs' `finalization-summary.md` for sections where the loose pattern
> matched but the strict one did not.

**MEASURED: zero.** Across all 154 consumer-visible summaries (248 bullets, 206 strict-matching, 42
non-matching) the loose advisory at `:275` fired **not once**. The parser's own self-diagnostic has
never fired on any archived run.

**That zero does not vindicate the stamp.** The loose pattern requires a literal `(<...>):` followed by
`filed:` or `noise:` — i.e. it only detects a *near-miss of the parenthesised form*. Every real
unreadable section in the archive misses the strict grammar in a way that also misses the loose one.
The three shapes below are all invisible to the parser AND to its own warning.

### The real defect population — 18 `filed: #N` refs stamped as `0`

Derived by comparing, per section, the set of `filed:\s*\**\s*#(\d+)` refs present in the section text
against the set the parser actually returned:

| run folder | cat | stamps | refs in the text | lost |
|---|---|---|---|---|
| `bundle-904-905-906-907-908-909-910` | E-silent | 0 | 5 | 911, 912, 913, 915, 914 |
| `bundle-945-946-947-948` | E-silent | 0 | 3 | 949, 950, 951 |
| `issue-634` | E-silent | 0 | 1 | 639 |
| `issue-500` | D-lossy | 1 | 2 | 509 |
| `issue-725` | B-table | 0 | 7 | 735, 734, 719, 720, 722, 724, 736 |
| `issue-725.archived-2026-07-19T17-20-09-384Z` | B-table | 0 | 1 | 737 |

**Total: 6 sections, 18 filed refs lost, every one of them stamping `follow_ups_filed: 0` (or an
undercount) with `follow_up_numbers: none`.**

#### Shape 1 — mapping rows with no `(<sample>)` group (E-silent)

`bundle-904-905-906-907-908-909-910` — the whole section, verbatim:

```
- manual:relative-plan-receipt-placement: filed: #911
- manual:forge-sinkpreflight-divergence: filed: #912
- manual:env-allowlist-silently-discarded: filed: #913
- manual:keep-output-run-folder-band: filed: #915
- manual:finding-type-count-divergence: filed: #914
```

Five rows, every one an unambiguous `manual:<class>` → `filed: #N` mapping, none carrying the
parenthesised sample. Strict fails (needs `\S+\s+\(`); loose fails (needs a `(`). Section is located,
so the result is `[]`, not `null`.

`bundle-945-946-947-948` — backtick-and-em-dash form:

```
- `doc-badge-overclaim` — filed: #949
- `doc-stale-assertion-count` — filed: #950
- `a30-footer-line-unpinned` — filed: #951
- `derived-copylist-lazy-require` — noise: a bounded, deliberately-recorded residue of #945's own fix,
- `opencode-tree-stale-in-main` — noise: generated per-checkout state, not a tracked defect.
- `codex-install-cache-stale` — noise: the installed Codex plugin cache is at 7.5.5 while the repo is
```

`issue-634`:

```
- **OPT freeze-rule hardening — filed: #639.** Reviewer/adversary advisory follow-ups (all
```

The remaining 5 E-silent members lose no `filed:` ref (their unparsed rows are `noise` dispositions,
which the stamp does not count) but are the same shape and would lose one the moment a run wrote a
filing that way. Verbatim, for completeness:

- `bundle-980-981` — `` - `noise: the one defect this run found in its own work was fixed inside the run, not deferred.` ``
- `issue-455` — `- in_run_repair (codex crash-resume idempotency): noise — found by the code-reviewer and FULLY fixed +`
  and `- manual:short-circuit-envelope-codex-version (pre-existing): deferred — short-circuit envelope omits`
- `issue-929.archived-2026-08-03T14-15-27-770Z` — `` - `noise: the four prose defects were this run's own work-in-progress, fixed before landing — not ``
- `issue-934` — `` - `noise: issue #934's own premise was partly false` — a correction to an issue's text, not a defect ``
- `issue-965` — `` - `noise: pre-existing and already recorded` — ... `` and `` - `noise: fixed at source, not a separate defect` — ... ``

#### Shape 2 — a correctly-shaped row **wrapped across physical lines** (D-lossy)

`issue-500`, verbatim:

```
- manual:verdict-check-vs-486-adversarial-verifier (n4 emitted verdict:refuted, the correct #486
  investigation outcome, but adversarial-verifier ∈ GATE_VERDICT_ROLES so --verdict-check blocked
  the run until the gate-verdict was reframed to the deliverable-soundness axis): filed: #509
- deferred_red_chain (claude:512): filed: #512
- manual:run-chains-600s-timeout (claude chain ~574s standalone exit 0, but run-chains' hardcoded
  600s spawnSync timeout records it red at finalize; waived via --accept-known-red claude:512 with
  standalone-green evidence): filed: #512
```

Rows 1 and 3 are written in the **exact strict grammar**; they fail only because the parser is
line-based and the continuation lines do not begin with `- `. The first physical line has no closing
`):`, so the loose advisory cannot fire either. Row 2 (single-line) parses, so the section stamps
`follow_ups_filed: 1` where the operator recorded three mappings and two distinct filings (#509, #512).

#### Shape 3 — the section written as a **markdown table** (B-table)

`issue-725`, first rows verbatim:

```
| Gap | Disposition |
|---|---|
| discard/release structurally unavailable for schema-2 projects (`state_compliance_authority_invalid`) | filed: #735 |
| replan prepare evidence check reads legacy `body`/`receipt_sha256`, refuses schema-2 receipts | filed: #734 |
| schema-2 freeze omits one-row-per-node compliance pre-seed (+ stale task mirror at fold) | filed: #719 (workaround applied) |
...
| sink-merge FF-race gate red: detectReviewRuntime misclassifies ... | filed: #736 |
```

Ten table rows, seven filings, **zero bullets**. This is the most dangerous shape: it is not even a
malformed-bullet problem — the section classifies as *"located, carrying nothing"*, which is exactly
the state the design calls "a MEASUREMENT whose answer is zero"
(`kaola-workflow-claim.js:2450-2455`). `issue-725.archived-2026-07-19T17-20-09-384Z` is the same
table shape, losing #737.

### #726 precedent — no survivors, and the fix demonstrably holds

- **Unparsed rows of the #726 nested-paren shape: 0.** No bullet in the corpus fails the grammar
  because its sample contains `)`.
- **The lazy quantifier is load-bearing on real data:** 7 rows across 3 archived runs
  (`bundle-911-912-913-914-916-917` ×3, `bundle-956-957-958-959-960-961-962` ×1, `issue-819` ×3) parse
  today with a `)` *inside* the sample — e.g. `issue-819`'s
  `` `classifyEvidenceBody`'s anti-forgery conjunct is VACUOUS for any role with no `ROLE_TOKEN_REGISTRY` row (`workflow-planner`, `finalize`, `expansion-point`): ... ``.
  A negated-class `([^)]+)` would break all seven. This is regression evidence for #726's fix, not a
  defect.

---

## Reproduction

**Reproduces on real archived data — no synthetic needed for the count-loss claim.**

```
$ node -e "const {parseGapSection}=require('.../kaola-workflow-gap-sweep.js'); ..."
bundle-904-905-906-907-908-909-910
  parseGapSection -> array(len 0)   kind=filed count=0
  => follow_ups_filed would stamp: 0   follow_up_numbers: none
  filed: #N refs literally present in the section: 5 -> 911,912,913,915,914
bundle-945-946-947-948
  parseGapSection -> array(len 0)   kind=filed count=0
  => follow_ups_filed would stamp: 0   follow_up_numbers: none
  filed: #N refs literally present in the section: 3 -> 949,950,951
issue-634
  parseGapSection -> array(len 0)   kind=filed count=0
  => follow_ups_filed would stamp: 0   follow_up_numbers: none
  filed: #N refs literally present in the section: 1 -> 639
```

Exit 0, and **no `gap-sweep: ignoring malformed ...` line was emitted** — the parser did not know it
had failed.

## Positive control — the E detector fires

E-loose measured zero, so the detector was proven against a synthetic corpus of all six shapes
(`<scratchpad>/ctl/`), run through the same harness:

```
$ node <scratchpad>/scan-997.js <scratchpad>/ctl
counts: {"A":1,"B":1,"C":1,"D":1,"E":1,"F":1}
A-noheading  cat=A     parsed=null bullets=0 strict=0 looseOnly=0 freetext=0 warnings=0
B-empty      cat=B     parsed=0    bullets=0 strict=0 looseOnly=0 freetext=0 warnings=0
C-clean      cat=C     parsed=2    bullets=2 strict=2 looseOnly=0 freetext=0 warnings=0
D-mixed      cat=D     parsed=1    bullets=2 strict=1 looseOnly=1 freetext=0 warnings=1
E-loose      cat=E     parsed=0    bullets=2 strict=0 looseOnly=2 freetext=0 warnings=2
F-freetext   cat=F     parsed=0    bullets=1 strict=0 looseOnly=0 freetext=1 warnings=0
```

The synthetic E section is:

```
## Run gaps

- (no-class-token): filed: #12345
- manual:bad-ref (some sample): filed: #not-a-number
```

and the **shipped** parser, run directly on it, emits its own advisory twice and still returns an
array:

```
gap-sweep: ignoring malformed ## Run gaps mapping line (expected "- <class> (<sample>): filed: #N" or "- <class> (<sample>): noise: <text>"): - (no-class-token): filed: #12345
gap-sweep: ignoring malformed ## Run gaps mapping line (expected "- <class> (<sample>): filed: #N" or "- <class> (<sample>): noise: <text>"): - manual:bad-ref (some sample): filed: #not-a-number
parseGapSection -> array(len 0)  => follow_ups_filed stamps 0, not unknown
```

The detector fires, the classifier separates E from F (`- none` → F, warnings 0), and D-mixed is
distinguished from both. The corpus zero for E-loose is therefore a true zero, not a broken scanner.

## Narrowing

- **Leg: run the real exported `parseGapSection` rather than a reimplementation.** Eliminated
  "the counts are an artifact of a retyped regex" — every `null`/`[]`/`array` verdict is the shipped
  function's.
- **Leg: capture the shipped parser's own stderr instead of re-testing the loose pattern.** Eliminated
  "the advisory fired and we missed it" — the advisory count over the whole corpus is a measured 0.
- **Leg: compare parsed refs against `filed: #N` occurrences in the raw section text.** This is what
  found `issue-725` and `issue-500`; a bullet-level taxonomy alone reported them as B (empty) and
  D-freetext (benign) respectively. Eliminated "the bullet taxonomy is sufficient".
- **Leg: split the corpus by the path the consumer actually reads
  (`<projectDir>/finalization-summary.md`).** Eliminated the 5 `.cache`-only copies from the defect
  population — those runs correctly degrade to `unknown`.

## Inferences

- **#997's hypothesis is confirmed in substance and refuted in its proposed test.** A fully
  unreadable `## Run gaps` section is not rare — there are **6** in the archive, losing **18** filed
  refs. But *none* of them is detectable by the loose-vs-strict comparison the issue proposes: that
  comparison measures zero. — confidence: high (measured on the whole corpus with the shipped
  parser); refuted by: a section I mis-sliced, e.g. one whose heading has trailing content so
  `/^## Run gaps\s*$/` misses it — I did not search for near-miss headings.
- **The loose advisory at `:275` is not a usable proxy for "the parser failed here."** It has fired
  zero times in 154 archived runs while the parser silently dropped 42 non-matching bullets and two
  entire tables. Any fix for #997 that keys `unknown` off the existing advisory would change nothing.
  — confidence: high; refuted by: the advisory firing on a corpus I excluded (the 5 `.cache` copies —
  they also produced 0 warnings, so this holds there too).
- **The discriminator that would work is "the section carries `filed:`/`noise:`/`#N` text the parse
  did not account for"**, not "a bullet nearly matched." That test flags all 6 real cases and none of
  the 42 B-prose or 3 F sections. — confidence: medium-high (it separates the two populations cleanly
  on this corpus); refuted by: a legitimate prose section that mentions an issue number in passing —
  none exists here, but nothing prevents one. Note this is a *characterisation of the evidence*, not
  a fix proposal; the remedy is the owning role's call.
- **The B-table case is the strongest argument that `[]` cannot mean "measured zero" as designed.**
  `issue-725` has a heading, ten rows of content, seven filings, and is indistinguishable from an
  empty section to the current parser — the `0` is not a measurement of anything. — confidence: high;
  refuted by: a ruling that tables are out of grammar by design and the run record is simply wrong,
  which is a values call, not a measurement.

## Open

- **Not measured: whether the 18 lost refs are real forge issues.** They are read out of the summary
  text; I did not probe the forge. The parser question does not depend on it, but a remedy that
  reports numbers would.
- **Not measured: near-miss headings.** `/^## Run gaps\s*$/` requires the heading to stand alone; a
  summary writing `## Run gaps (none)` would classify as A/`unknown`. I did not sweep for
  heading-like lines that fail this test, so category A may include sections that exist.
- **Not measured: `--check` gate behaviour on these six sections.** This scan covers the
  `follow_ups_filed` stamp only. The same `[]` also feeds `runCheck`'s containment logic, where the
  consequence is a different one (a gate that passes vacuously vs one that refuses); that arm was out
  of scope.
- **Not measured: multi-line/table sections in the 5 `.cache`-only copies' parent runs.** Those runs
  stamp `unknown` today regardless, so the shape does not change the outcome.
