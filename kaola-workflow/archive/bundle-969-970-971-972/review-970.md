# Adversarial review — #970 implementation (the four claim.js copies)

Reviewer: code-reviewer (Fable). Candidate: branch `workflow/bundle-969-970-971-972` at the worktree,
baseline `7e962bdc`, scope `git diff 7e962bdc -- scripts/kaola-workflow-claim.js plugins/*/scripts/*claim.js`
(+98 per copy, 4 copies). Method: the shipped predicate bytes were sed-extracted (claim.js:4128-4152)
into a harness and RUN — over all 36 archived mission lists, over 10 constructed fixtures, and via the
authored walkthrough scenario end-to-end. Nothing below rests on reading alone unless labelled.

## Findings, most severe first

### R1 — MEDIUM: an EMPTY `result:` line counts as an outcome, so the report falsely accuses a record shape that really exists in this repo's archive

- Where: `scripts/kaola-workflow-claim.js:4130` (`MISSION_RESULT_LINE = /^(?:- |  )?result\b[^:]*:/`)
  with the flag applied at `:4144` and `:4148-4150`; same lines in all three forge copies
  (`plugins/kaola-workflow/scripts/kaola-workflow-claim.js:4130`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:3869`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:3866`).
- Failing input (REAL, not constructed): `kaola-workflow/archive/issue-878/mission-list.md:65-75` — a
  column-0 item whose fields are pre-scaffolded empty: `status: todo`, `dispatched:` (empty),
  `result:` (empty, line 73). Identically `kaola-workflow/archive/issue-899/mission-list.md:45-53`
  (empty `result:` at line 53). That is 2 of the 36 archived records.
- Wrong behaviour, demonstrated by running the shipped bytes: issue-878 yields
  `{"items":4,"outcome_while_not_done":[65]}` and issue-899 `{"items":2,"outcome_while_not_done":[45]}`.
  A minimal fixture (`item` + `status: todo` + bare `result:`) reproduces: `{"items":1,"outcome_while_not_done":[3]}`.
- Why it is wrong: the regex requires only `result...:` at line front — `[^:]*:` is satisfied with
  nothing after the colon — so a field NAME with no VALUE registers as an outcome. No outcome landed.
  The code's own comment (`:4106`: "whose outcome is filled in") and the durable prose the report then
  writes ("the outcome landed and the status did not follow") are both false for these lines.
- Why existing tests do not catch it: every fixture item in the authored scenario carries a non-empty
  `result:` value (tests-970.md states this), and the negative control has no empty-`result:` item.
  The 4-edition smoke used non-empty values too. Nothing in any suite exercises an empty field line.
- Why it matters: the report is the deliverable. It never blocks (verified — see coverage), but it
  publishes a durable false accusation into `finalization-summary.md` and the envelope on a record
  style this repo's own history uses (pre-writing the field names of a todo item is exactly the
  "three write moments" scaffold an orchestrator may lay down early). ~6% of the real archive
  false-positives today; the wording the section then emits is untrue at the named line.
- Fix direction (one line per copy): require a non-whitespace value, e.g.
  `/^(?:- |  )?result\b[^:]*:[ \t]*\S/` — plus a scaffolded-empty-fields item in the negative control
  (test custody: tdd-guide owns that pin).

### R2 — LOW: the shipped comment states an archive frequency the shipped predicate itself contradicts

- Where: `scripts/kaola-workflow-claim.js:4109` — "It is not a one-off: 9 of the 36 mission lists in
  this repo's archive carry at least one." (Present in all four copies.)
- Observed: running the predicate defined directly beneath that sentence over the same 36 archives
  flags 13 runs / 36 items (881-885, 896-898, 900-903, 911-917, 940-944, 945-948, 956-962, 878, 899,
  932, 933, 949, 967). With R1 fixed it becomes 11 runs / 34 items. It is never 9 by this code's own
  measure — the 9/27 figures came from the premise report's throwaway parser, which keyed fields
  differently (2-space indent only), and were transcribed into the comment beside a predicate that
  measures otherwise.
- Why it matters: low — comment only, no behaviour. But this project treats untrue prose absolutes as
  shipped defects (it has re-shipped this class three times), and the next reader who verifies the
  sentence against the code below it will measure 13 and conclude the code regressed. Re-measure with
  the shipped predicate after the R1 fix and write that number, or drop the count.

## Non-blocking observation (documented design call — orchestrator's decision, no repair demanded)

O1 — the column-0 record form is ambiguous at line front, and the shipped front-of-line rule inherits
that both ways. Demonstrated on constructed fixtures, zero instances in the archive:

- A column-0 continuation-prose line beginning with the word `result` and containing a later colon is
  counted as an outcome: an item with `status: in-flight`, no result field, and the prose line
  `result of the sweep: nothing found, so the item stays open` is flagged
  (`{"items":1,"outcome_while_not_done":[3]}`).
- A column-0 result-body line beginning `status: done was what the stale log claimed` overwrites the
  genuine `in-flight` via last-wins and SUPPRESSES a genuine offender (measured: not flagged).

Both need the column-0 form (3 of 36 archived records; bullet-form prose sits at 4-space indent and
cannot reach the regexes — measured). Archive-wide, every line the shipped regexes classify is a
genuine field except R1's two empties, and no prose line anywhere classifies as status or item — so
reality has never produced this input. impl-970.md names the front-of-line trade explicitly and the
consequence is one wrong report line, never a failed finalize. Fine to accept; recorded so the
acceptance is a decision rather than an accident. (Same family, even smaller: capitalized `Status:` /
`Result:` keys are invisible to the parser — zero archived instances, lowercase-key design documented.)

## What I checked and found SOUND

- Cross-edition equivalence, independently: the -U0 diff body of each of the four copies hashes
  identically (md5 `21c98c21...` for all four); canonical vs codex `cmp` clean. In-context landing
  verified by eye in gitlab/gitea: probe + persist inside the same block as the other two reports,
  BEFORE `archiveProjectDirSafely` (gitea `:4272-4277`, gitlab `:4275-4280`, canonical `:4536-4541`),
  and the guarded emit sits beside `resolved_project_note` in all four. `adaptiveSchema.MISSION_LIST_FILE`
  resolves in every edition (schema is the byte-identical copy; the implementer's 4-edition smoke also
  proves it live).
- Report-never-refuses, by code path and by run: the ONLY throw surface in
  `probeMissionListCoherence` is `readFileSync`, caught → `null` → no key, no section (demonstrated
  live with `mission-list.md` as a DIRECTORY: returns null, no throw; absent file, permission error,
  and the >2GiB string limit all land in the same catch). The parse phase is throw-free string ops;
  no catastrophic-backtracking shapes in the three regexes. `persistMissionListToSummary` writes via
  `appendSummarySection`, whose entire body is try/catch returning false (`claim.js:4065-4083`) —
  verified, that is the path actually used. Nothing touches `status:`, `reasons`, or the exit code;
  the envelope key is guarded (`:5383`). Archive-failure lanes behave as before, with the durable
  section already landed in the kept folder.
- Last-status-wins, verified independently: exactly 11 duplicate-status items archive-wide; the later
  line is `done` in ALL 11 (10 in-flight→done, 1 done→done) — matches tests-970.md's count exactly,
  zero counter-examples; the corrected items are correctly unflagged.
- Parser vs the real archive, exhaustively: all 445 item / 456 status / 405 result classified lines
  dumped and screened — zero prose lines misclassified as STATUS or ITEM; the only RESULT
  misclassifications are R1's two empties. Inverse hunt (perl, with a working positive control): zero
  field-like lines at any indent or capitalization that the shipped regexes MISS. No tabs, no CRLF,
  no BOM, no fenced code blocks anywhere in the 36 records. Fixtures: CRLF file, no-trailing-newline
  file, empty file, H1-only file, `status: DONE` value-casing — all handled correctly (empty/H1-only
  report `items: 0`, the documented zero-count behaviour).
- All 36 archive flags adjudicated by reading every one of the 13 flagged runs: 34 of 36 are
  unambiguous true positives (results reading DONE/COMPLETE/GREEN under `status: in-flight`,
  including the `status-note: DONE` items and the `result: |` block-scalar items the premise's
  parser missed). The 2 exceptions are R1.
- The stated judgment calls: outcome = name starting with `result` covers the 8 archived items that
  turn on decorated forms and excludes `earlier result:` with measured zero verdict change —
  defensible; outcome-with-no-status silent matches ADR 0017's sufficiency line; zero-count still
  reporting and no-record-total-silence are coherent and pinned. The two `result-so-far:`-only flags
  (900-903:176, 945-948:41) are the documented call working as specified — arguably coherent
  bookkeeping rather than contradiction, but #968's own defect wore that key, so the inclusion is
  defensible.
- The report's wording: both counts are numerals (`items: N`, `...: N` — the test author's numeral
  pin holds); line numbers name the `item:` line accurately (fixtures, smoke, and scenario all
  agree); tone blames the record, not the agent, and ends with "the reader's call"; no rot-prone
  mechanism claim beyond describing its own contract. `## Mission List` is idempotent by heading on
  re-entry, like its two siblings.
- End-to-end: `node scripts/simulate-workflow-walkthrough.js --shard 94/999999` in the worktree —
  `testFinalizeReportsMissionListOutcomeWithoutDone: PASSED`, exit 0, against the shipped bytes.
  The full-scope walkthrough was NOT re-run by me: defects were already admitted, and the
  implementer's record of 210/210 full scope stands unchallenged by anything I found.

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=implementer rationale=empty result field line counts as an outcome and falsely flags real archived record shapes (issue-878:65, issue-899:45)
finding: id=R2 scope=in_scope action=fix status=open severity=low fix_role=implementer rationale=comment at claim.js:4109 states 9 of 36 while the shipped predicate measures 13 of 36 (11 after R1)
finding: id=R3 scope=in_scope action=user_decision status=open severity=low fix_role=implementer rationale=column-0 prose at line front can fake an outcome or overwrite a status via last-wins; constructed only, zero archive instances, documented trade

verdict: fail
findings_blocking: 2

review_conclusion: The four copies carry the same change at the right sites, the report genuinely never refuses, and last-status-wins is correct on every real record; but the outcome regex admits an empty result field, so two real archived records are falsely reported as contradicting themselves, and the code comment misstates the predicate's own archive measurement.
