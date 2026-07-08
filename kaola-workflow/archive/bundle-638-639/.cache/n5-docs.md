evidence-binding: n5-docs 3923aeb28a89

# n5-docs (bundle-638-639) — document #638 + #639

Every claim below was diffed against real source before writing: `git diff origin/main..HEAD --
scripts/edition-sync.js` and `-- scripts/kaola-workflow-plan-validator.js`, plus a direct read of
`checkByteIdenticalGroup`/`hasUnresolvableEntry`/`optimizeHeaderCounts`/`parseOptimizeContracts`'s
`num()` helper, `runWrite`'s three steps, and the OPT-1..6 block (plan-validator.js:1481-1568). Rule
markers (R1→OPT-2, R2/R5→OPT-2, R3/R7→OPT-1, R6→no rule) were cross-checked against n2-opt-freeze's
own evidence and n4-adversary's 42-probe battery, not invented.

## `docs/api.md`

Updated the existing `## Meta` field `optimize(<node-id>)` section (issue #634/D-634-01):
- **OPT-1** bullet: added the duplicate/fenced-decoy refusal, naming `optimizeHeaderCounts` and the
  last-wins `Map.set` clobber it forestalls.
- **OPT-2** bullet: retitled "metric harness definition" (was "evaluation isolation"); added the
  `metric_command`-required clause and the exactly-resolvable-single-file clause (dir-shape/glob/
  `../`-alias all refuse, reusing `hasUnresolvableEntry` + a `../`-segment check), kept the pre-
  existing write-set-disjointness clause.
- Added a new one-paragraph "Numeric field notation — documentation-only, no separate rule" note
  right before "Evidence contract (D6)" covering R6: `num()` is a plain `Number()`, so hex/exponent
  forms convert like decimal and the OPT-3/OPT-4 caps bind on the converted value — no new rule.
- Did NOT add an edition-sync `--check`/`--write` section: grepped `docs/api.md` for
  `edition-sync|runCheck|runWrite|checkByteIdenticalGroup|COMMON_SCRIPTS|BYTE_IDENTICAL_GROUPS` —
  `edition-sync.js` is referenced only in passing (two one-line mentions, no dedicated section), so
  there is no natural home for the #638 note per the task's own "only if there's a natural home —
  else skip" instruction. Skipped in api.md; the #638 decision is fully covered in D-638-01.md.

## `docs/plan-run-cards/metric-optimizer.md`

Updated the two rows of the "Freeze rules" invariants table (§1) — `OPT-1` (added the duplicate/decoy
clause, no `#NNN`/marker-name jargon) and `OPT-2` (added `metric_command`-required and the
exact-file/no-directory-glob-`../`-alias clause). Kept the card's existing provenance-free style — no
issue or decision references added; matched the "and every block keys a real..." phrasing already
used in that row. Left §1's fields table (`metric_command`/`metric_paths` row descriptions) and the
rest of the card (ratchet loop, safety rule, evidence, quick reference) untouched — out of this
task's declared scope and unaffected by #638/#639.

## `docs/decisions/D-638-01.md` (new)

ADR for the `edition-sync.js --check`/`--write` symmetry decision. Shaped on `D-637-01.md`/
`D-629-01.md` (Date/Status/Issue/Related header, Context/Decision/Consequences/Non-goals/Alternatives
considered). Covers: why `runCheck` previously verified only `GENERATED_AGGREGATORS` while `runWrite`
also handled `COMMON_SCRIPTS` + `BYTE_IDENTICAL_GROUPS` (steps b/c, hardened by #629's create-on-
missing); the new `checkMirrors` primitive and its reuse of `checkByteIdenticalGroup` for both
families (COMMON_SCRIPTS as a degenerate 2-file `[canonical, codex]` group); that this was a cosmetic
asymmetry, not a live hole (`validate-script-sync.js` already caught it in-chain); and that
`RENAME_NORMALIZED_FAMILIES` stays deliberately outside both `--check` and `--write` by design (hand-
ported, forge-vocabulary-carrying, guarded separately). Cited the real T9/T10 test additions and the
4-chain green verification from n1's own evidence.

## `docs/decisions/D-639-01.md` (new)

ADR for the OPT freeze-rule hardening. Same shape, provenance allowed. Covers all four rules with
their real marker mapping (confirmed against plan-validator.js and n2/n4's evidence, not guessed):
R1 (metric_command required) and R2/R5 (unresolvable metric_paths: dir-shape/glob/`../`-alias) both
fold into **OPT-2** as one broadened "metric harness definition" invariant; R3/R7 (duplicate/fenced-
decoy `optimize(<id>)` header) folds into **OPT-1** as a structural block-cardinality defect; R6
(numeric hex/exponent notation) is documented as a deliberate no-new-rule outcome, with the actual
reasoning (`Number()` conversion feeds OPT-3/OPT-4's range checks regardless of source notation).
Noted the accepted residual **#640** (bare-existing-directory, backslash, and absolute-path
`metric_paths` shapes still freeze green) as a non-goal, including n4-adversary's finding A1 (an
unlisted absolute-path sibling in the same family, recorded non-blocking, recommended appended to
#640 — not fixed here, correctly out of this task's write set).

All four claims were grounded by direct source reads (not paraphrase-of-memory): `edition-sync.js`
lines 40, 113-124, 126-150, 198-242; `plan-validator.js` lines 455-503 (`parseOptimizeContracts`/
`num()`), 504-513 (`optimizeHeaderCounts`), 843-850 (`hasUnresolvableEntry`), 1481-1568 (OPT-1..6
block); `validate-script-sync.js` lines 405-427 (`checkByteIdenticalGroup`). No CI/CD framed as a
gate anywhere in the new prose.
