# Premise check — issue #971 (finalize run-gap sweep resolves the run folder against cwd)

## Setup

- Commit: `7e962bdc` (main, clean except the untracked run folder)
- Trees: main `/Users/ylpromax5/Workspace/Kaola-Workflow`; linked worktree
  `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972`
- Topology confirmed before measuring: `kaola-workflow/bundle-969-970-971-972/` is resident in
  **main only**; the worktree's `kaola-workflow/` carries no such folder. This is the run-time
  topology the issue is about.
- No tracked file was modified. The scanner (which writes) was run **only** inside throwaway git
  repos under the session scratchpad, never against this repository.

## Verdict summary

| # | Claim | Verdict |
|---|---|---|
| 1 | `--check` from the worktree resolves the artifact against cwd | **SURVIVES** (wording qualified) |
| 2 | Re-running the scanner from the worktree does not help | **REFUTED — the truth is worse** |
| 3 | Step 7 carries no cwd guidance at all | **SURVIVES** |
| 4 | Step 4 establishes the worktree; Step 10 wraps twice | **QUALIFIED** (count exact, attribution wrong) |
| 5 | After Step 10's mirror the same command succeeds | **UNMEASURED** (consistent with the code path) |
| 6 | Generated surface: 6 tracked + 6 edition | **QUALIFIED — the numbers are wrong (6 + 2)** |

---

## Claim 1 — cwd-based resolution — SURVIVES

**The resolution, cited.** `scripts/kaola-workflow-gap-sweep.js:476-479`:

```js
  // Resolve repo root (injectable for tests via KAOLA_GAP_ROOT).
  const root = process.env.KAOLA_GAP_ROOT
    ? path.resolve(process.env.KAOLA_GAP_ROOT)
    : process.cwd();
```

Everything derives from that single `root`: `:532` `defaultCacheDir = path.join(root, 'kaola-workflow', project, '.cache')`,
`:534` the artifact, `:537` the summary. There is **no** git-root lookup, **no** `--show-toplevel`,
**no** `--git-common-dir`, and **no** authority-folder helper anywhere in the file. Its only
cross-module call is `:213` `require('./kaola-workflow-adaptive-schema').writeFileAtomicReplace(...)`.

**Reproduced, both trees:**

| Command | cwd | Output | Exit |
|---|---|---|---|
| `node <main>/scripts/kaola-workflow-gap-sweep.js --project bundle-969-970-971-972 --check` | worktree | `gap-sweep: artifact not found at /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972/kaola-workflow/bundle-969-970-971-972/.cache/run-gaps.json; run scanner first` | 1 |
| same | main | `gap-sweep: artifact not found at /Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-969-970-971-972/.cache/run-gaps.json; run scanner first` | 1 |

The worktree run names a path under `.kw/worktrees/…` — correct for cwd, wrong for the run. Claim
holds.

**Two qualifications on the literal wording.**

1. The emitted path is **absolute** (`root` is `process.cwd()`, always absolute). The issue quotes a
   relative form `.kw/worktrees/issue-968/…`. Cosmetic, but a fix that pins the message verbatim
   would pin a string the script never emits.
2. In *this* repo right now, main exits 1 too — neither tree has a `run-gaps.json` yet. The
   worktree/main **differential** therefore cannot be shown from this repo alone. It needed a
   positive control (below), and any test for this must construct the artifact first.

**Positive control** (scratch repo, main + linked worktree, run folder uncommitted in main only —
the real topology):

| cwd | Command | Output | Exit |
|---|---|---|---|
| main | `gap-sweep --project proj-x --check --json` | `{"result":"pass","mapped":0,"filed":0,"noise":0}` | **0** |
| worktree | same | `{"result":"refuse","reason":"artifact_missing","detail":"run-gaps.json not found; run --project proj-x first"}` | **1** |

Same repository, same run folder, same command — pass from main, refuse from the worktree.

---

## Claim 2 — "re-running the scanner from the worktree does not help" — REFUTED

It does change the outcome, and the change is a **false green plus stray residue**, not a persistent
red. Measured in a scratch repo with a **real gap seeded in main's** `.cache/run-gaps-manual.md`
(`gap: flaky-suite — the sink suite went red once`):

| Step | cwd | Output | Exit |
|---|---|---|---|
| scanner | main | `{"result":"swept",…"sweptClasses":[{"reasonClass":"manual:flaky-suite","sample":"the sink suite went red once","count":1}]…}` | 0 |
| `--check` | main | `{"result":"refuse","reason":"gaps_unswept","unmapped":[{"reasonClass":"manual:flaky-suite","sample":"the sink suite went red once"}]}` | **1** |
| scanner | worktree | `{"result":"swept","project":"proj-x","sweptClasses":[],"artifact":"<wt>/kaola-workflow/proj-x/.cache/run-gaps.json"}` | 0 |
| `--check` | worktree | `{"result":"pass","mapped":0,"filed":0,"noise":0}` | **0** |

Three consequences, all measured:

1. The worktree scan reads the **worktree's** `.cache` — which is empty — so it sweeps **zero**
   classes. The real gap seeded in main is never seen.
2. `runScan`'s `fs.mkdirSync(path.dirname(outputPath), { recursive: true })`
   (`kaola-workflow-gap-sweep.js:206`) **creates a stray run folder** in the worktree:
   `<wt>/kaola-workflow/proj-x/.cache/run-gaps.json`, a directory that did not exist there.
3. The gate then takes the vacuous-pass branch (`:370`, `sweptClasses.length === 0` and no
   `## Run gaps` section) and exits **0**.

So the operator who does the natural thing — "it says run the scanner first, so I run the scanner" —
converts a loud red into a **silent green that certifies nothing**, and leaves an untracked folder
behind. The issue's framing understates this: it describes an annoyance, and the measurement shows
an evidence-loss defect. Note the two existing anti-clobber refusals (#675 at `:146`, #679/#681 at
`:177`) do **not** fire here — both are keyed on the archive band and on an explicit `--output`,
neither of which is present on this path.

---

## Claim 3 — Step 7 carries no cwd guidance — SURVIVES

`templates/routing/finalize.skeleton.md:226-249` is the whole Step 7 block. Explicit scan:

```
sed -n '226,249p' templates/routing/finalize.skeleton.md \
  | grep -niE "\bcd\b|main|worktree|root|ACTIVE_WORKTREE_PATH|toplevel|common-dir"
→ (no output)   MATCH_EXIT=1
```

The block's only executable content is the resolver slot plus the bare call:

```bash
<!-- SLOT:fz-scripts-resolver -->
<!-- SPLICE:fz-gapsweep-run -->
```

Confirmed on **what ships**, not just what was authored — `commands/kaola-workflow-finalize.md:209`
renders to `node "$KAOLA_SCRIPTS/kaola-workflow-gap-sweep.js" --project {project} --check`, with no
`cd` and no worktree/main note. The rendered resolver slot contains `root` only inside the variable
name `CLAUDE_PLUGIN_ROOT`, which is a plugin-location lookup, not run-folder guidance.

---

## Claim 4 — Step 4 / Step 10 — QUALIFIED

**The count is exact.** `grep -c 'cd "\$ACTIVE_WORKTREE_PATH"' templates/routing/finalize.skeleton.md`
→ **2**, at lines **310** and **319**:

```bash
(cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize \
  --project {project} --keep-worktree $SINK_KEEP_OPEN_FLAG)
```
```bash
(cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize \
  --project {project} --keep-worktree --check --json)
```

**Step 4 does resolve the variable** — `:162-163`, with `[ -z … ] && ACTIVE_WORKTREE_PATH="$(pwd)"`.

**But the attribution is wrong, and this matters for the fix.** Step 4 resolves the path into a
*variable it passes to a subagent prompt* (`:174` `prompt="… Working directory: ${ACTIVE_WORKTREE_PATH}"`).
It never `cd`s; the operator's own shell is untouched. Two corrections:

- The step that actually establishes where the operator stands is **Step 1**, `:81-87`, and it
  already documents this precise split in prose:

  > "Run that from the working tree you validated, which must be the tree you will run finalize
  > from… The record itself lands in the run folder the gate reads it from — **on a worktree run
  > that is the main checkout's rather than this tree's**, because the gate takes the record from
  > the authority folder and hashes the tree its own shell is in — so `record_path` is where to look
  > for the file."

  That is the same tree-vs-run-folder distinction #971 is about, already written down one step
  earlier, for a different script. **gap-sweep is the odd one out, not the discoverer of a new
  problem.**
- `ACTIVE_WORKTREE_PATH` is **re-resolved** at Step 9, `:297-299` (`="$(pwd)"`, then overridden by
  `_WT_PRE`). It is not a single Step-4 binding that survives to Step 10.

### Neighbouring instance the issue did not report

Step 9 has the **same defect class**. `:286` `SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"`
is cwd-relative, and Step 9 also carries no `cd`. Measured from the worktree at the current commit:

```
cwd=/Users/…/.kw/worktrees/bundle-969-970-971-972
ls: kaola-workflow/bundle-969-970-971-972/workflow-state.md: No such file or directory
SINK_BRANCH=[]
```

`SINK_BRANCH` comes back **empty** — and it is consumed by the sink. Whoever fixes Step 7 should
decide whether Step 9 is in scope; the two are the same bug on the same surface.

---

## Claim 5 — "after Step 10 mirrors, the same command succeeds" — UNMEASURED

Not reproduced: reproducing it requires actually running the finalize transaction, which mutates the
repository. Reporting rather than guessing.

What the code says is **consistent** with the claim: `kaola-workflow-claim.js:3980-4003` carries a
`pending_mirror` topology where `dest_dir = projectDir(root, project)` with `root` the invoking
(worktree) tree and the source `mirror.mainRoot` — i.e. main→worktree — and
`kaola-workflow-validation-runner.js:1275` states "the finalize transaction's Step 8a copies
main→worktree".

One inconsistency worth flagging to whoever writes the prose: the skeleton itself, `:331`, describes
the opposite direction — "it owns the **worktree-to-main** project-folder sync itself". Both
directions are asserted on the same surface. I did not determine which is correct; that is a
separate question from #971 but sits three lines from the text a fix would touch.

Also note Step 7 runs **before** Step 10, so at Step 7 time the folder is main-resident in every
worktree run — the mirror never helps the sweep in-sequence.

---

## Claim 6 — propagation "6 tracked plus 6 edition surfaces" — QUALIFIED, numbers wrong

"Generated, so edit the skeleton" is **correct**. The numbers are not.

```
node scripts/generate-routing-surfaces.js --check
→ generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.   EXIT=0
```

18 is **all three topics**. `scripts/generate-routing-surfaces.js:107-130` builds the registry as
3 topics × (3 `COMMAND_EDITIONS` + 3 `SKILL_EDITIONS`) = 18. `finalize.skeleton.md` accounts for
exactly **6**, all tracked, each carrying the gap-sweep call once (verified by grep, count 1 each):

```
commands/kaola-workflow-finalize.md
plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
```

Edition surfaces are **2, not 6** — both untracked, both carrying Step 7 and the gap-sweep line:

- `.opencode/command/kaola-workflow-finalize.md` (gap-sweep at `:206`)
- `.kimi/skills/kaola-workflow-finalize/SKILL.md` (gap-sweep at `:200`)

**Correct propagation: 6 tracked + 2 edition = 8.** (Measurement note: my first count said kimi had
zero. `find .kimi -iname "*finalize*" -type f` matches the *directory* name while `-type f` excludes
it, so the `SKILL.md` inside was never counted. `-path "*finalize*" -type f` is the right predicate.
Sweeps must run in main — `.opencode`/`.kimi` do not exist in the worktree.)

---

## What the implementer needs to know

### The helper to reuse — it exists, so this is reuse, not new code

**Primary — the exact shape gap-sweep needs**, this-tree-first-then-MAIN:

```js
// scripts/kaola-workflow-validation-runner.js:1286
function resolveRecordFolder(root, project, schema)
//   → { dir, root, mainResident, searched }   // dir === null when live in neither tree
```

Exported at `kaola-workflow-validation-runner.js:1706`. Its header comment (`:1273-1285`) is written
about this exact problem: *"standing in the worktree there is nowhere to write… this tree first, then
MAIN via the same resolver claim.js uses."* `run-chains` already reaches it rather than re-deriving
it — `kaola-workflow-run-chains.js:823-829` (`resolveProjectRecordDir`), with the rule stated at
`:811`: **"THE HASH FOLLOWS THE INVOKING TREE; THE RECORD FOLLOWS THE RUN FOLDER."** gap-sweep's
artifact is a record. It should follow the run folder.

**Primitive it is built on** (use directly if the full search is more than needed):

```js
// scripts/kaola-workflow-adaptive-schema.js:520
function resolveMainRoot(root)   // → main checkout root; fail-open, returns root on any error
//   built on getCoordRoot(root) at :492 — `git rev-parse --git-common-dir`, path.resolve'd
//   and mainRootFromCoord(coordRoot) at :513
```

Exported at `kaola-workflow-adaptive-schema.js:1553`; hosted there deliberately as the ×4
byte-identical anchor (`:482-486`) so all editions share one copy.

**Answering the tooling question directly:** `--git-common-dir` is used in exactly one production
resolver — `getCoordRoot`, `adaptive-schema.js:498` — plus the sink block at
`finalize.skeleton.md:351`. `--show-toplevel` is used widely but always to mean *this* tree
(`run-chains.js:796`, `validation-runner.js:1252`, `roadmap.js:18`, `active-folders.js:28`,
`sink-merge.js:358`, …). The codebase's settled idiom is: **`--show-toplevel` for the tree you are
in; `resolveMainRoot`/`getCoordRoot` for the main checkout.** gap-sweep uses neither.

`resolveFinalizeAuthority` (`kaola-workflow-claim.js:3885`) is the finalize authority resolver but is
**not exported** and searches only the root it is handed — its main-reaching happens in the caller
(`:3976-3988`). Not the one to reuse.

### Cost of the code fix

- gap-sweep **already** requires `kaola-workflow-adaptive-schema` at `:213`, so `resolveMainRoot`
  costs **zero new dependency**. `resolveRecordFolder` would be a new require of
  `kaola-workflow-validation-runner`.
- **`KAOLA_GAP_ROOT` must keep precedence.** All 127 assertions in `scripts/test-gap-sweep.js` pass
  `KAOLA_GAP_ROOT` explicitly (`:40`); an override that loses to a git lookup reds the whole suite.
- **`runCheck` does not currently receive `root`** — `:541` passes
  `{ project, outputPath, summaryPath, asJson, forceOffline }`. Only `runScan` gets it (`:543`).
  Either thread it, or resolve before the `checkMode` branch at `:531-538` (cleaner: both modes need
  the same answer, and scanner and gate disagreeing on the folder is how claim 2's false green
  happens).
- Both modes must move together. Fixing only `--check` leaves the scanner writing into the worktree.

### Test coverage is absent for this topology

`scripts/test-gap-sweep.js` (1038 lines, 127 assertions, exit 0 at `7e962bdc`) contains **no
occurrence of `worktree`** and pins `KAOLA_GAP_ROOT` on every invocation. Nothing in the suite can
observe this defect, and nothing would have caught it. A guard here needs a real linked worktree
(the scratch fixture above is the shape: `git worktree add`, run folder created **after** and left
uncommitted so it is main-only), and it must assert the **claim-2 false green** — `--check` exiting
**0** with `mapped:0` while a real gap sits in main's cache — not merely the exit-1 message. Pinning
only the missing-artifact string would let the worse half of the bug survive the fix.

### Code, prose, or both

**Both, and code is the load-bearing half.**

- **Code** — because claim 2's false green cannot be fixed by prose. Guidance telling the operator to
  `cd` to main still leaves a scanner that silently writes a stray, empty artifact into whatever tree
  it is run from, and a gate that passes on it. Four tracked copies must move together:
  `scripts/kaola-workflow-gap-sweep.js` and `plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js`
  (byte-identical, md5 `835041ee476200649b64d7702f68f595`), plus the rename-normalised
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js` (`c605cf76…`) and
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js` (`987122b0…`). The
  opencode/kimi editions carry **no** gap-sweep script — they call `$KAOLA_SCRIPTS/…`, so they
  inherit the fix for free.
- **Prose** — optional once the code resolves correctly, and if written it goes in
  `templates/routing/finalize.skeleton.md` (never a rendered surface), regenerated via
  `node scripts/generate-routing-surfaces.js --check`, reaching **6 tracked + 2 edition = 8**
  finalize surfaces. Note that if the code is fixed, the honest prose is *nothing new at all* — Step
  1 already tells the operator where to stand, and adding a Step 7 caveat about a resolution that no
  longer misbehaves would be a mechanism claim that rots.

### Open

- Claim 5 unmeasured (needs a real finalize run; mutating).
- The Step 9 `SINK_STATE_FILE` instance is measured and real but out of #971's stated scope — a
  scoping call for the orchestrator.
- The main→worktree vs worktree→main contradiction between `finalize.skeleton.md:331` and
  `validation-runner.js:1275` / `claim.js:3980-4003` is unresolved and was not investigated.
