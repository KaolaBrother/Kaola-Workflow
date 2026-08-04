# Tests for issue #931 — the collision the committed record did not name

**Baseline:** `68cb48f4a71c1d125d403ed7e251d47d7077b730` (branch `main`).
**File written:** `/Users/ylpromax5/Workspace/Kaola-Workflow/scripts/test-sink-merge.js` — the only file
changed (`git status --porcelain` → ` M scripts/test-sink-merge.js` plus the pre-existing untracked
`kaola-workflow/bundle-930-931/`). No production code was written.

---

## RED on the unmodified baseline

```
RED: #931 n1 — the committed record must NAME kaola-workflow/archive/issue-93101/
RED: #931 n2 — the committed record must NAME kaola-workflow/archive/issue-93102/
baseline: 68cb48f4a71c1d125d403ed7e251d47d7077b730
```

`node scripts/test-sink-merge.js` → **EXIT=1**, `2 failed, 671 passed`. Verbatim:

```
Test (#931 n1): a collision with an UNTRACKED pre-existing archive — the run's only copy of that evidence — must be named in the committed record: the suffixed archive is committed as always, and the bytes it commits say which directory was already there
FAIL: #931 n1: the committed record must NAME kaola-workflow/archive/issue-93101/ — the destination that already existed and forced the suffix. Everything this commit carries sits under kaola-workflow/archive/issue-93101.archived-2026-08-03T16-46-59-400Z/, so as it stands the collision is legible only to a reader who already knows what produces the `.archived-` token, and the archive still holding the rest of the run's evidence is named nowhere at all.
committed kaola-workflow/archive/issue-93101.archived-2026-08-03T16-46-59-400Z/finalization-summary.md:
"# Finalization Summary\n\nARCHIVED AFTER FINAL GIT GATE\n\n## Sink Findings\n\npost_rebase_tests: skipped\n\narchived_paths:\n- kaola-workflow/archive/issue-93101.archived-2026-08-03T16-46-59-400Z/finalization-summary.md\n- kaola-workflow/archive/issue-93101.archived-2026-08-03T16-46-59-400Z/workflow-state.md\n"

Test (#931 n2): the same disclosure is owed when the pre-existing archive is TRACKED — a report that only speaks up for the untracked shape leaves the other collision exactly as silent as before
FAIL: #931 n2: the committed record must NAME kaola-workflow/archive/issue-93102/ ... (same clause, same shape)
committed kaola-workflow/archive/issue-93102.archived-2026-08-03T16-47-00-421Z/finalization-summary.md:
"# Finalization Summary\n\nARCHIVED AFTER FINAL GIT GATE\n\n## Sink Findings\n\npost_rebase_tests: skipped\n\narchived_paths:\n- kaola-workflow/archive/issue-93102.archived-2026-08-03T16-47-00-421Z/finalization-summary.md\n- kaola-workflow/archive/issue-93102.archived-2026-08-03T16-47-00-421Z/workflow-state.md\n"

Sink-merge (#694/#700/#705/#707/#715/#746/#832/#893/#923/#931) test suite FAILED: 2 failed, 671 passed.
```

The dumped bytes are the failure's own evidence: byte-shape-identical to the real incident's committed
summary at `02471029` (only the timestamp and project name differ). **Exactly two assertions fail, and
both are the headline clause.** Every other clause I added — the preconditions, the arming control, the
citation clause, the no-fabrication control — passes on the baseline, and so do all 648 pre-existing
assertions (671 passed − 23 of mine that pass = 648).

## The rest of the suite is green, and the pin is satisfiable

Baseline before my change: `648 assertions`, 62 tests, exit 0, ~56 s.
After my change: 673 total assertions (25 new), 2 red as above, **nothing else red — `#700 c`
(`testCollisionSuffixedArchiveCommittedAndDisposed`, test #1) still passes untouched.**

Satisfiability was **driven, not assumed.** I mirrored `scripts/` into scratch, applied a plausible fix
to the *mirror's* `kaola-workflow-sink-merge.js` only — a third argument to
`persistArchivedPathsToSummary` writing one `archive_collision: <plain-rel>/ already existed …` line,
set at the `archive_commit` call site from `archiveRel !== plainArchiveRel && fs.existsSync(plain)` —
and ran the whole suite from the mirror:

```
Sink-merge (#694/#700/#705/#707/#715/#746/#832/#893/#923/#931) test suite passed: 673 assertions.
EXIT=0
```

That single run proves four things at once: the headline clause is reachable by a **non-finding durable
record**; test #1's `!('findings' in out)` and no-`FINDING`-on-stderr assertions survive it; the (n3)
control does **not** false-red against a correctly conditional statement; and the closure-audit citation
clause does not false-red against a repo-relative disclosure. The scratch mirror has been deleted; the
repo is at `68cb48f4` with only `scripts/test-sink-merge.js` modified.

---

## What I pinned, and why

### The result, not the method

**A line in the COMMITTED `finalization-summary.md` that names the pre-existing unsuffixed directory
and is not merely an entry of the path list that same commit already carries.**

No field name, no wording, no section, no producer function is pinned. The implementer may write it
from either summary writer, in any form. Read entirely out of git — `git ls-tree -r -z HEAD` to find
the suffixed archive and its blob set, `git show HEAD:<rel>` for the bytes — because "discoverable from
the committed record alone, without inspecting the filesystem" is the demanded result. The sink's own
receipt is never consulted for any assertion.

The "not merely a path-list entry" discount is doing real work in two directions:

- it is what lets the pin and its control be **one rule** — on a no-collision run the archive *is*
  `kaola-workflow/archive/<project>/`, so its own `archived_paths` entries name that string on every
  line, and a bare substring test would read the ordinary record as a collision report and make (n3)
  unfailable;
- it closes the cheap way out — smuggling the pre-existing directory's files into `archived_paths` is
  a claim to have *committed* them, not a disclosure that they were *left behind*.

### Both shapes of prior archive, one assertion set

`assertCollisionIsNamedInTheCommittedRecord` is called from two arms whose single axis is whether the
pre-existing archive is in the commit:

- **(n1) untracked** — the 2026-08-03 incident shape. Planted after every commit and after the checkout
  back to main, so git holds no record of it; two files (`workflow-state.md`, `.cache/prior-note.md`),
  the run's only copies. Preflight exempts it through #893's own-archive-mirror arm (untracked, under
  this project's archive prefix, not carried by the branch), so the transaction runs to `status: sinked`
  exactly as it did on 2026-08-03 rather than refusing at `sink_blocked`. Confirmed by the run: the arm
  reaches the archive and only the headline clause fails.
- **(n2) tracked** — `buildSoleArchiverFixture`'s committed residue, i.e. **test #1's fixture unchanged.**

**This is the deliberate judgment call the brief left to me: the disclosure is owed unconditionally, and
tracked-ness is not itself pinned.** The issue's falsifiable statement is unconditional ("when the sink
writes its archive to a suffixed destination *because the unsuffixed one already existed*, the committed
record names that fact"), and both shapes are that. A report that *also* records tracked-ness is welcome
and will pass; **a report that fires only for the untracked shape will fail (n2), on purpose** — the
tracked collision leaves two archives standing for one project and the record is just as silent about it.
Each arm asserts its own shape rather than assuming it (`priorFiles` still on disk after the sink, and
at-HEAD presence equal to the arm's `priorTracked`), so an arm whose fixture stopped being the shape it
claims fails loudly instead of passing vacuously.

**A finding is not available for (n2), and that is a live pin rather than my preference.** Test #1
drives the same fixture and asserts `!('findings' in out)` and no `sink-merge: FINDING` on stderr, citing
#700. I did not edit it, and the two coexist — proven by the green mirror run above. A finding-based
route remains open for the untracked arm alone if the implementer wants one, since test #1's fixture is
tracked; I neither require nor forbid that.

### The no-fabrication control (n3)

Single-axis: the identical fixture with `noPriorArchive: true`, so the archive lands at the plain path.
It asserts the archive at HEAD is **not** suffixed (the axis really moved), then that the committed
summary contains no statement about a pre-existing `kaola-workflow/archive/<project>/` beyond the paths
it actually committed there. Without this the whole pin is satisfiable by a line that is printed
unconditionally — which discloses nothing, because a reader could no longer tell the two runs apart from
their records. It passes on the baseline by construction; it is a fence, not a red.

### The `closure-audit` landmine, pinned through the shipped function

Every arm asserts `require('./kaola-workflow-closure-audit.js').archiveCitedMissing(<suffixed archive>)`
returns `[]`. The abandoned archive's evidence lives at `.cache/…` paths, so a disclosure that names its
**contents** bare-relative would make closure-audit report
`archive_summary_citation_missing` — a second false statement in the very record the fix exists to make
true. Repo-relative `kaola-workflow/archive/<project>/…` is not a citation and is unaffected. I imported
the shipped scanner rather than copying its regex (one rule, one wording).

**(n0) is the arming control for that clause**, because "nothing cited is missing" must not be
indistinguishable from "this reader no longer flags anything". It drives `archiveCitedMissing` in
process on a scratch directory and asserts both directions: a bare `.cache/does-not-exist.md` **is**
flagged, and a repo-relative `kaola-workflow/archive/<project>/` mention **is not**. Both measured green
on the baseline. `(n1)` deliberately plants `.cache/prior-note.md` in the abandoned archive so the
regression this clause guards is actually reachable.

### Fixture change

One flag added to the shared `buildSoleArchiverFixture`: `opts.noPriorArchive` suppresses the
pre-existing archive plant. Default is unchanged behaviour, no existing caller passes it, and all 648
pre-existing assertions still pass. Two callers: (n3) and (n1), which plants its own untracked copy
afterwards.

---

## Things that change the picture

1. **The disclosure has no producer to read from.** `archiveProjectDir` returns no field naming the
   collision (premise §2a) — only `dest`, whose *string* carries `.archived-<ts>`. So the implementer
   must either infer the collision at the sink (`archiveRel !== 'kaola-workflow/archive/' + project`,
   plus an existence probe — what the mirror fix did, in ~6 lines inside `sink-merge.js` alone) or add a
   return field in `claim.js`, which is **four copies** (premise §6: canonical + the byte-identical codex
   copy, plus the hand-ported gitlab and gitea). The sink-local route is strictly cheaper and is what my
   satisfiability proof used; I am not prescribing it.

2. **`persistArchivedPathsToSummary` early-returns when `archivedPaths` is empty.** A disclosure hung on
   that writer is silently skipped on a run that commits nothing under the archive band (the #893 w10 /
   #832 q gitignored shape). None of my arms hits that combination — a collision always commits at least
   the summary and the state file — so nothing I wrote catches it. Worth the implementer's attention;
   `persistSinkFindingsToSummary` has no such gate.

3. **Nothing I wrote covers the gitlab or gitea ports.** My brief scoped edition propagation elsewhere
   and forbade touching the plugin copies, so I did not extend the pin across editions — even though
   this file has the idiom for it (`runSinkAt` + the `(z1)/(z2)/(z3)/(z4)/(#912)` four-edition sweeps,
   whose stated reason is precisely that "a fix landing on three copies is invisible until a user on the
   fourth hits it"). The collision-suffix sites exist in every port (premise §6: gitlab `claim.js:2253`
   and `:2347`; gitea `:2252` and `:2346`), and `test-gitlab-sinks.js` / `test-gitea-sinks.js` carry no
   #931 pin. **A three-copy fix will pass everything I wrote.** Flagging for the lead's decision; I have
   not acted on it.

4. **The premise report's partial refutation stands and is visible in the failure output.** The
   `.archived-<ts>` token *is* in the committed record three times, and it is uniquely produced by the
   destination-exists branch — so the collision is lexically encoded. What is absent, and what my pin
   demands, is a **statement**, plus any mention at all of the directory that caused it. The failure
   message says so in those terms rather than claiming the record is empty.

5. **Cost.** The suite goes from ~56 s / 648 assertions to ~60 s / 673 assertions (three added sink
   transactions plus one in-process control).

---

# Addendum — (n4), the cross-edition sweep

Added after the lead routed the edition gap back into my custody with the four-leg measurement from
`.cache/premise-930.md` §7: the root↔codex pair is the only one machine-enforced, and a **gitlab-only
or gitea-only omission is invisible to BOTH `validate-script-sync.js` and `edition-sync.js --check`**.

Still test artifact only — `scripts/test-sink-merge.js` remains the sole file I wrote. Suite banner and
scenario header updated; test #1's assertions untouched.

## Circumstance that changed mid-task

`impl-931` landed the real four-copy fix while I was writing the sweep. My baseline RED for (n1)/(n2)
was measured before that, at `68cb48f4` with a clean tree, and stands as recorded above. Everything in
this addendum was measured against the implementer's actual code, which makes the positive control real
rather than simulated. The four sink copies as measured (sha256, first 16):

```
bc6b84907c929697  scripts/kaola-workflow-sink-merge.js
bc6b84907c929697  plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js   (byte-identical, preserved)
2f3064152cfa2285  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js
9f7cf4599e8974b5  plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js
```

`node scripts/test-sink-merge.js` against that tree → **EXIT=0, `693 assertions`.** The implementer's
disclosure satisfies (n1), (n2), (n3), the closure-audit citation clause and (n4) as written, and it
honours the empty-staged-list constraint you routed (it rides `persistSinkFindingsToSummary`, not
`persistArchivedPathsToSummary`).

## What (n4) pins, and how it stays a result pin

The marker is **derived at run time from the disclosure (n1)/(n2) actually observed in the committed
record**, never declared in the test. Every runtime-substituted token is cut out (the suffixed
destination, the unsuffixed one, the bare project name); what remains had to be literal text inside the
producer. Each remaining piece is reduced to its **longest run appearing verbatim in the canonical
sources** — necessary because this codebase splits long sentences across `+`, so a whole piece is
routinely not contiguous in the file and requiring one would red a correct fix. Runs under 8 characters
are dropped. Derived from the implementer's actual sentence, the marker came out as three fragments of
19 / 46 / 94 characters:

```
["archive_collision: ",
 " already existed, so this run was archived to ",
 "The pre-existing directory was left exactly where it was — a SECOND archive standing for this "]
```

The third fragment stopping at `this ` is the concatenation-split robustness working as designed. Each
edition's **shipped** modules must contain every fragment: `<edition>-sink-merge.js`,
`<edition>-claim.js`, plus `kaola-workflow-adaptive-schema.js` and `kaola-workflow-closure-contract.js`
(included because they are byte-identical across all four editions, so a disclosure written into one of
them genuinely does reach every port — omitting them would red a correct fix). Test files are
deliberately excluded: a guard reads what ships, not what was authored, and a port whose own suite
quotes the wording while its script does not must not pass.

Root is the calibration source, so it is not re-asserted as if it were evidence. The calibration
assertion is the one that keeps the three legs from being empty: the disclosure must be made of literal
text totalling ≥16 characters, or the sweep says it has nothing specific enough to look for.

## Mutation proof — the sweep is armed

All runs through a scratch mirror of `scripts/` + `plugins/`, never `git checkout --`; the
implementer's working tree was never written to, and the four sink SHAs above are unchanged after all
five runs.

| Run | Result |
|---|---|
| **Positive control** — mirror unmodified (implementer's four-copy fix) | `693 assertions`, **EXIT=0** — the mirror itself is sound |
| **codex** copy alone reverted to HEAD | **EXIT=1**, `1 failed, 692 passed` — the single failure is `#931 n4 (codex)` |
| **gitlab** copy alone reverted to HEAD | **EXIT=1**, `1 failed, 692 passed` — the single failure is `#931 n4 (gitlab)` |
| **gitea** copy alone reverted to HEAD | **EXIT=1**, `1 failed, 692 passed` — the single failure is `#931 n4 (gitea)` |
| **all four** reverted to HEAD (true baseline) | **EXIT=1**, `3 failed, 671 passed` — `n1`, `n2`, and `n4` reporting it has no marker to sweep for |

Each single-port mutation reds **exactly one assertion, and it is that port's leg** — no collateral, no
silence. The gitea leg verbatim:

```
FAIL: #931 n4 (gitea): this edition's sink modules do not carry the collision disclosure the canonical
copy emits. The collision-suffix logic exists in every port, and an omission here reaches a user with
nothing in between: validate-script-sync.js and edition-sync.js --check are both blind to a gitea-only
difference. Missing fragment(s): ["archive_collision: "," already existed, so this run was archived to ",
"The pre-existing directory was left exactly where it was — a SECOND archive standing for this "]
```

The baseline leg matters as much as the three port legs: with no disclosure anywhere, (n4) fails on
**its own terms** rather than skipping. A sweep that goes quiet exactly when the thing it sweeps for is
missing is not a sweep, and that is the failure mode this repo has shipped before.

## The sweep's honest limits

1. **It reads TEXT, not behaviour.** A port that carries the sentence but never reaches the code that
   writes it passes. It catches the omission — the measured risk — not a miswiring. Only a run of each
   port's own suite closes that, and `glab`/`tea` are absent on this box, so a static sweep is the
   instrument available rather than the instrument I would choose.
2. **A wording that already existed verbatim in a port would make that leg vacuously green.** Nothing
   checkable at run time rules this out; the mutation proof above is what rules it out for *this* fix.
   Re-run the mutation legs if the disclosure wording is ever rewritten.
3. **It requires the ports to share the canonical wording.** That is `one rule, one wording` applied to
   a rule with no capability difference behind it, so it is a constraint the project already imposes —
   but if a port ever needs genuinely divergent text, this leg is what will have to be revisited, as a
   declared named region rather than an incidental rewrite.

## Cost

Suite: ~60 s / 693 assertions (up from ~56 s / 648 at baseline). (n4) itself adds 20 assertions and no
subprocess — it reads 16 files in process.

---

# Addendum 2 — R2 accepted: (n5), the control that can fail

R2 is correct and the diagnosis is exact. `scripts/test-sink-merge.js` remains the only file I wrote.
(n1)–(n4) are unchanged.

## Why (n3) could not fail, confirmed independently

Driven here, single-axis, before writing anything:

```
untracked-empty-cache  liveDir on main after checkout: PRESENT | entries: [".cache"]
tracked-cache          liveDir on main after checkout: ABSENT  | entries: -
```

`buildSoleArchiverFixture` creates `<liveDir>/.cache` unconditionally and, with no `liveCacheFiles`,
leaves it empty and untracked. `git checkout main` cannot remove a directory holding an untracked
child, so the live folder survives on main, `resolveSinkReceiptPath` returns the LIVE path, no archive
skeleton is manufactured, and the destination never gets suffixed. (n3)'s own precondition is satisfied
by the fixture rather than by the producer. A **tracked** live `.cache/` is what makes the checkout
remove the live tree outright — one axis, nothing else.

## (n5) — the biconditional, driven on every edition

The property is not "a collision is disclosed" but **the statement appears when a prior archive was
really there and does not when it was not**. Both directions run through *one* assertion set,
`assertDisclosureTracksTheCollision931`, on the *same* fixture, with a single axis between them —
whether a real untracked prior archive is planted. A control that shares no code with the arm it
controls is a control of something else.

Both preconditions are measured at sink start rather than assumed, which is precisely what (n3) failed
to do: the live folder must be ABSENT from main (what routes the receipt to the archive path and makes
the sink manufacture its own skeleton), and the plain archive must be present/absent per mode.

The no-collision leg does **not** pin the absence of a suffixed destination. The sink's own skeleton
pushing the destination off the plain path predates #931; pinning it here would pin behaviour outside
the claim. It locates the committed archive wherever it landed (`committedArchiveRelAtHead`) and pins
only that no statement names the plain path.

**Driven per edition, behaviourally** — thank you for R5, it is what made this possible. Each port's own
sink is executed through its own forge mock hook (`KAOLA_GLAB_MOCK_SCRIPT` / `KAOLA_TEA_MOCK_SCRIPT`),
with `--keep-issue-open` for (z1)'s stated reason so the gh-argv mock never becomes the thing measured.
This closes (n4)'s declared blind spot: a port that carries the sentence but never reaches the code
writing it now fails.

## RED against the shipped producer — all four editions

Measured against the R1-defective producer as it stood at the time of the run:

```
RED: #931 n5 root/none    — archive_collision names kaola-workflow/archive/issue-93160/, which never existed
RED: #931 n5 codex/none   — same, issue-93161
RED: #931 n5 gitlab/none  — same, issue-93162
RED: #931 n5 gitea/none   — same, issue-93163
EXIT=1, 4 failed, 741 passed
```

The failure carries the producer's own sentence, and the last line of it is the proof:

```
FAIL: #931 n5 root/none: NOTHING pre-existed at kaola-workflow/archive/issue-93160, so the committed
record must not say anything did. ... Offending line(s): ["archive_collision:
kaola-workflow/archive/issue-93160/ already existed, so this run was archived to
kaola-workflow/archive/issue-93160.archived-2026-08-03T18-06-23-481Z/ instead. The pre-existing directory
was left exactly where it was — a SECOND archive standing for this project, no part of this one. ..."]
committed .../finalization-summary.md:
"# Finalization Summary\n\nARCHIVED AFTER FINAL GIT GATE\n\n## Sink Findings\n\npost_rebase_tests:
skipped\n\narchive_collision: kaola-workflow/archive/issue-93160/ already existed, ...\n\narchived_paths:\n- ..."
plain path on disk afterwards: ABSENT
```

`plain path on disk afterwards: ABSENT` — the committed, pushed record sends a reader to a directory
that is not there. All four `collision` legs passed in that same run, so the ports genuinely reach the
disclosure code; the reds are attributable to the axis and to nothing else.

## The other direction, at true HEAD

To bound what each leg measures, the whole suite was run in a scratch mirror with all four
`*sink-merge.js` **and** all four `*claim.js` copies reverted to `HEAD` (a clean pre-bundle sink
surface, free of the concurrent #930 edits):

```
EXIT=1, 7 failed, 719 passed
  #931 n1, #931 n2                       — no disclosure at all
  #931 n4                                — no marker to sweep the editions for
  #931 n5 root|codex|gitlab|gitea/collision — a real prior archive, and the record does not name it
```

The four `n5 …/none` legs **pass** at true HEAD, correctly: a producer that says nothing fabricates
nothing. So the two directions red on opposite producers — `collision` on the silent one, `none` on the
over-eager one — which is what makes the pair a biconditional rather than two assertions pointing the
same way.

## Moving target — read this before trusting any green

`impl-931` was editing the four sink copies throughout. Measured, not inferred:

- one run reported a single `#931 n5 gitea/collision` red; the gitea copy's sha changed **during** that
  run (`4982e1ab…` at start, `1dcda5fe…` at end). **I do not claim that as a defect** — it was a file
  being rewritten mid-run, and I am recording it only so nobody re-derives it as a finding.
- a later full run reported `745 assertions, EXIT=0`, also against a tree that changed underneath it.

I am not offering either as a verdict. The reds above are the deliverable; a green belongs to whoever
runs this on a settled tree.

## Cost

Suite ~68 s / 745 assertions (from ~56 s / 648 at baseline). (n5) adds 52 assertions and 8 sink
transactions — 4 editions × 2 modes.
