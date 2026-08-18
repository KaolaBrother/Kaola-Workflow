# Census — `run-gaps.json` artifact vs `## Run gaps` stamp across the archive (#1001)

Investigation of the prerequisite census #1001's own body demands before the issue can be
prioritised: *"if archived runs all carry a `run-gaps.json`, the omission is costing nothing today
and the priority is lower than it looks."*

**Setup**
- Commit: `9918a4b6425b8b5f81cac9e46b5a15f303a8c958` (main). Working tree clean except the untracked
  run folder `kaola-workflow/bundle-1001-1002/`.
- `node --version` → `v24.18.0`, darwin 25.6.0.
- Repo root: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow`
- Archive: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/kaola-workflow/archive`
- Scratch scripts (NOT in the repo):
  `/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/eda803d4-845f-45b3-9fe6-5368b92e74b1/scratchpad/{census.js,report.js,replay-gate.js}`
- No tracked file was edited. `--check` never writes; every replay used absolute `--output` /
  `--summary` paths so nothing under the repo was mutated.

---

## Measured

### 0. The artifact path, verified against source (not assumed)

The task said not to assume `.cache/run-gaps.json`. Verified against three places in the shipped
code and docs:

| where | what it says |
|---|---|
| `scripts/kaola-workflow-gap-sweep.js:605-608` | `defaultCacheDir = path.join(root, 'kaola-workflow', project, '.cache')`; `outputPath = outputArg ? path.resolve(root, outputArg) : path.join(defaultCacheDir, 'run-gaps.json')` |
| `scripts/kaola-workflow-gap-sweep.js:177` | `const ownArtifactPath = path.join(cacheDir, 'run-gaps.json')` — the foreign-output guard's own notion of "this project's own artifact" |
| `scripts/kaola-workflow-gap-sweep.js:27` (header) | `Default: kaola-workflow/<P>/.cache/run-gaps.json` |
| `docs/api.md:1428` | "…and writes `.cache/run-gaps.json`" |

Artifact **content shape**, from `scripts/kaola-workflow-gap-sweep.js:209` —
`const artifact = { project, sweptClasses };` written via `writeFileAtomicReplace` with
`JSON.stringify(artifact, null, 2) + '\n'`. So an empty scan is a real file, not a 2-byte `{}`:

```
$ cat kaola-workflow/archive/issue-991/.cache/run-gaps.json
{
  "project": "issue-991",
  "sweptClasses": []
}
```

That is the **51-byte floor** observed across the archive. Presence-without-content is therefore
`sweptClasses: []` (51–76 B depending on project-name length), and is counted separately below
from a populated scan. Measured byte range across all 140 archived artifacts: **51 B .. 3310 B**.

The census parses `## Run gaps` with the **shipped** `parseGapSection`, imported from
`scripts/kaola-workflow-gap-sweep.js` (it is exported at `:627`) — not a re-implementation, so the
row grammar in this census is byte-identical to the grammar the gate enforces.

### 1. Whole-archive presence census

```
$ node <scratchpad>/census.js
folders scanned: 406
malformed-row advisory warnings emitted: 0
```

Independent second derivation in plain shell (`test -f` + `grep -E '^## Run gaps[[:space:]]*$'`),
run over the same 406 directories:

```
total:      406
section-present:      128
artifact-present:     140
section-and-NO-artifact:  9
```

The Node census and the shell census agree exactly on all three numbers. The zero worth
distrusting — "recent runs missing the artifact" — is re-derived twice in §3.

One folder, `issue-687`, is on disk but has **0 tracked files** (`git ls-files … | wc -l` → 0) and
contains only an empty `.cache/`; it has no summary and no artifact and is excluded from every
date-ordered figure below (405 dated folders, 406 on disk).

### 2. The mechanism's birth — why a 406-run aggregate is misleading

Ordering by earliest `git log --diff-filter=A` date under `kaola-workflow/archive/<folder>/`:

```
first archived run WITH artifact: idx=228  issue-435  2026-06-13T13:38:46+08:00
BEFORE that index: n=228, with summary=12, section stamped=0
```

`issue-435` is the run that **built** gap-sweep. All 228 runs archived before it stamp **zero**
`## Run gaps` sections and hold zero artifacts. Every whole-archive percentage is dominated by
that pre-mechanism era and means nothing.

**Post-`issue-435` era (177 runs, 2026-06-13 → 2026-08-18):**

| measurement | count |
|---|---|
| runs archived | 177 |
| finalized (has `finalization-summary.md`) | 144 |
| `## Run gaps` section present | 128 |
| `.cache/run-gaps.json` present | 140 |
| — populated (`sweptClasses.length > 0`) | 62 |
| — present but empty (`sweptClasses: []`) | 78 |
| — unparseable or missing `sweptClasses` | **0** |
| artifact present but NO section | 21 |

Monthly, post-birth:

```
month     runs  artifact  section  populated
2026-06    48      32       28        4
2026-07    84      66       58       30
2026-08    45      42       42       28
```

### 3. Recent slice (last 40 archived runs, 2026-08-01 → 2026-08-18)

```
n = 40
summary present:            40 / 40
artifact present:           40 / 40
  populated:                27
  empty (sweptClasses: []): 13
## Run gaps section present: 40 / 40
  with >=1 parsed row:      25
  zero parsed rows:         15
  carrying unaccounted `filed: #N` (rows the grammar did not read): 2
artifact ABSENT while section stamped:               0
section with >=1 ROW but artifact absent-or-empty:   0
```

**Distrusting the zero.** `artifact ABSENT while section stamped = 0` over the recent 40 was
re-derived a second way, in shell, over the same 40 folder names, with no Node involved:

```
$ tail -40 recent40.txt | while read d; do
    a=0; s=0
    [ -f "$d/.cache/run-gaps.json" ] && a=1
    grep -qE '^## Run gaps[[:space:]]*$' "$d/finalization-summary.md" 2>/dev/null && s=1
    echo "$a $s"
  done | sort | uniq -c
  40 1 1
```

All 40 report `artifact=1 section=1`. The zero holds under both derivations.

Recent-40 detail (oldest → newest; `bytes`/`swept` from the artifact, `rows`/`filed`/`unacct` from
the shipped `parseGapSection`):

```
archivedAt  folder                              artifact bytes swept section rows filed unacct
2026-08-01  issue-899                              Y    1009    3      Y      3    0     0
2026-08-01  issue-878                              Y     690    2      Y      2    0     0
2026-08-02  bundle-900-901-902-903                 Y    1903    5      Y      5    5     0
2026-08-02  bundle-904-905-906-907-908-909-910     Y    2240    5      Y      0    0     5
2026-08-02  bundle-911-912-913-914-916-917         Y    2534    8      Y      8    6     0
2026-08-02  bundle-918-919-920-921-922-923         Y      72    0      Y      0    0     0
2026-08-02  issue-924                              Y      51    0      Y      0    0     0
2026-08-03  issue-925                              Y      51    0      Y      0    0     0
2026-08-03  issue-926                              Y      51    0      Y      0    0     0
2026-08-03  issue-927                              Y     257    1      Y      1    1     0
2026-08-03  issue-928                              Y      51    0      Y      0    0     0
2026-08-03  issue-929.archived-…                   Y      51    0      Y      0    0     0
2026-08-04  bundle-930-931                         Y    3054    5      Y      5    1     0
2026-08-04  issue-932                              Y     543    1      Y      1    1     0
2026-08-04  issue-933                              Y    1057    1      Y      1    1     0
2026-08-04  issue-934                              Y      51    0      Y      0    0     0
2026-08-09  issue-936                              Y    1646    4      Y      4    4     0
2026-08-09  bundle-937-938-939                     Y    3310    5      Y      5    0     0
2026-08-10  issue-935                              Y    1610    5      Y      5    4     0
2026-08-10  bundle-940-941-942-943-944             Y    2560    5      Y      5    4     0
2026-08-10  bundle-945-946-947-948                 Y    3149    6      Y      0    0     3
2026-08-11  issue-949                              Y    2017    3      Y      3    0     0
2026-08-11  bundle-950-951                         Y      56    0      Y      0    0     0
2026-08-12  bundle-952-953-954-955                 Y      64    0      Y      0    0     0
2026-08-12  bundle-956-…-962                       Y    2156    3      Y      3    2     0
2026-08-12  issue-965                              Y      51    0      Y      0    0     0
2026-08-12  bundle-963-964-966                     Y    1048    1      Y      1    1     0
2026-08-12  issue-967                              Y      51    0      Y      0    0     0
2026-08-12  issue-968                              Y     933    1      Y      1    1     0
2026-08-13  bundle-969-970-971-972                 Y    1676    3      Y      3    3     0
2026-08-14  bundle-973-974-975                     Y     965    4      Y      4    3     0
2026-08-14  bundle-976-977-978                     Y    1700    5      Y      5    5     0
2026-08-14  bundle-980-981                         Y      56    0      Y      0    0     0
2026-08-16  bundle-984-985                         Y    1004    4      Y      4    4     0
2026-08-16  bundle-987-988-989                     Y     616    3      Y      3    1     0
2026-08-16  bundle-986-990                         Y     367    1      Y      1    1     0
2026-08-16  issue-991                              Y      51    0      Y      0    0     0
2026-08-17  bundle-992-993-994                     Y     565    3      Y      3    3     0
2026-08-17  bundle-995-996-997                     Y     796    4      Y      4    3     0
2026-08-18  bundle-998-999-1000                    Y    1678    7      Y      7    2     0
```

### 4. What the finalize surface actually splices (the issue's premise, verified)

```
$ grep -rn "gap-sweep" scripts/ templates/ commands/ | grep -v '^scripts/kaola-workflow-gap-sweep.js' | grep -v '^scripts/test-gap-sweep.js'
```

The only invocation site in the whole prompt-surface tree is one slot:

```
templates/routing/slots.js:148
  "fz-gapsweep-run": {"github":"node \"$KAOLA_SCRIPTS/kaola-workflow-gap-sweep.js\" --project {project} --check", …}
```

rendered into six surfaces, all `--check`-only:

```
commands/kaola-workflow-finalize.md:221
plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md:207
plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md:221
plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md:207
plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md:221
plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md:207
(+ .opencode-gitlab/command/kaola-workflow-finalize.md:218)
```

**No script spawns the scanner.** Second search, keyed on `child_process` verbs:

```
$ grep -rn "gap-sweep" scripts/*.js package.json templates/routing/*.js \
    | grep -vE "test-gap-sweep|kaola-workflow-gap-sweep\.js:" \
    | grep -iE "spawnSync|execFileSync|execSync|fork\(|child_process|node .*gap-sweep"
templates/routing/slots.js:148:  "fz-gapsweep-run": … --check …
```

`scripts/kaola-workflow-claim.js` touches gap-sweep exactly twice — `require`ing `parseGapSection`
(`:33`) and naming `run-gaps-manual.md` in the archive sidecar allowlist (`:5939`). It never runs
the scanner.

**#1001's premise holds as stated: the surface splices the gate and never the producer.**

### 5. What the gate does when the producer never ran — measured, not read

```
$ node scripts/kaola-workflow-gap-sweep.js --project demo-nonexistent --check --json --offline \
    --output <scratchpad>/gatedemo/absent-run-gaps.json \
    --summary <scratchpad>/gatedemo/finalization-summary.md
{"result":"refuse","reason":"artifact_missing","detail":"run-gaps.json not found; run --project demo-nonexistent first"}
exit=1
```

The gate **fails closed and names the missing step**. The omission is therefore not a silent pass;
it is a refusal with a repair instruction in the payload.

### 6. Replaying the shipped gate over every archived run

`--check` performs no network I/O (`runCheck` at `:472-484` is syntactic only) and no writes, so
the real gate was replayed over all 405 dated archived runs with absolute `--output`/`--summary`:

```
$ node <scratchpad>/replay-gate.js

== ALL (n=405) ==
  refuse:artifact_missing        265
  pass                           126
  refuse:observed_gap_unseeded    12
  refuse:gaps_unswept              2

== RECENT 40 (n=40) ==
  pass                            38
  refuse:gaps_unswept              2

== RECENT 20 (n=20) ==
  pass                            19
  refuse:gaps_unswept              1
```

228 of the 265 `artifact_missing` results are pre-`issue-435` runs and are pure anachronism — the
mechanism did not exist. The `observed_gap_unseeded` results are also partly anachronistic: that
reverse check shipped with `issue-653`, archived **2026-07-11**, and 11 of the 12 predate it.

The **two** recent refusals are NOT #1001's class. Both runs have a fully populated artifact (2240 B
/5 classes and 3149 B/6 classes) — the producer ran. What failed is the summary's row grammar:

```
bundle-904-905-906-907-908-909-910/finalization-summary.md
  - manual:relative-plan-receipt-placement: filed: #911     <- no "(<sample>)" parenthetical
bundle-945-946-947-948/finalization-summary.md
  - `doc-badge-overclaim` — filed: #949                     <- backticked class, em-dash tail
```

That is the #998/#1000 grammar class, one level below #1001.

---

## Cross-tab

The question asked: **how many archived runs stamped a `## Run gaps` section with no non-empty
artifact beside it?**

| population | all archived | post-`issue-435` era (n=177) | recent 40 |
|---|---|---|---|
| `## Run gaps` stamped, artifact file **entirely absent** | **9** | **9** | **0** |
| `## Run gaps` stamped, artifact absent **or** `sweptClasses: []` | 66 | 66 | 13 |
| `## Run gaps` stamped with **≥1 parsed row**, artifact absent or empty | **13** | **13** | **0** |
| `## Run gaps` stamped **and** populated artifact beside it | 62 | 62 | 27 |
| artifact present, no `## Run gaps` section | 21 | 21 | 0 |

The middle row (66 / 13) over-counts: a run that legitimately swept nothing writes `sweptClasses:
[]` and a zero-row section, and the gate passes it vacuously. That is correct behaviour, not a
defect. The two rows that carry signal are the first and third.

**The 9 runs with a stamped section and no artifact at all** (all post-`issue-435`):

```
2026-06-14  issue-455
2026-06-16  issue-495
2026-06-16  bundle-506-507
2026-06-16  bundle-513-514
2026-07-08  issue-634
2026-07-19  issue-725
2026-07-20  issue-725.archived-2026-07-19T17-20-09-384Z
2026-07-31  issue-877
2026-07-31  issue-880
```

Not an archiving artefact: every one of the 9 has a populated `.cache/` in the archive (6, 28, 20,
22, 33, 33, 31, 2, 4 files respectively), and `copyDir`
(`scripts/kaola-workflow-claim.js:5915-5919`) is fully recursive, so a `run-gaps.json` that existed
at archive time would be there. The artifact was genuinely never produced.

**The 13 runs whose section carried a real row with nothing behind it** — the actual harm
population, since these are summaries that asserted a gap verdict no scan backs:

```
2026-06-16  bundle-496-497                        56B/swept0   rows=1 filed=1   replay: observed_gap_unseeded
2026-06-16  issue-495                             ABSENT       rows=1 filed=1   replay: artifact_missing
2026-06-16  bundle-506-507                        ABSENT       rows=2 filed=2   replay: artifact_missing
2026-06-16  issue-500.archived-…                  51B/swept0   rows=2 filed=2   replay: observed_gap_unseeded
2026-06-17  issue-520                             51B/swept0   rows=1 filed=1   replay: observed_gap_unseeded
2026-06-20  issue-538                             51B/swept0   rows=1 filed=1   replay: observed_gap_unseeded
2026-06-20  issue-544                             51B/swept0   rows=1 filed=0   replay: observed_gap_unseeded
2026-06-20  issue-543                             51B/swept0   rows=1 filed=1   replay: observed_gap_unseeded
2026-06-27  issue-572                             51B/swept0   rows=1 filed=1   replay: observed_gap_unseeded
2026-06-29  issue-576                             51B/swept0   rows=1 filed=1   replay: observed_gap_unseeded
2026-06-30  issue-577                             51B/swept0   rows=2 filed=0   replay: observed_gap_unseeded
2026-07-07  bundle-617-618                        56B/swept0   rows=3 filed=3   replay: observed_gap_unseeded
2026-08-01  bundle-888-889-890-892-893-894-895    76B/swept0   rows=6 filed=3   replay: observed_gap_unseeded
```

Twelve of the 13 predate `issue-653` (archived 2026-07-11), the run that added the reverse
`observed_gap_unseeded` check — so at their own finalize the gate did not look. **Exactly one,
`bundle-888-889-890-892-893-894-895` (2026-08-01), postdates it**, and it is a genuine escape: the
run hand-wrote six `gap:` lines into `.cache/run-gaps-manual.md` and six matching `## Run gaps`
rows with three real issue filings (`#896`, `#897`, `#898`), and the archived artifact is
`sweptClasses: []` — the scanner was never re-run over the seed. It is the **only** archived case
of a non-empty manual seed sitting beside an empty artifact:

```
manual seed file NON-EMPTY but artifact swept 0: 1
  -> bundle-888-889-890-892-893-894-895
```

Its own seed file states the intent in prose: *"declared here so the `--check` gate sweeps what the
summary maps."* It never did.

**Recent-40 verdict: 0 and 0.** In the last 40 archived runs there is no case of a stamped section
without an artifact, and no case of a stamped row without a populated artifact behind it.

---

## How the artifact got there

### The producer has no automated caller

Established in §4: zero `child_process` invocations anywhere in `scripts/`, and the single prompt
slot renders `--check` only. Every one of the 140 archived artifacts was produced by a human or an
agent typing the scanner command.

### The instruction to type it lives only in a doc consumers do not receive

```
$ grep -rn "gap-sweep\|run-gaps" docs/conventions.md docs/api.md docs/architecture.md
docs/conventions.md:507:1. Run `node scripts/kaola-workflow-gap-sweep.js --project <P> --json` to produce
docs/conventions.md:508:   `.cache/run-gaps.json`. …
docs/conventions.md:535:3. Run `node scripts/kaola-workflow-gap-sweep.js --project <P> --check` as the gate. …
docs/api.md:1420:## Run-gap sweep — `kaola-workflow-gap-sweep.js`
```

`docs/conventions.md:505-507` — *"The orchestrator MUST: 1. Run … `--json` to produce
`.cache/run-gaps.json`"* — is the **only** place the producer step is stated as an obligation.

```
$ grep -rn "conventions.md" install.sh scripts/kaola-workflow-install-manifest.js
$ grep -n "docs/" install.sh
(both empty)
```

`install.sh` ships **no `docs/`**. An installed consumer receives `commands/kaola-workflow-finalize.md`
and the SKILL packs and nothing else. This repo self-hosts, so its own orchestrators can read
`docs/conventions.md:507`; a consumer cannot.

The finalize surface's closest approach to the producer is `commands/kaola-workflow-finalize.md:228-230`:

> If you hand-typed a `## Run gaps` row the scanner never observed, append the matching
> `gap: <class> — <text>` line to `.cache/run-gaps-manual.md` and **re-run the scanner**, so what is
> written was actually swept.

"Re-run the scanner" — conditional, and with no command. The **first** run of the scanner is named
nowhere on any prompt surface.

### Machine evidence that the producer was hand-invoked

`manual:*` reason classes can only enter `run-gaps.json` by two operator acts in sequence: writing
`.cache/run-gaps-manual.md`, then running the scanner over it. Class tally across the 62 populated
archived artifacts:

```
manual:*            143   (in 47 of 62 runs; manual-ONLY in 38)
in_run_repair        53   (dead signal — the node lifecycle it read is gone)
deferred_red_chain    7
RECENT 40: populated=27, of which containing >=1 manual:* = 27  (27/27)
```

**All 27 populated artifacts in the last 40 runs carry a `manual:*` class.** Each is direct,
machine-recorded proof that an operator hand-wrote the seed and then hand-invoked the producer. The
artifact is present in the recent slice *because operators compensated*, every time.

### The archived run records almost never say so

```
$ grep -rl -- "gap-sweep.js.*--json" kaola-workflow/archive/ | cut -d/ -f1 | sort -u   → 8 folders
$ grep -rl -- "gap-sweep"            kaola-workflow/archive/ | cut -d/ -f1 | sort -u   → 85 folders
```

Of those 8: five (`issue-435`, `bundle-675-676`, `bundle-677-678-679`, `bundle-973-974-975`,
`bundle-992-993-994`) mention `--json` only because the run was *working on gap-sweep itself*; two
(`issue-582`, `issue-584`) record the `--check --json` **gate**, not the producer. Exactly one run
in 140 records having run the producer:

```
kaola-workflow/archive/issue-616/finalization-summary.md:56:
Clean run — `kaola-workflow-gap-sweep.js --project issue-616 --json` returned
```

So the compensation is real and near-universal but almost entirely undocumented in the run record.

### Reading of the evidence (inference, labelled)

- **The producer step is being supplied by two compensations, not by the surface.** (a) The
  orchestrator reads `docs/conventions.md:507` — available only because this repo self-hosts; (b)
  the orchestrator runs `--check`, receives `artifact_missing` (§5, measured), and runs the scanner
  the refusal payload names. Confidence: **high** for the disjunction; **low** for the split between
  (a) and (b), which the archive does not record. Refuted by: finding an automated caller for the
  scanner, or a prompt surface that names the `--json` invocation.
- **"Costing nothing today" is true of outcomes and false of mechanism.** Recent-40 harm is 0/40;
  the last time the missing producer cost a real gap verdict was `bundle-888-…` on 2026-08-01, one
  case in 40. Confidence: **high** (both halves measured). Refuted by: a recent run with a stamped
  row and an empty artifact, which would appear as a non-zero third cross-tab row.
- **The consumer-facing exposure is larger than the self-host exposure.** A consumer install has no
  `docs/`, so its only remaining route to the producer is the `artifact_missing` refusal. Confidence:
  **medium-high** — the install measurement is direct, the behavioural consequence is not measured
  (no consumer install was exercised).

---

## Not measured

- **Which of the two compensations actually fired, per run.** The archive records the artifact, not
  the shell history that produced it. 1 of 140 runs documents the producer invocation.
- **Whether the 9 no-artifact runs ran the gate at all.** Their summaries were not read for a
  gate-verdict line; the replay establishes what the gate says *today*, not what happened then.
- **Consumer-install behaviour.** No `./install.sh` was executed and no installed tree was
  exercised. The "consumers get no `docs/`" finding comes from grepping `install.sh` and the install
  manifest, not from a performed install.
- **Historical gate semantics per run.** The replay uses the gate at `9918a4b6`. `issue-435`
  (2026-06-13, mechanism birth), `issue-653` (2026-07-11, reverse check) and the `#726`/`#836`
  grammar changes moved the goalposts; refusals dated before the relevant change are flagged as
  anachronistic above but were not re-run against period-correct gate code.
- **Folder ordering is by git-add date under `kaola-workflow/archive/`, not by finalize date.** A
  run archived long after it finalized would sort late. Spot-checked as consistent with the folder
  names' issue numbering across the recent 40; not verified for the older tail.
- **`issue-687`** (on disk, 0 tracked files, empty `.cache/`, no summary) is excluded from all
  date-ordered figures. Its provenance was not investigated.
- **No mutation proof** that the `artifact_missing` refusal is armed in the shipped four editions —
  only the canonical `scripts/` copy was executed.
