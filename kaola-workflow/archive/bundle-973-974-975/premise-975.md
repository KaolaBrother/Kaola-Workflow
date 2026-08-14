# Premise check — issue #975: a fixture symlink loop in the live worktree

**Role:** investigator (read-only on tracked files; every write ran in a throwaway clone).
**Commit under test:** `69264936` (`main`, clean).
**Probe clone:** `git clone /Users/ylpromax5/Workspace/Kaola-Workflow <scratch>/probe` → same SHA, clean.
**Box:** darwin 25.6.0, node v24.14.0, `codex` present. **`timeout` and `gtimeout` do not exist here** —
I wrote a perl replacement (`<scratch>/kwtimeout`) and validated it before trusting any bound:
`exit 7 → 7`, `while :; do :; done → 124`, `echo → 0`.

**Headline:** the issue's *observation* is accurate and its *mechanism* claims are half right. The
scope-computation claim (item 4) reproduces exactly. The two claims the issue leans on hardest —
"nothing detected it" and "a recursive walk trips on this" — are **both refuted by measurement**, and
the truth in each case is more interesting than the claim. No suite in this repository can produce
the artifact; no code in this repository can.

---

## 1. Find the culprit by reproduction — **QUALIFIED** (refuted for every suite; mechanism found)

**Claim:** a test fixture wrote `plugins/plugins` into the live checkout; culprit unknown, "do not
assume it is `test-install-all.js`".

### 1a. Nine suites, run one at a time, before/after — nothing escapes

Each run: `git status --short --untracked-files=all` and `find . -type l` captured before and after,
diffed. Harness at `<scratch>/probe-suite.sh`.

| Suite | Exit | Result line | New untracked | New symlinks |
|---|---|---|---|---|
| `scripts/test-install-all.js` | 0 | `install-all contract test passed (254 assertions).` | (none) | (none) |
| `scripts/test-install-adaptive-config.js` | 0 | `Install adaptive-config tests passed` | (none) | (none) |
| `scripts/test-install-manifest-single-source.js` | 0 | `PASSED` | (none) | (none) |
| `scripts/test-install-upgrade-rewrite.js` | 0 | `Install upgrade rewrite tests passed` | (none) | (none) |
| `scripts/test-edition-sync.js` | 0 | `edition-sync tests passed (30 assertions)` | (none) | (none) |
| `scripts/test-install-model-rendering.js` | 0 | `Install model rendering tests passed` | (none) | (none) |
| `scripts/test-opencode-edition.js` | 0 | `opencode-edition test passed (631 assertions).` | (none) | (none) |
| `scripts/test-kimi-edition.js` | 0 | `kimi-edition test passed (589 assertions).` | (none) | (none) |
| `scripts/test-agent-profile-parity.js` | 0 | `agent-profile parity tests passed (808 assertions)` | (none) | (none) |
| `scripts/test-uninstall-forge-branches.js` | 0 | `Uninstall forge-branch tests passed` | (none) | (none) |

`plugins/` held exactly 3 entries after every run. **`test-install-all.js` is cleared — the issue's
own caution was correct.**

### 1b. No Node code *can* produce this artifact — two independent exclusions

The artifact's shape is `DIR/basename(SRC)`: a link created *inside* an existing directory. That is
`ln(1)` behaviour, and it is **not** `fs.symlinkSync` behaviour.

```
$ node -e 'fs.symlinkSync(process.cwd()+"/plugins", "plugins")'
node symlinkSync -> EEXIST EEXIST: file already exists, symlink '.../plugins' -> 'plugins'
node produced NO plugins/plugins
```

`fs.symlinkSync` **throws EEXIST** rather than descending into the directory. That one measurement
excludes all ~35 `symlinkSync` call sites in `scripts/` at once.

Second exclusion — there is no `ln` anywhere:

```
$ git grep -nP "(^|[;&|(\s\"'])ln\s+-" -- scripts/ install*.sh templates/
(end of ln sweep)          # zero hits
```

The only `ln -s` string in the whole repo is prose inside an archived 2026-07 evidence file.
**Conclusion: no code path in this repository can create `plugins/plugins`.**

### 1c. Two shell shapes reproduce it exactly

```
### B: ln -s "$REPO/plugins" "$MIRROR/plugins" run when ./plugins already resolves to a directory
rc=0                                    # SILENT
plugins/plugins -> /private/tmp/.../repo/plugins        # wrote THROUGH the link into the real repo

### E: ln -s plugins plugins/     (from the checkout root)
rc=0                                    # SILENT
plugins/plugins -> plugins
```

Leg B is the scratch-mirror shape: build a mirror by symlinking each top-level repo entry, run the
loop a second time (or against a mirror dir that already has `plugins`), and the second `ln` follows
the existing `plugins` link and lands **inside the real repo**. That is literally "a fixture wrote
outside its sandbox into the live worktree", and it is silent — `rc=0`, no output.

Leg E is the relative form. **The two surviving records disagree on which one happened**:
`.cache/doc-updater.md:117` says `plugins/plugins -> .../plugins` (elided prefix ⇒ absolute target ⇒
leg B); the issue and `.cache/run-gaps-manual.md:10` say `-> plugins` (relative ⇒ leg E). Nobody
recorded `readlink`, so this is now unrecoverable.

### 1d. Who was running at 01:59

`kaola-workflow/archive/bundle-969-970-971-972/.cache/dispatch-log.jsonl` (UTC; the box is UTC+8, so
01:59 local = 17:59Z):

```
2026-08-12T17:53:56Z | tests-972
2026-08-12T17:54:19Z | impl-972
2026-08-12T18:01:34Z | impl-969
```

**`tests-972` and `impl-972` were the live dispatches at 17:59Z** — the install-all content-comparison
work, exactly as the issue says. Corroborating, from their own reports:

- `impl-972.md:448` — "Scratch mirror (symlinked tree, real copies of `install-all.sh` and the suite)"
- `review-972.md:118` — probed "symlink-vs-materialized-file", "symlink-on-both-sides"

**Verdict: the escape was an ad-hoc `ln -s` in an agent's own verification shell, not a suite.** That
matters for the fix: a sandbox-root assertion added to the suites would not have caught this one,
because the suites were never the writer.

### 1e. The empty/relative-root hypothesis — measured on its own, and it is real but wrong-shaped

The issue guesses "a path built from a root that was empty or relative". Measured:

```
TMPDIR unset  -> os.tmpdir() = "/tmp"          SAFE
TMPDIR=""     -> os.tmpdir() = "/tmp"          SAFE  (empty does NOT propagate)
TMPDIR="."    -> os.tmpdir() = "."             HAZARD
TMPDIR=relroot-> os.tmpdir() = "relroot"       HAZARD
mkdtempSync(path.join(".","kaola-probe-")) -> "kaola-probe-IIg2yg"   (relative, lands in cwd)
```

So I ran the suite that way, with a 40 ms poller watching the checkout root:

```
$ cd <probe> && TMPDIR=. node scripts/test-install-all.js
install-all contract test passed (254 assertions).   exit 0
--- transient dirs observed in the CHECKOUT ROOT during the run ---
kaola-install-all-test-g0Gh8G, kaola-install-all-claude.p7yz7z, kaola-install-all-codex.4t0vGv, ...
(81 seen)
--- untracked delta after the run ---
(none)
```

**81 fixture roots land directly in the checkout root**, each containing `plugins/kaola-workflow/`,
and `cleanup()` deletes every one — so a before/after `git status` sees nothing. A real escape, and
an invisible one. But it is `kaola-install-all-test-XXXXXX/`, never `plugins/plugins`. **This is a
separate latent defect, not the cause of #975.**

Two mitigations, both measured, that bound how far this can go:

- `scripts/kaola-workflow-run-chains.js:326` — `fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-chain-')))`
  then `TMPDIR: tempRoot` for every chain child (`:331-333`). `realpathSync` absolutizes:
  raw `"kw-chain-sd796B"` (relative) → `"/private/tmp/.../kw-chain-sd796B"` (absolute). **Suites run
  under a chain cannot inherit a relative TMPDIR.** The exposure is a bare `node scripts/test-*.js`.
- Nobody sets a relative `TMPDIR` in this repo; I had to do it by hand.

---

## 2. Root-construction hazard sites — **the shell and Node halves behave oppositely**

A finding the issue could not have had, because it assumed one hazard shape covers both languages:

```
Node:   path.join("", "plugins", "x")  =  "plugins/x"      RELATIVE, silent
        path.join(undefined, "plugins") -> ERR_INVALID_ARG_TYPE (throws, loud)
Shell:  EMPTY=""; "$EMPTY/plugins"     =  "/plugins"       ABSOLUTE at the filesystem root
        ln -s "$PWD/plugins" "$EMPTY/plugins" -> "ln: /plugins: Read-only file system"  rc=1
```

**An empty root in shell is loud and harmless; an empty root in Node is silent and lands in cwd.**
The issue's `path.join(maybeUndefined, ...)` shape actually *throws*; the dangerous shape is
`path.join("", ...)` and `os.tmpdir()` returning a relative value.

Every site where a filesystem root is computed and then written under, in the marketplace/plugin
fixture code:

| Site | Code | Can it come back relative? |
|---|---|---|
| `scripts/test-install-all.js:175` | `const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-all-test-'));` | **Yes** — only via relative `TMPDIR`; measured, 81 dirs in cwd |
| `scripts/test-install-all.js:137` | `const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-all-guard-'));` | Same |
| `scripts/test-install-all.js:353` | `const treePluginPath = path.join(root, 'plugins', pluginDir);` | Inherits `root` from `freshRoot()`; `pluginDir` defaults `'kaola-workflow'`, never `''` |
| `scripts/test-install-all.js:383` | `sourcePluginPath = path.join(marketplaceRoot, 'plugins', pluginDir);` | `marketplaceRoot = freshRoot()` — same inheritance |
| `install-all.sh:233` | `logf="$(mktemp "${TMPDIR:-/tmp}/kaola-install-all-$name.XXXXXX")"` | **Yes** — `:-` guards empty, not relative. This is *production* code, and it is what put `kaola-install-all-claude.XXXXXX` in the checkout root in my TMPDIR=. run |
| `install-all.sh:303` | `flagdir="$(mktemp -d)"` | Same TMPDIR dependence |
| `install-all.sh:339` | `outfile="$(mktemp)"` | Same |
| `scripts/kaola-workflow-run-chains.js:326` | `fs.realpathSync(fs.mkdtempSync(...))` | **No** — `realpathSync` absolutizes; measured |

One site I checked and am **clearing**, because it looks alarming and is not: the stub codex CLI does
`rm -rf "$dest"` where `dest="$CACHE_ROOT/$MARKET/$NAME/$ADD_VERSION"` (`scripts/test-install-all.js:303-305`).
`CACHE_ROOT` is `codexCacheRoot(cfg.homeRoot)` — an absolute fixture path (`:251`); `MARKET` and `NAME`
are non-empty constants (`:274-275`). It cannot collapse toward `/`.

---

## 3. The cycle guard — **REFUTED**, on two independent grounds

**Claim:** "A self-referential symlink is the exact shape a recursive walk trips on … a plausible way
to hang or mis-report a walk that has no cycle guard."

The walk, extracted verbatim from `install-all.sh:387-406` (`codex_cache_content_state`, function at
`:383`):

```js
const walk = (root, rel, out) => {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) walk(root, r, out);
    else if (e.isFile()) out.set(r, fs.statSync(path.join(root, r)).size);
  }
  return out;
};
```

**There is no explicit cycle guard** — no visited-inode set, no depth cap, no `realpath` check, no
`-P`/`-L` discipline. The issue is right about that. It is wrong that this matters.

### 3a. Measured: no loop shape hangs or mis-reports

Every leg bounded at 30 s by the validated wrapper. Control first.

| Leg | Fixture | Result | Exit |
|---|---|---|---|
| Control | `A` vs `B`, identical, no symlinks | `same` | 0 |
| Self-referential inside the tree | `C/sub/sub -> sub` vs loop-free `A` | `same` | 0 |
| Loop onto the walked root | `D/loop -> .` (classic infinite shape) | `same` | 0 |
| Exact observed shape | `with/with -> with` vs identical `without/` | `same` | 0 |

No hang; every leg returned immediately. And note what "same" means in legs 2–4: the loop-bearing
tree compares **equal** to the loop-free tree — the symlink contributes nothing at all.

### 3b. Why — proven, not inferred

```
$ node -e 'for (const e of fs.readdirSync(dir,{withFileTypes:true})) ...'
"kaola-workflow" isDirectory= true  isFile= false isSymbolicLink= false
"with"           isDirectory= false isFile= false isSymbolicLink= true
```

`Dirent` uses **lstat** semantics. A symlink answers `false` to *both* `isDirectory()` and
`isFile()`, so the `if / else if` takes **neither** branch and the entry is skipped. The walk never
follows a symlink, so no cycle is reachable by construction. This is a structural guard, not an
absent one — though nothing in the code says so, which is why the issue read it as missing.

### 3c. `plugins/plugins` was never in the walked tree anyway

The walk's root is the row's `source.path`. Read off the live install:

```
$ codex plugin list --json
{ "pluginId": "kaola-workflow@kaolabrother-kaola-workflow", "version": "7.8.0",
  "sourcePath": "/Users/ylpromax5/Workspace/Kaola-Workflow/plugins/kaola-workflow",
  "mktType": "local", "mktSource": "/Users/ylpromax5/Workspace/Kaola-Workflow" }
```

`source.path` is the **plugin directory**, so `<repo>/plugins/plugins` is its *sibling* — outside the
walk entirely. Two independent reasons the loop could not have affected the comparison.

**The residual finding, which is the opposite of the issue's:** symlinks are *invisible* to this
walk, so a symlink appearing inside `plugins/kaola-workflow/` would be silently uncounted on both
sides. `review-972.md:144-146` already logged this as a watch item with the measured trigger ("zero
symlinks in the live tree"). A cycle guard would not address it; a symlink *policy* would.

There is a second copy of the same walk with the same skip semantics at
`scripts/test-install-all.js:479-489` (`dirsEqual`) — cosmetically divergent (`path.join(rel, e.name)`
vs `rel + "/" + e.name`), same immunity.

---

## 4. Did run-chains really classify it as an edition path? — **SURVIVES on mechanism, QUALIFIED on evidence**

### 4a. Mechanism — reproduced exactly

Untracked paths **are** unioned into the changed set (`scripts/kaola-workflow-run-chains.js:669-676`):

```js
const others = spawnSync('git', ['-C', cwd, 'ls-files', '--others', '--exclude-standard', '-z'], ...);
const untracked = (others.status === 0 && !others.error) ? adaptiveSchema.splitNulPaths(others.stdout) : [];
return [...new Set([...tracked, ...untracked])];
```

and any `plugins/` prefix is edition-coupling (`:742`): `if (p.indexOf('plugins/') === 0) return true;`

Planted the artifact in the probe clone and ran the real exported functions:

```
$ ln -s plugins plugins/ ; git status --short --untracked-files=all
?? plugins/plugins
$ git ls-files --others --exclude-standard | wc -l
1                                      # git does NOT recurse through the loop

$ node -e '...require("./scripts/kaola-workflow-run-chains.js")...'
isEditionCouplingPath("plugins/plugins") = true
computeChangedFiles includes plugins/plugins? -> true
classifyScope = {
  "decision": "all-four", "reason": "edition_coupling",
  "touchedEditionPaths": [ "plugins/plugins" ],
  "changedFileCount": 1, "chains": ["claude","codex","gitlab","gitea"]
}
```

**Exactly as the issue describes**, including the classification as an edition-coupling path. Nothing
objected because nothing is *supposed* to: this code answers "which chains must run", and its correct
answer for an unknown `plugins/` path is "all four". It is fail-closed working as designed.

### 4b. The receipt evidence does not survive

The issue cites the receipt. The archived receipt
`kaola-workflow/archive/bundle-969-970-971-972/.cache/chain-receipt.json` (`headSha 9b6fac01`) has
**24 entries in `touchedEditionPaths` and `plugins/plugins` is not among them**; `changedFileCount: 38`.
The root `.cache/chain-receipt.json` is older still (`headSha d5165f7c`, mtime 2026-08-12 10:32,
`reason: no_project_context`). The receipt was re-run after the link was gone, so the cited artefact
no longer exists. **The mechanism reproduces; the quoted evidence does not.** Cite 4a, not the receipt.

---

## 5. Does anything already report untracked files at finalize? — the claim "nothing detected it" is **REFUTED**

Four existing sites see the path **by name**. Measured against the planted symlink, with a negative
control:

```
                                       WITH the symlink            WITHOUT (control)
treeDirty(root, [])                    true                        false
probeImplementationCommit(root,"main",[])
                                       {"state":"missing",         {"state":"not_applicable",
                                        "paths":["plugins/plugins"]} "paths":[]}
```

| Site | Code | What it does with it |
|---|---|---|
| `scripts/kaola-workflow-claim.js:669-704` | `treeDirty()` | boolean only — never names the path |
| `scripts/kaola-workflow-claim.js:3664-3676` | `probeImplementationCommit()` | **names it** (measured above) |
| `scripts/kaola-workflow-claim.js:4207-4224` | `checks.dirty_paths` — `finalize --check` envelope field | **names it**; filter is `!p.startsWith('kaola-workflow/') && !authored.has(p)`, which `plugins/plugins` passes |
| `scripts/kaola-workflow-claim.js:5211-5225` | finalize transaction residue probe | **pushes it into `residue`**, then `git add -A -- ...residue` at `:5272` |

Visibility is not the problem — `git status --porcelain` (the exact default-`-u` form these sites run)
lists it, uncollapsed, because `plugins/` holds tracked files:

```
$ git status --porcelain
?? plugins/plugins
$ mkdir newdir && touch newdir/x.txt && git status --porcelain | grep newdir
?? newdir/                     # positive control: a wholly-untracked dir IS collapsed
```

### The finding the issue inverted

The current behaviour is not "no detection". It is **silent adoption**. I ran the operative call:

```
$ git add -A -- plugins/plugins
rc=0
A  plugins/plugins
$ git ls-files --stage plugins/plugins
120000 f4f388c888a5a4c57bd53860c8ff9ddd823531a4 0   plugins/plugins
```

Mode `120000` — the symlink stages cleanly. **Had the link still been present when finalize ran, the
residue probe would have committed the loop into the repository** as part of `chore: finalize`. It
was not (`git log --all -- plugins/plugins` → empty, never committed), because it had already been
removed by hand. That was luck, not a guard.

`templates/routing/finalize.skeleton.md` (462 lines) contains **zero** `git status` / `untracked` /
`ls-files` references — the prose surface asks the orchestrator for nothing here. `init.skeleton.md:43,533`
and `next.skeleton.md:86` both run `git status --short --branch`; finalize does not.

**Reuse-before-adding candidate:** `checks.dirty_paths` (`claim.js:4207-4224`) is the existing,
documented, envelope-surfaced list. It already contains exactly this path. What it lacks is any way
to distinguish a foreign artefact from the run's own legitimate implementation dirt — during the 969
run it would have been one line among 38 changed files. That is the real gap, and it is a
*classification* gap, not a *reporting* gap.

---

## 6. Does the split hold? — **partly, and not along the line the issue drew**

Reporting, not choosing.

- **Cycle guard — dead.** Measured refuted twice over (§3a symlinks are skipped; §3c the path is not
  in the walked tree). Nothing to fix. Anything built here would be a mechanism for a failure class
  that cannot occur — the "recorded, not built" case.
- **Fixture sandboxing — real, but it would not have caught #975.** No suite wrote the artefact (§1a,
  §1b); an agent's shell did. A sandbox-root assertion inside the suites addresses the *relative-TMPDIR*
  escape of §1e, which is a genuine latent defect with its own reproduction — and a different one.
- **Finalize-time reporting — real, and the sharpest of the three**, but the requirement is not the
  one the issue states. Reporting already exists (§5); what is missing is telling foreign dirt from
  the run's own. And the live behaviour is worse than "unnoticed": it stages.

So the two halves that survive are **(a) the relative-root escape** and **(b) foreign-vs-own dirt
classification at finalize**, and they are genuinely independent — different files, different
triggers, no shared mechanism. Neither is the pair the issue predicted. Whether #975 should carry
both, one, or be rewritten around the measured cause is the orchestrator's call; I note only that the
issue's own **SPECIFY THE RESULT** line ("a test fixture cannot leave artifacts in the working
checkout, or a run notices when one is there") has a false premise in its first clause for this
instance — the writer was not a test fixture.

---

## Facts the issue did not have

1. **No code in this repository can produce the artefact.** `fs.symlinkSync` throws `EEXIST` instead
   of creating `DIR/basename` (measured), and there is not one `ln -` invocation in `scripts/`,
   `install*.sh` or `templates/` (measured). The writer was an ad-hoc shell command.
2. **`tests-972` and `impl-972` were the live dispatches at 17:59Z = 01:59 local** (dispatch log),
   and both reports independently describe symlink work — `impl-972.md:448` a "scratch mirror
   (symlinked tree)", `review-972.md:118` a "symlink-on-both-sides" probe.
3. **The walk is loop-immune by construction.** `Dirent.isDirectory()` and `isFile()` are *both* false
   for a symlink, so neither branch fires. Three loop shapes, including `loop -> .`, all returned
   `same` well inside a 30 s bound.
4. **`plugins/plugins` was never inside the walked tree** — the live row's `source.path` is
   `.../plugins/kaola-workflow`, making the link a sibling.
5. **Finalize would have committed it.** `git add -A -- plugins/plugins` exits 0 and stages mode
   `120000`; the residue probe feeds exactly that call. Not "undetected" — *adopted*.
6. **`probeImplementationCommit` names the path today**, with a clean negative control.
7. **Empty roots are safe; relative roots are not** — and the two languages disagree: `path.join("", …)`
   is silently relative while `"$EMPTY/…"` is a loud `/…`. `TMPDIR=""` and unset both resolve to `/tmp`.
8. **A separate, live escape exists:** `TMPDIR=.` puts **81 fixture roots** into the checkout root
   during `test-install-all.js`, each with `plugins/kaola-workflow/`, all self-deleted at cleanup so
   no before/after check can see them. `install-all.sh:233` (production) participates.
9. **`run-chains` already immunises chain runs** — `realpathSync(mkdtempSync(...))` absolutizes before
   `TMPDIR` is handed to children (`:326-333`), measured. The exposure is bare `node scripts/test-*.js`.
10. **The receipt no longer holds the quoted evidence** — the archived receipt's 24
    `touchedEditionPaths` do not include `plugins/plugins`; it was re-run after removal.
11. **The record disagrees with itself on the link target** — `doc-updater.md:117` implies absolute,
    the issue and `run-gaps-manual.md:10` say relative. Two different `ln` shapes; unrecoverable now.
12. **`doc-updater.md:117-124` also disagrees on the removal**: it records the link as already gone
    when that pass finished (~18:24Z), attributed to "some other agent", where the issue says it was
    removed by hand at finalize.

---

## Open — what I did not measure, and why

- **I did not run a full `finalize` transaction** with the symlink present. §5's staging claim rests
  on the operative `git add -A -- plugins/plugins` run in isolation plus a read of `claim.js:5266-5272`;
  the end-to-end commit is inferred from those two, not observed.
- **`checks.dirty_paths` was measured via `probeImplementationCommit` and by reading the identical
  filter at `:4222`**, not by invoking `finalize --check` (which needs a live claim).
- **Which `ln` shape actually ran on 2026-08-12 is unrecoverable.** Nobody captured `readlink`, and
  the two surviving records disagree. Both shapes reproduce; I cannot say which.
- **I did not run the walkthrough suite or the four chains.** Nothing in this premise check turns on
  them, and they are the expensive path.

## Safety

Everything that wrote ran in `<scratch>/probe` (a throwaway clone) or `<scratch>/cyc*`, `<scratch>/lnprobe*`.
The probe clone was restored to clean, with no symlinks left.

```
$ git -C /Users/ylpromax5/Workspace/Kaola-Workflow status --short --untracked-files=all
?? kaola-workflow/bundle-973-974-975/.cache/dispatch-log.jsonl
?? kaola-workflow/bundle-973-974-975/.cache/origin/selection-record.json
?? kaola-workflow/bundle-973-974-975/mission-list.md
?? kaola-workflow/bundle-973-974-975/premise-973.md
?? kaola-workflow/bundle-973-974-975/premise-974.md
?? kaola-workflow/bundle-973-974-975/workflow-state.md
$ git -C /Users/ylpromax5/Workspace/Kaola-Workflow rev-parse HEAD
6926493661e1a69c910e50f5a3d82b09af85e4ee     # unchanged
$ ls -la /Users/ylpromax5/Workspace/Kaola-Workflow/plugins/
kaola-workflow  kaola-workflow-gitea  kaola-workflow-gitlab      # 3 dirs, no symlink
```

`premise-973.md` and `premise-974.md` are sibling agents' files, not mine; this report is the only
file I wrote in the repo. The only symlinks in the real checkout are the pre-existing gitignored
`.opencode/node_modules/.bin/*` npm shims — I never ran `npm install`.
