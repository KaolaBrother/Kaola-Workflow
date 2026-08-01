# Fix — the `record` verb: C5's archive-band violations (D1, D2) + V1 (worktree lane) + V5 (dead step)

> **Scope note.** This report was written for D1/D2 and then extended with **V1** and **V5** on the
> orchestrator's follow-up. The four md5s and the suite table at the end are the **final** state covering
> all four defects; the D1/D2 sections' md5 quote was superseded (noted inline).

- **Task**: close the two holes adv-guards found in claim C5 — `record` must never write inside
  `kaola-workflow/archive/**`, not the record and not the `--output` JSON. No redesign of the verb; its
  cwd-binding half survived the verifier's attack and is untouched.
- **Verification tier**: `smoke-integration`. The behaviour has no authored test (custody is
  `tdd-guide`'s and I wrote none), so it is proven by executable fixtures driving the **shipped CLI**,
  each defect reproduced *before* the fix on a byte-snapshot of the pre-fix file, plus **four mutation
  controls** in a scratch mirror showing every sub-mechanism is individually load-bearing. The four
  suites named in the brief are green after (`test-validation-runner`, `test-finalize-door`,
  `validate-script-sync`, walkthrough at full scope), plus two contract validators.
- **Worked in**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`
  (branch `workflow/bundle-900-901-902-903`). **Nothing committed.** Main root untouched.
- Node v24.14.0, `uid=501`. Filesystem measured **case-insensitive** (`df`: `/dev/disk3s5`) — load-bearing
  for D1, see below. `KAOLA_WORKFLOW_OFFLINE=1` set **explicitly** on every invocation, never inherited.
- Scratch: `…/scratchpad/fixrunner/` — `harness.js` (14 CLI legs), `byteident.js` (same-fixture byte
  control), `mutate.js` (4 mutations), `edges.js` (worktree / non-git / no-archive-dir / API axes),
  `before-scripts/` (the pre-fix snapshot, md5 `8a781aeda1ad244125f8073964b1ca82`).

## Contract: did it change? **No.**

**No new `reasons` token, and no change to the published enum, the output keys, or the exit-code table.**
Both rejections land in the exit-code register the contract already publishes for this exact class:

> `2` | argument/usage error (**bad `--project`**, `--verdict`, `--command`, duplicate flag, missing flag,
> unknown subcommand). Message on stderr + usage.

Why not the `inconclusive` / exit-1 register the dispatch leaned toward — stated plainly, because it is
the one judgement call in this fix:

1. **None of the three published tokens fits, and `project_folder_missing` would actively mislead.** Its
   operator remedy is positional — "record from the worktree", "this run is already archived". `--project
   archive` is *categorical*: no checkout, no re-run and no move can turn the band into a run folder.
   Reusing the token would ship a report whose own remedy is unreachable. (The kernel agrees the band is
   not a project — `NON_PROJECT_FOLDERS` at `kaola-workflow-adaptive-schema.js:880` — so "no project
   folder named `archive`" is *true*, but the true statement is not the useful one.)
2. **`--output` cannot use that register at all.** To leave nothing bound, the check must run *before* the
   record is written — at which point there is no measurement to report inconclusive. An
   inconclusive envelope emitted after a successful record would be a lie about what happened.
3. So exit 1 would have required minting a fourth token, which the dispatch declined once already on the
   13-rendered-surfaces grounds. Exit 2 needs **nothing new**.

**stdout on rejection: measured 0 bytes**, with the message plus the pre-existing `usage()` block on
stderr (5 lines) — exactly the published exit-2 shape, and nothing bound:

```
$ cd <fixture> && node …/kaola-workflow-validation-runner.js record --project archive --verdict pass --command "npm test"
EXIT=2   stdout bytes: 0   stderr lines: 5
```

**CONFIRMED by the orchestrator**: exit 2, the already-published usage register, **no fourth `reasons`
token**; the contract stays as published. Reason (a) settled it — a positional remedy on a categorical
error is a hint the operator cannot act on, which is the defect class this bundle removed from two other
hints — and (b) is decisive for `--output`, since refusing before the write leaves no measurement to
report and `inconclusive` would misdescribe what happened.

---

## D1 — `--project archive` wrote into the archive band

### Reproduction (pre-fix snapshot, md5 `8a781aeda1ad244125f8073964b1ca82`)

Fixture: consumer repo (no `package.json`), one commit, a real closed archive
`kaola-workflow/archive/issue-9/{workflow-state.md,.cache/evidence.md}`, live folders `issue-555` and
`issue-archive-cleanup`.

| leg | command | before |
|---|---|---|
| `D1-archive` | `record --project archive --verdict pass --command "npm test"` | **exit 0**, `outcome:"recorded"`, `record_path=<root>/kaola-workflow/archive/.cache/final-validation.md` |
| `D1-case` | `--project Archive` | **exit 0**, `record_path=…/kaola-workflow/Archive/.cache/final-validation.md` |
| `D1-case-upper` | `--project ARCHIVE` | **exit 0**, `record_path=…/kaola-workflow/ARCHIVE/.cache/final-validation.md` |

The two case legs are **new observations, not in the C5 report**, and they are not cosmetic: the harness
enumerates the band by walking the *lowercase* `kaola-workflow/archive`, and after each case leg it
reports `ARCHIVE BAND added files: [".cache/final-validation.md"]`. On this (case-insensitive)
filesystem `Archive/` **is** `archive/`, so `--project Archive` reaches the identical directory and
manufactures the identical phantom-`.cache` contamination.

### Fix

`scripts/kaola-workflow-validation-runner.js:1303-1312` (final numbering) — checked where the project path is constructed,
because the question is *where `--project` points*, which is not knowable from the segment alone:

```js
  if (isArchiveBandPath(candidateRoot, projectPath)) {
    throw new Error('--project must name a live run folder under kaola-workflow/, and ' + projectPath
      + ' resolves into the durable archive band (kaola-workflow/archive/**) — …');
  }
```

The predicate — expressed as a **location**, never a name list:

| `file:line` (final, after the V1 change shifted them) | what |
|---|---|
| `:1151-1166` | header: why the band is not a write target (the closure-audit consequence), and the four measured routes to it |
| `:1167-1169` | `archiveBandRoot(root)` — the band as one named location; `archivedProjectPaths` now reads it too (`:1242`, behaviour-identical substitution of the literal it already spelled) |
| `:1174-1187` | `realResolve(target)` — `.`/`..` normalized, symlinks followed as far as the path exists, not-yet-created tail left literal |
| `:1189-1196` | `isSameDirectory(a, b)` — `dev`+`ino` |
| `:1198-1207` | `isArchiveBandPath(root, target)` — literal containment, then filesystem **identity** of the target or any ancestor against the band |
| `:1214-1225` | `owningWorkingTree(target)` — the repo that owns a path (used by D2) |

Why identity and not a case-insensitive string compare: **measured** — `fs.realpathSync` on darwin does
**not** canonicalize case (`fs.realpathSync('<x>/kaola-workflow/Archive')` returns `…/Archive`), so a
string can not see the case route; and a case-insensitive compare would over-reject on a
case-**sensitive** filesystem, where `Archive/` is a genuinely different directory that should keep
recording. Identity is exactly right in both worlds.

### After

All three legs **exit 2**, `ARCHIVE BAND added files: []`, `closed evidence.md unchanged? true`, and no
band directory is created where none existed.

---

## D2 — `--output` had no band check at all

### Reproduction (pre-fix), four routes

| leg | `--output` | before |
|---|---|---|
| `D2-direct` | `kaola-workflow/archive/issue-9/.cache/injected.json` | **exit 0**, written **into the real closed archive** |
| `D2-dotdot` | `out/../kaola-workflow/archive/issue-9/.cache/injected2.json` | **exit 0**, written |
| `D2-symlink` | `bandlink/injected3.json` (`bandlink -> …/archive/issue-9/.cache`) | **exit 0**, written |
| `D2-abs` | absolute path into the band | **exit 0**, written |
| `edges E4` | `<main>/kaola-workflow/archive/issue-9/.cache/main-leak.json`, invoked **from the linked worktree** | **exit 0**, written |

`D2-dotdot`, `D2-symlink` and `E4` are also new observations. **E4 is the one that changed the design**:
my first cut checked `--output` against the *record's candidate root*, and E4 still wrote — under a
worktree run the durable archive lands in **main** first, so main's band is reachable by a root the
candidate cannot see. Kept as mutation `M4` below rather than quietly dropped.

### Fix

`scripts/kaola-workflow-validation-runner.js:1454-1463` (final numbering), in `main()`'s `record` branch, **before** any
work:

```js
    const outputRoot = values.output ? owningWorkingTree(values.output) : '';
    if (outputRoot && isArchiveBandPath(outputRoot, values.output)) {
      throw new Error('--output must not resolve inside the durable archive band …');
    }
```

Checked before the record write, not after, so nothing is bound and nothing is half-done. The root is the
working tree that **owns the output path** (its own `git rev-parse --show-toplevel`, from the deepest
existing ancestor), not the candidate root — that is what closes E4, and it also closes the
non-git-cwd-into-a-real-repo case (E5).

### After

All five routes **exit 2**, nothing written, closed evidence byte-unchanged.

---

## Positive controls — over-rejection would be a defect, so each is measured

| control | after | note |
|---|---|---|
| `P1-live` — `--project issue-555` | **exit 0**, `outcome:"recorded"`, record at `…/issue-555/.cache/final-validation.md` | **byte-identical to before**, see below |
| **`P2` — `--project issue-archive-cleanup`** | **exit 0**, recorded | a name that merely *contains* `archive` is **not** rejected |
| `P3` — `--output out/result.json` | **exit 0**, file written | legitimate `--output` outside the band still works |
| `P4` — invoked from `src/` | **exit 0**, same candidate root | subdirectory invocation unaffected |
| `P5` — `--verdict fail` | **exit 0**, `verdict: fail` written | exit-0-means-written contract intact |
| `P6` — `--project issue-777` (absent) | **exit 1**, `reasons:["project_folder_missing"]`, wrong-checkout hint | untouched |
| `P7` — `--project issue-9` (archived) | **exit 1**, `project_folder_missing` + the archived message + `archived_project_paths` | impl-900's FOLLOW-UP 2 branch untouched |
| `E1` — repo that has **never archived** | `--project archive` **exit 2**, and **no band directory created**; `--project issue-555` **exit 0** | the literal leg covers a not-yet-existing band |
| `E2` — programmatic `recordFinalValidation({project:'archive'})` | throws, message names the band; `issue-555` still records | the API refuses too, not only the CLI |
| `E4` control — plain record in the worktree | **exit 0**, `candidate_root` = the worktree | binding half untouched |
| `E5b` — non-git cwd, `--output` outside the band | **exit 1** (`candidate_root_unresolved`), **file written** | the band check does not swallow legitimate output |

### Byte-identity of a legitimate record (the control that had to be built correctly)

The candidate hash is a content address over the git tree, and two freshly-`init`'d fixtures have
different HEADs — so a before/after comparison across fixtures is **meaningless**. Measured on **one**
fixture, starting from identical pre-existing agent prose (`byteident.js`):

```
exit before=0  after=0  after-again=0
record bytes IDENTICAL (before vs after)      : true
record bytes IDENTICAL (after vs after-again) : true      ← still idempotent
stdout IDENTICAL (before vs after)            : true
prose survived                                : true
```

---

## Mutation controls — every sub-mechanism is armed, and none is redundant

Run in a **scratch mirror** (`mut/<name>/` holding a patched copy of the runner plus the schema sibling).
**The worktree was never mutated and never reverted** — eight agents have uncommitted work there. Each
mutation asserts its anchor matches exactly once before applying.

| mutation | what it disables | legs that regress to exit 0 |
|---|---|---|
| `M1_no_identity` | the `dev`+`ino` ancestor walk | **`D1-case`, `D1-case-upper` only** — everything else still refused |
| `M2_no_realpath` | symlink following in `realResolve` | **`D2-symlink` only** |
| `M3_predicate_dead` | the whole predicate | **all 7 D legs + E4** (i.e. reproduces the pre-fix behaviour) |
| `M4_output_root_is_candidate` | `owningWorkingTree` → the record's candidate root | **E4 (main's band from the worktree) only** |

No mutation changed any positive control (`P1`–`P7` identical in all four). M1/M2/M4 each regress
exactly one route, which is what distinguishes a live sub-mechanism from decoration — the case route is
caught *only* by identity, the symlink route *only* by realpath, and main's band *only* by the
owning-tree resolution.

---

## Cross-edition parity — four copies byte-identical

Propagated with `cp` (**not** `edition-sync.js --write`, which also syncs `COMMON_SCRIPTS` and would drag
siblings' in-flight files into the plugin trees). At the D1/D2 stage all four read
`b958042d88ca9b9a58cc1796796ad2d2`; **superseded by the V1/V5 md5 at the end of this report.**

## Files changed — four, and nothing else

`scripts/kaola-workflow-validation-runner.js` plus its three plugin copies. At the D1/D2 stage the diff
against the pre-fix snapshot was **95 lines added, 1 removed** — the single removal being the literal
`path.join(candidate, 'kaola-workflow', 'archive')` substituted by `archiveBandRoot(candidate)`
(behaviour-identical). No test file, no kernel copy, no `templates/routing/**`, no rendered surface, no
`docs/`, and none of `claim.js` / `sink-merge.js` / `closure-audit.js`. No export added (see *pins*
below). Still uncommitted. **Final totals are in the V1/V5 section.**

## Suites at the D1/D2 stage — real exit codes, bare `echo $?`, never through a pipe, serial

| command | after |
|---|---|
| `node scripts/test-validation-runner.js` | **exit 0** — `test-validation-runner: PASSED` |
| `node scripts/test-finalize-door.js` | **exit 0** — 208 assertions (T7, T8, T8l green) |
| `node scripts/validate-script-sync.js` | **exit 0** |
| `node scripts/simulate-workflow-walkthrough.js` (**full scope**, `index:1,total:1`) | **exit 0** — **198/198** scenarios, 2059 spawns |
| `node scripts/validate-workflow-contracts.js` | **exit 0** |
| `node scripts/validate-kaola-workflow-contracts.js` | **exit 0** |

**All six were re-run after the V1/V5 change — see that section for the authoritative table.**

`pwd` confirmed the worktree for every run; `pgrep -fl simulate-workflow-walkthrough` was empty before
the walkthrough started, so only one instance ran (the suite is spawn-bound and concurrent runs give
false reds).

**The 197 → 198 count, attributed (no longer open)**: the brief's baseline was 197/197 and I measured
**198/198**. The orchestrator has since settled it — a `tdd-guide` landed 14 pins across three files
including one new walkthrough scenario while I worked, and reported 198/198 itself. So 198 is the correct
current scope and nothing of mine caused the delta. `##KW-SHARD` in `…/scratchpad/fixrunner/walk.log`
carries the census.

**Baseline caveat, stated honestly**: my "before" for the *suites* is the brief's attestation plus these
green post-change runs, not a pre-change run of my own. My "before" for the *behaviour* is a real
measurement — the byte-snapshot in `before-scripts/`, whose md5 matches what the tree held when I
started.

## Where pins are needed (for `tdd-guide` — I authored none)

Extending impl-900's list; these are the pins for **this** change. All must drive the **shipped CLI**
(`spawnSync` the script), because the `--output` check lives in `main()` and is unreachable from a
`require()`:

11. **`--project archive` is refused, exit 2, nothing written, no band directory created.** Assert on
    the *absence* of a new file under `kaola-workflow/archive/**`, not only on the exit code — an
    assertion on the code alone passes on a verb that refuses *and* writes.
12. **The case-variant legs** (`--project Archive`, `--project ARCHIVE`). These need a
    case-insensitivity **precondition probe** in the fixture (`fs.existsSync` of the mixed-case band),
    and must be skipped-with-a-reason on a case-sensitive filesystem — otherwise the pin is a false red
    on Linux CI-less runs. Mutation-prove by deleting the identity walk: if the test still passes, it is
    pinning the literal leg, not the case leg.
13. **`--output` into the band: four routes** — direct, `..`, symlink, and **`<main>/…/archive` from a
    linked worktree**. The worktree leg is the one a plausible-looking test omits, and it is the one that
    forced `owningWorkingTree`; without it the pin passes on a candidate-root-only check.
14. **The over-rejection controls, in the same test**: `--project issue-archive-cleanup` records at exit
    0, and `--output` outside the band works. A band test with no over-rejection control cannot tell a
    correct predicate from a blanket refusal.
15. **The record is byte-identical for a legitimate project across the change** — pin idempotence over
    two invocations on **one** fixture. Two fixtures have different HEADs and therefore different
    hashes; a test that compares across fixtures will fail for the wrong reason.
16. **The programmatic API refuses too** (`recordFinalValidation({project:'archive'})` throws), so the
    guard is not CLI-only.

**`isArchiveBandPath` stays UNEXPORTED — settled.** It is not exported today
(`typeof m.isArchiveBandPath === 'undefined'`, measured in `edges.js` E2) and it stays that way by
orchestrator ruling: the pins drive the shipped CLI, which is the faithful level, because the `--output`
check lives in `main()` and a unit test of the predicate would reach it by a path the CLI does not use —
weaker evidence, not stronger. So every band pin below is a `spawnSync` of the script.

## Unverified / explicitly not measured

- **WATCH ITEM (ruled: do not build).** A band-shaped directory belonging to **no git repository** still
  receives the `--output` JSON (`edges.js` E3: non-git cwd,
  `--output <non-repo>/kaola-workflow/archive/issue-9/leaked.json` → the *inconclusive envelope* lands
  there, exit 1). The dangerous half of the axis **is** closed — E5 shows a non-git cwd pointing into a
  **real** repo's band is refused at exit 2. Recorded, not built, on three grounds (orchestrator ruling,
  reasons restated because a watch item without its reason rots into a TODO):
  1. closing it needs band matching **by name with no repository to anchor it** — a blacklist that goes
     stale silently, which is worse than the hole;
  2. the harm is structurally different: with no repository there is no durable archive to corrupt, so
     the actual consequence — a committed archive, an unrepairable `archive_content_incomplete` for a
     phantom project — cannot occur;
  3. no observed failure demands it.
- **A case-variant `kaola-workflow` segment** (e.g. `--output KAOLA-WORKFLOW/archive/x.json`): not
  measured. The band is derived by `path.join(root, 'kaola-workflow', 'archive')` and then compared by
  identity, so on a case-insensitive filesystem the *identity* leg should catch it via the ancestor walk
  — I did not build the leg, so I am not asserting it.
- **A full `cmdFinalize` transaction.** Out of scope for this fix; nothing in it touches the finalize path.
- **Windows.** `realResolve`/`isSameDirectory` use `path.sep` and `dev`+`ino`; `ino` is emulated on
  Windows and I have no box. The literal-containment leg is platform-independent; the identity leg is not
  proven there.
- **`npm test` / the four chains.** Not run — the diff is edition-touching by construction (four copies),
  so a four-chain receipt is owed at finalize. That is the orchestrator's call.
- **No refusal added to the workflow.** Both exits are argument rejections on a producer CLI; nothing in
  the finalize path, the chains or the sink gained a gate, and the gate's own classification behaviour is
  unchanged.

---

# V1 — `record` in the worktree lane, and V5 — the dead resolution step

Assigned after the D1/D2 fix, on a second reviewer's finding that outranked it. Same file, so same owner.

- **Verification tier**: `smoke-integration`. The acceptance criterion is a **green gate over the real
  code path**, driven two ways: the gate's own two-line pair in-process, and the **real
  `claim.js finalize --check` CLI** from the linked worktree. Three mutation controls prove the fix's
  parts are each load-bearing, including one that reproduces the exact wrong answer the dispatch warned
  against.
- Scratch: `wtlane.js` (9 legs), `e2e.js` (the real CLI), `mutate2.js` (3 mutations).

## The premise, verified before touching anything

Not taken on report. Read out of the source and measured:

1. **The gate reads the two halves from two different places.** `claim.js:3609-3614`
   (`probeFinalizeValidationGate`): `cacheDir = <authorityDir>/.cache`, and
   `gateRoot = resolveFinalizeCheckRoot(root)` where `root` is the invoking tree. So the **record** comes
   from the authority folder and the **hash** from the invoking shell's tree.
2. **In the worktree lane the authority IS main's run folder.** `predictFinalizeAuthority`
   (`claim.js:3548-3561`): on `archive_authority_missing` + `mirror.state === 'ready'` + `destAbsent` it
   re-resolves as `resolveFinalizeAuthority(mirror.mainRoot, project)` and marks it `pending_mirror`. The
   in-code comment at `:3745-3748` says it outright: *"A PREDICTED authority carries the same `.cache/`
   the mirror is about to copy, so the measurement is available there too."* Step 8a is a **main→worktree**
   copy (`claim.js` comment at `mirrorDestWritable`).
3. **This repo, right now**: the worktree's `kaola-workflow/` holds `archive` and `ROADMAP.md` and **no
   `bundle-900-901-902-903/`** — the run folder is main-resident only.
4. **The live dead end**, pre-fix file, from this worktree:
   `record --project bundle-900-901-902-903 …` → **exit 1**, `reasons:["project_folder_missing"]`, hint
   *"If the run lives in a linked worktree, record from that worktree"* — the caller is already there.

So the premise **holds**: requiring the folder and the hash in one tree is unsatisfiable in the lane the
verb exists for.

## The fix

**The hash follows the invoking tree; the record follows the run folder.** They are resolved separately
because the gate reads them separately.

| `file:line` | what |
|---|---|
| `:1090-1103` | header for the new resolver: why one tree cannot be both, and that it never reaches the other way |
| `:1105-1124` | `resolveRecordFolder(root, project, schema)` → `{ dir, root, mainResident, searched }`. This tree first; then **main** via `schema.resolveMainRoot` — the same resolver `claim.js` uses and the one `archivedProjectPaths` already used, so main is not derived a second way. `dir: null` when neither exists, with `searched` carrying both paths |
| `:1313-1327` | the `project_folder_missing` branch now reports **what was searched** (killing the loop) and keeps the archived-run message unchanged |
| `:1338-1347` | the record path comes from `folder.dir`, and the **band rule follows the write**: the resolved destination is band-checked against **its own** root |
| `:1361-1370` | `operator_hint` for the main-resident case: names the tree that was hashed, the file that was written, why that pair is what the gate reads, and *do not create the run folder here by hand* |

`resolveCandidateRoot` is **unchanged** — the cwd-binding property the first reviewer confirmed sound is
untouched, and the fallback is deliberately **one-directional**: a run folder that lives only in a linked
worktree is never written from main, because main's hash bound to it is the wrong tree.

## Proof — the worktree lane, before and after

Fixture: consumer repo (no `package.json`), `.kw/` gitignored, real `git worktree add`, **one un-merged
commit** on the branch so the trees genuinely diverge (`main d4451c69…` vs `worktree f694ae81…`,
`differ? true`), run folder **main-resident only**.

| leg | before | after |
|---|---|---|
| **W1** record from the worktree | **exit 1** `project_folder_missing`, nothing written | **exit 0** `recorded`; `record_path` = **main's** folder; bound hash = **the worktree's**; `candidate_root` = the worktree; **no worktree run folder created** |
| **W2** the gate's own pair — hash over the worktree, record from main's `.cache/` | n/a (no record existed) | **`chains_green`, `green: true`** ← the acceptance criterion |
| **W3** control: the same bytes, gate standing in **main** | — | **`final_validation_stale`** — which is what proves the recorded value is the worktree's and not a value that reads green anywhere |
| **W4** after the real Step 8a (`claim.mirrorFinalizationArtifacts(wt, project)` → `"mirrored"`), gate over the **worktree's** mirrored copy | — | **`chains_green`, `green: true`** |
| **W5** re-record | — | exit 0, **bytes identical** (idempotent in the main-resident lane too) |
| **W6** folder only in the **worktree**, record from **main** | exit 1 `project_folder_missing`, creates nothing | **unchanged** — exit 1, no hash, creates nothing (this is `test-finalize-door.js` T8l's pin, and it must not move) |
| W6 control | — | recording that run **from the worktree** works, exit 0, into the worktree's folder |
| **W7** no folder anywhere | hint = the **loop** (*"record from that worktree"* while standing in it) | exit 1, hint names **both searched paths** (worktree and main) and drops the loop |
| **W8** plain repo, folder local | exit 0, `hint: null`, gate green | **identical** — no behaviour change off the worktree lane |
| **W9** `--project Archive` from a worktree with **no** local `kaola-workflow/archive`, main has one | exit 1 (blocked only by the *absence* of a fallback) | **exit 2**, refused by the destination band check, **nothing written into main's band** |

W9 is the one case where my own V1 change could have opened a *new* route into the band — the fallback
makes main's band reachable where it was not before. That is why the band rule is applied to the resolved
destination and not only to the local path.

## Proof — the real CLI, end to end (`e2e.js`)

Fixture with a committed `workflow-state.md` claim, run folder main-resident, `finalize --check` invoked
**from the linked worktree**. `authority.source` reads `"pending_mirror"` in every leg — the exact
topology.

| leg | `checks.validation` |
|---|---|
| before any record | `final_validation_unverified` |
| **pre-fix**, `record` from the worktree | still `final_validation_unverified` (the record was refused, exit 1) |
| **pre-fix**, `record` from **main** — the only writable option, and it warns nothing (`operator_hint: null`, `other_candidate_roots: []`) | **`final_validation_stale`** ← the reviewer's step 5, reproduced |
| **post-fix**, `record` from the worktree | **`chains_green`**, with `ok: true`, `reasons: []` |

## Mutation controls — three, each isolating one part

Scratch mirror again; the worktree was never mutated.

| mutation | what it disables | result |
|---|---|---|
| `MV1_no_main_fallback` | the fallback to main | **W1 regresses to exit 1** — the fallback IS the fix; W6/W7/W8 unchanged |
| `MV2_hash_destination` | hashes the tree the record lands in instead of the invoking tree | **records, then W2/W4 read `final_validation_stale`** and W3 inverts to green — i.e. exactly the "fix it by hashing main" wrong answer the dispatch named, so the implementation demonstrably does not take it |
| `MV3_no_destination_band_check` | the band check on the resolved destination | **W9 writes into main's band** (exit 0, `wrote into main's band? true`) |

## V5 — the dead step

Confirmed by reading `resolveFinalizeCheckRoot` (`adaptive-schema.js:1022-1046`): it redirects only when
its argument's top level differs from `process.cwd()`'s, and `planRoot` was derived from cwd, so
`cwdTop === planTop` always and it returns on the first branch. The verb is exactly
`gitTopLevel(process.cwd())`.

**Fixed as the comment, not the logic** (`:1073-1082`), and the header bullet with it (`:1045-1054`). The
call is kept because it is the *same call the gate makes over the same value*, so a producer/gate
divergence cannot be introduced there without both sides moving — but the comment now says plainly that it
**resolves nothing today**, and that it does **not** cover the divergence the gate's own redirect exists
for (a root that came from somewhere other than cwd, which no argument this verb accepts can produce).
Removing the call instead would have decoupled producer from gate for no behavioural gain; that is the
coupling impl-900's trap #3 was about. Say the word if you would rather it went.

The header bullet that claimed the verb "resolves the candidate down the SAME road" is replaced by the
statement of what actually happens: two halves, two trees, both reported.

## Final cross-edition parity — four copies byte-identical

```
9fef450853c44ce7e5d731a29ee50c99  scripts/kaola-workflow-validation-runner.js
9fef450853c44ce7e5d731a29ee50c99  plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js
9fef450853c44ce7e5d731a29ee50c99  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js
9fef450853c44ce7e5d731a29ee50c99  plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js
```

Propagated with `cp`, one distinct digest over all four. Total diff against the pre-fix snapshot for all
four defects: **175 lines added, 22 removed**, 1363 → 1516 lines. Still four files, still uncommitted, no
test file touched.

## Final suites — real exit codes, bare `echo $?`, serial, in the worktree

| command | result |
|---|---|
| `node scripts/test-validation-runner.js` | **exit 0** — `test-validation-runner: PASSED` |
| `node scripts/test-finalize-door.js` | **exit 0** — 208 assertions (**T8l green**, i.e. the "wrong checkout refuses" pin still holds) |
| `node scripts/validate-script-sync.js` | **exit 0** — `27 byte-identical groups … 4 Oracle Kernel copies identical at HEAD` |
| `node scripts/simulate-workflow-walkthrough.js` (**full scope**, `index:1,total:1`) | **exit 0** — **198/198**, 2079 spawns |
| `node scripts/validate-workflow-contracts.js` | **exit 0** |
| `node scripts/validate-kaola-workflow-contracts.js` | **exit 0** |

`pgrep` confirmed no other walkthrough was running; `pwd` confirmed the worktree. 198 scenarios is the
current scope, attributed by the orchestrator to a sibling `tdd-guide`'s new scenario (not to my change).
The spawn census moved 2059 → 2079 between my two full runs; the suite file is another agent's and also
changed in that window, so I am not attributing that delta.

## Contract — what V1 changes

- **No new `reasons` token, no new output key, no exit-code change.** `record_path` already carried an
  absolute path and now sometimes names main's folder; `operator_hint` is a free-text field and carries a
  new message in the main-resident case.
- **One behavioural change a consumer can observe**: from a linked worktree whose tree lacks the run
  folder, `record` now exits **0** and writes into main instead of exiting 1. That is the fix.
- **A prose surface may want a sentence** (not mine — the prose/doc agent owns it): the recipe should say
  *run it from the working tree you validated; if the run folder is main-resident the record lands there,
  and that is what the gate reads.* Today the surfaces say "run from the tree you validated", which is now
  sufficient and no longer a dead end — so this is an improvement, not a correction.

## Pins needed for V1 (added to the list above; still `tdd-guide`'s to author)

17. **The worktree lane, end to end**: main-resident run folder + a diverged linked worktree → `record`
    from the worktree → assert (a) exit 0, (b) `record_path` is **main's**, (c) the bound hash equals the
    **worktree's** `computeCodeTreeHash`, (d) **no run folder is created in the worktree**, and (e) the
    gate over `{invoking: worktree, cacheDir: main's}` reads `chains_green`.
18. **The control that makes 17 non-vacuous**: the same bytes read with the gate standing in **main** must
    read `final_validation_stale`. Without it, 17 also passes on a recorder that hashes main.
19. **The one-directional property**: folder only in the worktree, `record` from main still refuses
    (`project_folder_missing`, no hash, creates nothing). `test-finalize-door.js` T8l already pins this —
    keep it, it is the pin that stops the fallback from being made symmetric.
20. **`--project Archive` through the fallback** (W9): worktree with no local `kaola-workflow/archive`,
    main with one → refused, nothing written into main's band. Mutation-prove by removing the destination
    band check.
21. **The plain-repo case is unchanged** (`operator_hint: null`, record local) — the regression guard for
    everything off the worktree lane.

## Unverified for V1

- **A full `cmdFinalize`** (not `--check`) over a consumer repo in the worktree lane: I drove the real
  `--check` CLI and the real Step-8a mirror function, but not the whole transaction (archive + closure).
- **The `mergeCopyDir` `.cache/` clobber** the reviewer routed elsewhere: not touched, not designed
  around. My fix writes only to main's folder, so the Step-8a copy carries the correct file *into* the
  worktree rather than over it — measured as W4 (`chains_green` over the mirrored copy). If that
  `claim.js` behaviour changes, W4 is the leg that would notice.
- **Two linked worktrees** carrying the same project: `resolveRecordFolder` looks in this tree and main
  only, so a second worktree's folder is never written. Reported, not measured.
