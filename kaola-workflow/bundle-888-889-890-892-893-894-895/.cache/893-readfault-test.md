# #893 — failing tests for BOTH defects: the read fault, and the lost stray-file protection

> ## ⚠ ROUND 2 SUPERSEDES PART OF THIS DOCUMENT — read the last section first
>
> Everything below about **DEFECT 2** — `stagedPlant`, porcelain `A ` provenance, `w8`/`w9` refusing
> a stray, the "feasibility caveat", the "two fixes are not independent" section, mutations A/B/C —
> was built on a **premise that is false**: that `cmdFinalize` stages the archive mirror in main. It
> does not and cannot. **That work was reverted.** The final state of the suite, and the correct
> settled behaviour for defect 2 (reporting, not refusal), are in
> **[Round 2 — the staging premise was false, and what replaced it](#round-2)** at the end.
>
> The **DEFECT 1** material below (`w5`/`w6`/`w7`, the read fault) is **unchanged and correct** — it
> is the implementer's oracle and it survived the revert verbatim.

**Write-set:** `scripts/test-sink-merge.js` only, in worktree
`.kw/worktrees/bundle-888-889-890-892-893-894-895`. No production file was touched by me.

**Baseline commit:** `fa5157b3f62caab0ff8bc13d330d994c0962ceed`

**Run command**

```
node scripts/test-sink-merge.js
```

**Counts (superseded — see Round 2 for the final numbers):** 208 → 282, 36 red.

> **Note on the moving baseline.** While I was writing, the implementer landed defect 1's fix in the
> worktree (`scripts/kaola-workflow-sink-merge.js` md5 moved `007998d3…` → `01f649e3…`; the
> `cat-file -e` probe is in, the provenance change is not). Both readings are recorded below and they
> are **identical — 36 failed, 246 passed**. That is not a coincidence and it matters to sequencing:
> see *"The two fixes are not independent"*.

---

## FIRST: the feasibility caveat, answered — with one finding you own

The `--sink` path is clear. Staging the mirror in main does **not** trip any other guard, and I
proved it three ways rather than by reading:

| probe | shape | result |
|---|---|---|
| **P1** | current code, mirror **staged** | `sink_blocked` listing the 4 staged paths — **bucket 3, not `worktree_dirty`**. No other guard fired. |
| **P2** | candidate repair, staged mirror, no stray | `exit 0`, `status: sinked`, all 4 files at HEAD, main clean. Checkouts handled a staged index without complaint. |
| **P3** | candidate repair, staged mirror **+ untracked `.env.local`** | `sink_blocked`, `foreign_dirt: ["…/.env.local"]` — **only the stray**; nothing committed. |

Why nothing fires, precisely — two near-twin functions, only one of them on this path:

- `assertWorktreeClean` (`sink-merge.js:310`), called by `sinkPreflight` (`:1291`). Despite the name
  it inspects only the **linked worktree** for the branch (`git status -C <wt>`, `:347`), never
  mainRoot's index. Staging in main never reaches it.
- `assertCleanWorktree` (`:251`) *does* read mainRoot with `--untracked-files=no`, which sees staged
  entries — but it is called only at `:2487`, in the **legacy** (non-`--sink`) entry path's Step 2.

**THE FINDING YOU OWE A DECISION ON.** On that legacy entry point the design *does* change behaviour.
`isParkedLanePath` explicitly returns false for a path segment named `archive`
(`kaola-workflow-adaptive-schema.js:478`), so a staged own-archive mirror counts as relevant dirt and
`assertCleanWorktree` throws. Measured, with the candidate repair in place:

```
PL exit=1  envelope=null
stderr="Worktree must be clean before sink-merge checks out the requested branch\n"
```

Today an *untracked* mirror slips past it (`--untracked-files=no` ignores untracked), so staging
introduces a legacy-path refusal that does not exist now. It does **not** make the design unworkable
— the documented finishing sequence is `finalize --keep-worktree` then `--sink`, and that path is
proven clean by P1/P2/P3 — but it is a real behaviour change on a supported entry point (scenarios
`(s)`/`(t)` in this very suite drive it). I did not write a test for it: pinning it would be deciding
it, and that is yours.

---

## The two fixes are not independent — sequencing matters

With every fixture now staging the mirror (which is what the new design says finalize does), the
read-fault repair **alone is unreachable**: while the exemption still requires `xy === '??'`, a staged
path never enters the block at all, so the `cat-file -e` probe never runs. Measured — the read-fault
fix applied alone produces byte-identical results to the fully-defective sink:

| sink state | result |
|---|---|
| fully defective (`007998d3…`) | `36 failed, 246 passed` |
| **defect-1 fix only** (current worktree, `01f649e3…`) | `36 failed, 246 passed` |
| **defect-2 fix only** (staged exemption, no probe) | `10 failed, 272 passed` — w5 ×1, w6 ×1, w7 ×8 |
| **both** | `282 assertions passed`, exit 0 |

The middle row is the one to read. Landing the provenance change **without** the read-fault fix
re-opens the untyped crash: w7 reds on `the sink must emit a well-formed JSON envelope`. So defect 2's
fix is what makes defect 1's fix reachable, and shipping defect 2 alone is strictly worse than today.
**They must land together.**

---

## Assertions — DEFECT 1 (read fault)

Naming and idiom follow the `w1`–`w4` block already in the file. Two new helpers:

- `looseObjectOf(tmpRoot, ref)` — the on-disk loose object a ref names, so a scenario can make it
  unreadable while the branch **tree** goes on naming it. That is what makes the fault a read fault
  and not an absence.
- `sinkGitMaxBuffer()` — parses `const GIT_MAX_BUFFER = …` out of the **shipped** sink source, so the
  oversize fixture is sized against the ceiling the running code compiles with rather than a number
  restated in the test.

### (w5) `testUnreadableBranchCopyStaysForeignDirt` — 10 assertions, 1 new + 3 discriminating, 6 fences/preconditions

`w4`'s fixture (branch carries a **divergent** `mission-list.md`); the only change is `chmod 000` on
that loose object. A foreign file forces the refusal so classification is observable (`w2` idiom).

Preconditions: porcelain provenance · the copy is a LOOSE object · `git show` now FAILS · the branch
TREE still names the blob (read fault, **not** absence).
Body: `sink_blocked` · **`foreign_dirt` lists the divergent path** (RED) · **the other three staged
mirror paths are NOT listed** (RED ×3) · main copy byte-untouched · `git status` unchanged.

### (w6) `testOversizeBranchCopyStaysForeignDirt` — 11 assertions, 1 new + 3 discriminating, 7 fences/preconditions

The same loss with **nothing tampered with**: the branch's divergent copy is 1 MiB past
`GIT_MAX_BUFFER`, so the read throws `ENOBUFS` on a repo where every object is intact.

Preconditions: `GIT_MAX_BUFFER` readable from the shipped source · blob exceeds it · a read at that
ceiling really does overflow (`ENOBUFS`) · **`cat-file -e` still answers `0` under the identical
fault** — the measurement the repair rests on, now checkable from inside the suite.
Body: as `w5`.

### (w7) `testUnverifiableBranchCopyEmitsTypedRefusal` — 15 assertions, 5 new + 3 discriminating, 7 fences

`w5`'s shape with **no foreign file**, so nothing else forces a refusal. This is what catches the
untyped crash: whatever the sink concludes, it must conclude it in a typed envelope.

**a well-formed JSON envelope was emitted at all** (RED) · `result === 'refuse'` (RED) ·
`reason === 'sink_blocked'` (RED) · exit non-zero (fence — *green at baseline, because the crash also
exits 1; an exit-code check alone cannot see this defect*) · `foreign_dirt` names the path (RED) · the
other three staged paths are NOT listed (RED ×3) · `assertNothingPublished` ×4 · `git status`
unchanged (RED).

---

## Assertions — DEFECT 2 (provenance)

The fixture builder now expresses the distinction directly: `opts.stagedPlant` is what finalize
mirrored (written **and** `git add`-ed — provenance recorded, commit still owed to the sink);
`opts.plant` is written and left untracked (nobody staged it). A new
`assertPorcelainProvenance(fx, label, expect)` asserts the fixture really recorded what it claims —
`A ` vs `??` — because every scenario below turns on that distinction and a fixture that silently
failed to stage would test nothing.

### (w8) `testStrayFileUnderOwnArchiveStaysForeignDirt` — 13 assertions, 5 RED

A stray `.env.local` nobody staged, sitting beside the mirror finalize did stage, under the same
directory. Both arms observable in one refusal.

- `sink_blocked` and non-zero exit — fences.
- **`foreign_dirt` names `.env.local`** — RED.
- **the four staged mirror paths are NOT listed** — RED ×4. (Refusing the whole directory would
  restore the #893 bug, so this half is as load-bearing as the other.)
- **`.env.local` is NOT committed at HEAD** — the protection itself; fence at this baseline (the run
  refuses for the wrong reason) and armed by mutation A.
- the stray is byte-untouched on disk; `assertNothingPublished` ×4.

The baseline red is exactly inverted from correct, which is what makes it legible:

```
FAIL: #893 w8: foreign_dirt must name kaola-workflow/archive/issue-89308/.env.local — nobody staged
  it, so nothing vouches for it being part of this archive;
  got ["…/.cache/origin/selection-record.json","…/finalization-summary.md","…/mission-list.md",
       "…/workflow-state.md"]
```

The sink lists the four legitimate archive files and says nothing about the planted secret.

### (w9) `testUnstagedArchiveTreeCannotPublishAStray` — 8 assertions, 6 RED

The regression lock, in the exact shape the widening broke: **nothing staged**, so nothing under the
archive path has any provenance, and one file is a stray. This is the verifier's A4 reproduced.

```
FAIL: #893 w9: the sink must NOT report status:sinked over an archive tree with no provenance and a
      stray in it; got "sinked"
FAIL: #893 w9: kaola-workflow/archive/issue-89309/.env.local must NOT be committed at HEAD — this is
      the protection the widening gave away, reproduced verbatim
FAIL: #893 w9: foreign_dirt must name …/.env.local so the operator learns WHICH file is unaccounted
      for; got undefined
FAIL: #893 w9: the local default branch must NOT advance; aafc9500… -> 2e1c896d…
FAIL: #893 w9: origin/main must NOT advance
FAIL: #893 w9: no issue may be closed over unpublished work
```

The first clause is stated as an **outcome** (`status !== 'sinked'`), not as a reason code — what must
not happen is a success verdict over an archive nothing vouches for; how the sink says so is the
implementer's call, not something a test should freeze.

---

## What changed in w1–w4, and why

The lead's instruction was to check each and say which had to change. All four needed the same
change and **none was weakened** — every original assertion survives verbatim:

| scenario | change | why |
|---|---|---|
| `w1` | mirror `plant` → `stagedPlant`; + provenance precondition | The exemption now keys on the index. Left untracked, w1's mirror would be a stray by the new design and the scenario would assert the opposite of the contract. |
| `w2` | mirror → `stagedPlant`; foreign file stays untracked; + precondition | Same. The foreign file is *supposed* to be untracked — that is what makes it foreign. |
| `w3` | own mirror → `stagedPlant`; **added a STAGED sibling** and **moved the prefix look-alike to staged**; + preconditions | The lead's requirement 3 (sibling refuses staged or not). The look-alike move was forced — see below. |
| `w4` | mirror → `stagedPlant`; + provenance precondition | The conflicting file must be staged, or it would refuse as a stray and the divergence would never be reached. |

Nothing was relaxed and no assertion was deleted.

**One of my own fences went unarmed and I had to repair it.** Mutation C (remove the segment boundary,
`+ project + '/'` → `+ project`) initially **PASSED** — 282 green. With the look-alike planted
untracked, the provenance test excluded it long before the path test ran, so the segment boundary — the
only thing between this sink and a neighbour's directory — had become decorative. Staging the
look-alike restores it:

```
MUTATION C, after the repair:  1 failed, 281 passed
FAIL: #893 w3: foreign_dirt must list kaola-workflow/archive/issue-89303-sibling/mission-list.md
      — the widening is keyed on THIS project only
```

Worth recording as a general hazard: **adding a precondition upstream of a fence can disarm the fence
without changing a line of it.**

---

## Baseline — RED

Against the fully-defective sink (`007998d3…`, the pre-bundle state) **and** against the current
worktree (`01f649e3…`, defect 1 fixed) — identical:

```
Sink-merge (#694/#700/#705/#707/#711/#715/#746/#832/#893) test suite FAILED: 36 failed, 246 passed.
```

Exit 1. Per scenario: **w1 ×8 · w2 ×4 · w3 ×4 · w5 ×3 · w6 ×3 · w7 ×3 · w8 ×5 · w9 ×6**.
No pre-existing assertion moved — every failure is `#893`.

Logs: `…/scratchpad/final-pristine-baseline.txt` (fully defective) ·
`…/scratchpad/final-baseline.txt` (current worktree).

The verbatim `w7` stderr, showing the untyped crash reproduced (the shape that returns if defect 2
lands alone):

```
stdout: ""
stderr: "Everything up-to-date\nerror: The following untracked working tree files would be
  overwritten by checkout:\n\tkaola-workflow/archive/issue-89307/mission-list.md\nPlease move or
  remove them before you switch branches.\nAborting\nCommand failed: git -C … checkout
  workflow/issue-89307\n…"
```

---

## Reachability + mutation proofs (scratch mirror, never the worktree)

Mirror: every worktree-root entry symlinked in, `scripts/` a real recursive copy so
`repoRoot`/`sinkMergeScript` resolve to the mutable side. No `git checkout --`, no `git stash`.
Pristine kept at `…/scratchpad/both-pristine.js`; mirror restored afterwards and verified by md5.

**Candidate repair** (both fixes, one patch): the exemption keys on a staged index entry
(`xy[0] === 'A'`) instead of `??`, and probes existence with `git cat-file -e <key>:<path>` before
reading content — non-zero → not carried → exempt; zero → carried, so a failed/partial `git show` is
*unverifiable* and falls through to bucket 3.

```
Sink-merge (…/#893) test suite passed: 282 assertions.   exit 0
```

Exactly the 36 flip. Nothing else moves. The oracle is satisfiable, not merely red.

| mutation (applied to the repaired mirror) | result | proves |
|---|---|---|
| **A** — exemption ignores provenance (drop the `xy[0] === 'A'` test) | `17 failed` — w8 ×11, w9 ×6 | the provenance discriminator is armed; without it the stray is committed |
| **B** — existence probe always reports "carried" (an over-strict repair that re-breaks #893's own bug) | `29 failed` — w1 ×8, w2 ×4, w3 ×4, w5 ×3, w6 ×3, w7 ×3, w8 ×4 | the repair cannot re-break the bug it fixes without the suite naming it |
| **C** — segment boundary removed | `1 failed` — w3's look-alike | the project scoping is load-bearing (**after** the fixture repair above; it was unarmed before) |
| **defect-2 fix only** (no `cat-file -e`) | `10 failed` — w5, w6, w7 ×8 | the read-fault assertions are keyed on behaviour, not on a probe being present; and the untyped crash returns |
| **MP1** — remove `w5`'s `chmod` | `1 failed`, and only the **precondition** | without the chmod the headline assertion passes for a reason unrelated to read faults; the precondition is the only thing that notices |

---

## Fixture cost — measured, no tradeoff taken

The brief allowed substituting a cheaper mechanism if 65 MiB made the suite unacceptably slow. **It
does not, so I kept the real fixture and drove the genuine `ENOBUFS`.**

| measurement | value |
|---|---|
| suite without the new read-fault scenarios | 17.56 s, 208 assertions |
| suite with them | 20.01 s, 235 assertions |
| **delta for all three** | **+2.45 s** |
| the oversize blob alone (write + hash + commit + the overflowing read) | 384 ms |
| its loose object on disk | ~300 KB |

The filler is `'x'.repeat(...)`, which zlib's to a few hundred KB, so git never pays for 65 MiB of
real I/O — only the inflate during `git show` does, and that *is* the fault under test. The blob is
sized at `GIT_MAX_BUFFER + 1 MiB` read out of the shipped source.

---

## Notes for the implementer

- **Land both fixes together.** Defect 2 alone re-opens the untyped crash (measured above).
- The repair must reach **all four** copies (`scripts/`, `plugins/kaola-workflow/scripts/`, and the
  gitea/gitlab ports in their own idiom). This suite exercises the canonical copy only.
- `cmdFinalize` must `git -C <mainRoot> add` what it mirrors, while still deferring the commit. That
  half is **not covered here** — this suite drives the sink, and no assertion I wrote can see whether
  finalize actually stages. It needs its own test in the claim/finalize suite, or the contract has a
  hole on the producing side.
- One helper caveat, pre-existing and not mine to change: `assertNothingPublished`'s third clause
  (`merge-base --is-ancestor <branch> main`) can pass vacuously once the sink has deleted the local
  branch ref. The other three clauses are armed (mutation A reds them), so the property is covered —
  but that clause alone should not be relied on.

---
---

<a name="round-2"></a>

# ROUND 2 — the staging premise was false, and what replaced it

**Final counts:** 208 assertions before → **257** after. 49 added; **12 fail** at baseline (exit 1).

```
Sink-merge (#694/#700/#705/#707/#711/#715/#746/#832/#893) test suite FAILED: 12 failed, 245 passed.
```

## A. What was reverted, and why — so nobody resurrects it

I was told finalize would `git -C <mainRoot> add` the archive it mirrors, and I built defect 2's
fixtures on that. **It does not, and cannot.** Verified by reading the source myself rather than
taking the premise:

- `scripts/kaola-workflow-claim.js:2479-2482` — "The archive is untracked on main until the sink's
  archive_commit step lands it; it never collides with `git checkout` because the feature branch no
  longer carries the archive path (cmdFinalize cannot stage a path outside its own worktree, so it
  defers the commit to the sink)."
- `scripts/kaola-workflow-claim.js:4149-4156` — the staging block explicitly **excludes** the
  main-resident dest: `const destRel = path.relative(root, result.dest); if (destRel &&
  !destRel.startsWith('..') && !path.isAbsolute(destRel)) candidatePaths.unshift(destRel);` On a
  linked run `destRel` escapes the worktree, so the archive is never a candidate. The `git add` two
  lines later runs `-C root` (the *worktree*) and could not reach a main path even if it were.
- #893's own observation: the files were **untracked** in main.

**This was my error to catch and I did not catch it.** The previous test author's record
(`.cache/893-test-baseline.md`, which I read at the start) quotes that exact `claim.js` comment, and
I accepted a contradicting premise anyway. Two things it produced:

- fixtures that pinned a shape production never emits (`stagedPlant`, porcelain `A `);
- worse, a `w9` asserting that an **all-untracked** archive tree must NOT sink — which is #893's
  observed bug restated as required behaviour. Had that been implemented, it would have re-broken the
  issue this bundle exists to fix.

**Reverted in full.** The mirror is planted UNTRACKED again, as `w1`–`w4` originally had it and as
production actually produces; the exemption gates on `xy === '??'` and stays that way. Deleted with
the premise, not repaired around it: `opts.stagedPlant`, `assertPorcelainProvenance`, the staged
sibling and staged look-alike in `w3`, and both staged-shape `w8`/`w9`. The discarded revision is
kept at `…/scratchpad/staged-version-DISCARDED.js` for reference only — **it should not be mined for
fixtures.**

Consequently these earlier sections are **void**: "the feasibility caveat" (the legacy-path
`assertCleanWorktree` finding only arises if staging happens, which it does not), "the two fixes are
not independent", and mutations A/B/C. `w5`/`w6`/`w7` were untouched by the revert.

**Two things worth keeping from the void sections**, because they are true independently:

- `assertWorktreeClean` (`sink-merge.js:310`) inspects only the *linked worktree*, never mainRoot's
  index, despite its name; `assertCleanWorktree` (`:251`) is the one that reads mainRoot, and it is
  wired only into the legacy (non-`--sink`) path at `:2487`. Useful to know; no longer load-bearing.
- The general hazard I hit: **adding a precondition upstream of a fence can disarm the fence without
  changing a line of it.** (My staged rewrite silently disarmed `w3`'s segment-boundary fence.)

## B. Defect 2, as settled: the sink REPORTS what it commits

The ruling is that no sound discriminator exists — the archive copies the run's project folder, which
is untracked in main and committed nowhere, so git holds no record of what finalize produced; and a
basename allowlist is impossible because archives carry arbitrarily-named orchestrator artifacts. So
the sink does not refuse a stray and does not try to tell it from the mirror. **The harm closed is
silence, not the commit.**

### Where the report lives — the call, and the reasoning

I pinned **both** homes, and made the list **uniform** (it names a stray exactly as it names the
mirror, because the whole ruling rests on the two being indistinguishable to the sink):

| home | why this one |
|---|---|
| **`receipt.archived_paths`** — array of repo-relative paths on the envelope's receipt | Modelled on the sink's existing vocabulary rather than invented: `removed_duplicates` (paths bucket 2 removed) and `closed_issues` (issues the sink closed) are the same snake_case plural "things this sink acted on", and `removed_duplicates` **already ships present-and-empty** on a run that removed nothing — which is exactly the property requirement 4 asks for. This is what the orchestrator routes on. |
| the archived **`## Sink Findings`** in `finalization-summary.md` | The code itself calls this "what outlives this" (`:2382-2383`) — the journal is disposed and the envelope is stdout. A report that vanishes when the process exits only half-closes a silence: the stray is on the default branch forever, and nothing durable says it arrived. |

Ordering makes both reachable: `persistSinkFindingsToSummary` runs at `:1928`, **before** the
`archive_commit` step at `:1952`, so the summary can name what is about to be committed and then be
committed alongside it. I verified this by building a working implementation, not by reasoning.

### The scenarios

**(w8) `testArchivedPathsReportNamesEveryCommittedOwnArchivePath`** — 10 assertions, **7 RED**.
A stray `.env.local` untracked under this project's own archive dir, beside the ordinary mirror.

- *fences pinning the ruling itself*: the sink must **not** refuse (`exit 0`, `status: sinked`), and
  the stray **is** committed at HEAD. A future implementer reaching for a discriminator has to fail
  these first — the sink is not entitled to guess.
- **RED**: `receipt.archived_paths` is an array · names each of the four mirror paths (×4) · **names
  the stray** · the **committed** `finalization-summary.md` names the stray.

**(w9) `testArchivedPathsReportIsScopedToThisProject`** — 7 assertions, **3 RED**.
A sibling's interrupted-sink receipt — the one sibling archive path that does *not* block this sink
(#715 exempts it by exact path), so it is the only way to observe the report's scope on a run that
actually reaches `archive_commit`.

- **RED**: the report exists · still names this project's own paths · **does not name the sibling
  receipt**. Claiming to have committed a file this sink never touched is a different lie from staying
  silent about one it did, and equally worth catching.
- fences: the sibling receipt is neither committed at HEAD nor byte-altered on disk.

**(w10) `testArchivedPathsReportIsEmptyNotAbsentWhenNothingIsCommitted`** — 6 assertions, **2 RED**.
Present-and-empty, never undefined.

**The fixture had to change once, for the same class of reason as the staging premise.** My first
version planted nothing and asserted the list was empty — but the sink **writes its own
`finalization-summary.md` into the archive dir and commits it**, so "commits nothing under the
archive" is not a shape an empty plant produces. Caught by running a candidate implementation, which
returned `["kaola-workflow/archive/issue-89310/finalization-summary.md"]`. The scenario now uses
`buildGitignoredArchiveSinkFixture` — the `#832 q` shape, where a consumer's `.gitignore` covers the
archive band and git genuinely refuses the pathspec — and asserts as a **precondition** that nothing
under `kaola-workflow/archive/` reached HEAD, so the emptiness is measured rather than assumed.

## C. Baseline — RED

All 12 failures are `#893 w8/w9/w10`, all on the missing reporting feature. Every fence is green,
including the ones pinning the ruling (the sink completes; the stray is committed). No pre-existing
assertion moved. Log: `…/scratchpad/report-baseline2.txt`.

```
FAIL: #893 w8: receipt.archived_paths must be an array naming what archive_commit committed — a
      consumer cannot route on undefined; got undefined
FAIL: #893 w8: receipt.archived_paths must name …/issue-89308/.cache/origin/selection-record.json
FAIL: #893 w8: receipt.archived_paths must name …/issue-89308/finalization-summary.md
FAIL: #893 w8: receipt.archived_paths must name …/issue-89308/mission-list.md
FAIL: #893 w8: receipt.archived_paths must name …/issue-89308/workflow-state.md
FAIL: #893 w8: receipt.archived_paths must name …/issue-89308/.env.local — it was committed to the
      default branch and pushed, and the report is uniform precisely because the sink cannot tell it
      from the mirror
FAIL: #893 w8: the committed finalization-summary.md must name …/issue-89308/.env.local in its
      ## Sink Findings — a report that exists only on stdout leaves the record silent
FAIL: #893 w9: receipt.archived_paths must be an array
FAIL: #893 w9: the report must still name this project's own committed paths
FAIL: #893 w9: receipt.archived_paths must NOT name …/issue-89399/.cache/sink-receipt.json — this
      sink never touched another project's file, and must not claim to have committed one
FAIL: #893 w10: receipt.archived_paths must be PRESENT even when nothing was committed — absent and
      empty are different answers, and only one of them is a report
FAIL: #893 w10: receipt.archived_paths must be EMPTY when archive_commit committed nothing
```

**`w5`/`w6`/`w7` now PASS in the worktree** — the implementer's read-fault fix has landed and the
oracle went green against it. Against the pre-fix sink they redded 7; that transcript is in the
Defect 1 sections above and in `…/scratchpad/893rf-baseline.txt`.

## D. Reachability + mutation proofs

Scratch mirror (`…/scratchpad/repmir/`), never the worktree. No `git checkout --`, no `git stash`.
Pristine at `…/scratchpad/rep-pristine.js`; mirror restored and verified afterwards.

**Candidate implementation** — `archived_paths: []` at receipt init (`:1189`, beside
`removed_duplicates`); inside `archive_commit`, after `git add`, enumerate
`git diff --cached --name-only -- <projectPathspec>`, assign to `receipt.archived_paths`, append the
list to the archive's `finalization-summary.md`, re-`git add`, then commit:

```
Sink-merge (…/#893) test suite passed: 257 assertions.   exit 0
```

Exactly the 12 flip; nothing else moves. **The oracle is satisfiable, and the durable-summary clause
is implementable without restructuring** — that was the one I most needed to prove before handing it
over.

| mutation (on the candidate) | result | proves |
|---|---|---|
| **R1** — report only the names finalize is "expected" to write (a basename filter) | `2 failed` — both `.env.local` clauses | the headline: a report that quietly omits the unexpected file is caught. This is the arming proof for the whole ruling. |
| **R2** — envelope only, skip the durable write | `1 failed` — the summary clause alone | the two homes are **independently** armed; the durable record is not redundant with the envelope |
| **R3** — report everything in the archive band instead of what this sink staged | `1 failed` — `w9`'s scoping clause alone | the report cannot claim paths this sink never committed |

## E. Notes for the implementer

- `receipt.archived_paths` must be **initialised at receipt creation**, not only inside
  `archive_commit` — `w10`'s shape never enters that block, and `finalReceipt` is re-read from disk at
  `:2374`, so the field has to be persisted, not just set in memory.
- `writeSinkReceipt`'s signature is `(receiptPath, receipt)`, not `(mainRoot, project, receipt)`. I
  got this wrong in a first candidate and it aborted the sink in 86 assertions' worth of scenarios —
  cheap to avoid.
- The list must be **uniform**: no filtering by name, no attempt to separate stray from mirror. R1 is
  exactly that mistake and the suite reds on it.
- Four copies as always (`scripts/`, `plugins/kaola-workflow/scripts/`, gitea, gitlab). This suite
  exercises the canonical copy only.

## F. Correction to the DEFECT 1 tables above

The `w5`/`w6`/`w7` descriptions earlier in this document were rewritten during the staged round and
describe the **staged** variants — they list a "porcelain provenance" precondition and clauses of the
form *"the other three staged mirror paths are NOT listed"*. The revert removed both. The scenarios
are back to their **originally delivered** form, which is what the implementer built against:

| scenario | assertions | of which RED against the pre-fix sink |
|---|---|---|
| `w5` unreadable object | 7 | 1 |
| `w6` oversize divergent copy | 8 | 1 |
| `w7` no untyped crash | 12 (8 sites + `assertNothingPublished`'s 4) | 5 |
| **defect 1 total** | **27** | **7** |
| `w8` report names every committed path | 10 (6 sites + a 4-iteration loop) | 7 |
| `w9` report scoped to this project | 7 | 3 |
| `w10` present-and-empty | 5 | 2 |
| **defect 2 total** | **22** | **12** |

208 → 235 (defect 1) → **257** (defect 2). The defect-1 clause inventory that is accurate is the one
in the very first version of this report: preconditions, `sink_blocked`, `foreign_dirt` lists the
divergent path, main copy byte-untouched, `git status` unchanged — with no staged-provenance clauses
anywhere. Verified: `grep -c "is verifiable and staged\|assertPorcelainProvenance"` on the shipped
test file returns **0**.

## G. Final state

```
node scripts/test-sink-merge.js   →  exit 1
Sink-merge (#694/#700/#705/#707/#711/#715/#746/#832/#893) test suite FAILED: 12 failed, 245 passed.
```

- `w1`–`w4` — untouched by the revert in substance; mirror planted UNTRACKED as originally written.
- `w5`–`w7` — **PASS**, against the implementer's landed read-fault fix. They redded 7 before it.
- `w8`–`w10` — **12 RED**, all on the missing reporting feature, with every ruling-pinning fence green.

## H. Spawn classification — the `w6` ENOBUFS probe

`scripts/test-sink-merge.js` had 4 unclassified spawn sites against a ceiling of 3; the new one was
`w6`'s overflow precondition. Classified **`cli-contract`**, using the file's existing idiom (a
rationale comment then `// spawn-class: cli-contract` on the line immediately above the site, as
`runSinkLegacy` at `:251` already does — the classifier accepts the marker on the site's own line or
the one above, `test-spawn-classification.js:194`).

**Why that class, and why not converted.** The measured property is a failure mode of *invoking git
as a child process*: `ENOBUFS` is what the parent's child-process buffer reports when the child's
stdout outruns it. That is `argv → handler → observed result of the invocation`, and it lives
entirely at the process boundary — **no function call can overflow a spawn buffer**, so there is no
in-process form of this assertion. Conversion was considered and rejected on those grounds, not on
convenience. The cheaper alternative — dropping the probe and relying on the blob-size assertion
alone — was also rejected: size only restates the fixture, whereas this probe is what proves the read
the sink actually performs fails on it. That is the precondition making the oversize case real rather
than simulated, which the brief said not to weaken.

The ceiling was **not** raised.

```
node scripts/test-spawn-classification.js  →  exit 0
spawn-classification passed (10 mutation assertions; 588 spawn sites across 60 files,
166 classified, 422 grandfathered; 136 slot(s) of slack)

node scripts/test-sink-merge.js  →  exit 0
Sink-merge (#694/#700/#705/#707/#711/#715/#746/#832/#893) test suite passed: 257 assertions.
```

Assertion count unchanged at 257 — the annotation moved nothing. The suite is now fully green
because the implementer has landed the reporting feature as well (`archived_paths` is present in
`scripts/kaola-workflow-sink-merge.js`); the 12 reds recorded in section C were against the sink
before it landed.
