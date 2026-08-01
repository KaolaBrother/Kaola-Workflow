# Investigation: #896 — can a run whose finalize never happened enter the `--sink` transaction?

## VERDICT

**Reachable — and it is the sink's DESIGNED normal case, not a gap. Outcome (b): close.**

A branch carrying a live, committed `kaola-workflow/<project>/workflow-state.md` enters `--sink`
freely (measured, Leg B below). But that shape is not a fault on `--sink`: it is the **sole-archiver
posture**, one of the two postures the `--sink` transaction is built for. `SINK_STEPS` contains a
`finalize` step that calls `archiveProjectDir` itself — **the sink IS the finalizer**. Measured
end to end on a byte-identical fixture, `--sink` archived the live folder, committed the archive,
committed the live-folder deletion, pushed, closed the issue, and left the main checkout clean.
Live run state never reached the mainline.

Porting `assertNoLiveWorkflowFolder` into `sinkPreflight` would therefore **stop the sink's primary
flow**. It would turn `run_not_finalized` into a report on every sole-archiver run, and would break
`scripts/test-sink-merge.js` scenarios (c), (d), (e), (f), (h) — all of which are built by
`buildSoleArchiverFixture` (`scripts/test-sink-merge.js:194-231`), whose branch carries exactly the
live `workflow-state.md` the measurement names as the fault.

The thing the filing investigation missed is one comment and one step name:

- `scripts/kaola-workflow-sink-merge.js:1172-1175` — *"At --sink time the CURRENT run's state lives
  on the feature branch (**the live folder for a sole-archiver sink**, or the archived folder for a
  pre-finalized sink)"*
- `scripts/kaola-workflow-sink-merge.js:2036-2039` (#700) — *"the sole-archiver rename moves the LIVE
  folder … **When that live folder was tracked (committed on the branch, then merged into main)**,
  its removal must be committed too"* — the `--sink` path has code written **specifically** for the
  shape #896 calls unhandled.

**Separately measured, and a real defect (not #896's, and it needs its own issue):** the harm
`assertNoLiveWorkflowFolder` prevents — live run state published to the mainline — **is** reachable
on `--sink`, by a different route. When the finalize step's `archiveProjectDir` fails to archive
*without* returning `archive_incomplete`, the failure is swallowed, `receipt.archive_dest` stays
unset, the #700 `archive_commit` guard is scoped to a *set* dest so it never fires, and the sink
reports `status: sinked` / exit 0 while pushing the live folder to `origin/main` and closing the
issue. Constructed three ways, one of them an ordinary `chmod 555` (Legs C, D, E). The remedy is not
a preflight port — it is making the finalize step honest about an archive that did not happen.

---

## CORRECTED FACTS

Measured at `3e2019f6` (`git status` clean apart from the untracked
`kaola-workflow/bundle-896-897-898/` run folder). Every line number below re-read from source.

| # | Issue #896 claim | True? | What is actually there |
|---|---|---|---|
| 1 | `assertNoLiveWorkflowFolder` is at `scripts/kaola-workflow-claim.js:274-300` | **FALSE — wrong file** | The function is at **`scripts/kaola-workflow-sink-merge.js:319-346`**. **No `claim.js` in any of the four editions contains the symbol at all.** `claim.js:274-300` is the tail of `listOpenIssues` plus `projectNameForIssue` / `buildBranchName` / `worktreePathFor` — unrelated. |
| 2 | It is wired in at `scripts/kaola-workflow-claim.js:2488` | **FALSE — wrong file** | The single call site is **`scripts/kaola-workflow-sink-merge.js:2572`**. `claim.js:2488` is inside `archiveProjectDir`'s linked-run copy branch (`copyDir(src, dest)` region) — unrelated. |
| 3 | It is wired into **the legacy path only** | **TRUE** | `main()` at `:2457` routes `--sink` to `runSinkTransaction` at `:2516` and **returns at `:2517`**. The legacy precondition block starts at `:2571`. `--sink` never reaches `:2572`. |
| 4 | `sinkPreflight` is at `scripts/kaola-workflow-sink-merge.js:1615` | **FALSE — wrong line** | `sinkPreflight` is at **`:1324-1539`**. Line `1615` is `let receiptPath = loaded.receiptPath;` inside `runSinkTransaction` (`:1594`). |
| 5 | `sinkPreflight` has no equivalent measurement | **TRUE, but misleading** | `sinkPreflight` never takes the branch-tip liveness measurement. It does not need to: the transaction's own `finalize` step (`:1894-1985`) calls `archiveProjectDir` and performs the finalization. See §THE TRACE. |
| 6 | (implied) the shape is unhandled on `--sink` | **FALSE** | Measured: `--sink` completes it correctly. Leg B. |

### Two further corrected facts, found while checking the above

7. **`docs/api.md:495-511` is doubly stale.** It lists four items under **"Pre-merge guards (all
   three editions)"**: `assertNoLiveWorkflowFolder`, `assertBranchPushedToUpstream`,
   `assertBranchHasNonWorkflowChanges`, and `worktree_dirty`. Measured, **only `worktree_dirty` runs
   on `--sink`** — the routed invocation. The other three are legacy-only, and the section gives a
   reader no way to tell. It also still says `assertNoLiveWorkflowFolder` **"refuses to merge"**;
   it has been CONVERTED — it emits `result: 'report'` (`:2576-2583`), never `refuse`. Its
   `git cat-file -e HEAD:{path}` description is stale too: #346 rescoped the probe to
   `<branch>:` (`:321-324`).

8. **`--sink` is the only routed invocation.** `templates/routing/slots.js:124`
   (`fz-sink-merge-run`) renders `--sink --json` on all three forges. No rendered command or SKILL
   surface invokes `sink-merge.js` without `--sink`. The legacy path is reachable only by hand.

---

## THE TRACE

### Every call path to `assertNoLiveWorkflowFolder`

```
scripts/kaola-workflow-sink-merge.js:319   function assertNoLiveWorkflowFolder(mainRoot, project, branch)
scripts/kaola-workflow-sink-merge.js:2572  ← the ONLY call site (grep on the NAME, all four editions)
```

Entry point: `node kaola-workflow-sink-merge.js --branch B --project P` **without `--sink`**.
Not exported (`module.exports = { classifyMergeError, assertBranchHasNonWorkflowChanges }`,
`:2710`), so no other module can reach it.

### Every call path to `sinkPreflight`

```
scripts/kaola-workflow-sink-merge.js:1324  function sinkPreflight(mainRoot, project, branch, issueNumbers)
scripts/kaola-workflow-sink-merge.js:1684  ← the ONLY call site, inside runSinkTransaction's `preflight` step
```

Entry point: `node kaola-workflow-sink-merge.js --branch B --project P --sink`. Also not exported.

### The fork

`main()` `:2457` → `isSinkMode = rawArgv.includes('--sink')` `:2474` → `if (isSinkMode) { …
runSinkTransaction(args, mainRoot, defBranch); return; }` `:2507-2518`. **Two disjoint pipelines.**

### Which of the five legacy preconditions run on `--sink`

| precondition | legacy call | `--sink` call | on `--sink`? |
|---|---|---|---|
| `assertCleanWorktree` | `:2571` | — | no |
| `assertNoLiveWorkflowFolder` | `:2572` | — | **no** |
| `assertBranchPushedToUpstream` | `:2586` | — | no (the `push_upstream` step pushes instead) |
| `assertBranchHasNonWorkflowChanges` | `:2588` | — | **no** |
| `assertWorktreeClean` | `:2603` | `:1341` via `sinkPreflight` | **yes** (#562 ported it) |

`runTestGate` runs on both (`:576` legacy rebase, `:640` — reached from the `--sink` merge step).

### Does anything else on the `--sink` path measure the same fact under another name?

Swept for anything reading `kaola-workflow/<project>/` liveness, `workflow-state.md` presence, or
archive state during the `--sink` transaction:

1. **`sinkPreflight` bucket 2, `:1395-1416`.** `projStateFiles` includes
   `kaola-workflow/<project>/workflow-state.md`, and `:1408` runs
   `git cat-file -e <branch>:kaola-workflow/<project>/workflow-state.md` — **the byte-identical git
   probe `assertNoLiveWorkflowFolder` uses at `:327`.** The *response is inverted*: a `true` here is
   licence to `fs.unlinkSync` the untracked main-root duplicate and **proceed** (`:1531-1536`),
   where at `:333` the same `true` is a stop. It is also gated on the path being untracked (`??`) in
   the main root, which the branch-tip question is not. **Same fact, opposite verdict, by design** —
   bucket 2 is deduplicating a working-tree copy, not judging the run.
2. **`readCurrentClaimTs` `:1164-1196`.** Reads `workflow-state.md` from the branch ref FIRST,
   trying **both** `kaola-workflow/<project>/…` and `kaola-workflow/archive/<project>/…` — and its
   comment names the live-folder case as a supported posture (quoted in §VERDICT). Feeds
   `loadOrInitReceipt`'s cross-run reinit; takes no verdict.
3. **`deriveSinkKeepOpen` `:1549-1576`.** Probes both the archived and the live folder for
   `issue_action`; "a missing file reads as no-signal, never an error".
4. **`archive_commit`'s `liveTracked` probe `:2038-2039`.** `git ls-tree HEAD -- kaola-workflow/<project>/`
   — exists **precisely** to stage the live folder's deletion when it was "committed on the branch,
   then merged into main". This is the `--sink` path's handling of the #896 shape.
5. **`finalize` step `:1894-1985`.** `archiveProjectDir(mainRoot, project, 'closed', …)` — the
   archival itself.

Nothing on the `--sink` path treats branch-tip liveness as a fault, and the mechanism above is why.

---

## THE CONSTRUCTED SHAPE

All fixtures under `/private/tmp/claude-501/…/scratchpad`; nothing written inside the repo, and the
repo's own `kaola-workflow/` state was not touched. Scripts: `ab-unfinalized.js`, `ab-helpers.js`,
`cd-archive-fault.js`, `e-readonly-archive.js`. Env for every leg:
`KAOLA_WORKFLOW_OFFLINE=0`, `KAOLA_WORKFLOW_SKIP_TESTGATE=1`, `KAOLA_GH_MOCK_SCRIPT=<mock>` — the
same harness contract `scripts/test-sink-merge.js` uses.

### The sequence that produces a live unfinalized folder and enters `--sink`

Copied verbatim from `scripts/test-sink-merge.js :: buildUnfinalizedBranchFixture` (`:1986-2013`),
so the shape is the repo's own definition of "the run was never finalized", not mine:

1. `git init -b main` + bare remote; commit `kaola-workflow/.roadmap/issue-N.md` + `ROADMAP.md`; push.
2. `git checkout -b workflow/issue-N`.
3. Write `kaola-workflow/issue-N/workflow-state.md` (a live `## Sink` block with `claim_ts`) and an
   implementation file. **No `finalize` is ever run.**
4. `git add -A && git commit && git push -u origin workflow/issue-N`; `git checkout main`.
5. `node scripts/kaola-workflow-sink-merge.js --branch workflow/issue-N --project issue-N --json
   --sink --issue N`

**No step is impossible. Nothing blocks it.** Precondition verified before each leg:
`git cat-file -t <branch>:kaola-workflow/<project>/workflow-state.md` → `blob`.

### Observations

| Leg | Entry point | Exit | Envelope | main advanced | `main:` live `workflow-state.md` | `main:` archive tree | issue closed |
|---|---|---|---|---|---|---|---|
| **A** | legacy (no `--sink`) | 1 | `result:report`, `reason:run_not_finalized` | no | absent | absent | no |
| **B** | `--sink` | **0** | `result:ok`, `status:sinked` | yes (+pushed) | **absent** | **tree (+`workflow-state.md` blob)** | yes |

Leg A also printed the finding on stderr (`sink-merge: FINDING run_not_finalized: …`) with both
remediation paths. Leg B's receipt:
`archive_dest: "kaola-workflow/archive/issue-90001"`,
`archived_paths: ["…/finalization-summary.md", "…/workflow-state.md"]`, all eight `SINK_STEPS` `done`.
**Main checkout clean afterwards (`git status --porcelain -uall` empty).**

That is the whole answer to the mission's question: the shape enters `--sink`, and `--sink`
finalizes it.

### The adjacent defect — where the harm IS reachable on `--sink`

Same fixture, plus one fault that stops `archiveProjectDir` from archiving. Three independent
triggers, from most artificial to most ordinary:

| Leg | Trigger | Exit | Envelope | `origin/main:` live `workflow-state.md` | `receipt.archive_dest` | issue closed |
|---|---|---|---|---|---|---|
| **C** | `KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL=1` (the shipped seam, `claim.js:2405-2407`) | **0** | `result:ok`, `status:sinked` | **blob — PUBLISHED** | `undefined` | yes |
| **D** | `kaola-workflow/archive` committed as a **file** → `mkdirSync` throws (no env var) | **0** | `result:ok`, `status:sinked` | **blob — PUBLISHED** | `undefined` | yes |
| **E** | `chmod 555 kaola-workflow/archive` → `renameSync` throws `EACCES` (no env var, ordinary tree) | **0** | `result:ok`, `status:sinked` | **blob — PUBLISHED** | `undefined` | yes |

In C/D/E the run record (`workflow-state.md` **and** `mission-list.md`) reached `origin/main` as live
tracked state, the issue was closed, and the sink reported success. D and E additionally left the
main checkout dirty (`M …/workflow-state.md`, `?? …/finalization-summary.md`) after `status: sinked`.

**The mechanism, in three lines of shipped code:**

- `scripts/kaola-workflow-sink-merge.js:1963-1967` — the finalize step's `catch (e)` rethrows only
  `TypeError`/`ReferenceError`; every other throw is swallowed. `archive_incomplete` is the only
  *returned* value it gates on (`:1925`), so `archived:false` **without** that flag
  (`archive_forced_refusal`) and a plain throw both pass silently.
- `scripts/kaola-workflow-sink-merge.js:2113` — the #700 guard is
  `if (receipt.archive_dest && !archiveAtHead && !archiveIgnored)`. **An archive that never started
  leaves `archive_dest` unset, so the guard cannot fire.** It catches a dest that escaped the
  commit; it cannot catch a dest that never existed.
- `scripts/kaola-workflow-sink-merge.js:2064-2065` — the whole staging block is gated on
  `fs.existsSync(archiveDir)`, absent here, so nothing is staged and nothing is committed.

This is a `#897`/`#898`-shaped finding, not #896's. Confidence: **high** (three independent
constructions, one of them a bare permission bit). What would refute it: showing `archiveProjectDir`
cannot throw or return non-`archive_incomplete` failure on any real filesystem — Leg E's `chmod 555`
refutes that directly.

---

## NARROWING

- **Leg A vs Leg B (axis: `--sink` flag alone, identical fixture).** Eliminated "the measurement is
  simply missing from a path that needs it". Leg B does not merely skip the measurement; it performs
  the remediation the measurement's own `operator_hint` prescribes.
- **Leg B vs Legs C/D/E (axis: whether `archiveProjectDir` archives).** Eliminated "`--sink` can
  never publish live run state". It can — but the discriminator is the archive, not the branch tip,
  so the discriminator a port would install is the wrong one.
- **Legs C/D/E (axis: the fault's nature).** Eliminated "this needs a test-only env var". E uses a
  mode bit.
- **Call-site sweep on the function NAMES across all four editions.** Eliminated "`claim.js` holds a
  second copy" and "some other entry point reaches it".

---

## COST OF THE PORT — and the recommendation

**Recommendation: do not port. Close #896 under its own outcome (b).**

Costed anyway, since the issue asks:

- **Function**: `sinkPreflight`, `scripts/kaola-workflow-sink-merge.js:1324`, ahead of the porcelain
  scan; the finding would surface through `runSinkTransaction`'s `:1685-1697` handler.
- **Size**: ~6 lines canonical (`assertNoLiveWorkflowFolder` already exists in the same file — a
  call, a null check, a typed return). ×4 files for cross-edition parity: canonical, the
  `plugins/kaola-workflow/` byte twin, plus the gitlab (`:287`/`:1361`) and gitea (`:286`/`:1354`)
  hand-ports, which have the identical legacy-only wiring.
- **Vocabulary**: `run_not_finalized`, already in `scripts/prose-census-baseline.json:417`. It would
  have to **REPORT**, not refuse — but note that `:1685-1697`, the only handler a `sinkPreflight`
  return reaches, hardcodes `result: 'refuse'`. A correct port therefore also needs a report-shaped
  arm in that handler, so it is **not** a 6-line change; call it ~20 lines across 4 files plus the
  handler. ("Nothing refuses" — a port that refused would be wrong twice over.)
- **What it would cost in behaviour — the reason not to do it**: every sole-archiver `--sink` run
  would stop. That is the workflow's routed finishing flow (`templates/routing/slots.js:124`), and
  it is the shape of `test-sink-merge.js` scenarios (c), (d), (e), (f), (h). The port trades a
  working transaction for a report about a state the transaction was built to consume.

**What #896's evidence actually justifies filing instead**, in priority order:

1. **The finalize-step archive failure is silent** (Legs C/D/E). The `--sink` transaction reports
   `status: sinked` over an archive that did not happen, publishes live run state, and closes the
   issue. Fix locus: `scripts/kaola-workflow-sink-merge.js:1963-1967` (stop swallowing) and `:2113`
   (a guard that fires on *no archive*, not only on *a dest that escaped the commit*). This is the
   `run_not_finalized` harm, arriving through the door nobody watched.
2. **`docs/api.md:495-511`** — three of four "pre-merge guards" do not run on the routed `--sink`
   invocation, and the live-workflow-state entry still says "refuses" for a converted measurement
   with a stale `HEAD:` probe description.
3. **`assertBranchHasNonWorkflowChanges` is legacy-only too** (`:2588`, no `--sink` equivalent —
   `no_implementation_changes` appears nowhere in the transaction). Unlike #896's, **this one's
   premise survives**: a branch whose entire diff is `kaola-workflow/**` is a genuine fault on
   `--sink` as much as on the legacy path, and the sink has no `finalize` step that repairs it.
   **Not constructed** — I did not run it; the claim rests on the call-site sweep alone.

---

## OPEN

- The `assertBranchHasNonWorkflowChanges` gap (item 3 above) is **inferred from call sites, not
  measured**. Recording it as *not constructed*, not as *reachable*.
- Legs C/D/E were run on the **canonical** edition only. The gitlab/gitea ports have the same
  `runSinkTransaction` shape (`:1517`, `:1510`), so the defect very likely ports — **not measured**.
- I did not measure the **worktree-postured** (`cmdFinalize --keep-worktree` then `--sink`) flow
  against Legs C/D/E. In that posture the archive already exists at HEAD from the merge and
  `archive_dest` is legitimately unset, which is exactly the case the #700 guard deliberately lets
  pass — so whether the fix for item 1 can distinguish the two postures is an open design question,
  not a measured fact.
- I did not run `scripts/test-sink-merge.js` or the walkthrough. No production file was modified, so
  there was nothing to regress; the claim that a port would break scenarios (c)–(h) is read from
  `buildSoleArchiverFixture`'s fixture shape, **not** from a failing run.
