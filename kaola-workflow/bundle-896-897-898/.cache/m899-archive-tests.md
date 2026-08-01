# m899 — archive-failure tests (test custody, stage 1)

Baseline commit: `3e2019f6f7ff8fc4663db6bc5a08ff9949ec32cf` (worktree `.kw/worktrees/bundle-896-897-898`,
branch `workflow/bundle-896-897-898`). One file written: `scripts/test-sink-merge.js`. Not committed.

The three structural claims in the brief were re-verified against the current file, not taken on trust:
the catch is `scripts/kaola-workflow-sink-merge.js:1964-1970` (`if (e instanceof TypeError || e
instanceof ReferenceError) throw e;` and nothing else), `receipt.archive_dest` is assigned only inside
`if (archiveResult && archiveResult.dest)` at `:1954-1955`, and the #700 never-committed guard reads
`if (receipt.archive_dest && !archiveAtHead && !archiveIgnored)` at `:2122`. Line numbers had drifted by
one or two from the brief.

## WHAT WAS ADDED

Two shared-helper changes and three scenarios. Scenario letters `(x1)`–`(x3)`: the file's `a`–`v` and
`w1`–`w10` are taken, and this defect has no issue number (it is a mission item, not a filed issue), so
nothing is cited that would not resolve.

**`scripts/test-sink-merge.js:206,234-236` — `buildSoleArchiverFixture` gains `opts.extraLiveFiles`.**
A `{ name: content }` map committed into the live folder on the branch beside `workflow-state.md`.
Default-off, so no existing scenario's bytes change; `(x1)` uses it to put a `mission-list.md` on the
branch so the "live run record reached the remote" clause can be asserted per file, for both files the
observed incident published.

**`scripts/test-sink-merge.js:249-260` — `runSinkAt(script, fx, …)`.** `runSink` now delegates to it
(`:262-264`); identical behaviour. Only `(x3)` passes a different script path.

**`scripts/test-sink-merge.js:2369-2379` — `findSinkJournal(tmpRoot, project)`.** Looks in all three
places `resolveSinkReceiptPath` can legitimately write (live folder, plain archive, collision-suffixed
archive). Pinning one location would turn a correct stop that wrote elsewhere into a false red.

### (x1) `testSwallowedArchiveThrowMustNotReportSuccess` — `:2385-2491` — THE PIN

Fixture: `buildSoleArchiverFixture` (the sole-archiver posture scenarios (c)(d)(e)(f)(h) already use)
plus `chmod 555` on `<fixture>/kaola-workflow/archive`. That is the entire trigger. The in-place archive
is an `fs.renameSync` into that directory, so an unwritable directory makes it throw `EACCES` with no env
var, no tampered git object, and nothing else about the repo broken. The mode is restored in the
`finally` before `cleanup(fx)` — an archive directory left at `0555` cannot be torn down. Verified: no
`issue-899xx` fixture survives a run, and the temp-dir set is byte-identical before and after.

Two preconditions guard against an unfalsifiable fixture:

- the branch really carries the live `workflow-state.md` **and** `mission-list.md` (otherwise "must not
  reach the remote" would hold for every sink and prove nothing);
- `kaola-workflow/archive` really is unwritable — proved by attempting a `mkdirSync` there and asserting
  it failed. On a privileged runner where `0555` does not bite, this precondition fails loudly instead of
  the scenario passing green for the wrong reason.

Six clauses, each a separate failure mode:

1. **a well-formed envelope is emitted** — asserted first and alone. A bare rethrow out of the
   transaction trips exactly this one and nothing else, and it is the `(w7)` lesson: an untyped crash
   leaves the orchestrator nothing to route on.
2. **`status` is not `sinked`** — the claim itself.
3. **exit is non-zero** — transport, for an output-blind caller.
4. **the envelope names the archive** — a routable token (a non-empty `reason`, or a `findings[]` entry
   with a `classification`) *and* the word "archiv" somewhere in the routable fields (`reason`, `step`,
   `archive_refusal`, `detail`, the findings). Deliberately shape-tolerant: the shipped refusal shape
   and the `findings[]` shape both satisfy it, but an envelope that stops without saying the archive is
   what failed does not, and neither does one with no machine-readable token at all.
5. **nothing published, as git facts** — `origin/main` has not advanced; `origin/main:kaola-workflow/
   <project>/workflow-state.md` and `…/mission-list.md` are both absent; no `close:` reached the forge.
   `push_main` and `closure` are steps after `finalize`, so a stop at the archive leaves all three true.
   Note `assertNothingPublished()` is deliberately **not** reused: the merge has already advanced local
   `main` by the time `finalize` runs, so its `mainBefore === mainAfter` clause would be a wrong
   assertion here, exactly as it is for the sibling `archive_incomplete` refusal.
6. **retryable** — the journal survives and `steps.finalize !== 'done'`.

### (x2) `testNothingToArchiveStillCompletes` — `:2493-2538` — FENCE, green today

`buildKeepWorktreeArchiveMirrorFixture` with an **empty** plant is exactly the "nothing to archive"
shape (main: roadmap, no archive; branch: deliverable, no live folder), so it is reused rather than
duplicated. Asserts exit 0, `status: sinked`, no `archive_refusal`, and — the point — that
`receipt.archive_dest` is **`undefined`**. That is the same observable a swallowed throw leaves, which is
why the fix cannot key on the missing dest.

### (x3) `testExportDriftStillFailsLoud` — `:2540-2603` — FENCE, green today

The #555 rethrow arm. The sink resolves `./kaola-workflow-claim.js` relative to its own file, so the only
way to present it with a drifted export is a scratch mirror: `fs.cpSync` of `scripts/` into `$TMPDIR`,
then `delete module.exports.archiveProjectDir;` appended to the *copied* `claim.js`. The subject under
test is still the shipped sink byte-for-byte; only its environment is isolated.

The **control run** is what makes it falsifiable: the undoctored mirror must first sink cleanly, or a
mirror broken for any unrelated reason would exit non-zero forever and the fence would measure nothing.
An export probe in a fresh process then confirms `typeof archiveProjectDir === 'undefined'` before the
drift run. Asserts: non-zero exit, never `sinked`, the symbol names itself (stderr or envelope), and no
issue closed.

Deliberately **not** asserted: whether the drift arrives as an unhandled throw (today) or as a typed
envelope. Those are two defensible readings of "fail loudly", the acceptance surface does not settle it,
and freezing either would either forbid a reasonable fix or contradict `(w7)`. What is asserted is the
part neither reading disputes — it is not swallowed, and it names itself.

## RED PROOF ON BASELINE

```
$ cd /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-896-897-898
$ node scripts/test-sink-merge.js > red-run.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=1
```

Exit code captured with `$?` on the node process directly — no pipe, no `tail`. Run twice; identical both
times. Untouched baseline for comparison: `REAL_EXIT=0`, 257 assertions, 22s.

```
Sink-merge (#694/#700/#705/#707/#711/#715/#746/#832/#893) test suite FAILED: 8 failed, 274 passed.
```

All eight failures are `(x1)`; nothing else in the file moved:

```
FAIL: (x1): a sink whose archive THREW must not report status:sinked; got "sinked"
FAIL: (x1): a failed archive must exit non-success; got 0
FAIL: (x1): the envelope must carry a routable token AND name the ARCHIVE as what failed; got reason=undefined findings=undefined detail=undefined
FAIL: (x1): origin/main must NOT advance over an archive that failed; 60dc1961… -> 727fb411…
FAIL: (x1): the live workflow-state.md must NEVER reach the remote as part of a sink whose archive failed
FAIL: (x1): the live mission-list.md must NEVER reach the remote as part of a sink whose archive failed
FAIL: (x1): no issue may be closed over an archive that did not happen; calls=["close:89901","label-removed:89901"]
FAIL: (x1): the sink journal must survive the stop so a re-run resumes at the archive; nothing at the live, plain-archive or suffixed-archive path
```

The envelope the unfixed baseline emits over a wholly failed archive, for the record — every step `done`,
including `finalize`:

```json
{"result":"ok","status":"sinked","journal_disposed":true,
 "receipt":{"steps":{"preflight":"done","push_upstream":"done","merge":"done","finalize":"done",
 "stash_restore":"done","archive_commit":"done","push_main":"done","closure":"done"},
 "closed_issues":[89901]}}
```

`archive_dest` is absent from that receipt, and `archived_paths` names
`kaola-workflow/archive/<project>/finalization-summary.md` — the sink wrote its `## Sink Findings`
section into the **stale prior-cycle** archive folder (`resolveRunRecordDir` falls back to the plain
archive path when no dest was recorded) and committed it there. Not asserted on; recorded because it
means the failed run also contaminated an older run's archive.

The clause-6 assertion on `steps.finalize` did not execute (it is guarded by `if (journalPath)`, and the
journal was disposed). It will execute once the journal survives.

## LEGITIMATE CASES CONFIRMED GREEN

All three, none turned red by the additions:

- **(a) keep-worktree source-missing, no dest by design** — covered by the existing `(#893 w1)`
  `testKeepWorktreeArchiveMirrorDoesNotBlockOwnSink`. Verified green in the RED run. No new assertion
  needed; it already pins exit 0 + `sinked` + every mirrored file at HEAD on the `skipped:'source-missing'`
  path.
- **(b) genuinely absent archive, nothing to archive** — had **no** coverage in this file. Added as `(x2)`.
  Green today.
- **(c) `.gitignore`-covered archive, `archive_commit: 'skipped_gitignored'`** — covered by the existing
  `(#832 q)` and `(#893 w10)`. Both verified green in the RED run. No new assertion needed.

Worth stating plainly for stage 2: **(a) and (b) both leave `receipt.archive_dest` unset, exactly as the
swallowed throw does.** `archiveProjectDir` returns `{ skipped: 'source-missing' }` for them and throws
for the defect, and the receipt cannot tell those apart afterwards. The discriminator must be the
failure, at the point it happens.

## WHAT THE IMPLEMENTER MUST MAKE TRUE

Implementation-free statement of the contract the tests encode:

1. When `archiveProjectDir` fails in a way that is not the expected idempotency case — including by
   throwing — the sink must not report the archive as having happened. Concretely: the emitted envelope
   must not carry `status: sinked`, the process must exit non-zero, and the envelope must carry both a
   machine-readable token a caller can route on and text identifying the **archive** as what failed.
2. It must still emit a well-formed envelope. Stopping is required; crashing out of the transaction with
   no parseable output is not stopping.
3. It must stop **before** publishing. Nothing may be pushed to the remote and no issue may be closed
   over an archive that did not happen — in particular the live run record (`workflow-state.md`,
   `mission-list.md`) must not reach the remote.
4. The stop must be resumable: the sink journal survives, with the `finalize` step left not `done`.
5. The legitimate no-op is unchanged. A run with nothing to archive — no live folder, whether or not an
   archive directory exists — records no dest, records no archive refusal, exits 0 and reports
   `status: sinked`. A `.gitignore`-covered archive still completes with `archive_commit:
   'skipped_gitignored'`. Neither may become a failure, and neither is distinguishable from the defect by
   the absence of `receipt.archive_dest`.
6. A missing or renamed `archiveProjectDir` export is not swallowed, does not reach `status: sinked`, and
   names the vanished symbol.

Cross-edition note (not tested here, and out of this role's scope): the four `kaola-workflow-sink-merge.js`
copies are `scripts/` plus `plugins/kaola-workflow{,-gitlab,-gitea}/scripts/`. `scripts/test-sink-merge.js`
contains **no** cross-edition sweep — it references only `repoRoot/scripts/…`, and no scenario in it reads a
plugin copy. So these scenarios have no existing sweep to join, and building one was not attempted: it
would be new machinery no observed failure demands, and the edition-touching diff already owes all four
chains at finalize.

## ANYTHING NOT DELIVERED AND WHY

- **Nothing was left undone from the brief.** All four "correct behaviour" items are covered, and all
  three legitimate cases are accounted for (two by existing scenarios, one newly added).
- **Two additions beyond the brief's literal list, flagged so they can be dropped if unwanted.** Clause 6
  of `(x1)` (journal survives, `finalize` not `done`) is not in the brief. It is included because the
  sibling refusals in this same step all leave the step not-`done` "so a re-run retries it", and because a
  `done` finalize step means a re-run skips the archive and reproduces the same false success. `(x3)` is
  the #555 fence; the brief said do not weaken the rethrow, and the most plausible wrong fix — a
  catch-all that converts every caught error into an envelope — would silently do exactly that. Neither
  clause is RED today; both are fences.
- **`(x3)` does not pin the SHAPE of the export-drift failure.** Reasoning above. It pins only that it is
  not swallowed and that it names itself.
- **`KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL=1` was found to reach the same false success by a different
  route** — it makes `archiveProjectDir` *return* `{ archived: false, reason: 'archive_forced_refusal' }`
  (`kaola-workflow-claim.js:2405-2407`), which sets no dest, sets no `archive_incomplete`, and therefore
  sails to `status: sinked` exactly as the swallowed throw does. Deliberately **not** tested: it is a
  test-only env seam with no production-reachable producer, so a test would pin a shape production never
  produces. Recorded, not built. If the implementer's fix is written at the `catch` alone, this return
  path stays open — worth a glance during stage 2.
- **The three-line `## Sink Findings` contamination of the stale archive folder** described above is
  recorded, not asserted. It is a consequence of the same defect and should disappear with the fix; it
  did not seem right to freeze a second behaviour into the suite off one observation.

---

## FOLLOW-UP — spawn-class annotation repair (comment-only)

`node scripts/test-spawn-classification.js` failed on the worktree with 2 violations, both mine.

**Cause.** The classifier's `CLASS_MARK` (`scripts/test-spawn-classification.js:60`) captures
everything after `spawn-class:` to end of line as the class token, and `VALID_CLASSES` (`:56`) is
closed to `cli-contract`, `concurrency`, `crash`, `durable-handoff`, `environment`. My trailing
rationale prose became part of the token, so it was rejected as unrecognised. The second violation
followed from the first for a reason worth writing down: `enumerateFile` accepts an annotation only
on the spawn line itself or the line **immediately above** (`:194`,
`annotation[i] || annotation[i-1]`). My rationale ran onto a second comment line, so even a
well-formed token on the first line would not have reached the site — the annotation had to be the
last line before the call regardless of the token bug.

**Change.** One edit, comment text only, in `(x3)`: the rationale now sits on its own comment lines
and `// spawn-class: cli-contract` is the bare last line before `const exportProbe = spawnSync(…)`.
No assertion, fixture, control-flow or expectation changed; the diff is three comment lines replaced
by four. The ceiling was not raised and the spawn was not converted in-process — `(x3)` needs the
fresh process, since this suite's own require cache already holds the shipped `claim.js` and an
in-process require would answer about the wrong file.

**Verification**, both exit codes captured with `$?` directly on the node process (no pipe):

```
$ node scripts/test-spawn-classification.js ; echo "SPAWNCLASS_EXIT=$?"
SPAWNCLASS_EXIT=0
spawn-classification passed (10 mutation assertions; 591 spawn sites across 60 files,
169 classified, 422 grandfathered; 136 slot(s) of slack)

$ node scripts/test-sink-merge.js ; echo "SINK_SUITE_EXIT=$?"
SINK_SUITE_EXIT=1
Sink-merge (#694/#700/#705/#707/#711/#715/#746/#832/#893) test suite FAILED: 8 failed, 274 passed.
```

Signature unchanged. The eight `FAIL:` lines were diffed against the pre-edit run and are identical
except for the per-run fixture SHAs in the `origin/main must NOT advance` message, which are
non-deterministic by construction.

Note for the record: at the time of this verification `scripts/kaola-workflow-sink-merge.js` already
carried the implementer's in-progress modifications (`git status` showed it dirty), and the suite
still reported 8 failed / 274 passed — so that count is a live reading against a work-in-progress
tree, not a stale one.
