# Node `docs` (doc-updater) — evidence for issue #270

Target file edited: `docs/investigations/2026-06-06-six-workflow-patterns.md`
Diff scope: `git diff --name-only` shows exactly one file changed.

## Edits applied

### L1 — Title
Before: "# Six workflow patterns, mapped to the adaptive grammar — and the one gap worth filling"
After:  "# Six workflow patterns, mapped to the adaptive grammar — including the now-shipped Classify-And-Act"
Rationale: "the one gap worth filling" is now filled; title updated to reflect shipped state.

### L4 — Status line
Before: "**Status:** Design — filed as issue #263"
After:  "**Status:** Shipped (#263, commit `84d6e23`)"
Rationale: AC1.

### L120 — Section heading + Resolution block
Before: "## The one gap: Classify-And-Act"
After:  "## Classify-And-Act (shipped in #263)"
Plus a Resolution blockquote added directly under the heading citing commit 84d6e23,
all six ACs met, and the three follow-up issues with accurate status:
  - #267 OPEN (select() composition/runtime test coverage)
  - #268 CLOSED/shipped (G-SEL-1b blank selector_source phantom-arm fix, [5.5.0])
  - #269 CLOSED/shipped (orchestrator selectorCheck.armsToNa + n/a ledger rows, [5.4.0])
Rationale: AC3 — accurate per-issue status; AC1 section reframed.

### L126-L139 — "Verified out-of-grammar today" block
Before: "Verified out-of-grammar today. Authoring two mutually-exclusive arms with a
`select(...)` shape is refused…" / "The only legal workaround is to author both arms as a
`fanout` — but then **both arms run**"
After:  "Before #263, this was out-of-grammar. Authoring … was refused" / "The only legal
workaround had been … but then **both arms ran**"
Plus added a sentence: "After #263, the `select()` tripwire … flips from `refuse` to
`in-grammar`; selective execution is first-class."
Rationale: AC2 — reframed to historical past tense.

### L151 — "Why it's a real gap" heading
Before: "### Why it's a real gap"
After:  "### Why it was a real gap"

### L146-L149 — "the planner today must" body
Before: "the planner today must either (a)…(b)…Classify-and-act is exactly the missing tool"
After:  "the planner had to either (a)…(b)…Classify-and-act was exactly the missing tool:
explore first, then commit to the matching arm. #263 shipped it."
Rationale: AC2 — present-tense gap framing resolved.

### L190 — "If selection cannot be made script-decidable…" conditional
Before: "If selection cannot be made script-decidable for real use cases, the honest verdict
is **Reject as redundant with `staged-escalation`** — do not ship an agent-prose router."
After:  "The shipped form proved selection IS script-decidable: the `selector_source` column,
the column-0 `selector:` verdict in `.cache`, and the fail-closed `--selector-check` together
provide a mechanical, reproducible routing step. An agent-prose router remains out-of-grammar."
Rationale: AC2 — conditional resolved with confirmed shipped tokens (ground.md verified).

### L202 — TBD at implementation
Before: "Arms carry `select(<group>)` in a new **optional** column (or reuse the reserved
`cardinality` column's sibling slot — TBD at implementation; keep `plan_hash` coverage)."
After:  "Arms carry `select(<group>)` as their shape (parsed by the validator the same way
`fanout(<group>)` is; `plan_hash` covers it)."
Rationale: AC2 — "TBD at implementation" resolved; wording limited to confirmed tokens.

### L224-L230 — Selector verdict vocabulary (future-tense lead-in)
Before: "Extend `parseNodeVerdict` (…) — today `{pass, fail}` — with a parallel
`parseNodeSelector` that reads…"
After:  "`parseNodeSelector` (`kaola-workflow-adaptive-schema.js:120`, exported at line 243)
was added alongside `parseNodeVerdict` (`{pass, fail}`). It reads…"
Rationale: AC2 — imperative extended to shipped past tense; line numbers from ground.md.

### L232-L238 — Mechanical routing step (future-tense lead-in)
Before: "A new bracket in `kaola-workflow-commit-node.js`…"
After:  "The `selectorCheck` bracket was added to `kaola-workflow-commit-node.js`…"
Plus appended: "(#269 shipped the orchestrator side: `selectorCheck.armsToNa` is consumed
in `kaola-workflow-adaptive-node.js` to write the n/a ledger rows.)"
Rationale: AC2 + AC3 (#269 accurate status weave).

### L242 — Validator gains lead-in
Before: "The validator (`kaola-workflow-plan-validator.js`) gains, all fail-closed:"
After:  "The validator (`kaola-workflow-plan-validator.js`) gained these rules in #263, all
fail-closed:"
Rationale: AC2.

### G-SEL-1 — #268 follow-up weave
Added at end of G-SEL-1 rule body: "(#268 patched G-SEL-1b: blank `selector_source` no
longer generates a phantom arm.)"
Rationale: AC3 — #268 accurate status (CLOSED/shipped) anchored at the relevant rule.

### L272 — Verdict heading
Before: "### 6. Verdict: **Adapt** (in the catalogue's Adopt/Adapt/Reject framing)"
After:  "### 6. Verdict: **Adapt** — adopted and shipped in #263"

### L274-L278 — Verdict body tense
Before: "Classify-and-act is **Adapted**… the prose-routing form is **Rejected**… the
**script-decidable** selector form is adopted…"
After:  "Classify-and-act was **Adapted**… the prose-routing form is **Rejected**… the
**script-decidable** selector form was adopted…"
Rationale: AC2.

### L293-L308 — Acceptance criteria section
Before: "## Acceptance criteria (for the issue)" with future-tense items including
"currently-`refuse` `select()` fixture … will flip"
After:  "## Acceptance criteria — met by #263" with preamble "All six criteria below were
satisfied by commit `84d6e23`:" and past tense throughout; #267 cross-referenced at AC5.
Rationale: AC1 + AC2 + AC3 (#267 open follow-up accurate status).

### L310-L319 — Companion deliverables section
Before: "## Companion deliverables (shipping alongside this design, not blocked on the issue)"
with "Classify-and-act is listed as 'planned'" and "the issue will flip"
After:  "## Companion deliverables (shipped alongside #263)" with past-tense body; README
README note reads "was listed as 'planned' prior to [5.4.0]; it is now documented
(CHANGELOG [5.4.0]: 'was Planned; now documented')"; simulation tests note references
#267 for additional coverage.
Rationale: AC2 + AC3.

## Acceptance criteria verification

AC1 — Status updated to "Shipped (#263, commit `84d6e23`)": YES (L4).
AC2 — No conditional/future-tense/"planned"/"the gap"/"today the planner must" framing
       remains in the Classify-And-Act material: YES (grep confirms; sole "planned"
       occurrence at L335 is correctly past-tense historical reference).
AC3 — #267 (OPEN), #268 (CLOSED/shipped), #269 (CLOSED/shipped) referenced with accurate
       status: YES (Resolution block under L120; #268 at G-SEL-1; #269 at routing step;
       #267 at AC5 and companion deliverables).
AC4 — Grammar examples (shape column, `select(fix)` syntax), five-pattern table,
       composition demonstration, G-SEL-1..4 rule bodies, "What this is explicitly NOT"
       / "Out of scope" sections unchanged: YES (no edits to those regions).

## Diff scope
`git diff --name-only` = `docs/investigations/2026-06-06-six-workflow-patterns.md` only.
CHANGELOG.md not touched (finalize node's job).
