# Premise check — issue #974: the gap sweep false-greens on a tree already polluted by a pre-fix stray run folder

## Setup

- Commit: `69264936` (`main`, clean apart from this run's own untracked `kaola-workflow/bundle-973-974-975/`)
- Linked worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975` at the same sha
- Platform: darwin 25.6.0, node from `process.execPath`
- All reproduction ran in throwaway fixtures under the session scratchpad. **Nothing in the repo was
  edited, staged, or created** other than this file.

Fixture scripts (kept, re-runnable):

- `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/0ea58e86-4462-405f-a994-d8c099b7e245/scratchpad/repro974.sh`
- `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/0ea58e86-4462-405f-a994-d8c099b7e245/scratchpad/repro974b.sh`
- `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/0ea58e86-4462-405f-a994-d8c099b7e245/scratchpad/mirror-topology2.sh`
- `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/0ea58e86-4462-405f-a994-d8c099b7e245/scratchpad/sibling-resolver.js`

---

## 1. The post-#971 resolver at HEAD — **SURVIVES** (line numbers moved; re-derived below)

`scripts/kaola-workflow-gap-sweep.js:467-483`:

```js
// The root whose kaola-workflow/<project>/ this run's record lives in. The record does not move
// when the operator does: at finalize the folder is resident in the main checkout while the
// operator stands in the linked worktree, and after the transaction's mirror it is resident in the
// worktree too. So the answer is the tree that HAS the folder — this one when it does, the main
// checkout otherwise — and cwd when neither has it (a first scan, or no repository to ask).
// KAOLA_GAP_ROOT overrides the search outright.
function resolveRunRoot(project) {
  if (process.env.KAOLA_GAP_ROOT) return path.resolve(process.env.KAOLA_GAP_ROOT);
  const cwd = process.cwd();
  const holds = r => fs.existsSync(path.join(r, 'kaola-workflow', project));
  if (holds(cwd)) return cwd;
  let mainRoot = cwd;
  try {
    mainRoot = require('./kaola-workflow-adaptive-schema').resolveMainRoot(cwd);
  } catch (_) { /* nothing to ask: cwd stands */ }
  return holds(mainRoot) ? mainRoot : cwd;
}
```

**Precedence today (3 tiers, not the brief's guess):**

| # | source | condition |
|---|---|---|
| 1 | `KAOLA_GAP_ROOT` | set and non-empty → `path.resolve()`d, returned outright, no tree lookup at all |
| 2 | `process.cwd()` | `fs.existsSync(<cwd>/kaola-workflow/<project>)` |
| 3 | `resolveMainRoot(cwd)` | same existence test against the main checkout |
| — | fallback | `cwd` when neither tree holds it |

Note: tier 2/3 is **`process.cwd()`, not `git rev-parse --show-toplevel`**. `--show-toplevel` never
appears in this file; the only git call is inside `resolveMainRoot`, which shells
`git rev-parse --git-common-dir` (`scripts/kaola-workflow-adaptive-schema.js:493-507`) and then takes
`dirname` of the `.git` it gets back (`mainRootFromCoord`, `:513-516`; `resolveMainRoot` itself at
`:518-523`, exactly where the brief said). The brief's "cwd/--show-toplevel" is one mechanism, and it
is cwd.

**The exact stop condition:** `fs.existsSync(path.join(r, 'kaola-workflow', project))` — a bare
directory-or-anything existence test. It does not stat for a directory, does not look inside, does not
require `.cache/`, does not require `workflow-state.md`. **A completely empty directory named
`kaola-workflow/<project>/` in cwd terminates the search.** Measured in Variant C below.

Env vars read by the whole file: `KAOLA_GAP_ROOT` (`:474`) and `KAOLA_WORKFLOW_OFFLINE` (`:53-54`).
Nothing else.

---

## 2. The vacuous green — **REPRODUCED. Every link in the issue's chain confirmed.**

### 2a. The primary reproduction (`repro974.sh`)

Fixture: real `git worktree`-linked pair. MAIN carries the claim-shaped run folder with a real gap
seed (`.cache/run-gaps-manual.md`) plus `workflow-state.md` and `finalization-summary.md`. The stray
in the worktree was **not hand-crafted** — it was produced by running the shipped scanner with
`KAOLA_GAP_ROOT` pinned at the worktree, which is byte-for-byte the pre-#971 `root := cwd` behaviour.

```
=============== STEP 1: create the PRE-FIX stray in the worktree ===============
{"result":"swept","project":"proj974","sweptClasses":[],"artifact":".../wt/kaola-workflow/proj974/.cache/run-gaps.json"}
exit=0

=============== STEP 2: HEAD scanner, run FROM THE WORKTREE ===============
{"result":"swept","project":"proj974","sweptClasses":[],"artifact":".../wt/kaola-workflow/proj974/.cache/run-gaps.json"}
exit=0

=============== STEP 3: HEAD gate --check, run FROM THE WORKTREE ===============
{"result":"pass","mapped":0,"filed":0,"noise":0}
GATE_EXIT=0

=============== MAIN's artifact after all of the above ===============
(main has NO run-gaps.json — the real gap was never swept)
```

Link-by-link against the issue's wording:

| issue's link | verdict | evidence |
|---|---|---|
| resolver finds the run folder in the tree it is standing in, because the stray is there | **CONFIRMED** | STEP 2's `artifact` is the worktree path; `holds(cwd)` is true at `:477` |
| stops | **CONFIRMED** | `resolveMainRoot` is never reached |
| sweeps an empty `.cache` | **CONFIRMED** | stray `.cache` holds only `run-gaps.json`; no `chain-receipt.json`, no `run-gaps-manual.md` → `scanChainReceipt` and `scanManual` both return `[]` |
| maps zero classes | **CONFIRMED** | `"sweptClasses":[]` |
| takes the vacuous-pass branch | **CONFIRMED** | `{"result":"pass","mapped":0,"filed":0,"noise":0}` is emitted only from `:372-378` |
| exits 0 | **CONFIRMED** | `GATE_EXIT=0` |
| a real gap sits unswept in the main checkout | **CONFIRMED** | main never received a `run-gaps.json`; its `run-gaps-manual.md` gap was never read |

Stray file tree, verbatim:

```
kaola-workflow/proj974
kaola-workflow/proj974/.cache
kaola-workflow/proj974/.cache/run-gaps.json
```

### 2b. Variant B — **worse than the issue states, and it is the shape the real finalize flow takes**

The finalize command surface runs **only** `--check` at Step 7
(`commands/kaola-workflow-finalize.md:210` — `node "$KAOLA_SCRIPTS/kaola-workflow-gap-sweep.js" --project {project} --check`;
same single line at `templates/routing/slots.js:158` `fz-gapsweep-run`, and in all three rendered
SKILL/command copies). So the operator does *not* re-scan; the sweep already happened correctly in main.

```
##### VARIANT B: correct scan FROM MAIN first, THEN a pre-fix stray exists, gate from wt. #####
{"result":"swept","project":"P","sweptClasses":[{"reasonClass":"manual:flaky-suite","sample":"the sink suite went red once","count":1}],"artifact":".../varB/main/kaola-workflow/P/.cache/run-gaps.json"}
scan-in-main exit=0
{"result":"pass","mapped":0,"filed":0,"noise":0}
GATE_EXIT=0
--- main's REAL artifact (the one the gate ignored) ---
{ "project": "P", "sweptClasses": [ { "reasonClass": "manual:flaky-suite", ... } ] }
```

The gap was swept. The evidence record exists and names it. The gate stood one directory over and
certified an empty one. **The issue describes the vacuous branch being reached because nothing was
swept; the sharper failure is that the gate passes even when the sweep succeeded.**

### 2c. Variant C — an **empty directory** is enough

```
##### VARIANT C: the stray is an EMPTY DIRECTORY only — no .cache, no artifact. #####
{"result":"refuse","reason":"artifact_missing","detail":"run-gaps.json not found; run --project P first"}
GATE_EXIT=1
{"result":"swept","project":"P","sweptClasses":[],"artifact":".../varC/wt/kaola-workflow/P/.cache/run-gaps.json"}
scan-from-wt exit=0
{"result":"pass","mapped":0,"filed":0,"noise":0}
GATE_EXIT_AFTER_RESCAN=0
```

A bare `mkdir kaola-workflow/P` in a worktree hijacks the resolver. First `--check` reports
`artifact_missing` (honest), the operator does the documented recovery ("run scanner first"), and the
rescan re-manufactures the stray artifact *in the same tree*, at which point the gate goes green. The
population is therefore wider than "trees that ran the pre-#971 sweep": **any empty directory of that
name reproduces it**, including one an operator creates by hand — which the
`record-final-validation` operator hint explicitly warns against
(`scripts/kaola-workflow-validation-runner.js:1546-1548`: *"do not create the run folder here by hand"*).

### 2d. Controls

| control | command | result | exit |
|---|---|---|---|
| A — no stray, scan+gate entirely from the worktree | `cd wt && node gap-sweep.js --project P [--json / --check --json --offline]` | `swept` 1 class into MAIN's `.cache`; then `{"result":"refuse","reason":"gaps_unswept",...}`; **no stray created in wt** | 0, then **1** |
| D — everything from main | same, cwd=main | `swept` 1 class; `{"result":"refuse","reason":"gaps_unswept",...}` | 0, then **1** |

Controls A and D give the correct verdict. The stray is the sole differing variable.

---

## 3. The vacuous-pass branch — **SURVIVES**, and the artifact carries none of the information needed

`scripts/kaola-workflow-gap-sweep.js:370-381`:

```js
  // Vacuous pass only when BOTH sides are empty.
  if (sweptClasses.length === 0 && (gapEntries === null || gapEntries.length === 0)) {
    if (asJson) {
      process.stdout.write(JSON.stringify({
        result: 'pass',
        mapped: 0,
        filed: 0,
        noise: 0,
      }) + '\n');
    }
    return 0;
  }
```

Exact conditions: the artifact parsed, `artifact.sweptClasses` is an empty array (or absent/non-array
— `:334` coerces), **and** `parseGapSection(summaryPath)` returned `null` (no `## Run gaps` heading, or
no summary file at all) or an empty entry list. In the stray topology both hold trivially: the stray
`.cache` produced `[]`, and there is no `finalization-summary.md` in the worktree.

**Is "zero classes" distinguishable from "swept everything and found nothing"?** **No — not from the
artifact.** The durable record is written at `:209`:

```js
  const artifact = { project, sweptClasses };
```

Two fields. No root, no timestamp, no scanned-cache path, no marker, no provenance. `runCheck`'s whole
input set is `{ project, outputPath, summaryPath, asJson, forceOffline }` plus that parsed object. At
`:371` the two situations are **byte-identical**.

The information is nevertheless *obtainable at that point in the process* — `outputPath` is an absolute
path, `resolveRunRoot` can be re-run, and git can be asked for sibling worktrees. So a fix has exactly
two shapes available: **probe at check time**, or **have `runScan` write the missing bit into the
artifact**. The second is a schema change to a registered durable record —
`scripts/kaola-workflow-adaptive-schema.js:760` enrolls `.cache/run-gaps.json` as
`['record', 'evidence', 'script', …]`, and `docs/workflow-state-contract.md:50` documents it — so it is
not a free field.

---

## 4. Scanner-created vs claim-created — **a distinguisher exists, and it is `workflow-state.md`; but it is not airtight**

Side by side, both measured:

```
SCANNER-CREATED STRAY (pre-fix sweep from a worktree)   CLAIM-CREATED (real, this repo, main)
------------------------------------------------       ---------------------------------------
kaola-workflow/proj974/                                 kaola-workflow/bundle-973-974-975/
kaola-workflow/proj974/.cache/                          kaola-workflow/bundle-973-974-975/.cache/
kaola-workflow/proj974/.cache/run-gaps.json             kaola-workflow/bundle-973-974-975/.cache/dispatch-log.jsonl
                                                        kaola-workflow/bundle-973-974-975/.cache/origin/selection-record.json
                                                        kaola-workflow/bundle-973-974-975/mission-list.md
                                                        kaola-workflow/bundle-973-974-975/workflow-state.md
```

The stray is created by one statement, `scripts/kaola-workflow-gap-sweep.js:207`
(`fs.mkdirSync(path.dirname(outputPath), { recursive: true })`), followed by the atomic write at
`:214-215`. It can contain **exactly one file**, `run-gaps.json`, and never `workflow-state.md`.

The claim transaction writes two artifacts — `scripts/kaola-workflow-claim.js:1503`: *"The transaction
writes exactly two artifacts, the selection record and workflow-state.md"*
(`.cache/origin/selection-record.json` per `SELECTION_RECORD_RELPATH` at `:1395`, and
`workflow-state.md` at `:781`).

So `workflow-state.md` **is** a reliable positive marker of a claim-created folder. What it is not is a
reliable *negative* marker of a stray, because two other legitimate producers make a
`kaola-workflow/<P>/` with no `workflow-state.md`:

1. **`run-chains --project` on a first run.** `scripts/kaola-workflow-run-chains.js:823-829` resolves
   the record dir through `validationRunner.resolveRecordFolder`, and falls back to
   `path.join(gitTop, 'kaola-workflow', project)` when the folder is live in **neither** tree.
   Measured (`nofolder-` fixture): `resolveRecordFolder(wt, P, schema)` returns `dir: null` when
   neither tree holds the folder, so run-chains writes
   `<worktree>/kaola-workflow/<P>/.cache/chain-receipt.json` — a folder with a `.cache` and no
   `workflow-state.md`. `scripts/kaola-workflow-claim.js:3805-3807` calls exactly this shape *"the
   ordinary shape"*.
2. **The gap-sweep test suite's own pinned case, T25e** (`scripts/test-gap-sweep.js:1207-1229`): a run
   folder resident **only** in the invoking worktree, with `main/kaola-workflow` deleted outright, and
   no `workflow-state.md` anywhere. 3 assertions.

**Bottom line for the implementer:** `workflow-state.md` present in main and absent in the invoking
tree is a *strong* signal, and it is the only content-level signal that exists on disk today. There is
no marker written by the scanner that says "I made this", and no field in `run-gaps.json` that names
the tree it was scanned from.

---

## 5. The four candidate shapes

### (d) prefer the tree holding `workflow-state.md` — the issue's hazard **SURVIVES**, measured

The issue flags that the post-mirror topology legitimately has the folder in both trees. **Verified by
driving the real `finalize` transaction**, stopped after Step 8a by an
`implementation_commit_missing` refusal (`mirror-topology2.sh`):

```
=== BEFORE: worktree kaola-workflow ===
(empty)

=== finalize from the WORKTREE ===
{"result":"refuse","reason":"implementation_commit_missing","project":"issue-9742","uncommitted_paths":["feature.txt"], ...}

=== AFTER: main kaola-workflow ===          === AFTER: worktree kaola-workflow ===
kaola-workflow/issue-9742                   kaola-workflow/issue-9742
kaola-workflow/issue-9742/.cache            kaola-workflow/issue-9742/.cache
.../.cache/run-gaps-manual.md               .../.cache/run-gaps-manual.md
.../finalization-summary.md                 .../finalization-summary.md
.../mission-list.md                         .../mission-list.md
.../workflow-state.md                       .../workflow-state.md

=== Does BOTH trees now hold workflow-state.md? ===
main     workflow-state.md: PRESENT
P        workflow-state.md: PRESENT
```

Confirmed. Post-mirror both trees hold the folder **and** `workflow-state.md`. The mechanism is
`scripts/kaola-workflow-claim.js:3631` — `mergeCopyDir(srcDir, destDir, FINALIZE_MIRROR_DEST_OWNED, FINALIZE_MIRROR_TREE_BOUND)`
— where the dest-owned skip at `:3466` is `keepExisting.has(entry.name) && fs.existsSync(d)`: when the
destination lacks `workflow-state.md`, it is copied. (`FINALIZE_MIRROR_DEST_OWNED` is
`{'workflow-state.md','workflow-tasks.json'}`, `:3479`.)

And the gate is **correct** in that window — the mirrored worktree copy is complete, so cwd-first gives
the right verdict:

```
=== gap-sweep from the WORKTREE in this POST-MIRROR topology ===
{"result":"swept","project":"issue-9742","sweptClasses":[{"reasonClass":"manual:flaky-suite",...}]}
{"result":"refuse","reason":"gaps_unswept","unmapped":[{"reasonClass":"manual:flaky-suite",...}]}
GATE_EXIT=1
```

So (d) is **not ruled out, but constrained on three counts**:
- it needs a tie-break for the post-mirror both-trees case (cwd-first is the one that keeps this leg green);
- it needs a fallback for "neither tree has `workflow-state.md`", or T25e's 3 assertions go red;
- it introduces a **new** wrong answer the issue did not name: with main claim-created and the worktree
  holding a legitimate run-chains-authored `.cache/chain-receipt.json`, (d) routes to main and the
  sweep misses that tree's `deferred_red_chain`. That is a false green of the same family, relocated.
- Cost: ~5 lines in `resolveRunRoot`. Obstacle: the correctness argument is entirely in the tie-break
  and the fallback, not in the rule.

### (a) detection-and-report — **cheapest, and a working precedent already ships**

`scripts/kaola-workflow-validation-runner.js:1311` already implements `otherProjectRoots(root, project)`,
which walks `git worktree list --porcelain` and returns every *other* working tree that also carries
`kaola-workflow/<project>/`. Its consumer at `:1535-1552` does precisely what #974 asks for: emits
`other_candidate_roots: [...]` plus a typed `operator_hint`, exit unchanged, no refusal, no cleanup.
That is a shipped template for (a) in the same repo, on the same question.

Obstacle: **`otherProjectRoots` is not exported.** Measured —
`require('./scripts/kaola-workflow-validation-runner.js').otherProjectRoots` → `undefined`
(`resolveRecordFolder` → `function`). The implementer must export it (a one-line change to the
`module.exports` block at `:1706`-ish) rather than re-derive it; re-deriving makes two implementations
of one rule. Note gap-sweep currently requires only `kaola-workflow-adaptive-schema`; reaching
`validation-runner` is a new module edge in a file whose ports are generated.

Cost: low. It also does not require deciding which folder is right — it reports the ambiguity, which
is the honest answer and matches "stop the pass being vacuous, not add a door".

### (b) cleanup — **highest risk, and it contradicts a shipped invariant**

A scanner that deletes a folder in a tree it did not choose is an operation that destroys. The stray
is untracked, so `git` will not recover it, and the resolver cannot tell a stray from a
run-chains-authored partial folder holding the only fresh `chain-receipt.json` — which
`FINALIZE_MIRROR_TREE_BOUND` (`scripts/kaola-workflow-claim.js:3493-3496`) exists specifically to stop
anything from destroying. Cost: low in lines, high in consequence. Recommend the implementer treat
this one as requiring the user's call, not the agent's (CLAUDE.md First Principle 4).

### (c) a marker distinguishing scanner-created from claim-created — **feasible, with a schema cost**

The scanner has exactly one write (`:214-215`) and the artifact has exactly two fields (`:209`), so
adding e.g. a `scannedRoot` is mechanically trivial. The costs: `.cache/run-gaps.json` is a registered
durable record (`scripts/kaola-workflow-adaptive-schema.js:760`,
`docs/workflow-state-contract.md:50`, `docs/api.md:1446-1460`, `docs/decisions/D-435-01.md:67,98`), so
the field is a contract change that owes doc updates; and a marker only labels artifacts written
*after* the fix — it is blind to exactly the pre-fix population #974 is about, unless "absence of the
marker" is itself read as the signal, which then mislabels every legitimate artifact written before
the fix. **A marker alone does not close this issue.**

---

## 6. Blast radius

**Assertion counts — the brief's "~127" is right but attached to the wrong noun.**

```
$ node scripts/test-gap-sweep.js
gap-sweep tests passed (151 assertions)
EXIT=0
```

- **151** total assertions in `scripts/test-gap-sweep.js` at HEAD.
- **127** of them sit before line 1104 and every one goes through the `run()` helper at
  `scripts/test-gap-sweep.js:35-50`, which sets `KAOLA_GAP_ROOT: root` unconditionally. So the correct
  statement is *"127 assertions ride on `KAOLA_GAP_ROOT` keeping precedence"*, not *"127 assertions in
  the suite"*. **`KAOLA_GAP_ROOT` must keep tier-1 precedence: SURVIVES, and it is 127.**
- **24** in the T25 resolution block (`:1030-1247`), split T25a 4 / T25b 2 / T25c 9 / T25d 4 / T25e 3 /
  T25f 2. These are the assertions that pin the resolution path itself; T25d (4) pins the override.
- Only two `spawnSync` sites exist in the suite (`:36`, `:1063`), so the split is exhaustive.

**Vacuous-pass branch coverage:** assertions that reach `:371` and expect a pass —
`:267,269,270` (T5), `:510` (T13), `:783` (T20); assertions that pin it *not* firing —
`:737` (T19, #726), `:1160-1168` (T25c, #971). Roughly 9 assertions bear directly on that branch's
condition.

**No other suite exercises gap-sweep.** `scripts/simulate-workflow-walkthrough.js` contains zero
`gap-sweep` references. `scripts/test-sink-merge.js` uses `run-gaps.json` only as a gitignore fixture
path (`:1913, :2007, :2028, :2095`) and never parses its schema.

**Env vars that must keep working:** `KAOLA_GAP_ROOT` (tier 1, 127 assertions), `KAOLA_WORKFLOW_OFFLINE`
(`:53-54`, the `--offline` equivalent). Those are the only two the file reads.

**Edition surface — 4 copies, and the ports are GENERATED, not hand-mirrored:**

```
scripts/kaola-workflow-gap-sweep.js                                      e78d57ff72e55bc3
plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js               e78d57ff72e55bc3   (byte-identical twin)
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js 15ab4921fd3df71b   (generated)
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js   2e1e1b26195f995e   (generated)
```

`kaola-workflow-gap-sweep.js` is in `GENERATED_AGGREGATORS` (`scripts/edition-sync.js:63`) and in
`validate-script-sync.js` `COMMON_SCRIPTS` (`:76`, with the note that the claude↔codex pair is
byte-identical while the forge ports are generated). Both forge ports carry an identical
`resolveRunRoot` at `:474-483` with the same `KAOLA_GAP_ROOT` tier-1 and the same base-named
`require('./kaola-workflow-adaptive-schema')`. So: edit the canonical, regenerate, and the byte twin
follows. `scripts/test-edition-sync.js:20-24,60,77,92,103` pins that enrollment. There are no
opencode/kimi copies of this script.

**Prose surfaces:** the `--check` invocation exists once as a routing slot
(`templates/routing/slots.js:158`) rendered into 3 command/SKILL surfaces; per CLAUDE.md, edit the
skeleton and regenerate. `docs/api.md:1446`, `docs/conventions.md:507,531`,
`docs/workflow-state-contract.md:50`, `docs/decisions/D-435-01.md` describe the behaviour and would
need updating only if the artifact schema or the exit contract moves.

---

## 7. This repo's own tree — **the issue's claim SURVIVES**

```
$ git status --short --untracked-files=all -- kaola-workflow/     # MAIN
?? kaola-workflow/bundle-973-974-975/.cache/dispatch-log.jsonl
?? kaola-workflow/bundle-973-974-975/.cache/origin/selection-record.json
?? kaola-workflow/bundle-973-974-975/mission-list.md
?? kaola-workflow/bundle-973-974-975/workflow-state.md

$ git -C .kw/worktrees/bundle-973-974-975 status --short --untracked-files=all
 M kaola-workflow/ROADMAP.md
?? kaola-workflow/.roadmap/issue-973.md
?? kaola-workflow/.roadmap/issue-974.md
?? kaola-workflow/.roadmap/issue-975.md

$ ls -a .kw/worktrees/bundle-973-974-975/kaola-workflow/
.  ..  .origin  .roadmap  archive  ROADMAP.md
```

Main holds exactly this run's claim-created folder (`workflow-state.md` present — the claim-created
signature). The linked worktree holds **no** `kaola-workflow/bundle-973-974-975/` and no stray run
folder of any project. The worktree's untracked entries are roadmap sources and a modified mirror —
roadmap staging, not run-folder pollution. **Clean.** Nothing was changed.

---

## Facts the issue did not have

1. **The false green does not require the sweep to have failed.** Variant B: the scan ran correctly in
   main, `run-gaps.json` there names the real gap, and the gate — run from the worktree, which is the
   single command the finalize surface actually issues at Step 7 — still returns
   `{"result":"pass","mapped":0,...}` exit 0. The issue frames the vacuous branch as being reached
   because nothing was swept; the sharper statement is that it is reached *regardless of whether the
   sweep succeeded*.

2. **An empty directory is sufficient.** The stop condition is a bare `fs.existsSync` (`:476`). Variant C
   reproduces the green from `mkdir kaola-workflow/P` alone. The population is therefore not bounded to
   "trees that ran the sweep pre-#971" — it includes any hand-created folder, which
   `validation-runner.js:1546-1548` already warns operators against creating. The issue's "bounded and
   shrinking" scope statement is **QUALIFIED**: the pre-fix-residue population shrinks, but the
   *reachable* population does not.

3. **The same defect exists in a second, unfixed resolver.** `resolveRecordFolder`
   (`scripts/kaola-workflow-validation-runner.js:1286-1305`) implements the identical this-tree-first
   rule and is what `run-chains --project` uses to place the chain receipt
   (`scripts/kaola-workflow-run-chains.js:823-829`) and what `record-final-validation` writes through.
   Measured against the shipped exported function (`sibling-resolver.js`):

   ```
   LEG 1 (no stray):        dir -> .../main/kaola-workflow/issue-974x   mainResident: true
   LEG 2 (pre-fix stray):   dir -> .../wt/kaola-workflow/issue-974x     hijacked: true
   LEG 3 (bare empty dir):  dir -> .../wt/kaola-workflow/issue-974x     hijacked: true
   ```

   #971 fixed one of two co-derived resolvers. Fixing only gap-sweep leaves the chain receipt and the
   final-validation record landing in the stray. The implementer should be told the class is wider than
   the file named in the issue — and that gap-sweep **re-derives** a rule
   `validation-runner` already owns, which is the drift the codebase elsewhere calls out as "two
   implementations of one rule are two things to drift" (`run-chains.js:815-817`).

4. **The detection primitive is already written and shipped — but not exported.** `otherProjectRoots`
   (`validation-runner.js:1311`) answers exactly "which other working trees also hold this run folder",
   and its consumer at `:1535-1552` already emits the report-not-refuse shape #974 asks for. Measured:
   `require(...).otherProjectRoots === undefined`. One export line makes candidate (a) reuse rather
   than reinvention.

5. **The artifact schema is the reason a check-time fix cannot be purely local.** `run-gaps.json` is
   `{project, sweptClasses}` and nothing else (`:209`), and it is a *registered durable record*
   (`adaptive-schema.js:760`, `docs/workflow-state-contract.md:50`). At the vacuous-pass branch the two
   situations are byte-identical, so any fix must either probe the filesystem/git at check time or widen
   a contract-documented schema.

6. **The claim.js comment asserting a "chain receipt, no workflow-state.md" worktree folder is the
   *ordinary* shape may be stale.** `scripts/kaola-workflow-claim.js:3805-3807` says so; measured,
   `resolveRecordFolder` sends a `--project` receipt to main whenever main holds the folder (LEG 1), so
   post-#910 that shape arises only when **neither** tree holds the folder at chain time (measured:
   `dir: null` → run-chains falls back to the invoking tree). Both changes landed the same day
   (`7350ba9ca` and `cf40c5493`, 2026-08-02). Unresolved, and it matters: candidate (d)'s risk profile
   depends on whether that shape is ordinary or vestigial.

## Open

- Whether a legitimate worktree-resident `kaola-workflow/<P>/.cache/chain-receipt.json` still occurs in
  a real post-#910 run — I measured the resolver, not a full `run-chains` invocation (running four
  chains in a fixture was out of proportion to the question). Refutable by driving
  `run-chains --project` from a linked worktree in a fixture where main already holds the run folder.
- I did not measure the gitlab/gitea ports' *runtime* behaviour, only that their `resolveRunRoot` source
  is line-for-line the canonical one at `:474-483`. Since they are generated from the canonical, a
  divergence would be an edition-sync failure, not a port-specific bug.
- No fix was chosen, none was prototyped, and nothing in the repository was modified.
