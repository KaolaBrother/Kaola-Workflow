# Implementation of issue #931 — the collision the committed record now names

**Baseline:** `68cb48f4a71c1d125d403ed7e251d47d7077b730` (branch `main`).
**Verification tier: `tests-green`.**

Four files changed, all `*sink-merge.js`. No test file was written, edited or deleted. `claim.js`,
`simulate-workflow-walkthrough.js` and `test-sink-merge.js` were **read only** — they have other
writers in this session.

---

## The result produced

A line in the **committed** `finalization-summary.md` that names the pre-existing unsuffixed
directory, written whenever the sink's archive was pushed off the plain path by a directory that was
already there, and absent when it was not. It is a durable record, not a finding: `sinkFindings` is
untouched, so no `findings` key reaches the envelope and no `sink-merge: FINDING` reaches stderr.

### The exact bytes the committed record now carries

Rendered from the **shipped** module (a copy whose only edit was a widened `module.exports`, loaded
from a temporary sibling file that was deleted in a `finally`; no repo file was modified). This is
the whole archived summary for a collision run, not an excerpt:

```
# Finalization Summary

ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archive_collision: kaola-workflow/archive/issue-93101/ already existed, so this run was archived to kaola-workflow/archive/issue-93101.archived-2026-08-03T17-16-00-815Z/ instead. The pre-existing directory was left exactly where it was — a SECOND archive standing for this project, no part of this one. What it holds, and whether the repository tracks it at all, is not recorded here: read it before treating this archive as the run's whole record.

archived_paths:
- kaola-workflow/archive/issue-93101.archived-2026-08-03T17-16-00-815Z/finalization-summary.md
- kaola-workflow/archive/issue-93101.archived-2026-08-03T17-16-00-815Z/workflow-state.md
```

The same probe drove the two negative shapes:

| Input | `describeArchiveCollision` |
|---|---|
| dest == plain path (no collision) | `null` — and the rendered summary carries **no** `archive_collision` line |
| dest suffixed, plain path since removed | `null` |

The `archive_collision` line is one line, so `collisionStatementLines` sees exactly one statement.

### Wording, and the two constraints it is shaped by

- **Repo-relative.** The text contains no bare `.cache/...` token, so `closure-audit.js`'s citation
  scanner cannot read it as a citation of the archive that carries it. Asserted through the shipped
  `archiveCitedMissing` by clause 5 of both arms, armed by (n0).
- **Only what was measured.** It states that the directory existed and was left in place — both
  driven facts. It does **not** claim tracked-ness: I record none, and the sentence says so
  explicitly rather than implying either shape. Tracked-ness is welcome per the brief but not
  demanded, and detecting it would add a git call inside a writer whose whole discipline is that it
  cannot fail the operation it reports on.

---

## What changed, per file

The change is the same three edits in every copy. Canonical and codex are byte-identical (copied,
not re-typed); gitlab and gitea carry the same code with the comment condensed to each port's own
register, written after reading their surrounding code.

| File | sha256[0:16] before → after | lines |
|---|---|---|
| `scripts/kaola-workflow-sink-merge.js` | `243d34956ea05430` → `bc6b84907c929697` | +58 −12 → 3143 |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | `243d34956ea05430` → `bc6b84907c929697` | identical to canonical |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | `c35bea128d0b3d30` → `2f3064152cfa2285` | +43 −6 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | `115d18159d780440` → `9f7cf4599e8974b5` | +43 −6 |

Total diffstat: `4 files changed, 190 insertions(+), 12 deletions(-)`.

### 1. New `describeArchiveCollision(mainRoot, project, archiveDestRel)`

Canonical `:143`, codex `:143`, gitlab `:80`, gitea `:80`.

```js
function describeArchiveCollision(mainRoot, project, archiveDestRel) {
  if (!archiveDestRel) return null;
  const plainRel = 'kaola-workflow/archive/' + project;
  if (archiveDestRel.replace(/\/+$/, '') === plainRel) return null;
  try {
    if (!fs.statSync(path.join(mainRoot, plainRel)).isDirectory()) return null;
  } catch (_) { return null; }
  return plainRel + '/ already existed, so this run was archived to ' + archiveDestRel + '/ instead. '
    + 'The pre-existing directory was left exactly where it was — a SECOND archive standing for this '
    + 'project, no part of this one. What it holds, and whether the repository tracks it at all, is '
    + 'not recorded here: read it before treating this archive as the run\'s whole record.';
}
```

**Why the inference is sound for BOTH suffix sites**, which I checked in all four editions rather
than assuming from the brief. Every copy builds the destination identically —

```
dest = path.join(archiveBase, project + (suffix || ''));
if (fs.existsSync(dest)) dest += '.archived-' + new Date().toISOString().replace(/[:.]/g, '-');
```

— at `claim.js` root/codex `:2518-2519` (linked-run) and `:2614-2615` (in-place), gitlab `:2252-2253`
and `:2346-2347`, gitea `:2251-2252` and `:2345-2346`. The sink passes `suffix` as `undefined` at
root/codex `sink-merge.js:2126`, gitlab `:1926`, gitea `:1919`, so the dest is the plain path or the
plain path plus `.archived-<ts>` and nothing else. A dest differing from the plain path is therefore
the destination-exists branch, from either site. `receipt.archive_dest` is POSIX-normalised
identically in every edition (`path.relative(...).split(path.sep).join('/')`).

The existence probe is not redundant with the suffix test — it is what makes the sentence true rather
than merely likely. If the plain directory has since been removed, the function reports nothing
instead of pointing a reader at something that is not there.

### 2. `persistSinkFindingsToSummary` takes a third argument

Canonical/codex `:171`, gitlab/gitea `:102`. The gate widened by one clause and one `lines.push`
added after `post_rebase_tests`:

```js
function persistSinkFindingsToSummary(destDir, postRebaseTests, archiveCollision) {
  if (!destDir) return null;
  if (!sinkFindings.length && !postRebaseTests && !archiveCollision) return null;
  ...
    if (archiveCollision) lines.push('archive_collision: ' + archiveCollision, '');
```

Everything else in the writer is untouched: the `/^## Sink Findings$/m` idempotency check, the
`writeFileAtomicReplace`, and the swallow-on-error `catch (_) { return null; }` that keeps a
measurement writer unable to fail the operation it reports on.

### 3. The call site at the `finalize` step

Canonical/codex `:2294`, gitlab `:2063`, gitea `:2056`:

```js
persistSinkFindingsToSummary(resolveRunRecordDir(mainRoot, args.project, receipt.archive_dest),
  receipt.post_rebase_tests || null,
  describeArchiveCollision(mainRoot, args.project, receipt.archive_dest));
```

**This writer and not `persistArchivedPathsToSummary`,** per the brief's measured constraint: that
writer early-returns on an empty staged-path list (`sink-merge.js:186`), so a disclosure behind it
goes silent on the gitignored-archive-band shape (#893 w10 / #832 q). The chosen call site has no
such gate — it runs unconditionally inside the `finalize` step, after the `archiveFailure` refusal
and before `stepDone('finalize')`, which is also the last moment before `archive_commit` stages the
archive. At that moment the dest is set and the pre-existing directory is still on disk to probe, so
the sentence rides the sink's own commit.

`stagedPathsUnder`'s NUL-only splitting was not touched. `archived_paths` keeps its type, its
present-and-empty initialisation at `:1256`, and its `docs/api.md` contract.

---

## Verification

Every command was run from `/Users/ylpromax5/Workspace/Kaola-Workflow` unless a mirror path is named.
Exit codes are the process's own, never read through a pipe.

### Before (baseline, `68cb48f4`, no production code changed)

```
$ node scripts/test-sink-merge.js
FAIL: #931 n1: the committed record must NAME kaola-workflow/archive/issue-93101/ ...
FAIL: #931 n2: the committed record must NAME kaola-workflow/archive/issue-93102/ ...
Sink-merge (#694/#700/#705/#707/#715/#746/#832/#893/#923/#931) test suite FAILED: 2 failed, 671 passed.
EXIT=1
```

Exactly the two the test author reported, with the same committed bytes.

### After

| Command | Exit | Result |
|---|---|---|
| `node scripts/test-sink-merge.js` | **0** | `test suite passed: 693 assertions` |
| `node scripts/validate-script-sync.js` | **0** | `15 common scripts, 27 byte-identical groups, ... 4 Oracle Kernel copies identical at HEAD` |
| `node --check scripts/kaola-workflow-sink-merge.js` | **0** | |
| `node --check plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | **0** | |
| `node --check plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | **0** | |
| `node --check plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | **0** | |
| `node scripts/edition-sync.js --check` | **0** | `8 forge aggregator ports in parity; kernel parity verified at HEAD` |
| `node scripts/generate-routing-surfaces.js --check` | **0** | `all 18 surfaces byte-match the skeleton` |
| `node <clone>/scripts/simulate-workflow-walkthrough.js` | **0** | `scenarios:202, ran:202, passed:202, failed:0` — full scope, not sharded |

693 assertions exceeds the 673 the test author measured with their own scratch fix, because their
four-edition sweep (n4) landed while I was working; 693 is the count with n4 present and green.

`validate-script-sync.js` green is the positive evidence that canonical and codex stayed
byte-identical — both are `bc6b84907c9296975a76b961b6f771a3a7698a4c3184f0144e1877f6b77d0926`.

### The walkthrough, and the false red I had to clear first

The first walkthrough run was against a `git archive HEAD | tar -x` export with my four files
overlaid, and it **failed** at `testContractValidatorMissingTag`
(`contracts script must exit non-zero when git tag is absent, got: 0`).

That red was my mirror, not my change, and I drove the control rather than assuming it.
`validate-workflow-contracts.js:665` gates the whole tag check on `exists('.git')`, and a
`git archive` export has no `.git`, so the check is skipped and the script exits 0. Two-way probe,
same mocked always-failing `git` on `PATH`, with the script byte-identical (untouched by me) in both:

```
working tree copy → EXIT=1  (assertion satisfied)
git-archive export → EXIT=0 (assertion violated)
```

I then re-ran the walkthrough from a **`git clone`** of the repo — a real `.git`, HEAD at
`68cb48f4`, tag `kaola-workflow--v9.5.2` fetched, `git status --porcelain` showing only my four
files — and it passed 202/202 at exit 0. That clone is also what isolates the run from the other
agents' concurrent in-progress edits to `simulate-workflow-walkthrough.js` and `test-sink-merge.js`.

### Mutation proof — two legs, on a scratch mirror

Never `git checkout --` in the working tree; both legs ran against a copy under the session
scratchpad, with `scripts/test-sink-merge.js` byte-identical to the working tree's (verified by
`diff -q`) so the pins doing the failing are the real ones.

**Leg 1 — the whole change reverted, all four copies** (`git show HEAD:<path>` into the mirror;
`grep -c archive_collision` = 0 in each):

```
FAIL: #931 n1: the committed record must NAME kaola-workflow/archive/issue-93101/ ...
FAIL: #931 n2: the committed record must NAME kaola-workflow/archive/issue-93102/ ...
FAIL: #931 n4: no disclosure was observed by (n1)/(n2), so there is no marker to sweep the editions for.
Sink-merge test suite FAILED: 3 failed, 671 passed.
EXIT=1
```

**Leg 2 — gitlab port alone reverted**, root/codex/gitea carrying the fix (`archive_collision`
occurrences: root=2 codex=2 gitlab=0 gitea=2):

```
FAIL: #931 n4 (gitlab): this edition's sink modules do not carry the collision disclosure the canonical copy emits...
Sink-merge test suite FAILED: 1 failed, 692 passed.
EXIT=1
```

**The gitea port has the same proof, measured for real rather than staged.** My first post-fix run
happened while gitlab was edited and gitea was not, and it failed exactly there:

```
FAIL: #931 n4 (gitea): ... Missing fragment(s): ["archive_collision: "," already existed, so this run was archived to ", ...]
Sink-merge test suite FAILED: 1 failed, 692 passed.
```

So each of the three non-calibration copies is independently load-bearing, and the canonical
producer is load-bearing for the behavioural arms.

All scratch mirrors were removed afterwards; the working tree carries only the four files above
(plus the other agents' own modifications, which I did not touch).

---

## Things the lead should decide

1. **Documentation is owed and I did not write it.** The brief scoped me to the four `*sink-merge.js`
   files, so I left the docs alone rather than widening scope. Two surfaces need a pass:
   - `docs/api.md:847-857` documents the `## Sink Findings` block and the `archived_paths:` list.
     Nothing there is now **false** — it describes `archived_paths` specifically and does not claim
     the block is a closed set — but `archive_collision` is a new field of the durable record and is
     documented nowhere.
   - `CHANGELOG.md` under `[Unreleased]`, per CLAUDE.md's user-visible-change rule.

2. **One collision shape is still silent, by scope.** The disclosure fires when *this sink* archived
   (`receipt.archive_dest` set — the sole-archiver posture, which is the incident and both pinned
   arms). In the keep-worktree posture `cmdFinalize` did the archiving and the sink has no dest, so a
   collision produced there is not disclosed. Closing that means writing in `claim.js`, which has
   another writer this session and which the brief told me to stop rather than edit. Flagging, not
   acting.

3. **The forge ports are read-and-ported, not driven.** `glab` and `tea` are both absent on this box
   (`command -v` → nothing), so `test-gitlab-sinks.js` / `test-gitea-sinks.js` cannot be run here.
   What backs those two copies is `node --check`, the (n4) static sweep, and my having read each
   port's surrounding code before editing rather than pasting canonical's diff. The sweep reads text,
   not behaviour — a port carrying the sentence but not reaching the code that writes it would pass
   it. I checked the wiring by hand in all four (definition, widened signature, `lines.push`, and the
   call site all present in each) but that is a reading, not a run.

4. **No test was edited, and I found none defective.** Every clause the test author pinned was
   satisfiable as written, including the (n3) no-fabrication control and the (n0)-armed citation
   clause.

---
---

# Round 2 — repairing R1 and R4

**Verification tier: `tests-green`.** Same four files; still no test file written, edited or deleted.

The adversarial verdict on round 1 was correct and the counterexample was real. My round-1
`describeArchiveCollision` probed the disk itself with `fs.statSync(plain).isDirectory()`, which is an
**existence-only audit** — and the file already names that exact trap at `pruneSinkArchiveSkeleton`:
`resolveSinkReceiptPath` falls back to the ARCHIVE receipt path when main holds no live folder,
`writeSinkReceipt` mkdir -p's it, so the sink manufactures `kaola-workflow/archive/<project>/.cache/`
itself, `archiveProjectDir` suffixes around that, and my probe called it a pre-existing archive. The
sentence was then committed and pushed with every clause false, and `disposeSinkJournals` deleted the
directory it told the reader to go and read. I reproduced it before fixing it, and I re-used the
verifier's own driver to do so rather than building a friendlier instrument.

## What changed

**The disclosure no longer asks whether something EXISTS at the plain path. It asks whether a REAL
ARCHIVE stands there** — a different question, and the gap between the two was the whole defect.

1. **`describeArchiveCollision` no longer touches the disk.** Signature is now
   `(project, archiveDestRel, priorArchiveExisted)`; it is handed the answer and returns null unless
   both a suffixed dest and a real prior archive are true. A function that formats a sentence cannot
   also be the thing that decides whether the sentence is true.

2. **New `realArchiveAtPlainPath(mainRoot, project)`** makes that decision, and rules out the two
   things that sit at that path without being archives:
   ```js
   function realArchiveAtPlainPath(mainRoot, project) {
     const dir = path.join(mainRoot, 'kaola-workflow', 'archive', project);
     let entries;
     try { entries = fs.readdirSync(dir); } catch (_) { return false; }
     if (entries.length === 0) return false;
     if (entries.length > 1 || entries[0] !== '.cache') return true;
     try {
       return fs.readdirSync(path.join(dir, '.cache')).some(name => !SINK_STAGE_SKIP.has(name));
     } catch (_) { return false; }
   }
   ```
   `SINK_STAGE_SKIP` (`sink-merge.js:1369` canonical, `:1393` gitlab, `:1386` gitea) is the existing
   `Set(['sink-receipt.json','sink-fallback.json'])` that the staging excludes and
   `disposeSinkJournals` removes — reused, not restated, so there is one list of what a sink journal is.

   `pruneSinkArchiveSkeleton` encodes the same discrimination and I deliberately did **not** reuse its
   predicate verbatim: it demands an **empty** `.cache/`, because it runs after the journals are
   disposed, whereas the journal is sitting there for the whole of the transaction this reports on.
   That is the mis-fire the verifier predicted for "route two", and it is why this is a sibling
   predicate rather than a call to that one.

3. **R4** — the `(#700 c)` pin claim is gone from both port comments. They now state the durable fact
   (`recordSinkFinding` would put a FINDING on stderr and a `findings` key on the envelope of a sink
   that completed normally; **this disclosure must add neither**) with no claim about a test that
   exists only in the canonical suite. Canonical keeps `(#700 c)`, where it is real.
   `grep -c '#700 c'` → **0** in both ports.

### I did NOT take the route the brief leaned toward, and the reason is measured

Both you and the verifier favoured capturing the plain path's existence **at transaction start**. I
built that first, then drove it, and it does not survive its own evidence:

- **It is not independently load-bearing.** With the discriminating predicate in place, moving the
  probe from transaction start back to the finalize call site (mutation M1) left `control`, `resume`
  and `collision` all correct on gitlab, and the full sink suite green at 745 assertions. No shape I
  could drive distinguishes the two timings.
- **It is answering too early to be right.** `archiveProjectDir` makes the suffix decision at the
  finalize step, *after* the merge. An archive the merge step brings to main after the transaction
  opened is a genuine collision, and an answer captured before the merge reports it as none. The late
  answer is the current one; the early answer is stale by construction.
- **Its only remaining argument is an unobserved failure class** — that `SINK_STAGE_SKIP` might one
  day stop naming every journal. Per *derive additively*, that is recorded here, not built. And it
  would only half-help anyway: on a resume the skeleton already exists at transaction start, so that
  coupling survives the early capture regardless.

So the shipped fix is the predicate alone, evaluated beside the `archiveProjectDir` call whose
destination it explains. **The capture-at-start half was removed after measuring it, not skipped.**
Say the word if you want it back and I will restore it.

### R3 is NOT closed, and the early capture would not have closed it

You asked me to say so if capturing at transaction start closed R3 for free. It does not, and this is
independent of which route I took: R3 is the loss of `receipt.archive_dest` in the crash window at
`:2233`–`:2295`. A persisted "did a prior archive exist" flag does not restore the destination path,
and `describeArchiveCollision` returns null on a missing dest at its first line. Closing R3 means
persisting the dest (or the sentence) across that window. Not built — unobserved, per your direction.

## Verification

### Suites, on the shipped code

| Command | Exit | Result |
|---|---|---|
| `node scripts/test-sink-merge.js` | **0** | `test suite passed: 745 assertions` |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | **0** | `GitLab sink tests passed` |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | **0** | `Gitea sink tests passed` |
| `node scripts/validate-script-sync.js` | **0** | canonical/codex byte-identical (1 unique sha256 across the pair) |
| `node --check` × 4 edited files | **0** each | |
| `node <clone>/scripts/simulate-workflow-walkthrough.js` | **0** | `scenarios:202, ran:202, passed:202, failed:0` — full scope |

745 assertions, up from round 1's 693: tests-931's new (n5) control landed and is green against this
producer. The walkthrough ran from a fresh `git clone` at `68cb48f4` carrying **only** my four files,
so it is free of the #930 agent's concurrent `*claim.js` edits.

**R5 acknowledged and corrected.** My round-1 claim that the port suites "cannot be run here" was
wrong. `glab` and `tea` are absent, but both suites drive their forge through
`KAOLA_GLAB_MOCK_SCRIPT` / `KAOLA_TEA_MOCK_SCRIPT`, not the CLI. Both are now run above, green, and
they are what would have caught R1's port half in round 1. I should have tried the command instead of
inferring its outcome from a missing binary.

### R1 driven to a result, on the verifier's own instrument

`drive-collision.js` unchanged for the `control`/`collision` modes; I copied it to `drive-resume.js`
and added one mode (`resume`: abort run 1 after preflight with
`KAOLA_WORKFLOW_SINK_ABORT_AFTER=preflight`, leaving the sink's own skeleton, then resume). Measured:

```
run1 abort exit: 99
skeleton at plain path after run1: [".cache"]
  its .cache holds: ["sink-receipt.json"]
```

Every cell below is the committed record read out of `git show HEAD:<archive>/finalization-summary.md`:

| edition | mode | prior archive | archive_dest | `archive_collision` — SHIPPED | — MUTATED |
|---|---|---|---|---|---|
| canonical | control | none | suffixed | **absent** ✓ | **present — FALSE** |
| canonical | collision | real, untracked | suffixed | present ✓ | present |
| gitlab | control | none | suffixed | **absent** ✓ | **present — FALSE** |
| gitlab | resume | none (own skeleton) | suffixed | **absent** ✓ | **present — FALSE** |
| gitlab | collision | real, untracked | suffixed | present ✓ | present |
| gitea | control | none | suffixed | **absent** ✓ | **present — FALSE** |
| gitea | resume | none (own skeleton) | suffixed | **absent** ✓ | **present — FALSE** |
| gitea | collision | real, untracked | suffixed | present ✓ | present |

The control rows still produce a **suffixed** `archive_dest` — the R1 trigger is fully live, the sink
still manufactures and prunes its own skeleton, `prior dir still on disk: false` confirms the prune —
and the record simply no longer claims a collision. The axis moved; only the false statement is gone.

(canonical's driver run refuses at `closure` because the `gh` PATH shim's stateful close does not take
in this harness — `gh issue close exited 0 … but the issue is still OPEN`. The archive still commits
and pushes; a refusal envelope carries no `receipt`, so the driver's `archive_dest` reads null and it
looks at the plain path. Those two canonical rows were therefore read directly from `git ls-tree` +
`git show` at the real suffixed path, not from the driver's summary line.)

### Mutation proof — the discrimination is load-bearing, proven twice

Scratch mirrors only; `git checkout --` was never used on the working tree.

**Against the driver** (mutation = `realArchiveAtPlainPath` reverted to
`fs.statSync(dir).isDirectory()`, nothing else changed): the right-hand column above. R1 returns
verbatim on **six of six** non-collision cells across three editions, including the resume shape.

**Against the authored suite** — the stronger proof, because the judge is the test author's own pin:

```
FAIL: #931 n5 root/none:   NOTHING pre-existed at kaola-workflow/archive/issue-93160 …
FAIL: #931 n5 codex/none:  NOTHING pre-existed at kaola-workflow/archive/issue-93161 …
FAIL: #931 n5 gitlab/none: NOTHING pre-existed at kaola-workflow/archive/issue-93162 …
FAIL: #931 n5 gitea/none:  NOTHING pre-existed at kaola-workflow/archive/issue-93163 …
Sink-merge test suite FAILED: 4 failed, 741 passed.
EXIT=1
```

(n5) is armed on all four editions, red against the mutation and green against the shipped code.

### The committed bytes, unchanged in wording

Read from `git show HEAD:…` after a real collision run on the shipped gitlab port:

```
# Finalization Summary

ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archive_collision: kaola-workflow/archive/issue-93301/ already existed, so this run was archived to kaola-workflow/archive/issue-93301.archived-2026-08-03T18-23-20-401Z/ instead. The pre-existing directory was left exactly where it was — a SECOND archive standing for this project, no part of this one. What it holds, and whether the repository tracks it at all, is not recorded here: read it before treating this archive as the run's whole record.

archived_paths:
- kaola-workflow/archive/issue-93301.archived-2026-08-03T18-23-20-401Z/.cache/final-validation.md
- kaola-workflow/archive/issue-93301.archived-2026-08-03T18-23-20-401Z/.cache/run-gaps.json
- kaola-workflow/archive/issue-93301.archived-2026-08-03T18-23-20-401Z/finalization-summary.md
- kaola-workflow/archive/issue-93301.archived-2026-08-03T18-23-20-401Z/mission-list.md
- kaola-workflow/archive/issue-93301.archived-2026-08-03T18-23-20-401Z/workflow-state.md
```

and `git status --porcelain -uall` in that same fixture shows the abandoned archive still there,
untracked — `?? kaola-workflow/archive/issue-93301/workflow-state.md` — which is the loss the sentence
now discloses and every clause of it is true.

## Final file state

Diffstat against `68cb48f4`: `4 files changed, 356 insertions(+), 12 deletions(-)`.

| File | lines added |
|---|---|
| `scripts/kaola-workflow-sink-merge.js` | +104 −12 |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | byte-identical to canonical |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | +80 −6 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | +80 −6 |

## Still open, unchanged from round 1

- **R6 / docs.** `docs/api.md:847-857` and `CHANGELOG.md [Unreleased]` still owe an `archive_collision`
  entry. Out of my scope both rounds.
- **R3.** Not built, per your direction; see above for why the route you floated would not have closed
  it either.
- **The keep-worktree posture** still discloses nothing, because `archive_dest` is unset there. Closing
  it means writing `claim.js`, which has another writer.

---
---

# Round 3 — closing R7 (the phantom over a torn temp file)

**Verification tier: `tests-green`.** Same four files. No test file written, edited or deleted.

R7 is confirmed and closed. It is the same class as R1 arriving through a door the round-2 predicate
did not cover, so it is an incomplete fix rather than a new mechanism — I treated it that way.

## The hole

`realArchiveAtPlainPath` read any `.cache/` entry outside `SINK_STAGE_SKIP` as proof a real archive
stood there. `SINK_STAGE_SKIP` names two basenames; `adaptiveSchema.writeFileAtomicReplace`
(`adaptive-schema.js:448`) creates a third form —

```js
const tmp = path.join(dir, '.' + path.basename(filePath) + '.' + process.pid + '.' + Date.now() + '.'
  + Math.random().toString(16).slice(2) + '.tmp');
```

— and unlinks it only in its `catch` (`:459`), so a hard kill between `openSync` and `renameSync`
strands one. In the `#832` posture that directory is exactly
`kaola-workflow/archive/<project>/.cache/`, and the residue is **permanent**: `disposeSinkJournals`
unlinks two known basenames, `pruneSinkArchiveSkeleton` refuses a non-empty `.cache/`. One torn write
therefore makes every later sink for that project repeat the same false line into its committed record.

## The fix

One arm added to the predicate, in all four copies:

```js
    return fs.readdirSync(path.join(dir, '.cache'))
      .some(name => !SINK_STAGE_SKIP.has(name) && !isAtomicWriteResidue(name));
```

```js
function isAtomicWriteResidue(name) {
  return name.startsWith('.') && name.endsWith('.tmp');
}
```

**Derived from the writer, and deliberately NOT a reconstruction of its name.** I keyed on the
invariant of the construction above — the residue is a **dot-prefixed `.tmp` sibling** — rather than
on the `pid` / `Date.now()` / `Math.random()` layout, because that layout is the part free to change
and matching it would be the third hand-maintained form you asked me to avoid. Nothing the workflow
archives as run evidence is a dot-prefixed `.tmp`. (An exported predicate on `adaptive-schema.js`
would couple the two ends harder still, but that file is outside the four-file scope and is itself a
×4 byte-identical anchor; say the word if you want it moved there.)

**The coupling comment you asked for** is at the predicate in all four copies, naming what the set has
to keep meaning and which way it fails:

> WHAT SINK_STAGE_SKIP HAS TO KEEP MEANING, because this reader now depends on it: every file the sink
> itself writes into a project `.cache/`. Adding a third journal without adding it there makes this
> predicate call the sink's own residue a pre-existing archive — the failure is silent, it is toward
> OVER-reporting, and it is the phantom disclosure above coming back. If you are adding a journal, you
> are touching this.

## Verification

| Command | Exit | Result |
|---|---|---|
| `node scripts/test-sink-merge.js` | **0** | `test suite passed: 745 assertions` |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | **0** | `GitLab sink tests passed` |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | **0** | `Gitea sink tests passed` |
| `node scripts/validate-script-sync.js` | **0** | canonical/codex byte-identical |
| `node --check` × 4 | **0** each | def=1 use=1 of `isAtomicWriteResidue` in each copy |
| `node <clone>/scripts/simulate-workflow-walkthrough.js` | **0** | `scenarios:202, ran:202, passed:202, failed:0` |

The tree was settled for these runs — no other agent editing — so this is a real green. The
walkthrough again ran from a fresh `git clone` at `68cb48f4` carrying only my four files.

### The torn-temp shape, driven

Added a `torn` mode to a copy of the verifier's driver. It plants the **permanent end state**: no real
archive anywhere, and `kaola-workflow/archive/<project>/.cache/` holding nothing but one stranded
temp — which is what survives after `disposeSinkJournals` has removed the receipt and
`pruneSinkArchiveSkeleton` has refused the non-empty directory.

```
planted stranded temp: .sink-receipt.json.4242.1785782791237.a3f19c.tmp
plain .cache holds: [".sink-receipt.json.4242.1785782791237.a3f19c.tmp"]
plain dir holds:    [".cache"]
```

| edition | `archive_dest` | `archive_collision` SHIPPED | with the new arm REMOVED |
|---|---|---|---|
| canonical | suffixed | **absent** ✓ | **present — FALSE** |
| gitlab | suffixed | **absent** ✓ | **present — FALSE** |
| gitea | suffixed | **absent** ✓ | **present — FALSE** |

`archive_dest` is still suffixed on every shipped row: the stranded temp still forces the collision
suffix, so the trigger is fully live and only the false statement is gone. Canonical's two rows were
read directly via `git ls-tree` + `git show` at the real suffixed path, since its `gh` shim refuses at
`closure` and a refusal envelope carries no receipt.

### Mutation proof — the new arm is load-bearing

The mutation removes **only** `&& !isAtomicWriteResidue(name)`; nothing else differs. R7 returns on
**three of three** editions, verbatim (right-hand column above).

### Regression — R1/R2 shapes unchanged by the new arm

| edition | control | resume | collision |
|---|---|---|---|
| gitlab | absent ✓ | absent ✓ | **present** ✓ |
| gitea | absent ✓ | absent ✓ | **present** ✓ |

The true positive is intact; the two phantom shapes stay silent.

## Final state

`4 files changed, 440 insertions(+), 12 deletions(-)` against `68cb48f4` — canonical/codex +128 −12
each, gitlab and gitea +98 −6 each. Canonical and codex are byte-identical.

## Still open

- **R6 / docs** — `docs/api.md:847-857` and `CHANGELOG.md [Unreleased]` still owe an
  `archive_collision` entry. Outside the four-file scope in all three rounds.
- **R3** — unbuilt, per your unchanged direction.
- **The keep-worktree posture** — `archive_dest` is unset there, so no disclosure; closing it means
  writing `claim.js`.
