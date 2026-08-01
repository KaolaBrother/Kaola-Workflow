# Test custody notes — issue #901, sink evidence durability (canonical + both forge editions)

**Baseline: `9b68b0962f52443e2b4ca91c2fa924440cea829b` (`9b68b096`).** Every pin below was proved RED
against it before being reported green. Work is UNCOMMITTED in
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`.

Scratch (mirrors, logs, the measurement harness):
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/tddsinks/`

---

## Write-set note (read first)

The brief named my write set as `scripts/test-sink-merge.js`, `scripts/test-gitlab-sinks.js`,
`scripts/test-gitea-sinks.js`, and separately forbade editing `plugins/*/scripts/*`. The two forge
suites do not exist at `scripts/` — they are
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` and
`plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`. I read the prohibition as covering
production code (`kaola-workflow-*.js` / `kaola-*-workflow-*.js`), since the brief also requires five
pins **per forge edition** in files it names by basename, and no other reading makes the task
possible. **Exactly three files changed:**

| file | insertions | deletions |
|---|---|---|
| `scripts/test-sink-merge.js` | 416 | 3 |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | 390 | 0 |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | 389 | 0 |

No production file, no other test file, no doc. (The worktree also carries siblings' edits to
`simulate-workflow-walkthrough.js`, `test-claim-hardening.js`, `test-finalize-door.js`,
`test-validation-runner.js`, `test-gitlab-workflow-scripts.js` — **not mine**, untouched.)

The 3 deletions are all in `test-sink-merge.js` and are additive-parameter edits to two existing
fixture builders (`buildGitignoredArchiveSinkFixture`, `buildSoleArchiverFixture`): new `opts` with
defaults that reproduce the pre-existing fixtures byte for byte. **No existing pin was rewritten,
relaxed, or deleted.** Proof: the pristine baseline suite scores 298 assertions and the same suite
with only my file overlaid scores 366 total (347 pass + 19 fail) — every pre-existing assertion keeps
its verdict, and the 68 new ones are mine.

---

## Every durability clause asserts BLOB presence, never disk existence

Confirmed explicitly, as the brief demanded. In all three editions the durability clauses read

- `git ls-tree -r -z --name-only HEAD -- <archiveRel>` (helper `blobsUnder` / `blobsUnder901`),
- `git diff-tree --no-commit-id -r -z --name-only <archive commit>` (the "8 files, not 3" clause),
- the same `ls-tree` probe **inside a fresh `git clone` of the pushed bare remote**,

and `receipt.archived_paths` / `receipt.archive_forced_paths` from the envelope. The only
`fs.existsSync` calls in the new code are the *retention* clauses (the archive must survive an honest
skip / a refusal) and the on-disk-journal precondition — never a durability claim. This matters
because the five lost files were on disk the whole time: **a disk pin passes against the broken
sink**, which is measured below (mutation `mirror-noforce`, where the disk is identical and only the
blob clauses red).

The field asserted is `steps.archive_commit`, not `receipt.archive_commit`. The latter is `undefined`
in the keep-worktree posture, and the assertion set says so in a comment at each site.

---

## Pins added, per edition

### `scripts/test-sink-merge.js` — (y1)–(y6), 68 new assertions

Two existing builders extended additively; two new read helpers (`blobsUnder`, `archiveCommitOf`,
`pathsInCommit`); one shared assertion set (`assertArchivedEvidenceIsDurable`) so (y1) and its control
cannot be checked at different strengths.

| pin | leg | what it pins |
|---|---|---|
| (y1) | `.gitignore = ".cache/"`, keep-worktree | exit 0, `sinked`, `steps.archive_commit:"done"`; all 5 `.cache` evidence files are **blobs at HEAD**; the archive commit carries **8** archive paths not 3; `archived_paths` names all 8; all 5 survive a **fresh clone**; `archive_forced_paths` names **exactly** the 5; #520 — no journal forced, none tracked. Two in-fixture preconditions: `check-ignore` on the archive **dir** exits 1, on a `.cache` **file** exits 0 |
| (y2) | `node_modules/`, keep-worktree | same assertion set, `expectForced:false` → `archive_forced_paths` must be **undefined**. The single-axis control |
| (y3) | `kaola-workflow/archive/`, keep-worktree | #832 preserved and sharpened: `skipped_gitignored`, exit 0, **`archive_forced_paths` undefined** (force-add and honest-skip are mutually exclusive), zero archive blobs at HEAD, `archive_missing_paths` itemizes all **8**, archive retained on disk |
| (y4) | `.cache/` + `run-gaps.json` mode 000 | exit **1**; `refuse`/`sink_incomplete`/`archive_commit`; not `sinked`; `archive_missing_paths` names **every** required path; `archive_add_errors` carries the `git add` failure; the surviving on-disk journal records `archive_commit:"failed"`, leaves `steps.archive_commit` NOT done and itemizes the missing paths; **branch retained**; on-disk archive retained; #520 — the journal is on disk under the ignored `.cache` and is neither demanded nor tracked |
| (y5) | `.cache/`, **sole-archiver** (`archive_dest` SET) | same durability claim where the #700 completeness guard is live; blobs under the collision-suffixed dest; `archived_paths` names them; forced list exact; main clean after `sinked` |
| (y6) | `node_modules/`, sole-archiver | the sole-posture control; forced must be undefined |

### `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — (a)–(e), 5 pins

### `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` — (a)–(e), 5 pins

Same five behaviours per edition, in each file's own idiom (node `assert`, block-scoped section with
local `sinkScript901`/`parseLast901`/`mkFixture901`, trailing `console.log('… : PASSED')`), with
edition-correct forge nouns. Written as separate copies, not homogenised, because **each edition's
suite defends its own copy** — a canonical pin does not cover a port.

- (a) IGNORED `.cache/` · (b) CONTROL `node_modules/` — held to one assertion set
- (c) BAND `kaola-workflow/archive/` — honest skip preserved, force-add declined, 8 itemized
- (d) armed gate — `chmod 000`, refuse/exit 1/branch retained/journal `failed`
- (e) sole-archiver IGNORED — `archive_dest` set, #700 guard live

Both forge blocks use the **stateful** CLI mock (`issue view`/`issues view` reports open until a
matching close is logged), as the brief required, and set `KAOLA_WORKFLOW_OFFLINE: '0'`
**explicitly** in the child env.

---

## Baseline-red proof

Method: `git archive 9b68b096 | tar -x` into `tddsinks/baseline/`, then overlay **only** the one test
file. Nothing in the worktree was ever reverted (siblings have uncommitted work there).

The forge suites use node's throwing `assert`, so a single baseline run would stop at the first red
and never measure the later legs. `tddsinks/measure-red.js` is a **scratch-only** harness that makes
the assert methods record and continue; the suite file it loads is byte-identical (`cmp` exit 0) to
the one in the worktree. **Positive control on the harness itself: run over the FIXED port it records
0 reds** (`shimcontrol-gitlab.log`, `shimcontrol-gitea.log`) — so a recorded red is the baseline sink,
not the shim.

| edition | pristine baseline | + my overlay | red clauses | which legs |
|---|---|---|---|---|
| canonical | **exit 0**, 298 assertions | **exit 1**, 19 failed / 347 passed | **19** | y1 (5), y3 (1), y4 (10), y5 (3) |
| gitlab | **exit 0** | 20 recorded | **20** | a (5), c (2), d (10), e (3) |
| gitea | **exit 0** | 20 recorded | **20** | a (5), c (2), d (10), e (3) |

**Zero non-#901 failures** in any baseline run, and the canonical totals reconcile exactly
(298 + 68 = 366 = 347 + 19).

Failure signatures (canonical, verbatim from `baseline2-canonical.log`):

```
RED: #901 y1 IGNORED: every archived .cache evidence file must be a BLOB at HEAD (on-disk presence is
     what the broken sink already satisfied); missing [".../.cache/doc-docking.md", ".../doc-updater.md",
     ".../final-validation.md", ".../run-gaps-manual.md", ".../run-gaps.json"]
RED: #901 y1 IGNORED: the archive commit must carry all 8 archive files, not the 3 non-ignored
     survivors; got 3: [finalization-summary.md, workflow-plan.md, workflow-state.md]
RED: #901 y4: a partially committed archive must exit 1; got 0
     — envelope was {"result":"ok","status":"sinked",…,"archive_commit":"done",…}
baseline: 9b68b0962f52443e2b4ca91c2fa924440cea829b
```

gitlab / gitea, same shape:

```
RED: #901-gitlab-a IGNORED: every archived .cache evidence file must be a BLOB at HEAD …
     blobs under kaola-workflow/archive/issue-99011: [finalization-summary.md, mission-list.md, workflow-state.md]
RED: #901-gitea-d: the feature branch must be RETAINED by the refusal | 128 !== 0
baseline: 9b68b0962f52443e2b4ca91c2fa924440cea829b
```

**(y2)/(b) and (y6) are GREEN on the baseline, deliberately** — they are the controls. A control that
reds against the unfixed code would mean the fixture, not the `.gitignore` body, was the axis.

---

## Positive controls — arming proved separately from coverage

Baseline-red proves **coverage** (the pins reach the behaviour). These prove **arming** (each pin
discriminates the specific mechanism, so neither half can be a guard that cannot fail). Method:
`tar` the whole worktree tree into a scratch mirror, mutate **one** thing in the sink, run the
unmodified suite. No repo file was reverted or mutated.

| mirror | mutation | canonical | gitlab | gitea |
|---|---|---|---|---|
| `mirror-nogate` | the `!archiveIgnored && missingBlobs.length` **refusal removed**; force-add left intact | **only (y4) reds — 10 clauses**; y1/y2/y3/y5/y6 green | **only (d) reds — 10 clauses** | not run |
| `mirror-noforce` | `forcePaths = []` — **force-add disabled**; blob gate left intact | **only (y1)+(y5) red — 14 clauses**; y2/y3/y4/y6 green | not run | **only (a)+(e) red — 14 clauses** |

The two mutations are disjoint in which legs they red, which is the point: (y4)/(d) pins the per-path
blob **gate** and would still fail if a future fix force-added correctly but dropped the verdict;
(y1)/(y5)/(a)/(e) pin the **force-add** and would still fail if the gate stayed but the paths never
landed. Under `mirror-noforce` the on-disk archive is byte-identical to the green run — **only the
blob clauses red**, which is the direct measurement that an `fs.existsSync` pin would have been
worthless here.

**Environment positive control (the trap the brief named).** `KAOLA_WORKFLOW_OFFLINE` is set to `'0'`
explicitly in every child env, never inherited. Proved rather than asserted: all three suites were
re-run with an **ambient `KAOLA_WORKFLOW_OFFLINE=1`** and all three still exit 0 with the durability
clauses satisfied — the ambient flag cannot silently retire the push/clone half. Logs
`offlineambient-{canonical,gitlab,gitea}.log`.

**Arming axis of (y4)/(d) verified in-fixture, not assumed:** after `chmod 000` the test reads the
file and requires the read to fail. A chmod that silently did not take would otherwise turn the armed
leg into a second happy path.

**#520 made non-vacuous:** a terminally successful sink disposes of its own journal (#653), so
"no journal was tracked" is empty on a green run. The (y4)/(d) leg asserts the journal **is** on disk
under the ignored `.cache` (the refusal returns before disposal) and then that it is neither in
`archive_missing_paths` nor in `git ls-files` — so the `SINK_STAGE_SKIP` subtraction is observed, not
inferred.

---

## Suites run — real exit codes, read with a bare `echo $?`, never through a pipe

Run **serially** (the suites are spawn-bound; parallel runs give false reds).

| command | exit |
|---|---|
| `node scripts/test-sink-merge.js` | **0** — 366 assertions |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | **0** — 489 spawns |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | **0** — 485 spawns |
| `node scripts/simulate-workflow-walkthrough.js` (**FULL scope, not a shard**) | **0** — `{"index":1,"total":1,"scenarios":197,"ran":197,"passed":197,"failed":0}` |
| `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | **0** |
| `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | **0** |
| `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | **0** |
| `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | **0** |
| `node scripts/validate-script-sync.js` | **0** |
| `node scripts/test-spawn-classification.js` | **0** (see below) |
| `node --check` all three files | **0** |

The two forge walkthroughs each run their edition's sink suite internally, so those two suites are
covered twice per edition.

### One gate I had to satisfy, and how (not by raising a ceiling)

`test-spawn-classification.js` initially failed with **3 violations** — my additions pushed all three
files over their unclassified-spawn ceilings (canonical 4/3, gitlab 54/52, gitea 49/47). The guard
says raising a ceiling is not a fix, so:

- the `spawnSync('cat', …)` arming probe in each of the three files became an in-process
  `fs.readFileSync` in a `try` — same property, one fewer process, and it reads better;
- the two new forge fixture builders' local `git` helper now routes through `G.exec` (the repo's
  single git-spawn decision point) instead of a fresh `execFileSync` site;
- the one genuinely-boundary spawn left, `runSink901` (the sink CLI under test), carries
  `// spawn-class: cli-contract`.

Now: `spawn-classification passed (10 mutation assertions; 599 spawn sites across 60 files, 174
classified, 425 grandfathered; 133 slots of slack)`. **No ceiling was changed.** All three suites were
re-run green after these edits, and the baseline-red measurement was **re-taken** against the final
file bytes (`cmp` exit 0 against the worktree copies) — the numbers in the table above are the
re-taken ones.

---

## Spec'd pins I did NOT write, and why

`impl-901.md`'s item 5 — **the claim-side disposal gate** (a lossy `copyDir` dropping an
`ARCHIVE_CACHE_SIDECAR_MD` file must yield `archive_incomplete:true` and retain the live source).

Not written, for two reasons, and the second is a decision I will not take on someone's behalf:

1. It belongs in `test-claim-hardening.js` / the walkthrough — outside my three files, and a sibling
   `tdd-guide` owns those.
2. It is **not writable as an in-repo pin today.** Under the shipped `copyDir` the sidecar exemption
   is unreachable (the copy is fully recursive), so the only way to observe the gate is to make the
   copy lossy. The implementer proved it with a doctored `copyDir` in a scratch mirror, which a suite
   inside the repo cannot do. The tidy in-repo alternative is a new `KAOLA_WORKFLOW_FORCE_*` env
   seam in production code — **adding a seam to production code to make a test possible is a design
   call, and it is not mine to make.** The implementer flagged the same thing and also declined it.
   Whoever decides that should decide it before the pin is written.

Also not written (outside the brief's scope, recorded so nothing is assumed covered):

- the finalize-side `archive_ignored_evidence` NOTE end-to-end through `cmdFinalize --keep-worktree`.
  The implementer recorded it as inferred, not measured; it needs the walkthrough's internal
  `seedAdaptiveFinalizeFixture` / `alignFinalizeFixtureAcrossRoots` helpers, which live in a file I
  must not edit or import from.
- the opencode / kimi editions. Additive runtime editions, absent from my write set.

---

## Implementation observations (reported, not fixed)

No defect found. Three things a reader should know, none of which I changed:

1. **A refusal envelope carries no `receipt` key at all** (`sinkEmit` emits exactly its payload). My
   first draft of (y4) asserted `out.receipt.archive_commit === 'failed'` and it failed against the
   *fixed* sink; worse, the neighbouring `out.receipt.steps.archive_commit !== 'done'` would have
   passed **vacuously** for the same reason. Both now read the surviving on-disk journal, which is
   where `archive_commit:"failed"`, the not-done step and `archive_missing_paths` actually are. This
   is the `receipt.` vs `steps.` trap the brief warned about, in a second location: the refusal path.
   Anyone writing further #901 pins should assert the refusal's durable half from the journal.

2. **In the sole-archiver posture both forge ports produced a collision-suffixed dest**
   (`kaola-workflow/archive/issue-9xxxx.archived-<ts>`) even with **no** pre-existing archive
   directory in the fixture; the canonical sink in the same shape did too. The pins read
   `receipt.archive_dest` rather than assuming the plain path, so this is not a problem — but a pin
   that hardcoded `archive/<project>` in that posture would be measuring the wrong tree.

3. **`git status --porcelain` reports the tree CLEAN while the evidence is only on disk.** On the
   baseline, (y5)'s "main must be clean after status:sinked" clause **passes** — the archive `.cache`
   files are untracked *and* ignored, so nothing surfaces them. That clause therefore cannot detect
   #901 and is not offered as if it could; it is there for the tracked-live-path deletion. It is also
   the sharpest statement of why the incident was silent.

---
---

# Second pass — pins for the two repaired sink defects (D3, D4)

Three pins added per edition: **(y7)/(f)** the whitespace convergence pin, **(y8)/(g)** the symlink
durability pin, **(y9)/(h)** a source-level guard that the three `-z` readers stay NUL-split only.

Files unchanged from the first pass — the same three, nothing else:
`scripts/test-sink-merge.js` (+637/−3), `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
(+579), `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` (+578).

## First: I had reproduced D3 inside the test artifact itself

**All six of my own `-z` readers carried the identical `.trim()` bug** —
`blobsUnder`/`pathsInCommit` (canonical) and `blobsUnder901`/`pathsInCommit901` (both ports) all read
`split('\0').map(s => s.trim()).filter(Boolean)`. A D3 pin built on those readers would have been
**wrong, not merely weak**: the test would have trimmed the trailing space out of the observed blob
path while the expected name kept it, so it would have gone red against a *correct* sink and green
against nothing. The defect class propagated from the production code into the oracle.

All six are now `split('\0').filter(Boolean)`, and `blobsUnder` is derived from a new
`treeEntriesUnder` that also exposes the **mode** — needed because D4 is about a `120000` entry, and
asserting mere path presence cannot tell a symlink from a regular file. Same refactor per edition.

## Pin ↔ proof: which are baseline-red and which are mutation-armed

The honest distinction the lead asked for. `9b68b096` predates the whole #901 fix, so a red there
attributes to "the fix is absent", not to D3 or D4 specifically. Single-axis mirrors of the **current**
tree are what give each pin its own attribution, so each pin below carries both.

| pin | red at `9b68b096` | red under `mut-D3` (`.trim()` restored) | red under `mut-D4` (symlink skip restored) |
|---|---|---|---|
| (y7) whitespace, canonical | 3 clauses | **7 clauses** | green |
| (y8) symlink, canonical | 6 clauses | green | **6 clauses** |
| (y9) `-z` source guard, canonical | 6 clauses | **4 clauses** | green |
| (f) whitespace, gitlab / gitea | 3 / 3 | **5 / 5** | green / green |
| (g) symlink, gitlab / gitea | 6 / 6 | green / green | **6 / 6** |
| (h) `-z` source guard, gitlab / gitea | 6 / 6 | **4 / 4** | green / green |

So **every new pin is both baseline-red and mutation-armed**, and the two mutations red *disjoint*
sets: D3's fix is what makes (y7)/(f) pass and D4's is what makes (y8)/(g) pass, proven in both
directions, in all three editions. Totals at `9b68b096` with the final file bytes: canonical **34**
reds (all #901, zero others), gitlab **35**, gitea **35**.

Mirrors are `tddsinks/mutD3` and `tddsinks/mutD4`, each a `tar` copy of the whole worktree with one
expression changed in all four editions' copies. **Nothing in the worktree was reverted** — four
agents hold uncommitted work there.

Failure signatures:

```
RED: #901 y7: the sink must converge on the FIRST run  (mut-D3: exit 1, sink_incomplete,
     archive_missing_paths=[".../.cache/notes.md "] — the trim emptied the force-add set,
     then the guard refused over its own omission)
RED: #901 y8: the fresh clone must materialize it as a SYMLINK — this is the clause the defect
     failed while reporting archive_commit:"done" at exit 0  (mut-D4)
RED: #901 y9: ignoredUntrackedUnder in scripts/kaola-workflow-sink-merge.js must NOT trim a -z
     record  (mut-D3)
mut-D3 / mut-D4 = worktree HEAD + one expression;  release baseline = 9b68b0962f52443e2b4ca91c2fa924440cea829b
```

## The D4 pin asserts a fresh clone, not disk existence — explicitly

`fs.existsSync` and `steps.archive_commit === 'done'` were **both satisfied by the defect**, so
neither is used. (y8)/(g) assert, in order:

1. the symlink is an **entry in the published commit** at `HEAD`, and its **mode is `120000`**, read
   through `ls-tree -r -z` (NUL-split only);
2. `archive_forced_paths` names it;
3. a **`git clone` of the pushed bare remote** materializes it — `lstatSync(...).isSymbolicLink()` is
   true **and** `readlinkSync(...) === 'plain.md'`;
4. the **clone's own HEAD** carries it as a blob.

Clause 3 is the one the defect failed. It is disk, but it is the disk of a *fresh clone built from the
commit* — the run's own working tree held the symlink throughout and is never consulted.

## Positive controls per pin

- **(y7)/(f) is over-refusal, so the naive fix is "stop requiring awkward names".** The five
  non-regression shapes therefore ride in the **same fixture**, not a separate green run: `plain.md`,
  non-ASCII `ünïcödé-日本.md`, an embedded-newline `a\nb.md`, nested `deep/x.md`, and a 0-byte
  `zero.md` must all be blobs too, and `archive_forced_paths` must equal that set **exactly**. A fix
  that weakened the requirement fails here.
- **Two fixture preconditions, asserted not assumed:** the space-bearing name is present verbatim in
  `readdirSync`, and `git ls-files -z` reports it with the space intact. A filesystem that normalized
  the name would otherwise make the leg vacuous.
- **Convergence is asserted as first-run success**, and deliberately not as a re-run: a second
  `--sink` on an already-sinked fixture exits 1 at `push_upstream` for pre-existing reasons that are
  identical for plain names, so re-running would measure that instead. Stated in a comment at the site.
- **(y9)/(h) is stated as a required FORM**, `.split('\0').filter(Boolean)` with nothing between,
  rather than as a `.trim()` blocklist — and it strips whole-line comments first. That second part is
  not hypothetical: **my first version of this pin went red against correct code** because the shipped
  readers carry a comment explaining why `.trim()` must never return, and the guard matched its own
  rationale. Fixed and re-measured.
- **(y8)/(g) reads defensively**, because the defect's shape is an absent entry: a raw `.mode` or
  `lstatSync` on nothing throws and would abort the suite *before* the fresh-clone clause. First
  measured, then fixed — under `mut-D4` all 6 clauses now report as assertions.
- `KAOLA_WORKFLOW_OFFLINE` is still set to `'0'` **explicitly** in every child env (the new legs reuse
  the same `runSink`/`runSink901`), and the forge legs still use the stateful CLI mock.
- **No new spawn site**: the new pins use `G.git` / `G.clone` / the already-classified `runSink901`.
  `test-spawn-classification` stays **0** with no ceiling touched.

## Deliberately NOT pinned

**A regular file named `.git` in the archive.** Pre-existing before this bundle — `git add -f` exits 0
and indexes nothing, so such a file was already a permanent unclearable `sink_incomplete`. The repair
made the skip type-agnostic to avoid a second instance of the D3 non-convergence shape. Per the brief
this wants its own issue, and pinning it now would pin it in place. No fixture of mine contains a
`.git` entry.

Also still not written, unchanged from the first pass: the claim-side disposal gate (needs a
production seam — a design call), and the finalize-side NOTE end-to-end.

## Suites — real exit codes, bare `echo $?`, serial

| command | exit |
|---|---|
| `node scripts/test-sink-merge.js` | **0** — 395 assertions |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | **0** — 529 spawns |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | **0** — 525 spawns |
| `node scripts/simulate-workflow-walkthrough.js` (**FULL scope**) | **0** — 198/198 |
| `node scripts/test-spawn-classification.js` | **0** — 131 slots of slack, no ceiling changed |
| `node scripts/validate-script-sync.js` | **0** |
| both forge contract validators | **0** / **0** |

## One thing to know about the tree, reported not fixed

A run of mine at 23:41–23:43 produced **81 failures across pre-existing scenarios**, every sink run
exiting 1 with no envelope and stderr `repoWideIgnoredNames is not defined`. That was a sibling's
in-flight edit to `scripts/kaola-workflow-claim.js` (mtime 23:42:55, mid-run); the function is now
defined at `claim.js:2683` and the same suite is green. **Not mine** — I hold only test files — and not
a standing defect. Recorded only so nobody attributes that log to these pins, and as a reminder that a
suite run on this worktree right now is racing several agents: only the frozen mirrors isolate anything.
