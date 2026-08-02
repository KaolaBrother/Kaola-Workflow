# Investigation: #916 — is `try { roadmapModule.regenerateRoadmap(mainRoot); } catch (_) {}` reachable?

## VERDICT: **REACHABLE — and the full user-visible defect reproduces end to end.**

A real `finalize` from a linked worktree, without `--keep-worktree`, **exits 0**, writes
`roadmap_regenerated: "regenerated"` and `closure_invariants: ok`, and leaves MAIN's
`kaola-workflow/ROADMAP.md` still listing the issue it just closed. Nothing in the receipt, the
archived `workflow-state.md`, or `finalization-summary.md` records that anything failed.

Two independent fault states reproduce it (legs C and D below), plus a third that is produced by the
run itself rather than by pre-existing tree state (leg R, the concurrent-worktree race).

The premise as written in the issue is **CONFIRMED**, with two corrections to its detail:

1. The issue's own example fault — "making main's `kaola-workflow/ROADMAP.md` ... unwritable" — does
   **not** work (`writeFileAtomicReplace` writes a tmp file and `rename`s over it; an unwritable
   target file is irrelevant). Neither does a "malformed issue source" (`field()` returns `''`; no
   throw). Both measured below as controls.
2. The coverage claim is **stronger** than the issue states. `simulate-workflow-walkthrough.js:5405`
   does read the linked root's scalar — but that test also passes `--keep-worktree`, so the gate at
   `:2389` is **false** and the main-root regeneration never executes in it at all. Across the whole
   test surface, **zero** tests execute the block.

---

## Setup

- Commit: `540f79a21622bbd4635e1e0c290741aea4fae27f` (`main`, clean apart from the untracked
  `kaola-workflow/bundle-911-912-913-914-916-917/`)
- `node v24.18.0`, macOS 26.6 (25G72), uid 501 (non-root — so `chmod` denials are real denials)
- Every fixture built under
  `/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/425a0716-b59d-4020-b7c4-2cab21f2af3e/scratchpad`.
  No tracked file in the user's repo was modified. No source was patched, stubbed, or monkeyed —
  every throw below comes out of real filesystem state.

Fixture shape (mirrors `testFinalizeFromLinkedWorktreeCleansRoadmapEntry`, minus `--keep-worktree`):
`git init` main root → plant `kaola-workflow/.roadmap/issue-920.md` **and** `issue-999.md` →
`kaola-workflow-roadmap.js generate` → commit → `git worktree add -b workflow/issue-920` →
plant the active folder + `final-validation.md` in the worktree only → run
`node scripts/kaola-workflow-claim.js finalize --project issue-920` with `cwd` = the worktree and
`KAOLA_WORKFLOW_OFFLINE=1`.

Scripts (scratchpad, not in the repo):
`repro916.js` (legs A–D), `probe916.js` (throw-site enumeration), `legE.js` (the `--keep-worktree`
A/B), `race916.js` (the concurrency leg).

---

## Observations

| # | Measurement | Command | Result | Exit |
|---|---|---|---|---|
| A | baseline, healthy tree, no `--keep-worktree` | `node repro916.js A` | receipt `regenerated`; MAIN mirror updated (`#920` dropped) | 0 |
| B | main's `kaola-workflow/` mode 555 | `node repro916.js B` | finalize **fails earlier** (archive can't be written) — fault too coarse | 1 |
| C | main's `.roadmap/` absent, main's mirror non-empty | `node repro916.js C` | receipt `regenerated`; MAIN mirror **STALE** (still lists `#920`) | **0** |
| D | main's `.roadmap/issue-999.md` mode 000 | `node repro916.js D` | receipt `regenerated`; MAIN mirror **STALE** (still lists `#920`) | **0** |
| E | `--keep-worktree` A/B on a healthy tree | `node legE.js` | without: main regenerated. with: main untouched, receipt still `regenerated` | 0 / 0 |
| R | concurrent unlink vs. regeneration, 2 OS processes | `node race916.js drive x 4000` | `ok=3632 threw=368 codes={"ENOENT":368}` | 0 |

### Leg A — baseline (the block is LIVE, not dead code)

```
===== LEG A baseline (healthy) =====
finalize exit: 0
receipt.roadmap_regenerated: "regenerated"
receipt.roadmap_source_removed: "removed"
receipt.roadmap_removed_by_root: {"920":{"worktree":true,"main":true}}
receipt.roadmap_residue: []
receipt keys mentioning main-root regen: ["roadmap_source_removed","roadmap_regenerated","roadmap_sources_removed","roadmap_staged_reconciled","roadmap_removed_by_root","roadmap_residue"]
MAIN ROADMAP.md rows:
| #999 | fixture issue 999 | open | — | ready |
MAIN .roadmap listing: ["issue-999.md"]
stderr (tail):
```

MAIN's mirror lost `#920`. The gated call at `:2390` therefore **did** run on this path.

### Leg B — a whole-directory `chmod` is the WRONG fault (recorded so nobody repeats it)

```
pre-finalize: chmod 555 .../kw916-B-rM697B/kaola-workflow -> mode 555
===== LEG B main kaola-workflow/ read-only (EACCES) =====
finalize exit: 1
receipt.roadmap_regenerated: undefined
...
MAIN ROADMAP.md rows:
| #920 | fixture issue 920 | open | — | ready |
| #999 | fixture issue 999 | open | — | ready |
```

Making all of main's `kaola-workflow/` read-only breaks the **archive** step first, so finalize exits
1 before the roadmap band. The fault has to be narrower than the whole directory.

### Leg C — main's `.roadmap/` gone, main's mirror non-empty → the source-loss guard throws

```
pre-finalize: removed .../kw916-C-gINH0W/kaola-workflow/.roadmap (exists=false)
pre-finalize MAIN ROADMAP rows: 2
===== LEG C main .roadmap/ absent (source-loss guard) =====
finalize exit: 0
receipt.roadmap_regenerated: "regenerated"
receipt.roadmap_source_removed: "removed"
receipt.roadmap_removed_by_root: {"920":{"worktree":true,"main":true}}
receipt.roadmap_residue: []
MAIN ROADMAP.md rows:
| #920 | fixture issue 920 | open | — | ready |
| #999 | fixture issue 999 | open | — | ready |
MAIN .roadmap listing: <dir absent>
stderr (tail):
```

Exit 0. Receipt green. MAIN's mirror still advertises the closed `#920`. `stderr` is empty — the
`catch (_) {}` ate the message.

### Leg D — one unreadable source file in main → `EACCES`

```
pre-finalize: chmod 000 .../kw916-D-uXjcWr/kaola-workflow/.roadmap/issue-999.md
===== LEG D main .roadmap/issue-999.md unreadable (EACCES) =====
finalize exit: 0
receipt.roadmap_regenerated: "regenerated"
receipt.roadmap_source_removed: "removed"
receipt.roadmap_removed_by_root: {"920":{"worktree":true,"main":true}}
receipt.roadmap_residue: []
MAIN ROADMAP.md rows:
| #920 | fixture issue 920 | open | — | ready |
| #999 | fixture issue 999 | open | — | ready |
MAIN .roadmap listing: ["issue-999.md"]
stderr (tail):
```

This is the exact asymmetry the issue describes: the **linked** root regenerated fine (its own copy
of `issue-999.md` is readable), so the scalar reads `regenerated`; **main's** regeneration threw and
nobody heard it. `roadmap_removed_by_root` even reports `main: true` — the *source* removal in main
did succeed; only the *mirror rebuild* failed, and that has no field.

### What the durable record says in leg D

```
$ find kw916-D-uXjcWr/kaola-workflow -type f | sort
kw916-D-uXjcWr//kaola-workflow/.roadmap/issue-999.md
kw916-D-uXjcWr//kaola-workflow/archive/issue-920/.cache/final-validation.md
kw916-D-uXjcWr//kaola-workflow/archive/issue-920/finalization-summary.md
kw916-D-uXjcWr//kaola-workflow/archive/issue-920/workflow-state.md
kw916-D-uXjcWr//kaola-workflow/ROADMAP.md

$ grep -rn "roadmap" kw916-D-uXjcWr/kaola-workflow/archive
(no output)
```

```
===== main ROADMAP.md (STALE — still lists the closed #920) =====
<!-- generated by scripts/kaola-workflow-roadmap.js — do not edit -->
# Kaola-Workflow Roadmap

This file mirrors active unfinished work. GitHub issues are the source of truth when available.

## Active Work

| Issue | Title | Status | Workflow Project | Next Step |
|-------|-------|--------|------------------|-----------|
| #920 | fixture issue 920 | open | — | ready |
| #999 | fixture issue 999 | open | — | ready |

===== archived workflow-state.md =====
## Closure
archived_at: 2026-08-02T02:52:16.712Z
issue_disposition: close-pending
claim_label_removed: skipped_offline
worktree_removed: missing
closure_invariants: ok

===== finalization-summary.md =====
## Validation

classification: chains_green
green: true
mode: final-validation

agent validation recorded and bound to this tree
```

The archived run folder mentions the word *roadmap* **zero times**. The issue's claim that "nothing
in the archived run folder records that anything failed" is confirmed verbatim.

---

## Enumeration — every throw `regenerateRoadmap(root)` can reach

`node probe916.js`, real fs states, no patching:

```
C  .roadmap absent + non-empty generated mirror -> THREW Refusing to replace non-empty generated ROADMAP.md with no active work because kaola-workflow/.roadmap is missing or contains no issue-*.md source files. Restore .roadmap or recreate per-issue source files before generate.
C2 .roadmap present-but-empty (control) -> RETURNED "generated" (no throw)
D  .roadmap/issue-999.md mode 000 -> THREW [EACCES] EACCES: permission denied, open '.../kaola-workflow/.roadmap/issue-999.md'
E  .roadmap dir mode 000 (readdir) -> THREW [EACCES] EACCES: permission denied, scandir '.../kaola-workflow/.roadmap'
F  kaola-workflow/ mode 555 (openSync wx) -> THREW [EACCES] EACCES: permission denied, open '.../kaola-workflow/.ROADMAP.md.45797.1785639191095.bf63db6e088e.tmp'
G  ROADMAP.md mode 000, dir writable (control) -> RETURNED "generated" (no throw)
   G mirror rows after: 2
H  malformed issue-999.md content (control) -> RETURNED "generated" (no throw)
I  .roadmap/_rules.md mode 000 -> THREW [EACCES] EACCES: permission denied, open '.../kaola-workflow/.roadmap/_rules.md'
J  root path does not exist (control) -> RETURNED "generated" (no throw)
   J created? true
```

Mapped to source (`scripts/kaola-workflow-roadmap.js`):

| # | Site | Throws | Can a real run put the tree here? |
|---|---|---|---|
| 1 | `:224-232` narrow source-loss guard | yes (leg C) | **Yes, operator-produced.** `CLAUDE.md` itself carries the standing warning "Do not purge `kaola-workflow/.roadmap/`", and this guard exists because source loss is an observed class. Also reached whenever main's checkout carries `ROADMAP.md` with rows but no `.roadmap/` (a checkout/stash/clean in the shared main root while a worktree run is in flight). **Not** produced by the closure loop itself — that `unlinkSync`s files and leaves the dir present-but-empty, which C2 confirms is explicitly sanctioned. |
| 2 | `readRoadmapIssues` → `fs.readdirSync(dir)` `:63` | yes (leg E) — EACCES/ENOTDIR | Environmental. |
| 3 | `readRoadmapIssues` → `fs.readFileSync(...)` `:71` | yes (leg D) — EACCES; **and ENOENT under concurrency, leg R** | **Yes — and this one is run-produced.** See leg R. |
| 4 | `buildRoadmapContent` → `fs.readFileSync(_rules.md)` `:102` | yes (leg I) — EACCES/EISDIR | Environmental. `_rules.md` is a real, documented project-local file. |
| 5 | `writeFileAtomicReplace` → `fs.mkdirSync` `:133` / `fs.openSync(tmp,'wx')` `:141` / `writeFileSync` / `fsyncSync` / `renameSync` `:146`, rethrown at `:152` | yes (leg F) — EACCES; also ENOSPC, EDQUOT, EROFS, EIO | **Yes.** A full disk or a read-only/quota-exhausted volume is an ordinary machine state. Not measured here (see Open). |
| — | unwritable `ROADMAP.md` itself | **NO** (control G) | The write is tmp-file + `rename`; the target file's own mode is irrelevant. The issue's suggested fault does not work. |
| — | malformed issue source content | **NO** (control H) | `field()` returns `''` for anything unmatched. Never throws. |
| — | `mainRoot` not a repo / path absent | **NO** (control J) | `mkdirSync(..., {recursive:true})` *creates* the tree and writes a mirror there. |

### Leg R — the run-produced route (`ENOENT` between `readdir` and `read`)

`readRoadmapIssues` `readdirSync`s the directory and then `readFileSync`s each entry. A **second**
linked worktree finalizing concurrently calls `fs.unlinkSync(mainRoadmapAbs)` on main's
`kaola-workflow/.roadmap/issue-N.md` at `scripts/kaola-workflow-claim.js:2349`. Land that unlink in
the window and this root's `regenerateRoadmap(mainRoot)` throws `ENOENT`. Two real OS processes, real
files, nothing patched:

```
$ node race916.js drive x 4000
regen: ok=3632 threw=368 codes={"ENOENT":368}
```

368 of 4000 (9.2%). **Honest caveat:** the churner runs create/unlink in a tight loop, so that rate
is not the rate a real run sees — a real concurrent finalize contributes one unlink, so the
real-world probability is far lower. What the leg establishes is the **mechanism**, not the rate:
the throw needs no hostile tree state and no operator error, only the concurrency this project
treats as its default posture ("Concurrency carries no machinery … decompose to genuine
independence and dispatch that wide").

---

## Reproduction — is the receipt wrong?

**Confirmed.** In both legs C and D:

- `finalize` exit code **0**
- receipt `roadmap_regenerated: "regenerated"` — the **linked** root's outcome, from `:2382-2386`
- receipt carries **no** field for the main root: keys are exactly
  `["roadmap_source_removed","roadmap_regenerated","roadmap_sources_removed","roadmap_staged_reconciled","roadmap_removed_by_root","roadmap_residue"]`
- MAIN's `kaola-workflow/ROADMAP.md` still lists the closed `#920`
- archived `workflow-state.md` says `closure_invariants: ok`; archived folder never says "roadmap"
- `stderr` empty — the message dies inside `catch (_) {}`

The warning at `scripts/kaola-workflow-claim.js:5877` keys on
`archiveResult.roadmap_regenerated === 'failed'`. That scalar can only ever carry the linked root's
result, so the warning is structurally incapable of firing for a main-root failure. Confirmed by
reading; consistent with legs C/D producing no warning.

---

## Narrowing — the `--keep-worktree` axis

`node legE.js`, one axis, healthy tree both arms:

```
--- healthy tree, WITHOUT --keep-worktree ---
  exit=0  receipt.roadmap_regenerated="regenerated"
  MAIN ROADMAP.md rows before=["#920","#999"] after=["#999"]
  main-root regeneration ran? true
--- healthy tree, WITH --keep-worktree ---
  exit=0  receipt.roadmap_regenerated="regenerated"
  MAIN ROADMAP.md rows before=["#920","#999"] after=["#920","#999"]
  main-root regeneration ran? false
```

Eliminated: "the receipt scalar might somehow reflect main." It does not — under `--keep-worktree`
main is never regenerated at all and the scalar still reads `"regenerated"`.

Confirms the issue's reachability note: this sits on the linked-worktree-**without**-`--keep-worktree`
path, not on the documented finishing sequence.

---

## Coverage

**1. Does any test assert `roadmap_regenerated === 'failed'`? — NO.**

```
$ grep -rn "roadmap_regenerated" scripts/test-*.js scripts/simulate-workflow-walkthrough.js
scripts/test-bundle-finalize.js:679:      assert(receipt.roadmap_regenerated != null, 'receipt has roadmap_regenerated');
scripts/test-bundle-finalize.js:727:      roadmap_regenerated: 'regenerated',
scripts/test-bundle-finalize.js:783:      roadmap_regenerated: 'regenerated',
scripts/test-bundle-finalize.js:1404:      archive: 'closed', roadmap_source_removed: 'absent', roadmap_regenerated: 'skipped',
scripts/test-claim-hardening.js:229:  const r = buildClosureReceipt('proj', 7, { roadmap_source_removed: undefined, roadmap_regenerated: 'regenerated' });
scripts/test-claim-hardening.js:231:  assert(r.roadmap_regenerated === 'regenerated', '#395.1: a defined step still overwrites the default');
scripts/simulate-workflow-walkthrough.js:5336:      finalizeResult.roadmap_regenerated === 'regenerated',
scripts/simulate-workflow-walkthrough.js:5337:      'receipt: roadmap_regenerated must be regenerated, got ' + finalizeResult.roadmap_regenerated
scripts/simulate-workflow-walkthrough.js:5405:      finalizeJson.roadmap_regenerated === 'regenerated',
scripts/simulate-workflow-walkthrough.js:5406:      'linked-worktree finalize: roadmap_regenerated must be regenerated, got ' + finalizeJson.roadmap_regenerated
scripts/simulate-workflow-walkthrough.js:7952:    assert(result.repaired.roadmap_regenerated === true, ...
scripts/simulate-workflow-walkthrough.js:8829:    assert(executed.repaired.roadmap_regenerated === true, ...
scripts/simulate-workflow-walkthrough.js:12241:    assert(out.closure_receipt && out.closure_receipt.roadmap_regenerated === 'regenerated', ...
```

The only `'failed'` in that neighbourhood is `test-claim-hardening.js:230`, on the *different* field
`roadmap_source_removed`. `'failed'` is a declared enum member
(`scripts/kaola-workflow-closure-contract.js:25`) and the `emptyReceipt` seed value (`:112`), but
nothing asserts the **producer** ever emits it. The `'failed'` branch at `claim.js:2385` is uncovered
for both roots — the issue's claim is confirmed.

**2. Does `simulate-workflow-walkthrough.js:5405` read the linked root's outcome? — YES, and the
finding is stronger than the issue states.**

`testFinalizeFromLinkedWorktreeCleansRoadmapEntry` (`:5365`) invokes finalize with
`--keep-worktree` (`:5386`). Per leg E, that makes the gate at `:2389` false, so the test **never
executes the main-root regeneration at all**. It is not merely reading the wrong root's scalar — it
never causes the code under discussion to run.

**3. Does ANY shipped test execute `claim.js:2389-2391`? — NO.** Complete enumeration of every
`finalize` invocation in the test surface:

- 13 linked-worktree invocations in the walkthrough (`cwd: wtPath | wt850 | wt870 | wt860 | wt861 |
  wt530`, at lines 2326, 2387, 2472, 2535, 4570, 4616, 5261, 5387, 5478, 6741, 6855, 9846, 11942) —
  **all 13 pass `--keep-worktree`** → gate false.
- Every other walkthrough invocation runs with `cwd: tmp`, the main root → `mainRoot === linkedRoot`
  → gate false.
- `scripts/test-bundle-finalize.js` — `runFinalize` (`:339-351`) forces `KAOLA_WORKTREE_NATIVE: '0'`
  (in-place, no linked worktrees) → gate false.
- `scripts/test-finalize-door.js` — worktree-cwd invocations (`:1435`, `:1477`, `:1704`, `:1971`,
  `:2067`) all pass `--keep-worktree`; `:430` and `:607` use `repo` (main root) → gate false.
- `scripts/test-sink-merge.js:497` / `test-route-reachability.js:821` — the string `'finalize'` as a
  step/lane name, not an invocation.

So the block is live production code with a real, reproducible failure mode and **zero** test
executions.

---

## Editions

All four sites carry the byte-identical shape — same guard, same swallowed catch, same `#428`
comment. Line numbers match the issue exactly.

```
$ grep -n -B3 "regenerateRoadmap(mainRoot)" <each file>
```

| edition | site | guard line | identical? |
|---|---|---|---|
| canonical | `scripts/kaola-workflow-claim.js:2390` | `:2389` | — |
| codex | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js:2390` | `:2389` | yes, byte-identical |
| gitlab | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:2171` | `:2170` | yes, byte-identical |
| gitea | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:2170` | `:2169` | yes, byte-identical |

Each reads:

```js
  // #428: also regenerate the MAIN roadmap when this is a linked worktree run.
  // Skip when keepWorktree is true: the feature-branch merge will carry the deletion + regeneration.
  if (mainRoot && mainRoot !== linkedRoot && !(opts && opts.keepRoadmapSource) && !(opts && opts.keepWorktree)) {
    try { roadmapModule.regenerateRoadmap(mainRoot); } catch (_) {}
  }
```

---

## Inferences (labelled — these are mine, not measurements)

- **The `catch (_) {}` is not defensive padding; it is load-bearing and mis-typed.** The same
  function's failure at the linked root is already typed as `'failed'`, so the failure class is one
  the design already accepts as real. — confidence: high; refuted by showing every throw site is
  environment-only *and* that environment being out of scope, which the existing `:2385` branch
  contradicts.
- **Leg R (the concurrent-unlink `ENOENT`) is the strongest reachability argument** because it needs
  no hostile tree state and no operator error — only two worktrees finalizing at once, which the
  project's stated posture actively encourages. — confidence: medium-high; refuted by showing the
  workflow serialises main-root roadmap mutation across worktrees (I found no such serialisation).
- **The blast radius is larger than one stale file.** `ROADMAP.md` is the mirror `workflow-next`
  reads to pick the next item, so a silently stale main mirror can re-offer a closed issue. The
  `validate-remote` drift check exists precisely because this drift is invisible. — confidence:
  medium; refuted by a reader that regenerates before consuming.
- **Deleting the branch would be a regression, not a subtraction.** Leg E shows the branch is the
  only thing that updates main's mirror on this path; with it gone, main is stale on *every* such
  run, not just failing ones. — confidence: high; refuted by showing another writer covers main.

---

## Open (unmeasured, and why)

- **ENOSPC / EROFS / EIO** at the write site were not reproduced. Doing so needs a small disk image
  or a read-only mount — a system-level mutation outside this repo, which I did not take
  unilaterally. Leg F already proves the same `openSync`/`writeFileSync` line throws and is
  swallowed; ENOSPC only changes the `errno`.
- **The concurrency leg was not driven end to end through two real `finalize` processes.** The window
  is a single `unlink` against a multi-second run, so a hit needs many trials. The two-process leg R
  measurement establishes the mechanism at the exact code line; the end-to-end rate is unmeasured.
- **No full-suite instrumentation run** (mutating a clone to count executions of `:2390` during
  `npm test`). The static enumeration of all finalize call sites above is complete and reaches the
  same answer — zero — at a fraction of the cost.
