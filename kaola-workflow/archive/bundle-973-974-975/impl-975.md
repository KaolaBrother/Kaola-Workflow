# Implementation — issue #975

**Role:** implementer. **Verification tier: `tests-green`** for both halves — the authored suites
(`scripts/test-forge-finalize-findings.js`, `scripts/test-fixture-sandbox.js`) went from red to
green, plus the regression sweep below.

**Worktree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`
(`workflow/bundle-973-974-975`). No test file was edited. `install.sh`, `install-kimi.sh`,
`install-opencode.sh`, `CHANGELOG.md`, the gap-sweep/validation-runner files and the other agents'
suites were not touched.

**One finding the orchestrator must adjudicate: `scripts/test-finalize-door.js` T9b goes 490 → 487
passed / 3 failed.** It is not a regression in behaviour and it is not repairable from the
implementation side. Measurement and reasoning in *Finding* below. Everything else is green.

---

## Half A — finalize reports foreign dirt instead of adopting it

### Repair family: R1, exclude-before-add

`git add -A` never sees an unattributable path. R2 (stage, then `git reset HEAD --`) reaches the same
end state, but it puts the artifact in the index first, so a process that dies between the two calls
leaves the thing staged — the exact outcome the issue is about. R1 has no such window.

### Attribution rule, and why it is not the one the brief's R1 sketch used

**A dirty path is this run's own when the branch's own commits carry a file in that path's OWN
directory.** Not by path (a new file like `src/helper.js` beside a committed `src/impl.js` has no
history of its own and must still be staged — pin `:722`), and **not by top-level segment**.

Top-segment attribution passes the whole suite and *would not have caught the observed incident*.
The 2026-08-12 bundle committed under `plugins/kaola-workflow-gitea/scripts/`,
`plugins/kaola-workflow/scripts/`, … (`git log --name-only 9b6fac01^..9b6fac01` — 24 paths under
`plugins/`, none directly in it), so `plugins` was in the run's own top-segment set and
`plugins/plugins` would have been called the run's own work.

Measured rather than argued. Scratch probe driving a real `finalize --keep-worktree` on a fixture
with the incident's directory shape — branch commits `plugins/kaola-workflow-gitea/scripts/…` and a
root-level `CHANGELOG.md`, artifact `plugins/plugins` planted beside the run's own late edit:

```
### SHIPPED RULE (directory attribution)      ### TOP-SEGMENT (the rejected design)
  "artifact_in_index": false                    "artifact_in_index": true
  "residue_unattributed": ["plugins/plugins"]   "residue_unattributed": null
  "own_late_edit_committed": true               "own_late_edit_committed": true
  "findings": [… "residue_unattributed"]        "findings": ["claim_release_skipped_offline"]
  exit 0                                        exit 0
```

Both are green on `test-forge-finalize-findings.js` (253/0). The suite cannot separate them — its
fixture branch touches only `src/` and `kaola-workflow/` — so this is stated here rather than left
to a reader to assume the pins covered it.

Evidence source is the **history** (`git log --name-only -z <base>..HEAD`), not the net diff: work
committed and then reverted is still the run's, and the net diff is blind to it. This is the same
two-source reasoning `probeImplementationCommit` already carries. Widening reads are the safe
direction, because calling the run's own work foreign leaves an ordinary run unfinished.

Two fail-open reads, both returning `residue_attribution: 'unattributable_unknown'` and staging
everything exactly as before: git could not be asked, and **the branch carries no commits of its
own** (with no evidence of what the run authored, "all of it is foreign" is not a finding). The
machinery's own Step 8a mirror (`mirroredResiduePaths`) is subtracted, for the reason
`probeImplementationCommit` subtracts it.

Neither forbidden design was used: no mtime read anywhere, and no claim-time manifest — attribution
comes from git alone, so the fixture's hand-built run folder is irrelevant to it.

### Files changed

| file | what |
|---|---|
| `scripts/kaola-workflow-claim.js` | `dirOfRepoPath()` `:3703-3706`; `unattributableResidue()` `:3708-3761`; classification + report `:5311-5337`; staging arm now over `stageable` `:5353-5396` |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | byte-identical copy (`validate-script-sync.js` exit 0) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | same three edits, ported |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | same three edits, ported |
| `docs/api.md` | `findings` row `:394` gains `residue_unattributed`; count sentence `:425-426` **seven→eight**, **eight→nine**; new `residue_unattributed` and `residue_attribution` field rows `:390-391`; `residue_stage` row `:386` gains `nothing_attributable` |

The forge ports were applied by a harness that aborts unless each anchor matches exactly once, so the
four copies carry the same text.

`residue_stage: 'nothing_attributable'` is the one addition beyond the pins: when there was residue
and every path of it was unattributable, the default `skipped` would read "no residue to stage",
which is the same false ledger statement #907 removed one step earlier.

### Mutation proof (scratch mirror at `…/scratchpad/mirror`, `.orig` snapshots; `git checkout --` never used)

Mirror reproduces green first: **253 passed, 0 failed**. Each mutation patches all four copies.

| mutation | what it breaks | result |
|---|---|---|
| **exact-path** — `ownDirs.has(dirOfRepoPath(rel))` → `ownPaths.has(rel)` | the directory granularity | **229 passed, 24 failed** |
| **stage-anyway** — `stageable = residue` | the exclusion; the report still fires | **237 passed, 16 failed** |
| **silent-splice** — the `recordFinalizeFinding` + tx field disabled | the report; the exclusion stands | **217 passed, 36 failed** |
| **top-segment** — attribution by `p.split('/')[0]` | (the rejected design) | **253 passed, 0 failed** — see above |

The three reds land on distinct assertions, which is what makes them informative:

- **exact-path** (4 each, one per edition): `src/helper.js is not tracked — this run's own
  implementation dirt must still reach the re…`; `residue_unattributed names src/helper.js, which
  this run authored`; `after finalize the worktree must hold the three foreign paths and NOTHING
  else`; and all three **control-leg** assertions (`control: a run whose only dirt is its own must
  raise NO residue_unattributed`, `control: nothing must be written durably`, `control: the worktree
  must be clean after finalize`). The anti-over-reach pins and the control leg are armed.
- **stage-anyway**: `plugins/plugins is in the index/tree`, `plugins/stray.txt is in the index/tree`,
  `the commit at HEAD carries a change to plugins/kaola-workflow/plugin.json`, and the exact-dirty
  compare. Including `FOREIGN_TRACKED`, so the third shape is genuinely carried.
- **silent-splice**: `the run must raise the typed finding residue_unattributed`, all three
  `finalize_transaction.residue_unattributed omits …`, and all three `the durable
  residue_unattributed section does not name …`. Nothing about the index — the exclusion is
  independent of the report.

The anti-over-reach pins pass for the right reason, not by accident: the run's own untracked
`src/helper.js` is *tracked after* the run in the green state, and the exact-path mutation is what
proves that assertion can fail. The control leg is likewise proven armed — it reds under exact-path.

---

## Half B — a fixture root must not resolve against the current directory

### Both language halves, one property

`os.tmpdir()` returns `TMPDIR` verbatim and `${TMPDIR:-/tmp}` guards an empty value, never a relative
one. Neither absolutising idiom is the fix (`realpathSync` absolutises the returned *string* after
the directory exists; `path.resolve(".")` **is** the cwd). A relative `TMPDIR` is simply unusable as
a temp root, so both halves treat it exactly as an unset one — `/tmp`, which is what `os.tmpdir()`
itself falls back to and what an empty `TMPDIR` already reaches.

| file | what |
|---|---|
| `scripts/test-install-all.js` | `tmpBase()` `:67-82`; used at `:154` (guard fixture), `:192` (`freshRoot`), `:1115` (the X2 `rowSourcePath`, the same idiom one line over) |
| `install-all.sh` | `KW_TMPDIR` `:43-53` — `${TMPDIR:-/tmp}`, then `case`-rejected to `/tmp` unless it starts with `/`; used at `:245` (per-runtime log), `:315` (`mktemp -d` watchdog flag dir), `:351` (`mktemp` CLI capture) |

`:315` and `:351` were bare `mktemp -d` / `mktemp`, which read `TMPDIR` the same way; they now name
the base explicitly and carry a `kaola-install-all-` prefix, which is one of the prefixes the sandbox
detector watches for.

### Mutation proof (same mirror)

| mutation | result |
|---|---|
| **M-B1** — `install-all.sh` reverted to HEAD, Node fix kept | **RED, 5 passed / 1 failed**: `Observed: ["kaola-install-all-claude.p1Tl0f","kaola-install-all-codex.eqksOi"]` — the escape relocates to the shell half |
| **M-B2** — `scripts/test-install-all.js` reverted to HEAD, shell fix kept | **RED, 5 passed / 1 failed**: `Observed: ["kaola-install-all-guard-njne9V","kaola-install-all-test-MuZwJk"]` — both Node sites |
| control, both fixes | **7 passed, 0 failed**, exit 0 |

Both halves are load-bearing; a half-fix is caught by the escape changing name, exactly as the pin
was designed to.

`TMPDIR=. node scripts/test-install-all.js` run inside the throwaway mirror: **exit 0, 254
assertions**, mirror root entries 24 before and 24 after, zero `kaola-install-all-*` left behind. It
was never run from the real checkout or the worktree.

---

## The watch-list row (the cycle guard, refuted — recorded, not built)

`docs/decisions/0017-the-mission-list.md:151`, appended to the watch-list table in its existing
three-column shape. It names the mechanism (a visited-inode set or resolve-and-compare, at both
copies of the walk), the measurement that refutes it (`Dirent` has lstat semantics, so a symlink
answers `false` to both `isDirectory()` and `isFile()` and the `if`/`else if` takes neither branch;
three loop shapes including `loop -> .` returned `same` immediately; and the artifact was never
inside the walked tree, whose root is the row's `source.path` = `<repo>/plugins/kaola-workflow`,
making `<repo>/plugins/plugins` a sibling), and what would arm it (a walk here that follows links at
all — `readdirSync` without `withFileTypes`, an `fs.statSync` classification, or `find -L`). It also
records that the residual finding is the *opposite* of a cycle guard's — symlinks are invisible to
this walk, which is a symlink policy question with its own trigger.

---

## Finding — `test-finalize-door.js` T9b, 3 failures, not repairable from the implementation side

**Measured, in the mirror, isolating my change:** with HEAD's four `claim.js` copies the suite is
`finalize-door tests passed (490 assertions)`, exit 0. With mine, `3 failures, 487 passed`, exit 1.
Caused by this change.

The three failing legs are T9b's hazard-named files (`new\nline.md`, `qu"ote.md`, `back\slash.md`),
created untracked **at the worktree root** by a fixture whose branch commits only `src/feature.js`
and `kaola-workflow/<project>/` (`test-finalize-door.js:1640-1666`). Under the ruled behaviour they
are unattributable, so they are reported instead of committed. The envelope from a failing leg:

```
"residue_stage":"staged","residue_unattributed":["new\nline.md"],"findings":["residue_unattributed"]
```

T9b accepts exactly this — `assert(tree.indexOf(hazard) >= 0 || envelopeNames(out, needle))`, with
the comment *"Either outcome is acceptable — being SILENT about dropping it is not."* The file is
named, on `finalize_transaction`, which **is** in `envelopeNames`' band. The assertion still fails
because `envelopeNames` (`:1687-1699`) compares a **raw** needle against `JSON.stringify(item)`, and
JSON escapes exactly the characters these three names carry:

```
"new\nline.md"     needle="new\nline.md"     indexOf -> UNREACHABLE
"qu\"ote.md"       needle="qu\"ote.md"       indexOf -> UNREACHABLE
"back\\slash.md"   needle="back\\slash.md"   indexOf -> UNREACHABLE
"notes.md "        needle="notes.md"         indexOf -> FOUND
"nöte.md"          needle="nöte.md"          indexOf -> FOUND
```

The two legs that still pass are the two whose needle survives JSON escaping. **No implementation
can satisfy that disjunct for the other three** — any string containing a newline, a quote or a
backslash is escaped in any JSON envelope — so for those legs the assertion effectively demands the
hazard be *committed*, which is what #975's ruling reverses. It is a defect in the test's
observation, not in the behaviour it declares acceptable, and it was latent until something started
taking the other branch.

I did not edit it. The repair belongs to the test author and is one line — compare against
`JSON.stringify(needle).slice(1, -1)`, or walk the parsed structure instead of stringifying it.

**The alternative I considered and rejected:** exempting the repository root from attribution would
turn T9b green and pass every #975 pin, and it would also mean any unexplained file at the repository
root is committed silently — the repository root being precisely where the Half-B escape class lands.
I did not want to buy a green suite with a carve-out nobody derived. Reversing that judgement is the
orchestrator's call; it is a two-line change to `unattributableResidue`.

---

## Verification — real exit codes

Before (baseline at the worktree, HEAD `69264936` + the test author's pins):

```
node scripts/test-forge-finalize-findings.js   -> exit 1   201 passed, 52 failed
node scripts/test-fixture-sandbox.js           -> exit 1   5 passed, 1 failed
node scripts/test-finalize-door.js             -> exit 0   490 assertions  (measured on the mirror
                                                                            with HEAD's claim.js)
```

After:

```
node scripts/test-forge-finalize-findings.js   -> exit 0   253 passed, 0 failed
node scripts/test-fixture-sandbox.js           -> exit 0   7 passed, 0 failed   (5 -> 7: :212 armed)
node scripts/test-install-all.js               -> exit 0   254 assertions
node scripts/simulate-workflow-walkthrough.js  -> exit 0   210/210 scenarios, FULL scope (not a shard)
node scripts/test-bundle-finalize.js           -> exit 0   179 tests
node scripts/test-claim-hardening.js           -> exit 0   766 assertions
node scripts/test-forge-bundle-lane.js         -> exit 0
node scripts/test-suite-registration.js        -> exit 0   538 assertions
node scripts/test-spawn-classification.js      -> exit 0   666 spawn sites, 10 mutation assertions
node scripts/test-bash-block-guards.js         -> exit 0   49 assertions
node scripts/validate-workflow-contracts.js    -> exit 0
node scripts/validate-script-sync.js           -> exit 0   4 kernel copies identical
node scripts/edition-sync.js --check           -> exit 0
node scripts/generate-routing-surfaces.js --check -> exit 0   18 surfaces byte-match
bash -n install.sh uninstall.sh install-all.sh -> exit 0
node scripts/test-finalize-door.js             -> exit 1   3 failures, 487 passed   (the finding)
```

`docs/api.md` is the only prose surface that enumerates finding types (`git grep` over `README.md`,
`docs/`, `templates/`, `commands/`, `agents/`, the plugin command and skill trees): no routing
skeleton names one, so nothing needed regenerating, and `--check` confirms it.

## Cleanliness

```
$ git -C <worktree> status --short --untracked-files=all
   … my 8 files, plus other agents' work, untouched. Nothing new and nothing stray.
$ git -C <main> status --short --untracked-files=all
   ?? kaola-workflow/bundle-973-974-975/…      run records only
$ ls -la <main>/plugins/     -> 3 directories, no symlink   (same in the worktree)
$ find <both trees> -type l  -> nothing outside the pre-existing gitignored .opencode npm shims
$ ls -d /private/tmp/kaola-install-all-* /private/tmp/kw-fixture-sandbox-* /private/tmp/kw914-* … -> 0
```

One temp root (`/private/tmp/kaola-install-all-test-slKlxC`) was left by a SIGKILLed mutation child;
I inspected it (stub codex fixture) and removed it. `TMPDIR=.` was never set in the real checkout or
the worktree — every such run was inside the scratch mirror or the sandbox's own copied checkout.

## Not reached / stated plainly

- **T9b** above: left red, not repaired, not edited.
- **`checks.dirty_paths` on the `finalize --check` envelope** is unchanged. The pins deliberately do
  not extend the classification to that surface, and neither did I.
- **A foreign artifact inside a directory the run DID touch** is attributed to the run — unpinned by
  the suite and unaddressable by any evidence the transaction has.
- **The in-place (non-worktree) finalize lane** is untouched: the classification sits inside the
  `--keep-worktree` commit block, where the residue staging lives.
- I did not run the four chains or `npm test`; the fast gate is red for other reasons in this
  worktree (other agents' in-flight suites), and chain selection is the orchestrator's at finalize.
