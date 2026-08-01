# #893 — failing tests for the sink's own archive mirror

**Write-set:** `scripts/test-sink-merge.js` only (worktree
`.kw/worktrees/bundle-888-889-890-892-893-894-895`). The sink and its twins were not touched.

**Baseline commit:** `fa5157b3f62caab0ff8bc13d330d994c0962ceed`

**Run command**

```
node scripts/test-sink-merge.js
```

(from the worktree root; `KAOLA_WORKFLOW_OFFLINE=0` is what the in-file `runSink` helper already
sets per child process, so no env is needed on the outer command.)

---

## What the fixture had to be, and why it is not the one in the brief

The brief's positive fixture was "an untracked archive tree in main, **byte-identical to what the
branch carries**". Reading `archiveProjectDir` (`scripts/kaola-workflow-claim.js:2474-2486`) shows
that shape is not what a `--keep-worktree` finish produces. On a **linked** run the archive always
lands under **MAIN's** root and stays untracked there, and the comment states outright:

> the feature branch no longer carries the archive path (cmdFinalize cannot stage a path outside its
> own worktree, so it defers the commit to the sink)

Two consequences the tests had to respect:

1. **An exemption keyed on "the branch already carries this file" can never fire on the observed
   shape.** So the primary positive fixture (`w1`) is the real one: the branch carries the
   deliverable and **nothing** under `kaola-workflow/archive/<project>/`; main carries the four
   mirrored files as untracked residue.
2. **Bucket 2's action is `fs.unlinkSync`** (`kaola-workflow-sink-merge.js:1426-1431`). Main holds
   the run's *only* copy of the finalization summary and mission list, and the sink's own
   `archive_commit` step (`:1897-2022`) is what commits them — the real `chore: archive issue-891
   [sink]` commit. A bucket-2-style *remove* would destroy them. `w1` therefore also pins that every
   mirrored file reaches HEAD.

Nothing about the owner's ruling was re-litigated: the fix is still the widened bucket-2 exemption
scoped to this project's own archive subtree. What changed is the fixture shape it has to work on.

---

## Assertions added

### (w1) — NEW BEHAVIOUR (the headline claim)

`testKeepWorktreeArchiveMirrorDoesNotBlockOwnSink` — the observed shape end to end: the mirror
(`.cache/origin/selection-record.json`, `finalization-summary.md`, `mission-list.md`,
`workflow-state.md`) is the **only** dirt in main.

8 assertions: not `sink_blocked` · exit 0 · `status: sinked` · each of the four files present at HEAD
carrying the mirrored content · main checkout clean afterwards.

`finalization-summary.md` is checked as a **prefix**, not for equality — the sink appends its own
`## Sink Findings` section to that one file before staging. (An equality check was tried first and
red against a working implementation; that was a defect in the test, and it was corrected.)

### (w2) — MIXED: 4 NEW BEHAVIOUR, 3 fences

`testKeepWorktreeArchiveMirrorNotListedAsForeignDirt` — the same classification claim isolated from
the rest of the transaction, using the `#715 (m)` idiom: a genuinely foreign file forces the
refusal, so the mirror's absence from `foreign_dirt` is directly observable.

- FENCE: refuses `sink_blocked`; the foreign file **is** listed; `git status` byte-unchanged.
- NEW: none of the four mirror paths appear in `foreign_dirt`; each is left byte-untouched on disk
  (the exemption is classification-only).

### (w3) — MIXED: 4 NEW BEHAVIOUR, 8 fences (the invariant)

`testSiblingArchiveTreeStaysForeignDirt` — the bound. Plants a sibling project's archive tree
(`kaola-workflow/archive/issue-89393/…`) **and** a project-name prefix look-alike
(`kaola-workflow/archive/issue-89303-sibling/mission-list.md`, which a path test written without a
segment boundary would silently swallow).

- FENCE: refuses `sink_blocked`; every sibling/look-alike path **is** listed; each is byte-untouched;
  `git status` byte-unchanged.
- NEW: this project's own four mirror paths are **not** listed.

### (w4) — FENCE (superset verification, not a blanket path allowance)

`testConflictingBranchCopyStaysForeignDirt` — the branch carries `mission-list.md` under this
project's archive path at **different bytes** than main's untracked copy. Must still refuse, must
list that path, and must leave the main copy untouched.

Read together with `w1`, the only rule satisfying both is **"exempt unless the branch carries a
conflicting version"**: absent on the branch is the observed shape and safe; present at different
bytes is two divergent archives, which must refuse loudly rather than let one side silently win.

All 4 assertions pass at baseline (current code refuses everything under the path), so this is a
fence — but see the mutation proof below: it is an *armed* one.

---

## Baseline — RED

```
Sink-merge (#694/#700/#705/#707/#711/#715/#746/#832/#893) test suite FAILED: 16 failed, 192 passed.
```

Exit 1. All 16 failures are the new #893 assertions; no pre-existing assertion in the file broke
(`grep '^FAIL:' | grep -v '#893'` is empty).

`w1`'s failure signature:

```
FAIL: #893 w1: the sink must NOT refuse sink_blocked on its OWN archive mirror; foreign_dirt=[
  "kaola-workflow/archive/issue-89301/.cache/origin/selection-record.json",
  "kaola-workflow/archive/issue-89301/finalization-summary.md",
  "kaola-workflow/archive/issue-89301/mission-list.md",
  "kaola-workflow/archive/issue-89301/workflow-state.md"]
stdout: {"result":"refuse","reason":"sink_blocked","foreign_dirt":[…same four…],
  "detail":"main checkout carries changes not owned by this sink; resolve (commit/stash/restore)
  before re-running. This sink never touches another project's files."}

FAIL: #893 w1: sink must exit 0; got 1
FAIL: #893 w1: status must be sinked; got undefined
FAIL: #893 w1: kaola-workflow/archive/issue-89301/.cache/origin/selection-record.json must be
      committed at HEAD carrying the mirrored content after the sink; got null
FAIL: #893 w1: …/finalization-summary.md … got null
FAIL: #893 w1: …/mission-list.md … got null
FAIL: #893 w1: …/workflow-state.md … got null
FAIL: #893 w1: main checkout must be clean after status:sinked; got:
?? kaola-workflow/archive/
```

That envelope is the issue-891 refusal reproduced verbatim, down to the four paths and the detail
string.

Per-scenario baseline split: w1 8 red / 0 green · w2 4 red / 3 green · w3 4 red / 8 green ·
w4 0 red / 4 green.

---

## Reachability + mutation proofs (scratch mirror, never the worktree)

The suite was also run against a **scratch copy** of `scripts/` with a candidate patch, so the
oracle is known to be satisfiable rather than merely red. The worktree's sink was never modified;
no `git checkout --` or `git stash` was used anywhere.

**Candidate** — in `sinkPreflight`, after `SINK_RECEIPT_EXEMPT`: for a path under
`kaola-workflow/archive/<project>/`, `git show <branch>:<path>` — absent → `continue`; present and
byte-equal to the working copy → `continue`; present and different → fall through to bucket 3.

```
Sink-merge (…/#893) test suite passed: 208 assertions.   exit 0
```

Exactly the 16 baseline failures flip; nothing else moves.

**M1 — prefix without a segment boundary, no branch verification**
(`filePath.startsWith('kaola-workflow/archive/' + project)` → `continue`):

```
FAIL: #893 w3: foreign_dirt must list kaola-workflow/archive/issue-89303-sibling/mission-list.md
FAIL: #893 w4: reason must be sink_blocked
FAIL: #893 w4: foreign_dirt must list kaola-workflow/archive/issue-89304/mission-list.md
FAIL: #893 w4: git status must be unchanged after sink_blocked refuse
4 failed, 204 passed.
```

**M2 — blanket over the whole archive band** (`startsWith('kaola-workflow/archive/')`):

```
19 failed, 189 passed.
```

reds all of w3's sibling clauses, all of w4, **and** the pre-existing `#715 (l)` over-exemption
guard.

So the fences are armed: the prefix look-alike catches a missing segment boundary, and w4 catches a
missing superset verification. Without them a widening could go unbounded with a green suite.

---

## Note for the implementer / reviewer

`w4` demands that a *conflicting* branch copy still refuses, while `w1` demands that an *absent*
branch copy is exempt. A verification that only asks "does the branch carry this path at all"
(bucket 2's `cat-file -e`) cannot satisfy both — it fails `w1`, which is the actual bug. The rule
that satisfies every assertion is a content compare that treats **absent** as exempt and
**divergent** as foreign. If the implementer concludes a different rule is correct, that is a
specification call for the orchestrator, not something to resolve by weakening a test.
