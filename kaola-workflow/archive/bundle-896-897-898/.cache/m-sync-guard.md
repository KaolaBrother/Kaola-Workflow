# m-sync-guard — edition-tree drift made observable

baseline: `3e2019f6f7ff8fc4663db6bc5a08ff9949ec32cf` (branch `workflow/bundle-896-897-898`)
owned files: `scripts/test-opencode-edition.js`, `scripts/test-kimi-edition.js`, `package.json`

**Verdict: the guard is mutation-proven armed, in both editions, in both arms.**

---

## DESIGN CHOSEN AND WHY

**The check runs before the `--write`, and a drifted tree stops the suite there.**

The scratch-render split the brief sketched is not reachable from a test file. `REPO` in both sync
modules is `path.resolve(__dirname, '..')` (`scripts/sync-opencode-edition.js:74`,
`scripts/sync-kimi-edition.js:50`) with no env override, and `runWrite`/`runCheck` derive every path
from it. Redirecting a render to a scratch root needs a production change to a file I do not own and
may not write under test custody. So the split was unavailable, and the fix is ordering instead.

What that yields is better than a split anyway, because it removes the self-heal rather than routing
around it:

- **Observation precedes repair.** `D0` spawns `sync-<runtime>-edition.js --forge=<f> --check` per
  forge and reports what was on disk. The existing `--write` self-provision block is unchanged and
  still runs, but now *after* the measurement, so the rest of the suite keeps the tree it needs.
- **A drifted tree exits the suite immediately, before `--write`.** This is the load-bearing choice.
  Counting an ordinary failure and continuing would reach the `--write` two blocks down, repair the
  tree, and make the *next* run green — a red that deletes its own cause. Exiting first leaves the
  drift on disk, so the failure is durable until someone regenerates deliberately. Proven: the same
  dirty tree reds twice in a row, hash unchanged (below). The full `--check` mismatch list is printed
  before the exit, so nothing actionable is lost by stopping early.

### How absent-tree is handled

The trees are gitignored, so a fresh clone and *every worktree* has none — `.opencode/` and `.kimi/`
were in fact absent in this worktree at the start of this task, and a bare `--check` there exits 1
naming 19 "missing" files. Absence therefore cannot be a failure. It is a skip, and the skip is loud
in three places:

- one `D0: SKIPPED — <tree> is absent from disk, so nothing was compared` line per absent tree;
- a `[drift-check: ...]` suffix appended to the suite's **final line**, on both the pass and the fail
  path, reading either `3 tree(s) in parity (…)` or `NO tree verified; 3 ABSENT, not checked (…)`.

"Verified clean" and "nothing was there" cannot print the same thing. Contrast the two real final
lines:

```
opencode-edition test passed (492 assertions). [drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)]
opencode-edition test passed (492 assertions). [drift-check: NO tree verified; 3 ABSENT, not checked (.opencode, .opencode-gitlab, .opencode-gitea)]
```

What the skip gives up is bounded and stated in the code: only the *generated* tree is skippable. For
opencode the tracked `opencode.json` is compared to `renderOpencodeJson()` by A7
(`test-opencode-edition.js:550`), unconditionally and independent of any tree's presence. The kimi
edition ships no tracked config at all, so an absent kimi tree leaves nothing to check.

Presence is probed **per forge tree**, not once: `--write` materializes only the default forge, so a
`.opencode-gitlab/` an installer left behind is checked when present and skipped when not. On a
developer machine with all six trees this is 3 checked trees per edition, not 1.

### D1 — the guard on the guard, and the defect it caught in my own first version

A presence probe resolving a path no tree is ever written to returns false for every forge: D0 then
skips everything and prints three reassuring lines while checking nothing. D1 asserts, after
`--write`, that the probe resolves a tree that exists.

My **first version of D1 did not work**. It restated `sync.treeLabel(sync.DEFAULT_FORGE)`
independently instead of calling the expression D0 skips on, so a mutation that pointed D0's probe at
`label + '-NOWHERE'` left D0 skipping all three forges while **D1 passed and the suite exited 0** —
measured, not theorised. Fixed by routing both through one `treeRootFor` (`:72` / `:91`), which is now
the single expression D0 skips on and D1 asserts on. The comment at D1 records this, since the
independently-written form is the intuitive one and would be re-introduced by anyone tidying it.

---

## CHANGES

`scripts/test-opencode-edition.js` (+88)

| line | change |
|---|---|
| 39–66 | `D0` derivation comment — why observation precedes repair, why it exits, why absent is a loud skip, why per-forge |
| 68 | `let driftVerdict` |
| 72 | `treeRootFor` — the one presence expression, shared by D0 and D1 |
| 74–110 | `D0` block: per-forge `--check` spawn, exit-on-drift, verified/absent lines, verdict string |
| 82 | `// spawn-class: cli-contract` on the new spawn site |
| 112–128 | the pre-existing `--write` self-provision, unchanged, now second |
| 130–139 | `D1` anti-vacuity assert |
| 1838–1843 | `driftVerdict` appended to the final line on **both** the fail and the pass path |

`scripts/test-kimi-edition.js` (+89) — the same block at `:57–157`, `treeRootFor` at `:91`,
spawn annotation at `:101`, final lines at `:1260–1265`. Twin, not shared: this repo's rule is that
each edition's suite defends its own copy, so each was mutation-proven separately.

`package.json` — **unmodified** (see NPM WIRING).

No production file touched. No test deleted, no assertion relaxed. Pre-existing assertion counts are
unchanged (490 → 492 opencode, 505 → 507 kimi: +2 = D0's forge-axis assert and D1).

---

## MUTATION PROOF ARMED

All runs on a scratch mirror at
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/176fc27c-8e46-48f3-80d7-313c6ebcdc4b/scratchpad/mirror`.
Every exit code captured via `$?` directly, never through a pipe. Nothing was `git checkout --`'d in
the shared worktree.

### opencode — dirty tree goes RED, and stays red

Mutation: `printf '\n<!-- injected drift -->\n' >> .opencode/command/workflow-next.md`

```
[2] PRESENT + CLEAN            exit=0   [drift-check: 3 tree(s) in parity (...)]
[3] DIRTY TREE                 exit=1
    clean=de25c007f4b24f1c7cca23cfec33e963974668a4f8e71241ce403fd58ae0a47d
    dirty=84d7f3bf392c30ed53f9cdebaa6b35c07ab704f0370011c041caabf2a675d053
    after=84d7f3bf392c30ed53f9cdebaa6b35c07ab704f0370011c041caabf2a675d053
    DURABLE: the failing run did not repair the tree
[4] RESTORED (sync --write)    exit=0   [drift-check: 3 tree(s) in parity (...)]
```

Failure signature:
```
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - .opencode/command/workflow-next.md — stale — regenerate
opencode-edition test FAILED: D0[github]: .opencode is present on disk and has DRIFTED from canonical (sync --check exit 1).
```

Durability confirmed a second way, on an earlier identical mutation: re-running the suite on the
still-dirty tree gave `exit=1` again with the hash unchanged.

### kimi — same cycle

Mutation: append to `.kimi/skills/workflow-init/SKILL.md`

```
[2] PRESENT + CLEAN            exit=0   [drift-check: 3 tree(s) in parity (...)]
[3] DIRTY TREE                 exit=1
    clean=87f39ba9d219fab0db92876e245c846c884ec1cede9fbd136d8acd4db16151c4
    dirty=a10eea163ec3dd6f4d16d406f6f8dfed609d2c8223ab8c083083ddac170ac879
    after=a10eea163ec3dd6f4d16d406f6f8dfed609d2c8223ab8c083083ddac170ac879
    DURABLE: the failing run did not repair the tree
[4] RESTORED (sync --write)    exit=0   [drift-check: 3 tree(s) in parity (...)]
```

### The delta belongs to this change — the pre-change suites were run on the identical mutation

This is the evidence that matters, because a green-to-red flip could come from anywhere. The
`HEAD:` version of each suite was extracted into the mirror and run against the **same dirty tree**:

```
PRE-CHANGE opencode suite on IDENTICAL mutation   exit=0   "opencode-edition test passed (490 assertions)."
  hash after PRE run: de25c007…  <- SELF-HEALED back to clean
PRE-CHANGE kimi suite on IDENTICAL mutation       exit=0   "kimi-edition test passed (505 assertions)."
  hash after PRE run: 4357c123…  <- SELF-HEALED back to clean
```

The reported defect reproduced exactly: the old suites pass on a drifted tree **and erase the
evidence while doing it**. The new suites red on the same input and leave it on disk.

### D1 (anti-vacuity) — mutation-proven separately in each edition

Mutation: `treeRootFor` resolves `sync.treeLabel(forge) + '-NOWHERE'`.

```
opencode  exit=1  FAIL: D1: ... it resolved <mirror>/.opencode-NOWHERE, which does not,
                        so D0 skipped every forge and checked nothing
                  final: 1 failure(s), 491 passed. [drift-check: NO tree verified; 3 ABSENT ...]
kimi      exit=1  FAIL: D1: ... it resolved <mirror>/.kimi-NOWHERE, ...
                  final: 1 failure(s), 506 passed. [drift-check: NO tree verified; 3 ABSENT ...]
```

Both mutations reverted; `grep -c NOWHERE` = 0 in both files in the worktree.

---

## ABSENT-TREE PROOF (no false red)

The worktree itself is the fresh-clone case — `.opencode/` and `.kimi/` do not exist in it, and did
not at any point during this task. The mirror was built from it with no trees:

```
[1] opencode, no tree on disk   exit=0
    D0: SKIPPED — .opencode is absent from disk, so nothing was compared (gitignored generated tree; a fresh clone has none).
    D0: SKIPPED — .opencode-gitlab is absent ...
    D0: SKIPPED — .opencode-gitea is absent ...
    opencode-edition test passed (492 assertions). [drift-check: NO tree verified; 3 ABSENT, not checked (...)]

[1] kimi, no tree on disk       exit=0
    D0: SKIPPED — .kimi is absent ... (x3)
    kimi-edition test passed (507 assertions). [drift-check: NO tree verified; 3 ABSENT, not checked (...)]
```

No false red, and the absence is stated on the final line rather than passing silently.

---

## NPM WIRING

**`package.json` is unmodified, deliberately.** `test:kaola-workflow:editions` already exists at
`package.json:45` and runs both suites; that script is the owner-ruled home for the additive editions
(recorded in `kaola-workflow/archive/bundle-881-882-883-884-885/mission-list.md:87`), and
`scripts/test-suite-registration.js:44` already treats it as their registration. Since the drift
check now lives inside the suites, that existing script *is* the wiring — proven end to end on the
mirror, both arms:

```
npm run test:kaola-workflow:editions   (clean trees)   exit=0
  opencode-edition test passed (492 assertions). [drift-check: 3 tree(s) in parity (...)]
  kimi-edition test passed (507 assertions). [drift-check: 3 tree(s) in parity (...)]

npm run test:kaola-workflow:editions   (drifted tree)  exit=1
  sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  opencode-edition test FAILED: D0[github]: .opencode ... has DRIFTED from canonical
```

**Why not a bare `--check` step in package.json**, which is what the brief's `grep -c` measured: a
bare `node scripts/sync-opencode-edition.js --check` false-reds on every fresh clone and every
worktree, which is precisely the trap the brief flagged. Making it fresh-clone-safe requires the
presence probe, and the only place I may put that is a file I own — hence inside the suites. The
consequence is that `grep -c` for `--check` in `package.json` stays **0** while the check genuinely
runs; the proxy metric no longer tracks the property. Flagging that explicitly so it is a decision
and not an oversight — say the word if you want a `--drift-only` flag on the suites plus a
`test:kaola-workflow:editions:drift` script for a fast standalone answer.

**Not bolted into `npm test`**, per CLAUDE.md: opencode and kimi are additive runtime editions, absent
from `npm test`, `edition-sync.js` and `install.sh`, and an edition-only diff owes no four-chain run.
Nothing in `npm test` or any forge chain was touched.

---

## SIDE CHECKS

- `node --check` passes on both files.
- `node scripts/test-spawn-classification.js` — my two new sites are accepted as `cli-contract`
  (argv → handler → exit code, which is exactly what reading `--check`'s status is). Neither of my
  files appears in its output. **It exits 1 on this worktree for a different agent's file**:
  `scripts/test-sink-merge.js:2566` carries `spawn-class: cli-contract — the mirrored module must be
  loaded in a FRESH process to observe`; the vocabulary is closed and rejects the trailing prose, and
  the same file is at 4 unclassified sites against a ceiling of 3. Not mine to fix — passing it on.
- `git status` in the worktree shows my diff confined to the two suites. No `.opencode/` or `.kimi/`
  was created in the shared worktree; every run was on the mirror.

---

## NOT DELIVERED AND WHY

1. **The scratch-render split.** Unreachable without editing `sync-*-edition.js` (`REPO` is
   `__dirname`-derived, no override), which is production code and outside test custody. The
   observe-then-write ordering plus the exit-on-drift achieves the same end — the suite no longer
   repairs what it measures — without it.
2. **A standalone `--check` npm script.** Would false-red on a fresh clone. See NPM WIRING; offered
   as a `--drift-only` flag if you want it.
3. **Unexplained, reported not attributed: the scratch mirror was wiped mid-session.** Between two
   runs the mirror was reduced to `.opencode/` and `.opencode-gitlab/` — every other entry, including
   `install-opencode.sh` and `package.json`, gone. It did **not** reproduce: rebuilt mirrors survived
   the opencode suite alone, the kimi suite alone, `npm run test:kaola-workflow:editions`, and ~10
   further full runs. Every `rmSync` in both suites targets a local `mkdtempSync(os.tmpdir())` path;
   none is repo-relative. So I have no evidence the suites did it and am not claiming they did — most
   likely external to this worktree (scratchpad pruning). Recording it because a repo-root deletion
   is not something to leave unsaid, and because it invalidated one intermediate run I re-did from a
   fresh mirror. **The shared worktree was never affected.**
