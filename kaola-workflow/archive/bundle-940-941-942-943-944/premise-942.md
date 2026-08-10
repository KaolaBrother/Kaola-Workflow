# Premise check — issue #942 (`scripts/test-opencode-edition.js` drift-check coverage)

Measurement only. No fix proposed, no tracked file edited. Every command below was run verbatim and
its real exit code captured on its own line.

## Setup

- Repo: `/Users/ylpromax5/Workspace/Kaola-Workflow`, branch `main`, HEAD `d2ab06c2800963957d740db1dc9d4f019d0c53b5`
- Working tree at start: clean except the untracked run folder `kaola-workflow/bundle-940-941-942-943-944/`
- Scratch clone: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/e2e7977c-61d4-41bc-a290-3fc8f13cdf1e/scratchpad/fresh`
  (`git clone /Users/ylpromax5/Workspace/Kaola-Workflow fresh`, HEAD `d2ab06c2`), second clone `…/scratchpad/fresh2`
- Node: system `node` on darwin 25.6.0
- `grep` here is ugrep and skips dot-directories; every `.opencode*` lookup below used `git grep -nP`,
  `ls -a | grep '^\.opencode'`, or `git status --ignored`, never a bare recursive `grep`.

### Current state of the three trees in the REAL repo

```
$ ls -d .opencode .opencode-gitlab .opencode-gitea
.opencode
.opencode-gitea
.opencode-gitlab
```

All three are present right now. All three are gitignored, and none contains a tracked file:

```
$ git check-ignore -v .opencode        → .gitignore:5:.opencode/	.opencode          exit=0
$ git check-ignore -v .opencode-gitlab → .gitignore:9:.opencode-*/	.opencode-gitlab   exit=0
$ git check-ignore -v .opencode-gitea  → .gitignore:9:.opencode-*/	.opencode-gitea    exit=0

$ git status --ignored --short | grep -i opencode
!! .opencode-gitea/
!! .opencode-gitlab/
!! .opencode/

$ git ls-files -- '.opencode' '.opencode-gitlab' '.opencode-gitea' | wc -l
0
```

`git status --ignored` (not bare `git status`) is what shows them; bare `git status` reports nothing,
which is exactly why the gitignore claim needed the `--ignored` form.

---

## Claim 1 — "the suite MATERIALIZES the `.opencode-gitlab` and `.opencode-gitea` trees as it runs"

**Verdict: CONFIRMED.**

Fresh clone, none of the trees present:

```
$ cd …/scratchpad && git clone -q /Users/ylpromax5/Workspace/Kaola-Workflow fresh && cd fresh
$ git rev-parse HEAD
d2ab06c2800963957d740db1dc9d4f019d0c53b5
$ ls -a | grep -i opencode
install-opencode.sh
opencode.json          ← no .opencode, no .opencode-gitlab, no .opencode-gitea
```

After one suite run:

```
$ node scripts/test-opencode-edition.js ; echo $?
0
$ ls -a | grep '^\.opencode'
.opencode
.opencode-gitea
.opencode-gitlab
```

**Which site materializes what** (all line numbers in `scripts/test-opencode-edition.js` unless noted):

| site | lines | what it writes |
|---|---|---|
| self-provision preamble, `sync --write` (no `--forge`) | 119–130 | `.opencode` only (default forge `github`) |
| FA3 loop, `sync --forge=<f> --write` for every forge | block 1699–1789, write at **1739** | `.opencode`, `.opencode-gitlab`, `.opencode-gitea` |
| FA9 hermetic install, `bash install-opencode.sh --forge=<f> …` | **1814** | re-materializes each tree via `install-opencode.sh:158-159` (`--check \|\| --write`, `SCRIPT_DIR` = the repo, `install-opencode.sh:63`) |

That the preamble alone does *not* materialize the forge trees was measured directly in a second
fresh clone:

```
$ cd …/scratchpad/fresh2 && node scripts/sync-opencode-edition.js --write | tail -1
sync-opencode-edition[github]: write complete (19 file(s) updated).
$ ls -a | grep '^\.opencode'
.opencode
```

So the first writer of `.opencode-gitlab` / `.opencode-gitea` is the FA3 loop at line 1739, and FA9
at 1814 writes them a second time through the real installer.

---

## Claim 2 — "first run prints SKIPPED, second run prints 3 trees in parity"

**Verdict: PARTIALLY-CONFIRMED.** The two-run shape is exactly as described; the *first* run's line
names **three** absent trees, not two — `.opencode` is absent on a fresh clone too.

### Run 1 (fresh clone, no trees on disk)

```
$ cd …/scratchpad/fresh && node scripts/test-opencode-edition.js > ../run1.out 2> ../run1.err ; echo $?
0
```

stderr was empty (0 bytes). Full stdout, verbatim:

```
D0: SKIPPED — .opencode is absent from disk, so nothing was compared (gitignored generated tree; a fresh clone has none).
D0: SKIPPED — .opencode-gitlab is absent from disk, so nothing was compared (gitignored generated tree; a fresh clone has none).
D0: SKIPPED — .opencode-gitea is absent from disk, so nothing was compared (gitignored generated tree; a fresh clone has none).
opencode-edition test passed (516 assertions). [drift-check: NO tree verified; 3 ABSENT, not checked (.opencode, .opencode-gitlab, .opencode-gitea)]
```

### Run 2 (same checkout, immediately after)

```
$ node scripts/test-opencode-edition.js > ../run2.out 2> ../run2.err ; echo $?
0
```

stderr empty. Full stdout, verbatim:

```
D0: .opencode is present and in parity with canonical.
D0: .opencode-gitlab is present and in parity with canonical.
D0: .opencode-gitea is present and in parity with canonical.
opencode-edition test passed (516 assertions). [drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)]
```

Both runs: exit 0, 516 assertions. The assertion count is identical whether zero or three trees were
drift-checked — D0's skips are not counted as assertions (only the `FORGES.length > 0` assert at
line 79 is), so the count is not a signal of the difference.

Correction to the issue's quoted first-run line: it is not `SKIPPED — absent (.opencode-gitlab,
.opencode-gitea)`. The real line is `NO tree verified; 3 ABSENT, not checked (.opencode,
.opencode-gitlab, .opencode-gitea)`. Run 1 verifies **zero** trees, not one.

---

## Claim 3 — "gitignored so nothing is polluted; a single run verifies one tree not three, while the banner reads as coverage either way"

**Verdict: split — first half CONFIRMED, "verifies one tree" REFUTED (it verifies zero), "the banner
reads as coverage either way" REFUTED.**

### 3a. Nothing is polluted — CONFIRMED

After both runs in the clone, the tracked tree is untouched:

```
$ git status --short
(no output)
$ git status --short | wc -l
0
$ git status --ignored --short
!! .opencode-gitea/
!! .opencode-gitlab/
!! .opencode/
```

The only working-tree effect is the three ignored directories. `opencode.json` (tracked) is
preserved, not rewritten — the write path prints `preserve   opencode.json (user-owned; use
--write-config to overwrite)`.

### 3b. "a single run verifies one tree, not three" — REFUTED as stated

Measured, a single run on a fresh clone verifies **zero** trees (run 1 above). The direction of the
issue's concern is right and in fact stronger than filed: on a fresh clone the drift-check compares
nothing at all, including `.opencode`.

### 3c. "the banner reads as coverage either way" — REFUTED

The two banners are not interchangeable and cannot be confused:

- run 1: `[drift-check: NO tree verified; 3 ABSENT, not checked (.opencode, .opencode-gitlab, .opencode-gitea)]`
- run 2: `[drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)]`

plus three loud per-tree `D0: SKIPPED — … nothing was compared` lines on run 1. Distinguishing these
two states is the block's stated design intent (lines 58–64: *"absence cannot be a failure; but it
cannot be a silent pass either … so 'verified in parity' and 'nothing was on disk to check' can never
print the same thing"*). The measured output matches that intent exactly.

---

## Materialize-vs-check ordering, and what a reorder would do

### Where the check is, structurally

- **D0, the drift-check**: `scripts/test-opencode-edition.js:70–110`. Presence probe `treeRootFor` at
  line 74; per-forge skip at line 83; `sync --forge=<f> --check` spawn at lines 85–87; the
  drift-found path prints and `process.exit(1)` at line 96; verified/absent lines at 100–104; the
  banner string built at 105–109.
- **First materializer after it**: the self-provision `sync --write` at lines 119–130 (`.opencode`),
  then FA3's per-forge `--write` at line 1739 (all three), then FA9's installer at line 1814.

The ordering is **structural, not incidental**, and the file says so in its own words at lines 41–56:
the block is positioned ahead of the write because `--write` repairs the tree and thereby destroys
the evidence, and because exiting before the write is what makes a real finding durable on disk.

### Measured: the reorder would make the check vacuous

I injected drift into the (gitignored, generated) gitlab tree in the scratch clone and measured both
positions.

```
$ printf '\n<!-- INJECTED DRIFT -->\n' >> .opencode-gitlab/agent/investigator.md
$ node scripts/sync-opencode-edition.js --forge=gitlab --check ; echo $?
sync-opencode-edition[gitlab]: PARITY FAILED (1 file(s)):
  - .opencode-gitlab/agent/investigator.md — stale — regenerate
Fix: node scripts/sync-opencode-edition.js --forge=gitlab --write
1
```

**Check-before-write (current position)** — the suite catches it and stops:

```
$ node scripts/test-opencode-edition.js > ../run3.out 2> ../run3.err ; echo $?
1
```

stdout empty (the loop exits before line 100 prints); stderr tail, verbatim:

```
sync-opencode-edition[gitlab]: PARITY FAILED (1 file(s)):
  - .opencode-gitlab/agent/investigator.md — stale — regenerate
Fix: node scripts/sync-opencode-edition.js --forge=gitlab --write

opencode-edition test FAILED: D0[gitlab]: .opencode-gitlab is present on disk and has DRIFTED from canonical (sync --check exit 1).
Regenerate it deliberately: node scripts/sync-opencode-edition.js --forge=gitlab --write
The suite stops here rather than continue into its own sync --write, which would repair this tree and erase the finding.
```

The drift is still on disk after the failed run (`tail -2 .opencode-gitlab/agent/investigator.md`
still shows `<!-- INJECTED DRIFT -->`), i.e. the finding is durable.

**Check-after-write (the reordered position), same drift** — green:

```
$ node scripts/sync-opencode-edition.js --forge=gitlab --write | tail -1
sync-opencode-edition[gitlab]: write complete (1 file(s) updated).
$ node scripts/sync-opencode-edition.js --forge=gitlab --check ; echo $?
sync-opencode-edition[gitlab]: 14 agent(s) + 3 command(s) + 1 plugin(s) in parity with canonical.
0
```

### Answering the question plainly

**Would simply moving the drift-check after materialization make a single run compare all three
trees?** It would make a single run *print* `3 tree(s) in parity`, but the comparison would be
vacuous for every tree: FA3 (line 1739) writes each tree from the same canonical sources the check
compares against, so a post-write `--check` cannot fail — measured directly above, on a tree that was
drifting one command earlier. The reorder buys a reassuring banner and loses the only position from
which drift is observable. It is the failure the block's comment says was already measured once
(490/505 green against a tree whose commands pointed at a deleted file).

**Does any later assertion depend on the trees being absent at drift-check time?** No. I checked
every absence-sensitive site in the suite (`git grep -nP "!fs\.existsSync|!exists\(|absent" --
scripts/test-opencode-edition.js`): line 508 and line 1124 assert that a *specific retired file* is
gone after a write, line 1725 is a `walk()` guard, and D1 (line 139) asserts the default tree
**exists** after the preamble write. None requires prior absence. What the reorder would break is not
an assertion but a property: D0's `process.exit(1)`-before-write (line 96) is what leaves drift on
disk, and after the write there is nothing left to leave.

**A note the issue does not contain:** on a genuinely fresh clone, no reordering can make the
drift-check compare three trees meaningfully. There is no prior artifact to validate — the trees do
not exist until this run creates them, and anything this run creates it created from canonical. The
"one run verifies less than two runs" asymmetry is inherent to checking a generated, gitignored tree,
not a consequence of where the block sits.

### What the drift-check actually compares when it does run

`runCheck(forge)` in `scripts/sync-opencode-edition.js:787–878`, per forge:

- every canonical agent in `agents/*.md` → `<tree>/agent/<name>.md`, re-rendered via `renderAgent`
  and compared byte-for-byte (missing → `missing generated agent`, differing → `stale — regenerate`)
- every canonical command for that forge → `<tree>/command/<file>`, re-rendered via `renderCommand`
- every `HOOK_SCRIPTS` entry → `<tree>/hooks/<script>` byte-compared to `hooks/<script>`
- every `PLUGIN_SCRIPTS` entry → `<tree>/plugins/<script>` byte-compared to
  `templates/opencode/plugins/<script>`, plus the reverse direction (an unregistered `*.js` in
  `templates/opencode/plugins/` is a mismatch)
- retired-surface pruning in both `command/` and `agent/` (`.md` present on disk with no canonical
  source) and retired byte-copied `.sh`/`.js` in `hooks/` and `plugins/`
- tracked `opencode.json` vs `renderOpencodeJson()` — this one is **not** tree-scoped and runs on
  every invocation regardless of tree presence (`sync-opencode-edition.js:864`), and test A7 (line
  635) asserts the same thing unconditionally

Green output shape (from the run above): `14 agent(s) + 3 command(s) + 1 plugin(s) in parity with
canonical.`

---

## Who runs this suite

`git grep -lP "test-opencode-edition" -- ':!CHANGELOG.md' ':!docs/**' ':!kaola-workflow/**'` →
`README.md`, `package.json`, `scripts/sync-opencode-edition.js` (comment), `scripts/test-kimi-edition.js`
(comment), itself.

- **`package.json:45`** — `"test:kaola-workflow:editions": "node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js"`. The only script. It invokes the suite **once**.
- **`README.md:249`** — documents direct invocation `node scripts/test-opencode-edition.js`.
- **Not** in `npm test` (`test` = the four `test:kaola-workflow:{claude,codex,gitlab,gitea}` chains),
  not in `test:full`, not in `test:kaola-workflow:claude:full`.
- **Not** in `scripts/kaola-workflow-run-chains.js` — `git grep -nP "editions|opencode|kimi" --
  scripts/kaola-workflow-run-chains.js` returns nothing; `CHAIN_COMMANDS` (lines 201–204) names only
  the four edition chains.
- **Not** in any installer: `install.sh`, `install-all.sh`, `install-opencode.sh`, `install-kimi.sh`
  never invoke it (they call `sync-opencode-edition.js --check || --write`, a repair position —
  `install-opencode.sh:158-159`).
- **No CI config exists** in this repo (`.github` absent, no `.gitlab-ci.yml`).

Every consumer is therefore a single-run consumer, and every one of them gets the run-1 behaviour on
a machine where the trees are not already on disk (fresh clone, fresh worktree, throwaway container).
On a developer box that has run the suite or an opencode install before, the trees persist and the
run gets the full three-tree check — which is why the real repo shows all three present today.

---

## Summary of verdicts

| claim | verdict |
|---|---|
| 1. Suite materializes `.opencode-gitlab` / `.opencode-gitea` as it runs | **CONFIRMED** (FA3 line 1739; again via FA9 line 1814) |
| 2. Run 1 prints SKIPPED-absent, run 2 prints 3 in parity | **PARTIALLY-CONFIRMED** — shape exact; run 1 names **three** absent trees (incl. `.opencode`), not two |
| 3a. Both trees gitignored, nothing polluted | **CONFIRMED** |
| 3b. A single run verifies one tree, not three | **REFUTED** — it verifies **zero** |
| 3c. The banner reads as coverage either way | **REFUTED** — `NO tree verified; 3 ABSENT, not checked (…)` vs `3 tree(s) in parity (…)`, plus three loud per-tree SKIPPED lines |

## Open / unmeasured

- I did not measure the kimi twin (`scripts/test-kimi-edition.js`, D0 mirror at its line 57), which
  ships in the same `test:kaola-workflow:editions` script and is likely to have the same shape.
- I did not measure whether any *outside* consumer (a user following README) runs the suite twice;
  that is a behavioural question about people, not the repo.
- The real repo's trees were left untouched — every reproduction ran in the scratch clones.
