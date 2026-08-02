# impl-runner — #904 sandbox path budget · #905 `--keep-output` · #910 export

**Verification tier: `tests-green`** (the authored suite passes) — with the caveat stated in
"What a green here does and does not prove".

Both premise reports HELD at every point I edited. I re-measured the load-bearing numbers myself
rather than inheriting them, and they reproduced exactly.

- **One production file**, ×4 byte-identical copies: `scripts/kaola-workflow-validation-runner.js`
  and the three `plugins/*/scripts/` copies.
- **110 insertions / 5 deletions**, 1516 → 1621 lines.
- **Final hash, all four identical**: `892a19d7ff501b44fd49c403792680f5d5fcb260d35b8a7dac8c63f248e897c3`
  (baseline was `992fad7193324f203d139bae4357bba080e70566190515565df61ac9627db2e7`).
- **No test file touched.**
- **Three files outside my write set were changed as a side effect of `npm run sync:editions`** —
  see "Read this first".

---

## READ THIS FIRST — two things that are not about my change

### 1. `npm run sync:editions` also propagated a sibling agent's adaptive-schema edit

I ran `npm run sync:editions` twice (once per edit round). The **second** run reported six files,
not three:

```
byte-sync  plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js
byte-sync  plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
byte-sync  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
byte-sync  plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
edition-sync: write complete (6 file(s) updated).
```

Between my two runs another agent edited `scripts/kaola-workflow-adaptive-schema.js` (93 insertions,
10 deletions) without yet propagating it. `edition-sync --write` step (c) resolves drift for **every**
`BYTE_IDENTICAL_GROUPS` member, so it carried their canonical file out to the three edition copies.

**Direction verified — I propagated, I did not revert.** Canonical is untouched by me:

```
439d6bad2f1e2aec2a0feb6b4623035c57228f808537ac97285702fd6fbccfce  scripts/kaola-workflow-adaptive-schema.js
439d6bad2f1e2aec2a0feb6b4623035c57228f808537ac97285702fd6fbccfce  plugins/kaola-workflow/scripts/…
439d6bad2f1e2aec2a0feb6b4623035c57228f808537ac97285702fd6fbccfce  plugins/kaola-workflow-gitlab/scripts/…
439d6bad2f1e2aec2a0feb6b4623035c57228f808537ac97285702fd6fbccfce  plugins/kaola-workflow-gitea/scripts/…

$ git diff --stat -- scripts/kaola-workflow-adaptive-schema.js
 scripts/kaola-workflow-adaptive-schema.js | 103 +++++++++++++++++++++++++++---
 1 file changed, 93 insertions(+), 10 deletions(-)     <-- unchanged, still entirely theirs
$ git diff -- scripts/kaola-workflow-adaptive-schema.js | grep -c "SANDBOX_\|keep_output\|keepOutput"
 0                                                      <-- none of my tokens in it
```

Canonical was and remains their bytes; the editions now equal canonical. Nothing was lost. But **if
their edit was mid-flight, its edition copies are now published at that mid-flight state**, and that
is a fact they should know rather than discover. I did not choose this and cannot avoid it —
`sync:editions` is the mandated propagation command and it is not scoped to one group.

### 2. `validate-script-sync.js` was RED for a window, for a reason that is not mine

Between my two sync runs it exited 1:

```
Out of sync (scripts/ vs plugins/kaola-workflow/scripts/):
  - adaptive-schema kernel copies (cross-edition drift anchor): plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js differs from scripts/…
  - adaptive-schema kernel copies (cross-edition drift anchor): plugins/kaola-workflow-gitlab/scripts/… differs from scripts/…
  - adaptive-schema kernel copies (cross-edition drift anchor): plugins/kaola-workflow-gitea/scripts/… differs from scripts/…
```

Zero runner copies named (`grep -c "validation-runner"` on the failure output = **0**). It is green
again now. Recording it because a later agent seeing a red sync validator should not attribute it to
the runner.

---

## GOAL 1 — #904: the sandbox root overflows `sun_path`

### Premise re-measured independently, before editing

I did not take the report's numbers on trust. My own `net.createServer().listen()` sweep at
controlled path lengths under a short base:

```
100 OK   101 OK   102 OK   103 OK   104 OK
105 FAIL EINVAL   106 FAIL EINVAL  …  110 FAIL EINVAL
os.tmpdir() = /var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T len 48
```

**104 binds, 105 is the first EINVAL; `os.tmpdir()` is 48 characters.** Identical to premise-904.
Budget: `104 − 48 − 4 ("/tmp") − 19 ("/tsx-501/12345.pipe") = 33` for `/<dir>/<seed>`, i.e.
`len(dir) + len(seed) <= 31`.

### The change

| file:line | change |
|---|---|
| `:12-28` | new module constants `SANDBOX_DIR_NAME = 'kwv'` and `SANDBOX_SEED_HEX = 16`, with the budget derivation as a comment |
| `:193-194` | the **unseeded twin** in `buildScrubbedEnvironment` — `'kaola-workflow-validation'` → `SANDBOX_DIR_NAME` |
| `:743-744` | `defaultSandboxPaths` — seed `.slice(0, SANDBOX_SEED_HEX)` and `SANDBOX_DIR_NAME` |

Both sites changed, as the brief required. The literal `'kaola-workflow-validation'` as a directory
name is now **absent from all four copies** (`git grep` returns only the *filename* form).

I used a named constant rather than three literals specifically because this defect's failure mode is
half-application: the constant makes it impossible to move one site and not the other.

### Achieved: the bind succeeds through the real CLI

A/B, single axis = the runner file. Pre-fix leg runs from a **scratch mirror of git HEAD**
(`git show HEAD:… > scratchpad/before/…`, hash `992fad71…`) — never `git checkout --`, which would
have destroyed sibling agents' work in this shared worktree.

```
=============== LEG A — PRE-FIX runner (git HEAD, scratch mirror) ===============
EXIT=1
outcome: fail | exit_code: 1 | reduction_reasons: []

=============== LEG B — POST-FIX runner (the change) ===============
EXIT=0
outcome: pass | exit_code: 0 | reduction_reasons: []
```

The child's own report of the path it bound, retained via the new `--keep-output` (so #905 is what
makes #904's fix legible — that is not a coincidence, it is the point):

```
sandbox TMPDIR=/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kwv/c6dd75f95e0f96ba/tmp len=73
pipe=/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kwv/c6dd75f95e0f96ba/tmp/tsx-501/66515.pipe len=92
BIND OK
```

**92 of 104 — 12 characters spare**, exactly the target shape. Side by side with the pre-fix shape
over the same policy and repo:

```
PRE-FIX  TMPDIR len=143  pipe len=162  (limit 104)  EINVAL
POST-FIX TMPDIR len= 73  pipe len= 92  (limit 104)  BINDS
```

Note the post-fix seed `c6dd75f95e0f96ba` is character-for-character the prefix of the pre-fix seed
`c6dd75f95e0f96bad25c66831a85d9f380c7ff155942fd768768100bd7cbe934` — the same deterministic digest,
truncated, which is the property the fix had to keep.

### Determinism control

The socket probe prints its own pid, so it is a poor determinism fixture (`vector_id` moves because
`stdout_sha256` moves — a property of the probe, not the fix). Re-run with a deterministic-output
command:

```
command_id STABLE: true d33c24448e7d713bcb38b01c35a0884621943b380c73491536c114426f35f244
vector_id  STABLE: true 4622ea2d481fb3e42e1b3295ec813e7ceeff7e099891150c77adc596adff3174
```

With the pid-printing probe, `command_id` is still stable (`8ff94fa9b54be61d…` both runs) and only
`vector_id` moves. Both results are reported because the first one alone would read as a partial
failure and is not.

### Mutation proof — BOTH halves are load-bearing

Mutants built in the scratchpad from the shipped file; each mutation asserted to have applied.

| mutant | shape | pipe len | result |
|---|---|---|---|
| **M1** long dir literal + 16-hex seed | `kaola-workflow-validation/c6dd75f95e0f96ba` | **114** | `outcome: fail`, `BIND FAIL EINVAL` |
| **M2** `kwv` + full 64-hex seed | `kwv/c6dd75f95e0f96bad25c…be934` | **140** | `outcome: fail`, `BIND FAIL EINVAL` |
| shipped | `kwv/c6dd75f95e0f96ba` | **92** | `outcome: pass`, `BIND OK` |

**M1 is the important one**: it is precisely the "just shorten the seed" fix, and it still fails at
114. premise-904's central correction is confirmed by execution, not arithmetic.

### Known consequence (unchanged from premise-904 constraint 7)

`command_id` / `vector_id` / `receipt_sha256` move for any given policy, because `sha256(HOME)` and
`sha256(TMPDIR)` are in the identity chain. Nothing in-repo compares them across commits, but an
inherited `{command_id, required_pass_vector_id}` obligation from before this change is invalidated.
**This owes a `CHANGELOG.md` line, which is not my file** — routed below.

---

## GOAL 2 — #905: `--keep-output <dir>`

Implemented as the owner ruled: opt-in flag, **no receipt field**, receipt shape untouched.

| file:line | change |
|---|---|
| `:754-782` | derivation comment for the whole mechanism |
| `:784-786` | `keepOutputFile(dir, index, stream)` — the one place the naming lives |
| `:788-820` | `prepareKeepOutput(keepOutput, repetitions)` — band check, non-directory check, overwrite check, mkdir |
| `:832-833` | `runValidation` calls it **before anything executes**; `retained` buffer |
| `:898` | in-loop: buffer only, never write |
| `:919-925` | after the loop: write raw bytes |
| `:1537` | `main` threads `values.keep_output` |
| `:1505-1514` | `usage()` |

### The decisions the investigation left to me

**(a) `--repetitions 2..5` → one file or N? Named how?**
→ **`<dir>` is always a DIRECTORY; files are `run-<index>.stdout` / `run-<index>.stderr`.**

Uniform at every repetition count, so one run and five runs have the same shape and no operator has
to learn a special case. `<index>` is deliberately the **same index the receipt's `runs[]` carries** —
that keying is the entire value of the feature, because it is what maps a red run's digest back to
the bytes that produced it. Proven, not asserted:

```
sha256(run-1.stdout) === receipt stdout_sha256 : true 1b2015c0e3af4c9a9c0fb311a5ced94f08ec052177b0ca483baa095694c24faa
sha256(run-1.stderr) === receipt stderr_sha256 : true 929f66f18a51bbef2b9172fc818e1b19424a865f1f1eea340a0340712237b046
```

Streams stay in two files rather than interleaved: both halves of a failure are usually needed and
merging them loses which was which.

```
$ … run --repetitions 3 --keep-output …
EXIT=1
run-1.stderr  run-1.stdout  run-2.stderr  run-2.stdout  run-3.stderr  run-3.stdout
receipt runs[].index: 1,2,3 | outcome: fail
```

**(b) Overwrite, refuse, or append on an existing path?**
→ **Refuse, and refuse UP FRONT, before the child runs.**

Appending merges two runs into one blob. Overwriting destroys a prior run's evidence. Worst of all,
a stale file read as this run's output is a *false diagnosis* — strictly worse than the
no-diagnosis state #905 is fixing. So an existing target file is a usage error.

It is checked before execution for the same reason `record` checks its `--output` before writing: a
refusal arriving after a 27-minute suite would throw away the run it was meant to explain.

```
=== D2: re-run into the SAME directory -> REFUSES ===
validation-runner: --keep-output must not overwrite retained output, and …/logs-reps/run-1.stdout
already exists — an earlier run's bytes read as this run's are a false diagnosis. Point
--keep-output at a fresh directory, or remove the earlier files deliberately.
EXIT=2
  files intact:  75 …/logs-reps/run-1.stdout
  no receipt written - refused BEFORE the child ran

=== D3: --keep-output at an existing NON-directory -> refuses ===
validation-runner: --keep-output names the DIRECTORY the retained streams are written into, and
…/notadir already exists and is not a directory.
EXIT=2
```

**(c) Permit a path inside the tracked `kaola-workflow/**/.cache/`?**
→ **Yes, permitted — except the durable archive band `kaola-workflow/archive/**`, which is refused.**

Two separate questions, and I answered them differently on purpose.

*Tracked `.cache/` generally: permitted.* The owner's ruling — opt-in rather than always-on — **is**
the consent mechanism. The operator naming a destination inside their own tracked tree is exercising
exactly the choice the flag exists to give them; refusing it would be me overriding an explicit
instruction on a matter of their own repo's history, which is a value call and not mine (axiom 4).
Retaining logs beside a run's own evidence is also the legitimate primary use. What I owe instead is
that the exposure is **stated where the operator reads it**, which `usage()` now does: *"Retained
bytes have absolute paths redacted and NOTHING ELSE, so a secret the child echoes is retained
verbatim."*

*The archive band: refused.* This is not a value call, it is the defect this file already documents
at `:1151-1166` — `kaola-workflow/archive/**` holds closed evidence, and the closure audit reads a
stray directory there as a phantom project missing its `workflow-state.md`: permanent drift with
nothing to repair. My new flag must not open a fresh route to it. Reuses the file's existing
`owningWorkingTree` / `isArchiveBandPath` helpers rather than adding a parallel notion.

```
=== D4: --keep-output inside kaola-workflow/archive/** ===
validation-runner: --keep-output must not resolve inside the durable archive band
(kaola-workflow/archive/**) — an archived run's evidence is closed, never a write target;
…/fixture/kaola-workflow/archive/old-run/.cache/logs is inside it. Retain the output somewhere
outside the band.
EXIT=2
  nothing created in the band
```

I am flagging the band refusal explicitly because it is one step past the question I was asked. It is
three lines, reuses existing helpers, and is trivially removable if the orchestrator disagrees.

**(d) Truncation cap?**
→ **None added.**

`MAX_OUTPUT_BYTES` (16 MiB) already bounds a *completed* run's output — exceeding it SIGTERMs the
child into `outcome: "inconclusive"`, so oversized output never reaches retention at all. A cap here
would delete the **tail** of a failure, which is usually the part naming the cause, and premise-905
records that the real red-suite size distribution is unmeasured, so any threshold would be drawn from
the wrong sample. Adding new code to make diagnosis worse against a bound that already exists is not
a trade worth making. Worst case is `2 × 16 MiB × 5 reps` in a directory the operator explicitly
named.

### The hazard I had to design around, which no report flagged

**A write landing in the repo mid-loop reports the runner's own log as `candidate_mutation`.**

The repetition loop takes a candidate digest before and after every repetition and `reduceRuns`
compares both against the vector's. So retention had to be **buffered and written after the last
digest is taken** — the only placement that holds for a path *anywhere* in the tree, rather than only
in the validation-invisible bands.

Verified with the log directory at a path that is genuinely validation-**visible**:

```
=== D5: --keep-output INSIDE the repo, validation-VISIBLE path, repetitions 2 ===
EXIT=1
  outcome: fail | reduction_reasons: []
  pre/post candidate digests all equal vector candidate: true
  isValidationInvisible('logs-inrepo/run-1.stdout') = false      <-- visible, and still clean
```

**Mutation proof M3** — the same code with the write moved back inside the loop, same fixture:

```
  outcome: inconclusive | reduction_reasons: ["candidate_mutation"]
  ^ the shipped code on the same fixture: outcome fail, reduction_reasons []
```

**Mutation proof M4** — overwrite guard removed:

```
  before: EARLIER RUN EVIDENCE - MUST SURVIVE
  after : IMPL905_STDOUT: assertion 7 of 9 failed
  -> earlier evidence destroyed: YES
```

### Achieved: the receipt is provably unchanged by the flag

Real failing command through the real CLI, twice, differing only in `--keep-output`:

```
--- receipt equality, --keep-output absent vs present ---
vector_id equal          : true 4622ea2d481fb3e42e1b3295ec813e7ceeff7e099891150c77adc596adff3174
command_id equal         : true
outcome                  : fail / fail
field set identical      : true
runs[0] field set        : ["execution_error_sha256","execution_identity_digest","exit_code",
                            "failure_signature_sha256","index","post_candidate_digest",
                            "pre_candidate_digest","signal","stderr_sha256","stdout_sha256","timed_out"]
no new receipt field     : true
BYTES EQUAL (minus audit): true
  bytes A = 2753  bytes B = 2753
receipt_sha256 differ (audit timestamps, as always): true
self-hash still verifies : A true | B true
```

`runs[0]` carries the same eleven fields it always did. `receipt_sha256` differs between *any* two
runs because `audit` holds timestamps — that is pre-existing and is what
`test-validation-runner.js:154-155` already pins.

And the content #905 exists for, previously discarded:

```
--- run-1.stdout ---            --- run-1.stderr ---
IMPL905_STDOUT: assertion 7 of 9 failed        IMPL905_STDERR: Error: boom at line 42
  expected: alpha
  actual:   beta
```

---

## GOAL 3 — #910: export `resolveRecordFolder`

`:1619` — added to `module.exports`. **Behaviour untouched**; the function body, its `schema`
injected parameter and the module's Node-builtins-only top-level requires are all unchanged.

```
before count: 29  after count: 30
ADDED  : [ 'resolveRecordFolder' ]
REMOVED: []
typeof resolveRecordFolder: function | arity: 3

live folder : {"dir":"…/rrf/kaola-workflow/proj-x","root":"…/rrf","mainResident":false,"searched":["…/rrf/kaola-workflow/proj-x"]}
absent      : {"dir":null,"root":"","mainResident":false,"searched":["…/rrf/kaola-workflow/proj-none"]}

--- top-level requires in MY file (unchanged) ---
:4 crypto  :5 fs  :6 os  :7 path  :8 child_process
```

Its in-file consumer, the `record` verb, still works end-to-end: `outcome: "recorded"`, exit 0.

`validate-workflow-contracts.js:905-908` checks a **subset** of seven names, so an additive export
breaks nothing.

### A decision I made and then reversed — recorded because the reversal is the finding

I initially also exported `defaultSandboxPaths`, reasoning the test author had no other seam to pin
the path budget with. **That reasoning was wrong, and their work proved it.** They pinned the
*result* — a child spawned by `run` can bind a socket — end-to-end through the CLI, and wrote at
`test-validation-runner.js:541-545`:

> *"WHAT IS PINNED IS THE RESULT … and NOT the shape that achieves it. The directory literal, the
> seed width, and whether the seed is a digest at all are the implementer's; a pin on `kwv` or on 16
> hex would rot the moment either moved for a reason having nothing to do with this defect."*

That is `docs/conventions.md`'s *specify the result, never the method*, and it is better than what my
export would have enabled. I removed the export. **The shipped file exports exactly the one function
the brief asked for**, and no speculative one.

---

## Verification

| command | before | after |
|---|---|---|
| `node scripts/test-validation-runner.js` | **0** `PASSED` | **0** `PASSED` |
| `node scripts/validate-script-sync.js` | **0** | **1 — and NOT because of my file.** See below. |
| `node scripts/validate-workflow-contracts.js` | — | **0** `Workflow contract validation passed` |
| `node scripts/validate-kaola-workflow-contracts.js` | — | **0** `Kaola-Workflow Codex contract validation passed` |
| `node scripts/test-finalize-door.js` | — | **0** `finalize-door tests passed (233 assertions)` |
| `node scripts/test-validate-script-sync.js` | — | **0** `59 assertions; 1 canonicalOnly exclusions machine-guarded` |
| `node scripts/test-install-manifest-single-source.js` | — | **0** `PASSED` |
| `shasum -a 256` ×4 runner copies | 1 unique hash `992fad71…` | 1 unique hash `892a19d7…` |
| `node --check` | — | clean |

### `validate-script-sync.js` exits 1 at hand-off — stated plainly

It is **red as I finish**, and I am not going to dress that up. The cause is a *different* sibling
agent's un-propagated file each time I look:

```
$ node scripts/validate-script-sync.js
Out of sync (scripts/ vs plugins/kaola-workflow/scripts/):
  - kaola-workflow-run-chains.js
$ node scripts/validate-script-sync.js 2>&1 | grep -c "validation-runner"
0
```

`scripts/kaola-workflow-run-chains.js` is modified in the worktree (the #910 run-chains half) and its
edition copies are not yet synced. **Zero runner copies are named**, and my four are byte-identical
at `892a19d7…` (`shasum … | sort -u` → exactly one hash).

**I deliberately did not run `npm run sync:editions` a third time to clear it.** Doing so would
publish that agent's in-flight run-chains work to three edition trees without their knowledge — which
is exactly the side effect I already caused once with the adaptive-schema and do not intend to repeat.
The correct owner of that propagation is whoever is editing `run-chains.js`, once they are done.

**This means the bundle's sync gate is not green at hand-off and someone must run `sync:editions`
after the last edit to this worktree lands.** It is not a defect in my change, but it is not
somebody else's problem to *discover* either.

`simulate-workflow-walkthrough.js` was **not** run: it has **0** references to the runner
(`git grep -c` on the walkthrough = 0), so it does not reach this change. The seven suites above are
every file in `scripts/` that references the runner, plus `node --check`.

### What a green here does and does not prove

At the moment I started, `test-validation-runner.js` **did not exercise the `run` subcommand at all**
— a green then proved nothing about either goal. That has changed under me: the test author landed
141 lines of first-ever `run` coverage for #904 while I worked, and my final green is against that.

I mutation-proved **their** pin rather than trusting it — copied their suite plus a mutant runner
into an isolated scratch harness:

```
=== CONTROL: the suite against the SHIPPED file, same harness shape ===
test-validation-runner: PASSED     exit 0

=== m1 (long dir literal): the suite against the MUTANT ===
  exit=1
AssertionError: #904: a child spawned by `run` MUST be able to bind a unix socket under the sandbox TMPDIR…

=== m2 (full 64-hex seed): the suite against the MUTANT ===
  exit=1
AssertionError: #904: a child spawned by `run` MUST be able to bind a unix socket under the sandbox TMPDIR…
```

**Their #904 pin is armed** — positive control green, both negative controls red.

**#905 has NO test coverage.** `git grep "keep_output\|keepOutput\|keep-output"` over
`scripts/test-validation-runner.js` returns nothing. Everything I show for #905 above is my own
measurement, not a suite. Every one of those behaviours — the directory shape, the index keying, the
overwrite refusal, the band refusal, the after-the-loop placement, and above all the receipt-bytes
equality — is currently unpinned and will silently regress. **This is the largest open gap in the
work and it needs routing to the test author.**

---

## What I could NOT do, and what I am handing back

1. **`#905` needs test custody.** As above. The `candidate_mutation` placement (M3) and the
   receipt-bytes-equality property are the two I would pin first — M3 because the correct and
   incorrect versions differ by moving four lines, and the equality because it is the entire
   justification for choosing this direction over the other two.
2. **`docs/api.md:486-488`** documents the `run` usage block and does not mention `--keep-output`.
   **Not my file, and deliberately untouched**: `docs/api.md` is in `TEST_CONSUMED_PATHS`
   (`:16-22`), so editing it moves the candidate hash on a self-host repo and stales any chain
   receipt taken before the edit. **Order: prose first, receipt last.**
3. **`CHANGELOG.md` under `[Unreleased]`** owes two entries — the new flag, and the fact that #904
   moves `command_id`/`vector_id`/`receipt_sha256` for every policy, invalidating any inherited
   `{command_id, required_pass_vector_id}` obligation from before this change. Also test-consumed;
   same ordering rule.
4. **Non-darwin is inference, not measurement.** I measured the 104-byte `sun_path` boundary on this
   box only. Linux is 108 and the new 92-char shape clears it by more, so the fix is at least as good
   there — but I have no Linux box and did not run it. Windows is unaffected in principle (named
   pipes have no `sun_path`), also unmeasured.
5. **The `.rustup`/`--env-allowlist` sibling finding in premise-904 §6 is untouched.** It is a
   different defect in a different mechanism (`buildScrubbedEnvironment` silently ignores an
   allowlisted `HOME`) and was not in my brief. Still open.

## Artifacts

Fixtures, mutants, receipts and harnesses (nothing tracked):
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-f33f-4c74-8c66-4434a7ea9c6d/scratchpad/impl-runner/`
— `before/` (git-HEAD mirror), `mut/` (M1–M4), `harness-{ok,m1,m2}/`, `fixture/`, `*.json` receipts.

---

# ADDENDUM — `test-kernel-conformance.js` unledgered-writer finding

**Closed. `node scripts/test-kernel-conformance.js` exits 0 (254 assertions).** No test file was
edited, no check was weakened or exempted.

## What the ledger actually is — read, not guessed

`test-kernel-conformance.js` PART F (`:571-657`) is a **static surface ratchet**. `collectWriteSurface`
(`:601-622`) scans every `scripts/kaola-workflow-*.js` for eight `WRITE_APIS`
(`writeFileSync, appendFileSync, copyFileSync, createWriteStream, renameSync, openSync, writeSync,
truncateSync`) reached through an `fs`/`fsp`/`fsSync`/`require('fs')` handle, keyed by **(file, api)**,
not by line. It then checks the ledger in both directions: nothing unledgered (`:636-643`), and no
ledger entry without a live call site (`:645-651`).

The ledger is `const NON_ATOMIC_EXEMPT` — an array of
`{ file, api, klass, why }` objects with `klass` drawn from `EXEMPT_CLASSES` (`:336-337`:
`atomic-helper-internal`, `exclusive-create-verified`, `mirror-copy`, `append-only`,
`outside-project-space`, `non-record-target`).

### THE ROUTING FACT: the ledger lives INSIDE THE TEST FILE

```
scripts/test-kernel-conformance.js:357:const NON_ATOMIC_EXEMPT = [
```

`scripts/test-kernel-conformance.js:357-434`. Not `kaola-workflow-adaptive-schema.js`, and not any
production file — so the escape hatch in the instruction ("if the ledger lives in the schema, stop
and tell me") pointed at the wrong file, but its *reason* applies with more force, not less:
**adding a ledger entry means editing a test file, which I may not do under any circumstances.**

So "add the entry" was not available to me. I did not stop there, because a second resolution was
available entirely inside the file I own, and it is the better one on the merits.

## What I did instead: made the writes ATOMIC rather than exempt

`--keep-output` introduced this file's **first and only** `fs.writeFileSync` — the runner had none
before, because its other durable writes already go through
`require('./kaola-workflow-adaptive-schema').writeFileAtomicReplace` (`:1349` in
`recordFinalValidation`, `:1400` in `writeCliResult`). My two calls were the outlier, not the norm.

Routing them through the same helper means the static scan finds **no non-atomic write API in the
file at all**, so `unledgered` is empty for the reason the guard prefers. This is not routing around
the check: the ledger exists for writers that *cannot* be atomic, and every `atomic-helper-internal`
row in it is a file that implements the atomic path. Making a writer atomic is the outcome the ratchet
is built to produce; an exemption is the fallback when that is impossible. Here it was not impossible.

**And it is right independently of the check.** I already refuse to overwrite an existing retained
file on the grounds that *"a stale file from an earlier run, read as this run's evidence, is a false
diagnosis — strictly worse than the no-diagnosis state it replaces."* A **torn** file is that same
failure in a different costume: a log that reads as this run's complete output while holding only a
prefix of it. A stream runs to `MAX_OUTPUT_BYTES`, so a partial write under a crash or a kill is a
real outcome rather than a theoretical one. Atomic-replace is the choice consistent with the argument
I had already made.

### The change — `scripts/kaola-workflow-validation-runner.js:919-944`

Was two bare `fs.writeFileSync` calls. Now: `require` scoped to the retention branch (matching
`writeCliResult`'s idiom, so a caller that never asks for retention still loads a module whose
requires are all Node builtins), the helper, and a Buffer coercion.

### Two things I verified rather than assumed

**1. The helper is byte-exact for raw child bytes.** `writeFileAtomicReplace` is utf8-oriented on its
face — it reads existing content with `'utf8'` (`schema:575`) and writes with
`fs.writeFileSync(fd, content, 'utf8')` (`schema:583`). The raw-bytes guarantee is the entire point of
`--keep-output`, so this was the decisive question, and I measured it before committing to the
approach rather than after. Input: invalid UTF-8, a lone surrogate half, an embedded NUL, high-bit
latin-1.

```
input bytes        : fffe004180eda0800ac328
atomic-replace     : fffe004180eda0800ac328 byte-exact: true
plain writeFileSync: fffe004180eda0800ac328 byte-exact: true

sha256 input : 7648de141ba94807581c8706833c0512fd505e91544f5db23f749f55f6aea1ee
sha256 atomic: 7648de141ba94807581c8706833c0512fd505e91544f5db23f749f55f6aea1ee
```

Node ignores the encoding argument for a Buffer, so the bytes survive. Had this come back false the
approach would have been wrong and I would have handed the ledger entry back instead.

**2. A latent trap the helper introduces, closed by the Buffer coercion.**
`writeFileAtomicReplace` **skips the write entirely** when the new content equals the existing content
(`schema:576`, `if (existing === content) return false`). `existing` is `''` for a missing file. So an
**empty string** stream would compare equal and produce **no file at all** — and "no file" versus
"empty file" are different diagnoses, only one of them true. `defaultExecute` always returns Buffers
so the real CLI never hits it, but `runValidation`'s own fallback (`:900-901`) yields `''` for an
adapter that returns no stream.

Coercing to a Buffer before the call makes the comparison never equal, so the file is always created.
**Mutation-proved (M5)** — coercion removed, injected adapter returning `stderr: ""`:

```
=== M5: coercion removed ===        files written: run-1.stdout
                                    run-1.stderr present: false
=== shipped code, same adapter ===  files written: run-1.stderr,run-1.stdout
                                    run-1.stderr present: true
```

## Verification

| command | result |
|---|---|
| `node scripts/test-kernel-conformance.js` | **0** — `kernel conformance tests passed (254 assertions)` |
| `node scripts/test-validation-runner.js` | **0** — `PASSED` |
| `node scripts/test-finalize-door.js` | **0** |
| `node scripts/validate-workflow-contracts.js` | **0** |
| `node --check` | clean |

**The scan's own regex, re-run against my file for all eight APIs:**

```
NONE — no non-atomic write API in this file
```

**#905's proved properties all survive the change** (re-run, not assumed):

```
BYTES EQUAL (minus audit): true | vector_id equal: true
sha256(run-1.stdout)===receipt stdout_sha256: true
sha256(run-1.stderr)===receipt stderr_sha256: true
no temp residue left behind: run-1.stderr,run-1.stdout
```

That last line matters: the helper writes a dot-prefixed temp beside the target and renames it, so I
checked the directory is left holding exactly the two intended files and no `.tmp` debris.

Empty-stream case through the real CLI (the socket probe writes nothing to stderr):
`run-1.stderr EXISTS, 0 bytes`.

## THE FOUR COPIES ARE NOW OUT OF SYNC — deliberately, per instruction

I edited **canonical only** and did not run `npm run sync:editions`:

```
a8fe2a3b4116c084  scripts/kaola-workflow-validation-runner.js              <-- canonical, NEW
892a19d7ff501b44  plugins/kaola-workflow/scripts/…                         <-- stale
892a19d7ff501b44  plugins/kaola-workflow-gitlab/scripts/…                  <-- stale
892a19d7ff501b44  plugins/kaola-workflow-gitea/scripts/…                   <-- stale
```

Canonical is `a8fe2a3b4116c084bd…`; propagation is the lead's to run at the end.
`validate-script-sync.js` will name the runner until then — that one **is** mine, unlike the
`run-chains.js` entry recorded above, which is not.

Final diff of my file: **129 insertions / 5 deletions**.

---

# ADDENDUM 2 — Buffer coercion removed

**Done.** `scripts/kaola-workflow-validation-runner.js:919-941`.

## The measurement, and why I accept it

The test author is right and my addendum-1 reasoning was over-general. I justified the coercion from
`runValidation`'s own fallback (`:900-901`, `result.stdout !== undefined ? result.stdout : ''`) —
which does yield a string — but never checked whether any *shipping* path can reach it.
`defaultExecute` (`:719-720`) coerces both streams with `Buffer.from(result.stdout || '')`
unconditionally, so through the CLI `Buffer.isBuffer(value)` is invariably true and the
`Buffer.from(String(value))` arm is dead. Their `mut-E` removing it outright, with the suite still
green including the empty-stream artifact, is the direct falsification. A branch reachable only by an
injected adapter nobody writes is exactly what *derive additively* excludes.

I had mutation-proved the coercion — but only against a **hand-injected adapter returning a string**,
i.e. against the very path that does not ship. That is the lesson worth recording: a mutation control
constructed from the same assumption as the code it defends will confirm that assumption rather than
test it. My M5 was armed and still proved nothing about production.

## What replaced it

The write is now `writeFileAtomicReplace(keepOutputFile(…), record[stream])` — the value straight
through. The **empty-stream behaviour is unchanged and still correct**, and it survives for a reason
now stated in the comment rather than enforced by a branch: `writeFileAtomicReplace` skips the write
when existing content `===` new content and a missing file reads back as `''`, but these values are
Buffers, and a Buffer never compares `===` equal to `''`. So an empty stream still lands as an empty
file. Same outcome, no dead code, and the landmine is written down for whoever edits next.

## Verification against the final bytes

| command | exit |
|---|---|
| `node scripts/test-validation-runner.js` | **0** — `PASSED` |
| `node scripts/test-kernel-conformance.js` | **0** — `kernel conformance tests passed (254 assertions)` |
| `node scripts/test-finalize-door.js` | **0** |
| `node scripts/validate-workflow-contracts.js` | **0** |
| `node --check` | clean |

The ledger finding stays closed — the scan's own regex over all eight `WRITE_APIS` still returns
`NONE`, so nothing was reopened there.

Behaviour re-proved, not assumed:

```
EMPTY-STREAM through the real CLI, coercion GONE:
  run-1.stderr EXISTS, 0 bytes — empty file, not absent

  receipt BYTES EQUAL (minus audit): true | vector_id equal: true
  sha256(run-1.stdout)===stdout_sha256: true
  sha256(run-1.stderr)===stderr_sha256: true
  dir contents (no .tmp residue): run-1.stderr,run-1.stdout

band refusal still armed: exit 2
```

## Ruling recorded: the archive-band refusal STAYS

Noted and kept, no code change. It is a real, exercised behaviour (`prepareKeepOutput`, `:788-820`;
refuses at exit 2 before the child runs) and is now pinned by the test author rather than carried on
my flag alone.

## Four copies — still deliberately out of sync

```
5938e4ee0285af4e  scripts/kaola-workflow-validation-runner.js        <-- canonical, FINAL
892a19d7ff501b44  plugins/kaola-workflow/scripts/…                   <-- stale
892a19d7ff501b44  plugins/kaola-workflow-gitlab/scripts/…            <-- stale
892a19d7ff501b44  plugins/kaola-workflow-gitea/scripts/…             <-- stale
```

**Final canonical hash: `5938e4ee0285af4e82c45d6c2f8b26b19beaa59b80a124717638e9141f446270`.**
Transcripts bound to `a8fe2a3b` are superseded by this. Final diff: **128 insertions / 5 deletions**.
`npm run sync:editions` not run, per instruction.

---

# ADDENDUM 3 — review findings CONFIRMED-2 and CONFIRMED-4 closed

Both were real, both reproduced against my own code before I touched it, both are mine.

**Final canonical hash: `41c0fd483ca91865a13b8a1f4744f1332e791ac15c149af7cedc02a2657f292d`**
(supersedes `5938e4ee`). Final diff: **161 insertions / 5 deletions**.

## C2 — the no-overwrite rule was enforced at the wrong moment

The review is exactly right, and the sharpest way to say it is that I wrote the rule down correctly
and then enforced it where it could not hold. `prepareKeepOutput` refused before the child ran; the
write was an unconditional `writeFileAtomicReplace`. Everything arriving in between was destroyed.

### Reproduced BEFORE the fix, on my own code — both at exit 0

```
=== C2(a) fresh dir created BY the runner; child writes run-1.stdout during the run ===
  exit=0
  run-1.stdout now contains: child-ran
  *** CHILD ARTEFACT DESTROYED ***

=== C2(b) two concurrent runs into ONE fresh directory ===
  fast run exit=0
  slow run exit=0
  keepC/run-1.stdout = SLOW-RUN-OUTPUT
  *** FAST RUN'S RETAINED OUTPUT DESTROYED — both exited normally ***
```

I used a *runner-created* directory for (a) rather than the review's pre-created one, so the leg
tests the write-time hole specifically and cannot be satisfied by the pre-flight alone.

### The fix — two enforcement points, because one cannot cover both routes

**Before the child runs: the directory is CREATED, never adopted** (`prepareKeepOutput`, `:794-825`).
`fs.mkdirSync(path.dirname(dir), {recursive:true})` then `fs.mkdirSync(dir)` **without** `recursive`,
so the leaf create fails `EEXIST` if anything is already there.

This is what makes the concurrent case safe, and it is safe *without a race*: `mkdir` either creates
or fails, atomically, so of two runs aimed at one destination exactly one wins and the loser never
starts its child. A stat-then-write check could not have done this — it is precisely the shape the
review defeated. It also keeps the early refusal the lead asked me to preserve.

One rule now subsumes three: an earlier run's files, an unrelated occupant, and a plain file of the
same name all land on the same `EEXIST`. The old per-file pre-check became unreachable (a
freshly created directory is empty) and is gone rather than left as dead code.

**At write time: a target that exists is refused** (`:948-963`). `fs.lstatSync` — not `statSync`, so a
symlink planted at the name counts as an occupant instead of being followed and replaced. This is
sound rather than racy *because of* the step above: the directory is this run's alone and the child
has already exited, so the only thing that can have created the file is the validated command.

### Reproduced AFTER the fix

```
=== C2(a) child writes run-1.stdout into a runner-created dir ===
  exit=2 (2=refused) | artefact: IRREPLACEABLE CHILD ARTEFACT

=== C2(b) two concurrent runs, one fresh directory ===
  fast exit=2 (2=refused)
  slow exit=0
  kC/run-1.stdout = SLOW-RUN-OUTPUT      <-- the winner's bytes, intact; the loser refused
```

### Ledger not reopened

Both mechanisms use `mkdirSync` / `lstatSync`, neither of which is in `test-kernel-conformance.js`'s
`WRITE_APIS`. The scan's own regex over all eight APIs still returns `NONE` for this file, and
`test-kernel-conformance.js` still exits 0. I checked this before choosing the mechanism, not after —
true `O_EXCL` per-file creation would have been the textbook answer and would have reopened the
ledger, which I cannot close without editing a test file.

### Residual, named rather than hidden

An unrelated third-party process writing into this run's directory between the `lstat` and the rename
is still not excluded — that needs `O_EXCL`, which is unavailable to me for the reason above. Both
*reproduced* routes are closed deterministically. Worth a ledger entry + `O_EXCL` if the orchestrator
wants it airtight; that is a test-file edit and therefore a routing decision, not mine.

## C4 — `usage()` under-warned about what is retained

It claimed retained bytes have "absolute paths redacted and NOTHING ELSE". False, and false in the
dangerous direction: retention is **raw**, nothing is redacted at all. I had conflated
`normalizeOutputText` (which does redact paths, for the failure *signature*) with the retained bytes,
even though my own comment at `:919` says RAW on purpose.

Now states the truth — verbatim output, nothing redacted, paths and `HOME` and `TMPDIR` and any echoed
secret all written as-is. Control, confirming the text is now accurate rather than merely different:

```
$ ... run --command 'node ./leak.js' --keep-output <dir>
CWD=/private/tmp/.../scratchpad/impl-runner/fixture
HOME=/var/folders/j6/.../T/kwv/f248690b6ccf9dc1/home
TMPDIR=/var/folders/j6/.../T/kwv/f248690b6ccf9dc1/tmp
```

It also now states the new directory contract and both refusal points.

## A test disagreement, resolved in the test's favour

My first version of the directory refusal named only the directory, and the test author's `#905` leg
(`test-validation-runner.js:960-962`) requires the refusal to **name the file** it will not overwrite,
"so the operator can act on it rather than guess". The suite went red.

I did not touch the test. The assertion is right and my new message had regressed a property my
earlier one had. The refusal now names the actual directory **entries** in the way — read as entries
rather than matched against `run-<n>.<stream>`, because whatever is in there is what is at risk and a
rule recognising only this runner's own names would say nothing about the operator's. Capped at five
with an "and N more" tail, since the destination could be a large directory.

## Also fixed: my own comment was one-sided (review SUSPECTED-3)

The buffering comment argued a torn log is worse than none without naming the other half — that
buffering until after the last repetition means a kill mid-loop retains **nothing**, where a streaming
writer would have kept a prefix. The comment now states that cost explicitly. Comment only; the
placement is unchanged and still required, because writing inside the loop reports the runner's own
log as `candidate_mutation` (mutation-proved earlier, M3).

## Verification — suites run ALONE, sequentially

| command | exit |
|---|---|
| `node scripts/test-validation-runner.js` | **0** — `PASSED` |
| `node scripts/test-kernel-conformance.js` | **0** — `kernel conformance tests passed (254 assertions)` |
| `node scripts/test-finalize-door.js` | **0** |
| `node scripts/validate-workflow-contracts.js` | **0** |
| `node --check` | clean |

Regression pass over everything previously proved, all still holding:

```
R1 fresh dir, repetitions 3      -> exit 1, six files run-{1,2,3}.{stdout,stderr}
R2 nested keep path, no parents  -> exit 1, both files      (parents created recursively)
R3 empty stream                  -> exit 0, run-1.stderr 0 bytes, present
R4 archive-band refusal          -> exit 2, still armed
R5 keep dir at a VISIBLE path    -> outcome fail, reduction_reasons []   (no candidate_mutation)
R6 receipt BYTES EQUAL: true | vector_id equal: true
   stdout digest match: true | stderr digest match: true | no .tmp residue
```

**One harness artefact worth recording so nobody re-derives it as a defect:** an early regression run
showed exit 2 for R2/R3 because I passed `--output /dev/null`, and `writeCliResult`'s atomic replace
cannot rename over it. Confirmed pre-existing and unrelated — `--output /dev/null` **without**
`--keep-output` fails identically (exit 2). Re-run with a real path gave the exits above.

## For the test author (behaviours now live and unpinned)

- The **write-time** refusal — a `run-<index>.<stream>` created during the run. The existing leg C
  pins only the pre-flight; this is the half the review showed a pre-flight cannot reach.
- **Concurrent runs**: two runners at one fresh destination, exactly one proceeds, the loser exits 2
  and destroys nothing.
- The directory contract itself: `--keep-output` at an **existing** directory is now a usage error
  (previously an empty one was adopted).

## Four copies — still deliberately out of sync

```
41c0fd483ca91865  scripts/kaola-workflow-validation-runner.js     <-- canonical, FINAL
5938e4ee0285af4e  plugins/kaola-workflow/scripts/…                <-- stale
5938e4ee0285af4e  plugins/kaola-workflow-gitlab/scripts/…         <-- stale
5938e4ee0285af4e  plugins/kaola-workflow-gitea/scripts/…          <-- stale
```

`npm run sync:editions` not run, per instruction.

---

# ADDENDUM 4 — partial retention on a write-time refusal

Confirmed, reproduced, closed. The finding is correct and it is mine: my write-time refusal from
addendum 3 checked and wrote in ONE pass, so the outcome depended on which carrier the collision
landed on.

**Final canonical hash: `37b7dcb4252bd01cf9db525b4302730b4387b169e3af607da5d3384f7c0226f1`**
(supersedes `41c0fd48`). Final diff: **172 insertions / 5 deletions**.

## Both orderings, BEFORE the fix

Fixture: a command that creates ONE carrier inside its own retention directory, then emits on both
streams and exits 1.

```
=== collision on the stdout carrier ===
  exit=2
  directory holds: run-1.stdout
    run-1.stdout = COMMANDS OWN ARTEFACT
  message claims: no retained output was written for this run          <-- TRUE

=== collision on the stderr carrier ===
  exit=2
  directory holds: run-1.stderr run-1.stdout
    run-1.stdout = GENUINE_RUN_STDOUT        <-- this run's real retained output, already written
    run-1.stderr = COMMANDS OWN ARTEFACT
  message claims: no retained output was written for this run          <-- FALSE
```

The second is exactly the class I have been closing all run: the directory reads as a **complete**
retention — both expected names present — while one of the two files is the command's, and the
refusal's own sentence asserts the opposite. An operator trusting the message discards a real file; an
operator ignoring it reads the command's artefact as this run's stderr.

## The fix — check every target before writing any

`:948-978`. Two passes: collect and `lstat`-check all `run-<index>.<stream>` targets, throw on the
first occupant, and only then write. Nothing is written unless everything can be.

**I chose this over "remove what was written when refusing"** — the other shape the test author named.
Reasons: it is a pure precondition, where the alternative adds a *delete* path to a tool whose entire
purpose in this bundle is not destroying things, and a delete-on-refuse would itself need to be right
about which files were ours (the command may have created more than the one we collided on). Refusing
before the first write makes the invariant structural rather than compensated-for.

The refusal message is unchanged, and is now true in every ordering rather than in one of them.

## Both orderings, AFTER the fix — now indistinguishable

```
=== collision on the stdout carrier ===        === collision on the stderr carrier ===
  exit=2                                         exit=2
  directory holds: run-1.stdout                  directory holds: run-1.stderr
  command's artefact byte-intact: YES            command's artefact byte-intact: YES
  no GENUINE retained bytes present: YES         no GENUINE retained bytes present: YES
  receipt written: NO                            receipt written: NO
  stdout empty: YES                              stdout empty: YES
  names the file: YES                            names the file: YES
```

And the strongest form of the same defect — collision on the LAST target with `--repetitions 2`,
where the one-pass version would have written THREE genuine files before refusing:

```
=== --repetitions 2, collision on run-2.stderr ===
  exit=2
  directory holds: run-2.stderr
  any GENUINE retained bytes leaked? NO
  artefact intact: YES
```

The invariants the test author pinned across both shapes — exit 2, artefact byte-intact, no receipt,
the file named — hold in all three legs.

## Verification — suites run ALONE, sequentially

| command | exit |
|---|---|
| `node scripts/test-validation-runner.js` | **0** — `PASSED` |
| `node scripts/test-kernel-conformance.js` | **0** — `kernel conformance tests passed (254 assertions)` |
| `node scripts/test-finalize-door.js` | **0** |
| `node scripts/validate-workflow-contracts.js` | **0** |
| `node --check` | clean |

R1–R6 regression set, re-run in full:

```
R1 fresh dir, repetitions 3        exit=1 | six files, run-{1,2,3}.{stdout,stderr}
R2 nested keep path, parents absent exit=1 | both files      (parents created recursively)
R3 empty stream                     exit=0 | run-1.stderr 0 bytes, present
R4 archive-band refusal             exit=2 | nothing created in the band
R5 VISIBLE in-repo keep dir, reps 2 outcome fail, reduction_reasons []   (no candidate_mutation)
R6 BYTES EQUAL: true | vector_id equal: true | digests match: true | contents: run-1.stderr,run-1.stdout
```

The ledger stays closed: the change adds no `fs` write API (the two passes use `lstatSync` and the
same `writeFileAtomicReplace`), and `test-kernel-conformance.js` still exits 0.

## Ruling acknowledged

The `kaola-workflow/**/archive/**` band refusal **stays**. No action taken beyond keeping it; R4 above
re-confirms it is still armed (exit 2, nothing created in the band).

## Four copies — still deliberately out of sync

```
37b7dcb4252bd01c  scripts/kaola-workflow-validation-runner.js     <-- canonical, FINAL
5938e4ee0285af4e  plugins/kaola-workflow/scripts/…                <-- stale
5938e4ee0285af4e  plugins/kaola-workflow-gitlab/scripts/…         <-- stale
5938e4ee0285af4e  plugins/kaola-workflow-gitea/scripts/…          <-- stale
```

`npm run sync:editions` not run, per instruction.
