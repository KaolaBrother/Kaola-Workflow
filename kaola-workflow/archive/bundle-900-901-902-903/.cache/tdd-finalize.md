# Test custody — issues #902 (`finalize --check` vs execute) and #900 (the consumer candidate-hash recorder)

- **Role**: `tdd-guide`. **No production code was written or edited.** Diff is insertions only, in
  three test files.
- **Baseline** for every red proof: **`9b68b096`** (`git rev-parse HEAD` in the linked worktree).
- **Worked in** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`.
  Nothing committed. **No file in this worktree was ever reverted** — every mutation and every
  baseline run happened in a scratch mirror, because siblings hold uncommitted work here.
- **Scratch**: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/tddfin/`

## Files written

| file | change | new assertions |
|---|---|---|
| `scripts/test-claim-hardening.js` | +350 lines — one new `#902` block, six arms (A–F) | 461 → **514** (+53) |
| `scripts/test-finalize-door.js` | +321 lines — `T8` (consumer producer==gate) and `T8l` (worktree binding) | 156 → **194** (+38) |
| `scripts/test-validation-runner.js` | +204 lines — the `record` verb's own unit + CLI contract | +31 pins |
| `scripts/test-bundle-finalize.js` | **untouched** — see "spec'd pins not written" | — |

Mirrors and logs, for anyone re-checking: `base/` (baseline 9b68b096), `m1/` (impl, control),
`m2/`+`m3/` (#902 mutants), `mu1/`–`mu4/` (#900 mutants), `p900-unit-baseline.js` (the per-pin
baseline harness), `*-tch.log` / `*-tfd.log` / `*-tvr.log`.

---

# #902 — `scripts/test-claim-hardening.js`, the `#902` block

Fixture builder `mk902(project, seed)` is mk837's repo (real `git worktree add`, self-host
`package.json`, an implementation commit on the branch, a chain receipt bound to the worktree HEAD)
plus the one thing mk837 cannot express: **which roots carry the run folder**. `runFinalize902(fx,
cwd, extra)` takes **the cwd as a parameter** — the axis `runFinalize816` (`:1352`) and
`runFinalize837` (`:3274`) hard-code, and the only variable that flipped the answer.

`assertCwdAxisAgrees` is applied to arms A, B, C, D and F: `ok` must be the same from both cwds, and
`archive_authority_missing` must appear **from both cwds or neither**. That single assertion is the
one that would have caught #902 directly.

| arm | topology | pinned |
|---|---|---|
| **A** | #902: main-resident folder, worktree does NOT carry it, no archive | exit 0 both cwds, `reasons: []`, `checks.workflow_state === 'pending_mirror'`, `checks.mirror === 'ready'`, the whole `authority` block (`source: pending_mirror`, `source_dir` = main folder, `dest_dir` = worktree folder, `dest_dir !== source_dir`, `linked_root` non-null from the wt and **null** from main), `checks.validation === 'chains_green'` (not `not_checked`), `checks.changed_paths` includes `impl.txt` (not `[]`), the worktree folder still absent after two check passes (read-only), and **execute from the same cwd** exits 0, records `mirror: 'mirrored'`, reports the SAME `validation.classification`, and archives |
| **B** | CONTROL — folder seeded in both roots (the shape mk816/mk837/mk941 all build) | unchanged: `workflow_state: 'ok'`, `authority.source: 'live'`, `dest_dir === source_dir`, execute still passes |
| **C** | **MANDATORY NEGATIVE** — no live folder in either root, no archive | exit **1** both cwds, `reasons` contains `archive_authority_missing`, `checks.workflow_state === 'archive_authority_missing'`, `checks.mirror === 'source_absent'`, `authority.source === 'none'` with both dirs `null`, **and execute refuses under the same token** |
| **D** | NEGATIVE — two matching archives in main, no live folder | exit 1 both cwds, `archive_authority_ambiguous` in `reasons`, `checks.mirror === 'skipped_post_archive'`, execute refuses under the same token |
| **E** | main source present but **without** `workflow-state.md` | `--check` reports `state_missing` (EXECUTE's token) and **not** `archive_authority_missing`; `authority.source === 'pending_mirror'`; execute refuses `state_missing` |
| **F** | exactly one closed archive, no live folder | `workflow_state: 'ok'`, `authority.source === 'archive'` (never `pending_mirror`), `dest_dir === source_dir` — completes the `source` vocabulary and pins that a legitimate archive resume is not hijacked |

## Baseline red — 20 assertions, `9b68b096`

`base/` = `git archive 9b68b096`, overlaid with **only** `scripts/test-claim-hardening.js`.

```
claim-hardening tests FAILED (20 failures, 494 passed)     exit 1
```

The defect signature, verbatim from that run:

```
FAIL: #902(A) (cwd axis): from the LINKED WORKTREE, ok must be true; got status=1
  json={"project":"issue-902a","ok":false,"checks":{"mirror":"ready",
  "workflow_state":"archive_authority_missing","implementation_commit":"not_applicable",
  "staging_guard":"ok","validation":"not_checked","changed_paths":[],"dirty_paths":[]},
  "reasons":["archive_authority_missing"]}
FAIL: #902(A) (cwd axis): `archive_authority_missing` must be reported from BOTH cwds or NEITHER
  — worktree=["archive_authority_missing"] main=[]
FAIL: #902(A): --check and the transaction must report the SAME validation classification over the
  same tree; check="not_checked" execute="chains_green"
```

Full list: 13 reds in arm A, 1 in B, 1 in C, 3 in E, 2 in F (`$SC/base-tch-902.log`).
**Arms C and D green on the baseline for their token assertions — by design.** They are the
fail-closed anchors; a pin whose job is "this must still refuse" cannot red on a build that still
refuses. Their arming is proved by mutation, below.

## Mutation proofs — the fix is not a suppression, and the guard is armed

Both in scratch mirrors of the implemented tree (`m1/`, control: **exit 0, 514 assertions**).

**M-suppress — the blanket suppression the brief warns about.** `reasons.push` skipped when the
inner reason is `archive_authority_missing`:

```
claim-hardening tests FAILED (3 failures, 511 passed)     exit 1
FAIL: #902(C) (cwd axis): from the LINKED WORKTREE, ok must be false; got status=0 ...
FAIL: #902(C) (cwd axis): from the MAIN ROOT, ok must be false; got status=0 ...
FAIL: #902(C): an authority NOTHING will construct must STILL fail closed under the same typed
  token — this is the arm a blanket suppression reds on, got []
```

**Arm A stayed green under M-suppress.** That is the measured confirmation of the brief's central
point: the #902-topology arm alone cannot distinguish the fix from a suppression, and **arm C is
pinned and is the only arm that can.** Explicitly requested confirmation: *yes — the fail-closed
negative leg is pinned, and it reds under a blanket-suppression mutation.*

**M-disable — the fix switched off** (`const destAbsent = false`, reproducing the original defect):

```
claim-hardening tests FAILED (14 failures, 500 passed)     exit 1
```

Reds in arms **A** (10), **D** (1, `checks.mirror` falls back to `source_absent`) and **E** (3).
Arm C unchanged. So the `destAbsent` bit is load-bearing for exactly the arms that depend on it and
inert for the one that does not — arming and coverage proven separately.

---

# #900 — the recorder

## `scripts/test-validation-runner.js` — the verb's own contract (31 pins)

Matches the file's convention (node's `assert`, in-process, one `main()`). Pins:

- the exports exist and are what the gate needs: `recordFinalValidation`, `FINAL_VALIDATION_FILE`,
  `RECORD_FIELDS` (exactly the three owned lines) — guarded with `Array.isArray(...)` **because
  `Object.isFrozen(undefined)` is `true`** and the frozen assertion would otherwise pass on a module
  exporting nothing (the T7 lesson).
- `renderFinalValidationRecord` as a pure unit: **column zero** for every owned field (asserted by
  index, i.e. the preceding byte is `\n` or start-of-file — not by grepping the field name), exactly
  one column-0 line per field, byte-idempotence, prose preservation, and the load-bearing one — a
  pre-existing `verdict: fail` and a pre-existing 64-zero hash are **removed**, including one at
  column 0 **inside a code fence**, because the gate is fence-blind and last-match-wins so a survivor
  below the new block would win.
- the CLI at the process boundary: exit **0** = written (including `--verdict fail`), **1** =
  `project_folder_missing` / `candidate_root_unresolved` with `validated_candidate_hash: null`,
  **2** = each of six usage violations. Each exit-2 case also asserts **the diagnostic message**,
  because a build with no `record` verb also exits 2 (`unknown subcommand "record"`) and a bare
  exit-code assertion there would be vacuous.
- **positive control, in the shipped test**: recording, editing `src/app.swift`, recording again must
  produce a **different** hash. Without it every other assertion also holds for a recorder that
  writes the same 64 bytes forever.
- the fixture is built **from scratch** (fresh `git init`, no seeded hash) and sets
  `KAOLA_WORKFLOW_OFFLINE='0'` **explicitly**, with the reason in a comment: a fixture that inherits
  whatever the parent had is a fixture whose environment nobody chose.

### Baseline red — 30 of 31

The file's own assert style aborts at the first failure, so a single baseline run shows one red
(`#900: the record verb ships as a callable` — `undefined` vs `'function'`). Per-pin evidence comes
from `$SC/p900-unit-baseline.js`, which re-executes **the same assertion expressions** against the
module tree it is pointed at, one try/catch each:

```
impl (positive control):  RED=0  GREEN=31 of 31
baseline 9b68b096:        RED=30 GREEN=1  of 31
```

Sample signatures: `runner.renderFinalValidationRecord is not a function` (P5–P13),
`got 2 stderr=validation-runner: unknown subcommand "record"` (P14, P23),
`Cannot read properties of undefined (reading 'slice')` (P3).

**The one green on baseline is P31** — duplicate `--project` → exit 2 with `duplicate argument
--project`. That rejection happens in `parseCli` **before** subcommand dispatch, so it is inherited
pre-existing behaviour, not #900's. Recorded rather than dressed up as a new pin.

## `scripts/test-finalize-door.js` — `T8` and `T8l` (38 assertions)

Written as T7's **consumer twin**, not a duplicate: T7 pins producer==gate for the self-host arm
(run-chains as producer); T8 pins the same property for the consumer arm, where until #900 there was
no producer at all. Every leg drives the **real CLI** from a real cwd — no internal `require()` of
the hash function, no hand-copied value — because the recipe is the thing under test and the
candidate root is `process.cwd()`-driven.

New helpers: `initConsumerRepo` (no `package.json` anywhere, so `classifyRepoKind` reads `consumer`;
README/CHANGELOG/docs seeded deliberately, since they are validation-invisible in a consumer repo)
and `runRecord(cwd, args)` (classified `// spawn-class: cli-contract`).

| leg | pinned |
|---|---|
| premise | the gate takes `mode: 'final-validation'`, not the chain-receipt arm |
| **T8a** | the **pre-#900 recipe** (verdict + command, no hash) → `final_validation_unbound`; and the hint **names `record` and `--verdict`** |
| **T8b** | the shipped recipe **verbatim** → `chains_green`, `green: true`, on the consumer arm — the acceptance criterion |
| **T8c** | **producer == gate**: the printed hash === `computeCodeTreeHash(repo, project, VALIDATION_TEST_CONSUMES)` === the value the gate accepted; and `candidate_root` reports the tree that got hashed |
| **T8d** | NEGATIVE — 64 zeros → `final_validation_stale`, with both hashes carried |
| **T8e** | NEGATIVE — the runner's own `computeLandableTreeDigest` value → `stale`, plus the assertion that the two values **differ** (if they ever coincided this control would be vacuous) |
| **T8f** | NEGATIVE — the hash line **indented** → `final_validation_unbound` (the `^`-anchored parser) |
| **T8g** | NEGATIVE — 63-hex → `final_validation_unbound` |
| **T8h** | the loop **closes**: following the hint's own instruction returns the gate to green |
| **T8i** | a code edit breaks the binding (`stale`), re-recording binds the new candidate |
| **T8j** | merge-not-clobber over agent prose; gate still green; re-record **byte-identical** |
| **T8k** | `--verdict fail` exits **0** (a successful write) and the gate reads `final_validation_failed` |

### `T8l` — the linked-worktree binding (its own fixture)

Main checkout plus a **sibling** linked worktree (never nested — a nested worktree enters main's own
snapshot as a gitlink and the divergence becomes a fixture artifact) carrying **one un-merged code
commit**, so the two code-tree hashes genuinely differ (asserted as a premise).

- `record` from the worktree → `candidate_root` = the worktree, and the bound hash **equals the
  worktree's** hash, not main's.
- gate standing in the worktree → `chains_green`.
- **the load-bearing inverse**: the run folder mirrored into main as Step 8a does, the two copies
  asserted **byte-identical**, then the gate standing in **main** over those same bytes →
  `final_validation_stale` with `recorded_candidate_hash === wtHash` and
  `current_candidate_hash === mainHash`. *That* is what proves the recorded value was the
  worktree's; "green from the worktree" alone passes on a recorder that hashes main.
- `record` from **main** for a run claimed only in the worktree → exit **1**,
  `project_folder_missing`, `validated_candidate_hash: null`, and nothing created in main.

### Baseline red — 22 assertions

```
finalize-door tests FAILED (22 failures, 169 passed)     exit 1
```

Signatures include:

```
FAIL: T8b: `record` exits 0 having written the binding; got status=2 json=null
  stderr=validation-runner: unknown subcommand "record"
FAIL: T8a: the unbound hint must NAME the producer that fixes it — ...
FAIL: T8c: the producer and the gate reach the SAME shared computeCodeTreeHash over the same tree ...
FAIL: T8l: it binds the WORKTREE's hash, not main's; recorded=null
  worktree="393909ec…3002" main="57ffc590…782e"
```

`T8f`/`T8g` green on the baseline — again by design: they are negative controls, and the baseline
already refuses an indented or malformed hash. Their arming is MU3, below. To get the full spread
rather than one stack trace, every dereference of a possibly-absent CLI result is guarded in the
file's own `x && x.y` idiom, and `producerHash` falls back to a sentinel string that cannot match —
stated in a comment as the reason, not as defensive habit.

### Mutation proofs — four, and two of them are only caught by one suite each

Control: `m1/` (implemented) — both suites exit **0**.

| mutation | `test-validation-runner.js` | `test-finalize-door.js` |
|---|---|---|
| **MU1** renderer appends without removing superseded owned lines | **exit 1** — byte-idempotence | **exit 1** — T8j |
| **MU2** recorder uses the runner's own `computeLandableTreeDigest` | **exit 0 — CANNOT SEE IT** | **exit 1 — 11 reds** (T8b, T8c, T8e, T8h, T8i, T8j, T8l) |
| **MU3** recorder writes the owned lines **indented** | **exit 1** — the column-zero pin | **exit 1 — 15 reds** |
| **MU4** recorder binds the repo's **main** checkout, not the invoking shell | **exit 0 — CANNOT SEE IT** | **exit 1 — 4 reds, all in T8l** |

MU2 and MU4 are the measurement that matters: the unit suite passes on both, because the value is
still 64 lowercase hex and still moves when code changes. **The gate-level arm is the only reader of
the function axis, and the divergent-worktree arm is the only reader of the tree axis** — the exact
structural parallel to #902's arm C.

---

## Suites — real exit codes (bare `echo $?`, never through a pipe), run SERIALLY

| command | exit | result |
|---|---|---|
| `node scripts/test-claim-hardening.js` | **0** | 514 assertions (was 461) |
| `node scripts/test-finalize-door.js` | **0** | 194 assertions (was 156) |
| `node scripts/test-validation-runner.js` | **0** | PASSED |
| `node scripts/test-bundle-finalize.js` | **0** | 149 tests (file untouched) |
| `node scripts/simulate-workflow-walkthrough.js` (**full scope**, 1/1 shard) | **0** | 197/197 scenarios, 2052 spawns |

`pwd` was printed with the walkthrough invocation to prove the worktree was the cwd. Every suite run
one at a time — this set is spawn-bound and concurrent runs give false reds.

`node scripts/test-spawn-classification.js` — my three files are inside their ceilings
(`test-claim-hardening.js` 40/64, `test-validation-runner.js` 1/1, `test-finalize-door.js` 0/0, so
every new spawn site I added carries a `// spawn-class:` marker). See "found, not fixed" below.

## Spec'd pins I did NOT write, and why

1. **`scripts/test-bundle-finalize.js` — untouched.** It is the bundle-closure suite (all-or-nothing
   closure, closure receipts, roadmap-source removal). Neither #902's authority prediction nor
   #900's recorder has a surface there; adding a fixture would have been a new home for a property
   already pinned twice.
2. **The gitlab / gitea / plugin claim ports.** `impl-902.md` records them as still carrying the
   defect. My #902 arms drive `scripts/kaola-workflow-claim.js`; the forge suites
   (`test-gitlab-workflow-scripts.js`, `test-gitea-workflow-scripts.js`) are not my files and the
   port was still in flight.
3. **A symlinked `workflow-state.md` in the main source** (flagged unverified in `impl-902.md`:
   `mergeCopyDir` skips symlinks, so execute would land `state_missing` while the prediction could
   report `state_invalid_type`). Both fail closed; **which token is correct is an open question about
   the contract, not a fact** — freezing either answer into a pin would settle it by accident.
   Reported, not pinned.
4. **`record --output <path>`.** Documented in the usage string, inherited from `writeCliResult`, and
   no observed failure demands a pin. Not written.
5. **A contract-test needle asserting a shipped consumer surface names the recorder.**
   `impl-900.md` §8.7 assigns that to the contract-and-operator agent; `validate-workflow-contracts.js`
   is not one of my files.
6. **The self-host "`record` writes a file nothing consumes" shape** (`impl-900.md` §7). No observed
   failure; recording it here rather than building a pin for it.

## Found, not fixed

1. **`node scripts/test-spawn-classification.js` is RED in this worktree** —
   `scripts/test-sink-merge.js: 4 unclassified spawn site(s) exceeds the ceiling of 3`, unclassified
   lines 132, 282, 874, 2111. That file is modified by a sibling (`tdd-sinks`) and is **not mine**;
   the fix is one `// spawn-class: <token>` comment per new site, not a raised ceiling. My three
   files pass this check.
2. **Cosmetic, inert, in `probeFinalizeMirror`** (`scripts/kaola-workflow-claim.js:3376-3377`): the
   two `not_needed` early returns hardcode `destAbsent: false` even where the destination may be
   genuinely absent. Unreachable as a bug — `predictFinalizeAuthority` additionally requires
   `mirror.mainRoot`, which is `null` on exactly those paths — so this is a naming inaccuracy, not a
   defect. Not touched (production code).

No implementation defect was found in either #902 or #900: every arm the acceptance surface names
now agrees between `--check` and execute, and the recorder's binding is provably the tree the shell
was standing in.

---

# #901 — the archive disposal gate (follow-on, after the "no env seam" ruling)

**Ruling accepted: no seam was added.** No production file was touched. The route the ruling proposed
— construct the source/destination asymmetry directly on disk — was **measured against the real CLI
and does not reach the claim.js gate.** What is reachable on disk is the *gap the gate exists to
close*, and that is now pinned. Detail below so the call can be re-made with the measurement in hand.

## Why the on-disk construction does not reach `archiveProjectDir`'s gate

The gate (`scripts/kaola-workflow-claim.js:2493-2510`) sits **inside** the linked-run branch, and its
destination is not a tree a fixture can shape:

```js
dest = archive/<project>;  if (fs.existsSync(dest)) dest += '.archived-<ts>';   // :2485
copyDir(src, dest);                                                            // :2489
v = verifyArchiveComplete(src, dest);
missingSidecars = [ exempt sidecars in src/.cache absent from dest/.cache ];
if (!v.ok || missingSidecars.length) return { archive_incomplete: true, missing: … };
```

`dest` is **manufactured by `copyDir` from `src` one statement earlier, at a path proven not to
exist**, and `copyDir` (`:5033-5041`) is exhaustive over `readdirSync(src)` and swallows nothing.

Measured with the real CLI (`$SC/probe901-ondisk.js`, three legs, real `git worktree add`,
`KAOLA_WORKFLOW_OFFLINE=1`, source holding both an exempt sidecar and a non-exempt evidence file):

| leg | construction | result |
|---|---|---|
| **1** | `archive/<project>` **pre-built on disk** as a faithful copy **minus** `.cache/final-validation.md` | **exit 0, `status: closed`, no refusal.** The pre-built dir is left untouched; the real destination became the sibling `issue-901a.archived-2026-08-01T13-30-56-217Z`, which `copyDir` filled **faithfully** (`chain-receipt.json, final-validation.md, n1-evidence.md`) |
| **2** | CONTROL — nothing pre-built | exit 0, exactly one archive `issue-901b`. So leg 1's suffixed name **was** caused by the pre-built dir (the control disagrees with leg 1 on the archive-name set — it is not a fake control) |
| **3** | source `.cache/final-validation.md` at **mode 000** — the only on-disk way to stop `copyFileSync` writing it | **exit 1, `reason: 'archive_exception'`**, `missing` absent. `copyDir` **throws**; the live source survives, but the typed `archive_incomplete` + `missing: ['.cache/final-validation.md']` the gate exists to emit is **not** what comes out |

So pre-existence only **renames** the destination, and every other on-disk state that would leave a
source sidecar absent from the destination makes `copyFileSync` throw first, surfacing as a
different refusal with a different envelope. **The end-to-end disposal-gate pin is NOT written**, and
per the ruling it is reported rather than bought with a seam.

## What IS pinned, on disk and seam-free — `test-finalize-door.js` T6g / T6h / T6i (+14)

The ruling named the real gap exactly: *the gate must block the delete for a file
`verifyArchiveComplete` **exempts***. That exemption is a two-directory property of the **exported**
`verifyArchiveComplete`, which T6 already drives directly — so it is fully constructible on disk.
`mkRun` gained an optional `sidecars` list (additive; T6a–T6f pass none and are unchanged).

- **source-text pin** — the shipped `ARCHIVE_CACHE_SIDECAR_MD` set is extracted from `claim.js` and
  asserted to be exactly the five names the arms drive, so a name **added** to the set without an arm
  reds. (A name **removed** already reds behaviourally: the file becomes required.)
  **Note for the record: the set has FIVE names, not four** — `final-validation.md`,
  `run-gaps-manual.md`, `selection-evidence.md`, `doc-docking.md`, `doc-updater.md`. `impl-901.md`'s
  own wording is the accurate one ("four of the five evidence files the incident lost live in that
  set"); the ruling's "four sidecars" undercounts the exemption by one. All five are driven.
- **T6g** — per name, a destination missing that **exempt** sidecar still reports `ok: true`, and the
  path is not even present in `missing[]`. Driven **one name at a time**, because the exemption is by
  exact basename and a set-membership bug affecting one name is invisible to a single-name arm.
- **T6i** — the exemption's **scope**: drop one exempt sidecar *and* one non-exempt file together;
  `missing[]` names the non-exempt loss and stays **silent about the exempt one even while already
  refusing**. The sharpest form of the gap — the fact is not recoverable from this return value at all.
- **T6h — the discriminating control**, same builder, same sidecars present, one **non-exempt**
  `.cache/*.md` dropped instead: `ok: false` and the path named.

### These arms are baseline-GREEN by design, and that is the honest characterization

`missingSidecars` does not exist at `9b68b096` (`grep -c -F 'missingSidecars'` → **0**), and the
exemption set is byte-identical there. So T6g/T6h/T6i **green on the baseline** — they measure a
**pre-existing** gap, not the new gate. Baseline `test-finalize-door.js` stayed at **22 failures**,
all of them #900, with **no** T6 red: confirmation both that these arms are not baseline-red pins and
that T6a–T6f were not disturbed by the `mkRun` change.

### Arming — mutation, in both directions

| mutation | result |
|---|---|
| **MX1** the exemption **removed** from the source walk (`claim.js:5126`) | **exit 1, 11 reds — T6g on all five names + T6i. T6h stays green.** So T6g/T6i measure the exemption specifically and are not coupled to the control |
| **MX2** the exemption **widened** to every `.cache/*.md` (walk + `listSourceEvidenceFiles`) | **exit 1, 5 reds — T6h + T6i, plus the pre-existing T6b/T6c.** So the control is armed: it is not a fixture that cannot fail |

The control provably **disagrees** with the positive leg under MX2 and provably **agrees with the
implementation** under MX1 — checked by measurement, not asserted. (Applying the lesson: a control
that had matched the positive leg in both mutants would have been the signal to fix the control.)

## Where the #901 property is still unpinned, and the cheapest way to close it

The claim.js presence re-check is **unreachable from any in-repo pin** while `dest` is built by
`copyDir` from `src` at a fresh path. Two routes exist, both production changes and therefore not
mine to make:

1. **Extract the loop into an exported pure helper** — e.g. `missingArchiveSidecars(srcDir, destDir)`
   returning the array. Then the gate becomes directly drivable on disk with two hand-built
   directories, exactly as `verifyArchiveComplete` already is, and needs no seam. Cost:
   `FORGE_EXPORT_SUPERSET_FAMILY` (`validate-script-sync.js:485-486`) then requires the gitlab/gitea
   hand-ports to export it too — which `impl-901.md` records as the reason no new claim.js export was
   added.
2. Leave it as it is and accept that the gate is proven only by the implementers' scratch-mirror
   `copyDir` doctoring, with T6g/T6h/T6i standing as the in-repo record of *why it must exist*.

Recommending (1) if the property is wanted under test at all — it is the same shape the repo already
uses for `verifyArchiveComplete`, and it removes the doctored-`copyDir` dependency permanently. Flagged
for decision; **not** built.

## One further observation, reported and deliberately NOT pinned

The exemption is silent about **byte differences** too, not only absence: an exempt sidecar that
reaches the destination with different bytes is never digested (the walk `continue`s before
`sourceFiles.set`), so `ok` stays true. I did not pin that. `impl-901.md` justifies the exemption as
"a normalized sidecar may legitimately differ from its source", but `archiveProjectDir` normalizes
`src/.cache/final-validation.md` **at `:2455-2463`, before the `:2489` copy** — so on the path I can
read, source and destination should agree, and I could not confirm the stated rationale. Asserting
that hole would be a vote for keeping it, on a justification I cannot verify; asserting against it
could break a legitimate normalization I cannot see. Recorded for whoever owns that contract.

## Rung 1 (`chmod 000` on an exempt sidecar) — REFUTED by measurement, axis verified

The re-decided ruling's preferred outcome was: if `copyDir` *skips* an unreadable source file, the
lossy copy the gate needs comes free. **It throws.** `$SC/probe901-rung1.js`, four legs, uid **501**
(a root run would make the whole probe inert, so it is printed):

| leg | measurement |
|---|---|
| **A** the mechanism, axis verified **three** ways | `fs.readFileSync` → **EACCES**; `cat` → **exit 1 "Permission denied"**; `fs.copyFileSync` (what `copyDir` calls, `claim.js:5039`) → **EACCES**. ⇒ `copyDir` **THROWS**, it does not skip |
| **B** end to end, exempt sidecar at mode 000 | **exit 1, `reason: 'archive_exception'`**, `detail: "EACCES: permission denied, copyfile '<wt>/…/.cache/final-validation.md' -> '<main>/kaola-workflow/archive/issue-901r1/.cache/final-validation.md'"`. **No `missing` key at all.** Archive left **partial** (`.cache=["chain-receipt.json"]`); live source and live sidecar both survive |
| **C** CONTROL — identical fixture, sidecar readable | **exit 0, `status: closed`**, archive carries all three files, live source gone. Disagrees with B on exit code, reason, archive contents *and* source survival — so B's outcome is caused by the chmod |
| **D** the `.cache` **directory** at mode 000 | same `archive_exception`, `detail: "EACCES … scandir '<wt>/…/.cache'"`. No skip on that axis either |

**Why no permission trick can ever reach the gate:** the throw happens *inside* `copyDir`, which runs
**before** `verifyArchiveComplete` and before the `missingSidecars` loop. `archiveProjectDirSafely`
(`:2660-2666`) catches it and returns `{ archived: false, reason: 'archive_exception', detail }` — a
different door, a different envelope, and no `missing[]`. The copy aborts mid-way rather than
completing lossily, so the "lossy copy, then gate" sequence the pin needs never exists.

## Rung 2 — needs an EXTRACTION, not just an export line, so it is production code I cannot write

The gate is **not a helper**. `claim.js:2500-2510` is an inline `for` loop inside `archiveProjectDir`:

```js
const missingSidecars = [];
try {
  for (const entry of fs.readdirSync(path.join(src, '.cache'), { withFileTypes: true })) {
    if (!entry.isFile() || !ARCHIVE_CACHE_SIDECAR_MD.has(entry.name)) continue;
    if (!fs.existsSync(path.join(dest, '.cache', entry.name))) missingSidecars.push('.cache/' + entry.name);
  }
} catch (_) { /* no readable .cache in the source */ }
```

So rung 2 is *extract a function, then export it in four files* — canonical, the byte-lockstep github
plugin copy, and both forge ports. That is production code, and **test custody forbids me writing it**;
two of the four files are outside my write set regardless. **Reported, not written — an implementer
must be dispatched.**

The ruling's reading of `validate-script-sync.js` is **confirmed**: `:485` carries
`canonicalOnly: ['ghExec']` for the claim family, and `forgeClassifierExportDrift` (`:493-495` comment,
body below it) computes canonical export keys **absent** from each port and treats any as fail-closed
drift. So a new canonical export does require all three ports to export it.

Suggested signature, so the pin can be written the moment it lands — it is a pure two-directory
comparison, exactly the shape `verifyArchiveComplete` already has, and needs no seam:

```js
function missingArchiveSidecars(srcDir, destDir)   // → ['.cache/<name>', …]
```

Then the pin is: hand-build an asymmetric pair, drop one **exempt** sidecar, assert the returned array
names it; and the control drops nothing and asserts `[]`.

## Rung 3 — what stands in the meantime

Not a bare record: **T6g/T6h/T6i pin the exemption gap itself** on disk, seam-free, mutation-proven in
both directions (above). They are the durable in-repo record of *why* the gate must exist. What they
do **not** pin is the gate's own output, and that is stated in their comments rather than implied.

## The destruction-safety arm — WRITTEN (authorized after the rung-3 report)

`scripts/test-claim-hardening.js`, case **(3)** of the existing `#941` block — the neighbourhood that
already owns "nothing DESTROYED", one door over. 9 assertions (515 → **524**).

Vehicle: `mk941` with an **exempt** sidecar (`final-validation.md`) planted and `chmod 000`. Exempt is
the deliberate choice: it is the file class `verifyArchiveComplete` is blind to, so a non-exempt file
would be caught by the completeness comparison and the arm would be re-measuring case (2).

- **uid guard, skipping LOUDLY.** `process.getuid() === 0` prints
  `SKIP: #901(disposal) — running as uid 0, where chmod 000 is inert and this arm cannot fail` on
  stderr and runs nothing. A root run reads a mode-000 file regardless, which would turn all nine
  assertions into vacuous passes.
- **the axis is proven inside the arm, before the run**: `fs.readFileSync(sidecar)` must give
  **`EACCES`**, asserted with the expected code in the message. A chmod that did not take (root, an
  exotic mount, an ACL) reds here rather than downstream.
- **fails loudly, at the right door, with a locator**: exit **1**; `result: 'refuse'` **and**
  `reason: 'archive_exception'` — a *different* door from `archive_incomplete`, because the
  completeness gate was never reached; `detail` must **name** `final-validation.md` (bound to the
  file's basename, not to Node's errno wording).
- **destroys nothing** — four distinct things the delete would have taken: the worktree run folder,
  **the unreadable sidecar itself** (the one file with no second copy anywhere), the sibling evidence
  the aborted walk never reached, and the **main** live copy (`archiveProjectDir` deletes both).
- **no bookkeeping commit** on the branch.
- **not asserted**, following case (2)'s precedent: the partial archive destination left behind.
  Whether that is residue or evidence is a judgement about the archive contract.

### Baseline: GREEN, by design — and armed by two mutants

`archiveProjectDirSafely` is pre-existing (5 hits at `9b68b096`), so this arm greens on the baseline;
`test-claim-hardening.js` baseline reds stayed at exactly **20**, none of them `#901(disposal)`. Its
arming is mutation, and the two mutants separate the two halves:

| mutation | result |
|---|---|
| **MD1** `copyDir`'s throw **swallowed** | **2 reds** — the `archive_exception` typing and the locator. The four survival assertions stay **green**, because the completeness gate downstream still refuses and still does not delete. So MD1 arms the loud-failure half *and* shows destruction is defended by a second, independent gate |
| **MD2** swallowed **and** the incompleteness return bypassed | **15 reds — all 7 `#901(disposal)` assertions including every survival one**, plus the pre-existing `#941` case (2). With both gates gone the transaction reports **exit 0, `status: closed`, `archived: true` over an aborted copy** and deletes the live folders — the silent-false-claim class, caught on every assertion |

MD2's blast radius into case (2) is correct, not collateral: MD2 removes the very refusal case (2)
exists to pin.

## Correction carried forward: the exempt set has FIVE names, not four

Restating because the re-decided ruling says "four" again: `ARCHIVE_CACHE_SIDECAR_MD` holds
**`final-validation.md`, `run-gaps-manual.md`, `selection-evidence.md`, `doc-docking.md`,
`doc-updater.md`**, byte-identical at `9b68b096` and today. `impl-901.md`'s "four of the five evidence
files the incident lost live in that set" is the accurate phrasing. T6g drives all five, one at a
time, and a source-text pin reds if a sixth is added without an arm.

## The `receipt.` vs envelope trap, applied to my own arms

Checked, and it reached exactly one assertion. `#902` arm A had a **hardcoded**
`archive/<project>/workflow-state.md` existence check — the shape the sink agent warns about, and it
fails **open** if the dest is ever collision-suffixed. Fixed by reading the reported dest, after
measuring where it actually lives rather than guessing:

- the finalize **success** envelope carries a **top-level `dest`** — `closure_receipt.dest` is
  `undefined` (measured on a live run; top-level keys dumped).
- the `archive_incomplete` **refusal** envelope also carries top-level `dest` (`claim.js:3910`).

Arm A now asserts both halves — the envelope **names** a dest under main's archive band for the
project (plain **or** collision-suffixed), and the run folder is on disk **at that dest**. Envelope and
disk must agree. `test-claim-hardening.js` 514 → **515**; baseline reds unchanged at **20** (13 in arm
A), and both #902 mutants re-verified against the updated file: M-suppress reds **only** arm C,
M-disable reds A/D/E and not C.

My other archive assertions were checked for the same fail-open shape and are clean: arm A's fixture
premise tests the whole `archive` **directory** (suffix-proof), and I wrote no
`!fs.existsSync(archive/<project>)` negative-existence assertion anywhere.

## FINAL suites — real exit codes (bare `echo $?`, never through a pipe), run SERIALLY

| command | exit | result |
|---|---|---|
| `node scripts/test-claim-hardening.js` | **0** | **524** assertions (461 at baseline) |
| `node scripts/test-finalize-door.js` | **0** | **208** assertions (156 at baseline) |
| `node scripts/test-validation-runner.js` | **0** | PASSED (+31 pins) |
| `node scripts/test-bundle-finalize.js` | **0** | 149 tests (file untouched) |
| `node scripts/simulate-workflow-walkthrough.js` (**full scope**, 1/1 shard) | **0** | 197/197 scenarios, 2052 spawns |

`pwd` printed with the walkthrough to prove the worktree was the cwd. No new spawn site was added for
the destruction-safety arm, so `test-claim-hardening.js` stays at 40/64 unclassified,
`test-validation-runner.js` at 1/1, and `test-finalize-door.js` at 0/0.

Total diff: **three test files, insertions only.** `test-bundle-finalize.js` untouched. No production
file touched at any point, and nothing in the worktree was ever reverted.

---

# Second pass — pins for the two repaired `claim.js` defects (D1, D2)

`scripts/test-claim-hardening.js` only. 524 → **557** assertions (+33). No production file touched.
`test-finalize-door.js`, `test-validation-runner.js` and `test-bundle-finalize.js` unchanged this pass.

## D1 — the destruction gate must guard EVERY live copy (new block, 19 assertions)

Builder `mk910(project, mainFiles)`: a real linked worktree whose **worktree** live folder is fixed
(`workflow-state.md` + `.cache/shared.md`) and whose **main** live folder is the single axis. Driven
with `release --project <p> --json` from the worktree — one of the three routes that run **no** Step-8a
mirror, so nothing upstream establishes "worktree ⊇ main" for them.

| leg | main's live folder | pinned |
|---|---|---|
| **L1_equal** | same as the worktree's | exit 0, `released`+`archived` true, **both** live copies gone |
| **L2_subset** | a strict subset | same |
| **L3_absent** | no main live folder | same |
| **L4_extra** | one ordinary main-only file | exit **1**, `archive_incomplete`, `missing` names `.cache/EXTRA.md`, **main's copy AND the at-risk file survive**, the worktree's copy survives, `archived !== true` |
| **L5_sidecar** | one main-only **exempt sidecar** | same, naming `.cache/final-validation.md` — the half `verifyArchiveComplete` is blind to by design (T6g pins that blindness), so the only leg a presence re-check can catch |

Every value measured first in this fixture shape (`$SC/probe-d1d2.js`), never transcribed: the refusal
envelope's keys are `["released","result","project","reason","missing","reasoning"]` — `missing` is
**top-level**, there is no `mismatched` key on this refusal, and no `archived` key.

## D2 — `pending_mirror` must not promise a mirror it never probed (arms G1–G3, 13 assertions)

Added **inside** the `#902` block, reusing `mk902` + `check902` + `runFinalize902`: this is a hole in
the #902 conversion, not a separate mechanism, and the fixture is already the `pending_mirror`
topology. The axis is one directory's mode.

- **G1 — THE MANDATORY CONTROL, and it is in.** `wt/kaola-workflow/` present and **writable**:
  `--check` exit **0**, `ok:true`, `checks.mirror: 'ready'`, `checks.workflow_state: 'pending_mirror'`,
  `reasons` **empty** with `archive_authority_missing` **absent**, and the transaction exits **0**. The
  assertion message states the consequence outright: *if this arm ever reds, the writability probe has
  become a blanket refusal and the #902 conversion is undone.*
- **G2** — same topology, `chmod 555`: uid guard + an in-arm axis assertion (`accessSync` must give
  `EACCES`) before anything is trusted; then `--check` exit 1, `ok:false`, `checks.mirror:
  'sync_failed'`, `mirror_sync_failed` in `reasons`, `workflow_state !== 'pending_mirror'`. The
  transaction: exit non-zero, **the envelope PARSES** (the defect was its *absence*, so a reason-only
  assertion would pass on `null`), `finalize_mirror_refused` / `mirror_sync_failed`.
  `archive_authority_missing` **reappears** here and is deliberately **not** asserted absent — the
  prediction correctly declines to promise a construction that cannot happen, and asserting its
  absence would demand the checklist hide a real precondition.
- **G3** — a regular **file** where `kaola-workflow/` belongs (ENOTDIR, a second independent way for
  the copy to be impossible): parseable envelope, identically typed.

## Pre-fix red — and here the pre-fix state and the mutant are the SAME edit

Three mirrors of the current tree, each with one hunk reverted. Control (`n1`, untouched): **557, exit 0**.

| mirror | edit | result |
|---|---|---|
| **pd1** | the main-copy comparison removed (`missingFromMain` never populated) | **10 reds — only L4_extra (5) + L5_sidecar (5)**. Verbatim pre-fix signature: `archived: true`, `missing: undefined`, main's at-risk file gone. **L1–L3 unchanged**, so the three must-not-refuse legs are not coupled to the new term |
| **pd2a** | the destination-writability probe removed (`const ready = 'ready'`) | **4 reds — only G2's four `--check` assertions**, including `workflow_state` back to `"pending_mirror"` (the false promise restored). **G1 and G3 unchanged** |
| **pd2b** | the `mergeCopyDir` try/catch removed | **4 reds — G2's two transaction assertions + both of G3's**, all on `envelope=null`. **G1 unchanged** |

pd2a and pd2b red **disjoint** assertion sets, so the two halves of D2 are separately load-bearing and
neither masks the other — measured, not asserted.

**True baseline `9b68b096`: 39 reds** — the original 20 plus 19 new (10 D1 + 9 G). `#902(G1 control)`
is 3 of those, because ``pending_mirror`` did not exist at the baseline at all; it is **green under both
D2 mutants**, which is the property that matters for a control.

Baseline-GREEN by design, armed only by mutation: **L1/L2/L3** (the must-not-refuse controls — they
red if the gate becomes a blanket refusal) and **`#901(disposal)`** from the first pass.

## Three findings from this pass

1. **A half-landed edit, caught in a ~40-second window.** At 23:42 `repoWideIgnoredNames` was *called*
   at `claim.js:2534` and **defined nowhere in any edition** — a `ReferenceError` that
   `archiveProjectDirSafely` converted into `archive_exception`, so **every** linked-run archive with a
   disposable main copy failed: D1 legs L1/L2/L4/L5 all returned
   `reason: 'archive_exception', detail: 'repoWideIgnoredNames is not defined'`, and even a plain
   `finalize` on the D2 control aborted. It failed **safe** (nothing archived, nothing deleted) but
   `release`/`discard`/`watch-pr` were fully broken and the D1 gate was unreachable behind the crash.
   **Since resolved** — now defined at `:2683`. Reported as a concurrency observation, not a standing
   defect; the D1 measurements above were all re-taken against the complete code.
2. **V2 landed mid-pass and my #902 arms A–F needed no repair.** `destAbsent` → `destAuthorityAbsent`
   (keyed on `workflow-state.md` rather than directory existence) and the prediction widened to
   `state_missing`. My arms assert **behaviour** (`pending_mirror`, empty `reasons`, a real
   `validation`) and never the internal bit's name, so they survived a rename of the very bit M-disable
   proved load-bearing. Nothing was rewritten to keep passing.
3. **My own measurement error, and how it was caught.** Two runs reported `461 assertions / 668 spawns`
   — the *exact* baseline numbers — because the Bash cwd resets between calls and `node
   scripts/test-...` executed the **main root's** copy, which sits at `9b68b096`. The tell was the
   assertion count matching baseline exactly while the worktree file on disk provably carried the new
   arms. Every run in this pass now begins with an explicit `cd` to the worktree and prints `pwd`.
   Worth knowing for anyone else reporting suite results out of this bundle.

Also re-checked and now **clean**: `validate-script-sync.js` (the `scripts/` ↔ `plugins/kaola-workflow/scripts/`
claim+sink divergence I saw at 23:42 has converged) and `test-spawn-classification.js` (exit 0 — the
`test-sink-merge.js` ceiling breach from my first report is fixed).

## FINAL suites — real exit codes, serial, explicit `cd`, `pwd` printed

| command | exit | result |
|---|---|---|
| `node scripts/test-claim-hardening.js` | **0** | **557** assertions |
| `node scripts/test-finalize-door.js` | **0** | 208 assertions |
| `node scripts/test-validation-runner.js` | **0** | PASSED |
| `node scripts/test-bundle-finalize.js` | **0** | 149 tests (untouched) |
| `node scripts/test-spawn-classification.js` | **0** | 603 sites, no breach |
| `node scripts/simulate-workflow-walkthrough.js` (**full scope**) | **0** | **198/198**, 2079 spawns |

---

# Third pass — V1 pins (the `record` worktree lane)

`scripts/test-finalize-door.js` only. 208 → **233** assertions (+25). No production file touched.
Two new arms (`T8m`, `T8n`) plus three assertions folded into the existing T8c, and a comment
hardening on T8l. Every asserted value was measured first in this fixture shape
(`$SC/probe-v1.js`), never transcribed.

Fixture for both new arms: consumer repo (no `package.json` ⇒ the gate's final-validation arm), a
**sibling** linked worktree (never nested — a nested worktree enters main's own snapshot as a gitlink
and the divergence becomes a fixture artifact), one un-merged commit on the branch so the trees
genuinely diverge, run folder **main-resident only**. `id -u` = 501.

## The five pins

| pin | where | what |
|---|---|---|
| **17** the worktree lane end-to-end | `T8m` W1/W2 + E2E | `record` from the worktree: exit 0, `record_path` is **main's**, `candidate_root` is the **worktree**, the bound hash `=== wtHash` **and `!== mainHash`**, **no run folder created in the worktree**, and `operator_hint` names **both** the folder written and the tree hashed. Then the gate's own pair `{invoking: worktree, cacheDir: main's}` → `chains_green`; and through the **real CLI**, `finalize --check --keep-worktree` from the worktree → exit 0, `ok: true`, `reasons: []`, `authority.source: "pending_mirror"`, `checks.validation: "chains_green"` |
| **18** the control that makes 17 non-vacuous | `T8m` W3 | the **same bytes** with the gate standing in **main** → `final_validation_stale`, with `recorded_candidate_hash === wtHash` and `current_candidate_hash === mainHash` |
| **19** the one-directional property | `T8l` (**unchanged**) | folder only in the worktree, recorded from main → exit 1, `project_folder_missing`, no hash, creates nothing. Comment hardened to say why it must never be relaxed into a success case: a symmetric fallback reintroduces the wrong-tree binding in mirror image |
| **20** W9, through the fallback | `T8n` W9 | `--project Archive` from a worktree with **no local** band while main has one → exit **2**, stderr names the band, and main's band is **byte-unchanged** (enumerated before/after) |
| **21** the plain-repo regression guard | `T8c` | folder local: `record_path` stays local, **`operator_hint: null`**, `other_candidate_roots: []`, gate green |

Also pinned, since it was cheap and it is how the loop existed: **`project_folder_missing` names BOTH
searched paths** (`T8n` W7) — the old hint named one path while you were standing in it.

## Confirmation the lead asked for

**Pin 18 (stale-from-main) is present**, as `T8m(W3 control)`, two assertions. It is not decorative:
under **MV2** it **inverts to green**, which is what identifies "hash the destination" as the wrong
answer. Without it, MV2 would still be caught by W2/E2E but nothing would say *why*.

## Baseline-red vs mutation-armed

**True baseline `9b68b096`: 40 reds** in this suite — the whole `record` verb is absent there, so all
of `T8m` (12), `T8n` (3) and `T8c(plain repo)` (3) red alongside the earlier #900 arms.

Three mutants of the current tree, one line each. Control (`v1base`, untouched): **233, exit 0**.

| mutant | edit | result |
|---|---|---|
| **MV1** | the fallback to main removed | **12 reds** — T8m W1(4)/W2/W3(2)/W5/E2E **and** T8n W7(1: the hint no longer names both paths) + W9(2: with no fallback main's band is unreachable, so it degrades to exit 1 `project_folder_missing`). The fallback IS the fix |
| **MV2** | hash the tree the record LANDS in, not the invoking tree | **5 reds** — the bound-hash assertion, W2 (`stale`), **W3 control ×2 (inverted to green)**, E2E (`final_validation_stale`). The "fix it by hashing main" wrong answer, ruled out by measurement |
| **MV3** | the band check on the resolved destination removed | **3 reds, all T8n(W9)** — including "NOTHING is written into main's band", i.e. the mutant writes into it |

MV1's reach into W9 is correct, not collateral: W9's exit-2 exists *because* the fallback made main's
band reachable, so removing the fallback removes the route and the token with it.

Nothing here is baseline-green-by-design: every V1 assertion depends on the verb existing.

## One correction made during this pass

`T8m(W5)`'s record read was unguarded, so **MV1 crashed the suite** at that line and hid `T8n`
entirely behind one stack trace (8 reds visible instead of 12). Guarded in the file's own idiom, and
the mutant re-run — the same discipline the earlier passes applied to `T8`/`T8l`. Worth naming because
the first MV1 run *looked* like a complete result and was not.

## Recorded, not pinned (the two gaps the implementer named)

1. **A full `cmdFinalize`** — archive + closure — in the worktree lane. I drive the real `--check` CLI
   and the real gate, not the whole transaction. Building it means a claimed state file plus a
   committed implementation and a gh mock in a **consumer** repo, and the property it would add over
   the `--check` E2E is the archive/closure half, which `#902` arm A already pins on the self-host
   fixture. Judged not worth a second terminal fixture; recorded.
2. **Two linked worktrees carrying the same project.** `resolveRecordFolder` looks at this tree and
   main only, so a second worktree's folder is never written. Reachable to build, but what it would
   assert is the *absence* of a route nobody has asked for — a pin against a mechanism that does not
   exist. Recorded per additive derivation.

## FINAL suites — real exit codes, serial, explicit `cd`, `pwd` printed

| command | exit | result |
|---|---|---|
| `node scripts/test-claim-hardening.js` | **0** | 557 assertions |
| `node scripts/test-finalize-door.js` | **0** | **233** assertions |
| `node scripts/test-validation-runner.js` | **0** | PASSED |
| `node scripts/test-bundle-finalize.js` | **0** | 149 tests (untouched) |
| `node scripts/test-spawn-classification.js` | **0** | no breach (no new spawn site) |
| `node scripts/simulate-workflow-walkthrough.js` (**full scope**) | **0** | **198/198**, 2079 spawns |
