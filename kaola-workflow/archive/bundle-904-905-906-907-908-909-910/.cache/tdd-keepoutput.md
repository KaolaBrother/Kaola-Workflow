# tdd-keepoutput — #905 `--keep-output` test custody

**All four briefed behaviours are pinned, plus one the production file grew under me. Every pin is
mutation-proven RED against a mutant and GREEN against the shipped file. One recorded negative
result, one finding, and two things I deliberately did not pin.**

- **Where:** `scripts/test-validation-runner.js:674-1027` — one appended block, **purely additive**.
  `git diff --stat` on the file is `496 insertions(+)`, **zero deletions**, and 680 + my 355 = the
  current 1035 lines exactly, so nothing of `tdd-paths`' was renumbered, reorganised or removed.
- **Suite:** `node scripts/test-validation-runner.js` → **exit 0**, `PASSED`, 4.6s (was 2.6s).
- **No production file touched.** The four runner copies are untouched by me.

## The moving target — read this first

**The runner changed under me mid-task.** I wrote and first verified these pins against
`892a19d7ff501b44…`, the hash `impl-runner` reported. Partway through building mutants the file was
at `a8fe2a3b4116c084…`:

```
--- retention write, 06:11:58            +++ retention write, 06:14:04
-  for (const record of retained) {      +  if (retained.length) {
-    fs.writeFileSync(…, record.stdout); +    const { writeFileAtomicReplace } = require('./kaola-workflow-adaptive-schema');
-    fs.writeFileSync(…, record.stderr); +    for (const record of retained) { for (const stream of ['stdout','stderr']) { … } }
```

One hunk: the write now goes through the atomic replace. **Placement, keying and refusal are
unchanged, and every pin stayed green across the change without an edit** — which is the strongest
evidence I have that they are specified as results and not as methods. All transcripts below are
against `a8fe2a3b`; if the file has moved again, re-run the control.

## The pins

### A — the receipt is byte-unchanged by the flag (`:761-828`)

Two runs of the same deterministic failing command through the real CLI, differing only in
`--keep-output`. Retention destination is **outside** the repo, so the flag is the only axis.

Pinned: `vector_id`, `command_id` and `candidate_digest` equal; the **top-level key set**, the
**`runs[]` key set**, the **`audit` key set** and the **`audit.runs[]` key set** all deep-equal;
every durable byte outside `audit` byte-identical (`canonicalJson` minus `audit` and
`receipt_sha256`); and both receipts still self-verify through `computeReceiptSha256`.

The audit key sets are not padding. An added field there moves **neither** `vector_id` **nor** the
top-level key set, so it is the one placement a `vector_id`-only test cannot see — `mut-A2` exists
purely to prove that assertion is armed.

`receipt_sha256` is excluded from the byte comparison because it binds the audit timestamps, which
legitimately differ between any two runs (already pinned at `:154-155`); the two self-hash
assertions give back what the exclusion costs.

**Non-vacuity is asserted BEFORE the equalities**: the retained artifacts must digest to the
receipt's `stdout_sha256`/`stderr_sha256`. Without that leg every equality is equally satisfied by a
flag that is silently ignored — which is exactly the state the suite was written against.

### B — the bytes land AFTER the last candidate digest (`:977-1027`)

Retention at a **validation-VISIBLE** in-repo location, `--repetitions 2`. Pinned:
`reduction_reasons` contains no `candidate_mutation`, `outcome` is `fail`, `reduction_reasons` is
`[]`, and every `pre_candidate_digest`/`post_candidate_digest` still equals the vector's
`candidate_digest`.

**The arming control runs first and is the reason this pin is worth anything.** At a
validation-invisible location no placement in the loop could ever move the candidate, so the test
would pass against the very implementation it forbids. So before it is used, the location is proven
visible: `isValidationInvisible(...) === false`, then a probe file is written there and
`computeLandableTreeDigest` is proven to **move**, then removed and proven to move **back**.

Runs last in the block, because it is the only leg that writes into the fixture repo.

### C — an existing target refuses, and refuses BEFORE the child runs (`:911-976`)

The clash is created **by running once**, not by the suite guessing a file name — naming-agnostic,
and the operator's actual mistake.

- **Control leg (fresh directory):** the child runs and leaves a mark of its own, the receipt is
  written, bytes are retained. Without this, "the child did not run" below is equally explained by a
  fixture whose child never runs, and a runner that refused unconditionally would pass.
- **Refusal leg (same directory):** exit **2**; the child's mark is **absent** — it refuses before
  execution; no receipt on disk **and** none on stdout; the earlier run's bytes are byte-unchanged;
  the message names `--keep-output` **and** the path of the file it will not overwrite (asserted
  against the artifact names discovered in the control leg, so no naming scheme is frozen).
- Plus the existing **non-directory** destination: exit 2, and the operator's file untouched.

### D — every repetition retained, keyed to the receipt index (`:829-910`)

`--repetitions 3`, with a child that emits a **different line per repetition** (a counter in its own
sandbox `TMPDIR`, which is not the repo). **Arming:** the three per-index digests are asserted
pairwise distinct first — without that, every wrong mapping, reversal included, also passes.

For each `runs[i]`: some retained artifact digests to that index's `stdout_sha256` and another to its
`stderr_sha256` (so both halves survive separately), the artifact's **name carries the index** (a
reader with a red digest can go to the bytes from the index alone), and no two indices claim the same
artifact.

**Empty streams (`:883-910`).** Added because the production file grew a guard for it while I worked
and because it is the commonest shape of item 4's "for every index": a child whose stderr is quiet
must still leave an artifact. "There is no file for run i's stderr" and "run i wrote nothing" are
different diagnoses. Armed by asserting `stderr_sha256 === sha256('')` first.

### What is NOT pinned, and why the naming is not

Nothing in the block names the directory literal, the `run-<index>.<stream>` spelling, or an internal
function. Artifacts are located **by their bytes** — the directory is read and digested — so the
naming scheme stays the implementer's, per `tdd-paths`' model at `:541-545`. The one place a name is
touched is D's keying assertion, and it asserts only that the name **carries the decimal index**,
which is the reader-facing result rather than the scheme.

## Mutation proof

Mutants built in a scratch harness by **copying** the tree (never `git checkout --`/`git stash` —
this worktree is shared). Every replacement asserts its anchor appears **exactly once**, so a
mutation that silently failed to land cannot be mistaken for a test that cannot fail.

| harness | first failure |
|---|---|
| **control** (shipped `a8fe2a3b`) | **exit 0 — `test-validation-runner: PASSED`** |
| **mut-NO905** — `--keep-output` accepted and ignored | `#905: with the flag, the child's stdout is RECOVERABLE … got []` |
| **mut-A1** — destination as a `runs[]` field | `#905: two runs … must produce the SAME vector_id … got "02b82727…" vs "46477aaa…"` |
| **mut-A2** — the same field inside `audit` | `#905: nor does the audit block … got ["retained_output_dir","runs"]` |
| **mut-B** — write moved inside the loop | `#905: … must not make the runner report its own log as a candidate mutation … got reduction_reasons=["candidate_mutation"]` |
| **mut-C1** — overwrite guard removed | `#905: … is a USAGE error … got status=1` (`1 !== 2`) |
| **mut-C2** — guard kept, moved after the run | `#905: and it refuses BEFORE THE CHILD RUNS — the child left no mark this time` |
| **mut-D** — index keying reversed | `#905: … must be locatable FROM THE RECEIPT INDEX … those bytes are in "run-3.stdout"` |
| **mut-E2** — write skipped when the stream is empty | `#905: an empty stream STILL leaves a retained artifact … got ["run-1.stdout"]` |
| **mut-E** — Buffer coercion dropped | **exit 0 — PASSED. See the finding below; not a control.** |

Every mutant reds on **its own** named assertion, not on a neighbour's.

### Baselines

```
RED: #905: with the flag, the child's stdout is RECOVERABLE — some retained artifact digests to the
     receipt's stdout_sha256. This is the whole feature; got []
baseline: a8fe2a3b (shipped file, single-axis: --keep-output accepted and ignored)

RED: #904: a child spawned by `run` MUST be able to bind a unix socket under the sandbox TMPDIR …
baseline: 2018521f (the branch base, verbatim `git show HEAD:`)
```

The **git-HEAD** baseline reds on `tdd-paths`' #904 assertion, which sits earlier in the file and
fires first — an honest red, but it is *their* pin, not mine. `mut-NO905` is therefore the baseline
that matters for this block: the shipped file with **only** the retention mechanism disabled, so the
red is #905's alone. The branch base treats `--keep-output` identically (`parseCli` is permissive and
collects unknown flags — verified), which is what makes the two equivalent for this purpose.

### On environment arming

The runner reads **no `KAOLA_*` variable at all** (`grep -c "KAOLA_" = 0`), so no inherited
environment can switch this mechanism off and there is nothing to pin defensively. What *could* make
the fixture vacuous is checked instead: every leg expecting retention proves the child actually ran
and produced those bytes (digests compared against the receipt's; C's control observes a side effect
the child itself made), and B's location is proven visible to the candidate digest before it is used.

## FINDING — the Buffer coercion is unreachable from the CLI

`kaola-workflow-validation-runner.js` (retention write) reads:

```js
const value = record[stream];
writeFileAtomicReplace(keepOutputFile(keepOutputDir, record.index, stream),
  Buffer.isBuffer(value) ? value : Buffer.from(String(value)));
```

with the comment that without the coercion, an empty string would compare equal to the `''` read back
from a missing file and "silently leave no file at all for an empty stream".

**The condition never fires on the shipping path.** `defaultExecute` already returns both streams as
Buffers (`stdout: Buffer.isBuffer(result.stdout) ? … : Buffer.from(…)`), so through the CLI `value`
is *always* a Buffer, `writeFileAtomicReplace`'s `existing === content` early return cannot match a
Buffer against a string, and the empty stream is written either way. **Measured, not read:** `mut-E`
removes the coercion entirely and the whole suite still passes — and the empty-stream artifact is
still produced (0 bytes, `e3b0c442…`).

The coercion is load-bearing only for a caller that injects an `execute` adapter returning **string**
streams, which is a path only tests use. I did **not** write a pin for it: pinning a guard that
defends a test-only path would freeze machinery no shipping caller reaches. The behaviour that
matters — an empty stream still leaves an artifact — **is** pinned, and is armed by `mut-E2`, which
is the same claim's behavioural mutant. **Routing this to the orchestrator as a judgement call, not
fixing it**: it is three words of dead defence, harmless, and removing it is a production edit.

## Not pinned, deliberately

1. **The `kaola-workflow/archive/**` band refusal.** `impl-runner` flagged it as *"one step past the
   question I was asked … trivially removable if the orchestrator disagrees."* Pinning a mechanism
   whose existence is still an open question builds exactly the trap this project's custody rule
   names — a test that has to be repaired ahead of the mechanism it pins. **Ask the owner first; I
   will pin it in one leg the moment it is settled.** It is measurably present today (`impl-runner`'s
   D4 transcript), so nothing is lost by waiting.
2. **That a destination inside tracked `kaola-workflow/**/.cache/` is permitted.** Decision (c) is a
   values call about the operator's own repo history (axiom 4), not a fact. A pin here would freeze
   the owner's answer before they gave it.
3. **Non-darwin behaviour.** The block is guarded `process.platform !== 'win32'`, following the #904
   precedent. I measured on darwin only.

## Artifacts

`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-f33f-4c74-8c66-4434a7ea9c6d/scratchpad/tdd-keepoutput/`
— `build-mutants.js` (every mutation anchored and asserted), `harness/{control,baseline,mut-*}/`,
`probe.js` and `probe-empty.js` (the fixture-assumption probes run before anything was frozen).
Nothing tracked; nothing written outside the scratchpad and the two files named above.

---

# Round 2 — the three post-review behaviours

**All three pinned, each mutation-proven with a positive control. The original four still hold,
unchanged, against the final bytes.** Canonical is `41c0fd483ca91865…`; every transcript below is
against those bytes, and the `a8fe2a3b` transcripts above are superseded.

- **Where:** `scripts/test-validation-runner.js:1029-1206`, appended to the same block.
  E `:1029-1089` · F `:1090-1157` · G `:1158-1206`. Still purely additive — `git diff --stat` on the
  file is **675 insertions(+), zero deletions**.
- **Suite:** `node scripts/test-validation-runner.js` → **exit 0**, `PASSED`, 5.8s (was 4.6s).
- **No production file touched, no seam added.** One line was added to my own pin A (`:768`) to
  capture the retention file name **by measurement**, which E needs; nothing else in the original
  block changed.

## The original four: unchanged and still green

Re-run against `41c0fd48` **before** writing anything new: `PASSED`, exit 0, with the block exactly
as round 1 left it. **Nothing needed adjusting.** A, B, C and D survived two production rewrites —
the atomic-replace change and this one — without an edit, which is the payoff for pinning results
rather than methods. Concretely:

- **C still passes and still means what it meant.** Its clash is created by *running once, then
  running again*, so it never named a file or a mechanism. Under the old code that second run was
  refused by a per-file `statSync` sweep; under the new code it is refused by the exclusive `mkdir`.
  Same result, same assertion, different machinery underneath.
- **C's message assertion is the one that bit.** `impl-runner` reports its first version of the new
  refusal named only the directory, and my `:960-962` leg requires it to name the **file** it will not
  overwrite; the suite went red and they changed the message rather than the test. That is the
  custody split working in the direction it is supposed to.
- The mutant set was rebuilt from scratch against `41c0fd48`: `mut-C1` is now "the destination is
  adopted, not created", since the per-file pre-check it used to remove no longer exists. `mut-E`
  (round 1's recorded negative result) is **retired** — the dead Buffer coercion it attacked is gone,
  and the shipped comment now explains why the Buffers make it unnecessary. The round-1 finding was
  acted on.

## E — the write-time refusal (`:1029-1089`)

**Pinned against the window, not the check.** The validated command creates a retention file *while
it runs*; a write that trusts only the pre-flight clobbers it with exit codes identical to a clean
retention.

The collision name is **discovered, never spelled**: `:768` captures the name that carried stdout in
pin A, from a real run, and E's child is generated with that name baked in. So E pins the window
without freezing `run-<index>.<stream>` anywhere.

Asserted: exit **2**; the command's artefact **byte-intact**; **no receipt**; and the refusal **names
the file** it would have written over.

**Positive control, one axis:** a command that writes a name retention does *not* use is retained
normally (exit 1, this run's own output recoverable, the command's file intact). Without it, a runner
that refused whenever the destination was non-empty at write time would pass every assertion above
while making retention unusable for any command that writes beside its own logs.

## F — two runners, one destination (`:1090-1157`)

Two `run` invocations launched with `spawn` and awaited together, each with a 300 ms command so the
loser refuses **while the winner is still executing**. Which one wins is a race and is not the
property, so nothing assumes a winner: exactly one exits 0 and exactly one exits 2, and the winner is
identified from the exit codes.

Asserted: exactly one proceeded, exactly one refused; the winner's receipt exists and the loser's
does not; the winner's command ran and **the loser's never started**; the surviving bytes match the
**winner's own receipt** digests; and **not one byte** of the loser's marker is in the directory.

## G — the directory contract (`:1158-1206`)

An **existing** directory is a usage error **even when empty**. Asserted: exit 2, the command did not
run, no receipt, and **nothing written into the directory it declined**.

**Positive control:** a destination whose *parents* do not exist is created and retained normally.
The rule is about the leaf existing, not about the path being deep — without this leg the assertion
above is equally satisfied by a runner that refuses every path it did not already find.

## Mutation proof

Rebuilt by **copying** the tree; every anchor asserted to appear exactly once.

| harness | suite exit | first failure |
|---|---|---|
| **control** (`41c0fd48`) | **0** | `test-validation-runner: PASSED` |
| **mut-E1** — write-time `lstat` refusal removed | 1 | `#905: a retention file created BY THE VALIDATED COMMAND, during the run, is refused at the moment of writing` |
| **mut-G1** — an existing EMPTY directory adopted again | 1 | `#905: of two runs aimed at ONE destination, exactly one proceeds; got exits [["A",0],["B",0]]` |
| **mut-PRE** — both guards gone (**the state review found**) | 1 | `#905: pointing --keep-output at a directory that already holds retained output is a USAGE error` |
| mut-NO905 · A1 · A2 · B · C1 · C2 · D · E2 | 1 | each on its own round-1 assertion, all re-verified against `41c0fd48` |

**Twelve harnesses, control green, eleven mutants red.** Run serially, one at a time.

### Per-pin arming, measured directly

`mut-G1` reds at **F**'s first assertion rather than G's, because F precedes G in file order **and
the two rest on one mechanism**: adoption is exactly what lets a second runner in, so no mutant can
separate them. Rather than reorder the suite to flatter a transcript, each mutant was driven through
the real CLI against all three forbidden outcomes:

```
                    G: existing EMPTY dir        E: command creates run-1.stdout   F: two concurrent runs
control      exit=2, cmd not run, nothing     exit=2, artefact INTACT            exits [A=2, B=0]  exactly one
mut-E1       exit=2, cmd not run, nothing     exit=1, *** DESTROYED ***          exits [A=0, B=2]  exactly one
mut-G1       exit=1, cmd RAN, files written   exit=2, artefact INTACT            exits [A=0, B=0]  *** BOTH ***
mut-PRE      exit=1, cmd RAN, files written   exit=1, *** DESTROYED ***          exits [A=0, B=0]  *** BOTH ***
```

`mut-E1` produces **only** E's forbidden outcome and `mut-G1` **only** G's and F's — clean isolation.
`mut-PRE` reproduces all three, which is the reviewed defect end to end.

**A second-order confirmation worth recording.** Under `mut-G1` both concurrent runs exit **0** — the
write-time `lstat` does *not* save them, because two runs reaching their write phase together both
`lstat` before either renames. That is the TOCTOU `impl-runner` named as residual, and it is direct
evidence for their claim that the write-time check is *"sound rather than racy because of"* the
exclusive `mkdir`. The two guards are not redundant: neither is sufficient alone.

## FINDING — the write-time refusal can leave a PARTIAL retention, and says it did not

Measured on the shipped `41c0fd48`, through the real CLI. Retention writes `stdout` before `stderr`
for each index, and the refusal is per-file inside that loop. So **which** file the command collides
with changes the outcome:

```
command creates the STDOUT carrier   -> exit 2, directory holds ONLY the command's file      (clean)
command creates the STDERR carrier   -> exit 2, directory holds:
     run-1.stdout = "COLLIDE OUT"                 <-- THIS RUN's retained stdout, written
     run-1.stderr = "IRREPLACEABLE CHILD ARTEFACT" <-- the command's own file
```

The refusal message states *"Nothing was overwritten and no retained output was written for this
run."* The first half is true. **The second half is false in the second case** — `run-1.stdout` is
this run's genuine retained output and it is on disk.

Why it matters rather than being cosmetic: the directory now reads as a *complete* retention — both
expected names present — while one of the two files is the command's, not retention's. An operator
who trusts the message discards a file that is real; one who does not read it reads the command's
artefact as this run's stderr. That is the same false-diagnosis class the refusal exists to prevent,
reached by a different route.

**Not pinned, deliberately.** The fix is a production change (check every target before writing any,
or delete what was written on refusal), and which of those to take is the implementer's call. I pinned
only what is invariant across both orderings — exit 2, the command's artefact byte-intact, no receipt,
the file named — so the pins stay green under either fix. **Routing this, not fixing it.**

## Still not pinned, unchanged from round 1

1. **The `kaola-workflow/**/archive/**` band refusal** — still flagged by the implementer as removable
   if the orchestrator disagrees; pinning it would build the trap the custody rule names.
2. **That a destination inside tracked `kaola-workflow/**/.cache/` is permitted** — a values call.
3. **`lstat` vs `stat` at write time.** The implementer chose `lstat` so a planted symlink counts as
   an occupant. The two differ only for a **dangling** symlink, and in that case `writeFileAtomicReplace`
   renames over the link entry rather than following it, so nothing outside the directory is
   destroyed either way. No pin, because I could not construct a case where the choice changes a
   destructive outcome. Recorded so the reasoning is not re-derived.
4. **Non-darwin.** The block is guarded `process.platform !== 'win32'`; measured on darwin only.

---

# Round 3 — the band pin, and the partial-write fix pinned

**All transcripts in this section are bound to `37b7dcb4252bd01c`.** The runner moved again while I
worked (`41c0fd48` → `37b7dcb4`, the partial-write fix landing); every number below is from a rebuild
against those bytes, and the round-2 transcripts are superseded. Final control re-run at the end
confirms the hash had not moved again.

- **Where:** band pin at `scripts/test-validation-runner.js:1221-1273`; the both-orderings leg
  folded into E at `:1051-1082`. **744 insertions(+), zero deletions** on the file.
- **Suite:** `node scripts/test-validation-runner.js` → **exit 0**, `PASSED`, 6.5s.
- **No production file touched, no seam added.**

## The seven previous pins: all still hold

Re-run against `37b7dcb4` **before** writing anything: `PASSED`. The partial-write fix — every target
`lstat`-checked before any is written, in two passes — changed none of them. That is the third
production rewrite these pins have survived without an edit.

## H — the durable archive band (`:1221-1273`)

Now pinned rather than deferred, on your ruling.

Asserted: exit **2**; the command **did not run**; **no receipt**; and **nothing was created inside
the band** — the band directory is listed after the refusal and must be exactly as it was.

**Positive control, one path segment.** The same invocation at
`kaola-workflow/notarchive/old-run/logs` is retained normally, command runs, output recoverable.
Without it the refusal assertion is equally satisfied by a runner that refuses any destination under
`kaola-workflow/`, or any destination inside a git working tree at all.

I chose `notarchive/` rather than a `.cache/` sibling deliberately: it isolates the band boundary in
one segment **without** incidentally freezing decision (c) — whether a tracked
`kaola-workflow/**/.cache/` destination is permitted — which you have not ruled on and which stays
recorded-not-pinned below.

```
RED: #905: a retention destination inside the durable archive band is a usage error;
     got status=1 stderr=""
mutant: mut-H1 (the band guard removed)   baseline: 37b7dcb4
```

Driven through the real CLI, the mutant does exactly what the pin forbids:

```
control   -> exit=2 | command ran: false | inside the band now: ["kaola-workflow/archive/old-run"]
mut-H1    -> exit=1 | command ran: true  | inside the band now: ["kaola-workflow/archive/old-run",
                                            ".../logs", ".../logs/run-1.stderr", ".../logs/run-1.stdout"]
```

Three entries added to tracked, closed evidence — permanent history, and the stray directory the
closure audit reads as a phantom project.

## The partial-write fix, pinned (`:1051-1082`)

**Beyond the two items you asked for — say the word and I will drop it.** My reasoning for adding it:
the fix landed while I was working, it is squarely inside pin E's subject, and leaving it unpinned
recreates the exact situation this engagement exists to correct — a behaviour that ships with no
coverage and regresses silently.

E's acceptance now runs over **both carriers**, discovered by measurement (`:768-769` captures the
names that carried stdout and stderr in pin A), with one assertion added: after a write-time refusal
the directory holds **exactly** the command's artefact — not one stream of this run's, and no
temporary residue. That is the invariant that was false before the fix and is true in every ordering
now, and it holds under either remedy (refuse-before-any-write, or unwind-on-refusal).

```
RED: #905: NOTHING of this run reached the directory — not one stream, and no temporary residue …
     Collision on "run-1.stderr"; directory holds ["run-1.stderr","run-1.stdout"]
mutant: mut-PARTIAL (check-and-write collapsed back into ONE pass)   baseline: 37b7dcb4
```

It fires on the **stderr** carrier — the later of the two — which is the ordering the defect needed,
and passes on the stdout carrier in the same loop. That asymmetry is why both are exercised.

## Full matrix — 14 harnesses, control green, 13 mutants red

Rebuilt by **copying** the tree against `37b7dcb4`; every anchor asserted to appear exactly once; run
serially, one at a time.

| mutant | first failure |
|---|---|
| **control** | **exit 0 — `test-validation-runner: PASSED`** |
| **mut-H1** — band guard removed | `#905: a retention destination inside the durable archive band is a usage error; got status=1` |
| **mut-PARTIAL** — one-pass check-and-write | `#905: NOTHING of this run reached the directory … holds ["run-1.stderr","run-1.stdout"]` |
| mut-NO905 · A1 · A2 · B · C1 · C2 · D · E1 · E2 · G1 · PRE | each on its own assertion, all re-verified against `37b7dcb4` |

`mut-E2`'s anchor moved to the deferred write loop and `mut-PRE`/`mut-E1` still target the `lstat`
block; all rebuilt, none silently no-ops (the builder asserts every anchor matches exactly once).

## Recorded, not pinned — unchanged

1. **`lstat` vs `stat` at write time.** Kept exactly as recorded, per your instruction: the two differ
   only for a **dangling** symlink, and `writeFileAtomicReplace` renames over the link entry rather
   than following it, so no destructive outcome turns on the choice.
2. **Decision (c)** — whether a destination inside tracked `kaola-workflow/**/.cache/` is permitted.
   Still a values call, still unruled, and H's control was sited to avoid freezing it by accident.
3. **Non-darwin.** Block guarded `process.platform !== 'win32'`; measured on darwin only.

**Final control:** re-run after all of the above — runner `37b7dcb4252bd01c`, suite `PASSED`, exit 0.
