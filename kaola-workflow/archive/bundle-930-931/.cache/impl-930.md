# Implementation of issue #930 — archiving must never relocate a directory that is not a project folder

**Baseline commit: `68cb48f4a71c1d125d403ed7e251d47d7077b730`** (main; working tree also carried
another agent's in-flight `*sink-merge.js` + `test-sink-merge.js` edits and the two #930 test files —
none of them mine, none of them touched).

**Verification tier: `tests-green`.**

---

## 1. The mechanism I chose, and why

**Refuse at the top of `archiveProjectDir`, before it reads or writes anything.**

```js
if (isReservedWorkflowDirName(project)) {
  return { archived: false, reason: 'archive_reserved_directory', project,
    detail: 'kaola-workflow/' + project + ' is a reserved directory, not a project folder; '
      + 'nothing was moved, copied, stamped or deleted' };
}
```

Four reasons for that placement and that shape:

1. **It covers both lanes with one statement.** The in-place `fs.renameSync` (`:2612-2616`) and the
   linked `copyDir` + `fs.rmSync` (`:2517-2520` / `:2605-2606`) are equally downstream of the first
   line of the function. The brief warned that an in-place-only fix was mutation-proven to leave the
   worktree lane red; putting the guard above the `isLinkedRun` split makes a one-lane fix
   structurally impossible.
2. **Nothing under the reserved directory is touched at all** — not even the terminal-state stamp of
   `workflow-state.md`, not the `#324` sentinel rewrite of `finalization-summary.md`, not the
   `final-validation.md` normalization. Every checkout keeps its bytes, which is assertion (1) at its
   strongest reading rather than its minimum.
3. **It precedes the `source-missing` early return on purpose.** `{ skipped: 'source-missing' }` reads
   as SUCCESS to `closureContract.archiveSucceeded` (`closure-contract.js:131`), so letting a reserved
   name reach it would let closure proceed — issue close, roadmap-source removal, worktree teardown —
   against a name that can never be a project folder. Ordering the reserved test first is what makes
   the refusal unconditional.
4. **A refusal is on-doctrine here, not against it.** CLAUDE.md's "Nothing refuses" carves out exactly
   this: *"an operation that would destroy something still fails loudly … Those protect work nobody
   agreed to lose."* This is the same class `verifyArchiveComplete` already guards (`archive_incomplete`),
   reached through the same `archiveSucceeded` seam and reported through the same `output({result:
   'refuse', reason: result.reason …}, 1)` path in `cmdFinalize:4189-4197`. I added no new refusal
   machinery — I added one more `reason` token to a refusal shape that already existed.

**No caller change was needed.** `cmdFinalize:4192`, `cmdDiscard:5013`, and both abandon sweeps
(`:5969`, `:6064`) already render `result.reason` verbatim, so the new token surfaces as
`{"result":"refuse","reason":"archive_reserved_directory","project":".roadmap","detail":"…"}` at exit 1
with no edit to any of them.

**What I did NOT do**, and why:

- **Not `isSafeName`.** The premise's inference held up on reading: it is the shared *path-safety*
  predicate reached by `claimProject:1116`, `archiveProjectDir:2433`, both sinks and `closure-audit`,
  and widening it would change what "safe" means for all of them — and would make
  `archiveProjectDir`'s `assert` **throw** rather than report, converting a legible refusal into an
  `archive_exception` with a stack-derived detail.
- **Not the claim side.** `active-folders.js:240` is untouched, per the owner ruling. A reserved
  directory can still be claimed; it simply can no longer be archived.
- **Not a general "validate the project name" mechanism.** #929 settled that the placeholder class is
  semantic and unbounded. This guard answers a different, closed question: *is `kaola-workflow/<name>`
  a project folder or a reserved directory?* That question is lexical and does have an answer.

### The `archive` control

It changed mechanism and kept its result. Before: `EINVAL` from `rename archive -> archive/archive`
(main lane) / `archive_incomplete` naming 8384 entries (worktree lane), both exit 1. Now: the same
uniform `archive_reserved_directory` refusal at exit 1, and it no longer leaves the partial
`archive/archive/` copy behind, because nothing is copied. Nothing is lost either way; the test pins
the control at result strength and it stays green. The brief explicitly authorised not preserving the
`EINVAL` specifically.

## 2. The reserved-name wording I picked, and why

I picked the **enumeration wording**:

```js
function isReservedWorkflowDirName(name) {
  return name === 'archive' || String(name).startsWith('.');
}
```

The premise report is right that this is not one closed expression in the tree — there are at least
four wordings across at least eight production sites per edition, and they measurably disagree. I
picked deliberately, from four candidates:

| Candidate | Where | Why not / why |
|---|---|---|
| **`archive` or dot-prefixed** | `active-folders.js:240`, `claim.js:5523`, `claim.js:5540`, `adaptive-schema.js:424-425` | **CHOSEN.** It is the predicate that decides whether a directory under `kaola-workflow/` is ever *surfaced* as a project. A directory the enumerator will never call a project is not a project folder, whatever a claim wrote into it. It is also already written **twice inside the very file I am editing** (the barrier-reap keep passes), in all four editions — so this is reuse of an in-file wording, not a fifth vocabulary. |
| literal `.roadmap` / `ROADMAP.md` | `claim.js:3500`, `claim.js:4816` | Narrower than the class. It does not see `.origin`, and `.origin` is a driven, measured instance of the same destruction. |
| `!== 'archive'` | `compact-context.js:51` | Narrower still — it would not have fixed the filed case. |
| `NON_PROJECT_FOLDERS = ['archive','exports']` | `adaptive-schema.js:827` | Module-**private** (verified: it appears only at `:827` and `:844`, and is absent from `module.exports`). Reusing it means widening the export surface of the byte-identical cross-edition drift anchor — out of my scope, and a heavier change than the brief invites. |

**Declared gap, deliberate:** my predicate does **not** cover `exports`. No observed failure demanded
it (`kaola-workflow/exports` does not exist in the tree at HEAD and has never been driven as a project
name), and the enumeration wording I chose genuinely *does* treat `exports` as a project folder — so
adding it would be me settling a live disagreement between two production sites on my own authority,
additively, with no failure forcing it. Per "derive additively / silence is an answer", I recorded it
here instead of building it. If the orchestrator wants the union, it is one array literal.

**I did not unify the other sites.** Each of the four wordings answers a different caller's question,
and rewriting eight-plus sites per edition to agree is a far larger change than #930 asks for. The
guard I added is scoped to the one caller that MOVES the directory it is handed.

## 3. What changed, in each of the four copies

Identical hunk in all four: a 15-line `isReservedWorkflowDirName` helper (comment + 3 lines of code)
placed immediately above `archiveProjectDir`, and a 17-line guard (comment + 5 lines of code) placed
immediately after the `assert(isSafeName(project), …)` line.

```
 plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js   | 33 +++++
 plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js | 33 +++++
 plugins/kaola-workflow/scripts/kaola-workflow-claim.js               | 33 +++++
 scripts/kaola-workflow-claim.js                                      | 33 +++++
 4 files changed, 132 insertions(+)
```

Hunk headers — two per file, no other hunk anywhere:

```
scripts/kaola-workflow-claim.js                          @@ -2431,0 +2432,16 @@  @@ -2433,0 +2450,17 @@
plugins/kaola-workflow/scripts/kaola-workflow-claim.js   @@ -2431,0 +2432,16 @@  @@ -2433,0 +2450,17 @@
plugins/kaola-workflow-gitlab/…/kaola-gitlab-…-claim.js  @@ -2167,0 +2168,16 @@  @@ -2169,0 +2186,17 @@
plugins/kaola-workflow-gitea/…/kaola-gitea-…-claim.js    @@ -2166,0 +2167,16 @@  @@ -2168,0 +2185,17 @@
```

- **`scripts/kaola-workflow-claim.js`** — canonical; authored here.
- **`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`** — **copied**, not re-typed. Verified
  byte-identical to HEAD's canonical *before* copying (`git show HEAD:scripts/… | shasum -a 256` =
  `d650eb2915e4665b…e9f9` = the plugin copy's hash), then `cp` and re-verified: both are now
  `b404d9279bc11bef5751a42bb8b78725c4e0e7731dffd246bd78138dc38e9b08`.
- **`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`** — hand-edited. Read the
  surrounding code first: this port carries the same `archiveProjectDir` opening (`:2168-2171`) but
  omits the canonical's "Deterministic refusal seam" comment, so the anchor is the three lines
  `function archiveProjectDir(…)` / `assert(isSafeName(…))` / `const src = …`. Confirmed before
  editing that the port also carries the two barrier-reap keep passes my comment cites (`:5763`,
  `:5780`) and the same `closureContract.archiveSucceeded` seams (`:3950`, `:4703`, `:5093`, `:5188`).
- **`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`** — hand-edited, same anchor
  (`:2167-2170`); same confirmations (`:5754`, `:5771`; `:3947`, `:4698`, `:5088`, `:5183`).

Nothing else was touched. The `*sink-merge.js` and test-file modifications in `git status` are the
other agents' in-flight work and predate my first edit.

### Behaviour across all four editions, driven

`archiveProjectDir(root, name, 'closed')` on a nonexistent root, per edition — identical in all four,
with an ordinary name as the negative control:

```
".roadmap"  -> {"archived":false,"reason":"archive_reserved_directory","project":".roadmap","detail":"kaola-workflow/.roadmap is a reserved directory, not a project folder; nothing was moved, copied, stamped or deleted"}
".origin"   -> {"archived":false,"reason":"archive_reserved_directory","project":".origin", …}
"archive"   -> {"archived":false,"reason":"archive_reserved_directory","project":"archive", …}
"proj-ok"   -> {"skipped":"source-missing"}          <- CONTROL, unchanged
```

## 4. Verification

| Command | Before | After | Exit after |
|---|---|---|---|
| `node scripts/test-forge-archive-scoping.js` | **88 passed, 44 failed** (exit 1) | **132 passed, 0 failed** | **0** |
| `node scripts/simulate-workflow-walkthrough.js --only testArchiveNeverRelocatesReservedDir930` | **RED** (exit 1) | `testArchiveNeverRelocatesReservedDir930: PASSED` | **0** |
| `node scripts/simulate-workflow-walkthrough.js` (**FULL scope**, not the 1/12 shard) | (author measured: 166 pass + the #930 red) | `{"scenarios":203,"ran":203,"passed":203,"failed":0}` — `Workflow walkthrough simulation passed` | **0** |
| `node scripts/validate-script-sync.js` | exit 0 | `OK: 15 common scripts, 27 byte-identical groups … 4 Oracle Kernel copies identical at HEAD` | **0** |
| `node scripts/edition-sync.js --check` | exit 0 | `8 forge aggregator ports in parity` / `committed kernel parity verified at HEAD` | **0** |
| `node --check` ×4 | — | all four `-> 0` | **0** |
| `node scripts/test-bundle-finalize.js` (adjacent: it calls `archiveProjectDir` directly) | — | `all 149 tests passed` | **0** |
| `node scripts/test-claim-hardening.js` (adjacent: builds `.roadmap` fixtures) | — | `claim-hardening tests passed (766 assertions)` | **0** |

Baseline scoping tail, for the record:

```
FAIL: 930[gitea] the feature-branch HEAD no longer carries kaola-workflow/.roadmap/_rules.md — finalize committed the deletion onto the branch the sink merges to main; branch now holds: []
88 passed, 44 failed        EXIT=1
```

After:

```
930[claude/canonical] reserved-directory archive: done
930[codex] reserved-directory archive: done
930[gitlab] reserved-directory archive: done
930[gitea] reserved-directory archive: done
132 passed, 0 failed        EXIT=0
```

Exit codes were read from `$?` on unpiped invocations, never through a pipe.

The real tree was re-verified after every run: `ls -a kaola-workflow/` still shows `.origin`,
`.roadmap`, `archive`, `ROADMAP.md`; no `archive/.roadmap` or `archive/.origin` anywhere.

## 5. Mutation proof — the guard is load-bearing, and so is each port

Performed on a **scratch APFS clone-on-write mirror** of the whole repo
(`…/scratchpad/mirror930`), never with `git checkout --` in the working tree, because three other
agents have concurrent edits here. The mirror was deleted afterwards (`rm -rf`, exit 0).

The mutation neuters the predicate only — the guard, its comment, and the call site all stay in place,
so what is proven is that the *condition* is doing the work, not that the lines exist:

```js
function isReservedWorkflowDirName(name) {
  return false; // MUTANT M1
}
```

| Leg | Mutation | `test-forge-archive-scoping.js` | `--only testArchiveNeverRelocatesReservedDir930` |
|---|---|---|---|
| **M1** | predicate → `false` in **all four** copies | **88 passed, 44 failed**, exit 1 — exactly the baseline number | **RED**, exit 1 — `#930 .roadmap / main lane: kaola-workflow/.roadmap must still exist in the main checkout after finalize / exit: 0 / archived:true, closure_receipt.archive:"closed", closure_invariants {ok:true,violations:[]}` — byte-for-byte the baseline failure |
| **M2** | predicate restored in **root + github only**; gitlab + gitea left neutered | **110 passed, 22 failed**, exit 1; every `^FAIL: 930` line is `[gitlab` or `[gitea` (measured: `sort -u` over the FAIL lines yields exactly those two) | not run (root edition is fixed in this leg, so it is green by construction) |
| — | unmutated (the shipped change) | **132 passed, 0 failed**, exit 0 | **PASSED** |

M1 proves the guard is what produces the green. M2 proves **each hand-port is independently
load-bearing** and reproduces the test author's predicted 110/22 exactly — the two counts were derived
independently, on different clones, and agree.

## 6. For the orchestrator — one thing outside my write set

`archive_reserved_directory` is a **new user-visible refusal reason** on `finalize` and `discard`.
Per CLAUDE.md's "on any user-visible change" rule that implies a `CHANGELOG.md` entry and possibly a
line in `docs/api.md` / `docs/workflow-state-contract.md` (whose `:127-140` paragraph already names
this hazard and says only that such a run is *invisible*, not that the archive now refuses it). The
brief scoped me to the four `*claim.js` copies, so I did not touch them — flagging rather than
silently widening. Note the memory-recorded ordering trap: write the CHANGELOG **before** the chain
receipt run, and `docs/api.md` is test-consumed so editing it stales the receipt.

No test is defective. Nothing was blocked. Nothing was left out of the assigned scope.

---
---

# Round 2 — repairs for adv-930 R1 (blocking) and R2

Appended after adversarial review refuted round 1. Both findings accepted; neither is disputed.
**Verification tier: `tests-green`.** Files changed: the same four `*claim.js` copies, nothing else.

## R1 — the predicate is exact-match; the filesystem it protects is not

**Accepted, and I do not dispute it.** `name === 'archive'` is a lexical test standing in for a
filesystem question, and on this volume the two disagree. My round-1 comment even asserted the guard
covers "both lanes at once" — true — while the name never reached it.

### The repair

```js
function isReservedWorkflowDirName(name) {
  const n = String(name);
  return n.toLowerCase() === 'archive' || n.startsWith('.');
}
```

`toLowerCase`, never `toLocaleLowerCase`: `toLocaleLowerCase` is locale-sensitive, and a guard whose
verdict depends on the operator's locale is a guard that fails somewhere. The dot arm is untouched —
`.Roadmap` still starts with a dot, so it never had the hole.

### The over-refusal trade — taken deliberately, and on the record

**I agree with the steer, and I want that agreement explicit rather than implied.** A blanket
case-fold does over-refuse on a case-sensitive filesystem, where `kaola-workflow/Archive` is a
genuinely distinct directory that could legitimately be a project. I take that cost:

1. **Correct first outranks the rest.** Over-refusing costs a rename of a name no run has ever used;
   under-refusing costs the destruction this issue exists to close. The adversary's own audit puts
   numbers on the first half — 41 distinct `workflow_project` values and 400 distinct archive
   directory names in the whole of this repository's history, none of them `archive` or any case
   variant. The observed cost of over-refusing is zero occurrences.
2. **The failure mode is asymmetric.** An over-refusal is loud, immediate, and repaired by renaming a
   project. An under-refusal is silent, exits 0, claims `archived:true`, and is discovered after the
   bytes are gone.
3. **Detection would be the speculative mechanism, not the fold.** Probing case sensitivity is a
   mechanism for a failure nobody has observed — `Archive`-as-a-project on a case-sensitive volume
   has never happened here. It also trades a *certain, bounded* over-refusal for an *uncertain* probe:
   case sensitivity on macOS is a per-volume format property, APFS supports both, and a probe that
   writes a temp file to answer it can fail on a read-only or permission-restricted root and would
   then have to pick a default anyway — which is the fold, with extra moving parts and a new failure
   surface. Under "add only what an observed failure demands", the fold is the whole answer.

One thing the fold does **not** do, and should not: it does not match by prefix or substring.
`archived` and `archive-notes` are ordinary project names and are still allowed (driven below).

### Driven proof — R1's own fixture, the adversary's own driver

I used the adversary's `drive_case2.js` and `drive_case.js` unmodified rather than writing my own,
so the repair is judged by the instrument that refuted it. Both are read-only against the repo
(they `require` its schema and spawn its `claim.js`, and build their own fixture in `os.tmpdir()`).

**Positive control first** — `base930`, the adversary's mirror, re-verified byte-identical to HEAD
for all four `claim.js` copies (`d650eb2915e4665b` root+codex, `64dafa022b9d7cdd` gitlab,
`e0190e688ba4cd28` gitea) and carrying zero occurrences of `isReservedWorkflowDirName`:

| | baseline (HEAD) `--project Archive` | **candidate** `--project Archive` |
|---|---|---|
| exit | **0** | **1** |
| envelope | `archived:true`, `dest:.../archive/Archive`, `closure_receipt.archive:"closed"` | `refuse` / `archive_reserved_directory` |
| branch | `chore: archive Archive` authored on `workflow/case2` | no commit |
| archive band, main | **does not exist** | intact, 4/4 files |
| archive band, worktree | **does not exist** | intact |
| `LOST_from_main` | `[".cache/final-validation.md","issue-900/mission-list.md","issue-900/workflow-state.md","workflow-state.md"]` | `[]` |
| `LOST_from_wt` | same four | `[]` |

**All four editions × both lanes**, candidate, `drive_case.js`:

```
cand-canonical-Archive-linked   exit=1 reason=archive_reserved_directory lostMain=[] lostWt=[]
cand-canonical-Archive-inplace  exit=1 reason=archive_reserved_directory lostMain=[] lostWt=[]
cand-codex-Archive-linked       exit=1 reason=archive_reserved_directory lostMain=[] lostWt=[]
cand-codex-Archive-inplace      exit=1 reason=archive_reserved_directory lostMain=[] lostWt=[]
cand-gitlab-Archive-linked      exit=1 reason=archive_reserved_directory lostMain=[] lostWt=[]
cand-gitlab-Archive-inplace     exit=1 reason=archive_reserved_directory lostMain=[] lostWt=[]
cand-gitea-Archive-linked       exit=1 reason=archive_reserved_directory lostMain=[] lostWt=[]
cand-gitea-Archive-inplace      exit=1 reason=archive_reserved_directory lostMain=[] lostWt=[]
```

(The 1 gitlab / 2 gitea forge calls are the `glab repo view` / `tea repo view` identity probes the
adversary already identified as pre-refusal; no issue-closing call in any leg.)

**The residue leg too.** On the non-`.gitignore` fixture, baseline `--project Archive` linked left 6
files of untracked residue at `archive/Archive/` (a partial self-copy of the band, including the
prior run and the salvage patch); the candidate leaves **zero** residue:

```
base canonical Archive linked   exit=1 archive_incomplete   RESIDUE added: ["Archive/.cache/final-validation.md","Archive/exports/issue-42-2026-01-01.patch","Archive/finalization-summary.md","Archive/issue-900/mission-list.md","Archive/issue-900/workflow-state.md","Archive/workflow-state.md"]
cand canonical Archive linked   exit=1 archive_reserved_directory   RESIDUE added: []
```

**More case variants, driven end-to-end:** `ARCHIVE`, `ArChIvE`, `archive` — all `exit=1`,
`archive_reserved_directory`, `LOST_main=[]`, `LOST_wt=[]`.

**Per-edition predicate probe**, identical output from all four copies:

```
refused: ["archive","Archive","ARCHIVE","ArChIvE",".roadmap",".Roadmap",".ROADMAP",".origin"]
allowed: ["exports","Exports","issue-930","archived","archive-notes","proj-ok"]
```

`archived` and `archive-notes` prove the fold did not become a prefix match. `exports` remains
allowed — the declared gap from round 1, unchanged and still deliberate.

**An incidental corroboration of R1's premise, from my own evidence collection.** I first wrote the
two M3 legs to `m3-Archive.json` and `m3-archive.json`; on this volume those are one file and the
second run silently overwrote the first. The printed lines were correct (each was read before the
next write), but I re-ran both into `m3-upper.json` / `m3-lower.json` so the durable artifacts are
unambiguous. The bug bit the evidence for the bug.

## R2 — the refusal detail was false at the surface it is emitted on

**Accepted.** The string only ever reaches a human on a finalize/discard envelope, and by then
`cmdFinalize` has written inside the reserved directory twice. Round 1's `"nothing was moved, copied,
stamped or deleted"` was mine and it was wrong. New text:

```
kaola-workflow/<project> is a reserved directory, not a project folder;
the archive step moved, copied, stamped and deleted nothing
```

One clause, no mechanism, exactly as directed. I deliberately did **not** add "…but earlier finalize
steps may have written into it": `archiveProjectDir` does not know its caller — the sink and the two
abandon sweeps reach it with neither of those writes — so a claim about what the caller did would be
the same category of error in the opposite direction. Scoping the sentence to what this function can
actually speak for is the whole fix. The reasoning is recorded in a comment beside it, naming both
writers, so the next person to widen the sentence sees why it is narrow.

Confirmed live in the candidate's own output — the worktree band after the refusal:

```
archive band AFTER wt: [".cache/final-validation.md","finalization-summary.md","issue-900/mission-list.md","issue-900/workflow-state.md","workflow-state.md"]
                                                     ^^^^^^^^^^^^^^^^^^^^^^^ the pre-existing write the old sentence denied
```

**The test author landed the matching pin while I was working**, and it agrees with the scoping
exactly: assertion (1b) compares the reserved directory as a **set** and tolerates one declared name,
`KNOWN_ADDITIONS = new Set(['finalization-summary.md'])`, with the comment *"a refusal that reports
it touched nothing still leaves this behind"*. Green against the repair.

**A residual observation, recorded not built.** In the in-place lane the same writer puts
`finalization-summary.md` at `kaola-workflow/archive/finalization-summary.md` — the archive band's
root — because `kaola-workflow/Archive` resolves there. Pre-existing `cmdFinalize` machinery, not the
archive step, destroys nothing, and outside both the assigned scope and R2's stated fix.

## Verification, round 2

Every command re-run after the repair. Exit codes read from `$?` on unpiped invocations.

| Command | Round 1 after | **Round 2 after** | Exit |
|---|---|---|---|
| `node scripts/test-forge-archive-scoping.js` | 132 passed, 0 failed | **188 passed, 0 failed** (the suite gained its case-variant arm mid-session) | **0** |
| `node scripts/simulate-workflow-walkthrough.js --only testArchiveNeverRelocatesReservedDir930` | PASSED | **`PASSED (4/4 names x 2 lanes)`** — the 4th name is the `Archive` case variant | **0** |
| `node scripts/simulate-workflow-walkthrough.js` (**FULL scope**) | 203/203 | **`{"scenarios":203,"ran":203,"passed":203,"failed":0}`** / `Workflow walkthrough simulation passed` | **0** |
| `node scripts/validate-script-sync.js` | exit 0 | `OK: 15 common scripts, 27 byte-identical groups … 4 Oracle Kernel copies identical at HEAD` | **0** |
| `node scripts/edition-sync.js --check` | exit 0 | `8 forge aggregator ports in parity` / `committed kernel parity verified at HEAD` | **0** |
| `node --check` ×4 | 0 | all four `-> 0` | **0** |
| `node scripts/test-bundle-finalize.js` | 149 passed | `all 149 tests passed` | **0** |
| `node scripts/test-claim-hardening.js` | 766 assertions | `claim-hardening tests passed (766 assertions)` | **0** |

Cross-edition structural check: each of the four copies carries exactly **one**
`isReservedWorkflowDirName` definition and exactly **one** call site, and the predicate body hashes
identically in all four (`cecd3024a7964415`). Diff is **4 files, +232/−0**, two hunks each, zero
deletions — `scripts/kaola-workflow-claim.js` and the github plugin copy are byte-identical
(`732809be471d535c…`, copied not re-typed, and verified before overwriting that the plugin copy still
carried only my own round-1 hunks).

### One red I captured, and why it is not mine

The first full-scope run after the repair exited 1 on `testSinkTransactionCrashResume`:
`#429 crash-resume: second --sink run must exit 0 / stderr: priorArchiveExisted is not defined`.

That is a `ReferenceError` out of `sink-merge.js` — another agent's #931 lane, caught mid-edit.
Established rather than assumed:

- `priorArchiveExisted` occurs **0 times** in all four of my `claim.js` copies;
- it does not exist at HEAD (`git show HEAD:scripts/kaola-workflow-sink-merge.js | grep -c` → 0);
- it lives only in the working-tree `*sink-merge.js` copies, as a parameter of
  `describeArchiveCollision`;
- on a mirror of the current tree with **my `claim.js` unchanged**, the scenario passes — the edit
  was completed in the interval, and the failure is no longer reproducible.

I did not touch those files. The final full-scope run, after that agent's edit settled, is the clean
203/203 above.

## Mutation proof, round 2 — three legs

Scratch APFS clone-on-write mirror again; never `git checkout --` in the working tree. Mirror
deleted afterwards, along with the drivers' tmp fixtures.

**M3 is the new leg and the one that matters** — it reverts *only the case-fold*, leaving the guard,
its call site, the dot arm and every comment in place. It isolates the repair from the round-1 work:

| Leg | Mutation | Result |
|---|---|---|
| **M3** | `n.toLowerCase() === 'archive'` → `n === 'archive'`, all four copies | `--project Archive`: **exit 0**, `"archived":true`, `closure_receipt.archive:"closed"`, `dest:.../archive/Archive`, `chore: archive Archive` committed to `workflow/case2`, **both bands destroyed** (`LOST main` and `LOST wt` = all 4 files). `--project archive` control on the same mutant: **exit 1, `archive_reserved_directory`, nothing lost.** |
| **M1** | predicate → `false`, all four copies | scoping **140 passed, 48 failed** (exit 1); walkthrough scenario RED with the baseline message |
| **M2** | predicate restored root + github only; gitlab + gitea left at `false` | scoping **164 passed, 24 failed** (exit 1); every `^FAIL: 930` is `[gitlab/…` or `[gitea/…`, and now on **both** arms — `gitlab/.roadmap`, `gitlab/Archive`, `gitea/.roadmap`, `gitea/Archive` |
| — | shipped | scoping **188/0**, walkthrough scenario `PASSED (4/4 names x 2 lanes)`, full scope **203/203** |

M3 proves the one expression I changed in round 2 is load-bearing, with a same-mutant lowercase
control proving the mutation did not simply disable the guard. M1 and M2 prove the round-1 guard and
each hand-port remain load-bearing against the enlarged suites.

## Correction to my round-1 report, on the record

Round 1 stated the `archive` control's before-state was *"`EINVAL` (main lane) / `archive_incomplete`
naming 8384 entries (worktree lane), both exit 1"*, and used **"nothing is lost either way"** as the
reason the control could safely change mechanism. **That justification was false for the linked
lane.** Driven at HEAD, `--project archive --keep-worktree` exits **0** and destroys the whole band in
both checkouts; the earlier exit-1 reading was fixture-dependent — that fixture's band was large
enough for `verifyArchiveComplete` to refuse, and a smaller band copies cleanly and proceeds to the
delete. I inherited the characterisation from the premise report and repeated it without driving it
myself, which is the error. No code consequence: the change refuses that lane too (control B above,
`LOST=[]`). But the conclusion was resting on something untrue, and the issue's own "the `archive`
control is the safe one" premise was never a guarantee either.

## Standing items, unchanged

- **`exports` is still not covered.** Declared in round 1, unchanged, and the adversary drove it
  (R4): with or without a pre-existing `archive/exports/`, nothing is destroyed on either the
  baseline or the candidate. Recorded, not built.
- **The doc obligation is outside my write set** and I see `CHANGELOG.md`, `docs/api.md` and
  `docs/workflow-state-contract.md` are now modified in the tree by someone else. `archive_reserved_directory`
  is a new user-visible refusal reason; if those edits predate this round, the case-fold does not
  change the reason token or the envelope shape, only which names reach it.
- No test is defective. Nothing in scope was left out.
