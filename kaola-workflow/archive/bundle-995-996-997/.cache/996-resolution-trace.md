# Investigation: #996 — where `generate-routing-surfaces --write` resolves the edition-tree root

## Setup

- Main checkout: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow` @ `8deb8eae` (branch `main`)
- Linked worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-995-996-997`
  @ `8deb8eae` (branch `workflow/bundle-995-996-997`)
- Both roots confirmed by `git worktree list`; worktree was CLEAN and `--check`-green before the
  first reproduction leg.
- Platform: darwin 25.6.0, node via `process.execPath`.

---

## THE HEADLINE, FIRST

**The behaviour #996 reports is not an untraced accident. It is a deliberate, commented, tested fix
that landed 4 days ago as issue #969.** The filer's guess about the mechanism was right; what the
filer could not see from the observable effect is that the effect is the *designed* one, that it
closes a worse observed failure, and that it is pinned by a purpose-built test band (`A31`).

- Provenance: commit `9b6fac01` — *"fix: close the whole open backlog — edition tree root,
  mission-list report, gap-sweep root, codex convergence"*, `Refs #969, #970, #971, #972`,
  Thu Aug 13 2026. `git log -S` confirms this ONE commit introduced all three of `TREE_ROOT` in
  `sync-opencode-edition.js`, `refreshPresentEditionTrees` in `generate-routing-surfaces.js`, and
  the `A31` test band.
- The commit body states the intent verbatim: *"#969 — a sync from a linked worktree now writes the
  MAIN checkout's edition trees. Canonical sources resolve to the invoking checkout; the generated
  tree resolves to main; where no main checkout resolves — an unpacked tarball, the consumer posture
  — the tree belongs beside the script."*

So #996 is, mechanically, **a request to revert #969**. That reframing is the most important output
of this trace, and the shape call belongs to the orchestrator, not here.

---

## FINDING F1 (MEASURED) — THE DEFECT IS DELTA-GATED. A no-op regen is genuinely inert.

**This changes #996's reproduction conditions and is the single most load-bearing correction in this
trace.**

`generate-routing-surfaces.js --write` run from a linked worktree does **not** mutate main's edition
trees as a matter of course. Every edition-tree writer content-compares before writing:

`scripts/sync-opencode-edition.js:652` (agents) — and identically at `:669` (commands), `:696`
(hooks), `:714` (plugins):

```js
if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) {
  fs.writeFileSync(dest, out);
```

Measured on a clean, in-parity tree (worktree at `8deb8eae`, `--check` green, nothing uncommitted):

| Measurement | Method | Result |
|---|---|---|
| content change across all six main trees | `shasum -a 256` over 3553 files, before vs after | **0 files changed** |
| mtime change across all six main trees | `stat -f '%m %N'` over the same set, before vs after | **0 files touched** |

…while the command still reported, verbatim:

```
generate-routing-surfaces --write: rendered 18 surfaces.
sync-opencode-edition: refreshed 3 present tree(s): .opencode, .opencode-gitlab, .opencode-gitea.
sync-kimi-edition: refreshed 3 present tree(s): .kimi, .kimi-gitlab, .kimi-gitea.
```

**That "refreshed 3 present tree(s)" line is printed unconditionally**
(`sync-opencode-edition.js:818-821`, `sync-kimi-edition.js:785-788`) and carries **no information
about whether anything was written.** It is almost certainly what the filer read as "all six trees
changed".

### The precise claim, replacing #996's generalization

> #996 says: *"`generate-routing-surfaces --write` run from a linked worktree mutates the MAIN
> checkout's gitignored edition trees."*
>
> **Measured, the true statement is narrower and strictly more useful:** a worktree `--write`
> mutates main's edition trees **only when the worktree's canonical sources differ from what main's
> trees already hold** — i.e. only when there is a real content delta.

Why this *sharpens* rather than weakens the issue: a delta is present exactly when a worktree run is
doing real work on a prose surface. The inert case is the idle case; the firing case is the working
case. So the defect's exposure is not "any regen" but "every regen that had something to say" —
which is the population that matters. It also means the defect cannot be reproduced at all on a
clean tree, which is a trap for anyone trying to confirm the issue.

Two corollaries, both measured:

- **The presence probe also resolves against main.** `sync-opencode-edition.js:810`
  (`if (!fs.existsSync(outDirs(forge).root)) continue;`) reported all three trees "present" while
  running from the worktree — and **the worktree holds none of the six** (measured: all six ABSENT
  under the worktree root). A run from a worktree therefore refreshes trees that exist nowhere in
  its own checkout.
- **The prune crosses the boundary too**, not just the write — see F2 leg 2.

---

## FINDING F2 (MEASURED) — this reproduction is stronger than the filer's, and here is why

The filer constructed the effect. This run **observed it live, with a real payload from a different
agent's work-in-progress**, and can show main's deployed-from trees carrying prose that exists in no
tracked file of that checkout.

Sequence, as it actually happened:

1. Leg 1 (clean tree) → **0 files changed** (F1).
2. Between legs, another agent in this session edited `templates/routing/finalize.skeleton.md` in the
   worktree — uncommitted, unmerged, unreviewed, +3/−1 (the "priority tier" sentence).
3. Leg 2 (`--write` from the worktree) → that uncommitted sentence was rendered into **all six of
   main's edition trees**.

Measured by grepping the new sentence `sorts \*\*last\*\* on the open list`:

| tracked? | hits | file |
|---|---|---|
| TRACKED | 0 | `commands/kaola-workflow-finalize.md` |
| TRACKED | 0 | `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` |
| gitignored | **1** | `.opencode/command/kaola-workflow-finalize.md` |
| gitignored | **1** | `.opencode-gitlab/command/kaola-workflow-finalize.md` |
| gitignored | **1** | `.opencode-gitea/command/kaola-workflow-finalize.md` |
| gitignored | **1** | `.kimi/skills/kaola-workflow-finalize/SKILL.md` |
| gitignored | **1** | `.kimi-gitlab/skills/kaola-workflow-finalize/SKILL.md` |
| gitignored | **1** | `.kimi-gitea/skills/kaola-workflow-finalize/SKILL.md` |

**Main's six deployed-from trees carry a sentence that appears in zero tracked files of main.**
That is #996's core harm, observed rather than constructed. `git check-ignore -v` confirms the
mechanism of the silence: `.gitignore:5 .opencode/` and `.gitignore:10 .kimi-*/`.

It is a better reproduction on three counts: the payload is real (not a planted marker), the writer
was a different agent (so the cross-checkout leak is genuinely unintended by anyone), and the
resulting state is one a human running `opencode` or `kimi` against this repo would actually read.

---

## 1. The resolution path (MEASURED — read + executed)

### 1a. The generator itself resolves from `__dirname`, not cwd

`scripts/generate-routing-surfaces.js:58`

```js
const REPO = path.resolve(__dirname, '..');
```

Every tracked surface is written at `path.join(REPO, row.path)` — `cmdWrite` at
`scripts/generate-routing-surfaces.js:373-381`, read back the same way in `cmdCheck` at `:321-343`.
`process.cwd()` appears NOWHERE in this file (grepped). So invoking
`node scripts/generate-routing-surfaces.js` from the worktree runs the WORKTREE's copy of the
script, `__dirname` is the worktree's `scripts/`, and all 18 tracked surfaces land in the WORKTREE.

### 1b. The generator hands the edition trees to two child processes

`scripts/generate-routing-surfaces.js:358-371` — `refreshPresentEditionTrees()`:

```js
for (const script of ['sync-opencode-edition.js', 'sync-kimi-edition.js']) {
  const abs = path.join(__dirname, script);
  if (!fs.existsSync(abs)) continue;
  const r = spawnSync(process.execPath, [abs, '--refresh-present'], { cwd: REPO, stdio: 'inherit' });
```

Called from `cmdWrite` at `:380`, i.e. **`--write` only** — never `--check`. Note `cwd: REPO` is set
but is inert: neither child reads cwd.

### 1c. The seam is `TREE_ROOT` in the two sync scripts — and it IS the git common directory

`scripts/sync-opencode-edition.js:78-82` (byte-equivalent at `scripts/sync-kimi-edition.js:76-80`):

```js
const TREE_ROOT = (() => {
  const schema = require('./kaola-workflow-adaptive-schema.js');
  const coord = schema.getCoordRoot(REPO);
  return path.basename(coord) === '.git' ? schema.mainRootFromCoord(coord) : REPO;
})();
```

`scripts/kaola-workflow-adaptive-schema.js:515-530` — `getCoordRoot`:

```js
const raw = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: r, ... }).trim();
return path.resolve(r, raw);
```

`scripts/kaola-workflow-adaptive-schema.js:536-539` — `mainRootFromCoord` returns `path.dirname` of
a coord dir whose basename is `.git`.

**VERDICT ON THE FILER'S GUESS: CONFIRMED, exactly.** It is `git rev-parse --git-common-dir`,
resolved against `REPO` (which is `__dirname/..`, NOT cwd), then `dirname`'d — and only when the
coord dir's basename is literally `.git`. Not `--show-toplevel`, not `process.cwd()`, not `$HOME`.

Measured probes:

| Measurement | Command | Result | Exit |
|---|---|---|---|
| tree root from main | `node scripts/sync-opencode-edition.js --print-tree-root` (cwd=main) | `/Volumes/.../kaola-workflow` | 0 |
| tree root from main (kimi) | `node scripts/sync-kimi-edition.js --print-tree-root` (cwd=main) | `/Volumes/.../kaola-workflow` | 0 |
| tree root from worktree | same script, cwd=worktree, worktree's own copy | `/Volumes/.../kaola-workflow` **(MAIN)** | 0 |
| tree root from worktree (kimi) | same | `/Volumes/.../kaola-workflow` **(MAIN)** | 0 |
| `git rev-parse --git-common-dir` in worktree | — | `/Volumes/.../kaola-workflow/.git` | 0 |
| `git rev-parse --show-toplevel` in worktree | — | `/Volumes/.../kaola-workflow/.kw/worktrees/bundle-995-996-997` | 0 |

The last two rows are the discriminator: `--show-toplevel` would have given the worktree.
`--git-common-dir` gives main. The code takes the latter.

`--print-tree-root` is a first-class documented CLI mode (`sync-opencode-edition.js:1010`,
`sync-kimi-edition.js:884`, both in `usage()`), described at `sync-opencode-edition.js:1007-1009`
as *"the ONE answer to 'where does the tree a deploy copies from actually live'"*.

---

## 2. Why tracked surfaces stayed put but edition trees did not (MEASURED)

The asymmetry is **explicit and deliberate, in the same file, with two named constants**:

- `REPO` (`sync-opencode-edition.js:52`) — where **canonical sources are READ**.
  `CANON_AGENTS_DIR` / `CANON_HOOKS_DIR` / `CANON_PLUGINS_DIR` (`:85-87`) and `read()` (`:625-627`)
  all join `REPO`.
- `TREE_ROOT` (`:78`) — where **the generated tree LANDS**. `outDirs()` (`:93-102`) and
  `treePath()`/`readTree()` (`:628-633`) all join `TREE_ROOT`.

The comment at `sync-opencode-edition.js:54-77` states the rationale in full. Load-bearing clauses:

> *"Sources come from the checkout this script was invoked out of (REPO): a run edits agents/,
> commands/ and templates/ on its branch, and a render that read them anywhere else would ship prose
> nobody wrote here — a sync that quietly re-renders another checkout from its own unchanged sources
> is a no-op wearing a regenerate's name."*
>
> *"The tree is different. It is gitignored and derived, so a machine holds exactly one of it and it
> belongs to the MAIN checkout: a tree written inside a linked worktree dies with that worktree...
> So a sync run from a worktree renders the WORKTREE's sources into MAIN's tree."*
>
> *"Two costs, both accepted: main's trees can carry prose that has not merged yet, and two worktrees
> syncing at once leave the later render standing."*

**#996 is a report of accepted cost #1, by name.**

And `sync-opencode-edition.js:620-624` explains why the READ path splits too:

> *"They are separate because the two roots differ under a linked worktree — see TREE_ROOT above —
> and a check that read the tree from the invoking checkout would report every file missing in
> exactly the posture a run works in."*

So: 18 tracked surfaces → `REPO` (worktree). 6 edition trees → `TREE_ROOT` (main). One process, two
roots, on purpose.

---

## 3. Reproduction (MEASURED)

Leg 1 (clean tree → 0 changes) and leg 3 (the live uncommitted payload) are written up as **F1** and
**F2** above. The remaining legs:

### Leg 2 — controlled perturbation: the write AND the prune both reach main

Planted in the MAIN checkout (gitignored, derived):
- appended `<!-- PROBE-996-MARKER -->` to `.opencode-gitea/agent/investigator.md`
  (sha `11c576f2…` → `0e4e05d6…`)
- created a stray `.opencode-gitea/agent/zz-investigator-probe.md`

Then, from the WORKTREE: `node scripts/generate-routing-surfaces.js --write`

```
generated  .opencode-gitea/agent/investigator.md
pruned     .opencode-gitea/agent/zz-investigator-probe.md (retired surface)
```

| Measurement | Result |
|---|---|
| `.opencode-gitea/agent/investigator.md` sha after | `11c576f2…` — **restored to canonical** |
| `PROBE-996-MARKER` grep count after | **0 — marker gone** |
| stray file after | **deleted** (`ls: No such file or directory`) |

**REPRODUCES.** A worktree-run `--write` both WRITES and DELETES inside the main checkout's trees.
The prune reaching main deserves its own line: it is a *destructive* operation crossing the checkout
boundary (`pruneRetired` at `sync-opencode-edition.js:815`, `pruneSkills` at
`sync-kimi-edition.js:782`).

### Leg 4 — WHO SEES IT. #996's "invisible" premise is HALF WRONG.

Same drifted tree, five different observers:

| Observer | Command | Result | Exit |
|---|---|---|---|
| git, in main | `git status --short` | only `?? kaola-workflow/bundle-995-996-997/` — **silent** | 0 |
| the chain-resident guard | `node scripts/generate-routing-surfaces.js --check` (main) | `all 18 surfaces byte-match` — **GREEN** | 0 |
| the chain-resident guard | same, from worktree | `all 18 surfaces byte-match` — **GREEN** | 0 |
| **opencode edition suite, from MAIN** | `node scripts/test-opencode-edition.js` | **RED** | **1** |
| **kimi edition suite, from MAIN** | `node scripts/test-kimi-edition.js` | **RED** | **1** |

The suites' actual output:

```
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - .opencode/command/kaola-workflow-finalize.md — stale — regenerate
opencode-edition test FAILED: D0[github]: .opencode is present on disk and has DRIFTED from
canonical (sync --check exit 1).
The suite stops here rather than continue into its own sync --write, which would repair this
tree and erase the finding.
```
```
kimi-edition test FAILED: D0[github]: .kimi is present on disk and has DRIFTED from canonical
```

> **PREMISE CORRECTION.** #996 says the mutation is *"silent to `git status` AND to `--check`"*.
> Both halves are TRUE as stated, but the implied conclusion — that nothing notices — is FALSE.
> `D0` in both edition suites detects it precisely, names the file, prints the remedy, and
> deliberately refuses to self-repair so the finding survives. What is true is narrower and should
> be the issue's actual claim: **the detector is not in the four chains.**
> `test:kaola-workflow:editions` is a separate opt-in npm script (`package.json:45`); no chain
> (`package.json:40-43`) runs it. That exclusion is itself deliberate —
> `generate-routing-surfaces.js:352-354`: *"This belongs to --write alone: --check runs in all four
> chains, and a check that read an edition tree would put the editions inside `npm test`."*

### Leg 5 — the sharpest characterization: the same check disagrees with itself by checkout

| Command | Sources read | Tree read | Result | Exit |
|---|---|---|---|---|
| `node <main>/scripts/sync-opencode-edition.js --forge=github --check` | main | main | `PARITY FAILED (1 file)` | **1** |
| `node <worktree>/scripts/sync-opencode-edition.js --forge=github --check` | worktree | **main** | `14 agent(s) + 3 command(s) + 1 plugin(s) in parity` | **0** |

One tree, one moment, two verdicts. **The drift is invisible from the checkout that caused it and
visible only from the one that did not.** This is the crispest available statement of the seam and
is the thing a fix has to reckon with.

### Leg 6 — the full suites, from each checkout (MEASURED)

| Suite | Invoked from | Result | Assertions | Drift-check |
|---|---|---|---|---|
| `test-opencode-edition.js` | MAIN | **exit 1**, D0 RED | aborted at D0 | armed |
| `test-opencode-edition.js` | **WORKTREE** | **exit 0** | **663** | **armed — 3 trees in parity** |
| `test-kimi-edition.js` | MAIN | **exit 1**, D0 RED | aborted at D0 | armed |
| `test-kimi-edition.js` | **WORKTREE** | **exit 0** | **627** | **armed — 3 trees in parity** |

Run from the worktree, each suite prints on every D0 line and on its own verdict line:

```
D0: .opencode is present and in parity with canonical. [tree root: /Volumes/.../kaola-workflow, not this checkout]
opencode-edition test passed (663 assertions). [drift-check: 3 tree(s) in parity (...)] [tree root: ..., not this checkout]
```

That label is a purpose-built affordance — `test-opencode-edition.js:111`:

```js
const treeWhere = TREE_ROOT === REPO ? '' : ' [tree root: ' + TREE_ROOT + ', not this checkout]';
```

with the comment *"Named once, appended to every line D0 prints, so a verdict about a tree in
ANOTHER checkout can never read as a verdict about this one."*

**This measurement corrects a belief I carried in.** The recorded note *"edition suites go vacuous in
a fresh worktree — `.opencode`/`.kimi` are gitignored so a worktree has none; the suite still exits 0
at FULL assertion count with its drift-check disarmed"* is **no longer true for these two suites**
post-#969. Both are now **armed** from a worktree at full assertion count, because `TREE_ROOT` reaches
main's trees; and `D1` (`test-opencode-edition.js:182-187`) exists precisely to red if the presence
probe ever resolves a tree that does not exist — *"a guard that cannot fail, wearing a skip's name"*
is the failure it was written against. See constraint **C13**.

---

## 4. Hypothesis 2 — does the seam reach other entry points? (MEASURED where marked)

There are **exactly two writers** of the six edition trees in the whole repo. Grepped every `.js`
under `scripts/` for `.opencode` / `.kimi` literals: the only non-test hits outside the two sync
scripts are `runtime-edition-forge.js:65-66`, `simulate-workflow-walkthrough.js:11051` and
`validate-workflow-contracts.js:1062` — **all three are comments only**, no read and no write
(MEASURED by reading each hit).

| Entry point | Root resolution | Hits the seam from a worktree? | Basis |
|---|---|---|---|
| `scripts/generate-routing-surfaces.js --write` | `__dirname` for surfaces; delegates trees | **YES** — the reported case, delta-gated per F1 | MEASURED |
| `scripts/generate-routing-surfaces.js --check` | `__dirname` only; never spawns children (`:380` is inside `cmdWrite`) | **NO** — reads no tree at all | MEASURED (green over a drifted tree, from both checkouts) |
| `scripts/sync-opencode-edition.js` `--write` / `--refresh-present` / `--check` | `TREE_ROOT` | **YES** — it *is* the seam | MEASURED (leg 5) |
| `scripts/sync-kimi-edition.js` (same modes) | `TREE_ROOT` | **YES** | MEASURED (`--print-tree-root`, D0 red from main) |
| **`scripts/edition-sync.js`** — the real filename; the brief's `kaola-workflow-edition-sync.js` **does not exist** | `REPO = path.resolve(__dirname,'..')` at `:48`; **no `TREE_ROOT`, no `getCoordRoot`** | **NO** | MEASURED (grep). Writes only `plugins/kaola-workflow*/scripts/…` under `REPO` (`:68-96`, `:139`, `:151`, `:226`) — all TRACKED forge-edition paths, correctly worktree-local |
| **`install.sh`** | — | **NO** | MEASURED: `grep -n "opencode\|\.kimi\|generate-routing-surfaces\|sync-"` returns **zero** hits. The claude installer never touches the additive edition trees |
| **`install-opencode.sh`** | `:171` `TREE_ROOT="$(node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --print-tree-root)"`, then `:175` `SOURCE_TREE="$TREE_ROOT/.opencode$FORGE_SUFFIX"` | **YES, INTENTIONALLY** — and it is REQUIRED to | **MEASURED end-to-end** (below) |
| **`install-kimi.sh`** | identical shape at `:137`, `SOURCE_TREE="$TREE_ROOT/.kimi$FORGE_SUFFIX"` | **YES, INTENTIONALLY** | **MEASURED end-to-end** (below) |
| **`install-all.sh`** | no tree logic of its own; shells out — `:642` `bash "$ROOT/install-opencode.sh"`, `:649` `bash "$ROOT/install-kimi.sh"` | inherits both rows above | MEASURED (grep) + REASONED for the deploy half (did not run a full install — it writes `$HOME`) |
| `test-opencode-edition.js`, `test-kimi-edition.js` | re-derive `TREE_ROOT` **independently** (`test-opencode-edition.js:47-60`, `test-kimi-edition.js:63-75`) via their own `git rev-parse --git-common-dir` | they READ main's tree by design, and are ARMED doing so | MEASURED (leg 6) |
| the four chains (`package.json:40-43`) | run only `generate-routing-surfaces.js --check` | **NO** | MEASURED |

### The installers, measured rather than reasoned

`--regenerate` refreshes the in-repo tree and exits before any deploy
(`install-opencode.sh:185-188`, `install-kimi.sh:151-154`); verified by grep that no `mkdir -p`,
`cp -R` or `rsync` runs before that exit — every `$HOME` mention above those lines is comment or
usage text. So it is a safe probe that prints the resolved `SOURCE_TREE`. Invoked **from the
worktree**:

```
$ bash <worktree>/install-opencode.sh --forge=github --regenerate
Kaola-Workflow · opencode edition (github) — refreshing generated tree...
Regenerated /Volumes/.../kaola-workflow/.opencode from canonical. Done.        # exit 0

$ bash <worktree>/install-kimi.sh --forge=github --regenerate
Kaola-Workflow · kimi edition (github) — refreshing generated tree...
Regenerated /Volumes/.../kaola-workflow/.kimi from canonical. Done.            # exit 0
```

**Both installers, invoked from the worktree, deploy from the MAIN checkout's tree.** No worktree
path appears. This is measured, not inferred.

The installers' own comment (`install-opencode.sh:167-170`, `install-kimi.sh:133-136`) says why:

> *"WHERE that tree lives is the generator's answer, never this script's guess: it is not always the
> directory this installer sits in (a linked worktree's tree belongs to the main checkout), and a
> deploy that copies from a path the generator never writes installs nothing."*

And `9b6fac01`'s body records that this coupling was itself a repair:

> *"Also repaired, found while fixing #969: both edition installers deployed from beside themselves,
> so from a worktree opencode failed loudly and kimi exited 0 having deployed ZERO skills. Each now
> takes its source tree from the generator."*

**Read that last clause carefully: the pre-#969 behaviour — trees resolved beside the invoking script
— is the behaviour #996 asks for, and it is recorded as having shipped a silent zero-skill install.**

---

## 5. THE CONSTRAINT LIST — what a fix must not break

The design-against list. Every row is a behaviour something currently depends on, with where the
dependency lives and how it fails. **C1, C2, C3 and C13 are the four that name a party who
legitimately needs the resolution to reach the main checkout.**

### C1. Canonical sources MUST keep resolving to the INVOKING checkout — *(the no-op trap)*
`sync-opencode-edition.js:56-59`. Pinned by `A31` at `test-opencode-edition.js:3487-3492`: main's
tree must *lose* the marker planted in main's `agents/`. The test's own header calls the alternative
*"a no-op wearing a fix's name"* (`:3335-3341`): resolve sources against main too, and a run's
regenerate reads main's unedited sources and writes a tree that was already in parity — the run's
actual edits then reach no tree at all. **Any "just point everything at one root" fix dies here.**

### C2. The installers depend on the tree being where the generator says — MEASURED dependency
`install-opencode.sh:171` + `:175`, `install-kimi.sh:137` + `:141`. Both consume
`--print-tree-root` as a program interface, and both were measured resolving to main from the
worktree. The resolver and the installers move together automatically, so the *interface* is safe —
but the *consequence* must stay true: whatever the installer copies from must be the thing the sync
just wrote, and it must still exist after the worktree is gone (C3). Pre-#969 this was broken and
kimi deployed **zero skills, exit 0**.

### C3. A tree written in a linked worktree is DESTROYED with the worktree — *(the original defect)*
The observed failure #969 exists for, quoted at `test-opencode-edition.js:3316-3322`: a run
regenerated all six trees, recorded them in parity, *"and every tree it wrote died with the worktree
it wrote them in: the main checkout was never touched, and twelve files there kept prose that tells
a reader to pass a flag canonical had already renamed."* Pinned by `test-opencode-edition.js:3499-3504`:

```js
assert(!fs.existsSync(path.join(wtRoot, sync.treeLabel(DEF_FORGE))), ...)
```

**A fix that writes the tree into the worktree fails this assertion by construction**, and
`CLAUDE.md` forbids the escape hatch: *"a test is deleted with its mechanism, never repaired ahead
of it."*

### C4. `--check` and `--write` must agree about which root holds the tree
`test-opencode-edition.js:3506-3512` (`c2`): run from the worktree, `--check` must exit 0 over the
tree `--write` just made current. *"A checker looking at one root while the writer writes another
reports a permanent false red in exactly the posture a run works in."*

### C5. The non-git posture must resolve to the SCRIPT's dir, never to cwd
`test-opencode-edition.js:3520-3538`. An unpacked tarball is how the installers run for consumers.
`--write` must exit 0 there, land beside the script, and **never** in the process cwd (*"which owns
no canonical sources and is not what 'the main checkout' means"*). A resolution that throws where
there is no git *"breaks both installers"*.

### C6. The tree must NEVER land inside a directory git owns
`A33` (`test-opencode-edition.js:3540+`) and `K15` (`test-kimi-edition.js:2182+`), each with a real
bare-repo-plus-worktree leg and a real submodule leg. This is why the code tests
`path.basename(coord) === '.git'` rather than just taking the coord dir: a bare repo's coord dir is
`<name>.git`, a submodule's is `<super>/.git/modules/<name>`.

### C7. `--write` refreshes PRESENT trees only; it creates none
`A32`. `sync-opencode-edition.js:810` / `sync-kimi-edition.js:778` skip absent trees.
`generate-routing-surfaces.js:351-352`: *"Only trees that ALREADY EXIST are refreshed and none is
created, so a checkout that installed no edition sees and gains nothing."* A fresh worktree has none
of the six (MEASURED), so a fix that starts creating them in worktrees breaks this **and** C3.

### C8. `--check` must keep NOT reading edition trees
`generate-routing-surfaces.js:352-354`: *"--check runs in all four chains, and a check that read an
edition tree would put the editions inside `npm test`."* This collides head-on with the obvious
"just make `--check` catch it" remedy: doing that makes the additive editions a four-chain
dependency, which `CLAUDE.md` forbids (*"opencode and kimi are additive runtime editions… absent
from `npm test`"*).

### C9. The compare-before-write property (F1)
`sync-opencode-edition.js:652/669/696/714`. An in-parity run must stay a byte- and mtime-exact no-op
(MEASURED). A fix must not turn every `--write` into an unconditional rewrite — that would convert
today's delta-gated defect into an every-run one, and would also churn mtimes under any consumer
watching the tree.

### C10. The prune must keep reaching whatever tree is written
`pruneRetired` / `pruneSkills` delete retired surfaces from the SAME root that is written (MEASURED,
leg 2). Write-here-prune-there in any combination strands retired files in a deployed tree — which
is #973's failure class.

### C11. The test fixtures' `--print-tree-root` safety throw
`test-opencode-edition.js:1355-1366` and `test-kimi-edition.js:1216-1227` build a temp source copy,
probe `--print-tree-root`, and **throw** unless it equals the temp dir — with `.git` deliberately
excluded from the copy because *"a copied gitdir pointer resolves to this repository — so a copy
carrying `.git` would rewrite the real tree from mutated canonical sources."* Any change must keep
the no-git case answering "beside the script", or these fixtures begin regenerating the real
repository from mutated sources.

### C12. Two concurrent worktrees
Already an accepted cost (`sync-opencode-edition.js:67-68`): *"two worktrees syncing at once leave
the later render standing."* Live on this machine right now (two active worktrees). Not a regression
a fix must repair, but a fix must not worsen it.

### C13. The edition suites are ARMED from a linked worktree ONLY because of this resolution
**MEASURED, leg 6** — and this is the constraint most likely to be missed, because it looks like a
test-only concern and is not. Run from the worktree, both suites reach full assertion count (663 /
627) with the drift-check **armed over main's three trees**. Point the tree at the worktree and the
trees are absent there (gitignored, MEASURED), so `D0`'s presence probe takes the ABSENT branch for
every forge and the suite *"checks nothing while printing three reassuring skip lines — a guard that
cannot fail, wearing a skip's name"* (`test-opencode-edition.js:170-176`). `D1` (`:182-187`) is the
assertion that stops that being green, so a worktree-local fix trades a visible drift for a
**disarmed detector** — strictly worse, and precisely the shape `CLAUDE.md` warns about in *"a green
suite is not proof a guard is armed."*

---

## 6. Is there an existing test that would catch this? (MEASURED — YES, and it is red right now)

**Yes — four bands, and the honest answer is that coverage is unusually thorough.**

| Band | Location | What it pins |
|---|---|---|
| `D0`/`D1` | `test-opencode-edition.js:182-187`, `test-kimi-edition.js:199` | a present tree that has drifted from canonical is RED, and the probe that finds the tree must resolve one that exists — explicitly *"the check that the two roots agree"* |
| `A31` | `test-opencode-edition.js:3313-3538` | full fixture: real repo + real `git worktree add`, two markers (one in main's `agents/`, one in the worktree's). Asserts main's tree GAINS the worktree marker, LOSES main's marker, the worktree gains NO throwaway tree, and `--check` agrees. Plus the non-git leg and the not-in-cwd leg |
| `A32` | same band | present trees refreshed, absent trees not conjured |
| `A33` / `K15` | `test-opencode-edition.js:3540+`, `test-kimi-edition.js:2182+` | bare-repo and submodule postures: never inside git's storage |

`A31`'s header pre-answers the fix-shape question:

> *"Both properties … are stated as RESULTS because neither is a claim about how a root is
> computed."*

**Right now, on this machine, `D0` is RED in both suites when run from main** (leg 4) — over exactly
the drift #996 describes. The gap is not "no test"; it is **"the test is not in a chain"**
(`package.json:45` vs `:40-43`), and `CLAUDE.md` already routes edition work there: *"An edition-only
diff owes no four-chain run; run its own suite."* The uncovered case is a worktree `--write`
triggered by a **non**-edition diff — nobody's routing says to run the edition suite then.

---

## 7. Inferences (labeled — these are mine, not measurements)

- **I1.** #996 as written is a proposal to revert #969, and its stated harm is #969's explicitly
  accepted cost #1. — confidence: **high**. Refuted by: a distinct harm not covered by
  `sync-opencode-edition.js:67-68`.
- **I2.** The real, unaddressed gap is a **routing/timing** one, not a path-resolution one: the
  detector (`D0`) exists and works, but nothing schedules it after a worktree `--write`.
  — confidence: **medium-high**. Refuted by: showing `D0` cannot detect some class of
  worktree-induced drift.
- **I3.** Any fix that relocates the tree to the worktree fails `A31` at
  `test-opencode-edition.js:3499`, re-opens #969's observed failure (C3), re-opens the zero-skill
  install (C2), and **disarms** both edition suites in the worktree posture (C13). — confidence:
  **high** (assertions read directly, C13 measured).
- **I4.** Severity is bounded by derivedness: any subsequent `--write`, or either installer's
  check-or-write (`install-opencode.sh:181-182`, `install-kimi.sh:147-148`), restores parity. The
  exposure window is "between a worktree `--write` with a delta and the next regenerate-from-main or
  install". — confidence: **high**. Refuted by: a consumer that reads the tree without regenerating
  first — which is exactly a human running `opencode`/`kimi` locally against this repo, so the
  window is real, not theoretical.
- **I5.** The filer's "all six trees changed" came from the unconditional
  `refreshed 3 present tree(s)` log lines rather than from a content diff. — confidence: **medium**
  (F1 shows the lines print over a zero-change run). Refuted by: a before/after hash set from the
  filer's run showing content deltas.

---

## 8. State I am leaving behind (say-so, per instruction)

**Tracked files — I wrote six, in the worktree, and did not revert them.** Confirmed by team-lead as
the mandated output; nothing to undo. My leg-2 `--write` rendered another agent's in-flight
`templates/routing/finalize.skeleton.md` edit into the six tracked finalize surfaces
(`commands/kaola-workflow-finalize.md` + `plugins/kaola-workflow{,-gitlab,-gitea}/…`), +4/−1 each,
the diff byte-identical to the skeleton change and nothing else — this is the project's
"edit the skeleton and regenerate" step, and reverting would leave the tree drifted with `--check` red.

**Gitignored edition trees — LEFT CHANGED, in the main checkout.** All six carry the worktree's
uncommitted "priority tier" sentence in their finalize surface, so **both edition suites are RED when
run from main and GREEN when run from the worktree**. This is authorized build output and is the live
evidence of F2. It self-heals when the worktree's work merges and anything regenerates. To restore
main's trees to main's canonical *now*:

```
node /Volumes/.../kaola-workflow/scripts/sync-opencode-edition.js --refresh-present
node /Volumes/.../kaola-workflow/scripts/sync-kimi-edition.js --refresh-present
```

Run those **from the MAIN checkout** — from a worktree they re-render the same drift.

My leg-2 probe artifacts are fully cleaned: the marker was overwritten and the stray file pruned by
the tool itself, both verified by hash and by `ls`. Nothing was written outside the repo; no
installer deploy ran.

Snapshots: `<scratchpad>/before-hashes.txt`, `after-hashes.txt`, `before-mtimes.txt`,
`after-mtimes.txt`, `investigator.md.orig`.

**Boundary honored:** did not implement any fix; did not touch `scripts/kaola-workflow-gap-sweep.js`
or `templates/routing/required-blocks.js`.

---

## 9. Open (unmeasured, and why)

- **A full install from a worktree.** The `--regenerate` half is now MEASURED (§4); the *deploy* half
  writes `$HOME` and reaches outside the repository — a user-owned, outward-facing action not mine to
  take unasked. The deploy is REASONED from `SOURCE_TREE="$TREE_ROOT/.opencode$FORGE_SUFFIX"`
  (`install-opencode.sh:175`) plus the measured `TREE_ROOT`.
- **Whether `A31` currently passes.** Run from main, both suites abort at `D0` (an earlier band) over
  the drift this investigation created, so `A31` did not execute in that direction. Run from the
  worktree both suites pass in full (663 / 627 assertions), which *does* include `A31`/`A32`/`A33` —
  so `A31` is measured green, just not from main. Regenerate main's trees (§8) and the main-side run
  reaches it too.
- **The two-concurrent-worktrees race (C12).** Not exercised; it needs two simultaneous syncs and the
  outcome is already documented as accepted.

---

# PART II — ARMING THE #996 NOTE (mutation-proof, independent custody)

Investigator custody: I did not write the note. Boundaries honored — no edits to `sync-*-edition.js`,
`generate-routing-surfaces.js`, `gap-sweep.js`, `claim.js`, `test-*.js`, `templates/routing/`;
nothing committed.

## 10.0 A LIVE-EDIT COLLISION, AND WHY THE FIRST MATRIX WAS DISCARDED

My first pass measured a version of the code that no longer exists. `sync-kimi-edition.js` was
written at 20:49:30; my run landed at 20:49:32 and exited **1** with

```
ReferenceError: wrote is not defined
    at runRefreshPresent (.../sync-kimi-edition.js:805:3)
```

**This is NOT a landed defect.** The implementer was mid-rename `wrote` → `changed`: `let changed = 0`
had landed, the guard two dozen lines below still said `wrote`. A sub-second window. Recorded here
because the artifact is indistinguishable from a real crash in a log, and because it is the reason
every number below was re-taken.

Stability was then established before re-measuring — `node --check` OK on both, and identical sha256
at 20:50:08 and 20:50:37 (`7b3c7034…` opencode, `a59f629f…` kimi). **Every measurement in §10.1
onward is against that settled pair.**

The rename also pre-empted the truthfulness finding I had queued. The pre-rename count summed
`pruneRetired`/`pruneSkills` — **deletions** — into a number labelled "written", so a prune-only
refresh would have claimed it *wrote* files it had *deleted*. The settled code says `changed`, and
carries the reason at `sync-opencode-edition.js:834` / `sync-kimi-edition.js:801`:

> *"The count includes pruneRetired, and the word is 'changed' rather than 'written' for that reason:
> a refresh can DELETE from the other checkout and write nothing, which is the more destructive half
> of the same cross-checkout reach and the half a write-only count would report as a silent no-op."*

Credit to the implementer; §10.3 verifies it on disk rather than taking the comment's word.

## 10.1 THE FOUR POSTURES

| # | Posture | Gate state | Note? | stderr bytes | Exit |
|---|---|---|---|---|---|
| 1 | **FIRE** — from worktree, real delta, opencode | `changed=3`, `TREE_ROOT≠REPO` | **YES** | 437 | 0 |
| 1 | **FIRE** — from worktree, real delta, kimi | `changed=3`, `TREE_ROOT≠REPO` | **YES** | 421 | 0 |
| 2a | **SILENT** — from MAIN, 3 files really written, both scripts | `changed=3`, `TREE_ROOT===REPO` | no | **0** | 0 |
| 2b | **SILENT** — from worktree, trees in parity, both scripts | `changed=0`, `TREE_ROOT≠REPO` | no | **0** | 0 |
| 3 | **stderr only** | — | stdout `NOTE` count = **0** in every firing run | — | — |
| 4 | **`--print-tree-root` after a firing run** | — | 1 line, 58 bytes, stderr 0, both scripts | — | 0 |

Posture 2a is the strong negative: files really were written (three `generated` lines on stdout each)
and the note correctly stayed silent because the write was same-checkout. Posture 2b is the other
half: cross-checkout, but nothing changed, so no warning is attached to a run that touched nothing.

### The note, verbatim (opencode; kimi identical but for the script name and tree labels)

```
sync-opencode-edition: NOTE — 3 file(s) changed in a checkout that is not this one.
  .opencode, .opencode-gitlab, .opencode-gitea under /Volumes/.../kaola-workflow
  now render THIS checkout's canonical sources (/Volumes/.../kaola-workflow/.kw/worktrees/bundle-995-996-997), including anything uncommitted here.
  Verify from that root: npm run test:kaola-workflow:editions
```

### The kimi fire, as a single self-contained transaction

An earlier kimi leg reported `changed=0` — **another agent's regeneration interleaved** and had
already brought main's trees to worktree parity. Re-run as one atomic bash call with the clause
counted inline before and after, it is unambiguous:

```
step 1  clause in main/.kimi : 1   sha: ccfb22354629
step 2  repaired FROM MAIN — exit 0 | stderr bytes 0 | stdout: 3 generated
step 3  clause in main/.kimi : 0   sha: 82f90b512126     <- main's canonical, clause absent
step 4  ran FROM WORKTREE — exit 0 ; NOTE printed on stderr, 3 generated on stdout
step 5  clause in main/.kimi : 1   sha: ccfb22354629     <- worktree's uncommitted clause, in main
```

## 10.2 DOES THE COUNT MATCH DISK? YES, IN EVERY POSTURE MEASURED

Counted by sha256 over all six trees (node_modules excluded), before vs after each run:

| Run | Note says | Files whose hash actually changed | Match |
|---|---|---|---|
| opencode, from worktree | `3 file(s) changed` | 3 — the three `kaola-workflow-finalize.md` | **yes** |
| kimi, from worktree | `3 file(s) changed` | 3 — the three `kaola-workflow-finalize/SKILL.md` | **yes** |
| opencode, prune-only | `1 file(s) changed` | 1 deleted, 0 written | **yes** |
| kimi, prune-only | `1 file(s) changed` | 1 deleted, 0 written | **yes** |

## 10.3 THE PRUNE-ONLY POSTURE — the destructive half, measured

Planted in MAIN (with everything else already at worktree parity, so the run can only delete):
`.opencode-gitea/agent/zz-prune-probe.md` and `.kimi-gitea/skills/zz-prune-probe/SKILL.md`.
Run from the WORKTREE:

```
pruned     .opencode-gitea/agent/zz-prune-probe.md (retired surface)
sync-opencode-edition: NOTE — 1 file(s) changed in a checkout that is not this one.     [stderr]

pruned     .kimi-gitea/skills/zz-prune-probe (retired surface)
sync-kimi-edition: NOTE — 1 file(s) changed in a checkout that is not this one.         [stderr]
```

`generated` lines: **0**. `pruned` lines: **1**. Stray gone from main in both cases. Both exit 0.

**This is the posture the rename bought.** Pre-rename the same run would have read
`1 file(s) written into a checkout that is not this one` while writing nothing and deleting one — a
false statement about the more destructive half of the reach. It is now correct.

## 10.4 TRUTHFULNESS VERDICT — the note tells the truth

Clause by clause, against what was measured:

| Clause | Verdict |
|---|---|
| `N file(s) changed` | **TRUE** — matches disk in all four measured runs, writes and deletes alike |
| `in a checkout that is not this one` | **TRUE** — gated on `TREE_ROOT !== REPO`; silent from main (2a) |
| `<labels> under <TREE_ROOT>` | **TRUE** — `TREE_ROOT` printed matches `--print-tree-root` exactly |
| `now render THIS checkout's canonical sources (<REPO>)` | **TRUE** — and true for the unchanged trees too, since in-parity means byte-identical to this checkout's render |
| `including anything uncommitted here` | **TRUE** — demonstrated directly: an uncommitted clause reached all six trees (§10.1 step 5) |

**No false or overstated clause found in any posture I could reach.** Two observations that are
accurate-as-written but worth the orchestrator's eye, offered as readability notes, not defects:

- **O1 — the label list is "refreshed", not "changed".** In the prune-only run the note enumerates
  all three tree labels while only one tree changed. The sentence does not claim all three changed —
  the count is on its own line, and "now render THIS checkout's canonical sources" is true of all
  three. A hurried reader could still infer three changed files.
- **O2 — "Verify" resolves to a command that is EXPECTED to fail.** MEASURED: with the note's own
  delta on disk, `npm run test:kaola-workflow:editions` from the named root exits **1**
  (`D0[github]: .opencode is present on disk and has DRIFTED from canonical`). That is the drift
  being surfaced, exactly as designed — but "Verify" reads as "confirm this is fine", and the honest
  expectation is red-until-the-branch-merges.

## 10.5 FINAL STATE — repaired, and A31 finally ran

Main's six trees were regenerated **from MAIN's canonical** as the last mutating action:

```
sync-opencode-edition --forge=github --check   ->  14 agent(s) + 3 command(s) + 1 plugin(s) in parity   exit 0
sync-kimi-edition     --forge=github --check   ->  14 role skill(s) + 3 command skill(s) + 2 hook file(s) in parity   exit 0
```

Suites, run separately from MAIN:

| Suite | Exit | Assertions | Drift-check |
|---|---|---|---|
| `scripts/test-opencode-edition.js` | **0** | **663** | 3 tree(s) in parity |
| `scripts/test-kimi-edition.js` | **0** | **627** | 3 tree(s) in parity |

Zero `FAIL` lines in either log.

**A31 EXECUTED — for the first time this session, and it passed.** Proof rather than inference: the
verdict line `opencode-edition test passed (…)` is at `test-opencode-edition.js:3781`, the **last
line of a 3781-line file**, while A31 opens at `:3314` and A33 at `:3540`. A top-level band cannot be
skipped and still let the final line print, so reaching that verdict means A31/A32/A33 all ran; zero
FAIL lines means all passed. The count also equals the 663 measured from the worktree earlier, i.e.
the same band set both times.

No tracked file was modified in Part II. The only disk changes were to main's six gitignored edition
trees, which end **in parity with MAIN's canonical**. Both probe strays were pruned by the tool
itself and verified gone.

---

# PART III — POST-FREEZE CONFIRMATION

## 11.0 PART II ALREADY MEASURED THE FROZEN CODE

The frozen files are byte-identical to what Part II measured — sha256 `7b3c703483a0…`
(`sync-opencode-edition.js`, mtime 20:49:02) and `a59f629f7d1a…` (`sync-kimi-edition.js`, mtime
20:49:30), unchanged at 20:50:08, 20:50:37 and 20:56:40. **No part of the Part II matrix is stale.**
Part III re-measures the firing case anyway on the frozen shas, and adds what Part II could not
reach.

## 11.1 LEDGER CORRECTION — main's trees rendered MAIN's canonical, not the worktree's

Reported to me: *"Main's six edition trees ALL carry the tier clause … a plain `--refresh-present`
from the worktree right now writes 0 files and will stay silent."* **Measured at 20:56:40, before
running anything: all six had clause count 0** — they rendered MAIN's canonical, i.e. the state my
Part II repair left them in. The implementer's `--write` probe did not survive as the last writer.

Consequence, opposite to the briefing: a real delta was already present, so the firing case needed no
manufacturing, and the run below is a genuine cross-checkout write rather than a constructed one.

## 11.2 FIRING CASE, on the frozen shas

| Script | Exit | stdout `generated` | stdout `NOTE` | stderr bytes | Note |
|---|---|---|---|---|---|
| `sync-opencode-edition.js` | 0 | 3 | **0** | 437 | fired |
| `sync-kimi-edition.js` | 0 | 3 | **0** | 421 | fired |

```
sync-opencode-edition: NOTE — 3 file(s) changed in a checkout that is not this one.
  .opencode, .opencode-gitlab, .opencode-gitea under /Volumes/.../kaola-workflow
  now render THIS checkout's canonical sources (/Volumes/.../worktrees/bundle-995-996-997), including anything uncommitted here.
  Verify from that root: npm run test:kaola-workflow:editions
```

Matches the briefed text exactly. Stream separation holds: zero `NOTE` occurrences on stdout.

## 11.3 THE DELETION CLAIM — VERIFIED BY RUNNING, NOT BY READING

The one assertion no test reaches, and the implementer's account of its own code. Measured on the
frozen shas, in a posture where the run can only delete:

| Probe | Deleted | Written | Note count | Note fired? |
|---|---|---|---|---|
| single stray file, `.opencode-gitea/agent/zz-prune-probe.md` | 1 | 0 | `1 file(s) changed` | **yes** |
| single stray skill dir, `.kimi-gitea/skills/zz-prune-probe/` | 1 dir | 0 | `1 file(s) changed` | **yes** |
| **5-file skill dir**, `.kimi-gitea/skills/zz-multi-probe/` | **5 files (1 dir)** | 0 | **`1 file(s) changed`** | **yes** |

**The implementer's claim holds: `changed` genuinely sums the prune counts, and a deletion-only
refresh fires.** It does not print `0`, and it does not stay silent. That is the question answered.

### 11.3a The carried imprecision, now with a number — and it UNDERCOUNTS

The deferred item is real and measured: a retired skill directory holding **5 files** is removed with
`recursive: true` and counted as **1**, so the note says `1 file(s) changed` over 5 deleted files.

Direction matters, and it is the reassuring one: the count **understates** the reach. The gate is
never wrong (it cannot read zero when something was deleted, so the note always fires), and the error
is bounded to multi-file skill directories on the kimi side only — the opencode prune loops delete
individual files and count each. So this is a precision defect in the number, not a correctness
defect in the announcement. The suggested one-word repair to "change(s)" makes the sentence
unconditionally true; that call is the orchestrator's, and I did not make it.

## 11.4 A31 EXECUTED — FROM BOTH CHECKOUTS

| Suite | Invoked from | Exit | Assertions | FAIL lines | A31 |
|---|---|---|---|---|---|
| `test-opencode-edition.js` | MAIN | **0** | 663 | 0 | **executed, passed** |
| `test-kimi-edition.js` | MAIN | **0** | 627 | 0 | **executed, passed** |
| `test-opencode-edition.js` | WORKTREE | **0** | 663 | 0 | **executed, passed** |
| `test-kimi-edition.js` | WORKTREE | **0** | 627 | 0 | **executed, passed** |

Proof of execution rather than inference: the verdict line
`console.log('opencode-edition test passed (' + passed + ' assertions)…')` is
`test-opencode-edition.js:3781`, the **last line of a 3781-line file**, while the A31/A32 band opens
at `:3314` and A33 at `:3540`. A top-level band cannot be skipped and still let that line print, so
reaching the verdict means A31/A32/A33 all ran; zero FAIL lines means all passed.

What A31 asserts, and therefore what is now confirmed on this machine: a sync run from a linked
worktree writes MAIN's tree, rendered from the INVOKING checkout's sources, leaving no throwaway tree
in the worktree; `--check` agrees with `--write` about the root; the non-git posture lands beside the
script and never in cwd; and (A33) the tree never lands inside git's own storage.

Worktree-side runs carry the `[tree root: /Volumes/.../kaola-workflow, not this checkout]` suffix on
every D0 line and on the verdict; main-side runs omit it, because `TREE_ROOT === REPO` there.

## 11.5 THE ASYMMETRY, MEASURED AT ONE TREE STATE

The sharpest statement of the seam, now at full-suite scale rather than a single `--check`. Same six
trees, same moment, nothing written between the two reads:

| Read from | Exit | What it said |
|---|---|---|
| WORKTREE | **0** | opencode 663 + kimi 627 assertions, drift-check armed, 3 trees in parity each |
| MAIN | **1** | `D0[github]: .opencode is present on disk and has DRIFTED from canonical` (and the same for `.kimi`) |

Both suites are simultaneously green from one checkout and red from the other. The green is not
vacuous — it is armed, at full assertion count, and it includes A31.

## 11.6 FINAL STATE — UNAMBIGUOUS

**Main's six edition trees render MAIN's canonical** (branch `main` @ `8deb8eae`), NOT the worktree's.
Verified by clause count immediately after the final repair:

```
.opencode/command/kaola-workflow-finalize.md            0
.opencode-gitlab/command/kaola-workflow-finalize.md     0
.opencode-gitea/command/kaola-workflow-finalize.md      0
.kimi/skills/kaola-workflow-finalize/SKILL.md           0
.kimi-gitlab/skills/kaola-workflow-finalize/SKILL.md    0
.kimi-gitea/skills/kaola-workflow-finalize/SKILL.md     0
```

(`0` = MAIN's canonical, which lacks the tier clause; `1` would mean the worktree's uncommitted one.)

Closing verification, run from MAIN after the repair:

| Check | Exit |
|---|---|
| `test-opencode-edition.js` | **0** — 663 assertions, 3 trees in parity, 0 FAIL |
| `test-kimi-edition.js` | **0** — 627 assertions, 3 trees in parity, 0 FAIL |

All probe artifacts removed and verified absent (`zz-prune-probe` ×2, `zz-multi-probe`). The final
repair from main printed **0 bytes of stderr** on both scripts — negative case (a) once more, as the
last action. No tracked file was modified in Part III; nothing committed; the frozen sync scripts
were not touched.

---

# PART IV — RE-VERIFY AFTER THE `change(s)` REWORD

New shas, both `node --check` clean: `e3888259b1fe…` (`sync-opencode-edition.js`, mtime 21:04:41)
and `8ee6c27b2404…` (`sync-kimi-edition.js`, mtime 21:04:55). Source carries the new string at
`sync-opencode-edition.js:851` and `sync-kimi-edition.js:819`; **zero surviving occurrences of
`file(s) changed`** in either script.

Trees started this pass at MAIN's canonical (clause 0), so the firing case was a genuine delta and
needed no manufacturing.

## 12.1 FIRING CASE — new wording

| Script | Exit | stdout `generated` | stdout `NOTE` | stderr bytes |
|---|---|---|---|---|
| `sync-opencode-edition.js` | 0 | 3 | **0** | 431 |
| `sync-kimi-edition.js` | 0 | 3 | **0** | 415 |

```
sync-opencode-edition: NOTE — 3 change(s) in a checkout that is not this one.
  .opencode, .opencode-gitlab, .opencode-gitea under /Volumes/.../kaola-workflow
  now render THIS checkout's canonical sources (/Volumes/.../worktrees/bundle-995-996-997), including anything uncommitted here.
  Verify from that root: npm run test:kaola-workflow:editions
```

Lines 2–4 byte-identical to Part III. Stream separation intact. Stderr shrank by exactly 6 bytes on
each script (437→431, 421→415), which is `file(s) changed` → `change(s)` and nothing else.

## 12.2 PRUNE-ONLY, 5-FILE SKILL DIRECTORY — the posture the reword exists for

Planted `.kimi-gitea/skills/zz-multi-probe/` holding 5 files; run from the worktree with the trees
otherwise in parity, so the run can only delete:

```
pruned     .kimi-gitea/skills/zz-multi-probe (retired surface)
sync-kimi-edition: NOTE — 1 change(s) in a checkout that is not this one.          [stderr]
```

`generated` = 0, `pruned` = 1, directory gone, exit 0.

**The false statement is retired.** Where Part III measured `1 file(s) changed` over 5 deleted files —
literally untrue — the same posture now reads `1 change(s)`, which is exactly right: one change, being
one directory removed. The note still FIRES on a deletion-only refresh; it does not print 0 and does
not stay silent. The unit is now vague where the underlying count is vague, which is the honest
resolution and is cheaper than reaching into a deletion path to count files inside a doomed directory.

## 12.3 BOTH NEGATIVE POSTURES STILL SILENT

| Posture | Gate | Writes | stderr bytes | Note |
|---|---|---|---|---|
| from WORKTREE, trees in parity | `changed==0`, `TREE_ROOT≠REPO` | 0 | **0** | none |
| from MAIN, real writes | `changed==3`, `TREE_ROOT===REPO` | 3 each | **0** | none |

Both scripts, both postures, exit 0. The second is the strong one: three files genuinely written and
the note correctly stayed silent because the write was same-checkout.

## 12.4 ON NOT RE-RUNNING A31 — agreed, and verified rather than assumed

I did not re-run the suites, and I agree that is correct. Verified rather than taken on trust:

- `grep -rl` across every `scripts/test-*.js` plus the walkthrough returns **0 files** referencing
  `--refresh-present`, and **0 files** referencing either NOTE string. A positive control on the same
  search (`print-tree-root`) returns **2 files**, so the search is live rather than silently matching
  nothing. (The first attempt at this check piped `grep` into `sed`, which made `||` read the pipe's
  status instead of grep's — the recorded "your check can silently not check" trap. Redone without
  the pipe.)
- The note lives only in `runRefreshPresent` (`sync-opencode-edition.js:807`), disjoint from
  `runCheck` (`:873`), which is the mode D0 and A31 drive.

So a string inside a `console.error` in `--refresh-present` cannot reach A31, and Part III's
four-run result (opencode 663 / kimi 627, exit 0, from both checkouts, A31 executed and passed)
stands unchanged.

## 12.5 FINAL STATE — AUTHORITATIVE CLOSING MEASUREMENT

**Main's six edition trees render MAIN's canonical** (`main` @ `8deb8eae`). Measured immediately
after the final repair-from-main, not reconstructed:

```
.opencode/command/kaola-workflow-finalize.md            0
.opencode-gitlab/command/kaola-workflow-finalize.md     0
.opencode-gitea/command/kaola-workflow-finalize.md      0
.kimi/skills/kaola-workflow-finalize/SKILL.md           0
.kimi-gitlab/skills/kaola-workflow-finalize/SKILL.md    0
.kimi-gitea/skills/kaola-workflow-finalize/SKILL.md     0
```

`0` = renders MAIN's canonical (which lacks the tier clause). For contrast, at the same instant
MAIN's `commands/kaola-workflow-finalize.md` = 0 and the WORKTREE's = 1.

| Closing check | Result |
|---|---|
| `sync-opencode-edition --forge=github --check` from MAIN | 14 agent(s) + 3 command(s) + 1 plugin(s) in parity — **exit 0** |
| `sync-kimi-edition --forge=github --check` from MAIN | 14 role skill(s) + 3 command skill(s) + 2 hook file(s) in parity — **exit 0** |
| probe artifacts (`find … -name 'zz-*'`) | **none** |
| `git status --short` in MAIN | only `?? kaola-workflow/bundle-995-996-997/` |

No tracked file modified in Part IV; nothing committed; the frozen sync scripts were not touched.
