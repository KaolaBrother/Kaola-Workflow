# Tests — issue #975: foreign dirt at finalize, and a fixture root in the checkout

**Baseline: `69264936`** (`workflow/bundle-973-974-975`, worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`).

```
RED: scripts/test-forge-finalize-findings.js — behavioural-D, all four editions
     plugins/plugins is in the index/tree … A path finalize cannot attribute to the run is
     reported, not adopted.
     201 passed, 52 failed (exit 1)

RED: scripts/test-fixture-sandbox.js
     the suite created 1 fixture artifact(s) in the checkout root under a relative TMPDIR …
     Observed: ["kaola-install-all-test-lKGMRN"]
     5 passed, 1 failed (exit 1)

baseline: 69264936
```

Three files changed, all test artifacts: `scripts/test-forge-finalize-findings.js` (+311),
`scripts/test-fixture-sandbox.js` (new, 223 lines), `package.json` (registration only). No
production file was edited anywhere. Full output in
`…/scratchpad/red-975-A.txt` and `…/scratchpad/red-975-B.txt`.

---

## Audit verdict on the inherited work: **kept, and repaired in four places**

The dead agent's Part D was structurally right — real finalize runs on all four editions, both
directions pinned, a healthy control, `lstat` rather than `existsSync` for a self-referential
symlink. It was red at baseline for the right reason and its witnesses (`impl_commit: "committed"`,
`residue_stage: "staged"`) were passing, so the fault leg was reaching the code under test. I kept
it. What it needed:

**1. Its central "MEASURED" comment was unverified. I measured it, and it is true.** The comment
claimed `chore: finalize` committed the symlink at mode 120000 at exit 0. Driven end to end in a
throwaway clone (`…/scratchpad/harm-975-measured.txt`), on the fixture shape the suite uses:

```
chore: finalize issue-914
  A  plugins/plugins                       ls-files --stage: 120000 f4f388c8
  A  plugins/stray.txt                                       100644
  M  plugins/kaola-workflow/plugin.json
  A  src/helper.js                          <- the run's own work, correctly carried
  M  src/impl.js                            <- likewise
finalize exit: 0    findings: ["claim_release_skipped_offline"]
git status --porcelain afterwards: ""
```

That empty status is why nothing noticed: the tree finalize leaves behind is clean. This also
closes premise-975's own open item — it inferred the staging from `git add` in isolation plus a
read of `claim.js:5266-5272`; the commit is now observed.

**2. A silent parse bug in its `dirtyPathsIn` helper.** It read `git status --porcelain` through
`G.out`, which **trims the whole stream**. A porcelain record is `XY <path>` and for an unstaged
modification X is a space — so trimming eats the leading space of the *first* record only, and the
`slice(3)` parse then eats the first character of that one pathname. Invisible while every foreign
path was untracked (`??` has no leading space); the moment a ` M` record sorted first the list came
back holding `"lugins/kaola-workflow/plugin.json"`. Left in place it would have made `dirtyAfter`
compare corrupted strings and red *after* a correct fix landed. Now a direct
`git status --porcelain -z` with its own parse (`:589-604`).

**3. A near-miss it could not catch — a foreign MODIFICATION to a tracked file.** Both its foreign
shapes were untracked, so "only an untracked path can be foreign" passed. That rule is wrong: the
residue probe lists a modified tracked path identically and `git add -A` takes it identically —
measured above, `M plugins/kaola-workflow/plugin.json` in the same commit. I added
`FOREIGN_TRACKED` as a third shape and proved it load-bearing by mutation (C3 below).

This is a deliberate widening past the single observed artifact (a symlink), so I am flagging it
rather than burying it: the *observed* instance is one untracked symlink, and I pinned the
mechanism's whole reach — residue → `git add -A` — instead. If the orchestrator wants the pin held
to the observed shape, delete `FOREIGN_TRACKED` and its four assertions; the rest stands unchanged.

**4. Anti-vacuity the brief specifically asked for was missing.** The brief names the risk: *if
the "foreign" fixture path also matches the run's authored set, the classification assertion
observes nothing.* Nothing checked that. Added at `:640-660`, read out of git before the run: all
five planted paths must be dirty, the branch must have committed `src/impl.js`, and the branch's
commits must reach **nothing** under `plugins/`. The first of these caught bug 2 within a minute.

---

## Half A — what is pinned

`scripts/test-forge-finalize-findings.js`, part D, `:578-787`. Two legs per edition × 4 editions.

| line | assertion | at HEAD |
|---|---|---|
| `:646`, `:654`, `:658` | fixture integrity / anti-vacuity, read before the run | green |
| `:664` | **exit 0** — an unattributable path is reported, never refused | green |
| `:671`, `:676` | witnesses: `impl_commit: committed`, `residue_stage: staged` | green |
| **`:683`** | the two untracked foreign paths are **not in the index** | **RED** ×2 |
| `:691` | …and not deleted from the worktree either | green |
| **`:700`** | the tampered content of the tracked foreign path is **not in `HEAD`** | **RED** |
| `:707` | …and not reverted on disk either | green |
| **`:715`** | after finalize the worktree holds **exactly** the three foreign paths | **RED** |
| `:722` | **anti-over-reach**: `src/impl.js` and `src/helper.js` are still tracked | green |
| **`:729`** | the typed finding `residue_unattributed` is on the envelope | **RED** |
| **`:733`, `:738`** | `finalize_transaction.residue_unattributed` names all three | **RED** ×4 |
| **`:745`, `:750`** | the finding is durable in `finalization-summary.md`, naming all three | **RED** ×4 |
| `:757` | **anti-over-reach**: the finding names neither of the run's own paths | green |
| `:769`–`:780` | **control leg**: same run, no foreign artifact — no finding, clean worktree | green |

13 red per edition, 52 total. **No assertion demands a non-zero exit**, and none demands the
artifact be removed. `:715` and `:722` are the anti-over-reach pair the acceptance surface calls
for: a fix that simply stops staging fails both. `src/helper.js` is what makes `:722` bite — it is
**untracked**, so a rule of "stage only paths the implementation commit already names" reports it
as foreign and reds.

### Mutation proof — five families, scratch mirror only

`git clone` of the repo to `…/scratchpad/probe`; the four `claim.js` copies and `docs/api.md`
patched there, restored from `.orig` snapshots between runs. Harness at
`…/scratchpad/patch-mirror-975.js`. **`git checkout --` was never used and the real tree was never
patched.** The mirror reproduced the baseline exactly (201/52) before any mutation.

| mutation | mechanism | result |
|---|---|---|
| **R1 — exclude before add** | attribution from the branch's **history** (`git log --name-only main..HEAD`), top segment; foreign paths spliced out of `residue` before `git add` | **253 passed, 0 failed, exit 0** |
| **R2 — stage, then un-stage** | `git add -A` unchanged, so the foreign paths **do** enter the index; attribution from the **net** diff (`git diff --name-only main...HEAD`); then `git reset HEAD -- <foreign>` | **253 passed, 0 failed, exit 0** |
| **C1 — constant report** | raises the finding naming *all* residue, stages everything anyway | **32 failed** — stays red |
| **C2 — over-reach** | every *untracked* residue path called unattributable | **36 failed** — stays red |
| **C3 — tracked shortcut** | R1's attribution exactly, plus "a modified tracked file is always the run's own" | **16 failed** — stays red |

Every counter-mutation failure is inside part D; parts A, B and C stay green throughout.

R1 and R2 are opposite transaction shapes — one never lets the path near the index, the other
stages it and takes it back out — and both close the suite. That is the evidence that a *result*
is pinned and not a mechanism: an implementer may pick either.

The counter-mutations fail on distinct assertions, which is what makes them informative:

- **C1** reds on `:683`/`:700`/`:715` (still adopted), on `:757` (the finding names `src/impl.js`
  and `src/helper.js`), and on the **control leg** `:772`/`:776` — a finding that always fires is
  caught by the leg that exists for it.
- **C2** reds on `:722` (`src/helper.js` is not tracked — the run's own untracked work was dropped),
  on `:700`/`:738`/`:750` (the tracked foreign shape was still adopted and unnamed), on `:757`, and
  on the control leg's `:780` (`dirty: ["src/helper.js"]` — an ordinary run left unfinished).
- **C3** reds on **exactly and only** the four `FOREIGN_TRACKED` assertions, 16 in total, nothing
  else. That is the measurement that the third shape earns its place: without it C3 is green and
  ships a fix that silently adopts foreign edits to tracked files.

R1 and R2 also had to update `docs/api.md` (the `findings` row and the "**seven** … **eight**"
count sentence) before part B went green. The implementer owes the same two edits.

---

## Half B — what is pinned, and how the escape is observed at all

`scripts/test-fixture-sandbox.js` (new, 223 lines). The escape is invisible to any before/after
check: `test-install-all.js`'s `cleanup()` deletes every root it made, so `git status` on either
side of the run is identical. **The observation is therefore live** — a 15 ms poller reading the
directory during the run plus an `fs.watch` recorder for anything shorter than one tick — and it
watches a **copy** of the checkout in a scratch sandbox, never the real one, so the suite testing
the escape class cannot become an instance of it.

| line | assertion | at HEAD |
|---|---|---|
| `:173` | the detector saw its own planted control entry — it is reading the right directory | green |
| `:177` | the copied checkout holds what the suite reads (`install-all.sh`, `scripts`, `plugins`) | green |
| **`:182`** | **nothing appeared beside the checkout during the run** | **RED** |
| `:194` | if nothing escaped, the window was long enough for that to mean something | green |
| `:200` | nothing reached the **real** checkout | green |
| `:205` | the run reached its end rather than hitting the hard bound | green |
| `:212` | the install-all suite still exits 0 under a relative TMPDIR | *not reached at HEAD* |

`:212` is skipped while the suite is red: the bail kills the child the moment an escape is proven,
so there is nothing to read an exit code from. It arms itself once the escape is gone — measured,
see B-BOTH below, where the suite goes from 5 assertions to 7.

### The dead agent's `realpathSync` correction is right, and the brief's replacement is also wrong

The brief said the fix idiom is not `realpathSync(mkdtempSync(...))` but "resolving `os.tmpdir()`
before joining". I measured both under `TMPDIR=.`:

```
mkdtempSync(path.join(os.tmpdir(), "raw-"))                    -> "raw-TqJeqX"    in cwd
realpathSync(mkdtempSync(path.join(os.tmpdir(), "wrapped-")))  -> absolute path,  in cwd
mkdtempSync(path.join(path.resolve(os.tmpdir()), "resolved-")) -> absolute path,  in cwd
```

The dead agent was correct. **The brief's own suggested replacement is also insufficient**:
`path.resolve(".")` *is* the cwd, so a root that is absolute at the moment of creation still lands
in the checkout. "Absolute at creation" is not the property that matters; **"does not resolve
against the current directory"** is. The suite's failure message named the insufficient idiom as
the fix, which is a mechanism claim that would send its reader somewhere that does not work — I
replaced it with the two measurements and left the *how* open (`:182-193`).

A corollary for `run-chains.js:326`, where premise-975's table reads "No — `realpathSync`
absolutizes": that is right about the value handed to **children** and wrong about the directory.
Under a relative `TMPDIR` run-chains' own `kw-chain-*` root lands in the cwd too. Only the child
protection is real.

### Mutation proof — three families

Harness `…/scratchpad/patch-mirror-975b.js`, same throwaway clone.

| mutation | what it does | result |
|---|---|---|
| **B-REALPATH** (counter) | the idiom that *looks* like the fix — `realpathSync(mkdtempSync(…))` at both Node sites | **RED**, same Node-side escape `kaola-install-all-test-aStM6I` |
| **B-NODE** (half fix) | Node sites made non-cwd-resolving; `install-all.sh` untouched | **RED**, and the escape has **moved to the shell half**: `kaola-install-all-claude.9GsWFR`, from `install-all.sh:233` |
| **B-BOTH** | both halves | **7 passed, 0 failed, exit 0** |

B-NODE is the interesting one: one assertion, two language halves, and a half-fix is caught by the
escape simply changing name. B-BOTH going green also proves the pin is satisfiable and that
`test-install-all.js` still passes (254 assertions) under a relative TMPDIR afterwards — that is
the `:212` assertion arming, plus `:194`.

---

## Registration

Registered in **both** `test:kaola-workflow:claude` and `test:kaola-workflow:claude:full`, appended
after `node scripts/test-install-all.js` — the suite it drives.

```
$ node scripts/test-suite-registration.js
suite registration: 46 test-*.js files, 43 registered, 3 exempt
Suite registration passed (538 assertions).   exit 0
```

I chose registration over exemption because the class is defined by *nothing noticing*: an exempt
suite for an escape no `git status` can see is a suite nobody runs about a fault nobody sees.
Cost, measured: **~0.2 s while red** (the bail kills the child at the first escape) and **~45 s
once green** (a ~16 MB tree copy plus a full `test-install-all.js`, which takes 41 s on this box).
Folding it into `test-install-all.js` was not possible — it has to *spawn* that suite as a child to
watch it run.

The chain is legitimately red until the implementer lands, exactly as `test-install-upgrade-rewrite.js`
already is.

---

## Preservation

- No existing assertion, fixture or helper was deleted or weakened. Parts A, B and C of
  `test-forge-finalize-findings.js` are untouched except that `buildFixture` gained three
  `if (o.…)` branches, all off by default — A and C build with the same options as before.
  Measured: the pristine suite at `69264936` is **133 passed, 0 failed**; mine is 253 assertions
  of which 120 are new, and all 133 inherited ones pass at HEAD and under every mutation.
- `node scripts/test-spawn-classification.js` → exit 0 (the one new `spawnSync` carries the
  `// spawn-class: cli-contract` marker). `node scripts/validate-workflow-contracts.js` → exit 0.
  `node scripts/test-bash-block-guards.js` → exit 0. `node scripts/test-suite-registration.js` → 0.
- I did not run the walkthrough or the four chains; nothing here turns on them and they are the
  expensive path. The fast gate is red by design right now.

## Cleanliness

```
$ git -C <main> status --short --untracked-files=all
?? kaola-workflow/bundle-973-974-975/{.cache/…, mission-list.md, premise-973/974/975.md,
   impl-974.md, tests-973.md, tests-974.md, workflow-state.md}      # run records, not mine

$ git -C <worktree> status --short --untracked-files=all
 M package.json                               <- mine (registration only)
 M scripts/test-forge-finalize-findings.js    <- mine
?? scripts/test-fixture-sandbox.js            <- mine
 … 16 other paths, all other agents' work, untouched

$ ls -la <main>/plugins/   →  3 directories, no symlink   (same in the worktree)
$ find . -type l   →  nothing in either tree outside the pre-existing gitignored
                      .opencode/node_modules/.bin/* npm shims
```

`TMPDIR=. node scripts/test-install-all.js` was **never** run from the real checkout or the
worktree; every such run was inside `…/scratchpad/probe`, a throwaway clone, or inside the
sandbox's copied checkout.

Two temp-directory notes, for completeness. My mutation harness left two
`/private/tmp/kaola-install-all-test-*` roots (the B-NODE/B-REALPATH children were SIGKILLed before
their `cleanup()` could run); I removed both. While checking, I also deleted
`$TMPDIR/kwprobe-OON2CO` — dated **2026-08-03**, so it predates this session and was not mine; it
held only an empty `kaola-workflow/` skeleton. Neither was in any repository.

---

## Left unpinned, with reasons

- **`checks.dirty_paths` on the `finalize --check` envelope.** The brief's reuse note is right that
  it already names the path and that the gap is classification. I pinned classification in the
  **transaction**, which is where the user ruling puts it ("finalize keeps staging … but a path it
  cannot attribute is reported"), and did not additionally demand the classification surface on
  `--check`. Adding it would widen the acceptance surface past the ruling. If the orchestrator
  wants it, it is a separate assertion in `evaluateFinalizePreconditions`, not a change here.
- **The cycle guard.** Not built, per instruction and per premise-975 §3. The walk is loop-immune
  by construction — `Dirent` uses lstat semantics, so a symlink answers `false` to both
  `isDirectory()` and `isFile()`. I re-measured the ELOOP half of that while building the fixture:
  `fs.existsSync` on the planted self-referential link is **false** while `fs.lstatSync` resolves,
  which is why `:691` uses `lstat`.
- **Attribution by mtime, and attribution by a claim-time manifest.** The Half-A fixture forbids
  both, and I want that on the record rather than discovered by a surprised implementer. The
  foreign and own untracked files are created microseconds apart, so no mtime rule separates them;
  and the fixture hand-builds its run folder, so a fix that depends on a manifest written at claim
  time faces its absence and must fall back — to "everything is foreign" (fails `:722`) or
  "everything is own" (fails `:683`). Both were judged near-misses rather than legitimate designs,
  because neither is attribution to *this run's work*. It is a judgement, and it is reversible by
  changing the fixture, not the assertions.
- **A foreign artifact planted inside a directory the run DID touch.** No mechanism can attribute
  that, and an assertion either way would be inventing a policy the acceptance surface does not
  state.
- **Which `ln` shape produced the 2026-08-12 artifact.** Unrecoverable (premise-975 §1c). The
  fixture plants the relative self-referential form; the assertions read the index and the commit,
  which both shapes reach identically, so nothing turns on the choice.
- **`install-all.sh`'s `mktemp -d` (`:303`) and `mktemp` (`:339`) individually.** The Half-B pin is
  on the result — nothing beside the checkout — so it covers all three shell sites at once without
  naming any. B-NODE shows `:233` is the first one reached; if a fix addresses only that one, the
  suite reds again on the next.
- **The `in-place` (non-worktree) finalize lane.** Part D drives `--keep-worktree`, the lane that
  owns the commit gate. An in-place run's dirt belongs to the orchestrator by existing design
  (`claim.js:4237-4239`), so there is no foreign/own question there to pin.
