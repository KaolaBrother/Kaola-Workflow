# tdd-sink — the four uncovered sink / run-chains behaviours, pinned

Author: `tdd-sink` (test custody). Work tree:
`.kw/worktrees/bundle-904-905-906-907-908-909-910`, branch
`workflow/bundle-904-905-906-907-908-909-910`. **Nothing committed. No production file edited.**

Files written — **only these two**:

- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910/scripts/test-sink-merge.js`
  (+622 lines, appended; nothing existing restructured or renumbered)
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910/scripts/test-run-chains.js`
  (+221 lines, appended)

## Baseline

```
commit          2018521fd9e96c7f84ace0d099d3881706414bac  (branch tip; the fixes are UNCOMMITTED working-tree state)
sink-merge.js   sha256 c23eb1be054fb86d…   run-chains.js  sha256 cbd06064504f7252…
test-sink-merge sha256 b9df9d495b400c47…   test-run-chains sha256 f541c3f92d16ca62…   (with the additions)
```

Because the four fixes are already in the tree, a pin's RED baseline is its **mutant** — a scratch
mirror of `scripts/` + `plugins/` with one edit. Mirrors were built by copying (never `git checkout --`
/ `git stash`: the worktree is shared), and every mirror printed its axis — in each case exactly the
four sink copies, or exactly `run-chains.js`, differ from the branch tree.

## Suites, run SERIALLY

```
node scripts/test-sink-merge.js                 EXIT=0   631 assertions   (was 423 — +208)
node scripts/test-run-chains.js                 EXIT=0   283 assertions   (was 258 — +25)
node scripts/simulate-workflow-walkthrough.js   EXIT=0   198/198, FULL scope (shard 1/1, not the 1/12 sample)
```

Neither test file is enrolled in `validate-script-sync` / `edition-sync` and neither has a codex
mirror, so these additions create **no edition drift** and owe no sync. Confirmed after the run's
`sync:editions`:

```
node scripts/edition-sync.js --check      EXIT=0   8 forge aggregator ports in parity; committed kernel parity verified
node scripts/validate-script-sync.js      EXIT=0   15 common scripts, 27 byte-identical groups, 6 forge export-superset families
```

---

## The per-edition loops are NOT vacuous — proven by single-edition mutants

A green four-edition loop proves nothing until a **single-edition** mutant reddens a **single**
edition. Reading the helper is not enough (all of mine take `sinkScript` and pass it to
`runSinkAt(script, …)`, and so does z1's — but that is a read). Measured instead, one mutated file per
mirror, five mirrors:

| mutant | file patched | failures | which legs |
|---|---|---|---|
| boundary → `false` | **gitlab** sink only | 3 | `z1 (gitlab)` ×1, `z2 (gitlab)` ×2 — nothing else |
| boundary → `false` | **gitea** sink only | 3 | `z1 (gitea)` ×1, `z2 (gitea)` ×2 — nothing else |
| boundary → `true` | **gitea** sink only | 2 | `z2 (gitea)` ×1, `z2b (gitea)` ×1 — nothing else |
| `symlinkTargetsOutsideArchive → []` | **codex** sink only | 1 | `z3 (codex)` — nothing else |
| journal glob → fixed-depth | **root** sink only | 1 | `z4 (root)` — nothing else |

Both directions covered per pin family, on three different editions. The arithmetic corroborates
independently: the whole-tree mutants produced exactly 4× the single-edition counts —
boundary→false 12 = 4×3, boundary→true 8 = 4×2, `S1off` 4 = 4×1, journal-glob 4 = 4×1.

**This also settles the pre-existing `z1` loop: it is per-edition and genuine.** Patching only the
GitLab sink reds `z1 (gitlab)` and only that; patching only the Gitea sink reds `z1 (gitea)` and only
that. So the broken discriminator did NOT survive `z1` because the loop was vacuous — it survived
because of a **fixture blind spot**: `z1` plants only a plain nested repository, and both the round-1
and round-2 predicates classify that shape correctly. Mutant C3r1 shows exactly this — `z1` passes
while `z2` reds on all four editions. The forge sink ports were, and are, genuinely driven.

**R3 makes no per-edition claim and so has nothing to prove here.** `test-run-chains.js` drives the
canonical script only, as the pre-existing T-907a does. The forge `run-chains` ports are GENERATED and
policed by the two checks above, both green, and all four copies carry `--no-renames`
(`scripts/…:668`, `plugins/kaola-workflow/scripts/…:668`, gitlab `…:669`, gitea `…:669`).

---

## Pin 1 — C3, the `.git` boundary discriminator · `test-sink-merge.js` (z2) + (z2b)

`assertBoundaryDiscriminationMatchesGit907` and `assertBenignGitEntryKeepsTheBlobGateArmed907`, both
driven on **all four editions**.

**The oracle is git, not a table.** Seven `.git` shapes in one archive — a plain nested repo,
`core.bare=true`, `core.worktree` elsewhere, a junk `.git` FILE, a broken gitfile, a `.git` symlink to
a live gitdir, and no `.git` at all. Ground truth is measured per run in a HEAD-seeded **scratch
index** (the fixture the sink is about to read is never touched): whichever directories the OUTER
repository stages as `160000` ARE the boundaries. The pin is
`receipt.archive_embedded_repos === that set, EXACTLY` — equality, because both directions have their
own failure. Read from the envelope on success and from the surviving journal on a refusal, so the
message stays about the discriminator instead of reporting `[]` for every failure mode.

Plus: every path a refusal names must be one `git add -f` can take (z1's oracle, re-asked on the
shapes z1 cannot plant); the benign shapes' siblings must be **blobs at HEAD**; nothing deleted.

(z2b) is the same answer at the level where it costs something: a benign `.git` FILE with one
**unreadable** sibling. The shipped sink refuses `sink_incomplete` and NAMES that sibling; a
discriminator that called the directory a boundary drops it out of `required[]` and the loss goes
unnamed. (Same shape as (y4), one axis moved.)

### Mutants

| mutant | edit | result |
|---|---|---|
| **C3r1** | `isArchiveRepoBoundary` restored to the ROUND-1 predicate (`git -C <dir> rev-parse --show-toplevel`, i.e. asking the INNER repo) | **z2 RED on all 4 editions, z1 GREEN (0 z1 failures)** |
| **A** | `isArchiveRepoBoundary` → `return false` | z1 AND z2 RED, 12 failures |
| **B** | `isArchiveRepoBoundary` → `return true` | z2 (false-boundary) AND z2b RED, 8 failures |

```
RED (C3r1): #907 z2 (root) — receipt.archive_embedded_repos must equal the set the outer git collapses
            got ["…/issue-90711/c1","…/issue-90711/c6"]
            want ["…/c1","…/c2","…/c3","…/c6"]        <- core.bare and core.worktree MISSED
            + #907 z2 (root): … must SINK, or be declined over paths the operator can act on;
              got exit=1 missing=["…/issue-90711/c2/inner.md", …]     <- the permanent block, alive
            #907 z1: PASSES.   <- the brief's claim, now measured on this branch
RED (A):    #907 z2 — got []        (and #907 z1 reds too)
RED (B):    #907 z2 — got ["…/c1","…/c2","…/c3","…/c4","…/c5","…/c6"]   <- c4/c5 are benign
            #907 z2b — the refusal names ["…/.cache/n1-impl.md","…/finalization-summary.md",
              "…/workflow-plan.md","…/workflow-state.md"] and NOT the unreadable sibling under the
              falsely-skipped directory: the loss is real and unnamed.
GREEN:      shipped — 631 assertions, exit 0.
```

C3r1 is the load-bearing one: it reproduces the reviewed defect verbatim and shows the existing z1 pin
passing straight through it while z2 catches it on every edition.

---

## Pin 2 — S1, unbacked symlinks · `test-sink-merge.js` (z3)

`assertUnbackedSymlinksAreReported907`, all four editions. Five committed `120000` entries in one
archive, so both directions are decided by the same code on the same run:

| link | target | expected |
|---|---|---|
| `L1-absolute-outside.md` | absolute, outside the repo | **named** |
| `L3-dangling.md` | `/nonexistent/kw-z3/gone.md` | **named** |
| `sub/L4-relative-escape.md` | relative traversal out of the archive | **named** |
| `sub/L2-relative-inside.md` | `../.cache/inside-target.md` | not named |
| `L5-relative-inside-shallow.md` | `.cache/inside-target.md` | not named |

Posture pinned as hard as the report: **exit 0 stays 0**, `status: sinked`,
`archive_missing_paths` empty, `steps.archive_commit === 'done'`. Premise asserts all five are
`120000` at HEAD (else the discrimination would be vacuous) and that L4 genuinely resolves outside.
The discrimination is an **exact set**, not containment.

### Mutants

```
RED (D — containment test disabled):
  #907 z3 (root): receipt.archive_unbacked_symlinks must name EXACTLY the three …
  got ["…/L1-absolute-outside.md","…/L3-dangling.md","…/L5-relative-inside-shallow.md",
       "…/sub/L2-relative-inside.md","…/sub/L4-relative-escape.md"]     <- L2/L5 over-reported
  4 failed (one per edition), nothing else in the suite moves.

RED (S1off — symlinkTargetsOutsideArchive → return []):
  #907 z3 (root): … got []                                              <- the pre-#907 silence
  4 failed, nothing else moves.

GREEN: shipped.
```

---

## Pin 3 — R3, a rename out of `plugins/` · `test-run-chains.js` (T-907b)

Five cases, canonical edition (as T-907a is; see the edition note below):

| case | shape | expected |
|---|---|---|
| r1 | `git mv plugins/kaola-workflow/scripts/moved.js src/moved.js` | all-four + the **source** recorded in `scope.touchedEditionPaths` |
| r2 | pure delete of the same file | all-four (control — always worked) |
| r6 | rename INTO `plugins/` | all-four (control — always worked) |
| r7 | rename out of `plugins/` with a **non-ASCII** source name | all-four + the literal source recorded (needs BOTH halves of #907) |
| r8 | rename with no edition path on either side | **claude-only**, no touched path (over-capture control) |

Each case measures its own premise on its own repo: for r1/r7, git's default (rename-detection-ON)
diff must OMIT the `plugins/` pre-image — that omission is the defect, and a repo where git named it
anyway would make the case pass on the broken classifier.

### Mutants

```
RED (--no-renames removed from computeChangedFiles):
  T-907b(r1 rename OUT of plugins/): the diff must select claude,codex,gitlab,gitea … got "claude"
  T-907b(r1): receipt.scope.decision === all-four; got {"decision":"claude-only",
      "reason":"non_edition_diff", …,"touchedEditionPaths":[],"changedFileCount":1,"chains":["claude"]}
  T-907b(r7 … NON-ASCII source name): same two, got "claude"
  6 failures — r1 and r7 only; r2, r6, r8 stay GREEN.

RED (isEditionCouplingPath → return true — the "just widen everything" fix):
  T-907b(r8 … over-capture control): must select claude; got "claude,codex,gitlab,gitea"
  T-907b(r8): … must record NO touched edition path; got ["src/movable.js","src/renamed.js"]
  8 failures.

GREEN: shipped — 283 assertions, exit 0.
```

**Editions.** `test-run-chains.js` drives the canonical script only, as the existing T-907a does; the
forge ports are GENERATED and policed by `edition-sync --check` + `validate-script-sync`. Verified by
reading what ships: all four copies carry `--no-renames` —
`scripts/…-run-chains.js:668`, `plugins/kaola-workflow/scripts/…:668`,
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-…:669`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-…:669`.

---

## Pin 4 — C1, journals must not reach git history · `test-sink-merge.js` (z4)

`assertJournalsNeverReachHistory906`, all four editions. Journals planted at **four depths** under the
archive — depth 0 (archive root), depth 1 (the shape the pre-#906 exact pathspecs covered), depth 2
(`.orphan-main-live-<ts>/.cache/`, the leak) and depth 3 (`**/` spans any number, not exactly one) —
with real run evidence sharing every one of those directories.

**It reads what git COMMITTED, and nothing else.** `SINK_STAGE_SKIP` keeps journal basenames out of
`required[]`, so the blob gate is structurally silent here and asking the sink's own bookkeeping would
measure the bookkeeping. The clause is: no path matching `sink-(receipt|fallback).json` anywhere in
`ls-tree -r HEAD`.

**The over-exclusion control is half the pin**: every planted evidence file — including the ones in
the same directories as the excluded journals — must be a blob at HEAD, plus the ordinary archive
evidence. Also asserted: the journals are still on disk afterwards (an exclusion works by not staging,
never by deleting) — scoped to journals the sink does not own, because #653 deliberately disposes of
its own `<archive>/.cache/sink-{receipt,fallback}.json` on terminal success
(`sink-merge.js:1090-1092`); that one's absence is the disposal, not the exclusion.

### Mutants

```
RED (C1exact — `**/…` reverted to the pre-#906 exact `.cache/…` pathspecs):
  #906 z4 (root): no sink transaction journal may exist anywhere in the published tree;
  got ["…/issue-90641/.orphan-main-live-2026-08-01T22-52-06-988Z/.cache/sink-fallback.json",
       "…/.cache/sink-receipt.json", "…/.cache/nested/sink-receipt.json",
       "…/issue-90641/sink-fallback.json", "…/issue-90641/sink-receipt.json"]
  4 failed (one per edition), nothing else in the suite moves.

RED (C1over — the journal rule intact PLUS a subtree exclude `**/.cache/**`):
  #906 z4 (root): the rescued evidence at .orphan-main-live-…/.cache/main-only-evidence.md must be a
    BLOB at HEAD …
  #906 z4 (root): … .cache/nested/deep-evidence.md …
  #906 z4 (root): the ordinary archive evidence at .cache/n1-impl.md must still be committed
  16 z4 failures + 94 collateral elsewhere (a subtree exclusion breaks much more than this leg).

GREEN: shipped.
```

---

## Unpinnable, with the reason and the measurement

**The `120000` mode filter inside `symlinkTargetsOutsideArchive`** — the sub-mechanism that stops a
path git committed as CONTENT (`100644`) from being reported as an unbacked pointer when the path is a
symlink on disk *now*.

- **Measured, not reasoned:** MUTANT E (`if (rec.indexOf('120000 ') !== 0) continue;` disabled) runs
  the whole suite to **EXIT=0, 631 assertions**. It is silent — `readlinkSync` throws on a regular
  file, so ordinary files are excluded anyway. Confirms the implementer's note.
- **The mutation BIT — this is not a silent no-op recorded as evidence.** Verified in the mirror:
  `sink-merge.js:1500` reads `if (false && rec.indexOf('120000 ') !== 0) continue;   // MUTANT E`,
  and `diff` against the branch tree shows that one line changed. (Every mutant here is built by a
  script that exits 2 if the `String.replace` left the file unchanged, and that prints its axis — the
  set of files differing from the branch tree — before any suite runs.)
- **Why the separating shape is not reachable through the sink transaction:** it needs HEAD to carry a
  `100644` entry at a path that is a symlink on disk at the instant the probe runs. The sink re-stages
  the whole archive pathspec in the same run, which erases any such disagreement before the probe
  reads. The one arm that skips the re-stage is `archiveIgnored` — and in that posture nothing under
  the archive reaches HEAD at all (the existing (q) leg already asserts exactly that), so `ls-tree`
  returns no records and the filter is never consulted. Reaching it would need a mutation between the
  merge checkout and the probe, i.e. inside the sink's own process.
- Adding a seam to make it testable is a production edit, so this is reported rather than built. The
  behaviour it protects — a false alarm on a committed regular file — is real but is not one of the
  four assigned pins.

## Follow-up — the `claude` chain's spawn-classification ceiling (fixed by CONVERSION, not annotation)

The chain reddened on `scripts/test-run-chains.js`: 6 unclassified spawn sites against a ceiling of 5.

**Which sites were mine, measured rather than assumed** — the guard's own `enumerateFile` run over
both the current file and `git show 2018521f:<file>`:

```
scripts/test-run-chains.js  BEFORE(2018521f): sites=4 unclassified=4 lines=[33,47,1244,1504]
scripts/test-run-chains.js  AFTER T-907b    : sites=6 unclassified=6 lines=[33,47,1244,1568,1688,1704]
scripts/test-sink-merge.js  BEFORE and AFTER: sites=6 unclassified=3 lines=[132,282,891]   (unchanged)
```

So **exactly two sites were mine — 1688 and 1704**. Lines 33, 47, 1244 and 1568 are pre-existing and
inherited (1504 → 1568 is the same site, shifted down by my insertion); I did not touch them. The file
had one slot of headroom and T-907b used two. `test-sink-merge.js`'s +622 lines added **zero** spawn
sites — those legs already route through `G.git` / `runSinkAt`.

**Both of mine were git ARRANGEMENT, so they were converted, not classified.** They are exactly the
case `test-git-fixture.js` exists for, and this file already routes four such calls through `G.exec`
(`:293`, `:993`, `:994`, `:999`):

- `1688` — the per-case fixture git helper → `G.exec(dir, args, { encoding: 'utf8' }).trim()`
- `1704` — the default-diff premise probe → `G.exec(dir, ['diff', …], { encoding: 'utf8' })`

`G.exec(repo, args, opts)` is `execFileSync('git', ['-C', repo, ...args], opts)` — the identical argv,
so the conversion is behaviour-preserving by inspection, which is the property that library's header
claims. Checked against the documented hazard first: this file patches `spawnSync` (`:129`) and NOT
`execFileSync`, and `G.exec` uses the execFileSync side, so nothing is intercepted.

**No ceiling was raised, and no pre-existing site was annotated.** The count went DOWN — the file now
carries 4 sites where it carried 6, i.e. two spawns were removed rather than declared.

```
enumerateFile after: scripts/test-run-chains.js  sites=4 unclassified=4 lines=[33,47,1244,1568]  ceiling=5
node scripts/test-spawn-classification.js            EXIT=0   610 sites / 60 files, 181 classified
node scripts/test-run-chains.js                      EXIT=0   283 assertions (unchanged)
KAOLA_RUN_CHAINS_CONCURRENCY=serial run-chains --project … --chains claude
                                                     EXIT=0   claude=green, 40/40 steps, none red
                                                     incl. `node scripts/test-spawn-classification.js` GREEN
```

Two notes on what that chain receipt does and does not cover:

- It was written with `--output` to a scratch path **on purpose**, so a one-chain receipt could not
  clobber the run's own four-chain `chain-receipt.json` (untouched, 10011 bytes, 08:29). It is bound to
  `headSha 8cbb8797` over a tree that my fix has since made dirty, so it is evidence the gate passes —
  **not** a substitute for the receipt run after the commit is amended.
- Neither `test-run-chains.js` nor `test-sink-merge.js` is a step in the fast `claude` chain (both are
  deferred heavyweight suites), and the chain samples the walkthrough at `--shard auto/12`. Those three
  were therefore run directly and serially, at full scope, and are reported above.

## Scope notes

- No production file edited; no seam added; no existing test restructured, renumbered, weakened or
  deleted. The additions are appended blocks plus four new `assert…` helper functions and one new
  four-edition `forEach` table in `test-sink-merge.js`.
- Files owned by other test authors (`test-claim-hardening.js`, `test-finalize-door.js`,
  `test-validation-runner.js`) were not touched.
- Mutant mirrors, logs and the mutation scripts are kept under the session scratchpad
  (`mirror-{A,B,C3r1,D,E,S1off,C1exact,C1over}/`, `mut-*.log`, `muts/*.js`, `mkmutant.js`).
