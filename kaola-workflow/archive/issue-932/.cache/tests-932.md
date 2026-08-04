# issue #932 — test custody notes (tdd-guide)

Baseline commit: `71976a8626d74b3b3bdceef6776336dc11331351` (`chore: release 9.5.3`)
Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-932`
Branch: `workflow/issue-932`

## The demanded result (verbatim from the issue)

> A failed claim must not delete anything the claim did not create.

Tests pin the RESULT — the foreign files survive, byte for byte — and never a mechanism, refusal
token, guard function name or error string. Nothing below reads an exit code or a status token as an
assertion; both are printed in failure messages only, as context.

## The throw, forced from OUTSIDE (no production seam added)

Grepped: there is no `KAOLA_WORKFLOW_FORCE_*` seam anywhere in the claim transaction
(`kaola-workflow-claim.js` has three, for the status probe, the archive refusal and the barrier
worktree list — none reaches this code). None was requested, and none is needed.

`<project>/.cache` is planted as a regular **FILE**. The transaction's first step is
`persistSelectionRecord`, whose `fs.mkdirSync(path.dirname(dest), { recursive: true })` then gets
`ENOTDIR` on `<project>/.cache/origin`. Faithful because:

- it fires exactly **between directory adoption and the completed write** — the window the issue's
  falsifier names — and it is the transaction's own documented failure mode
  (`kaola-workflow-claim.js:1235` and its comment: *"A throw here lands in the rollback below"*);
- it leaves every directory **permission** untouched, so the rollback that runs next is fully able
  to delete. A `chmod 0555` would have blocked the rollback too and made survival a property of the
  filesystem rather than of the code — a test that passes for the wrong reason;
- `args.selectionRecordBytes` is set unconditionally (`kaola-workflow-claim.js:1958`,
  `resolveSelectionRecord` synthesizes a record when the caller supplies none), so
  `persistSelectionRecord` always runs on both lanes.

## SITE 1 — `claimProject` (scalar lane)

**File extended:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-932/scripts/simulate-workflow-walkthrough.js`
**Test:** `testClaimNeverDeletesWhatItDidNotCreate932`, inserted directly after
`testArchiveNeverRelocatesReservedDir930` and registered in `buildRegistry()`.

**Why this file and not `test-claim-hardening.js`** (which the brief named): `test-claim-hardening.js`
appears **only** in `test:kaola-workflow:claude:full`, never in `test:kaola-workflow:claude`. Since
`npm test` = claude + codex + gitlab + gitea and the claude leg is the fast tier, a red test placed
there is invisible to `npm test` and to the four-chain receipt — the implementer could ship and the
gate would never look. The walkthrough runs in the mandated claude leg (sampled `--shard auto/12`)
and whole under `node scripts/simulate-workflow-walkthrough.js`, which CLAUDE.md names as the
verification command. It is also where the **sibling** test lives: `#930` pins the identical property
on the archive side, over the same reserved directory, with the same "foreign content survives"
shape — and its own header says *"the claim side is deliberately unchanged"*, which is this issue.
Scaffolding reused: `initGitRepo`, `runNode`, `read`, `G.git`, `claimScript`, and #930's local
`listTree` idiom.

### What it pins

Two cases, each driving `startup --target-issue <N>` against a scratch repo:

| case | project | how the name is reached | foreign content asserted |
|---|---|---|---|
| reserved | `.roadmap` | `workflow_project: .roadmap` in the run's own roadmap source | `.gitkeep`, `_rules.md`, `issue-9321.md` |
| ordinary | `issue-9322` | default name; the folder is a pre-existing crash-orphan | `NOTES.md`, `notes/evidence.txt` |

The second case is not a variant of the first: it is the same unscoped `rmSync` reached under a name
no reserved-name guard can see, and it is the only shape the bundle lane can ever have (its project
name is a computed `bundle-<targets>` literal). A fix that only refuses reserved names answers one
and not the other.

Three assertions per case: (1) the directory still exists; (1b) every foreign file exists with its
exact original bytes; (2) nothing was ADDED inside a folder the claim did not complete a claim over.

### RED on baseline — verbatim

`node scripts/simulate-workflow-walkthrough.js --only testClaimNeverDeletesWhatItDidNotCreate932`
exit **1**:

```
Error: #932 .roadmap: kaola-workflow/.roadmap must still exist after a claim that failed — the claim did not create it
exit: 1
stdout:
stderr: ENOTDIR: not a directory, mkdir '/private/var/folders/8s/y93yqng93xb4__nl4jlh_g9c0000gn/T/kw-claim-adopts-932-Bif9SZ/kaola-workflow/.roadmap/.cache/origin'
    at assert (.../scripts/simulate-workflow-walkthrough.js:36:25)
    at Object.testClaimNeverDeletesWhatItDidNotCreate932 [as fn] (.../scripts/simulate-workflow-walkthrough.js:2913:7)
```

The walkthrough's `assert` throws, so case 1 aborts the function before case 2 runs. Case 2 was
captured separately by temporarily iterating `CASES.slice().reverse()` (reverted immediately after;
`grep TEMP932` is now empty):

```
Error: #932 issue-9322: kaola-workflow/issue-9322 must still exist after a claim that failed — the claim did not create it
exit: 1
stdout:
stderr: ENOTDIR: not a directory, mkdir '/private/var/folders/8s/y93yqng93xb4__nl4jlh_g9c0000gn/T/kw-claim-adopts-932-s2MTrz/kaola-workflow/issue-9322/.cache/origin'
```

Both names lose the WHOLE tree: a hand reproduction of the same fixture showed
`kaola-workflow/` empty afterwards, `_rules.md`, `issue-9320.md` and `issue-9321.md` all gone.

### Positive control — each assertion proven non-vacuous

The first assertion fires on baseline, so the per-file and set assertions never execute; they were
proven separately. Temporarily gated on a `TEMP932CONTROL` env var (all three hooks removed
afterwards): with the `.cache` file NOT planted the claim ACQUIRES (`"claim":"acquired"`, exit 0) and
the directory survives, so the later assertions run and the fixture is tampered with by hand.

```
CONTROL delete  -> exit 1
Error: #932 .roadmap: the failed claim deleted kaola-workflow/.roadmap/.gitkeep — a file it did not create
exit: 0
stdout: {"verdict":"green","claim":"acquired",...,"project":".roadmap",...}

CONTROL alter   -> exit 1
Error: #932 .roadmap: the failed claim altered kaola-workflow/.roadmap/_rules.md
exit: 0

CONTROL added   -> exit 1
Error: #932 .roadmap: a claim that did not complete left new entries inside kaola-workflow/.roadmap/: [".cache/origin/selection-record.json","workflow-state.md"]
exit: 0
```

All three report. (The third control also shows the #930-described disaster from the claim side: a
successful claim on `workflow_project: .roadmap` writes `workflow-state.md` straight in beside the
roadmap sources. That is **not** pinned here — it is not what #932 demands.)

## SITE 1b — the NEGATIVE CONTROL, as a paired test

**File:** same walkthrough file.
**Test:** `testClaimRollbackRemovesOnlyWhatItCreated932`, registered after the one above.

Added on the lead's instruction after their reproduction landed (`repro-932.md`, legs 4 and 5). One
fault, one entry point, one code path; the ONLY variable is whether the project directory was
already on disk.

- **created leg** — `claim --project issue-9323 --issue 9323`, folder absent beforehand. The
  rollback must still remove it. **GREEN on baseline by design** — it is a control, not a
  falsifier, and what it forbids is a fix that answers #932 by not deleting, trading lost data for
  orphaned folders.
- **adopted leg** — `claim --project issue-9324 --issue 9324`, folder pre-existing and stateless,
  holding `evidence.md` and `notes/handoff.md`. Both must survive with exact bytes. **RED.**

### A second, unrelated fault — and it needs nothing planted

`--codex-dispatch-mode` is a registered value flag (`KNOWN_VALUE_FLAGS`) that **`cmdClaim` hands
straight to `claimProject`** — only `cmdStartup` strips it (claim.js:1945-1946). A newline in the
value makes `writeState`'s #398.2 fence `assertNoNewline(data.codex_dispatch_mode, …)`
(claim.js:781) refuse INSIDE the transaction. A shipped guard, on a shipped CLI door, with zero
filesystem manipulation. Measured from the CLI before writing the test:

```
$ node scripts/kaola-workflow-claim.js claim --project issue-7771 --issue 7771 --codex-dispatch-mode $'v2\nx'
refused: codex_dispatch_mode contains a newline/CR — durable-state field injection.   # exit 1
kaola-workflow/ after:  (empty — the created folder was correctly removed)

$ ... --project issue-7772 ... (folder pre-existed with notes/handoff.md + evidence.md)
refused: codex_dispatch_mode contains a newline/CR — durable-state field injection.   # exit 1
issue-7772 after:  No such file or directory   (ENTIRELY GONE, both files with it)
```

Two unrelated faults (`.cache`-ENOTDIR and this one) reaching the same destruction is what makes the
finding about the rollback rather than about either injection.

### The created leg is ALSO this test's liveness control

If the fault ever stops firing — the flag retired, the fence moved, the shim widened to `claim` —
the claim SUCCEEDS and its folder is still on disk afterwards, so the created leg reds. The adopted
leg cannot go quietly vacuous behind it. Proven, not asserted: see the `nofault` control below.

### RED on baseline — verbatim

```
Error: #932: kaola-workflow/issue-9324 must still exist after a claim that failed — the claim did not create it
exit: 1
stdout:
stderr: refused: codex_dispatch_mode contains a newline/CR — durable-state field injection. Provide a single-line value.
    at Object.testClaimRollbackRemovesOnlyWhatItCreated932 [as fn] (.../simulate-workflow-walkthrough.js:3021:5)
```

The control assertion above it PASSED on baseline — baseline does remove what it created.

### Positive controls — four runs (`TEMP932B`, all hooks removed; `grep -rn TEMP932 scripts/` empty)

```
nofault (fault dropped on BOTH legs)          -> exit 1
  Error: #932 control: a rollback must still remove the folder the claim itself created, or the
  answer to #932 is orphans instead of data loss — kaola-workflow/issue-9323 is still there
  exit: 0
delete  (fault dropped on the adopted leg)    -> exit 1
  Error: #932: the failed claim deleted kaola-workflow/issue-9324/evidence.md — a file it did not create
alter   (fault dropped on the adopted leg)    -> exit 1
  Error: #932: the failed claim altered kaola-workflow/issue-9324/notes/handoff.md
clean   (fault dropped, nothing tampered)     -> exit 0
  testClaimRollbackRemovesOnlyWhatItCreated932: PASSED (created removed, adopted intact)
  Walkthrough --only subset passed (1 scenarios)
```

`nofault` proves the liveness claim. `clean` is the one that matters most: with the created folder
removed and the adopted one intact, **the whole test passes** — it is satisfiable, not
over-constrained, and that is exactly the post-fix world.

### No additions-set assertion on the adopted leg — deliberate

This fault fires inside `writeState`, so `persistSelectionRecord` has already written
`.cache/origin/selection-record.json` into the adopted folder by the time it throws. Whether a
scoped teardown takes its OWN file back out is a design question #932 does not settle, and pinning
either answer would be pinning a mechanism. (The `.cache`-ENOTDIR test above throws BEFORE anything
is written, which is what makes its additions assertion unambiguous.)

## SITE 2 — `claimBundle` (multi-issue lane)

**File extended:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-932/scripts/test-bundle-claim.js`
**Test:** `testRollbackNeverDeletesAdoptedContent932`, printed as `Test (8d)/#932`, inserted directly
after the existing rollback group (8)/(8b)/(8c) and before Test (9). Scaffolding reused verbatim:
`makeTmpRoot`, `initGitRepo`, `writeRoadmapFile`, `writeGhMockScript`, `runClaim`, `parseClaim`, the
file's counter-style `assert`. `test-bundle-claim.js` runs in BOTH tiers, unsharded.

### Why the reserved-directory scenario is not reachable here

`claimExplicitBundle` derives its project as the literal `'bundle-' + targets.join('-')`
(`kaola-workflow-claim.js:1801`). The bundle lane can therefore **never** have a reserved-directory
project name, and a fix that answers #932 by refusing reserved names leaves this lane exactly as it
was. What IS reachable — and what is pinned — is the general sentence: the same EEXIST fall-through
at `kaola-workflow-claim.js:1548-1559`, `applied.dir = true` set unconditionally at 1560, and the
unscoped teardown at 1690-1694 under a comment already reading *"Remove project dir if created"* —
a scoping the code does not perform.

### Test (8) is the NEGATIVE CONTROL on this lane — no new test needed

Test (8) already asserts *"the bundle folder itself is gone, not left orphaned"* after a rollback,
over a folder the claim CREATED. That is the created-side control the lead asked for, already in
the suite, already green, immediately adjacent. (8d) is its complement over an ADOPTED folder; the
two do not conflict, and a fix that answers (8d) by not deleting reds (8) instead. Both test headers
now say so. I did not duplicate a bundle-lane created-dir control: the fault (8d) uses cannot reach
a directory that does not yet exist (there is nowhere to plant `.cache`), and the CLI-reachable
codex-newline fault does not reach this lane at all because the bundle path runs only through
`cmdStartup`, which strips the flag. The scalar lane carries the same-fault, one-variable contrast
inside a single scenario instead.

### What it pins

A stateless `kaola-workflow/bundle-9330-9331/` already on disk carrying `NOTES.md` and
`notes/evidence.txt`, no `workflow-state.md` (which is what makes the claim adopt rather than
conflict). Assertions: a NON-VACUITY control, the folder still exists, both foreign files exist with
exact bytes, and nothing was added.

The NON-VACUITY control is fix-agnostic: `out.project === 'bundle-9330-9331' && out.claim !==
'acquired'`. Deriving the bundle project is the last step before the mkdir and is downstream of
every pre-mutation refusal in the validation loop, so a fixture that silently stopped earlier (a
classifier change, mock drift) reds here instead of reading as a pass — while refusing, scoping the
teardown and resolving the name all still name this project and all still decline to acquire.

### RED on baseline — verbatim

`node scripts/test-bundle-claim.js` exit **1** — `test-bundle-claim: 5 test(s) FAILED, 191 passed`.
The NON-VACUITY control PASSED, so the run demonstrably reached the adoption. Every `#932` line
(the repeated `stdout:` envelope is trimmed to one copy here; it is byte-identical on all five):

```
Test (8d)/#932: rollback must not delete content of a project folder it did not create
FAIL: #932: kaola-workflow/bundle-9330-9331 must still exist after a claim that failed — the claim did not create it
FAIL: #932: the rollback deleted kaola-workflow/bundle-9330-9331/NOTES.md — a file the claim did not create
FAIL: #932: the rollback altered kaola-workflow/bundle-9330-9331/NOTES.md
FAIL: #932: the rollback deleted kaola-workflow/bundle-9330-9331/notes/evidence.txt — a file the claim did not create
FAIL: #932: the rollback altered kaola-workflow/bundle-9330-9331/notes/evidence.txt

exit: 0
stdout: {"verdict":"target_set_unavailable","claim":"none","selected_project":"bundle-9330-9331","selected_issue":null,"target_source":"user_directed","worktree_path":"","status":"target_set_unavailable","result":"answer","issue_numbers":[9330,9331],"project":"bundle-9330-9331","reasoning":"bundle provision failed and was rolled back: ENOTDIR: not a directory, mkdir '/private/var/folders/8s/y93yqng93xb4__nl4jlh_g9c0000gn/T/kw-bundle-claim-1jgYvZ/kaola-workflow/bundle-9330-9331/.cache/origin'"}
stderr:
```

Note the **exit code 0** and `result: "answer"`. On this lane the destruction is entirely silent:
the run reports a clean, rolled-back non-claim while the user's files are gone. (Site 1's scalar lane
at least exits 1 with a raw ENOTDIR stack trace.)

### Positive control — each assertion proven non-vacuous

Same technique (`TEMP932CONTROL`, all hooks removed afterwards; `grep -rn TEMP932 scripts/` is empty).
With the `.cache` file not planted the claim ACQUIRES and the folder survives:

```
CONTROL delete -> exit 1, 4 FAILED / 192 passed
  FAIL: NON-VACUITY: the run must reach this bundle project and not acquire it, got {"project":"bundle-9330-9331","claim":"acquired"}
  FAIL: #932: the rollback deleted kaola-workflow/bundle-9330-9331/NOTES.md — a file the claim did not create
  FAIL: #932: the rollback altered kaola-workflow/bundle-9330-9331/NOTES.md
  FAIL: #932: the claim left new entries inside kaola-workflow/bundle-9330-9331/ without completing: [".cache/origin/selection-record.json","workflow-state.md"]

CONTROL alter  -> exit 1, 3 FAILED / 193 passed
  FAIL: NON-VACUITY: ... {"project":"bundle-9330-9331","claim":"acquired"}
  FAIL: #932: the rollback altered kaola-workflow/bundle-9330-9331/notes/evidence.txt
  FAIL: #932: the claim left new entries ... [".cache/origin/selection-record.json","workflow-state.md"]

CONTROL added (nothing tampered) -> exit 1, 2 FAILED / 194 passed
  FAIL: NON-VACUITY: ... {"project":"bundle-9330-9331","claim":"acquired"}
  FAIL: #932: the claim left new entries ... [".cache/origin/selection-record.json","workflow-state.md"]
```

The third control is the one that matters most in the other direction: with the files intact, the
existence and bytes assertions **pass**. They discriminate rather than always failing.

## Regression check (re-run after the second test landed)

- `node scripts/simulate-workflow-walkthrough.js` (FULL, unsharded): **167 scenarios PASSED**,
  including `testArchiveNeverRelocatesReservedDir930: PASSED (4/4 names x 2 lanes)`. The run aborts
  at the first #932 scenario and nowhere earlier. `spawn-census: {"spawns":2295}`.
  Both new scenarios are registered LAST, so they hide nothing — but note the walkthrough's `assert`
  throws, so `testClaimRollbackRemovesOnlyWhatItCreated932` does not execute in a full sweep until
  the first one goes green. It was verified independently with
  `--only testClaimRollbackRemovesOnlyWhatItCreated932`.
- `node scripts/test-bundle-claim.js`: 191 of 196 assertions pass; the only 5 failures are #932's.
- `node scripts/test-suite-registration.js`: exit 0, 505 assertions.
- `node scripts/simulate-workflow-walkthrough.js --list`: exit 0, both new scenarios listed.
- `git diff --stat`: 2 files, +355 lines, 0 deletions. No production file touched, no test deleted
  or relaxed.

## Coverage map — what fails if a fix is partial

| fix shape | `.roadmap` (walkthrough) | `issue-9322` ordinary (walkthrough) | created-vs-adopted pair (walkthrough) | `bundle-9330-9331` (bundle suite) | existing Test (8) |
|---|---|---|---|---|---|
| reserved-name refusal only | green | **RED** | **RED** | **RED** | green |
| rollback scoped to created-vs-adopted | green | green | green | green | green |
| rollback stops deleting anything | green | green | **RED** (control) | green | **RED** |

## Known limitation, named rather than papered over

The scalar-lane test carries **no liveness control**, and the test's own header says so. Every
observable that would prove the run reached the adoption is one an allowed fix removes: refusing the
name and resolving it elsewhere both mean there is no adoption to observe, and the scalar lane
rethrows rather than emitting an envelope, so there is not even a project name to read back. The
falsifiable liveness evidence lives on the bundle lane, where the project name is a literal no fix
can change. `testClaimReclaimsStatelessOrphanDir` is the standing pin that this claim path reaches a
stateless directory at all.

---

# FOLLOW-UP (after the fix landed) — the forge editions

## New file: `scripts/test-forge-claim-rollback-scoping.js`

Modelled on its sibling `scripts/test-forge-archive-scoping.js`, same shape and same per-edition
argument. Four editions × four legs, driving each edition's OWN CLI for real.

**Why it had to exist.** `validate-script-sync.js` compares only `scripts/<name>` against
`plugins/kaola-workflow/scripts/<name>`, so the forge-renamed `kaola-<forge>-workflow-claim.js` is
compared to nothing — it is in neither COMMON_SCRIPTS nor RENAME_NORMALIZED_FAMILIES. Mutating the
root copy alone makes validate-script-sync exit 1; mutating root AND the github plugin makes it exit
0, and a gitlab-only or gitea-only regression is invisible to it, to `edition-sync --check`, and to
every export-superset guard. The walkthrough and `test-bundle-claim.js` pin canonical alone.

| leg | door | fault | pins |
|---|---|---|---|
| A | `claim --project` | `--codex-dispatch-mode` with a newline | created folder REMOVED (control + liveness witness); adopted folder + foreign files intact; folder holds exactly what it held |
| B | `startup --target-issue` | the repo's own PATH contains a newline | the record IS written (witness run, no fault), then taken back out with its directories pruned; foreign intact |
| C | `startup --target-issue` | same | a selection record that PREDATES the claim survives, and `.cache/`, `.cache/origin/` are not pruned |
| D | `startup --target-issues` | `<project>/.cache` planted as a FILE | the bundle lane's adopted folder + foreign files intact |

Leg B is the branch the implementer flagged as unreached by any authored test: `cmdClaim` never sets
`selectionRecordBytes` (that assignment is in `cmdStartup`), and both walkthrough scenarios fault
before the write. It is now covered, per edition.

### The fault hunt — two candidates rejected by measurement, one kept

Reaching leg B needs a fault that fires AFTER `persistSelectionRecord` on the `startup` door.

- `--codex-dispatch-mode` — **rejected**: `cmdStartup` strips it (claim.js:1945-1946).
- `--branch` with a newline — **rejected after being tried and caught**. I first built legs B and C
  on it, having read only `isSafeBranchArg` (which checks a leading dash and NUL, not a newline).
  `assertSafeBranchArg` calls `assertNoNewline` on the next line, at the FRONT DOOR, before the
  mkdir — so the claim refused with zero mutation and the folders survived for a reason that had
  nothing to do with the rollback. **The per-edition mutation proof is what caught it**: legs A and D
  red under every mutant, legs B and C red under none. A green pair that cannot go red is what a
  vacuous fixture looks like from the outside.
- the repo's own PATH carrying a newline — **kept**. `writeState` resolves `main_root` from the root
  it is handed and puts it through the same fence, after the record write. A/B'd against a reverted
  tree before being relied on:

```
FIXED tree:      exit 1, "refused: main_root contains a newline/CR"
                 adopted folder afterwards: ["evidence.md","notes/handoff.md"]
SITE-1 MUTANT:   exit 1, same refusal
                 adopted folder afterwards: folder GONE
```

## Wiring — five entries in package.json, the sibling's exact position

Inserted immediately after `node scripts/test-forge-archive-scoping.js` in each:

```
test:kaola-workflow:claude
test:kaola-workflow:codex
test:kaola-workflow:gitlab
test:kaola-workflow:gitea
test:kaola-workflow:claude:full
```

`node scripts/test-suite-registration.js` → exit 0, `44 test-*.js files, 41 registered, 3 exempt`,
516 assertions. That check also enforces that the FAST gate carries every suite the full tier does,
so a four-chain-only wiring would have failed it.

## MUTATION PROOF — per edition, one edition at a time

Method: all four claim copies `cp`-snapshotted to the scratchpad first; the revert applied to ONE
copy; the suite run; the copy restored by `cp` and `diff -q`-verified. Never `git checkout --` —
this worktree holds uncommitted work. The mutator asserts each anchor matches **exactly once** and
exits 3 otherwise: a mutation whose anchor misses reds nothing and looks exactly like a proof.

The revert is the fix's own two call sites:
`if (dirCreated) {...} else rollbackAdoptedDir(...)` → the unscoped `fs.rmSync(dir, {recursive:true,
force:true})`, and `applied.dir = dirCreated` → `applied.dir = true`.

```
MUTANT: canonical   SUITE_EXIT=1   95 passed, 25 failed
  6 claude/canonical/A   6 claude/canonical/B   8 claude/canonical/C   5 claude/canonical/D
MUTANT: codex       SUITE_EXIT=1   95 passed, 25 failed
  6 codex/A            6 codex/B            8 codex/C            5 codex/D
MUTANT: gitlab      SUITE_EXIT=1   95 passed, 25 failed
  6 gitlab/A           6 gitlab/B           8 gitlab/C           5 gitlab/D
MUTANT: gitea       SUITE_EXIT=1   95 passed, 25 failed
  6 gitea/A            6 gitea/B            8 gitea/C            5 gitea/D
```

Every mutant reds **only its own edition's** assertions; the other three stay green. That is
per-edition coverage measured, not inferred from an N-copy mutant.

A sample failure line, verbatim (gitea mutant, leg B):

```
FAIL: #932[gitea/B] the failed claim deleted kaola-workflow/issue-9410/evidence.md — a file it did not create
exit: 1
stdout:
stderr: refused: main_root contains a newline/CR — durable-state field injection. Provide a single-line value.
```

### Per-SITE proof as well, on the gitlab hand-port

```
gitlab, SITE 1 only reverted -> 100 passed, 20 failed:  6 gitlab/A  6 gitlab/B  8 gitlab/C   (D green)
gitlab, SITE 2 only reverted -> 115 passed,  5 failed:                          5 gitlab/D   (A,B,C green)
```

Neither site's coverage stands in for the other's.

### Restore integrity

```
canonical OK   codex OK   gitlab OK   gitea OK          (diff -q against the snapshots)
canonical == codex byte-identical                        (the #307 anchor still holds)
grep -rn TEMP932 scripts/ -> no matches
leftover kw932-* temp dirs in $TMPDIR -> 0
```

## The header correction in `testClaimRollbackRemovesOnlyWhatItCreated932`

The old rationale said the additions assertion was omitted because `persistSelectionRecord` had
already written the record by the time the fault throws. **That was false for the door that test
uses**: `cmdClaim` never sets `selectionRecordBytes`, so nothing is written at all. Corrected to say
what the code does, and to point at where the property IS carried — leg A of the forge suite, on the
same door and per edition — and where the record-written branch is covered, leg B. The test itself
was not changed; it was correct, and only its stated reason was wrong.

## The stale sentence in `testArchiveNeverRelocatesReservedDir930`'s header

#930's header said *"The claim side is deliberately unchanged: a reserved directory may still be
claimed."* True when written, half false after #932. Both halves were re-measured on the CURRENT
tree before the sentence was rewritten — a correction written from the diff rather than from a run
is the same defect class it is correcting:

```
$ node scripts/kaola-workflow-claim.js startup --target-issue 9350     # workflow_project: .roadmap
{"verdict":"green","claim":"acquired",...,"project":".roadmap",...}                    exit 0
kaola-workflow/.roadmap/ after:  _rules.md  .cache  issue-9350.md  workflow-state.md
kaola-workflow/.roadmap/workflow-state.md:  "## Project / name: .roadmap / status: active"
```

So the ADOPTION half is unchanged and still reaches exit 0 (#933); the ROLLBACK half is not (#932,
`testClaimNeverDeletesWhatItDidNotCreate932` green plus the per-edition mutation proof above). The
sentence now says exactly that, names both issues, and states that this scenario does not pin the
adoption half. Nothing else in the header moved: the paragraph above it — *"the claim writes
workflow-state.md straight into kaola-workflow/.roadmap/ beside the roadmap SOURCES"* — was checked
against the same run and is still true as written.

Verified: `node --check` OK; the three affected scenarios re-run green —
`testArchiveNeverRelocatesReservedDir930: PASSED (4/4 names x 2 lanes)`,
`testClaimNeverDeletesWhatItDidNotCreate932: PASSED (2 names)`,
`testClaimRollbackRemovesOnlyWhatItCreated932: PASSED (created removed, adopted intact)`.
The released `## [9.5.3]` CHANGELOG entry carries the same sentence and was deliberately left alone:
it is history, describing what #930 did.

## Follow-up verification

- `node scripts/test-forge-claim-rollback-scoping.js` → exit 0, **120 passed, 0 failed**
- `node scripts/test-forge-archive-scoping.js` (the untouched sibling) → exit 0, 188 passed
- `node scripts/test-bundle-claim.js` → exit 0, all 196 tests passed
- `node scripts/test-suite-registration.js` → exit 0, 516 assertions
- `node scripts/simulate-workflow-walkthrough.js` (FULL) → exit 0, 205/205

## Judgement calls the lead should know about

1. **Site 1 landed in the walkthrough, not `test-claim-hardening.js`.** Reasoning above: the named
   file is absent from the mandated tier, and the sibling `#930` test is in the walkthrough.
2. **The scalar lane pins an ordinary project name too, not only `.roadmap`.** The issue's demanded
   result is stated generally ("anything the claim did not create") and the bundle lane can only ever
   have the general shape, so a reserved-name-only fix would leave site 2 red regardless. The
   ordinary-name scalar case makes that visible on the scalar lane as well, one file earlier.
3. **No production seam was added or requested.** Every throw is forced by filesystem shape.
