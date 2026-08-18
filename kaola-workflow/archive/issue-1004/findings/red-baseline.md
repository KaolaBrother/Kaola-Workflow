# #1004 — RED baseline for the fill-if-empty pins

**Baseline commit: `3380cafe48108509cc76f0f02f19c563b5d4ea88`** (`git rev-parse HEAD` in
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1004`, tree clean at
the start of authoring; the only changes in the tree are the two test files below).

Two artifacts, both written and both RED against unmodified production code:

| artifact | path | what it drives |
|---|---|---|
| 1 | `.kw/worktrees/issue-1004/scripts/test-finalize-door.js` — `T17` | real `finalize` subprocesses over planted summaries |
| 2 | `.kw/worktrees/issue-1004/scripts/simulate-workflow-walkthrough.js` — `testFillIfEmptySummarySectionPortedToAllEditions1004` | the shipped `appendSummarySection` of all four claim.js copies |

No production file was edited. Every "with the fix" run below was executed against a **throwaway
copy of the tree** under the scratchpad, never against the worktree.

---

## 1. Artifact 1 — `T17` in `scripts/test-finalize-door.js`

### Command

```
cd /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1004
node scripts/test-finalize-door.js
```

### Result at baseline

```
finalize-door tests FAILED (16 failures, 827 passed)
BASELINE_EXIT=1
```

The suite was green before T17 existed — `finalize-door tests passed (791 assertions)`, exit 0, on
the same commit. All 16 failures are T17's; nothing pre-existing moved.

### Verbatim failing output

```
T17: finalize fills its own pre-planted headings, and never overwrites one carrying content
FAIL: T17a (consecutive-heading form): `## Validation` was planted EMPTY by the Step 6 template and finalize computed its finding, so the finding must be IN it. An empty section here is the measurement being taken and then dropped — the archived summary is the last place it can be read; got ""
----- summary -----
# Finalization — Summary: issue-9106

## Delivered
## Files Changed
## Test Coverage
## Validation
## Changed Paths
## Mission List
## Documentation Docking
## Run gaps
## Follow-Up Items
## Status: ARCHIVED AFTER FINAL GIT GATE

FAIL: T17a (consecutive-heading form): `## Changed Paths` was planted EMPTY by the Step 6 template and finalize computed its finding, so the finding must be IN it. ...; got ""
FAIL: T17a (consecutive-heading form): `## Mission List` was planted EMPTY by the Step 6 template and finalize computed its finding, so the finding must be IN it. ...; got ""
FAIL: T17a (consecutive-heading form): the pre-planted `## Validation` carries the classification this run reported on its envelope ("chains_green"); got ""
FAIL: T17a (consecutive-heading form): the pre-planted `## Changed Paths` lists every path the envelope reported, one `- <path>` bullet each; envelope=["src/orphan.js"] section=""
FAIL: T17a (consecutive-heading form): the pre-planted `## Mission List` reports the run record's item count (2 items in this fixture); got ""
FAIL: T17a (consecutive-heading form): ...and the contradiction it found — the second item fills in an outcome while its status still reads `in-flight`; got ""
FAIL: T17b (blank-line form): `## Validation` was planted EMPTY by the Step 6 template ...; got ""
FAIL: T17b (blank-line form): `## Changed Paths` was planted EMPTY by the Step 6 template ...; got ""
FAIL: T17b (blank-line form): `## Mission List` was planted EMPTY by the Step 6 template ...; got ""
FAIL: T17b (blank-line form): the pre-planted `## Validation` carries the classification this run reported on its envelope ("chains_green"); got ""
FAIL: T17b (blank-line form): the pre-planted `## Changed Paths` lists every path the envelope reported, one `- <path>` bullet each; envelope=["src/orphan.js"] section=""
FAIL: T17b (blank-line form): the pre-planted `## Mission List` reports the run record's item count (2 items in this fixture); got ""
FAIL: T17b (blank-line form): ...and the contradiction it found — the second item fills in an outcome while its status still reads `in-flight`; got ""
FAIL: T17c: the EMPTY `## Validation` in the same file was filled with this run's classification ("chains_green") — preserving a written section and filling an empty one are one rule, and a build that writes nothing at all satisfies only half of it; got ""
FAIL: T17c: ...and so was the empty `## Mission List`; got ""
```

The dumped summary above is the **archived** `finalization-summary.md` from a real finalize that
exited 0 and reported `chains_green` on its envelope and `changed_paths: ["src/orphan.js"]` — and
carries none of it. That is the defect, reproduced end to end.

### What is RED and what is a green regression pin

| leg | state at baseline | why |
|---|---|---|
| T17a — verbatim Step 6 skeleton, three empty headings | **RED** (8 assertions) | the fix |
| T17b — blank-line form, three empty headings | **RED** (7 assertions) | the fix |
| T17c — one heading carries operator prose; the other two are empty | **mixed**: the *preserve* assertions are GREEN today (the writer declines on everything, so it also declines here); the *fill* assertions are **RED** (2) | the preserve half is a regression pin against `replace: true` |

T17c is deliberately one fixture, not two: the fill and preserve halves are the same rule, so a
build that satisfies preserve by never writing fails the same leg.

### Satisfiability (this is not a broken test)

Scratch tree, canonical `scripts/kaola-workflow-claim.js` only, `if (!replace) return false;`
replaced with a body-emptiness test:

```
node /private/tmp/.../scratchpad/mt2/scripts/test-finalize-door.js
finalize-door tests passed (843 assertions)
CANDIDATE_EXIT=0
```

791 → 843: T17 contributes 52 assertions, all passing under the fix, zero pre-existing regressions.

### One fixture bug found and fixed during authoring

The first T17a draft asserted every Step 6 heading survives **verbatim**, and reported
`## Status: READY FOR FINAL GIT GATE` — got 0 occurrences. That was my fixture being wrong, not the
code: `archiveProjectDirSafely` rewrites that sentinel to `ARCHIVED AFTER FINAL GIT GATE` by design
(`scripts/kaola-workflow-claim.js:2625`, #324) so an archived run cannot read as still awaiting the
gate. The leg now checks that heading by `## Status:` prefix and says why in a comment.

---

## 2. Artifact 2 — `testFillIfEmptySummarySectionPortedToAllEditions1004`

### Command

```
cd /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1004
node scripts/simulate-workflow-walkthrough.js --only testFillIfEmptySummarySectionPortedToAllEditions1004
```

Run **by name**, because the claude chain samples this suite at a rotating 1/12 shard and `npm test`
may not execute it at all. It is registered in the scenario registry
(`--list` line 58, immediately after `testStaleDiagnosticsPortedToAllEditions1002`).

### Result at baseline

```
EXIT=1
Error: #1004 port guard: scripts/kaola-workflow-claim.js — a `## Validation` heading planted by Step 6 with NOTHING under it must be FILLED. Declining here is the whole defect: the finding is computed and then dropped, and the archived summary is the last place it could have been read. Got:
# Finalization — Summary: issue-1004

## Validation
## Changed Paths
## Mission List

    at assert (.../simulate-workflow-walkthrough.js:50:25)
    at Object.testFillIfEmptySummarySectionPortedToAllEditions1004 [as fn] (.../simulate-workflow-walkthrough.js:5409:9)
```

The **harness-control leg ran first and passed** — a heading that is ABSENT is still appended — which
is what makes this red a verdict about behaviour rather than about the pin failing to evaluate the
shipped function. That control exists because `appendSummarySection` wraps its body in
`catch (_) { return false; }`, so an evaluation fault would otherwise be indistinguishable from a
refusal to write.

### Per-copy table — what the pin binds, and where

The pin is **behavioural, not a regex**: each copy's `appendSummarySection` is lifted out of its own
file (plus every top-level function it transitively calls, from the same file), evaluated with only
`fs` / `path` / `os` / the sibling adaptive-schema / a `writeFile` stub supplied, and driven against
real files in a temp dir. So there is no "regex fires on line N" to report; what follows is the line
each copy must change, at its real current line number, and the empirically measured verdict.

| copy | path | `appendSummarySection` def | the declining line (must change) | 3 script-owned callers | `replace:true` caller |
|---|---|---|---|---|---|
| root | `scripts/kaola-workflow-claim.js` | `:3940` | `:3947` `      if (!replace) return false;` | `:3976` `:3988` `:4057` | `:4266` |
| codex | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | `:3940` | `:3947` (identical) | `:3976` `:3988` `:4057` | `:4266` |
| gitlab | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | `:3717` | `:3724` (identical) | `:3753` `:3765` `:3834` | `:4042` |
| gitea | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | `:3714` | `:3721` (identical) | `:3750` `:3762` `:3831` | `:4039` |

`diff` over the 20-line writer block confirms all four are byte-identical to canonical today
(`GITLAB-IDENTICAL`, `GITEA-IDENTICAL`), and `if (!replace) return false;` occurs **exactly once** per
file — so the target is unambiguous in every copy.

### Partial-port detection — MEASURED, not argued

The brief asked me to establish partial-port detection by construction because I cannot edit
production code. I did better: I copied the tree to the scratchpad, applied a candidate fill-if-empty
patch to a **chosen subset** of the four copies there, and ran the real pin from that copy. The
worktree and the repository were never touched.

| case | patched copies | pin exit | copy the message NAMED |
|---|---|---|---|
| partial: gitea unported | root, codex, gitlab | **1** | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` |
| partial: canonical unported | codex, gitlab, gitea | **1** | `scripts/kaola-workflow-claim.js` |
| partial: gitlab + gitea unported | root, codex | **1** | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` |
| full port | all four | **0** | — (`testFillIfEmptySummarySectionPortedToAllEditions1004: PASSED`) |

Any single copy left behind reds, the message names that copy, and a complete port goes green. The
red is not unconditional, and it is not satisfied by three copies out of four.

### Legs per copy

1. **harness control** — heading absent → appended (green today; a red here means the pin could not
   evaluate that copy).
2. verbatim Step 6 form — `## Validation\n## Changed Paths\n## Mission List` (body `''`) → filled,
   exactly one heading, **and the two following headings survive** (the cut must not over-reach).
3. blank-line form (body `'\n'`) → filled. Only `body.trim() === ''` reaches both 2 and 3.
4. heading LAST in file, section runs to EOF (`after < 0` branch) → filled, without taking the
   preceding section with it.
5. **the owner's decision** — a section carrying prose is left exactly as written; the writer's own
   lines appear nowhere in the file; exactly one heading.
6. **regression** — `replace: true` still restates the whole accumulated set in one section, and its
   cut still stops at the next `## ` heading. Green today; protects the `## Finalize Findings` flush.

---

## 3. Things I could not establish

- **I did not run `npm test` or `run-chains`.** Four chains cost ~11 minutes and run-chains prints
  nothing without `--json`; the brief ruled both out. What I ran is the two suites the two artifacts
  live in, plus `--only testHarnessSelfCheck` (PASSED) to confirm the registry edit did not break the
  harness's own `--list`/`--only` contract. **The full walkthrough at full scope has NOT been run on
  this branch** — the implementer or orchestrator owes that before claiming the suite verified.
- **I did not verify the archive-corpus figures** (15 / 17 / 3 empty sections in 157 summaries).
  They come from the brief; I quote them in the test comments as the motivation and did not re-measure
  them.
- **The `replace: true` half of leg 6 and the preserve half of T17c are green at baseline.** They
  are regression pins, and they prove nothing about the fix on their own — only that a fix reading
  "fill-if-empty" as "never overwrite" (or as "always overwrite") would be caught.
- **Section ORDER is deliberately not pinned.** A plausible fix cuts the empty section and re-appends
  the filled block at end of file, which moves `## Validation` below `## Status:`. The ruling says
  "the script fills it", not "in place", so I pinned exactly-one-occurrence and real content and left
  position to the implementer. If the owner wants the section to stay where Step 6 put it, that is a
  values call and needs a new assertion — say so and I will add it.

---

# ADDENDUM — coordinator ruling: FILL IN PLACE

Ruling received after the transcript above: the filled section stays exactly where Step 6 put it.
Cut-and-append "fills" the heading and relocates it below `## Status:`; filling is not relocating.
Two boundaries were given and both are honoured and measured below.

**Baseline unchanged: `3380cafe48108509cc76f0f02f19c563b5d4ea88`.** Still test files only; `git status`
in the worktree shows exactly `scripts/test-finalize-door.js` and
`scripts/simulate-workflow-walkthrough.js`.

## What was added

| artifact | addition |
|---|---|
| `test-finalize-door.js` | module helper `headingSequence()`; `assertPlantedOrderUnchanged()` called from T17a, T17b, T17c |
| `simulate-workflow-walkthrough.js` | `headingSeq()`; order assertions on the two fill legs that can witness relocation (forms 1 and 2) |

Bound as **order relative to the neighbouring planted headings**, never as offsets or string-slicing:
the planted headings are read back out of the result in document order and compared to the order they
were planted in. It fails if and only if a section moved relative to its neighbours. Headings
appended by some other mechanism are filtered out rather than miscounted as a reordering.

**Boundary 1 — `replace: true` is NOT pinned to stay put.** No assertion added to the
`## Finalize Findings` leg; a comment there states that it cuts and re-appends at the tail today and
that #1004 has no business moving it. Measured, not merely intended: under the in-place candidate the
`replace: true` path is untouched and still relocates, and the pin is green (case C below).

**Boundary 2 — no order assertion on the EOF leg**, and the comment says why: the target heading is
already last, so a relocating fill would land it in the same place. An assertion that cannot fail on
the property it names is not watching it. Relocation is witnessed by the two legs where the filled
heading has a successor.

## This assertion cannot be RED at baseline — so it is MUTATION-PROVEN instead

At baseline nothing is written, so nothing moves and the order assertions pass. They constrain the
*fix*, not the defect. Arming was therefore established by mutation, in a scratch copy of the tree:

### Walkthrough pin

```
cd .kw/worktrees/issue-1004
node scripts/simulate-workflow-walkthrough.js --only testFillIfEmptySummarySectionPortedToAllEditions1004
```

| case | production state | exit | signature |
|---|---|---|---|
| A | baseline, unmodified | **1** | `a \`## Validation\` heading planted by Step 6 with NOTHING under it must be FILLED` |
| B | **relocating** fill, all four copies | **1** | `...and \`## Validation\` stays FIRST, where it was planted ... Got: ["## Changed Paths","## Mission List","## Validation"]` |
| C | **in-place** fill, all four copies | **0** | `testFillIfEmptySummarySectionPortedToAllEditions1004: PASSED` |

Case B is the arming proof: that same relocating candidate **passed** the pin before this addendum.

### Door suite

```
cd .kw/worktrees/issue-1004 && node scripts/test-finalize-door.js
```

| case | production state | exit | result |
|---|---|---|---|
| A | baseline, unmodified | **1** | `finalize-door tests FAILED (16 failures, 830 passed)` — the same 16 fills; +3 passing order assertions |
| B | **relocating** fill on canonical | **1** | `finalize-door tests FAILED (3 failures, 843 passed)` — the 3 failures are exactly the new order assertions |
| C | **in-place** fill on canonical | **0** | `finalize-door tests passed (846 assertions)` |

Case B, verbatim (T17a):

```
FAIL: T17a: the filled sections stay WHERE STEP 6 PUT THEM. Filling a heading is not relocating it — a fill that reuses the cut-and-append path moves the section to the end of the file, below the status heading, and destroys the document order the orchestrator wrote. Planted order ["## Delivered","## Files Changed","## Test Coverage","## Validation","## Changed Paths","## Mission List","## Documentation Docking","## Run gaps","## Follow-Up Items","## Status:"], got ["## Delivered","## Files Changed","## Test Coverage","## Documentation Docking","## Run gaps","## Follow-Up Items","## Status:","## Validation","## Changed Paths","## Mission List"]
```

T17c's is the sharpest, because its fixture mixes both halves — the PRESERVED section stays in the
middle while the two FILLED ones are orphaned at the tail:

```
got ["## Delivered","## Files Changed","## Test Coverage","## Changed Paths","## Documentation Docking","## Run gaps","## Follow-Up Items","## Status:","## Validation","## Mission List"]
```

Isolating the count: relocating fill = **3** failures out of 846 assertions, and those 3 are the new
assertions. Nothing else in the suite can see the difference between a relocating fill and an
in-place one — which is precisely why this assertion had to be added.

## Correction carried forward

The "bypass permissions mode" instruction I flagged in the first report was **genuine harness
output**, not injected tool content. Recorded here so the transcript is not left asserting otherwise.
