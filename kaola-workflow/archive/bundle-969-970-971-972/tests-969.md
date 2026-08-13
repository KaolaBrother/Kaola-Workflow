# Tests — #969 (edition tree root + the mandated regenerate step)

Baseline: `7e962bdc86d188e1da99af3309a13ae0dd3d9e97`
Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972`

## Files changed

Two, both test files, both editions-suite-only. No production file touched.

- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972/scripts/test-opencode-edition.js` — new band **A31 + A32**, +340 lines, 0 deletions
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972/scripts/test-kimi-edition.js` — new band **K13 + K14**, +345 lines, 0 deletions

`git diff --stat` for my two files: `2 files changed, 685 insertions(+)`. Nothing deleted, no existing
assertion altered, D0/D1 untouched.

**The constraint held.** Both bands are reached only by `npm run test:kaola-workflow:editions`. No chain
script, no `package.json` script, no chain-resident suite was edited. Verified after the fact by running
the two chain-resident guards that read `scripts/` wholesale:

```
node scripts/test-spawn-classification.js
  spawn-classification passed (10 mutation assertions; 657 spawn sites across 65 files,
  225 classified, 432 grandfathered; 126 slot(s) of slack)                          EXIT 0
node scripts/test-suite-registration.js
  suite registration: 45 test-*.js files, 42 registered, 3 exempt
  Suite registration passed (527 assertions).                                       EXIT 0
```

(The editions suites carry no `CEILINGS` row, so their unclassified-spawn ceiling is 0 — every new
`spawnSync` I added carries a `// spawn-class:` annotation.)

## Assertion counts

Measured in the **same starting state** for both legs (all six trees present and in parity), because a
run with the trees absent takes different branches and the raw counts are not comparable. The baseline
leg ran the `HEAD` version of both suites out of a `/tmp` mirror of the worktree.

| suite | baseline | with the new bands | delta |
|---|---|---|---|
| `test-opencode-edition.js` | 570 passed, **1 failed** (pre-existing, see below) | 606 passed, **7 failed** | +42 assertions |
| `test-kimi-edition.js` | **528 passed, 0 failed** | 564 passed, **6 failed** | +42 assertions |

## What is pinned

Everything is stated as a result. No test names a function, an export, a flag or a require topology.

### A31 / K13 — where a sync run from a linked worktree writes

Fixture: a scratch repo built from the checkout's own source trees, `git init` + commit, then a **real
`git worktree add`**. Edition trees exist in that fixture's MAIN only. The sync is then invoked from the
worktree. Nothing depends on `.opencode*`/`.kimi*` existing in this repo.

The discriminator is **two markers**, and it is the part that matters: "writes main's tree" is satisfiable
by resolving *everything* — sources included — against the main checkout, and that change closes nothing
(a run's regenerate would read main's unedited sources and write a tree already in parity). So one marker
is planted in MAIN's `agents/<first>.md` and a different one in the WORKTREE's copy:

- main's rendered surface must **gain** the worktree's marker → *writes main's tree*
- main's rendered surface must **lose** main's own marker → *rendered from the invoking checkout's sources*
- `<worktree>/.opencode` (`.kimi`) must **not exist** → *no throwaway tree*
- `--check` run from the worktree must exit 0 over the tree `--write` just made current → *`--check` and
  `--write` agree about the root*. **Green on arrival** (today both resolve the worktree): it exists to
  stop the fix moving only the writer.

Controls shipped inside the band: the fixture is asserted green before anything is planted; a canonical
edit is proven to reach the rendered surface at all (otherwise both marker assertions would be vacuous);
the worktree is proven to hold its own copy of the sources; every `git` step is asserted, so a fixture
that failed to build reds instead of silently checking nothing.

**Non-git leg** (same band): a copy that is not a git checkout, script invoked with cwd set to a directory
belonging to no checkout. `--write` must exit 0, write into the root the script lives in, and **never**
into cwd; `--check` must agree. This pins the "not cwd" half of the ruling and the fallback the installers
need — they run the sync from wherever they were unpacked, which may be no repository at all. Green on
arrival; it is a don't-regress pin for the new git dependency.

### A32 / K14 — the mandated regenerate step

Fixture: a committed scratch repo (no worktree, so this band's subject is the step and not the root
resolution A31/K13 already owns). **Default forge tree present, one non-default forge tree present, the
third forge absent.** A marker is appended to `templates/routing/next.skeleton.md`, then only the mandated
step runs: `node scripts/generate-routing-surfaces.js --write`.

- both **present** trees are in parity afterwards (`sync --check` exit 0) — including the non-default one,
  so a fix that only handles the default forge reds
- the present default tree **contains the edited prose**, not merely a passing exit code
- the **absent** tree is still absent — an absent tree carries no stale prose, and materializing one hands
  a developer a forge tree they never installed. Green on arrival.
- `generate-routing-surfaces --check` still exits 0 over the 18 tracked surfaces afterwards — the step
  keeps doing its own job

Controls: both trees are asserted in parity *before* the skeleton edit (otherwise a `--check` exit says
nothing about the step), and `generate-routing-surfaces --check` is asserted **exit 1** right after the
skeleton edit — without that, every parity assertion below could be green over an edit that went nowhere.

**And the chains gain no edition coverage** (green on arrival, labelled as such in the source): with drift
planted directly in a present edition tree, `generate-routing-surfaces --check` must still exit 0, and must
not have repaired the planted drift. `--check` runs in all four chains, so an edition tree read in *check*
mode puts the editions inside `npm test` — the thing the ruling forbids — and false-reds every fresh clone
and every worktree besides. This pin is what makes that reversal red.

### Deliberately not pinned

- **Literal silence about absent trees.** The brief said "silent/no-op". I pinned the substantive half —
  the tree is not created and nothing fails — and not the absence of a printed line. D0's own design in
  both suites argues the opposite way ("absent is a skip, and the skip is LOUD"), so a pin on silence
  would forbid the wording this repo already prefers. Say the word and I will tighten it.
- **Any require topology.** Both bands only spawn CLIs and read the filesystem.

## The RED — and how to tell it from the two pre-existing reds

There are **two** pre-existing reds at this baseline, not one. Both are unrelated to my bands.

**Pre-existing red 1 — main only.** `node scripts/test-opencode-edition.js` in the MAIN checkout exits 1
at `D0[gitlab]` because main's gitlab/gitea trees are genuinely stale (the 12 files the premise check
measured). My bands never run there — D0 exits first.

**Pre-existing red 2 — worktree, and it is not in the brief.** Run from the worktree (where D0 skips the
absent trees and the suite reaches the end), the opencode suite already failed at the baseline commit,
before I changed anything:

```
FAIL: S2 (#927): .opencode/command/kaola-workflow-finalize.md:240: mechanism word "variant" in
generated opencode prose …  **That one line is whole-run; there is no per-issue variant of it.**
opencode-edition test FAILED: 1 failure(s), 570 passed.
```

Traced to `fd00ef63` (the #968 bundle change), which put the word *variant* into
`templates/routing/finalize.skeleton.md:267`. It is invisible in main because D0 stops the suite first.
**Flagging it for the lead: `npm run test:kaola-workflow:editions` is red at the baseline for a reason
this bundle did not create and #969 does not cover.** It reds no chain (the editions suites are in none).

**The kimi suite is the clean signal:** green at the baseline (528 assertions, exit 0), so every failure
below is mine.

### My red — opencode (`node scripts/test-opencode-edition.js`, run from the worktree)

```
FAIL: A31: a sync run from a linked worktree writes the MAIN checkout's edition tree.
  /var/folders/…/oc-a31-dUT9NC/main/.opencode/agent/adversarial-verifier.md does not carry the
  worktree's marker, so the regenerate a run performs on its branch leaves main's tree exactly as
  stale as it found it — the observed failure this band exists for
FAIL: A31: ...and renders it from the INVOKING checkout's canonical sources. Main's tree still
  carries the marker planted in MAIN's agents/ …
FAIL: A31: ...and leaves no throwaway tree in the worktree. /var/folders/…/oc-a31-dUT9NC/wt/.opencode
  exists: a tree written there is deleted with the worktree, which is how a run can report six trees
  in parity and leave twelve stale files behind
FAIL: A32: after the regenerate step, the PRESENT tree .opencode is current — --check exited 1:
  sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
    - .opencode/command/workflow-next.md — stale — regenerate
FAIL: A32: after the regenerate step, the PRESENT tree .opencode-gitlab is current — --check exited 1:
  sync-opencode-edition[gitlab]: PARITY FAILED (1 file(s)):
    - .opencode-gitlab/command/workflow-next.md — stale — regenerate
FAIL: A32: ...and the tree carries the edited prose itself, not merely a passing exit code —
  .opencode/command/workflow-next.md does not contain the marker planted in the skeleton

opencode-edition test FAILED: 7 failure(s), 606 passed.
```

7 = my 6 + the pre-existing S2.

### My red — kimi (`node scripts/test-kimi-edition.js`, run from the worktree)

```
FAIL: K13: a sync run from a linked worktree writes the MAIN checkout's edition tree.
  /var/folders/…/kimi-k13-vwKZyL/main/.kimi/skills/kaola-role-adversarial-verifier/SKILL.md does not
  carry the worktree's marker …
FAIL: K13: ...and renders it from the INVOKING checkout's canonical sources …
FAIL: K13: ...and leaves no throwaway tree in the worktree. /var/folders/…/kimi-k13-vwKZyL/wt/.kimi exists …
FAIL: K14: after the regenerate step, the PRESENT tree .kimi is current — --check exited 1:
  sync-kimi-edition[github]: PARITY FAILED (1 file(s)):
    - .kimi/skills/workflow-next/SKILL.md — stale — regenerate
FAIL: K14: after the regenerate step, the PRESENT tree .kimi-gitlab is current — --check exited 1:
  sync-kimi-edition[gitlab]: PARITY FAILED (1 file(s)):
    - .kimi-gitlab/skills/workflow-next/SKILL.md — stale — regenerate
FAIL: K14: ...and the tree carries the edited prose itself, not merely a passing exit code —
  .kimi/skills/workflow-next/SKILL.md does not contain the marker planted in the skeleton

kimi-edition test FAILED: 6 failure(s), 564 passed.
```

6 = mine, all of them. Baseline for this suite was 0 failures.

## Satisfiability proof (throwaway, in /tmp, never the repo)

A red that no implementation can clear is a wrong oracle. I mutated a **`/tmp` mirror**'s copies of
`sync-opencode-edition.js`, `sync-kimi-edition.js` and `generate-routing-surfaces.js` to implement the
ruled behaviour, and re-ran both suites against the mutated mirror:

```
opencode: 612 passed, 1 failed   ← the 1 is the pre-existing S2 (#927); all 6 of my reds went green
kimi:     570 passed, 0 failed   ← fully green
```

So all 12 new pins are reachable, and the 42 added assertions are green under a correct implementation.
**The mutation is a proof artifact, not a proposed implementation.** It lives only in
`/private/tmp/claude-501/…/scratchpad/mfix` and nothing in this repo was edited to produce it.

Two things the proof measured that are worth handing to the implementer:

**1. The circular require is real, and it bites at exactly the point the premise predicted.** My first
mutation had the generator lazily `require('./sync-opencode-edition.js')` inside its write path. It
crashed:

```
generate-routing-surfaces.js:376  throw e;
TypeError: ed.FORGES is not iterable
```

`sync-*-edition` → `runtime-edition-forge` → `generate-routing-surfaces` is a cycle, and when the
generator is the entry point its own `module.exports` is not yet assigned when the cycle closes back on
it, so the sync module's re-exported `FORGES` is `undefined`. Routing the refresh through child processes
cleared it. Nothing in the tests requires either topology — this is evidence, not a specification.

**2. A measured hazard the implementer must not resolve alone — see below.**

## What I could NOT pin, and what must come back to me

**The editions suites themselves stop being runnable from a linked worktree once the tree root moves.**
Measured, not predicted: I built a scratch repo carrying the mutated implementation, added a real linked
worktree, and ran `test-opencode-edition.js` from the worktree:

```
D0: SKIPPED — .opencode is absent from disk …            (×3: the trees are in main now)
FAIL: D1: after sync --write, D0's presence probe must resolve a tree that exists — it resolved
      <worktree>/.opencode, which does not …
FAIL: A2[adversarial-verifier]: generated agent exists
node:fs:440                                              ← then the suite crashes outright
```

Cause: both suites read the generated tree through `path.join(REPO, rel)` with `REPO = sync.REPO` (the
invoking checkout). The self-provision `--write` two blocks below D0 would now write MAIN's tree, so
D1 and every tree-reading assertion afterwards look at a root that holds nothing. This posture is used —
the #968 run ran `test:kaola-workflow:editions` from a worktree and recorded 570/528.

I did **not** fix this, deliberately, and this is the one gap in the deliverable:

- The correct adaptation depends on the resolution semantics the implementation actually adopts, and a
  suite frozen against a guessed one is a confidently wrong oracle.
- Landing it speculatively makes both suites die at `D0` in this worktree **at the baseline** (main's
  trees are present and stale, the worktree's script checks the worktree's root), which would have
  destroyed the red evidence above and left the implementer with no signal at all while they work.

So: **the implementer must not touch `scripts/test-opencode-edition.js` or `scripts/test-kimi-edition.js`
to make this go away.** When the root resolution exists, send it back to me and I will adapt D1 and the
tree-read root in one pass. My recommended shape, for information only: discover the root *after* the
self-provision `--write` (the root that now holds the default tree), leave D0's probe on the invoking
checkout, and restate D1 against the discovered root — that formulation is correct both before and after
the change and needs no new export.

## Housekeeping

- Running either suite materializes `.opencode*` / `.kimi*` in whatever checkout it runs from (the
  self-provision; pre-existing behaviour). My runs created all six in this worktree; because other agents
  then edited `templates/routing/finalize.skeleton.md`, those trees went stale and D0 began stopping both
  suites. **I removed the six trees from the worktree**, restoring the state a fresh worktree has (they
  are gitignored, generated, and were absent before I ran anything — the premise check's `ls -a` records
  that). Expect them to reappear whenever the suites are run.
- **Main's stale trees are untouched.** Every measurement ran against the worktree or against `/tmp`
  fixtures; `.opencode-gitlab/command/` in main still carries its `2026-08-10 23:27` mtimes. Repairing
  those 12 files is the run's call, not mine.

---

# Round 2 — the D0/D1/tree-read adaptation (after impl-969 landed)

## What I changed

Same two files, no production file touched. Cumulative diff for my two files:
`2 files changed, 797 insertions(+), 30 deletions(-)` (round 1 was +685/-0, so round 2 is +112/-30).

Identical change in both suites:

- **`TREE_ROOT`** — a new module-level constant: the main checkout of the invoking checkout
  (`git rev-parse --git-common-dir` from `REPO`, resolve, drop a trailing `.git`), falling back to
  `REPO` when no git resolves. **Computed in the suite, not imported.** That is deliberate and it is
  what keeps D1 able to fail: a probe derived from the writer's own resolution agrees with it by
  construction, including when both are wrong. It also settles the export question — `sync-kimi-edition`
  exports no root and no `treePath`, so an imported answer would have needed a new production export.
  **I did not need one.**
- **`rootOf(rel)`** — one expression deciding which root a repo-relative path belongs to, keyed on the
  module's own `FORGES`/`treeLabel` axis, so a forge added later routes without a second registration.
  `read()`/`exists()` go through it.
- **`treeRootFor(forge)`** now resolves under `TREE_ROOT` — D0 skips on it and D1 asserts on it, still
  one expression, exactly as before.
- **13 direct tree-path sites moved** (7 opencode, 9 kimi — counted by replacement, `0` REPO-rooted
  tree paths remain). Everything canonical still resolves against `REPO`.
- **D0's banner gained a root suffix**, and only when the roots differ:
  `[tree root: /Users/…/Kaola-Workflow, not this checkout]`. In the ordinary main posture the string is
  empty and D0's output is byte-identical to before. This closes a new dishonesty the move would
  otherwise have created — a verdict about a tree in another checkout reading as a verdict about this one.
- **D1's message** now names both roots, so a divergence is diagnosable at the point it reds rather
  than after hundreds of ENOENTs.

Nothing was weakened. A31/A32/K13/K14 are untouched, D0's skip-when-absent branch and its distinguishable
banner are untouched, and no assertion was deleted or relaxed. The 30 deleted lines are the edited
helper/comment lines themselves.

## The four runs

| # | suite | posture | exit | result |
|---|---|---|---|---|
| 1 | opencode | linked worktree (real) | 1 | D0 verified all 3 trees in main; 56 failures, **all** in the installer bands |
| 2 | kimi | linked worktree (real) | 1 | D0 verified all 3 trees in main; 21 failures, **all** in the installer band |
| 3 | opencode | main (real) | 1 | stops at `D0[github]` — main's tree carries this branch's finalize prose, main's canonical does not |
| 4 | kimi | main (real) | 1 | same |

Runs 3 and 4, literal:

```
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - .opencode/command/kaola-workflow-finalize.md — stale — regenerate
opencode-edition test FAILED: D0[github]: .opencode is present on disk and has DRIFTED from canonical
```

That is the transient cross-branch state the lead flagged, reported exactly as designed — one file per
tree, the S2 fix. D0 exits **before** the self-provision `--write`, so neither run rewrote main's trees:
the branch's rendered prose survived both runs. Nothing to fix here, but it means runs 3 and 4 do not by
themselves demonstrate main-posture runnability, so I measured that separately.

## Controls — posture separated from the transient branch state

A full copy of this branch's checkout, `git init`-ed as its own main, plus a real linked worktree of it.
Sources and trees are self-consistent, so posture is the only variable.

```
CONTROL A  opencode, from a main checkout  → EXIT 0   opencode-edition test passed (612 assertions).
CONTROL B  kimi,     from a main checkout  → EXIT 0   kimi-edition test passed (570 assertions).
CONTROL C  opencode, from a linked worktree → EXIT 1  56 failures — every one an installer band
CONTROL D  kimi,     from a linked worktree → EXIT 1  21 failures — every one an installer band
```

A and B are exactly the lead's stated target state: 612 / 570, both green. The D0 lines there carry **no**
root suffix, confirming main-posture output is unchanged.

C and D failures by band — opencode `P1 20, G1 20, U1 5, S1b 4, S1 3, R1 2, I1 2`; kimi `P1 21`. A grep
for a failure in `D1`, `A2`, `FA*`, `A31/A32` or `K13/K14` returns **none**. So the adaptation itself is
complete: D0 probes, D1 and every tree read now resolve the root the writer uses, and the suite runs to
the end from a worktree.

## What I could not finish, and why it is not a test problem

**The two edition installers cannot deploy from a linked worktree any more.** They deploy from the tree
beside themselves — `install-opencode.sh:152` `SOURCE_TREE="$SCRIPT_DIR/.opencode$FORGE_SUFFIX"`,
`install-kimi.sh:122` the same for `.kimi` — while the sync now writes the main checkout's tree. In a
worktree there is nothing left beside the script to deploy.

Measured directly, with **no test code involved**, hermetic `HOME` and `--target` under `$TMPDIR`:

```
install-opencode.sh   from the worktree  EXIT:1
  Kaola-Workflow · opencode edition (github) — refreshing generated tree...
  Install error: no agent sources found in <worktree>/.opencode/agent
install-opencode.sh   from main          EXIT:0

install-kimi.sh       from the worktree  EXIT:0   ← and it deployed 0 skills
install-kimi.sh       from main          EXIT:0   ← 17 skills
```

The kimi half is the worse of the two: it **reports success having installed nothing**. `--check` now
passes (it reads main's tree, which is current), so the `--check || --write` line never regenerates, and
the copy out of a non-existent source dir is swallowed. A user who runs `./install-all.sh` from a
worktree gets a loud failure on one edition and a silent empty install on the other.

This is production work in two shell scripts, so I stopped rather than touch it. **I did not add a test
for it, because the failing oracle already exists** — the 77 installer-band failures in controls C and D
are exactly that pin, already red, already naming the cause in their own text. Weakening them to make the
worktree posture green would have deleted the only thing reporting the defect.

So: both suites are runnable from main today (A, B green) and will be runnable from a linked worktree the
moment the two installers resolve their source tree the same way the sync does.

---

# Round 3 — R1: the tree must never land in a directory git owns

## What I changed

Same two test files. Cumulative for my two files: `2 files changed, 1052 insertions(+), 30 deletions(-)`.
Round 3 adds ~255 lines.

- **New band `A33` / `K15`**, inserted after A31/K13's non-git leg, sharing that block's fixture and
  helpers. Two legs, both real fixtures:
  - **bare repository + linked worktree** — `git clone --bare` of the A31/K13 fixture, then
    `git worktree add --detach`. A bare repo has no working tree, so the worktree is the only
    checkout in play.
  - **submodule** — a superproject with one commit, then `git submodule add` of the same fixture. Its
    `.git` is a file pointing into `<super>/.git/modules/sub`, which is the posture that produces the
    `.git/modules/...` coordination dir.
  - The shared `git` helper gained `-c protocol.file.allow=always`; without it modern git refuses the
    file:// submodule clone and a fixture failure would wear a finding's name.
- **Four assertions per leg, all about WHERE the tree ends up, none about how the answer is computed:**
  the write succeeds; the tree is **not** under the directory git names as its own storage (asked for
  per posture via `rev-parse --git-common-dir`, never assumed); the tree **is** beside the script; and
  no segment of the landing path is `.git`. Plus `--check` agreeing with `--write` — green on arrival,
  there to stop a fix that moves only the writer.
- **The suites' own `TREE_ROOT` else-branch** now falls back to `REPO` when the coordination directory
  is not a checkout's `.git`. Without this the probe would keep asserting the pre-fix location and D1
  would false-red in exactly these two postures once the fix lands. The band asserts the outcome on
  disk; this is the same statement, for the probe.

Nothing weakened. A31/A32/K13/K14 untouched; D0's skip-when-absent branch and banner untouched; no
assertion deleted or relaxed. Chain guards still green — `test-spawn-classification.js` exit 0
(227 classified; no new spawn *site*, the band reuses the existing annotated `git` helper) and
`test-suite-registration.js` exit 0.

## Where the tree currently lands, measured

| posture | coordination dir | tree lands at | beside the script? |
|---|---|---|---|
| bare + worktree | `<fx>/bare.git` | `<fx>/bare.git/.opencode`, `…/.kimi` | **no** |
| submodule | `<fx>/super/.git/modules/sub` | `<fx>/super/.git/modules/sub/.opencode`, `…/.kimi` | **no** |

Both writes exit 0 and produce full trees — nothing fails, nothing is lost. The defect is the location.

## RED against the shipped bytes

Five failures per suite, and **only** A33/K15. Literal (paths abbreviated):

```
FAIL: A33[bare]: the generated tree is NOT written inside the directory git uses for its own
  storage. It is at <fx>/bare.git/.opencode. That directory belongs to git, which may rewrite or
  repack around it, and nobody looking for a generated tree looks there
FAIL: A33[bare]: ...it is beside the script instead, at <fx>/bare-wt/.opencode. …It landed at
  <fx>/bare.git/.opencode
FAIL: A33[submodule]: the generated tree is NOT written inside the directory git uses for its own
  storage. It is at <fx>/super/.git/modules/sub/.opencode
FAIL: A33[submodule]: ...it is beside the script instead, at <fx>/super/sub/.opencode …
FAIL: A33[submodule]: ...and no segment of the tree's path is `.git` — it landed at
  <fx>/super/.git/modules/sub/.opencode
```

`K15` is the same five against `.kimi`. Note the asymmetry, which is why both forms are asserted: the
`.git`-segment assertion **passes** in the bare posture (`bare.git` is not `.git`) and reds only in the
submodule one — the coordination-directory assertion is what catches both.

Run four ways, on a fixture rebuilt fresh from the current branch checkout (per the process note, I did
not reuse any shared fixture directory), plus once from the real worktree:

```
main posture      opencode EXIT 1  626 passed, 5 failed (all A33)
main posture      kimi     EXIT 1  584 passed, 5 failed (all K15)
worktree posture  opencode EXIT 1  626 passed, 5 failed (all A33)
worktree posture  kimi     EXIT 1  584 passed, 5 failed (all K15)
real worktree     opencode EXIT 1  626 passed, 5 failed (all A33)
```

Assertion counts: opencode 612 → **631**, kimi 570 → **589**; +19 each.

**The four already-pinned postures did not move.** In every run above, the only band failing is the new
one — the linked-worktree-writes-MAIN's-tree pin, the plain-clone leg, the unpacked-no-git leg and the
canonical-reads pin are all green, as are the installer bands, which the implementer's `SOURCE_TREE`
fix (`install-opencode.sh:159`, `install-kimi.sh:129` — now `$TREE_ROOT/…`) resolved.

## Satisfiability, and the no-bad-trade check

The reviewer's sized shape, applied **to a throwaway `/tmp` mirror only** — the two sync scripts'
`TREE_ROOT` line replaced with an inline `rev-parse --git-common-dir` whose result is used only when
its basename is `.git`, and `REPO` otherwise:

```
MUTATED, main posture       opencode EXIT 0  631 assertions   kimi EXIT 0  589 assertions
MUTATED, linked worktree    opencode EXIT 0  631 assertions   kimi EXIT 0  589 assertions
```

All four green. So the new pins are satisfiable, and the fix does **not** cost the linked-worktree
posture this bundle was bought for — the trade the lead asked me to catch would have shown up as a red
in the worktree column, and it does not. The mutation is a proof artifact, not a proposed
implementation; nothing in the repo was edited to produce it, and I did not touch `resolveMainRoot`,
whose other three consumers are outside this issue's scope and are the implementer's call to consider.

## Note for whoever runs the suites next

Both suites currently stop at `D0[github]` when run from the **real** main or worktree, on one file per
tree (`…/kaola-workflow-finalize`): main's trees are mid-regenerate against a canonical that is still
moving. That is D0 reporting drift exactly as designed, and it exits before its own `--write`, so no
tree was rewritten by any run of mine. It is why the round-3 evidence above comes from a rebuilt
fixture rather than the live checkouts. I did not regenerate main's trees — that is the run's call.
