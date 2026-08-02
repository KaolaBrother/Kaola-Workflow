# tdd-paths — pins for #904 and #907's false green

Baseline every RED below was measured against: **`2018521fd9e96c7f84ace0d099d3881706414bac`**, extracted
with `git archive` into an untouched scratch mirror at
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-f33f-4c74-8c66-4434a7ea9c6d/scratchpad/baseline`
(mirror commit `f0b2e0f`). The shared worktree was never stashed or reverted — implementers held
uncommitted work in it for the whole of this task.

No new suite file was created. Every pin went into a suite that is already registered in a chain, so
`package.json` — which is not a test path — needed no edit and `test-suite-registration.js` stays green.

| pin | file | home | fast gate? |
|---|---|---|---|
| 1 — #904 sandbox socket budget | `scripts/test-validation-runner.js` | inline, before the final `PASSED` | yes |
| 2 — #907 finalize false green | `scripts/test-finalize-door.js` | new `T9` (a/b/c/d) after `T8n` | yes |
| 3 — #907 chain-scope fail-open | `scripts/test-run-chains.js` | new `T-907a`, between `T34` and `T-788` | full tier only |
| 4 — #907 archive gitlink block | `scripts/test-sink-merge.js` | new `(z1)`, after `(x3)` | full tier only |

---

## PIN 1 — #904: a child spawned by `run` must be able to bind a unix socket under the sandbox TMPDIR

`scripts/test-validation-runner.js`. This is the first coverage the `run` subcommand has ever had —
`defaultSandboxPaths` is not exported and no suite invoked `run`, which is why a 143-character root
shipped.

**RED, baseline `2018521f`:**

```
AssertionError [ERR_ASSERTION]: #904: a child spawned by `run` MUST be able to bind a unix socket
under the sandbox TMPDIR. It cannot when the sandbox root spends the whole `sun_path` budget before
the child gets a byte ... got status=1 outcome="fail"
  1 !== 0
```

**Positive controls, both green on the same baseline run (they precede the acceptance leg, so the RED
above is attributable to one axis):**

- CONTROL A — the same probe binds under the same fixture TMPDIR when run directly, no runner. The
  fixture directory is not the problem; the sandbox root the runner builds beneath it is.
- CONTROL B — `run` over a child that binds nothing PASSES in this fixture (`outcome: "pass"`), so the
  runner does execute children here.

**What is pinned:** the result only. No literal `kwv`, no seed width. The one shape property that is
pinned is the one the budget must not buy — two runs of the same policy produce an identical
`command_id` — with its own non-vacuity control (a *different* policy must move it).

**Hermeticity:** `TMPDIR` is set explicitly to a fixture directory of exactly 48 characters (a stock
macOS `os.tmpdir()`), never inherited. Inheriting it would make the test pass or fail by accident of
who ran it: on a box with `TMPDIR` unset, `os.tmpdir()` is 4 characters and the baseline would be
green. The probe reproduces tsx's real pipe shape with a fixed-width trailing component, so the
19-character suffix the real consumer has is not quietly shortened by a 3-digit pid.

---

## PIN 2 — #907: the finalize false green

`scripts/test-finalize-door.js`, `T9`. Every leg is a **linked worktree finalized with
`--keep-worktree`**, because the staging block is nested inside `if (args.keepWorktree)` and a
linked-worktree-only test; an in-place finalize returns `finalize_commit: "skipped"` and proves
nothing.

**RED, baseline `2018521f`: 23 failures, 278 passed.** First casualties:

```
FAIL: T9b(a trailing space): the healthy deliverable beside the hazard MUST be committed ...
      got HEAD tree=[".gitignore","CHANGELOG.md","README.md","docs/design.md",
                     "kaola-workflow/ROADMAP.md","src/app.swift","src/feature.js"]
      finalize_transaction={... "finalize_commit":"nothing_to_commit"}
      stderr="fatal: pathspec 'notes.md' did not match any files\n"
FAIL: T9b(a trailing space): and `nothing_to_commit` is the FALSE GREEN itself
FAIL: T9c: a `git add` that failed must be REPORTED on the envelope, naming what could not be staged
FAIL: T9c: and it is recorded DURABLY
FAIL: T9d(gitea): the deliverable survives the hazard on this hand-ported edition too
```

**Positive control (T9a):** the identical fixture with no hazard file commits `chore: finalize` and
carries `src/pending-good.js` into it — green on the same baseline run. `KAOLA_WORKFLOW_OFFLINE` is
set **explicitly and identically on every leg including the control**, so it cannot be what suppressed
a commit.

**Correction to the brief's hazard table, measured, not assumed.** The brief named four hazard shapes.
Only some are actually red, and the difference is load-bearing:

| name | baseline | why |
|---|---|---|
| trailing space `notes.md ` | **RED** | `status --porcelain` quotes it; the parser strips quotes then `.trim()`s the space away; the pathspec matches nothing |
| non-ASCII `nöte.md` | **RED** | octal escapes `n\303\266te.md` survive the quote-strip and match no pathspec |
| embedded newline `new\nline.md` | **RED** | same, `new\nline.md` as a literal |
| embedded `"` `qu"ote.md` | **already green** | the escaped form `qu\"ote.md` happens to match the real file as a pathspec |
| backslash `back\slash.md` | **already green** | same accident, `back\\slash.md` |

The last two stay in the table as **regression pins** — a parse change must not break the two shapes
that work today. The comment above `T9` says which are which so nobody later reads five green legs as
five caught defects.

**Both halves are pinned, separately.** T9b is the parse; T9c is the `catch (_) {}`. T9c's forced
failure is an **unreadable file** (`chmod 000`) — a staging failure the parse fix cannot cure, so it
holds even after the parse is right. It carries its own premise assertion (`git add` on that file
exits non-zero), which reds loudly rather than passing vacuously if the suite ever runs as root.

**Per-edition coverage (T9d).** All four claim copies are driven: root, codex, gitlab, gitea. Each gets
a control leg, a hazard leg, and — since the reporting half is an edit to `claim.js`, which is
hand-ported per forge with nothing comparing the copies — the *same* `assertStagingFailureIsReported`
assertion set as the canonical copy. The parse half lives in the ×4 byte-identical kernel and reaches
all four for free; the reporting half does not, which is exactly why it is driven per edition.

**What the typed finding is not pinned as:** no token, no field name. `envelopeNames` accepts a named
band of carriers plus any top-level key matching `/stag|error|warn|finding|residue|uncommitted|dropped|skip/i`.
`changed_paths` is deliberately excluded — it is derived from what *was* committed, so a hit there
would be evidence of success, not of a report.

---

## PIN 3 — #907: `isEditionCouplingPath` fails open on a C-quoted path

`scripts/test-run-chains.js`, `T-907a`, modelled on the neighbouring `T34`.

**RED, baseline `2018521f`: 9 failures, 249 passed.**

```
FAIL: T-907a(non-ASCII): an edition-coupling path under plugins/ selects ALL FOUR chains even when
      git quotes it ... got "claude"
FAIL: T-907a(non-ASCII): receipt.scope.decision === all-four; got
      {"decision":"claude-only","reason":"non_edition_diff","touchedEditionPaths":[],"changedFileCount":1,
       "chains":["claude"]}
```

Three names red (non-ASCII, `"`, `\`), each ×3 assertions.

**Positive control:** the fourth row of the same table — a **trailing space** — is green on the same
baseline run, on the same fixture builder and the same code path. `diff`/`ls-files` do not quote a
trailing space, so `.trim()` mutates the value while leaving the `plugins/` prefix test true. That
green leg proves the fixture reaches the classifier and can produce `all-four`; it also pins that a
fix must not break it on the way past.

---

## PIN 4 — #907: an embedded git repository in an archive

`scripts/test-sink-merge.js`, `(z1)`, driven on **all four sink copies**.

**RED, baseline `2018521f`: 4 failures (one per edition), 419 passed.**

```
FAIL: #907 z1 (root): ... Every path the refusal itemizes has to be one `git add -f` can take —
      today it names ["kaola-workflow/archive/issue-90701/vendored/inner.md"], and force-adding it
      fails: ["... -> fatal: Pathspec '...' is in submodule 'kaola-workflow/archive/issue-90701/vendored'"]
```

**Two corrections to #907, both measured:**

1. A `.git`-named **FILE** is not a defect. `requiredArchiveFiles` has skipped it since the function
   was written. The real block is a `.git` **DIRECTORY** (or a valid gitfile): git collapses the
   subtree into a `160000` gitlink, `ls-tree -r -z` returns only the gitlink, `requiredArchiveFiles`
   still demands the siblings, and the operator's own `git add -f` exits 128. The current skip does
   not cover it — it skips the entry, and the gitlink boundary is what makes the entry's *siblings*
   unreachable.
2. **My first version of this pin PASSED on the baseline, so the test was wrong and I replaced it.**
   It asked whether the refusal "names the embedded directory", and the broken sink answered yes by
   accident: the journal's `archived_paths` lists the gitlink at exactly that path. Bookkeeping
   satisfied a prose question. The oracle is now an **operation**, not a reading:

   > every path the refusal itemizes must be one `git add -f` can take.

   That cannot be satisfied by accident, and it fixes nothing about the method — dropping the subtree
   from the required set (the sink then completes and names nothing) and naming the containing
   directory instead of the file beneath it (force-adding a gitlink exits 0) both satisfy it.

**Fixture premises, asserted:** git genuinely collapses the subtree into a `160000` entry; the file
beneath is genuinely absent from the index; `git add -f` on it genuinely exits non-zero. All measured
in a **scratch `GIT_INDEX_FILE`** so the fixture the sink is about to read is untouched.

**Two things the pin also holds:** whichever way the sink decides, the archived run record and the
embedded repository's own content are still on disk — a "fix" that cleared the block by deleting the
subtree would satisfy the oracle and lose someone's data.

**Fixture correction found while extending to the forge ports:** the gitlab and gitea legs first red
at `step: "closure"`, not at the archive gate — the offline mock speaks gh's argv, not glab's or
tea's, so the forge closure failed and the red was a fixture artefact that read exactly like a real
one. Fixed by driving every edition with `--keep-issue-open` (same axis on all four) and adding an
explicit premise assertion that the run reached `step: archive_commit` at all, so a stop anywhere else
says which step rather than arriving as an unexplained red.

---

## Things worth knowing

- **I damaged an existing scenario mid-task and repaired it.** A `String.replace` intended for my own
  `runSink(fx, ...)` call hit the *first* occurrence in the file, inside
  `testCollisionSuffixedArchiveCommittedAndDisposed` (line 419). Caught by a `ReferenceError` on the
  next run and restored; `git diff scripts/test-sink-merge.js | grep "^-"` now returns only the diff
  header, i.e. the change is purely additive.
- **Two new git spawn sites in `test-sink-merge.js` tripped the spawn census.** Both are routed
  through the shared `test-git-fixture` library (`G.git`, which forwards opts verbatim, including
  `env`) rather than annotated — that is the suite's own stated convention and it keeps the file under
  its ceiling. `test-spawn-classification.js` and `test-suite-registration.js` both pass.
- **Not pinned, and why:** the sibling `.rustup` / `--env-allowlist` finding in premise-904 is a
  *reported* fact with no acceptance claim attached to it in my brief — allowlisting `HOME` is
  silently ignored, and a tool with no env override of its own has no remedy at all. No design was
  proposed for it, so there is nothing to falsify yet.
- The four suites all pass against the worktree as of this writing (implementer fixes landed while I
  was working). That is a verdict about their code, not mine to give — the RED transcripts above are
  the deliverable.

---
---

# Second pass — #908 G5 and G3

These two differ from the four above: there is no defect to fix, so there is no baseline that reds.
The behaviour under test is **already correct and already shipped**; what is missing is the pin. The
oracle is therefore a **mutant**, and each pin is proven by being GREEN against shipped code and RED
against a mutation of the exact rule it claims to guard.

The mutation mirror is a **copy**, never `git checkout --` or `git stash`:
`rsync -a --exclude .git <worktree>/ <scratchpad>/mut/`, then mutate the copy. Other agents held
uncommitted work in the shared worktree throughout.

| pin | file | home |
|---|---|---|
| A — #908 G5, the count rule's `isDirectory` filter | `scripts/simulate-workflow-walkthrough.js` | a fourth leg inside `testClosureAuditScopedArchiveAmbiguousMatch903` |
| B — #908 G3, the consumer worktree lane past `--check` | `scripts/test-finalize-door.js` | `T8m(W6)`, appended after `W5` |

---

## PIN A — #908 G5: a non-directory band entry must not count as an archive

**Where:** `scripts/simulate-workflow-walkthrough.js`, a fourth leg inside
`testClosureAuditScopedArchiveAmbiguousMatch903`, immediately after the existing solo negative
control. No new scenario, so the registry and the shard ordinals are untouched.

**Fixture:** the solo control's own shape — a live folder, one incomplete archive directory — **plus
one regular file** named `proj-file.archived-<ts>`. One axis: the band entry's type.

**No production seam was added, and none was needed.** `archiveNameIsAmbiguous` stays module-private;
the CLI's scope envelope already carries both halves of the answer. The previously-declined export is
not what stood between this branch and a pin.

**Mutant:** delete `.filter(e => e.isDirectory())` from
`scripts/kaola-workflow-closure-audit.js:220`.

```
SHIPPED (worktree):
  testClosureAuditScopedArchiveNameMatch903: PASSED
  testClosureAuditScopedArchiveAmbiguousMatch903: PASSED
  Walkthrough --only subset passed (2 scenarios)                      EXIT=0

MUTANT (mirror, line 220 only):
  testClosureAuditScopedArchiveNameMatch903: PASSED
  Error: #903: a regular FILE in the archive band whose name matches the project must not count as a
  second archive — an archive is a folder, and counting anything else reports an ambiguity that does
  not exist; got: {"project":"proj-file","issue_numbers":[943],
  "state_file":"kaola-workflow/proj-file/workflow-state.md","archive_name_ambiguous":true}
                                                                      EXIT=1
```

The leg pins **both** halves the miscount moves, because either alone would still let a wrong
implementation through: the scope grows an `archive_name_ambiguous: true` it has no basis for, **and**
the real archive's finding is downgraded from `name_match` to `ambiguous_name_match` — a report
disowning an attribution that was never in doubt.

**A mutation trap worth recording, because it cost me two runs.** `.filter(e => e.isDirectory())`
occurs 5 times in that file, and `String.replace` takes the *first*: my first mutant landed on line
154, in a different function, and the probe came back identical to shipped. A mutant that changes
nothing reads exactly like a pin that is armed. Both mutations in this pass therefore match a
**full, unique line** and assert `hits.length === 1` before writing. (Same class of error as the
`test-sink-merge.js:419` damage recorded above — third occurrence today.)

---

## PIN B — #908 G3: the consumer worktree lane, past `--check`

**Where:** `scripts/test-finalize-door.js`, `T8m(W6)`, appended after `W5`. Appended, not
restructured — `T9` from the first pass was re-run and is intact (301 assertions before W6, 310
after).

**Correction the brief already carried, confirmed:** the *self-host* worktree-lane full finalize is
pinned in `test-claim-hardening.js`. The uncovered cell is **consumer repo × worktree lane × full
transaction** — the one where the validation classification comes from `.cache/final-validation.md`
rather than a chain receipt.

It must run **last** in T8m: finalize is terminal and archives the folder every earlier assertion
reads. It reuses T8m's existing fixture, `gh` mock and recorded validation — assertions, not
scaffolding.

**What it pins:** exit 0 and terminal closure; `validation.classification === 'chains_green'` after
the transaction (not just at `--check`); the archive dest under **main's** band; `workflow-state.md`
**and** `.cache/final-validation.md` on disk at the dest the envelope names; main's live folder gone;
and the durable `## Validation` section carrying the same measurement.

**Two mutants, and the second is the one that matters.**

*M1 — read the validation AFTER the archive* (move `archiveProjectDirSafely` above the validation
block in `cmdFinalize`). This is the failure the leg's comment names.

```
MUTANT EXIT=1 — finalize-door tests FAILED (15 failures, 294 passed)
FAIL: T8m(W6): the CONSUMER arm's measurement must survive the transaction ...
FAIL: T8m(W6): finalization-summary.md exists after the transaction
  ... plus T2 / T3b–T3f, which catch it too.
```

W6 is armed — but so is half the file, so this proves arming and not coverage.

*M2 — the pre-#832 archive destination*: `const isLinkedRun = !!(mainRoot && mainRoot !== linkedRoot)`
→ `false`, so a linked run archives into the **invoking** root.

```
MUTANT EXIT=1 — finalize-door tests FAILED (2 failures, 308 passed)
FAIL: T8m(W6): the archive destination is under MAIN's band — the worktree is the tree being torn
      down, so an archive written there is evidence with a demolition date
FAIL: T8m(W6): the live folder in MAIN is gone — an archive that leaves the live copy standing
      leaves a phantom active claim a successor reads as unfinished work
```

**Both failures are W6's, and every other leg in the file stays green** — including T8m's own
`--check` E2E arm and the T9 legs from the first pass. That is the arming proof that matters: this
leg is the only witness in the file for the cell, and the in-place legs cannot see the mutation
because in-place *is* the invoking root.

**A wrong mutant, recorded so it is not retried.** My first attempt pointed the validation probe at
`path.join(root, 'kaola-workflow', args.project)` instead of `finalizeAuthorityDir`, expecting the
worktree to have no run folder. It was a **no-op**: `finalizeTx.mirror` runs at `claim.js:3956`,
*before* `resolveFinalizeAuthority` at `:3970`, so by the time validation is read the worktree already
carries the mirrored folder and the two paths are the same directory. The suite passed at 310 either
way. Recorded because "the mutant passed" and "the pin is decorative" are indistinguishable from the
transcript alone.

## Verification, second pass

- `node scripts/test-finalize-door.js` → exit 0, 310 assertions (T9 intact).
- `node scripts/simulate-workflow-walkthrough.js --only testClosureAuditScopedArchive` → exit 0.
- `node scripts/simulate-workflow-walkthrough.js` at **FULL** scope → exit 0.
- `node scripts/test-suite-registration.js` → exit 0 (no new suite file, so no chain edit).
- `node scripts/test-spawn-classification.js` → exit 0.

## Not pinned, second pass

`archiveNameIsAmbiguous`'s `catch (_) { return false; }` arm — an unreadable
`kaola-workflow/archive/` directory. It is not CLI-reachable without a permissions axis, and a fixture
that chmods a directory the suite then has to clean up is a hazard of its own. It is one branch, it
fails safe, and the premise report already names it as the remaining gap.

---
---

# Third pass — #906's two destruction fixes (review finding C5)

Both #906 fixes shipped with **no test at all**: `main_live_orphan` / `.orphan-main-live-` appeared
only in the four implementations and `docs/api.md`, and `uncomparable` appeared in no suite. The
behaviours work today; nothing would notice when they stop. As in the second pass, the oracle is a
**mutant**, not a baseline.

**Home:** `scripts/test-claim-hardening.js`, appended after the existing `#901(D1)` block. That block
is the direct neighbour — same `release`-from-a-linked-worktree vehicle, same main-only axis — and it
already establishes *why* `release` is the vehicle: it is one of the three routes that run no Step-8a
mirror, so nothing upstream establishes "worktree ⊇ main" and `mainLive ↔ dest` is the pair that can
genuinely differ. `D1` plants regular files only; these plant the entry kinds that reduce to no bytes.

Cost: the suite goes 557 → **766 assertions**, ~30 s wall. It is a `FULL_ONLY` suite, so nothing was
added to the fast gate.

Both blocks are driven **behaviourally on all four editions**. The `P7`/`P8` pins already in this file
are source-text greps: they can say a literal is present, never that the hand-port works.

---

## PIN 1 — route 1: the backstop MOVES, it does not delete

`#906(R1 …)`. Fixture is the #395.4 crash shape: the worktree's live folder is **gone** (so
`archiveProjectDir` is source-missing and the backstop is reached at all), the archive under MAIN is
already stamped `closed`, and MAIN's live folder survived carrying one file nothing else has.

Three legs — `L1_plain` on every edition, plus `L2_keepworktree` and `L3_symlinked_main_live` on
canonical. Each asserts four things, and the split between them is the point:

- exit 0 and `status: closed` — nothing here refuses;
- **the claim is cleared**, measured from MAIN by running `status --json` and reading `count === 0`,
  not inferred from the folder being absent;
- **nothing was destroyed** — the main-only file is still readable under the archive authority;
- `finalize --check` still answers `ok` afterwards, so the rescue did not trade one dead end
  (a phantom claim) for another (a second archive authority).

The destination's name and its timestamp format are **not** pinned; the assertion walks the archive
authority and asks whether the bytes are reachable.

**Mutant:** `fs.renameSync(mainLive, orphanDir)` → `fs.rmSync(mainLive, { recursive: true, force: true })`
(canonical only).

```
M-R1 EXIT=1 — claim-hardening tests FAILED (3 failures, 763 passed)
FAIL: #906(R1 canonical L1_plain):                the file only MAIN held must still be readable …
FAIL: #906(R1 canonical L2_keepworktree):         "
FAIL: #906(R1 canonical L3_symlinked_main_live):  "
```

Exactly three failures, all the same assertion, and **the claim-clearing assertions stay green** —
which is correct and is the whole point of the fix: deleting also clears the claim, so an oracle that
only checked the claim would have passed on the destructive shape. The other three editions' `L1`
stayed green too, since only canonical was mutated — the per-edition arms are independent.

**A wrong assertion I wrote and fixed.** `L3` (a symlinked `mainLive`) failed on the shipped code
first. My walker used `withFileTypes`, so it stopped at the orphan symlink and reported the rescue as
a loss. The backstop moves the **link**; the bytes stay at the target and are reachable *through* the
orphan. The walker now decides directory-ness with `statSync` (which follows links) and is depth-capped.
The assertion was wrong, not the code — recorded because a red I could have "fixed" by deleting the leg.

---

## PIN 2 — route 2: "cannot be compared" ≠ "bytes differ"

`#906(R2 …)`, eight legs × four editions. The axis is the KIND of the one entry main's live folder
holds and the worktree's does not.

| leg | entry | expect |
|---|---|---|
| `C0_clean` | *(nothing main-only)* | archive at exit 0 |
| `C1_main_only_file` | `.cache/EXTRA.md` (regular file) | refuse |
| `R2_top_symlink` | `extra-link.txt` | refuse |
| `R4_sidecar_symlink` | `.cache/final-validation.md` | refuse |
| `R5_dangling` | `mission-list.md` → nowhere | refuse |
| `R6_fifo` | `pipe.md` | refuse |
| `P1_empty_dir` | `empty-evidence/` | archive — see PIN 3 |
| `P2_dir_with_content` | `deep-dir/inner.md` | refuse |

`C0` is the anti-blanket-refusal control: a gate that refused here would satisfy every `refuse` row
and be a broken `release`. `C1` is the **positive control for the environment** — an ordinary
main-only file refuses under the identical `KAOLA_WORKFLOW_OFFLINE=1` every other leg runs under, so
the offline flag is demonstrably not what arms or silences the comparison.

Each refuse leg asserts five things: the typed refusal; **that it NAMES the entry** (in `missing` or
`mismatched` — which half is the implementer's); that the at-risk entry survives; that both live
copies survive; and that the envelope does not claim it archived.

**Mutant A — the `mainLive` leg stops reading `uncomparable[]`:**
`uncomparableFromMain = (mainCompare.uncomparable || []).filter(…)` → `= []`.

```
M-R2 EXIT=1 — claim-hardening tests FAILED (20 failures, 746 passed)
  R2_top_symlink / R4_sidecar_symlink / R5_dangling / R6_fifo, 5 assertions each,
  including: "and the envelope must not claim it archived; got true"
```

That last line is the shipped-before-#906 defect reproduced verbatim: `archived: true` at exit 0 with
the entry deleted. `C0`, `C1`, `P1` and `P2` stay green, so the mutation is surgical — it removes the
entry-kind half and nothing else.

**Mutant B — the refusal names nothing:** drop `mismatched` from `cmdRelease`'s refusal envelope
(`detail: result.detail, missing: result.missing, mismatched: result.mismatched,` → without it).

```
M-NAME EXIT=1 — claim-hardening tests FAILED (4 failures, 762 passed)
  the "and NAME the entry it refused over" assertion, on R2 / R4 / R5 / R6, and nothing else.
```

This is the half the implementer found by *running* it: before this bundle the three no-mirror routes
reported `missing` only, so an uncomparable entry refused with an empty list. Four failures, one
assertion, zero collateral.

---

## PIN 3 — the empty directory: SETTLED, and my verdict

**It IS silently deleted uncompared.** Measured on the no-mirror `release` route, canonical, with the
implementer's own driver shape:

```
PASS  C0_clean          exit=0 verdict=archive  mainGone=true   entrySurvived=null
FAIL  P3_empty_dir      exit=0 verdict=archive  mainGone=true   entrySurvived=false
PASS  P3_nested_file    exit=1 verdict=refuse   mainGone=false  entrySurvived=true
                                     reason=archive_incomplete missing=["deep-dir/inner.md"]
```

Exit 0, `archived`, the directory gone, and named in neither `missing` nor `mismatched`. The suspicion
in the review is correct.

**My verdict: KNOWN AND ACCEPTED, pinned as such — not reported as a defect.** The reason is not
"it carries zero bytes"; that alone would be a weak argument. It is that **git cannot store an empty
directory at all.** The archive band is committed, so a faithfully preserved empty directory would
vanish at the next commit and be absent from every clone. Refusing here would block a `release` in
order to protect something the durable record can never hold — a permanent, unclearable refusal of
exactly the shape the first pass's `z1` pin declares unacceptable.

What makes the acceptance safe is not that reasoning but the row beside it: `P2_dir_with_content`
pins that the moment the directory holds one byte, the refusal fires and names the file inside it. The
acceptance is scoped to "zero bytes", never to "directories". Both the verdict and its bound are
written at the assertion, so a future reader who sees this leg go red reads the note before "fixing"
the test.

---

## Verification, third pass

Run serially — these suites are spawn-bound.

- `node scripts/test-claim-hardening.js` → exit 0, **766 assertions** (was 557), ~30 s, 1151 spawns.
- `node scripts/simulate-workflow-walkthrough.js` at **FULL** scope → exit 0, 198/198.
- `node scripts/test-finalize-door.js` → exit 0, 310 assertions (second pass intact).
- `node scripts/test-spawn-classification.js` → exit 0 (the new spawn site is classified
  `durable-handoff`, matching its `#901(D1)` neighbour; 129 slots of slack remain).
- `node scripts/test-suite-registration.js` → exit 0.
- `git diff scripts/test-claim-hardening.js | grep "^-"` → the diff header only; purely additive.

## Not pinned, third pass

- **The orphan drags the sink's transaction journals into git history** (review CONFIRMED-1). Real,
  reproduced by the reviewer, and *not* mine to pin here: the fix is in `sink-merge.js`'s exclude
  pathspecs, a file another agent owns, and a test written against the current behaviour would freeze
  the defect. Reported, not frozen.
- **TOCTOU between `verifyArchiveComplete` and `rmSync`** (review SUSPECTED-2). Pre-existing, inherent
  to the shape, and not reachable from a CLI fixture without a seam to interleave the two — which
  custody forbids.

---
---

# Fourth pass — review findings R1 and R2

**Home for both:** `scripts/test-finalize-door.js`, appended after `T9`, as `T10`/`T10b`/`T11`. Both
findings are `cmdFinalize` behaviours and this suite is in the **fast gate** — which matters here more
than usual, because both are false-*verdict* defects: the run reports success and the archived record
reads clean. 310 → **394 assertions**, 33 s.

Both need a posture `T9` does not have: the run folder resident in **MAIN**, with a linked worktree on
the branch and Step 8a mirroring main → worktree at the top of every finalize. `T9` claims the folder
in the worktree, so neither finding is reachable from it. New builder `buildMainResidentRun`.

---

## PIN R1 — the mirror must not destroy a newer tree-bound artifact

`T10`, the four-step sequence, plus `T10b` as the green control.

```
A  run-chains from the worktree           -> receipt lands in MAIN (worktree has no run folder)
B  finalize, implementation not committed -> REFUSES, but Step 8a already created the wt run folder
C  operator commits, re-runs the chains   -> the FRESH receipt lands in the WORKTREE
D  finalize                               -> the mirror copies main's OLD receipt over the fresh one
```

Five assertions; three are premises (A landed in main, B refused as designed and created the folder,
C left the two trees holding **different** receipts) and two are the verdict:
`validation.classification === 'chains_green'`, and — the one a naive pin misses — **the archive
carries the receipt bound to the finalized tree**. A pin that stops at the classification passes on a
build that reports green and still archives the stale receipt, and the archive is what a successor
reads.

**The vacuity the implementer warned about, handled.** The outcome log is empty in this fixture, and
an assertion over two empty files passes against a mirror that overwrites. Both trees are seeded with
distinguishable content (`{"tag":"WT"}` ×3 vs `{"tag":"MAIN"}` ×1), the seeding is itself asserted as a
premise, and the assertion reads the **archived** copy — a successful finalize removes the live
worktree folder, so reading that would measure the archive step instead of the mirror.

**Mutant:** the Step 8a down-mirror reverted to `mergeCopyDir(srcDir, destDir, FINALIZE_MIRROR_DEST_OWNED)`.

```
M-R1 EXIT=1 — finalize-door tests FAILED (3 failures, 391 passed)
FAIL: T10(D): the gate must report chains_green over the tree the chains JUST ran on
FAIL: T10(D): the ARCHIVE must carry the receipt bound to the FINALIZED tree
FAIL: T10(D): the worktree's outcome log survives the mirror with ITS OWN rows
```

Exactly T10's three step-D assertions. **`T10b` stays green**, which is its whole job: the same fixture
and the same final tree with step B omitted is green on the broken build too, so the single axis in
T10 is the refused finalize, not the fixture, the mock chain or the main-resident posture.

---

## PIN R2 — the false green survives through the probe that feeds the fixed call

`T11`, three legs × four editions.

| leg | asserts |
|---|---|
| `control` | `finalize_commit === 'committed'`, `residue_stage === 'staged'`, **no** findings, no `## Finalize Findings` in the archived summary, deliverable committed |
| `statusfail` | `residue_stage !== 'skipped'`, `finalize_commit !== 'nothing_to_commit'`, `roadmap_staged === false`, non-empty `findings`, `## Finalize Findings` **in the ARCHIVED summary** |
| `nothing_to_stage` | `finalize_commit === 'nothing_to_commit'`, no findings, neither staged-ness probe reports a fault |

`statusfail` corrupts the linked worktree's index so `git status --porcelain` exits 128, and asserts
that premise before running. `control` is load-bearing: a report that fires on a healthy run would make
every `statusfail` assertion satisfiable by a build that always reports.

`nothing_to_stage` is the third pin the brief asked for, in the only form that discriminates:
`git diff --cached --quiet` exits 1 for "there ARE staged changes" and 128 for "git failed", and
reading the second as the first is the original bug's mechanism. `statusfail` pins a non-1 exit as a
**fault**; `nothing_to_stage` pins the exit-1 arm as an **answer**. Neither leg alone separates them.

**Mutants, both halves separately:**

```
M-R2PROBE  finalizeTx.residue_stage = 'unprobeable' -> 'skipped'   (canonical only)
  EXIT=1 — 1 failure, 393 passed — T11(root statusfail), the false-statement assertion.

M-R2PROBE  the same line in the GITEA port only
  EXIT=1 — 1 failure, 393 passed — T11(gitea statusfail), and nothing else.

M-R2FLUSH  appendSummarySection(result.dest, '## Finalize Findings', lines) -> void lines
  EXIT=1 — 2 failures, 392 passed — T9c and T11(root statusfail), both the DURABLE assertion.
  Every envelope-half assertion stays green: the two halves are armed separately.
```

---

## THE DEFECT THE MUTANT FOUND IN MY OWN TEST

The first `M-R2PROBE` run reddened **all four editions** from a canonical-only mutation. That is
impossible if the legs are independent — and they were not: I wrote the per-edition loop calling
`runClaim(...)`, which always shells the module-level canonical `claimScript`. The loop ran the same
file four times and read as four witnesses. Fixed to call `runFinalizeKeepWorktree(fx, edition.claim)`,
and the fix is proven in both directions: the canonical mutant now reddens only `root`, and a
gitea-only mutant reddens only `gitea`.

This is the fourth near-miss of the run and the first one a mutant caught rather than a suite:
an over-broad `String.replace` landing in the wrong function; a no-op mutant because two paths were
already the same directory; a wrong `L3` assertion about a symlinked rescue; and now four legs that
were one leg wearing four labels. **A green per-edition loop proves nothing until a single-edition
mutant reddens a single edition.**

## Verification, fourth pass

Serial, as instructed.

- `node scripts/test-finalize-door.js` → exit 0, **394 assertions** (was 310), 33 s.
- `node scripts/test-claim-hardening.js` → exit 0, 766 assertions (third pass intact).
- `node scripts/simulate-workflow-walkthrough.js` at **FULL** scope → exit 0, 198/198.
- `node scripts/test-spawn-classification.js` → exit 0.
- `node scripts/test-suite-registration.js` → exit 0.
- `git diff scripts/test-finalize-door.js | grep "^-"` → the diff header only; purely additive.

## Not pinned, fourth pass

- **R3 (`isEditionCouplingPath` and a rename pre-image).** `run-chains.js`, another agent's file, and
  not in this brief. The `T-907a` legs from the first pass cover the quoting class at that site; the
  rename-source case is a different input and would need its own leg once someone owns the fix.
- **`archive_commit: "deferred_to_sink"` while the staging failed.** The reviewer calls it a second
  false statement; the implementer disagrees on the record, holding that the token means "the sink
  owns this commit" and that the missing statement was about the STAGING, now `archive_stage`. That is
  a disagreement about what a token means, not a measurable fact, so I pinned `archive_stage` (which
  both agree on) and left `archive_commit` unpinned rather than freezing one side of an open question.

---
---

# Fifth pass — audit: is every per-edition loop in this bundle actually per-edition?

Triggered by the defect a mutant found in my own `T11`: a per-edition loop that shells the module-level
canonical script runs ONE file under FOUR labels and reads as four independent witnesses. This audits
every loop on the branch for that shape.

**The test, and it is mechanical.** Mutate ONE edition's production script; confirm exactly that
edition's legs redden, and no others. Then mutate a DIFFERENT single edition and confirm the same. A
loop where a single-edition mutation reddens all legs, or none, is not per-edition coverage. Every
mutation matches a full unique line and aborts unless it occurs exactly once
(`scratchpad/mutate1.js`); the mirror is a copy, restored between runs.

**Nothing was edited this pass.** `git diff --stat` for my files is unchanged from the fourth pass.

## The inventory — every per-edition loop on the branch

`git diff main --stat` gives six changed test files. Four contain a loop over EDITION SCRIPTS; two do
not, and that is a finding in itself rather than an omission:

- **`scripts/test-validation-runner.js`** (+744) — no per-edition loop, and none is owed: the runner is
  byte-identical ×4 and policed by `validate-script-sync`'s `BYTE_IDENTICAL_GROUPS`. Its only forge
  strings are `codex` as a *reviewer runtime* in `qualifyLocalReviewers`, which is unrelated.
- **`scripts/simulate-workflow-walkthrough.js`** (+45) — the added hunk contains no plugin path at all;
  the G5 leg drives the canonical `closure-audit` only.
- **`scripts/test-run-chains.js`** (+221) — no per-edition loop. `T-907a` loops hazard NAMES and
  `T-907b` loops rename scenarios, both against the canonical `run-chains.js`. Four copies of
  `run-chains.js` do exist, and the forge ports have their own pre-existing suites
  (`plugins/kaola-workflow-{gitlab,gitea}/scripts/test-{gitlab,gitea}-run-chains.js`), which this
  branch does not touch. **Flagged, not fixed:** whether `T-907a`/`T-907b` need equivalents in those
  two suites is a coverage question for whoever owns them; it is not a vacuity, because the loops that
  exist are not edition loops and so cannot be one script wearing four labels.

## The result — PROVEN, not inspected

| # | loop | file | owner | single-edition mutant | verdict |
|---|---|---|---|---|---|
| A | `#906(R2 …)` 8 legs × 4 | `test-claim-hardening.js` | me | `uncomparableFromMain = []` in **gitlab** → 20 failures, **all `(R2 gitlab …)`**; in **gitea** → 20 failures, **all `(R2 gitea …)`** | **PER-EDITION** |
| B | `#906(R1 …)` 3 legs | `test-claim-hardening.js` | me | `renameSync`→`rmSync` in **canonical** → 3 failures, all canonical (L1/L2/L3, the latter two canonical-only by design); in **gitlab** → **1 failure, `(R1 gitlab L1_plain)`** | **PER-EDITION** |
| C | `T9d` 3 editions | `test-finalize-door.js` | me | kernel `unquoteCStyle`→strip-and-trim in **gitea**'s `adaptive-schema.js` → 2 failures, both `T9d(gitea)`; in **gitlab**'s → 2 failures, both `T9d(gitlab)` | **PER-EDITION** |
| D | `T11` 3 legs × 4 | `test-finalize-door.js` | me | `residue_stage 'unprobeable'→'skipped'` in **canonical** → 1 failure `T11(root statusfail)`; in **gitea** → 1 failure `T11(gitea statusfail)` | **PER-EDITION — after the fix.** Was NOT, and this is the defect that started the audit |
| E | `z1` 4 editions | `test-sink-merge.js` | me | boundary probe pointed at a non-existent gitdir in **canonical** → `z1 (root)` only; **gitea** → `z1 (gitea)` only; **gitlab** → `z1 (gitlab)` only | **PER-EDITION** |
| F | `z2 / z2b / z3 / z4` 4 editions | `test-sink-merge.js` | `tdd-sink` | same boundary mutant in **gitea** → 3 failures, **all `(gitea)`** (`z1`+`z2`×2); in **gitlab** → 3, all `(gitlab)`. Journal-exclude glob reverted in **gitea** → `#906 z4 (gitea)` only. `symlinkTargetsOutsideArchive`→`[]` in **gitlab** → `#907 z3 (gitlab)` only | **PER-EDITION** |

Mirror control before the F runs: the unmutated mirror passes at 631 assertions, so every red above is
attributable to its mutation.

`z2b` is the one arm of loop F not separately mutated. It sits in the same `forEach` and receives the
same `script` argument as `z1`/`z2`/`z3`/`z4`, each of which was proven independently — stated as the
inspection it is, rather than folded into the measured rows.

**One loop was broken, it was mine, and it is fixed.** `tdd-sink`'s loop is sound. No other author's
file needed a report.

## A third no-op mutant, and the tell

My first loop-E mutation changed `--resolve-git-dir` to `--resolve-git-dir-NOPE`, expecting the probe
to fail. **`git rev-parse` echoes an unrecognised option and exits 0**, so the mutant was a no-op —
and it presented as *"a single-edition mutation reddens nothing"*, which is one of the two signatures
of a broken loop. I nearly filed loop E as broken on it.

The tell that separated them: mutating the CANONICAL script produced the same nothing. A loop that
threads its script correctly still cannot redden on a mutation that changes no behaviour, so
**before concluding a loop is vacuous, confirm the mutation bites on the edition you know is driven.**
The effective mutation points the probe at a non-existent gitdir (`git rev-parse --resolve-git-dir
.git/NO-SUCH` exits 128, measured), and it reddened exactly one leg per edition.

That is now three no-op mutants across this run — the wrong `String.replace` target, the
already-identical directory, and `rev-parse` swallowing an unknown flag. All three looked like
evidence. **A mutant that changes nothing is indistinguishable from a pin that measures nothing, and
the only way to tell them apart is a second mutation whose effect you already know.**

## Verification, fifth pass

- Mirror control (unmutated, current tree): `test-sink-merge.js` exit 0, 631 assertions.
- Eleven single-edition mutant runs, serially; every one reddened exactly the expected edition's legs.
- No file was edited this pass — the audit is read-plus-mutate-a-copy only.

