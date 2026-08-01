# m-edition-pointer — provenance of `.opencode/` + `.kimi/`, and the dead `docs/mission-list.md` pointer

Commit: `3e2019f6` · main · clean working tree at start (only `?? kaola-workflow/bundle-896-897-898/`).
All measurements below are commands actually run in `/Users/ylpromax5/Workspace/Kaola-Workflow`.

---

## VERDICT

**COSMETIC — the dead pointer does not ship, and never could.** Answer (a) to question 1, with no
ambiguity: `.opencode/**` and `.kimi/**` are **gitignored, untracked local build products**,
regenerated from the canonical routing surfaces by `install-opencode.sh` / `install-kimi.sh`
*before* anything is copied to a user.

Three independent measurements, any one of which is decisive:

1. **Zero tracked files.** `git ls-files` returns nothing for all six trees; `git check-ignore -v`
   names `.gitignore:5 .opencode/`, `.gitignore:6 .kimi/`, `.gitignore:9 .opencode-*/`. A fresh
   clone does not contain these files at all.
2. **Zero packaged files.** `npm pack --dry-run` ships 273 files, **0** of them under `.opencode`
   or `.kimi`. The `files` field lists `agents/ commands/ plugins/ scripts/ install-*.sh …` — the
   canonical sources — never a generated tree.
3. **Regenerated at install.** Both installers run `sync-<edition>-edition.js --check`, and on
   failure `--write`, before the copy. The stale tree was detected and would have been rewritten.

The stale copy existed only on this box, as a leftover build artifact from before #892 landed.

**#892 is complete.** Its CHANGELOG claim (line 48) — *"The dead pointer reached twelve installed
`next` surfaces across four runtimes"* — is accurate and describes **installed** surfaces
(3 forges x 4 runtimes = 12). Six of those twelve are rendered at install time from canonical;
#892 fixed canonical, so all twelve now render clean.

**Self-disclosure:** running the two edition suites (step 3 below) executed their `--write`
preamble, which regenerated all six on-disk trees. The dead pointer is now gone from disk. **No
tracked file changed** — `git status --porcelain` is byte-identical to session start. The staleness
I measured in steps 1–2 is reproducible on any box by reverting `.opencode/command/workflow-next.md`
to its pre-#892 content; it is not reproducible from a clean clone, because a clean clone has no tree.

---

## THE INSTALL TRACE

### Step 1 — the installer resolves a SOURCE_TREE, then refreshes it

`install-opencode.sh:134-143` (identical shape at `install-kimi.sh:122-130`):

```bash
# The generated tree this forge deploys FROM: .opencode for github, .opencode-<forge> otherwise.
SOURCE_TREE="$SCRIPT_DIR/.opencode$FORGE_SUFFIX"

# Always ensure the in-repo generated tree is fresh before copying from it (install only — an
# uninstall removes by source filename and must not regenerate the repo tree).
if [[ "$UNINSTALL" -ne 1 ]]; then
  echo "Kaola-Workflow · opencode edition ($FORGE) — refreshing generated tree..."
  node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --forge="$FORGE" --check >/dev/null 2>&1 \
    || node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --forge="$FORGE" --write >/dev/null
fi
```

This is the decisive line pair. `--check` exits non-zero on staleness, so `--write` runs, so the
tree is canonical **before** the copy. Both installers are `set -euo pipefail`
(`install-opencode.sh:61`, `install-kimi.sh:45`), so a failed `--write` aborts the install rather
than deploying stale content.

### Step 2 — the refresh renders from the routing registry, not from a hand-maintained tree

`sync-opencode-edition.js` `writeCommands()`:

```js
for (const file of listCanonCommands(forge)) {
  const canon = fs.readFileSync(canonCommandPath(file, forge), 'utf8');
  const out = renderCommand(canon, forge, treeLabel(forge) + '/command/' + file);
```

`canonCommandPath` → `forgeLayout.commandSources(forge)` → `runtime-edition-forge.js`:

```js
function commandSources(forge) {
  assertForge(forge);
  return routing.commandSurfacesForForge(forge).map(row => ({ ... }));
}
```

Measured: `routing.commandSurfacesForForge('github')` returns `commands/workflow-next.md`,
`commands/workflow-init.md`, `commands/kaola-workflow-finalize.md` — the **tracked** Claude
surfaces, which are themselves `--check`ed by `generate-routing-surfaces.js` in every chain.
So the runtime editions render from the same byte-checked surfaces the Claude/Codex editions ship.

Canonical `commands/workflow-next.md` contains **no** `docs/mission-list.md` (verified by grep;
only two `kaola-workflow/{project}/mission-list.md` occurrences, at lines 10 and 133).

### Step 3 — proof the staleness was real and detected

```
$ node scripts/sync-opencode-edition.js --forge=github --check
sync-opencode-edition[github]: PARITY FAILED (2 file(s)):
  - .opencode/command/workflow-init.md — stale — regenerate
  - .opencode/command/workflow-next.md — stale — regenerate
exit=1

$ node scripts/sync-kimi-edition.js --forge=github --check
sync-kimi-edition[github]: PARITY FAILED (2 file(s)):
  - .kimi/skills/workflow-init/SKILL.md — stale — regenerate
  - .kimi/skills/workflow-next/SKILL.md — stale — regenerate
exit=1
```

### Step 4 — what regeneration produces (rendered read-only into the scratchpad)

Rendered via the module's exported `renderCommand` / `canonCommandPath` into
`/private/tmp/.../scratchpad/render/opencode/`, then diffed against the checked-in tree. **Nothing
was written into the repo for this step.** The `workflow-next.md` diff replaces exactly the dead
paragraph:

```diff
-An H1 carrying the goal in one line, then one item per mission. The format — the four fields, the
-three write moments, and how to resume from it — is `docs/mission-list.md`; read it there rather
-than reconstructing it from memory.
+An H1 carrying the goal in one line, then one item per mission:
+
+```markdown
+# <the goal, one line>
+ ... (fenced example + four-field table + the two order/absence facts) ...
```

That is precisely #892's "renders onto the surfaces themselves" change. The rendering path works.

---

## FULL FILE INVENTORY

### Files that carried `docs/mission-list.md` (before regeneration) — 6, all untracked

| file | tracked | packaged | live reader |
|---|---|---|---|
| `.opencode/command/workflow-next.md:136` | no | no | repo-scope opencode self-dev only |
| `.opencode-gitlab/command/workflow-next.md:136` | no | no | none (staging) |
| `.opencode-gitea/command/workflow-next.md:136` | no | no | none (staging) |
| `.kimi/skills/workflow-next/SKILL.md:137` | no | no | none (staging) |
| `.kimi-gitlab/skills/workflow-next/SKILL.md:137` | no | no | none (staging) |
| `.kimi-gitea/skills/workflow-next/SKILL.md:137` | no | no | none (staging) |

Tracked-file census for all six trees — `git ls-files <dir> | wc -l`:

```
.opencode          tracked=0  ondisk=3458   (3458 = agent/command/hooks/plugins + node_modules)
.opencode-gitlab   tracked=0  ondisk=19
.opencode-gitea    tracked=0  ondisk=19
.kimi              tracked=0  ondisk=19
.kimi-gitlab       tracked=0  ondisk=19
.kimi-gitea        tracked=0  ondisk=19
```

Per the memory note *"a gitignored path can hold tracked files"* — checked explicitly here; it does
not. All six are pure build output.

### Every `docs/` path referenced anywhere under the six edition trees

Swept with the dot-directories **named explicitly** (this box's `grep` is ugrep and skips dot-dirs;
a bare `grep -r … .` would have measured nothing):

Before regeneration: `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`,
**`docs/mission-list.md`** (MISSING), `docs/README.md`, `docs/workflow-state-contract.md`.

After regeneration: `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/README.md`
— **all four resolve**. Both dropped entries were #892's doing: `docs/mission-list.md` is the fix,
and `docs/workflow-state-contract.md` was removed from the consumer Documentation Map deliberately
(CHANGELOG lines 51-52: *"another file a consumer repository does not have"*).

### The genuinely shipped surfaces — `commands/ agents/ plugins/ templates/`

Every `docs/` path referenced resolves in this repo:

```
OK  docs/agents-source.md      OK  docs/api.md
OK  docs/architecture.md       OK  docs/conventions.md
OK  docs/decisions/0017-the-mission-list.md
OK  docs/README.md             OK  docs/workflow-state-contract.md
```

**Zero dead `docs/` pointers on any tracked surface.** (Note: `docs/workflow-state-contract.md` and
`docs/agents-source.md` resolve *here* but are repo-internal docs; whether a consumer-facing surface
should name them at all is the #892 concern, and #892 already removed the one consumer-scaffold
instance. The remaining references are on maintainer-facing surfaces.)

---

## GUARD COVERAGE

**A guard exists and is armed — but it is unreachable from any test chain.**

| mechanism | detects staleness? | invoked by |
|---|---|---|
| `sync-opencode-edition.js --check` | **YES** — named both files, exit 1 | `install-opencode.sh:141` only |
| `sync-kimi-edition.js --check` | **YES** — named both files, exit 1 | `install-kimi.sh:128` only |
| `test-opencode-edition.js` | **NO** — passed green (490 assertions) while stale | `test:kaola-workflow:editions` |
| `test-kimi-edition.js` | **NO** — passed green (505 assertions) while stale | `test:kaola-workflow:editions` |
| `generate-routing-surfaces.js --check` | no — registry is the 18 Claude/forge surfaces | all four chains |
| `validate-workflow-contracts.js` | no — **0** occurrences of `.opencode`/`.kimi` | claude chain |
| `kaola-workflow-prose-census.js` | no — **0** occurrences of `.opencode`/`.kimi` | — |
| `simulate-workflow-walkthrough.js` | no — renders in memory, never reads the tree | all four chains |

**Why the suites are green on a stale tree**, measured: both suites regenerate before asserting.
`test-opencode-edition.js:45-56` (`test-kimi-edition.js:62-71` identical):

```js
const r = spawnSync(process.execPath,
  [path.join(REPO, 'scripts', 'sync-opencode-edition.js'), '--write'], { encoding: 'utf8' });
if (r.status !== 0) { console.error('FATAL: sync-opencode-edition --write failed …'); process.exit(1); }
```

The suite's own comment states the intent: *"In a clean worktree `.opencode/` is fully absent (it is
gitignored); sync `--write` populates … This makes the suite green from tracked sources alone with
no manual seeding."* The later `--check` assertion at `test-opencode-edition.js:996` is an
**arming proof for a different guard** (a transient unregistered plugin file), run *after* the
`--write`, so it tests idempotency, not freshness.

**No npm script runs the runtime-edition parity check.** `grep -c 'sync-opencode-edition\|sync-kimi-edition' package.json` = **0**. The only callers are the two installers and the two suites' self-healing preamble.

**This is deliberate and documented.** `simulate-workflow-walkthrough.js:9422-9428`:

> *"WHY THE GENERATED TREES ARE RENDERED, NOT READ. They are gitignored and absent from a fresh
> checkout and from every worktree, so a disk read would face a choice between a permanent false red
> and a skip-when-absent — and a check that quietly enforces nothing when its subject is missing is
> the defect this extension exists to remove. Rendering is the same bytes `sync --check` asserts the
> on-disk tree equals, so the subject is always present and can never be a stale tree."*

So the absence of a guard over the on-disk tree is a **design decision with a stated derivation**,
not a hole. The subject a guard could meaningfully hold is the canonical surface, and that *is*
guarded (`generate-routing-surfaces.js --check`, 18 surfaces, in all four chains).

**The one residual observation** (offered as an observation, not a proposal): nothing anywhere
asserts that a `docs/…` path named by a consumer-facing surface resolves. #892 was found by reading,
not by a check, and an identical future regression would also be found only by reading. Whether that
warrants a mechanism is a `derive additively` question — one observed failure, already fixed.

---

## BLAST RADIUS

**User-visible surfaces carrying a pointer to a file that does not exist: ZERO.**

- **Cloners** — get no edition tree at all (gitignored). 0 surfaces.
- **npm consumers** — tarball contains 0 of the 6 trees. 0 surfaces.
- **`install-opencode.sh` / `install-kimi.sh` users** — the installer regenerates from canonical
  before copying; canonical is clean post-#892. 0 surfaces.
- **`install-all.sh` users** — same installers. 0 surfaces.
- **Kimi at project scope** — deploys to `<project>/.kimi-code/skills/`, *not* `.kimi/`; that
  directory does not exist in this repo. `.kimi/` is pure staging. 0 live readers.
- **opencode at project scope, inside THIS repo** — the **only** real reader. opencode's project
  layout is `<project>/.opencode/{agent,command,…}`, so the repo's own `.opencode/command/workflow-next.md`
  was live for a maintainer doing opencode self-dev here. `install-opencode.sh:258`
  (`if [[ "$SOURCE_TREE" -ef "$layout_root" ]]`) recognises exactly this self-dev case and skips the
  copy — the generated tree already *is* the live one. **1 surface, maintainer-facing, on this box
  only**, and now regenerated.

Blast radius is one stale file on one developer machine, reachable only by a maintainer running
opencode inside this checkout, and self-healing on the next install or edition-suite run.

**Current state (verified):**

```
$ grep -rn "docs/mission-list.md" .opencode .opencode-gitlab .opencode-gitea .kimi .kimi-gitlab .kimi-gitea
grep exit=1   (no matches)

$ for f in github gitlab gitea: sync-{opencode,kimi}-edition --forge=$f --check
all six → exit 0, in parity with canonical

$ git status --porcelain
?? kaola-workflow/bundle-896-897-898/      (unchanged from session start)
```

Nothing to fix. No tracked file was modified during this investigation.
