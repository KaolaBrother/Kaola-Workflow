# Tests — issue #974: a leftover run folder must not silently satisfy the resolver

**Baseline: `69264936`** (`workflow/bundle-973-974-975`, worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`).

Green at that commit before I touched anything: `node scripts/test-gap-sweep.js` → *gap-sweep tests
passed (151 assertions)*, exit 0; `node scripts/test-validation-runner.js` → *test-validation-runner:
PASSED*, exit 0.

**RED now:**

```
RED: scripts/test-gap-sweep.js T26a/T26b/T26c — 8 failures, 165 passed (exit 1)
RED: scripts/test-validation-runner.js:588 — AssertionError [ERR_ASSERTION]: #974: the resolver
     gives the SAME answer whether the worktree folder is this run's only one (leg A) or a leftover
     standing in front of the real, claim-created one in main (leg B) … (exit 1)
baseline: 69264936
```

Nothing in `scripts/kaola-workflow-gap-sweep.js` or `scripts/kaola-workflow-validation-runner.js` was
edited. Two files changed, both test artifacts.

---

## What is pinned, and what deliberately is not

The acceptance surface is a **result**: a run folder that is a leftover artifact rather than the run's
real one does not silently satisfy the resolver. Two observable properties carry it, and neither names
a mechanism:

- **DIFFERENTIAL.** A run over a leftover and a run over a *legitimately* worktree-resident run folder
  are byte-identical today — both `{"result":"pass","mapped":0,"filed":0,"noise":0}`, empty stderr,
  exit 0 — while one has a real unswept gap one directory over and the other has no other tree at all.
  Two opposite situations, one output. An implementation whose own output still cannot tell them apart
  has not seen the leftover.
- **ACTIONABILITY.** In the leftover case the run either stops being a bare vacuous pass, or its
  output names the other working tree that holds this run folder (both path spellings accepted —
  macOS `/private` twin).

**No assertion demands a non-zero exit code**, and one assertion explicitly forbids a *new* refusal
class (`scripts/test-gap-sweep.js:1390` — a refusal is allowed only under one of the five reasons the
script already ships, so a retargeted resolver reaching main's real gap may correctly refuse
`gaps_unswept`, but `reason: 'leftover_run_folder'` fails).

---

## Assertions added

### `scripts/test-gap-sweep.js` — T26 block, `:1249-1532` (22 assertions; 8 red, 14 green controls)

| line | leg | red at HEAD? |
|---|---|---|
| `:1344`, `:1348` | T26 baseline — the legitimate sole copy still passes vacuously, and names no other tree | green (control) |
| `:1365`, `:1370` | T26a fixture integrity | green |
| **`:1374`** | **T26a differential** — variant B, `--check` only | **RED** |
| **`:1379`** | **T26a actionability** | **RED** |
| `:1390` | T26a — no NEW refusal class | green (control) |
| `:1396` | T26a — main's artifact still names the real unmapped gap | green |
| **`:1414`** | **T26b scan** — scan from the polluted worktree | **RED** |
| **`:1422`** | **T26b differential** | **RED** |
| **`:1425`** | **T26b actionability** | **RED** |
| `:1429` | T26b — main's seed still unswept | green |
| `:1446` | T26c fixture — the hijacking directory is genuinely empty | green |
| **`:1451`** | **T26c scan** — bare empty directory | **RED** |
| **`:1457`** | **T26c differential** | **RED** |
| **`:1460`** | **T26c actionability** | **RED** |
| `:1484`, `:1488`, `:1493`, `:1497` | T26d — post-mirror both-trees control | green (control) |
| `:1519`, `:1526` | T26e — `KAOLA_GAP_ROOT` tier-1 with a leftover present | green (control) |

Variant coverage: **T26a** = check-only after a correct scan from main (the shape finalize actually
takes — Step 7 issues `--check` alone and the operator never re-scans); **T26b** = scan-from-polluted
then check (the issue's own chain); **T26c** = bare empty directory, `mkdir` and nothing else.

Exact red output (`node scripts/test-gap-sweep.js`, full text in
`…/scratchpad/red-974-gap-sweep.txt`):

```
FAIL: T26a (#974): --check run from a tree holding a LEFTOVER run folder, while main holds this run's
  real one with an unmapped gap in it, is byte-identical to --check over a legitimately
  worktree-resident empty run … got "[0,\"{\\\"result\\\":\\\"pass\\\",\\\"mapped\\\":0,\\\"filed\\\":0,\\\"noise\\\":0}\\n\",\"\"]"
FAIL: T26a (#974): and the difference has to be actionable … got exit 0 / {"result":"pass","mapped":0,"filed":0,"noise":0} /
FAIL: T26b (#974): a scan invoked from a tree holding a LEFTOVER run folder reports `swept` with an
  empty class list and names only the leftover it swept … got {"result":"swept","project":"proj-t26b","sweptClasses":[],"artifact":"…/wt/kaola-workflow/proj-t26b/.cache/run-gaps.json"}
FAIL: T26b (#974): scan-then-check entirely inside the polluted worktree ends in the same
  byte-identical vacuous pass as a legitimate empty run …
FAIL: T26b (#974): with nothing an operator could act on …
FAIL: T26c (#974): an EMPTY DIRECTORY of the right name is enough to redirect the scan away from the
  run folder that has the evidence in it …
FAIL: T26c (#974): and the gate that follows is again byte-identical to a legitimate empty run …
FAIL: T26c (#974): with nothing naming the other tree …
gap-sweep tests FAILED (8 failures, 165 passed)
```

### `scripts/test-validation-runner.js` — `:533-611` (4 assertions; 1 red, 3 green controls)

The second, co-derived resolver: `resolveRecordFolder` — what `run-chains --project` places the
**chain receipt** through (`resolveProjectRecordDir` → `resolveOutputPath`) and what the `record` verb
writes the final-validation binding through.

- `:578` — **leg A control**: a run folder resident only in the invoking worktree still resolves
  there. Green.
- `:588` — **RED**: one tree, one mutation. Main gains the run's real, claim-created folder
  (`workflow-state.md` + a live `.cache`), nothing about the worktree changes, and the resolver
  returns byte-identical JSON. Measured at `69264936`:
  `{"dir":"<wt>/kaola-workflow/issue-974","root":"<wt>","mainResident":false,"searched":["<wt>/kaola-workflow/issue-974"]}`
  for both legs.
- `:595` — fixture integrity (main really carries the claim signature).
- `:603`, `:607` — **leg C control**: main-resident only still resolves to main with
  `mainResident: true`. Green.

This suite is `node:assert`-based and throws on the first failure, so at HEAD everything after `:588`
(leg C, and the `#904`/`#913` blocks) does not execute. That is expected of a red in this suite; the
mutation runs below confirm all of it passes once the defect is fixed.

---

## Mutation proof — three families, run against a scratch mirror

`scripts/` was copied to `…/scratchpad/mirror/scripts/` and patched there. **The repo's production
files were never edited.** Patch scripts kept at `…/scratchpad/patch-mirror.js` and
`…/scratchpad/patch-mirror-retarget.js`.

| mutation | what it does | gap-sweep | validation-runner |
|---|---|---|---|
| **detect-and-report** | probes `git worktree list` for other trees holding `kaola-workflow/<P>/`, writes an advisory naming them to stderr; `resolveRecordFolder` gains `otherRoots` | **passed (173 assertions)** | **PASSED** |
| **teach the resolver** | prefers the tree whose run folder carries `workflow-state.md` when the invoking tree's copy does not; **no report at all** | **passed (173 assertions)** | **PASSED** |
| **constant report** (negative control) | emits a report that says the same thing in every topology (`otherRoots: []` always) | **FAILED (8 failures, 165 passed)** | **FAILED at `:588`** |

The first two are opposite mechanism families and both close the tests, which is the evidence that no
mechanism is pinned. The third is the trap this assertion set exists to catch: a "fix" that adds
output without distinguishing anything stays red.

**A fixture correction that came out of the retarget mutation.** My first draft's T26a–c fixtures
omitted `workflow-state.md` from main's run folder (inherited from the T25 fixture shape). That
quietly *forbade* the claim-signature family — the only content-level distinguisher that exists on
disk — so the fixtures now write it (`markClaimCreated`, `:1322`), which is also what a real
claim-created folder carries. The retarget mutation only passes because of that correction.

## The legitimate case that a fix must not break

`T26d` is the post-mirror window: the finalize transaction copies main's run folder into the worktree
(`workflow-state.md` included), so from that moment *"another tree also holds this folder"* is true of
a perfectly healthy run and the worktree copy is the right one to read. Pinned there: the scan sweeps
the gap **from the worktree's own `.cache`**, the artifact lands **in the worktree**, and the gate
still refuses `gaps_unswept` exit 1 naming the class. Green at HEAD and it must stay green — a repair
that treats "another tree holds it" as the signal *by itself* breaks this leg, and breaking it is
worse than the defect.

Note what T26d does **not** assert: it does not require the absence of a report. A detect-and-report
fix that emits the other candidate root here too is fine — the verdict is what matters. Requiring
silence would force the implementer to distinguish two cases the acceptance surface never asked about.

## Preservation

- **`KAOLA_GAP_ROOT` tier-1 precedence: intact.** All 151 pre-existing assertions still pass (165
  passing at HEAD = 151 + 14 new green). T26e adds the leg T25d did not have — the override facing a
  leftover in cwd.
- `node scripts/test-spawn-classification.js` → exit 0 (no new spawn sites; I reused the existing
  `run`/`runIn` helpers). `node scripts/validate-workflow-contracts.js` → exit 0.
- No existing assertion, fixture, or helper was modified or deleted. All additions.

## Cleanliness

```
$ git -C <main> status --short --untracked-files=all
?? kaola-workflow/bundle-973-974-975/{.cache/dispatch-log.jsonl,.cache/origin/selection-record.json,
   mission-list.md,premise-973.md,premise-974.md,premise-975.md,workflow-state.md}

$ git -C <worktree> status --short --untracked-files=all
 M kaola-workflow/ROADMAP.md
 M scripts/test-gap-sweep.js            ← mine
 M scripts/test-install-upgrade-rewrite.js
 M scripts/test-kimi-edition.js
 M scripts/test-opencode-edition.js
 M scripts/test-validation-runner.js    ← mine
?? kaola-workflow/.roadmap/issue-{973,974,975}.md
```

No stray `kaola-workflow/<project>/` in either tree — the defect class under test. Every fixture was
built in `os.tmpdir()` and removed in a `finally`; no tmpdir residue remains. The three other modified
test files are not mine.

## Left unpinned, with reasons

- **`run-chains.resolveOutputPath` (the chain receipt's landing path).** It returns a bare string with
  no report channel, so *any* assertion on it forces the retarget family and forbids detect-and-report.
  The defect is pinned one level up, at `resolveRecordFolder` — the resolver the acceptance surface
  names — where a return channel exists. Worth stating plainly: **if the implementer chooses a
  report-only fix for `resolveRecordFolder`, the chain receipt will still land in the leftover.**
  Whether that is acceptable is a call for the orchestrator, not something I should decide by writing
  an assertion that silently makes it.
- **The first `--check` in variant C** (`artifact_missing` before any scan). Which answer that recovery
  step gives depends on the repair, and pinning it would forbid legitimate ones.
- **Whether main's real gap gets swept** in T26b/T26c. Asserting it would pin the retarget family.
- **Edition copies.** No test runs against `plugins/**` copies of `gap-sweep.js`; the gitlab/gitea
  ports are generated from the canonical and `test-edition-sync.js` already pins that enrollment, so
  the canonical suite is the right place. If the implementer's change touches the resolver, the four
  ports need a regenerate, not a second suite.
- **`otherProjectRoots` remains unexported.** I did not add an assertion demanding the export — that
  would be pinning candidate (a).
