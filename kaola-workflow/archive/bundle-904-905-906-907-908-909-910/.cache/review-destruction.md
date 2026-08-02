# Adversarial review — destruction / evidence-loss lens

Branch `workflow/bundle-904-905-906-907-908-909-910` (uncommitted working tree in the linked
worktree). Read-only review; every fixture under the session scratchpad.

**Result: 4 CONFIRMED (reproduced) + 1 coverage finding, 4 SUSPECTED (reasoned only).**
The four central claims mostly hold — routes 1 and 2 of #906 both survived direct attack on their
headline behaviour. What broke is at the seams: what the orphan drags into git history, what
`--keep-output` does after its pre-flight, and two repository kinds the `.git` discriminator does
not recognise.

---

## CONFIRMED-1 [medium] — #906 route 1 carries the sink transaction JOURNALS into git history

**Defect.** The move-aside relocates main's live folder to
`<archive>/<project>/.orphan-main-live-<ts>/`, one directory level deeper than every
`:(exclude)` pathspec the sink builds — so `sink-receipt.json` / `sink-fallback.json` inside the
rescued folder are staged and committed, defeating all three mechanisms that exist to keep them out
of history.

The sink's excludes are EXACT paths, not patterns:

- `scripts/kaola-workflow-sink-merge.js:2241-2244`
  ```
  const excludeReceipt      = ':(exclude)' + projectPathspec + '.cache/sink-receipt.json';
  const excludeFallback     = ':(exclude)' + projectPathspec + '.cache/sink-fallback.json';
  const excludeLiveReceipt  = ':(exclude)kaola-workflow/' + args.project + '/.cache/sink-receipt.json';
  const excludeLiveFallback = ':(exclude)kaola-workflow/' + args.project + '/.cache/sink-fallback.json';
  ```
  `projectPathspec` = `kaola-workflow/archive/<project>/` (`:2234`). The orphan puts the journals at
  `kaola-workflow/archive/<project>/.orphan-main-live-<ts>/.cache/sink-receipt.json`, which matches
  none of the four. `scanArchiveTree`'s `SINK_STAGE_SKIP.has(entry.name)` drops them from
  `required[]`, so the blob gate does not complain either — they simply ride along in the broad
  `git add -- <projectPathspec>` at `:2348`.

The journals are the one class of file `claim.js` itself declares must never be committed anywhere
(`SINK_JOURNAL_RE`, `scripts/kaola-workflow-claim.js:45`, "never part of the deliverable, never
committed").

**Reproduction.**
```
$ node drive906_journal.js journal      # linked-worktree run, finalize, then crash-resume finalize
...
"main_live_orphan": "moved",
"main_live_orphaned_to": ".../archive/issue-9060/.orphan-main-live-2026-08-01T22-52-06-988Z"

$ cd <fixture>/main
$ PS='kaola-workflow/archive/issue-9060/'
$ git add -- "$PS" ":(exclude)${PS}.cache/sink-receipt.json" \
      ":(exclude)${PS}.cache/sink-fallback.json" \
      ":(exclude)kaola-workflow/issue-9060/.cache/sink-receipt.json" \
      ":(exclude)kaola-workflow/issue-9060/.cache/sink-fallback.json"
$ git ls-files --stage -- kaola-workflow/archive/issue-9060
100644 ... kaola-workflow/archive/issue-9060/.cache/evidence.md
100644 ... kaola-workflow/archive/issue-9060/.orphan-main-live-.../.cache/main-only-evidence.md
100644 ... kaola-workflow/archive/issue-9060/.orphan-main-live-.../.cache/sink-fallback.json   <-- journal
100644 ... kaola-workflow/archive/issue-9060/.orphan-main-live-.../.cache/sink-receipt.json    <-- journal
100644 ... kaola-workflow/archive/issue-9060/.orphan-main-live-.../workflow-state.md
100644 ... kaola-workflow/archive/issue-9060/finalization-summary.md
100644 ... kaola-workflow/archive/issue-9060/workflow-state.md
```
That is the sink's own pathspec set, verbatim, on a fixture the branch's own code produced.

**Reachability, stated exactly.** The journal is written to
`path.join(mainRoot, 'kaola-workflow', project, '.cache', 'sink-receipt.json')`
(`sink-merge.js:1089`) — precisely the folder the backstop moves. It is present whenever a sink (or
`sink-fallback`) has already touched this project in main before the finalize re-run, which is the
partial-run world the crash-resume backstop exists for. `excludeLiveReceipt`/`excludeLiveFallback`
exist only because that file is expected there. Not universal, but not exotic.

**All four editions.** Identical exclude construction in
`plugins/kaola-workflow-gitlab/.../kaola-gitlab-workflow-sink-merge.js:2001-2004` and
`plugins/kaola-workflow-gitea/.../kaola-gitea-workflow-sink-merge.js:1994-1997`.

**Anchor.** `scripts/kaola-workflow-claim.js:4209-4213` (orphan name), `sink-merge.js:2241-2244`.

---

## CONFIRMED-2 [medium] — #905 `--keep-output` silently DESTROYS a file created at its target name during the run

**Defect.** The no-overwrite rule is enforced only in `prepareKeepOutput`, *before* the child runs
(`scripts/kaola-workflow-validation-runner.js:806-818`). The actual write is an unconditional
`writeFileAtomicReplace` after the loop (`:934-943`), which replaces whatever is there. Anything
that comes into existence at `run-<index>.<stream>` between the pre-flight and the write is
destroyed with no warning and no change of exit code.

**Reproduction (a) — the validated child writes into the keep directory.**
```
$ mkdir -p keepB
$ node .../kaola-workflow-validation-runner.js run \
    --command "printf 'IRREPLACEABLE CHILD ARTEFACT\n' > $PWD/keepB/run-1.stdout; echo child-ran" \
    --timeout-minutes 1 --keep-output $PWD/keepB
$ cat keepB/run-1.stdout
child-ran                      # the child's artefact is gone; no warning, no refusal
```

**Reproduction (b) — two concurrent runs into one fresh directory.** This is the exact failure the
refusal was written for ("an earlier run's bytes read as this run's are a false diagnosis"), reached
by a route the pre-flight cannot see.
```
$ mkdir -p keepC
$ node ... run --command 'sleep 3; echo SLOW-RUN-OUTPUT' --keep-output keepC &
$ sleep 1
$ node ... run --command 'echo FAST-RUN-OUTPUT'          --keep-output keepC
fast run rc=1
$ wait; cat keepC/run-1.stdout
SLOW-RUN-OUTPUT                # FAST-RUN-OUTPUT existed, then did not. Exit codes identical to a clean run.
```
Both processes passed the existence check (neither file existed at their pre-flight), both wrote,
the later one won. The design note at `:770-775` says the tool "must not OVERWRITE"; it does.

**Anchor.** `scripts/kaola-workflow-validation-runner.js:806-818` (pre-flight only), `:934-943`
(unconditional replace).

---

## CONFIRMED-3 [medium] — #907's boundary discriminator misses two repository kinds git DOES collapse; the unclearable refusal survives for them

**Defect.** `isArchiveRepoBoundary` (`scripts/kaola-workflow-sink-merge.js:1352-1360`) decides
boundary-ness from `git -C <dir> rev-parse --show-toplevel`, treating *any* error and *any*
non-self answer as "not a boundary". Two `.git` directory configurations answer that way while the
OUTER repository still collapses the directory into a `160000` gitlink — so `scanArchiveTree` keeps
their siblings in `required[]`, the blob gate reports them missing forever, and the operator's own
lever fails. That is the exact bricked state #907 exists to remove.

**Reproduction** (git 2.50.1, Apple Git-155; fixture `scratchpad/g907/outer`):

| case | `rev-parse --show-toplevel` inside the dir | `isArchiveRepoBoundary` | outer `git add -A` |
|---|---|---|---|
| c1 nested repo | the dir itself | **true** (correct) | `160000` gitlink |
| c2 `.git` dir with `core.bare=true` | `fatal: this operation must be run in a work tree` | **false** | `160000` gitlink |
| c3 `.git` dir with `core.worktree` elsewhere | `<other path>` | **false** | `160000` gitlink |
| c4 junk `.git` FILE | `fatal: invalid gitfile format` | false (correct) | siblings as blobs |
| c5 broken gitfile | `fatal: not a git repository` | false (correct) | siblings as blobs |
| c6 `.git` symlink to a real gitdir | the dir itself | true (correct) | `160000` gitlink |

```
$ git ls-tree -r --name-only HEAD
arch/c1
arch/c2                 <-- gitlink; no blobs beneath
arch/c3                 <-- gitlink; no blobs beneath
arch/c4/sibling.md
arch/c5/sibling.md
arch/c6

$ git add -f -- arch/c2/sibling.md
fatal: Pathspec 'arch/c2/sibling.md' is in submodule 'arch/c2'
$ git add -f -- arch/c3/sibling.md
fatal: Pathspec 'arch/c3/sibling.md' is in submodule 'arch/c3'
```
`arch/c2/sibling.md` and `arch/c3/sibling.md` stay in `required[]`, can never become blobs, and
cannot be force-added — `sink_incomplete`, byte-identical on every re-run. This is precisely the
condition the new test's own oracle ("every path the refusal names must be one `git add -f` can
take", `scripts/test-sink-merge.js` z1) declares unacceptable; the test just never plants these two
shapes.

The false-positive direction is closed: I found no configuration where `isArchiveRepoBoundary`
answers true and the outer repository does not collapse, so nothing is dropped from `required[]`
that git would in fact commit.

**Anchor.** `scripts/kaola-workflow-sink-merge.js:1352-1360` (+ the three ports at the same
function).

---

## CONFIRMED-4 [low] — `--help` misstates what the retained bytes contain, in the under-warning direction

`usage()` (`scripts/kaola-workflow-validation-runner.js:1528-1531`) says:

> Retained bytes have absolute paths redacted and NOTHING ELSE

The implementation retains **raw** bytes with no redaction at all, and the code comment at `:919-921`
says so on purpose ("RAW bytes … a diagnosis usually needs the paths").

```
$ node ... run --command 'pwd; echo "HOME=$HOME"; echo "TMPDIR=$TMPDIR"' --keep-output keepD
$ cat keepD/run-1.stdout
/private/tmp/.../scratchpad/g905/repo
HOME=/var/folders/j6/.../T/kwv/4384c555a66f940e/home
TMPDIR=/var/folders/j6/.../T/kwv/4384c555a66f940e/tmp
```
An operator told paths are redacted may point `--keep-output` at a committed location believing
local absolute paths (which carry the account name and machine layout) are scrubbed. One-word fix in
prose, but it is the sentence whose whole job is to let the operator "choose the destination
accordingly".

---

## CONFIRMED-5 [low, coverage] — neither #906 destruction fix has any test on this branch

- `main_live_orphan` / `.orphan-main-live-` appears ONLY in the four implementations and in
  `docs/api.md:300`. No suite plants a surviving main live folder and asserts the rename.
- `uncomparable` appears in no suite (`grep -rn uncomparable scripts/test-*.js
  scripts/simulate-workflow-walkthrough.js` matches only `test-spawn-classification.js`, an
  unrelated use of the word).

Both are the "reader found nine defects after eleven green suites" class. The behaviours do work
today (see below) — what is missing is anything that would notice when they stop.

---

## Attacks that FAILED — these claims hold, measured

**#905 band check.** All six evasion routes refused with exit 2 and created nothing in the band:
`kaola-workflow/archive/x`, `kaola-workflow/archive/../archive/x`, a symlinked band parent,
`kaola-workflow/ARCHIVE/x` (case-insensitive APFS), a trailing slash, and `outside/../…/archive/x`.
A pre-existing `run-1.stdout` refuses and the earlier bytes are intact.

**#906 route 2 (`uncomparable[]`), on the cmdFinalize route.** One axis per fixture, main's live
folder holding exactly one extra entry:

| main-only entry | outcome |
|---|---|
| symlink at top level | REFUSE, exit 1, `mismatched: ["link.md"]`, main's copy survives |
| symlink named `.cache/final-validation.md` (exempt sidecar) | REFUSE, `mismatched: [".cache/final-validation.md"]` |
| dangling symlink | REFUSE |
| FIFO | REFUSE |
| plain file / `.cache/*.md` sidecar / `.cache/data.json` / empty dir | mirrored into the archive, nothing lost |

The headline incident shape (main-only symlink, including under an exempt sidecar name) is genuinely
fixed and fails closed.

**#906 route 1 happy path.** Exit 0, `status: closed`, the orphan lands inside the archive with its
`.cache/main-only-evidence.md` intact, main's live folder gone, `claim.js status` reports
`active: []` (no phantom claim), the scoped closure audit reports no new finding, and `git add` over
the archive stages every orphan file. `mainLive` as a symlink: the link is moved, the target's bytes
survive. Missing archive authority: the whole block is skipped (fail-safe), and
`resolveFinalizeAuthority` refuses upstream anyway. Band escape is not reachable from this call
site — on the source-missing path `finalizeAuthorityDir` comes from `findArchiveAuthorities`, which
only returns archive-band entries (`claim.js:3607`).

**#907 discriminator, benign cases.** A junk `.git` file, a broken gitfile, a `.git` symlink and a
bare-layout directory with no `.git` entry all classify the same way the outer repository does — no
regression against the measured "does not collapse the tree" premise.

**Suite.** `node scripts/test-validation-runner.js` run alone: `EXIT=0`, `test-validation-runner: PASSED`.

---

## SUSPECTED (reasoned, not reproduced)

1. **A main-only EMPTY directory is deleted uncompared.** It enters neither `sourceFiles`, nor
   `invalid[]`, nor `missing[]` (`claim.js:5458-5482`), so no half of the comparison sees it. Zero
   bytes, so no evidence loss — noted only because it is the one entry kind the new `uncomparable[]`
   key still cannot name. I could not drive the three no-mirror routes (release / watch-pr / abandon
   sweep) in the time available; on `cmdFinalize` the Step-8a mirror makes it moot.
2. **TOCTOU between verify and delete.** A file appearing in main's live folder between
   `verifyArchiveComplete(mainLive, dest)` (`claim.js:2552`) and `fs.rmSync(mainLive)` (`:2581`) is
   deleted uncompared. Inherent to the shape, pre-existing, not introduced here.
3. **`--keep-output` loses EVERYTHING on a crash, not a prefix.** `retained[]` buffers up to
   `MAX_OUTPUT_BYTES` × 2 streams × repetitions in memory and writes only after the last repetition
   (`validation-runner.js:898`, `:934`). The atomic-replace comment argues a torn log is worse than
   none; the buffering means a kill mid-loop yields none at all, which is the outcome the whole
   feature exists to remove. Stated trade-off, but the comment does not name this half.
4. **A symlinked orphan is committed as a `120000` blob pointing outside the tree.** The blob gate
   then reports the archive complete while a fresh clone gets a dangling link. Bytes survive locally,
   so this is an accuracy caveat rather than a loss.

---

## Fixtures (kept)

- `scratchpad/drive906.js`, `drive906_journal.js`, `drive906g.js` — #906 route 1
- `scratchpad/drive906c.js` (finalize route), `drive906d/e/f.js` (release route, did not reach the gate)
- `scratchpad/g907/outer` — the six `.git` discriminator cases
- `scratchpad/g905/repo`, `keepA…keepD` — #905 band + overwrite probes

---

# 2026-08-02 — the SUSPECTED list driven to a verdict

Re-review of the four reasoned-only items from the section above. **S1 CONFIRMED · S2 CONFIRMED
(trade-off, not defect) · S3 REFUTED as "widened", CONFIRMED as pre-existing-and-unchanged ·
S4 not driven (owned by a test author).**

**Measurement pin.** All measurements below were taken against a snapshot of the branch tree copied
to `scratchpad/pinned/` at `2026-08-01T23:02:35Z`, because `validation-runner.js` and
`sink-merge.js` were being edited concurrently. Re-checked afterwards against the live branch: both
of those files HAVE since changed, `claim.js` has not — and the three code shapes S1 and S2 rest on
are all still present in the live copies (`sink-merge.js:1413` symlinks still enter `required[]`,
`:1456` the blob probe is still `ls-tree -r -z --name-only`; `validation-runner.js:916/954` retention
is still buffered and written after the loop; `claim.js:4213` the move-aside is still a bare
`renameSync`). Both findings are live, not stale.

---

## S1 — CONFIRMED [high] · a symlinked orphan entry is committed as a `120000` blob, the sink reports SINKED, and a fresh clone gets a dangling link

**Verdict: confirmed, both halves, end to end through the real sink and a real clone.**

This is the shape the review brief called the worst: a green verdict over content that did not
travel. It is introduced by #906 route 1 specifically. Route 1 is the only path that puts a symlink
inside the archive band — the ordinary archive path uses `copyDir`, which follows links, and route 2
now REFUSES a main-only symlink outright (measured in the section above). Route 1 uses
`fs.renameSync` and runs **no comparison at all** (`claim.js:4213`), so the link is relocated
verbatim into a band whose downstream gate cannot tell a link from its content.

**Reproduction** (`scratchpad/drive_s1c.js`, fixture `scratchpad/kwS1c-cDyFhT`): linked-worktree
run → finalize → crash-resume state where main's live folder holds
`evidence-link.md -> <base>/outside-the-run-folder/big-evidence.md` (a target OUTSIDE the run
folder, carrying the real bytes) → finalize again (move-aside) → the real
`kaola-workflow-sink-merge.js --sink` → `git clone`.

```
pass2: exit=0 main_live_orphan=moved
orphan entry is a symlink on disk: true

=== SINK ===
exit=0 status=sinked                          <-- GREEN
archive_missing_paths=undefined               <-- the blob gate found nothing missing

=== ls-tree of the archive at main HEAD ===
100644 blob ... /.cache/evidence.md
100644 blob ... /.orphan-main-live-.../.cache/plain-main-only.md
120000 blob ... /.orphan-main-live-.../evidence-link.md      <-- the LINK, not the bytes
100644 blob ... /.orphan-main-live-.../workflow-state.md
100644 blob ... /finalization-summary.md
100644 blob ... /workflow-state.md
```

Fresh clone, once the absolute target is not present (i.e. on any other machine):

```
$ rm -rf <base>/outside-the-run-folder          # what "another machine" means for an absolute link
$ test -e .../evidence-link.md && echo YES || echo "NO  <<< DANGLING"
NO  <<< DANGLING
$ cat .../evidence-link.md
cat: .../evidence-link.md: No such file or directory
$ git -C fresh-clone status --porcelain
                                                # empty — git considers the clone complete and clean
```

**Why the gate cannot see it.** `scanArchiveTree` admits symlinks into `required[]`
(`sink-merge.js:1413`, `if (!entry.isFile() && !entry.isSymbolicLink()) continue;`) and
`blobPathsUnder` asks `ls-tree -r -z --name-only` (`:1456`), which lists a `120000` entry by name
exactly like a `100644` one. `missingBlobs` is therefore empty and `archive_commit` reads done.

**Scope, stated honestly.** This is *not* data loss: the bytes remain at the original absolute path
on the machine that ran it. It is a **green completeness verdict over content the archive does not
carry** — the archive survives a fresh clone as a broken pointer, and nothing anywhere says so.

---

## S2 — CONFIRMED [low] · a kill mid-loop loses ALL retained output, not a prefix — and this is a trade-off to record, not a defect to fix

**Verdict: confirmed, and I recommend recording it rather than changing the placement.**

```
=== CONTROL: 3 repetitions allowed to finish ===
  files: run-1.stderr run-1.stdout run-2.stderr run-2.stdout run-3.stderr run-3.stdout
  run-1.stdout: REP-OUTPUT-LINE

=== SIGTERM after ~5s (reps 1 and 2 had already completed) ===
  killed rc=143
  files on disk: []

=== SIGKILL after ~5s ===
  killed rc=137
  files on disk: []
```

Command `echo REP-OUTPUT-LINE; sleep 2` × 3 repetitions; killed at t≈5s, by which point two
repetitions had run to completion and their bytes were sitting in `retained[]`. Nothing reaches
disk. The stated design note (`validation-runner.js:764-786`) argues a torn log is worse than none;
it does not name the fact that the placement converts *every* interrupted run into none.

**Why I would not move it.** The constraint the placement exists for is real, and I measured it:
`--keep-output` is accepted for a destination inside the candidate band —

```
$ node ... run --command 'echo hi' --repetitions 2 --keep-output src/retained
  outcome= inconclusive  reasons= ['execution_identity_incomparable']
  files written into the candidate band: [run-1.stderr run-1.stdout run-2.stderr run-2.stdout]
```

— so a write inside the repetition loop would move the candidate digest between `preCandidate` and
`postCandidate` and the runner would report **its own log as `candidate_mutation`**. That is a false
RED on the validation verdict itself, which is strictly worse than losing a diagnostic aid. The
current placement is the only one that holds for a destination anywhere in the tree.

**What I would change: one sentence of prose.** The `--keep-output` note should say the bytes are
written after the last repetition, so an interrupted run retains nothing. Right now an operator who
kills a hung suite will look in the directory and find it empty with no explanation.

---

## S3 — REFUTED as "widened" · CONFIRMED as pre-existing and unchanged

**Verdict: the TOCTOU shape predates this bundle, and the bundle neither widened nor narrowed the
window. Measured, not reasoned.**

**Pre-existence.** The baseline at `main` already calls `verifyArchiveComplete(src, dest)` and
`verifyArchiveComplete(mainLive, dest)` before `fs.rmSync(src)` / `fs.rmSync(mainLive)` — same two
verifies, same two deletes, same gap (`main:scripts/kaola-workflow-claim.js:2492, 2525-2548`).
Nothing about the shape is new.

**Width, measured.** Both trees copied to `scratchpad/toctou/{base,branch}` and instrumented
identically: `process.hrtime.bigint()` captured the instant the `mainLive` verify returns and again
immediately before `fs.rmSync(mainLive)`. Same fixture (a linked-worktree run whose main live folder
holds one plain main-only file, so the path reaches the DELETE), 7 runs each:

```
base    n=7 median=0.3197ms  min=0.2796  max=3.9962   [0.2987, 0.2853, 0.2796, 0.3197, 3.9962, 0.4507, 0.3248]
branch  n=7 median=0.2616ms  min=0.2591  max=0.3074   [0.3074, 0.2609, 0.2889, 0.2591, 0.2616, 0.3001, 0.2601]
```

Indistinguishable (the baseline's single 4 ms sample is scheduling noise; every other sample on both
sides sits in 0.26–0.45 ms). The mechanism agrees: the only statement the bundle adds between the
verify and the delete is `repoWideIgnoredNames(mainRoot, uncomparableFromMain)`, which early-returns
with **no subprocess** when the array is empty (`claim.js:2723`) — and whenever the array is NOT
empty the branch returns `archive_incomplete` (`claim.js:2568`) and never reaches the delete. So no
path that reaches a delete gained any work.

**On "the move-aside changed what happens at that site" — it did not, because it is a different
site.** The move-aside is in `cmdFinalize`'s source-missing backstop (`claim.js:4200-4220`), not in
`archiveProjectDir`'s delete. It has no verify→delete window at all, because it performs **no
comparison whatsoever** — its safety comes entirely from being a rename rather than a delete. That
is the same property S1 exploits: nothing is destroyed, and nothing is checked either.

---

## S4 — not driven

A main-only EMPTY directory deleted uncompared. Left to the test author already driving it through
the three no-mirror routes, per instruction. Unchanged from the reasoning above: an empty directory
enters neither `sourceFiles`, nor `invalid[]`, nor `missing[]` (`claim.js:5458-5482`), so no half of
the comparison names it; it carries no bytes.

## Fixtures added this round

- `scratchpad/drive_s1c.js` + `scratchpad/kwS1c-*` — S1, sink + clone
- `scratchpad/keepK0` / `keepK1` / `keepK2` — S2, control + SIGTERM + SIGKILL
- `scratchpad/toctou/{base,branch}` (instrumented copies) + `toctou-{base,branch}.log` — S3
- `scratchpad/pinned/` — the 2026-08-01T23:02:35Z tree snapshot every measurement is bound to
