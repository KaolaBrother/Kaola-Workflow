# Impl — #969 (edition tree root + the mandated regenerate step)

Baseline: `7e962bdc86d188e1da99af3309a13ae0dd3d9e97`
Worked in: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972`
(branch `workflow/bundle-969-970-971-972`)

**Verification tier: `tests-green`.**

## Files changed

Three production files. No test file touched. No `package.json`, no chain script, no edition step in
any chain.

- `scripts/sync-opencode-edition.js` — +73/−10
- `scripts/sync-kimi-edition.js` — +74/−16
- `scripts/generate-routing-surfaces.js` — +29/−0

```
$ git diff --stat -- scripts/sync-opencode-edition.js scripts/sync-kimi-edition.js scripts/generate-routing-surfaces.js
 scripts/generate-routing-surfaces.js | 29 ++++++++++++
 scripts/sync-kimi-edition.js         | 90 +++++++++++++++++++++++++++++-------
 scripts/sync-opencode-edition.js     | 83 +++++++++++++++++++++++++++++----
 3 files changed, 176 insertions(+), 26 deletions(-)

$ git diff package.json
(no output)
$ echo $?
0
```

`git diff --stat` over the whole worktree also shows `install-all.sh`, `simulate-workflow-walkthrough.js`,
`test-install-all.js`, `test-gap-sweep.js`, the claim/gap-sweep scripts and the finalize surfaces
modified — those are the other implementers' and the lead's work in this shared worktree, not mine.

## THE ROOT-RESOLUTION RULE, and why

**Canonical sources resolve to the INVOKING checkout. The generated edition tree resolves to the MAIN
checkout. Where there is no main checkout to resolve, the tree belongs where the script itself lives —
never the process cwd.**

Concretely: `REPO` (`path.resolve(__dirname, '..')`) keeps every canonical read — `agents/`, `hooks/`,
`commands/`, `plugins/*/`, `templates/opencode/plugins/`, the tracked `opencode.json`. A new
`TREE_ROOT` = `resolveMainRoot(REPO)` (the settled idiom at
`scripts/kaola-workflow-adaptive-schema.js:520`, built on `git rev-parse --git-common-dir`) owns every
path inside `.opencode*` / `.kimi*`, in **both** `--write` and `--check`.

Why the split, and not both halves moving:

- The **sources** are the thing a run edits on its branch. Resolving them to main would make a sync
  from a worktree re-render main from main's own unchanged sources — a no-op wearing a regenerate's
  name, and the run's edits would never reach any tree. A31/K13's two-marker discriminator exists
  precisely to red that shape, and it does.
- The **tree** is gitignored and derived, so a machine holds exactly one of it, and that one belongs
  to main. A tree written inside a linked worktree dies with the worktree — which is the observed
  failure verbatim: #968 synced all six trees, recorded "all six trees reported in parity", the
  worktree was deleted, and main kept 12 files telling readers to pass `--target-issue` where
  canonical already said `--target-issues`.

**The two costs, accepted and stated rather than hidden:** main's trees can carry prose that has not
merged yet, and two worktrees syncing at once leave the later render standing. Both are bounded by the
trees being derived — any `--write`, and either installer's check-or-write, restores them from
whatever canonical says at that moment. Neither is free. (The first cost was observed live during this
task — see *Live observation* below.)

The fallback matters as much as the rule: `resolveMainRoot` fails open, so an unpacked source tree that
is no git checkout at all (how the installers run) puts the tree where the script lives. A31/K13's
non-git leg pins that, and it passes.

The rule is written into both scripts as a comment stating the RESULT — where the tree lands, where the
sources come from, what it costs — with no claim about how the root is computed
(`scripts/sync-opencode-edition.js:54-74`, `scripts/sync-kimi-edition.js:52-72`).

## The regenerate step (result b)

`generate-routing-surfaces.js --write` — the step the skeleton rule already mandates — now also brings
every edition tree that **already exists** back into parity, and creates none. `--check` is untouched:
it runs in all four chains, and a check that read an edition tree would put the editions inside
`npm test`.

Each sync script gained one CLI mode, `--refresh-present`: iterate the forge axis, skip any tree whose
root is absent, regenerate the rest. Absence is not reported — a tree that does not exist carries no
stale prose. When nothing is present the step prints nothing about editions at all, so a consumer
checkout that installed no edition sees and gains nothing. `opencode.json` is deliberately left alone:
it is a tracked file the user is invited to hand-edit, not part of the generated tree.

### How the circular require was avoided

`sync-*-edition.js` → `runtime-edition-forge.js` → `generate-routing-surfaces.js` is a real cycle, and
`runtime-edition-forge.js:42` reads `routing.FORGES` at module top level while
`generate-routing-surfaces.js` assigns `module.exports = {...}` at the bottom — so with the generator as
entry point the captured reference is permanently the empty pre-assignment object. That is the measured
`TypeError: ed.FORGES is not iterable`.

So the generator does not require either sync module. It spawns them: `spawnSync(process.execPath,
[path.join(__dirname, script), '--refresh-present'])`, one child per edition, `child_process` required
inline inside the function. A missing sync script is skipped (a checkout that does not carry the edition
generators); a child that exits non-zero is reported and makes `--write` exit 1.

Nothing was added to `scripts/kaola-workflow-adaptive-schema.js` — it has zero top-level requires, so
requiring it from the sync scripts closes no cycle.

## Success criteria — literal output

The editions suites cannot run from a linked worktree once the tree root moves (the known consequence
below), so the post-change runs were made against a **/tmp mirror of the worktree** — a plain copy, no
`.git`, so main resolves to the mirror root. This is the same posture the test author used for their
satisfiability proof.

### 1. `node scripts/test-kimi-edition.js` — the clean signal

Baseline, run in the worktree at `7e962bdc` before any change:

```
kimi-edition test FAILED: 6 failure(s), 564 passed. [drift-check: NO tree verified; 3 ABSENT, not checked (.kimi, .kimi-gitlab, .kimi-gitea)]
EXIT:1
```

After, on the mirror:

```
kimi-edition test passed (570 assertions). [drift-check: NO tree verified; 3 ABSENT, not checked (.kimi, .kimi-gitlab, .kimi-gitea)]
EXIT:0
```

**0 failures from K13/K14.** 570 assertions matches the test author's proof exactly.

### 2. `node scripts/test-opencode-edition.js` — 6 mine, 1 not

Baseline, in the worktree:

```
FAIL: S2 (#927): .opencode/command/kaola-workflow-finalize.md:240: mechanism word "variant" ...
FAIL: A31: a sync run from a linked worktree writes the MAIN checkout's edition tree. ...
FAIL: A31: ...and renders it from the INVOKING checkout's canonical sources. ...
FAIL: A31: ...and leaves no throwaway tree in the worktree. ...
FAIL: A32: after the regenerate step, the PRESENT tree .opencode is current — --check exited 1 ...
FAIL: A32: after the regenerate step, the PRESENT tree .opencode-gitlab is current — --check exited 1 ...
FAIL: A32: ...and the tree carries the edited prose itself, not merely a passing exit code ...

opencode-edition test FAILED: 7 failure(s), 606 passed.
EXIT:1
```

After, on the mirror (taken before the lead's S2 fix landed):

```
FAIL: S2 (#927): .opencode/command/kaola-workflow-finalize.md:240: mechanism word "variant" in generated opencode prose ...

opencode-edition test FAILED: 1 failure(s), 612 passed.
EXIT:1
```

**All 6 of my reds green; the 1 remaining is the pre-existing S2 (#927), which is not mine.**
612 matches the test author's proof exactly.

A second mirror taken after the lead's S2 fix landed in the worktree:

```
opencode-edition test passed (612 assertions).
EXIT:0
kimi-edition test passed (570 assertions).
EXIT:0
```

Both editions suites fully green.

### 3. `node scripts/generate-routing-surfaces.js --check`

```
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
GEN-CHECK EXIT:0
```

**18 surfaces.**

### 4. `node scripts/validate-script-sync.js`

```
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
SCRIPT-SYNC EXIT:0
```

### 5. Nothing added to package.json, no chain script, no edition step in any chain

`git diff package.json` is empty (above). `kaola-workflow-run-chains.js` untouched.
`generate-routing-surfaces.js --check` is byte-unchanged in behaviour and A32/K14's "the chains gain no
edition coverage" pins pass: a stale edition tree does not move its exit code, and it does not repair
what it saw.

### Guards beyond the criteria

Chain-resident suites that consume the three changed modules, run in the worktree:

```
test-generate-routing-surfaces.js: EXIT:0   test-generate-routing-surfaces: all 434 assertions passed.
test-route-reachability.js:        EXIT:0   Route-reachability test passed (331 assertions).
test-spawn-classification.js:      EXIT:0   657 spawn sites across 65 files, 225 classified, 432 grandfathered
validate-workflow-contracts.js:    EXIT:0   Workflow contract validation passed
simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity: EXIT:0   PASSED (12 surfaces)
```

(The new `spawnSync` is in `generate-routing-surfaces.js`, not a suite file, so it is outside the spawn
guard's coverage and needs no annotation.)

### End-to-end: the observed failure, closed

A disposable fixture — real `git init` + `git worktree add`, all six trees materialized in main — with
a marker appended to the **worktree's** `templates/routing/next.skeleton.md`, then **only** the mandated
regenerate step run from the worktree:

```
$ node <fx>/wt/scripts/generate-routing-surfaces.js --write
generate-routing-surfaces --write: rendered 18 surfaces.
generated  .opencode/command/workflow-next.md
generated  .opencode-gitlab/command/workflow-next.md
generated  .opencode-gitea/command/workflow-next.md
sync-opencode-edition: refreshed 3 present tree(s): .opencode, .opencode-gitlab, .opencode-gitea.
generated  .kimi/skills/workflow-next/SKILL.md
generated  .kimi-gitlab/skills/workflow-next/SKILL.md
generated  .kimi-gitea/skills/workflow-next/SKILL.md
sync-kimi-edition: refreshed 3 present tree(s): .kimi, .kimi-gitlab, .kimi-gitea.
EXIT:0

  MARKER PRESENT  main/.opencode/command/workflow-next.md
  MARKER PRESENT  main/.opencode-gitlab/command/workflow-next.md
  MARKER PRESENT  main/.opencode-gitea/command/workflow-next.md
  MARKER PRESENT  main/.kimi/skills/workflow-next/SKILL.md
  MARKER PRESENT  main/.kimi-gitlab/skills/workflow-next/SKILL.md
  MARKER PRESENT  main/.kimi-gitea/skills/workflow-next/SKILL.md

throwaway trees left in the worktree: (none)
```

And the fresh-clone posture, same fixture with every tree removed:

```
$ node <fresh>/scripts/generate-routing-surfaces.js --write
generate-routing-surfaces --write: rendered 18 surfaces.
EXIT:0
any edition tree created? (none)
```

## The D1/worktree consequence — HIT, reproduced, NOT silenced

Reproduced exactly as the test author predicted, in the disposable worktree fixture:

```
$ node <fx>/wt/scripts/test-opencode-edition.js
D0: SKIPPED — .opencode is absent from disk ...  (×3)
FAIL: D1: after sync --write, D0's presence probe must resolve a tree that exists — it resolved
      <fx>/wt/.opencode, which does not, so D0 skipped every forge and checked nothing
FAIL: A2[adversarial-verifier]: generated agent exists
node:fs:440
Error: ENOENT: no such file or directory, open '<fx>/wt/.opencode/agent/adversarial-verifier.md'
EXIT:1
```

Both editions suites read the tree through `path.join(sync.REPO, rel)`, which is now the wrong root
under a linked worktree. **I changed neither test file.** This routes back to the test author, whose
recommended shape (discover the root after the self-provision `--write`, leave D0's probe on the
invoking checkout, restate D1 against the discovered root) needs no new export and I added none.

## A consequence outside the tests: the edition installers, run from a linked worktree

Not predicted in the brief; measured, not argued. `install-opencode.sh:152` and `install-kimi.sh:122`
compute `SOURCE_TREE="$SCRIPT_DIR/.<edition><suffix>"` from their own script dir, then run
`sync --check || sync --write` and deploy from that path. With the tree root on main, a run from a
linked worktree refreshes main's tree and then finds nothing to deploy:

```
CONTROL — installer run from MAIN:            EXIT:0
SUBJECT — installer run from the WORKTREE:    EXIT:1
  Kaola-Workflow · opencode edition (github) — refreshing generated tree...
  Deploying into project (github) → <dest>
  Install error: no agent sources found in <fx>/wt/.opencode/agent
```

Scope of the exposure: no run surface, chain, command, skill or script invokes either edition
installer — `git grep` over `scripts/ templates/ commands/ plugins/ hooks/ agents/` returns only three
prose comments. The only callers are a human and `install-all.sh`, which is itself human-run, and the
documented reinstall posture is main. Before the change a worktree install silently deployed a throwaway
tree; now it fails loudly with the path named.

**I did not fix it**, deliberately: it needs a way for the installers to learn the tree root (a
`--print-tree-root` mode on both sync scripts plus one line in each installer is the smallest shape),
that is new CLI surface no test pins, and installer behaviour is exactly the kind of thing that should
get a test author before an implementer. Routing it back rather than deciding it here.

## Live observation — the accepted cost, seen within minutes

At `2026-08-13 00:53:18`, while this task was in progress, **all six of main's edition trees were
rewritten** — not by me. Another agent in this shared worktree edited
`templates/routing/finalize.skeleton.md` (the S2 `variant` → `form` fix) and ran the mandated regenerate
step; with this change live, that refreshed main's trees from the worktree's uncommitted sources.

Measured after the fact:

- main's six trees are in exact parity with the **worktree's** current sources (all six `--check` from
  the worktree exit 0);
- main's own pre-change scripts, checking main's trees against **main's** sources, now exit 1 for all
  three forges;
- the 12 stale files the premise check measured are incidentally repaired — `--target-issue "` now
  occurs 0 times in `.opencode-gitlab/command/workflow-next.md`, `--target-issues` twice.

This is the designed behaviour and the first of the two costs named above, arriving the same hour as the
mechanism. Worth the lead knowing: **main's six trees no longer sit at their pre-run state**, and they
will keep tracking the branch until it merges. Every write was another agent's regenerate; I ran no
`--write` from the worktree and left no edition tree in it (`find -maxdepth 1` for `.opencode*`/`.kimi*`
returns nothing).

## Not touched, as instructed

- `CHANGELOG.md` — centrally owned by the lead for this bundle.
- `scripts/test-opencode-edition.js`, `scripts/test-kimi-edition.js` — test custody.
- `CLAUDE.md:181` and its restatements at `docs/api.md:1489`, `docs/architecture.md:296`,
  `docs/audits/opencode-edition-audit.md:428`, `docs/decisions/D-530-02.md` — the ruling keeps that
  rule and this change honours it: editions stay absent from `npm test`, `edition-sync.js` and
  `install.sh`. **None of them needs a change.**

### Docs prose that is now incomplete (named, not edited)

- `docs/conventions.md:141` — "edit the skeleton, a slot, or the rename table, then run
  `node scripts/generate-routing-surfaces.js --write`" and the sentence enumerating what `--write`
  renders ("18 surfaces"). Still true, but the step now also refreshes present edition trees, which the
  paragraph does not say.
- `docs/api.md` / `docs/architecture.md` wherever the sync CLI surface is enumerated: both scripts gained
  `--refresh-present`, and the tree root is no longer "the repo the script lives in" under a worktree.
  I did not audit those files line by line — flagging the class.

---

# Addendum — review finding R1 (low): the tree must never land in a directory git owns

Same three files, no new one. Cumulative diff after this round:

```
$ git diff --numstat -- scripts/sync-opencode-edition.js scripts/sync-kimi-edition.js scripts/generate-routing-surfaces.js
29	0	scripts/generate-routing-surfaces.js
87	16	scripts/sync-kimi-edition.js
86	10	scripts/sync-opencode-edition.js
```

The only change in this round is the `TREE_ROOT` block in the two sync scripts
(`scripts/sync-opencode-edition.js:78`, `scripts/sync-kimi-edition.js:76`) and the comment above it.
`scripts/kaola-workflow-adaptive-schema.js` is untouched (`git status --porcelain` on it is empty), as
ruled.

## The defect, and what the fix says

`resolveMainRoot` answers "the main checkout" by taking the coordination directory's parent when its
basename is `.git`, and **the coordination directory itself otherwise**. That last branch is right for
"a coordination directory that is already a main root" and wrong for the two postures where the
coordination directory is not a checkout at all:

| posture | `rev-parse --git-common-dir` | tree landed at (before) |
|---|---|---|
| bare repo + linked worktree | `<fx>/bare.git` | `<fx>/bare.git/.opencode`, `/.kimi` |
| submodule | `<super>/.git/modules/sub` | `<super>/.git/modules/sub/.opencode`, `/.kimi` |

Both wrote full trees and exited 0 — nothing was lost, the defect is purely the location. But it is
git's own storage, which git may rewrite around, nobody looks there, and it contradicts the rule the
shipped comment states.

The added rule, local to the two `TREE_ROOT` lines: **only a coordination directory that IS a `.git`
names a checkout that can own the tree; anything else means there is no main checkout, and the tree
belongs beside the script.**

```js
const TREE_ROOT = (() => {
  const schema = require('./kaola-workflow-adaptive-schema.js');
  const coord = schema.getCoordRoot(REPO);
  return path.basename(coord) === '.git' ? schema.mainRootFromCoord(coord) : REPO;
})();
```

Both shared helpers are still the ones answering "where is git's storage" and "which checkout owns this
`.git`" — the only thing added here is the guard between them. The non-git posture is unchanged by
construction: `getCoordRoot` fails open to `path.join(REPO, '.git')`, whose basename *is* `.git`, so it
still resolves to `REPO`.

I did not need to change `resolveMainRoot` and did not want to: the guard is about what an *edition
tree* may sit inside, which is not a claim the three other consumers of that helper have made.

## Mutation proof — the band is armed, and this fix is what disarms it

A scratch mirror of the fixture with **only** the `TREE_ROOT` block reverted to
`resolveMainRoot(REPO)`, everything else byte-identical:

```
$ node <fx3>/scripts/test-opencode-edition.js
FAIL: A33[bare]: the generated tree is NOT written inside the directory git uses for its own storage. It is at .../bare.git/.opencode
FAIL: A33[bare]: ...it is beside the script instead, at .../bare-wt/.opencode ...
FAIL: A33[submodule]: the generated tree is NOT written inside the directory git uses for its own storage. It is at .../super/.git/modules/sub/.opencode
FAIL: A33[submodule]: ...it is beside the script instead, at .../super/sub/.opencode ...
FAIL: A33[submodule]: ...and no segment of the tree's path is `.git` — it landed at .../super/.git/modules/sub/.opencode
opencode-edition test FAILED: 5 failure(s), 626 passed.
EXIT:1

$ node <fx3>/scripts/test-kimi-edition.js
FAIL: K15[bare]: the generated tree is NOT written inside the directory git uses for its own storage. ...
FAIL: K15[bare]: ...it is beside the script instead, ...
FAIL: K15[submodule]: the generated tree is NOT written inside the directory git uses for its own storage. ...
FAIL: K15[submodule]: ...it is beside the script instead, ...
FAIL: K15[submodule]: ...and no segment of the tree's path is `.git` — ...
kimi-edition test FAILED: 5 failure(s), 584 passed.
EXIT:1
```

5 failures per suite, all in A33/K15, nothing else moved. And the subtlety the lead flagged is visible
in the output: the `.git`-segment assertion appears **only under `[submodule]`** — in the bare posture
`bare.git` is not `.git`, so that assertion passes over a tree sitting in git's storage. The
coordination-directory assertion is the one that catches both, and it is the one this fix satisfies.

## Success criteria — literal output, real exit codes

Fixture built fresh from the branch checkout (copy, `git init`, commit, `git worktree add`), not the
live checkouts — main's real trees are mid-regenerate against a canonical still moving in this bundle,
so D0 stops there for reasons that are not this change.

```
########## POSTURE 1: MAIN ##########
$ node <fx2>/main/scripts/test-opencode-edition.js
opencode-edition test passed (631 assertions). [drift-check: NO tree verified; 3 ABSENT, not checked (.opencode, .opencode-gitlab, .opencode-gitea)]
EXIT:0
$ node <fx2>/main/scripts/test-kimi-edition.js
kimi-edition test passed (589 assertions). [drift-check: NO tree verified; 3 ABSENT, not checked (.kimi, .kimi-gitlab, .kimi-gitea)]
EXIT:0

########## POSTURE 2: LINKED WORKTREE ##########
$ node <fx2>/wt/scripts/test-opencode-edition.js
D0: .opencode-gitea is present and in parity with canonical. [tree root: <fx2>/main, not this checkout]
opencode-edition test passed (631 assertions). [drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)] [tree root: <fx2>/main, not this checkout]
EXIT:0
$ node <fx2>/wt/scripts/test-kimi-edition.js
D0: .kimi-gitea is present and in parity with canonical. [tree root: <fx2>/main, not this checkout]
kimi-edition test passed (589 assertions). [drift-check: 3 tree(s) in parity (.kimi, .kimi-gitlab, .kimi-gitea)] [tree root: <fx2>/main, not this checkout]
EXIT:0

no throwaway tree left in the fixture worktree: (none)
```

**631 and 589 in both postures**, the counts the lead named.

```
$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
GEN-CHECK EXIT:0

$ node scripts/validate-script-sync.js
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
SCRIPT-SYNC EXIT:0
```

`generate-routing-surfaces --write` was **not** run against this repo or its worktree.

## The four working postures, not regressed

All four are pinned inside the same two suites, and both suites are green at full count in both
postures above:

- linked worktree writes MAIN's tree — A31/K13, plus posture 2's own `[tree root: <fx2>/main, not this
  checkout]` banner;
- plain clone — posture 1;
- unpacked no-git tree beside the script — A31/K13's non-git leg, unchanged by construction (the
  fail-open coordination dir is `<REPO>/.git`, whose basename is `.git`);
- canonical reads never move — A31/K13's two-marker discriminator.

Independently confirmed from the real worktree: `OUT_AGENT_DIR` still resolves to
`/Users/ylpromax5/Workspace/Kaola-Workflow/.opencode/agent`, i.e. main's tree.

## Also confirmed

The D1 false-red the lead pre-empted does not occur: posture 2 runs clean and the drift-check reports
three trees verified at main's root rather than skipping them. `scripts/test-opencode-edition.js` and
`scripts/test-kimi-edition.js` were read and run, never edited.
