# Documentation pass — bundle 976/977/978

Doc-updater role. Docs and CHANGELOG only; no production or test file touched, nothing under
`templates/routing/`, no rendered command/SKILL surface. Ground truth: the six premise/impl records
and the two review records in this directory, plus the live diff in the worktree
(`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-976-977-978`).

## Files changed, and what each change reconciled

1. **`CHANGELOG.md`** — three entries appended to the existing `[Unreleased]` → `### Fixed`
   (after the last #975 entry; no second section created, nothing restructured):
   - **#976** — the eight bare-`mktemp` installer sites + `KW_TMPDIR` guard (GNU-only escape,
     stated as GNU; macOS immunity stated with its mechanism), the require-time
     `TMPDIR`/`TMP`/`TEMP` normalisation in the kernel (non-empty relative → `/tmp`, absolute
     byte-untouched, empty untouched, children inherit), and — its own paragraph, per its
     user-visible weight — the `mktemp -t kaola-kimi-hooks` X-less template that hard-errored on
     GNU and **aborted every kimi install with an existing config.toml**; now succeeds.
   - **#977** — the four strands as paragraphs: 7 `claude-workflow*` names join `RETIRED_COMMANDS`
     (install-path gap only; uninstall already cleared them); `RETIRED_AGENTS` 1→4 with the
     permanent-strand mechanism (uninstall deletes the manifest, so no reinstall can heal a missed
     name); opencode `--uninstall` now consults `RETIRED_WORKFLOW_COMMANDS` (stated plainly as a
     deliberate behaviour change, bounded to the 9 names every reinstall already deletes); new
     `RETIRED_HOOKS` blocklist (exactly pre-commit + write-lane) read by BOTH paths on opencode and
     kimi, where hooks previously had no removal route at all.
   - **#978** — the three #975 residual shapes closed: backslash-named file and embedded-repo
     collapsed record are never lane-exempt and now **refuse** (both entry points, verified on all
     four editions per review-978 E1/E2); the legacy route now stages/lands the run's own project
     folder around removal "the same **best-effort** union the `--sink` route has carried" —
     wording chosen deliberately so the pending R1 addendum (symlink → stage throw) contradicts
     nothing. The R2 consequence (in-lane backslash **basename** now refuses where it previously
     sank) is stated plainly, matching the #975 entry's `.DS_Store` precedent.
   - Two same-release consistency repairs inside existing `[Unreleased]` entries (additions, not
     restructuring): the #975 sink entry's "Three shapes are still destroyed silently" now ends
     "(All three are closed by #978, below.)", and the #973 entry's "each verified complete against
     that edition's full shipping history" — refuted by #977's census — gained "a census #977,
     below, shows fell short for `install.sh`: seven pre-rename names were missing". Without these,
     the released 9.9.0 section would assert two things later entries in the same section disprove.

2. **`docs/opencode-edition.md`** — two corrections:
   - :146-153 — "`copy_tree` removes exactly two things" was FALSE (review-977 N2). Now "exactly
     three": retired commands (`RETIRED_WORKFLOW_COMMANDS`), retired hook scripts (`RETIRED_HOOKS`),
     and each command name about to be written. "About to write" kept command-scoped deliberately —
     the hook deploy is a `cp` overwrite, not a per-name remove. Retire-guidance now says "command
     or hook script … the matching list".
   - Uninstall section (~:310) — "by source-tree filename" was false-by-omission in a way that
     misleads (it implies a name absent from the source tree survives): now "by source-tree
     filename plus the names the edition retired on purpose (`RETIRED_WORKFLOW_COMMANDS`,
     `RETIRED_HOOKS` …)", matching the shipped function's own doc comment.

3. **`docs/kimi-edition.md`** — two corrections:
   - Uninstall section (~:288) — same "by source-tree filename" repair, naming
     `RETIRED_ROLE_SKILLS` + `RETIRED_HOOKS`. Note this sentence was already stale at HEAD (the
     retired-skill uninstall loop predates this bundle); the bundle widened the gap.
   - Installer section (~:154) — one added sentence: the hook deploy gets the same self-healing
     (`RETIRED_HOOKS` removed before the copy), so retiring a hook means adding its name there.
     `copy_skills` "exactly two things" at :150 was checked and left ALONE — it is still true
     (the hook sweep lives in `install_support_scripts`, not `copy_skills`).

4. **`docs/conventions.md`** — two corrections:
   - "Clean-check selectivity" (~:816) — "Three shapes this widening still cannot see … are
     recorded in `CHANGELOG.md`'s `[Unreleased]` entry for #975" was FALSE. Replaced with the two
     never-exempt record shapes (backslash in a decoded path; trailing `/`, the embedded-repo
     collapse) and the closure statement for all three, including the legacy stage/land. The
     "only content outside `kaola-workflow/`/`.kw/` still fails the gate" absolute was relaxed
     (the "only" is now false). Heading marker extended to (#973/#975/#978).
   - Agent-set walk-list row (:212) — extended with `RETIRED_AGENTS` + the manifest-deletion
     permanent-strand fact (#977). Judgment call: the row was incomplete rather than false, but
     the table's whole purpose is to be the complete list walked at retirement time, and #977 is
     the measured proof this row's omission bites permanently. Flagging in case you want it out.

5. **`docs/api.md`** — `worktree_dirty` guard entry (~:845): "with the three residual shapes named
   at the end of this entry" and "Three shapes are still destroyed silently … see `[Unreleased]`
   #975 entry" were FALSE. Replaced with the two never-exempt record shapes (both routes refuse)
   and one sentence closing the third residual via the legacy stage/land. The findings tables that
   `test-forge-finalize-findings.js` pins were not touched.

## Files checked and found CLEAN (silence stated, not implied)

- `docs/architecture.md` — the clean-worktree paragraph (:119-123) is a general statement ("another
  lane's scratch … does not read as dirt; real code and shared durable state stay strict; an
  unverifiable tree still reads as dirty") that the #978 narrowing does not falsify; no temp-dir or
  retired-name claims anywhere in the file.
- `docs/workflow-state-contract.md` — no sentence describes the sink guard, uninstall model, or
  temp handling.
- `README.md` — uninstall content is command listings with no mechanism claims; zero
  `claude-workflow` mentions; no TMPDIR/mktemp/sink-guard claims ("Three shapes are accepted" at
  :615 is MultiAgentV2 config shapes, unrelated).
- `docs/README.md` — index only.
- `docs/api.md` elsewhere — `parsePorcelainPaths` contract (~:645) re-checked against premise-978's
  quoting measurements, still true; the validation-runner sandbox `TMPDIR` note (~:685) still true.
- `docs/kimi-edition.md:150` "`copy_skills` removes exactly two things" — verified still true, left
  alone (see above).
- `CHANGELOG.md` historical (released) sections — untouched by design; the only stale-claim repairs
  were inside `[Unreleased]`, where both halves ship together.
- `docs/decisions/` — deliberately not audited or edited: ADRs/decision records are historical, and
  the lead's surface list did not include them. `D-579-01.md` (referenced by the conventions
  section I edited) may describe the pre-#978 exemption as it stood at decision time — flagging
  rather than editing.

## Deliberately NOT documented

- **#978 R1** (symlink in the project folder → legacy stage throws → journal destroyed silently) —
  per instruction, being fixed in parallel (task #12). All my prose says "best-effort" for the
  stage and claims no unconditional journal survival, so a landed fix (or its absence) contradicts
  nothing; a one-line addendum slots into the #978 entry's third paragraph.
- The walkthrough entry-point TMPDIR normalisation (test custody, task #11 still in flight) — a
  test-machinery fact, excluded from the #976 entry so the entry cannot go stale against in-flight
  work.
- #977 axis 3 (kimi U1 blindness) — test-side only, no production change, not user-visible.

## Could not verify / verified with a caveat

- "On macOS none of the eight sites escapes" — rests on premise-976's six-way measurement on THIS
  macOS plus the man-page statement of the `_CS_DARWIN_USER_TEMP_DIR` mechanism; no other BSD/musl
  was measured (premise says so). The entry states the mechanism, not a universal.
- The premise-976 verdict paragraph says the `TMPDIR=.` walkthrough "modified two tracked files";
  its own leg-1 transcript shows ONE modified tracked file plus one NEW untracked artifact. I wrote
  the transcript's version ("a modified tracked file and a stray new artifact") in the CHANGELOG.
- "verified by driving it directly on all four editions" (#978 legacy-route refusal) — taken from
  review-978's E1/E2 runs, not re-run by me.
- "bounded to names every install and reinstall already deletes today" (#977 opencode wiring) —
  premise-977's P7b-pinned measurement, not re-run by me.

## Commands run (real exit codes, checked directly)

- `node scripts/generate-routing-surfaces.js --check` → **exit 0** — "all 18 surfaces byte-match
  the skeleton."
- `node scripts/test-suite-registration.js` → **exit 0** — 549 assertions (47 test files, 44
  registered, 3 exempt). Run because `docs/api.md` was edited.
- `node scripts/test-forge-finalize-findings.js` → **exit 0** — run because it pins `docs/api.md`
  content (finding-type tables; my edit is in the guards region, confirmed green).

Note for finalize ordering: `docs/api.md` is chain-consumed, so these edits stale any chain receipt
made before them — CHANGELOG/docs are now in place for the receipt run to come after, per the
standing write-CHANGELOG-before-the-receipt rule.

## Correction after review (team-lead catch: number attached to the wrong predicate)

- The #976 entry originally said "497 `mkdtempSync(path.join(os.tmpdir(), …))` sites in
  `scripts/`". 497 was premise-976's BROAD count (every `mkdtempSync(` site in `scripts/*.js`);
  the narrow form counts 493 in today's tree and ~491 at the premise commit, and both counts moved
  when this bundle added `test-relative-tmpdir-escape.js`. Fixed by dropping the precise figure
  (option b): "hundreds of `mkdtempSync(path.join(os.tmpdir(), …))` fixture roots across the test
  suites, and four production scripts".
- The same audit found a second slippage in my own sentence: "four of them in production scripts"
  read as four SITES, but four is the count of production SCRIPTS on the `os.tmpdir()` surface —
  run-chains, sink-merge, validation-runner, adaptive-schema, the last via a `GIT_INDEX_FILE`
  path built on `os.tmpdir()` with **zero** `mkdtempSync` calls at the premise commit; and the
  bundle's own legacy-stage site has since made the narrow site count five (verified in-tree:
  run-chains:326, sink-merge:2183+:3271, validation-runner:552+:611). The rewritten sentence
  attaches "four" to scripts only.
- Every other figure in the three entries re-verified against the records and the tree: eight
  installer sites (4+3+1, per-site table in premise-976), seven `claude-workflow*` names (the
  install.sh diff adds exactly 7), four retired agents censused / one previously listed / three
  measured surviving uninstall+reinstall, nine opencode retired command basenames, two
  `RETIRED_HOOKS` names on each edition, four strands in #977 (axis 3 excluded as test-only),
  three #978 shapes, four editions driven, two new record rules. No other number is attached to a
  predicate it was not measured with.

## R1 addendum (landed; #978 entry extended)

- The #978 entry gained a fourth paragraph (between the legacy-rescue paragraph and the
  consequence paragraph): a stage that throws while the journal directory exists now stops BOTH
  routes loudly with the removal skipped and the worktree and journal intact. Verified in the
  tree, not only from the hand-off: both blocks read directly —
  `scripts/kaola-workflow-sink-merge.js:2165-2205` (`--sink` merge step: error set aside, checked
  after the catch, `if (!wtStageErr) removeWt(...)`, typed `result:'refuse',
  reason:'stage_failed'`, exit 1, detail naming path + error) and `:3255-3286` (legacy Step 3:
  same capture shape, refusal by THROW, "sink-merge refused: could not stage …"); `stage_failed`
  present in all three plugin sink copies.
- One precision that differs from the hand-off, taken from the code: the typed `stage_failed`
  envelope is the `--sink` transaction's shape only — the LEGACY route refuses by throw, the same
  shape as its other keep-guards. The entry attributes the typed reason to `--sink` and says
  "stop loudly, naming the source path and the underlying error" for both, which is true of both.
- "Best-effort" was SPLIT, not struck: the landing union keeps the word; the stage failure is no
  longer best-effort. A missing worktree or absent journal directory still stages nothing and
  sinks as before — the entry says so, so the refusal is not over-read as "any stage problem".
- Deliberately NOT written: no all-failure-modes claim (the entry's own bound is "this closes the
  measured trigger, not every way a stage could go wrong"); the unreadable-file (EACCES) trigger
  is not mentioned in either direction — mechanically it would likely take the same refusal path,
  but it is unfixtured (permission fixtures invert under root; a named omission in the test
  comments), so covered/not-covered would both be unverified claims.
- Verification citable (team-lead's own run, independently matching the test author's two-site
  repair mirror): `node scripts/test-sink-merge.js` → exit 0, 1058 assertions. Addendum number
  audit: "both routes" = the two blocks read above; "every shipped surface reaches" `--sink` =
  premise-978's rendered-invocation measurement; no other figures. CHANGELOG-only edit — no
  routing surface or api.md touched, so the previously reported green runs stand.
