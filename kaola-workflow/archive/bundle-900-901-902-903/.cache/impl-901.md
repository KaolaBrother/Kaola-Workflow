# Implementation notes — issue #901 (sink drops gitignored archive evidence, silently)

**Verification tier: `tests-green` + `smoke-integration`.** The authored suites are green (they pin the
adjacent #832/#700/#520/#893 behaviour I had to preserve, not #901 itself — no test covers #901 yet,
see "Where a test is needed"), and the #901 behaviour itself is proven by driving the real sink
end-to-end on the premise report's own fixture, before and after, with mutation-proof positive
controls for both new gates.

Work is UNCOMMITTED in `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`
on branch `workflow/bundle-900-901-902-903`.

---

## Files changed (4 — two canonical + two byte-lockstep copies)

| file | why |
|---|---|
| `scripts/kaola-workflow-sink-merge.js` | canonical fix |
| `scripts/kaola-workflow-claim.js` | canonical fix |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | byte-lockstep copy (`COMMON_SCRIPTS`) |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | byte-lockstep copy (`COMMON_SCRIPTS`) |

`git diff --stat`: 448 insertions, 24 deletions across the four. No other tracked file touched. No test
file touched.

### What `validate-script-sync.js` required

`scripts/kaola-workflow-sink-merge.js` and `scripts/kaola-workflow-claim.js` are both in
`COMMON_SCRIPTS` (`scripts/validate-script-sync.js:46,51`), which enforces **byte-identity** between
`scripts/` and `plugins/kaola-workflow/scripts/`. I applied the identical edit by `cp`; `cmp` returns 0
for both pairs.

They are ALSO in `FORGE_EXPORT_SUPERSET_FAMILY` (`:485-486`), which requires the gitlab/gitea
hand-ports to export a **superset** of canonical's `module.exports`. **This constrained the design**: I
deliberately did NOT export the new claim.js helpers, because adding a canonical export would fail that
check and the forge ports are outside my write set.

`node scripts/validate-script-sync.js` currently exits **1**, and the drift it names is entirely a
sibling agent's in-flight work:
`kaola-workflow-closure-audit.js` (scripts/ vs plugins/, plus its two forge ports' export superset).
Neither of my files appears anywhere in that output. Verified with `cmp` (exit 0 both).

---

## Functions changed, with line refs (post-edit line numbers)

### `scripts/kaola-workflow-sink-merge.js`

**New module-level helpers** (placed after `sinkLandStagedUnion`, reusing its `SINK_STAGE_SKIP`):

- `requiredArchiveFiles(mainRoot, archiveRel)` — **:1319-1345**. Every regular file the archive holds
  on disk, repo-relative POSIX, minus the #520 journals (by `SINK_STAGE_SKIP` basename). Skips symlinks
  and any nested `.git/` — neither becomes a blob under the archive path, so requiring them could only
  manufacture a false incompleteness. Never throws.
- `ignoredUntrackedUnder(mainRoot, pathspec)` — **:1354-1360**. `git ls-files -o -i --exclude-standard
  -z -- <pathspec>`: the paths git would refuse to stage (untracked AND ignored). Per-FILE, which is the
  granularity the old dir probe could not reach. Index-aware, so an already-tracked path is correctly
  absent (needs no `-f`). Probe fault → empty set.
- `blobPathsUnder(mainRoot, commitish, pathspec)` — **:1365-1371**. `git ls-tree -r -z --name-only`:
  blobs only, which is what distinguishes "the archive dir exists at HEAD" from "this file is in the
  commit".

**`runSinkTransaction`, `step === 'archive_commit'`:**

- **:2169-2186** (criterion 1) — the per-FILE probe added beside the existing dir probe.
  `requiredPaths` + `forcePaths` (= requiredPaths ∩ ignored-untracked). The dir probe at **:2160-2168**
  is unchanged and still decides the whole-band case.
- **:2196-2210** (criteria 2+3) — `stageArchive()` replaces both `catch (_) {}` add sites. It runs the
  ordinary `git add -- <commitPaths> <excludes>` (unchanged argv, so #520's four excludes are intact),
  then `git add -f -- <forcePaths>` scoped to **only** files under this project's own archive path.
  Both statuses are **returned** as `addErrors`, not discarded.
- **:2212-2222** — `receipt.archive_forced_paths` + a stderr NOTE naming every force-added path.
  Overriding a rule the consumer wrote is recorded, never silent.
- **:2232-2234** — the second staging site now calls `stageArchive()` too (so `archived_paths`, computed
  at **:2228** between the two, already names the force-added files).
- **:2265-2276** (criterion 4) — `missingBlobs`: each `requiredPaths` entry checked against
  `blobPathsUnder(mainRoot, 'HEAD', archiveRel)`. Measured **unconditionally** (never gated on
  `archive_dest` — the keep-worktree posture, where the dest is unset, lost the same files).
  `receipt.archive_missing_paths` set when non-empty.
- **:2277-2295** (criterion 5, declined arm) — the #832 `skipped_gitignored` arm is otherwise unchanged;
  its warning now names the uncommitted count and the receipt itemizes every missing required file.
- **:2310-2337** (criteria 4+5, failed arm) — new refusal: `!archiveIgnored && missingBlobs.length` →
  `receipt.archive_commit = 'failed'`, `sinkEmit({result:'refuse', reason:'sink_incomplete',
  step:'archive_commit', archive_missing_paths, archive_add_errors, ...}, 1)`, returned **before
  teardown** so the branch, the worktree and the on-disk archive are all retained.

### `scripts/kaola-workflow-claim.js`

- `archiveProjectDir` **:2493-2513** (criterion 6b, the disposal gate) — before `fs.rmSync(src)` at
  :2515, every `ARCHIVE_CACHE_SIDECAR_MD` file the SOURCE holds must be PRESENT at dest. Folded into
  the existing `missing[]` refusal so no caller's contract changes. This is **presence only, not byte
  identity** — I did not touch what `verifyArchiveComplete` skips, per the brief.
- `classifyArchiveDisposition` **:2610-2632** (criterion 6a) — now uses the extracted
  `archiveRelFromRoot`; **the token derivation is unchanged, deliberately** (see "Deliberately NOT
  changed" #1).
- `archiveRelFromRoot(mainRoot, dest)` **:2634-2641** — the relativization, extracted so the classifier
  and the new probe ask about the same path.
- `ignoredArchiveEvidence(mainRoot, dest)` **:2643-2658** — the per-FILE ignored-evidence probe, with
  the #520 journals subtracted using the same regexp form already at :4257.
- `cmdFinalize` **:4230-4243** — a `deferred_to_sink` branch that names the covered evidence on
  `finalizeTx.archive_ignored_evidence` (durable on the emitted envelope) and on stderr.

### New output fields (added, never renamed/removed)

`receipt.archive_forced_paths`, `receipt.archive_missing_paths`, envelope `archive_missing_paths`,
envelope `archive_add_errors`, `finalize_transaction.archive_ignored_evidence`. All conditional on
being non-empty, so a run with nothing to report emits byte-identical output to before.

---

## Evidence

All exit codes read with `echo $?` **directly on the command**, or from `spawnSync().status` in the
Node drivers. Never through a pipe; never `${PIPESTATUS[0]}`.

Fixtures and logs: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/impl901/`

### A. The measured defect, before and after, on the premise report's own fixture

I copied the premise report's drivers (`p901/drive-901.js`, `p901/drive-901-sole.js`) and made
`repoRoot` a parameter, so the **identical fixture** is driven by the shipped sink (main root, at
`9b68b096`) and by the fixed sink (this worktree). Drivers: `impl901/drive.js`, `impl901/drive-sole.js`.
Logs: `BEFORE-drive.log`, `AFTER-drive.log`, `BEFORE-sole.log`, `AFTER-sole.log`.

Keep-worktree posture, three legs (`.gitignore` body is the only axis):

| leg | `.gitignore` | | exit | `steps.archive_commit` | `.cache` blobs missing at HEAD | missing from a FRESH CLONE | missing from `archived_paths` |
|---|---|---|---|---|---|---|---|
| IGNORED | `.cache/` | **before** | 0 | `done` | **5** | **5** | **5** |
| IGNORED | `.cache/` | **after** | 0 | `done` | **0** | **0** | **0** |
| CONTROL | `node_modules/` | before | 0 | `done` | 0 | 0 | 0 |
| CONTROL | `node_modules/` | after | 0 | `done` | 0 | 0 | 0 |
| BAND (#832) | `kaola-workflow/archive/` | before | 0 | `done` (`archive_commit:"skipped_gitignored"`) | 5 | 5 | 5 |
| BAND (#832) | `kaola-workflow/archive/` | after | 0 | `done` (`archive_commit:"skipped_gitignored"`) | 5 | 5 | 5 |

The archive commit itself went from **3 files changed** to **8 files changed**:

```
397232f chore: archive issue-330 [sink]
 .../archive/issue-330/.cache/doc-docking.md        |  3 +++
 .../archive/issue-330/.cache/doc-updater.md        |  3 +++
 .../archive/issue-330/.cache/final-validation.md   |  3 +++
 .../archive/issue-330/.cache/run-gaps-manual.md    |  3 +++
 .../archive/issue-330/.cache/run-gaps.json         |  1 +
 .../archive/issue-330/finalization-summary.md      | 19 +++++++++++++++++++
 kaola-workflow/archive/issue-330/mission-list.md   |  4 ++++
 kaola-workflow/archive/issue-330/workflow-state.md | 22 ++++++++++++++++++++++
 8 files changed, 58 insertions(+)
```

and `git ls-tree -r --name-only HEAD` (exit 0) now carries all five `.cache` blobs, as does a fresh
`git clone` of the pushed bare remote. `receipt.archive_forced_paths` names the five; the stderr NOTE
names them too.

**Sole-archiver posture** (`receipt.archive_dest` SET, so the #700 guard is live) — `.cache BLOBS at
HEAD` went from `[]` to all five, and `archived_paths` from 3 entries to 8. Its CONTROL leg refuses
`sink_blocked`/`foreign_dirt` identically before and after; the premise report already identified that
as a fixture artifact, not a finding.

**#832 preserved**: the BAND leg is byte-for-byte the same decision before and after —
`skipped_gitignored`, exit 0, archive retained on disk. The only change is that its receipt now
itemizes the 8 uncommitted required files in `archive_missing_paths`.

### B. Positive control — the blob gate (criterion 4) is ARMED, not merely green

Driver `impl901/drive-armed.js`; logs `BEFORE-armed.log`, `AFTER-armed.log`. Same fixture as the
IGNORED leg with **one axis** changed: `.cache/run-gaps.json` is mode `000`, so no `git add` (forced or
not) can index it. Axis verified in-run: `cat <file>` exit 1.

| | shipped sink | fixed sink |
|---|---|---|
| exit | **0** | **1** |
| `result` | `"ok"` | `"refuse"` |
| `reason` | — | `"sink_incomplete"` |
| `step` | — | `"archive_commit"` |
| `status` | `"sinked"` | absent |
| `steps.archive_commit` | `"done"` | absent (left NOT done → resumable) |
| `archive_missing_paths` | absent | all 5 `.cache` paths |
| `archive_add_errors` | absent | present |

The captured `archive_add_errors` contains exactly the signal `catch (_) {}` used to throw away:

```
git add -f: Command failed: ... add -f -- .../.cache/...
error: open("kaola-workflow/archive/issue-330/.cache/run-gaps.json"): Permission denied
error: unable to index file 'kaola-workflow/archive/issue-330/.cache/run-gaps.json'
fatal: adding files failed
```

Retention proven (criterion 5): `git rev-parse --verify workflow/issue-330` **exit 0** (the branch was
retained), archive still on disk with all five `.cache` files present.

> Reading note on that log: the line `-- branch still present after the run: false` is a **bug in my
> driver's own print expression** (`+` binds tighter than `===`), not a sink measurement. The
> authoritative line is the `git rev-parse --verify ... exit=0` immediately below it.

### C. Positive control — the disposal gate (criterion 6b) is ARMED

Under the shipped `copyDir` the sidecar exemption is **unreachable** (copyDir is fully recursive), so
the only available arming proof is to mutate `copyDir` into a lossy one. Two scratch mirrors of
`scripts/` (`impl901/mirror-shipped`, `impl901/mirror-fixed`) carry the **identical** copyDir mutation
(`KW901_DROP_SIDECAR` names one file to skip); the single axis between them is claim.js's disposal gate
(HEAD's vs. mine). Driver `impl901/drive-disposal.js`; logs `disposal-shipped.log`,
`disposal-fixed.log`, `disposal-fixed-control.log`. No repo file was mutated — the mirrors are outside
the tree, per the "mutation-prove via a scratch mirror" rule.

| axis | shipped claim.js | fixed claim.js |
|---|---|---|
| copyDir drops `.cache/final-validation.md` | `archived:true`; **live source DELETED**; the file exists **nowhere** | `archive_incomplete:true`, `missing:[".cache/final-validation.md"]`; **live source RETAINED** with the file intact |
| copyDir drops `.cache/run-gaps.json` (a NON-sidecar) | — | `missing:[".cache/run-gaps.json"]`, live retained — the pre-existing byte verifier still does its half |
| **NEGATIVE CONTROL**: mutation inert | — | `archived:true`, live deleted, all 5 `.cache` files at dest — **no false refusal** |

### D. The two new claim.js helpers, measured

Probe `impl901/probe-claim-fns.js` (log `probe-claim-fns.log`, exit 0). Because the helpers are
deliberately unexported (see the script-sync constraint above), the probe **lifts the function source
text out of the shipped file bytes** and evaluates it — what is measured is what ships, not a retyping.

- `.gitignore = ".cache/"` → returns exactly the five `.cache` evidence files. `sink-receipt.json` and
  `sink-fallback.json` **subtracted**; the three non-ignored siblings **not** named.
- **NEGATIVE CONTROL** `.gitignore = "node_modules/"` → `[]`.
- `archiveRelFromRoot`: inside-root → the rel path; outside-root → `null`; null args → `null`.
- The granularity claim, measured on the same fixture: `check-ignore -q` on the archive **directory**
  exits **1** under `.cache/` (hence the old blind `deferred_to_sink`) and **0** under
  `kaola-workflow/archive/` (hence the band probe still deciding #832 correctly).

### E. Raw git semantics I depended on (all measured, `impl901/gitprobe`, `impl901/gp2`)

| fact | result |
|---|---|
| `check-ignore -q <archive dir>` under `.cache/` | exit **1** (not ignored) |
| `check-ignore -q <archive>/.cache/<file>` under `.cache/` | exit **0** (ignored) |
| `git add -- <dir> :(exclude)…` with an ignored subdir | exit **1**, and the non-ignored entries **are** staged |
| `git add -f -- <ignored files>` | exit **0**, staged |
| `git add -- <dir>` AFTER the force-add | **still** exit 1 + the advice line (it complains about the ignored *directory* entry, which persists even once its files are in the index) |
| `git ls-files -o -i --exclude-standard -z -- <dir>` | lists exactly the ignored untracked files; exit 0 either way |
| `git ls-tree -r -z --name-only HEAD -- <dir>` | unquoted blob paths; exit 0 even for an absent path |
| `git check-ignore` default is **index-aware** | a path already in the index is NOT reported (so `-i`/`-o` correctly needs no `-f` for tracked paths) |

Consequence I accepted: git's own "The following paths are ignored…" advice **still prints twice** on
the IGNORED leg. It is now immediately followed by our accurate NOTE naming what was force-added. I did
not suppress it: `-c advice.addIgnoredFile=false` happens to also flip the exit to 0 on this git
(2.50.1, measured), and I would not have the fix depend on advice config coupling to exit status.

---

## Suites run (real exit codes)

Baseline = the main root at `9b68b096`; the worktree branch HEAD is **identical to main** for both of my
files (`git diff --stat main...HEAD -- <both>` is empty), and the worktree was clean of my files before
I started.

| suite | before (main root) | after (worktree) |
|---|---|---|
| `node scripts/test-sink-merge.js` | **0** (298 assertions) | **0** (298 assertions) |
| `node scripts/test-finalize-door.js` | **0** | **0** |
| `node scripts/test-claim-hardening.js` | **0** | **0** |
| `node scripts/test-bundle-finalize.js` | **0** | **0** |
| `node scripts/simulate-workflow-walkthrough.js` (FULL scope, not a shard) | not run on main | **0** — `{"index":1,"total":1,"scenarios":184,"ran":184,"passed":184,"failed":0}`, 1958 spawns |
| `node scripts/validate-script-sync.js` | **0** | **1** — sibling's `closure-audit.js` only; my files `cmp` clean |
| `node --check` + `require()` both files | — | **0** |

**Caveat on the "after" column:** the worktree also carries other agents' uncommitted edits to
`kaola-workflow-validation-runner.js` and `kaola-workflow-adaptive-schema.js` (and their forge copies).
A green run there is green *including* their changes; it is not an isolation of mine. My isolation
evidence is sections A–D, where the axis is the sink/claim script path only.

---

## Deliberately NOT changed, and why

1. **`classifyArchiveDisposition`'s token derivation.** The brief asked me to fix its "identical
   dir-probe blind spot" because it "hands the sink a subtree it cannot commit". After the sink fix the
   sink **can** commit that subtree, so `deferred_to_sink` became the *correct* token — and changing it
   would put finalize and the sink into disagreement about the same `.gitignore`, which is exactly the
   cross-surface disagreement this project treats as a bug signature. What was genuinely wrong was the
   **silence**, so that is what I fixed (`ignoredArchiveEvidence` +
   `finalizeTx.archive_ignored_evidence` + the NOTE). Adding a third token would also have changed a
   value pinned by `simulate-workflow-walkthrough.js:4818-4819` and documented in
   `docs/workflow-state-contract.md:135` — a contract change I would have had to escalate, not make.

2. **A literal "required evidence is absent from the commit" gate at the disposal decision.** As
   worded, criterion 6b is **structurally unsatisfiable at that point in the code**: by design there is
   no commit yet. `claim.js:2480-2482` states it — "The archive is untracked on main until the sink's
   archive_commit step lands it" — so a git-presence condition there would refuse *every* finalize,
   because required evidence is always absent from the commit at that moment. The nearest satisfiable
   and genuinely load-bearing version is the one I built: the delete must not be authorized while the
   destination is missing a file the source holds, including the four sidecars the byte verifier
   exempts. The *committed*-archive half of the question is answered where a commit exists — the sink's
   new blob gate, which runs before the sink disposes the worktree.

3. **`verifyArchiveComplete`'s sidecar exemption** (`claim.js:5008`) and
   `ARCHIVE_CACHE_SIDECAR_MD`. Per the brief; the new condition sits at the disposal decision instead.

4. **#520's four-path journal exclusion** (`sink-merge.js:2125-2128`) — unchanged, and additionally
   subtracted from the required set and from the force-add allowlist. `git ls-files` in the fixture
   confirms `sink-receipt.json` is still untracked after a run.

5. **`archive_commit`'s token vocabulary** — the failed arm reuses the existing `'failed'` and the
   existing `sink_incomplete` reason rather than minting a token.

6. **The #700 `archiveAtHead` tree test** — kept exactly as-is and the per-path blob check **added**
   after it, rather than replacing it as the brief suggested. Replacing it would have dropped the
   `archive_dest`-scoped never-committed guard in the one edge where the required set is empty but the
   dest is set. Additive; no capability removed; #700's pinned `detail` text untouched.

7. **The gitlab and gitea forge ports** of `sink-merge.js` and `claim.js` — outside my write set. **See
   "Open" below: they still carry the #901 defect.**

8. **`README.md` / `CHANGELOG.md` / `docs/`** and any `templates/routing/` or rendered surface —
   other agents' work per the brief.

---

## Where a test is needed (for `tdd-guide` — I did not author one)

The premise report established that **no existing test can catch this shape**: every `.gitignore`
fixture in the corpus writes `kaola-workflow/archive/`, an anchored `/.cache/`, or ignores the whole
`kaola-workflow/` tree, and **no test asserts that archived `.cache` files became git blobs** (every
archived-evidence assertion is `fs.existsSync`/`readFileSync`). `grep -rn "ls-tree" scripts/test-*.js
scripts/simulate-workflow-walkthrough.js | grep -i cache` returns nothing. That is still true — the 298
assertions in `test-sink-merge.js` are unchanged by my work.

Five pins I would want, all of which I have working fixtures for in `impl901/`:

1. **`test-sink-merge.js`, a new scenario beside (q):** the (q) fixture with `.gitignore` = `.cache/`
   (a **basename**, not the band). Assert on **`git ls-tree -r`**, not `fs.existsSync`: every archived
   `.cache` evidence file is a blob at `HEAD`, and `receipt.archived_paths` names them. Negative control
   `node_modules/` in the same scenario. **Without the `ls-tree` assertion the test passes against the
   shipped bug** — that is the trap that hid #901 for its whole life.
2. **The armed-gate pin:** the same fixture with one required file `chmod 000`, asserting
   `result:"refuse"`, `reason:"sink_incomplete"`, `step:"archive_commit"`, `archive_missing_paths`
   naming it, `steps.archive_commit` NOT `done`, and the branch still resolvable afterwards. This is
   the only pin that can tell criterion 4's gate from a no-op; a green happy path cannot.
3. **#832 non-regression, sharpened:** the BAND fixture must still yield `skipped_gitignored` and must
   NOT force-add. My change makes force-add and honest-skip mutually exclusive on the dir probe, and
   nothing currently pins that they stay so.
4. **`archive_forced_paths` must never name a #520 journal**, and `git ls-files` must still show
   `sink-receipt.json` untracked after a forced run. The force-add is the one new way a journal could
   leak into a commit.
5. **`test-claim-hardening.js` / walkthrough:** the disposal gate — a lossy `copyDir` that drops an
   `ARCHIVE_CACHE_SIDECAR_MD` file must yield `archive_incomplete:true` naming it and must retain the
   live source. Note this needs a **seam** to make the copy lossy (my proof used a scratch mirror with a
   doctored `copyDir`, which a suite inside the repo cannot do); the tidy in-repo alternative is an
   existing-style `KAOLA_WORKFLOW_FORCE_*` env seam, and **adding one is a design call I did not make
   unilaterally.** Whoever writes this should decide that first.

---

## Open / could not verify

- **The gitlab and gitea forge ports carry the same defect, unfixed.** `plugins/kaola-workflow-gitlab/
  scripts/kaola-gitlab-workflow-sink-merge.js` and the gitea equivalent (and both `claim` ports) are
  hand-ports under export-superset enforcement only, not byte-lockstep, so my edit does not reach them.
  `check-ignore` is forge-neutral, so I expect identical behaviour, but I did **not** measure it. This
  needs a dispatch.
- **`archive_add_errors` message text is `execFileSync`'s** — it embeds the full argv and git's stderr.
  Verbose, but it only appears on the refusal envelope, and it is the diagnosis.
- **The opencode/kimi editions** were not examined; they are additive runtime editions and I was scoped
  to two files.
- **I did not run `npm test`** (the four chains) or the fast gate. Chain selection belongs to the
  producer at finalize, and a chain run at this moment would be stale the instant a sibling lands.
- **I did not measure the finalize-side NOTE end-to-end** through `cmdFinalize --keep-worktree`. Its two
  helpers are measured directly against a real git fixture (section D) and the `deferred_to_sink` branch
  is exercised by the green walkthrough #832 scenario and the four green suites, but the NOTE's own
  emission on a real linked-worktree finalize is **inferred, not measured** — building that fixture
  needs the walkthrough's internal `seedAdaptiveFinalizeFixture`/`alignFinalizeFixtureAcrossRoots`
  helpers, which live in a test file I must not edit or import from.
- **The new required-set walk includes every file the archive holds on disk.** If a future archive ever
  legitimately contains something git cannot turn into a blob under that path (I excluded symlinks and
  nested `.git/` for exactly this reason), the new gate would refuse. I found no such case in the
  corpus, and the four suites plus the walkthrough are green, but it is the one place where my change
  could produce a refusal the old code did not.
