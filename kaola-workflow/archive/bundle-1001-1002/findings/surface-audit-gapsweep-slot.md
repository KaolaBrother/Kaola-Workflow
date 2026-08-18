# Surface audit — `fz-gapsweep-run`: does finalize splice the gate without the scanner?

**Setup.** Commit `9918a4b6425b8b5f81cac9e46b5a15f303a8c958` (main, `chore: archive
bundle-998-999-1000 [sink]`), tree clean but for the untracked `kaola-workflow/bundle-1001-1002/`.
Node v24.18.0, darwin. The worktree at `.kw/worktrees/bundle-1001-1002` sits at the **same commit**
and its `templates/routing/slots.js` is byte-identical to the main root's (`diff` → IDENTICAL), so
every measurement below holds for both checkouts.

Read-only audit. No tracked file was modified. The only writes were to the session scratchpad and to
this findings file.

---

## The slot as authored

`templates/routing/slots.js:148` — the complete entry, verbatim, all three forge keys:

```js
  "fz-gapsweep-run": {"github":"node \"$KAOLA_SCRIPTS/kaola-workflow-gap-sweep.js\" --project {project} --check","gitlab":"node \"$KAOLA_SCRIPTS/kaola-gitlab-workflow-gap-sweep.js\" --project {project} --check","gitea":"node \"$KAOLA_SCRIPTS/kaola-gitea-workflow-gap-sweep.js\" --project {project} --check"},
```

All three forge renderings carry `--check`. **None carries `--json`.** The issue's citation of
`slots.js:148` is exact.

**Is it the only gap-sweep slot?** Yes.

```
$ grep -n "gapsweep\|gap-sweep\|gap_sweep" templates/routing/slots.js
148:  "fz-gapsweep-run": {...}
```

One line. No neighbouring slot touches gap-sweep, and `grep -n "run-gaps\|runGaps\|run_gaps"
templates/routing/slots.js` returns nothing.

**Where the skeleton splices it** — `templates/routing/finalize.skeleton.md:238-246`, Step 7's entire
command block:

````markdown
## Step 7 — Run-gap sweep

Finishing an issue includes capturing the defects the run itself discovered. Sweep them and reconcile
the two sides:

```bash
<!-- SLOT:fz-scripts-resolver -->
<!-- SPLICE:fz-gapsweep-run -->
```
````

Two directives: the scripts-dir resolver, then the gate. The step is titled "Run-gap **sweep**" and
the only command it issues is the thing that reads a sweep someone else performed.

**A corroborating detail the issue does not mention.** The prose *after* the block refers three
times to a "scanner" the surface never tells the reader to run — a dangling referent:

- skeleton:252-254 — "If you hand-typed a `## Run gaps` row **the scanner** never observed, append
  the matching `gap: <class> — <text>` line to `.cache/run-gaps-manual.md` and **re-run the
  scanner**, so what is written was actually swept."
- skeleton:270 — "...the `## Run gaps` row, whose grammar **the scanner** owns."

"Re-run the scanner" is an instruction to repeat a step that was never given.

---

## Every rendered finalize surface

The count was derived, not taken on faith.

```
$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
EXIT=0
```

18 is the *whole* routing registry, not the finalize count. From
`scripts/generate-routing-surfaces.js:6` — "Regenerates the 18 template-shaped surfaces (next x6 +
init x6 + finalize x6)" — and confirmed structurally at lines 66-130: `TOPICS` ×
(`COMMAND_EDITIONS` ∪ `SKILL_EDITIONS`) = 3 topics × (3 command + 3 skill) = 18. So the generator
owns **6 finalize surfaces**.

The other six are the additive runtime editions (`.opencode*`, `.kimi*`), which are **gitignored**
(`git check-ignore -v` → `.gitignore:5:.opencode/`, `.gitignore:6:.kimi/`; `git ls-files` over all
six edition dirs returns **0** tracked files) yet ship to installed homes and carry the same line.

6 generated + 6 additive = **12 finalize surfaces on disk**. The issue's "12" is right, and this is
where the number comes from — it is *not* 12 generated surfaces.

Per-file grep, output quoted verbatim from
`for f in <the 12>; do echo "### $f"; grep -n "gap-sweep" "$f"; done`:

| # | path | `--check` | `--json` | other gap-sweep call |
|---|---|---|---|---|
| 1 | `commands/kaola-workflow-finalize.md` | yes — L221 | no | none |
| 2 | `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | yes — L207 | no | none |
| 3 | `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md` | yes — L221 | no | none |
| 4 | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` | yes — L207 | no | none |
| 5 | `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md` | yes — L221 | no | none |
| 6 | `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md` | yes — L207 | no | none |
| 7 | `.opencode/command/kaola-workflow-finalize.md` | yes — L218 | no | none |
| 8 | `.opencode-gitlab/command/kaola-workflow-finalize.md` | yes — L218 | no | none |
| 9 | `.opencode-gitea/command/kaola-workflow-finalize.md` | yes — L218 | no | none |
| 10 | `.kimi/skills/kaola-workflow-finalize/SKILL.md` | yes — L212 | no | none |
| 11 | `.kimi-gitlab/skills/kaola-workflow-finalize/SKILL.md` | yes — L212 | no | none |
| 12 | `.kimi-gitea/skills/kaola-workflow-finalize/SKILL.md` | yes — L212 | no | none |

Every one of the 12 carries **exactly one** gap-sweep line, and it is the gate. Zero carry `--json`.
No surface is in the "never mentions gap-sweep at all" category — the distinction the brief asked me
to preserve turns out to be empty here, which strengthens the finding: this is uniform omission of
the scanner, not patchy coverage of gap-sweep.

`commands/kaola-workflow-finalize.md:221` is confirmed as a rendered instance, exactly as the issue
cites. The gitlab/gitea copies differ only in the script basename, per the slot's forge keys.

The additive copies are byte-derived from the generated ones for this line:

```
$ diff <(grep -n "gap-sweep" commands/kaola-workflow-finalize.md | cut -d: -f2-) \
       <(grep -n "gap-sweep" .opencode/command/kaola-workflow-finalize.md | cut -d: -f2-)
gap-sweep line IDENTICAL between commands/ and .opencode/
```

---

## Does `--check` scan? (the refutation attempt)

This is where the issue would die if it were wrong. It is not wrong. Three independent lines of
evidence, ending in a run.

### 1. The mode split is hard

`scripts/kaola-workflow-gap-sweep.js:613-617`, the last statement of `main()`:

```js
  if (checkMode) {
    return runCheck({ project, outputPath, summaryPath, asJson, forceOffline });
  } else {
    return runScan({ project, outputPath, asJson, root });
  }
```

Mutually exclusive. `runCheck` (defined at :351) never calls `runScan` (defined at :135).

### 2. `runCheck` purely consumes, and says so when it can't

`scripts/kaola-workflow-gap-sweep.js:351-369`:

```js
function runCheck(opts) {
  const { project, outputPath, summaryPath, asJson, forceOffline } = opts;

  // Read the artifact.
  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch (e) {
    if (asJson) {
      process.stdout.write(JSON.stringify({
        result: 'refuse',
        reason: 'artifact_missing',
        detail: 'run-gaps.json not found; run --project ' + project + ' first',
      }) + '\n');
    } else {
      process.stderr.write('gap-sweep: artifact not found at ' + outputPath + '; run scanner first\n');
    }
    return 1;
  }
```

A bare `readFileSync`. On failure it does not fall back to scanning — it refuses and *instructs the
caller to run the scanner*. The script's own header (:17-18) states the same division:

```
//   (default)   Scanner: scan .cache/, write artifact, emit JSON if --json.
//   --check     Gate: read artifact + summary ## Run gaps section; pass or refuse.
```

and its refusal detail at :388 spells the required order out loud: `'seed via
.cache/run-gaps-manual.md (gap: <class> — <text>), re-run the scanner, then --check'`.

### 3. Measured A/B — one axis, the `--check` flag

Both legs at the same commit, same `--output` path, same project. The first attempt used
`--output .../run-gaps.json` and hit an unrelated guard (`foreign_run_gaps_output` — the scanner
refuses to write a file *named* `run-gaps.json` outside the project's own `.cache/`, gap-sweep.js
:168-186), so the legs were re-run with the permitted basename `scan-out.json`.

| Leg | Command (abbrev.; `$SP` = scratchpad) | Result | Exit | Artifact after |
|---|---|---|---|---|
| A2 | `gap-sweep.js --project bundle-1001-1002 --check --output $SP/scan-out.json --summary $SP/summary.md --json` | `{"result":"refuse","reason":"artifact_missing","detail":"run-gaps.json not found; run --project bundle-1001-1002 first"}` | 1 | **ABSENT** |
| B2 | `gap-sweep.js --project bundle-1001-1002 --json --output $SP/scan-out.json` | `{"result":"swept","project":"bundle-1001-1002","sweptClasses":[],"artifact":"$SP/scan-out.json"}` | 0 | **PRESENT** |

The axis was the `--check` flag alone. Leg A2 eliminates "the gate scans then checks": it created
nothing and exited 1. Leg B2 eliminates "the artifact appears some other way": the scanner form is
what writes it.

**The refutation attempt fails. `--check` purely consumes a pre-existing artifact.**

### 4. No other producer exists anywhere

Searched the whole finalize surface text, not just the gap-sweep line:

```
$ grep -n "run-gaps\|scanner\|[Ss]can\b\|gap-sweep" commands/kaola-workflow-finalize.md
221:node "$KAOLA_SCRIPTS/kaola-workflow-gap-sweep.js" --project {project} --check
228:record `noise: <justification>`. If you hand-typed a `## Run gaps` row the scanner never observed,
229:append the matching `gap: <class> — <text>` line to `.cache/run-gaps-manual.md` and re-run the
230:scanner, so what is written was actually swept.
246:`## Run gaps` row, whose grammar the scanner owns.
266:Scan the run's own records for deferred items, unresolved conflicts, partial-implementation notes,
```

Line 266's "Scan" is Step 8 prose about follow-up items, unrelated. Nothing produces the artifact.

Across **all 18** generated routing surfaces (next and init included), zero invoke the scanner form:

```
$ grep -rn "gap-sweep.js\" --project" commands/ plugins/ | grep -v -- "--check"
NONE: zero surfaces invoke gap-sweep without --check
```

And no *script* silently produces it on the orchestrator's behalf. `kaola-workflow-claim.js` touches
gap-sweep exactly twice, and neither spawns it:

```
scripts/kaola-workflow-claim.js:33:const { parseGapSection } = require('./kaola-workflow-gap-sweep');
scripts/kaola-workflow-claim.js:5939:  'run-gaps-manual.md',    // manual gap-sweep annotations sidecar
```

Line 33 imports the *summary-section parser*, not the scanner. `run-chains.js` and `sink-merge.js`
carry no gap-sweep reference at all. `kaola-workflow-gap-sweep.js` is the sole writer of
`run-gaps.json`.

**Conclusion: there is no path by which a run that follows the finalize surface literally arrives at
Step 7 with `.cache/run-gaps.json` in existence.**

---

## Docs seam

`docs/conventions.md:496-535`, section "Run-gap capture at finalize (#435)". Verbatim:

> The orchestrator MUST:
>
> 1. Run `node scripts/kaola-workflow-gap-sweep.js --project <P> --json` to produce
>    `.cache/run-gaps.json`. The scanner reads only `kaola-workflow/<P>/.cache/` (scope guard —
>    no archive bleed). ...
> 2. Populate the `## Run gaps` section of `finalization-summary.md` ...
> 3. Run `node scripts/kaola-workflow-gap-sweep.js --project <P> --check` as the gate. ...

A three-step MUST. The finalize surface splices **step 3 only**. Steps 1 and 2 exist in the doc and
nowhere in the prompt. (Step 2 is partly covered — the skeleton does state the `## Run gaps` grammar
at :227-236, shipped in `0d97df5d`. Step 1 is covered nowhere.)

**Is `docs/conventions.md` reachable from a prompt surface?** No. It is a **reader doc**. The only
surfaces naming it are the *init* ones, and there it is scaffolding the **consumer's** repo, not
citing this repo's file:

```
commands/workflow-init.md:190:- `docs/conventions.md` — coding, testing, Git, and review rules.
commands/workflow-init.md:330:### `docs/conventions.md`
plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md:145, :360   (same, per edition)
```

```
$ grep -rn "conventions" commands/kaola-workflow-finalize.md
NONE in the github finalize command
```

The finalize surface never points its reader at the doc. So the MUST at `conventions.md:507` is
unreachable from the runtime that is supposed to obey it — the orchestrator executing finalize sees
only the gate. This is the seam: **the rule is stated where the doer will not read it, and omitted
where the doer will.**

---

## Existing guards

No guard pins the current wording. Nothing will need deleting-with-its-mechanism.

```
$ grep -rn "fz-gapsweep-run" scripts/ plugins/*/scripts/
NONE — no test references the slot name
```

```
$ grep -c "gap-sweep\|gapsweep\|run-gaps" scripts/simulate-workflow-walkthrough.js
0
```

The walkthrough — the integration suite — carries **zero** gap-sweep mentions. Seven test files
mention it, none pinning the surface:

| file | matches | what it pins |
|---|---|---|
| `scripts/test-gap-sweep.js` | 65 | script behaviour only. `grep -n "commands/\|SKILL.md\|skeleton\|slots\|SPLICE\|finalize.md"` → **NONE**; it never reads a surface. |
| `scripts/test-edition-sync.js` | 12 | `GENERATED_AGGREGATORS` enrollment + forge port paths/headers |
| `scripts/test-finalize-door.js` | 4 | sidecar name list; `## Run gaps` section as the closure source |
| `scripts/test-sink-merge.js` | 5 | archive `.cache/run-gaps.json` ignore behaviour |
| `scripts/test-install-manifest-single-source.js` | 3 | `supportScripts()` membership per forge |
| `scripts/test-spawn-classification.js` | 1 | a spawn-count row for `test-gap-sweep.js` |
| `scripts/test-validation-runner.js` | 1 | a `run-gaps-manual.md` fixture write |

**What an implementer must know instead.** The exposure is not a stale pin, it is regeneration
breadth. Editing `slots.js:148` changes the bytes of the finalize renderings, so
`node scripts/generate-routing-surfaces.js --check` (which runs in every chain) reds until the 6
generated surfaces are regenerated and committed in the same commit. The 6 additive
`.opencode*`/`.kimi*` copies are gitignored and rebuilt by their installers — and per the known
trap, edition suites go vacuous in a fresh worktree, so a green run there does not witness them.

---

## Verdict on the premise

**The premise HOLDS — fully, and on every checkable particular.**

Measured, not inferred:

1. `slots.js:148` defines `fz-gapsweep-run` with `--check` for all three forges and `--json` for none. Exact.
2. `commands/kaola-workflow-finalize.md:221` is a rendered instance. Exact.
3. Twelve finalize surfaces ship; all twelve carry the one gate line and none carries a scan. "The same single line renders to all 12" is exact — with the clarification that 6 are generated and tracked, 6 are gitignored additive-edition copies.
4. `--check` does not scan. Proven by code path and by an executed A/B: it creates nothing and refuses `artifact_missing`.
5. No other slot, step, script, or aliased call produces `run-gaps.json` during finalize.
6. `docs/conventions.md:505-535` states the `--json` scan as step 1 of a three-step MUST, in a doc no prompt surface reaches.

**Inference (labelled as such).** A run that follows the finalize surface literally, with no prior
knowledge, reaches Step 7 and gets `artifact_missing` + exit 1 — the gate refuses rather than passing
falsely. Confidence: high; the mechanism is measured in leg A2. What would refute it: an orchestrator
path that runs the scanner from memory, from `CLAUDE.md`, or from a prior run's habit rather than
from the surface. That is exactly the residue — the step is carried by orchestrator knowledge, not by
the prompt, so the surface's correctness depends on the reader already knowing what it omits.

**Not measured, and why.** I did not execute a full finalize transaction end-to-end against a live
run folder; doing so writes into a run's `.cache/` and would have produced this run's own artifact,
which belongs to the orchestrator's Step 7, not to a read-only audit. The A/B above isolates the same
mechanism without that side effect. I also did not verify the installed `~/.claude` / `~/.opencode`
homes on this machine — only the repo's shipped and edition-built copies.
