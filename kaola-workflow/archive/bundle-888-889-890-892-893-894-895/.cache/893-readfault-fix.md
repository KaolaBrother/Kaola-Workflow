# #893 — the read-fault repair, and the committed-paths report

Two waves, in order: §1–§7 the read-fault repair (`w1`–`w7`); §9 the committed-paths report
(`w8`/`w9`/`w10`), dispatched afterwards once the ruling settled.

**Verification tier:** `tests-green` — **`node scripts/test-sink-merge.js` exits 0 at
`257 assertions passed, 0 FAIL`**, the whole file, both waves. Every arm is mutation-proven: two
mutations for the read-fault repair (§4) and two for the report (§9).

**Worktree:** `.kw/worktrees/bundle-888-889-890-892-893-894-895` · **Baseline commit:** `fa5157b3`
**Test artifact:** `scripts/test-sink-merge.js` — read and run, **never written**.

---

## 1. The defect

`sinkPreflight`'s own-archive exemption resolved every `git show` failure toward *exempt*:

```js
try { branchBytes = execFileSync('git', ['-C', mainRoot, 'show', archiveKey + ':' + filePath], …); }
catch (_) {}
if (branchBytes === null) continue;      // "absent → exempt" also swallows every read fault
```

`branchBytes === null` conflates *the branch does not carry this path* with *this process could not
read what the branch carries*, so the three-way rule lost its third arm and a **divergent** branch
copy was exempted whenever the read failed — for any reason.

## 2. The repair

`scripts/kaola-workflow-sink-merge.js:1418-1439`. Existence and content are probed **separately**:

```js
    const ownArchivePrefix = 'kaola-workflow/archive/' + project + '/';
    if (xy === '??' && filePath.startsWith(ownArchivePrefix)) {
      const archiveKey = branchless ? 'HEAD' : branch;
      let branchHasPath = false;
      try {
        execFileSync('git', ['-C', mainRoot, 'cat-file', '-e', archiveKey + ':' + filePath],
          { stdio: ['ignore', 'ignore', 'ignore'] });
        branchHasPath = true;
      } catch (_) {}
      if (!branchHasPath) continue;                     // NOT CARRIED → the observed shape → exempt
      let branchBytes = null;
      try {
        branchBytes = execFileSync('git', ['-C', mainRoot, 'show', archiveKey + ':' + filePath],
          { maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
      } catch (_) {}
      let workBytes = null;
      try { workBytes = fs.readFileSync(path.join(mainRoot, filePath)); } catch (_) {}
      // Byte-equality is the ONLY thing that exempts a path the branch carries. A read that failed
      // leaves branchBytes null and can never satisfy this, so unverifiable falls through with
      // divergent — no continue: both stay foreign dirt below.
      if (branchBytes !== null && workBytes !== null && branchBytes.equals(workBytes)) continue;
    }
```

A four-way rule replaces the three-way one that lost an arm:

| branch state | verdict |
|---|---|
| **not carried** (`cat-file -e` non-zero) | exempt — #893's observed shape, main holds the run's only copy |
| carried, byte-equal | exempt — a duplicate of what the branch already carries |
| carried, divergent | **foreign dirt** — two archives disagree, refuse loudly |
| carried, **unreadable / truncated** | **foreign dirt** — unverifiable is not absent |

`if (branchBytes === null) continue;` — the whole defect — is gone. `cat-file -e` is the right
existence probe because it interrogates the tree, emits no bytes of its own to overflow, and still
answers when the blob cannot be inflated; it cannot express the divergence test, which is why the
content read follows it rather than replacing it. Node's `execFileSync` throws `ENOBUFS` on overflow
rather than returning truncated bytes (proven by the probe's P5 precondition), so the failed-read
branch covers truncation and no extra size probe was added.

Everything else is preserved verbatim: classification-only (`continue` or fall through — never
`projDuplicates`, never `break`, never `unlink`), scoped to this project by the trailing-slash segment
boundary with a plain string test, `xy === '??'`, positioned after `SINK_RECEIPT_EXEMPT`.

### Per-forge treatment

| file | lines | treatment |
|---|---|---|
| `scripts/kaola-workflow-sink-merge.js` | 1418-1439 | canonical; full comment derivation, multi-line `try` blocks, `stdio: ['ignore','ignore','ignore']`, keys on `branchless ? 'HEAD' : branch` |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | 1418-1439 | byte-identical twin, `cp`'d verbatim — md5 equality verified |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | 1388-1399 | genuine port: condensed comment, **one-line** `try`/`catch`, `stdio: 'ignore'` matching that port's own bucket-2 at `:1354`, keys on `branch` — no `#711` branchless handling, preserved |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | 1395-1406 | same condensed idiom, keys on `branch` at `:1361` |

`kaola-workflow-sink-merge.js` is not in `edition-sync.js`'s `GENERATED_AGGREGATORS`; no canonical
text was pasted into either port. `edition-sync.js --write` was **not** run.

---

## 3. Verification

The suite file moved repeatedly during this task (`5014ae6b` → `3ba4c311` → `7f8c7c42` → `43636de9`
→ `5014ae6b` → `3713b8fc` → `611971606e0bdfe07b10aca4be123272`), so every run below records the md5
immediately before **and** after and was stable across itself. Final results at `611971606e…`:

| command | before | after |
|---|---|---|
| `node scripts/test-sink-merge.js` | exit **1** — `w5 ×1, w6 ×1, w7 ×5` red (§4a) | exit **1** — **`w1`–`w7` all pass**; 12 failures remain, all `receipt.archived_paths` in `w8`/`w9`/`w10` (out of scope) |
| `probe-893.js` (independent, §5) | exit **1** — `7 failed, 37 passed` | exit **0** — `44 assertions` |
| `node scripts/edition-sync.js --check` | exit 1 (`kaola-*-workflow-release.js`, another agent's in-flight work) | exit **0** — `8 forge aggregator ports in parity` · `committed kernel parity verified at HEAD` |
| `node scripts/validate-script-sync.js` | exit 1 (same, not mine) | exit **0** — `15 common scripts, 27 byte-identical groups … in sync` |
| `node --check` × 4 sink copies | — | all OK |

At an intermediate point the suite reached `235 assertions passed, 0 FAIL, exit 0` — that was the
`w1`–`w7`-only revision, before `w8`/`w9`/`w10` were re-authored. Recorded because it is the cleanest
single statement of this repair's scope being green, but the run above is the authoritative one.

The full walkthrough was not run.

---

## 4. Mutation proofs — against the settled repo suite

Scratch mirror (`…/scratchpad/mir/`): worktree-root entries symlinked, `scripts/` a real recursive
copy so `repoRoot`/`sinkMergeScript` resolve to the mutable side. No `git checkout --`, no
`git stash`. Pristine kept at `…/scratchpad/mir-pristine.js`.

**Control** (unmutated mirror): `12 failed, 244 passed` — identical to the worktree, so any extra red
below is the mutation and not the mirror.

### (a) Revert to swallowing all failures — `catch (_) {}` + null-means-absent

The existence probe removed and `if (branchBytes === null) continue;` reinstated: byte-for-byte the
pre-repair block.

```
Sink-merge (…/#893) test suite FAILED: 19 failed, 237 passed.
   w5 ×1 · w6 ×1 · w7 ×5      ← the seven NEW reds vs control
```

Exactly the seven the test author predicted, by name:

```
FAIL: #893 w5: foreign_dirt must list …/issue-89305/mission-list.md — the branch carries DIVERGENT
      bytes there and the copy could not be read, which is unverifiable, not exempt
FAIL: #893 w6: foreign_dirt must list …/issue-89306/mission-list.md — a branch copy too large for
      the read buffer is unverifiable, not absent
FAIL: #893 w7: the sink must emit a well-formed JSON envelope — an unhandled error past preflight
      gives the orchestrator nothing to route on
FAIL: #893 w7: the envelope must be a typed refusal; got null
FAIL: #893 w7: reason must be sink_blocked; got null
FAIL: #893 w7: foreign_dirt must name the unverifiable divergent path …; got null
FAIL: #893 w7: git status must be unchanged after sink_blocked refuse
```

**`w1`–`w4` stayed green** under the mutation — the repair is what flips `w5`/`w6`/`w7`, and those
three were genuinely RED before this change against the untracked shape. Not a vacuous green.

### (b) Existence-probe answer IGNORED — everything treated as present

`branchHasPath = true;` inserted before the `if (!branchHasPath) continue;`.

```
Sink-merge (…/#893) test suite FAILED: 33 failed, 223 passed.
   w1 ×8 · w2 ×4 · w3 ×4  (+ w8/w9/w10, which also depend on the exemption firing)

FAIL: #893 w1: the sink must NOT refuse sink_blocked on its OWN archive mirror
FAIL: #893 w1: sink must exit 0; got 1
FAIL: #893 w1: status must be sinked; got undefined
FAIL: #893 w1: …/issue-89301/{selection-record.json,finalization-summary.md,mission-list.md,
      workflow-state.md} must be committed at HEAD carrying the mirrored content after the sink
FAIL: #893 w1: main checkout must be clean after status:sinked
```

**`w1` reds on all eight assertions** — #893's own bug returns. The absent-arm is load-bearing and the
repair has not simply made everything foreign dirt.

### Restore, verified

Mirror restored from pristine, re-run → back to control's `12 failed, 244 passed`. md5 of the restored
mirror, the worktree canonical and the plugin twin all read
`01f649e30ed05d9d4a8467416f651716` — identical, so neither mutation ever reached the worktree.

---

## 5. Independent evidence that does not depend on the test file at all

Because the oracle was moving (§6), I built my own end-to-end reproduction of the **production**
shape — the archive mirror UNTRACKED in main, exactly as `archiveProjectDir` leaves it — driving the
real sink through its real CLI against a bare remote with the standard `gh` mock.

`/private/tmp/claude-501/…/scratchpad/probe-893.js` — scratchpad only, **no repo test file touched**.
`SINK=` selects which copy of the sink to run. 44 assertions, 7 scenarios:

| | scenario | arm |
|---|---|---|
| P1 | branch carries nothing under the archive path → mirror exempt | the observed #893 shape |
| P2 | branch carries a BYTE-EQUAL copy → exempt | duplicate arm |
| P3 | branch carries a DIVERGENT READABLE copy → foreign dirt | pre-existing third arm |
| **P4** | **divergent + object `chmod 000` → foreign dirt** | **the repair** |
| **P5** | **divergent + 1 MiB past `GIT_MAX_BUFFER` → foreign dirt, nothing corrupt anywhere** | **the repair** |
| **P6** | **same, nothing else dirty → typed envelope, `refuse`, `sink_blocked`, zero mutation** | **the repair** |
| P7 | sibling tree + prefix look-alike stay bucket-3 | over-exemption fence |

```
repaired sink  → PROBE passed: 44 assertions.      exit 0
mutation (a)   → PROBE FAILED: 7 failed, 37 passed.
                 P4, P5, and P6 ×5 — including the untyped crash reproducing the verifier's A1e
                 stderr verbatim: "error: The following untracked working tree files would be
                 overwritten by checkout: …/mission-list.md … Aborting"
mutation (b)   → PROBE FAILED: 14 failed, 30 passed.   P1 ×4 red — the observed shape.
```

Two oracles, built independently, agree on both mutations.

---

## 6. Recorded: the oracle was briefly rewritten on a false premise

Between the brief and the repair, `scripts/test-sink-merge.js` was rewritten to plant the archive
mirror **staged** (`stagedPlant`, porcelain `A `), on the stated premise that "finalize stages what it
mirrored (`git -C <mainRoot> add`) while still deferring the commit". I stopped rather than implement
against it, because that premise is false:

| evidence | says |
|---|---|
| `scripts/kaola-workflow-claim.js:2480` (`archiveProjectDir`, the branch that WRITES the mirror) | "The archive is untracked on main until the sink's archive_commit step lands it" |
| `scripts/kaola-workflow-claim.js:4150-4157` (`cmdFinalize`'s staging block) | "OUTSIDE this worktree's index and **can never be staged here** — `path.relative(root, dest)` escapes the worktree"; the code guard is exactly that: `if (destRel && !destRel.startsWith('..') …)` |
| `scripts/kaola-workflow-claim.js:2076` | "Main's copy is deliberately UNTRACKED there until the sink's archive_commit step lands it" |
| `scripts/kaola-workflow-claim.js:2619` | names `archive_commit` (in sink-merge.js) as the stager |
| every other `git add` in claim.js | `:2738` is `commitDiscardArchive`; `:5040` is `cmdWorktreeFinalize` staging the LIVE folder inside the worktree; `:686`/`:691` are `git worktree add` |
| **issue #893's own observation** | "bundle-886-887 — `sink_blocked`, 5 archive files **untracked** in main" |

Implementing the index gate would have turned the suite green and **returned #893's bug to
production**. The orchestrator verified the refutation independently, withdrew the premise, and the
test author reverted the `stagedPlant` rewrite; `w1`–`w7` are back on the untracked shape and are the
oracle §3 and §4 measure against. Kept here because it is the reason this task took the shape it did,
and because it is a live instance of the project's own rule that a green suite is not evidence a
guard is armed.

---

## 7. md5

| file | before | after |
|---|---|---|
| `scripts/kaola-workflow-sink-merge.js` | `007998d32b3bb576a8031572e7051644` | `01f649e30ed05d9d4a8467416f651716` |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | `007998d32b3bb576a8031572e7051644` | `01f649e30ed05d9d4a8467416f651716` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | `a821542c350e45039e58f10e01cb7ab4` | `3ba796edb1d1462c28817ebb4470efcf` |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | `4f07e3e7a1244dd47e6bd579f2158e10` | `0cf81ecf2c1604a2bad3bd9c037afde6` |

Canonical and plugin twin byte-identical, before and after.

---

## 8. Out of scope for the read-fault wave

- **`receipt.archived_paths`** — the DEFECT 2 reporting arm. Deferred at the time; now delivered, §9.
- `scripts/kaola-workflow-claim.js` — untouched, as directed. No producer change was made.
- `CHANGELOG.md` / `docs/api.md` — other agents hold them; excluded by the brief.

---

# 9. Second wave — the committed-paths report (`w8`/`w9`/`w10`)

The ruling: the sink commits its whole own-archive pathspec and **cannot** tell a file finalize
mirrored from one nobody wrote. The archive copies a folder that lives untracked in main and is
committed nowhere, so git holds no record of what belongs; and no name list can stand in for one when
archives carry whatever artifacts a run needed. So the harm closed is **silence, not the commit** —
per ADR 0017 the sink reports what it found and the orchestrator gets the branch right. `w8` pins
this as a fence: the stray IS committed, and the sink exits 0. **No refusal was added and no attempt
is made to classify strays.**

## 9.1 Implementation

Three changes, in each of the four copies.

**(i) The measurement — `stagedPathsUnder(mainRoot, pathspec, excludes)`**, a new helper beside
`persistSinkFindingsToSummary`:

```js
const out = execFileSync('git', ['-C', mainRoot, 'diff', '--cached', '--name-only', '--',
  pathspec, ...(excludes || [])], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, … });
return out.split('\n').map(s => s.trim()).filter(Boolean);
```

Read from the **index**, not the working tree and not the caller's own list of what it believed it
planted — that is what makes the report unable to under-claim a file that rode in unnoticed or
over-claim one this sink never touched. It carries the same `:(exclude)` list the add/commit use, so
a journal kept out of the commit is kept out of the report.

Empirically confirmed before use: `git diff --cached --name-only` with an **unmatched** pathspec exits
0 with empty output (unlike `git add`, which is fatal) — so the `w10` gitignored shape needs no
special case.

**(ii) The wiring**, in `archive_commit`, immediately after the `git add` and before the commit —
the one moment the answer is both knowable and still changeable:

```js
receipt.archived_paths = stagedPathsUnder(mainRoot, projectPathspec, excludes);
if (persistArchivedPathsToSummary(archiveDir, receipt.archived_paths)) {
  try { execFileSync('git', ['-C', mainRoot, 'add', '--', ...commitPaths, ...excludes], …); } catch (_) {}
}
```

Scoped to `projectPathspec`, so a **sibling's** archive residue — `#715`-exempt at preflight and never
in `commitPaths` — is correctly absent: reporting a path this sink never touched would be a different
lie from staying silent about one it did (`w9`). The durable copy is written **before** the commit and
re-staged so it rides that same commit rather than being left dirty behind it.

**(iii) The durable half — `persistArchivedPathsToSummary(destDir, archivedPaths)`.** Shares
`persistSinkFindingsToSummary`'s `## Sink Findings` section, adding that header only when the findings
writer did not already emit one; idempotent on `/^archived_paths:$/m` across a crash-resumed re-entry;
same swallow-on-error discipline (a measurement writer must never be able to fail the operation it
reports on).

It **never creates** the summary. Two reasons, and the second is what makes the sequencing sound: a
report that invented a file inside the archive would add exactly the kind of unaccounted path it
exists to disclose; and because it only ever appends to a file the `add` already swept, it cannot
change the path set it just reported — so no recomputation after the re-add is needed.

**(iv) `archived_paths: []` in the receipt initializer**, beside `removed_duplicates: []` — the model
the test names. Present-and-empty from the start, because a consumer that must tell "committed
nothing under the archive" from "this sink does not report" cannot rely on a field that is sometimes
absent (`w10`).

## 9.2 What it actually emits

Executed against the `w8` shape (four mirrored files plus a planted `.env.local`):

```
exit=0  status=sinked
receipt.archived_paths = [
  "kaola-workflow/archive/issue-90008/.cache/origin/selection-record.json",
  "kaola-workflow/archive/issue-90008/.env.local",
  "kaola-workflow/archive/issue-90008/finalization-summary.md",
  "kaola-workflow/archive/issue-90008/mission-list.md",
  "kaola-workflow/archive/issue-90008/workflow-state.md"
]
--- committed finalization-summary.md at HEAD ---
# Finalization Summary

READY FOR FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-90008/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-90008/.env.local
- kaola-workflow/archive/issue-90008/finalization-summary.md
- kaola-workflow/archive/issue-90008/mission-list.md
- kaola-workflow/archive/issue-90008/workflow-state.md
```

Both header paths are exercised in reality: here `persistSinkFindingsToSummary` had already written
`## Sink Findings` (carrying `post_rebase_tests: skipped`), and the new writer appended under it
rather than duplicating it; in a run with neither findings nor a test result it emits the header
itself.

## 9.3 Per-forge treatment

| file | treatment |
|---|---|
| `scripts/kaola-workflow-sink-merge.js` | canonical; helpers placed after `persistSinkFindingsToSummary`, multi-line bodies, `projectPathspec` |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | byte-identical twin, `cp`'d verbatim — md5 equality verified |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | genuine port: helpers placed after that port's **own** `GIT_MAX_BUFFER` declaration (which sits *later* there than in canonical — a paste would have referenced it before declaration), condensed one-line bodies, condensed comments, receipt field folded onto the existing `stash_ref: null, removed_duplicates: [],` line, and the wiring keys on the port's own local `ps` rather than `projectPathspec` |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | same per-forge shape, same `ps` keying |

`edition-sync.js --write` was **not** run.

## 9.4 Verification

| command | before | after |
|---|---|---|
| `node scripts/test-sink-merge.js` | exit **1** — `12 failed, 244 passed` (all `receipt.archived_paths`) | exit **0** — **`257 assertions passed`, 0 FAIL** |
| `probe-893.js` (read-fault, §5) | exit 0 | exit **0** — `44 assertions`; the first wave did not regress |
| `node scripts/edition-sync.js --check` | exit 0 | exit **0** |
| `node scripts/validate-script-sync.js` | exit 0 | exit **0** |
| `node --check` × 4 sink copies | — | all OK |

Test file `49f2b962751193f0057f96d7c0a5baac`, byte-stable before and after every run above.

## 9.5 Mutation proofs

Scratch mirror, control `257 assertions passed` — identical to the worktree.

### (a) Emit `archived_paths` but omit the stray

The forbidden discriminator, in the form an implementer would actually reach for: filter the report to
a basename allowlist of the four names finalize is "supposed" to write.

```
Sink-merge (…/#893) test suite FAILED: 2 failed, 255 passed.

FAIL: #893 w8: receipt.archived_paths must name …/issue-89308/.env.local — it was committed to the
      default branch and pushed, and the report is uniform precisely because the sink cannot tell it
      from the mirror
FAIL: #893 w8: the committed finalization-summary.md must name …/issue-89308/.env.local in its
      ## Sink Findings — a report that exists only on stdout leaves the record silent
```

**Both** report homes red, and nothing else moves.

### (b) The report reaches stdout only, never the committed summary

`persistArchivedPathsToSummary` short-circuited to a stderr write returning `false`, leaving
`receipt.archived_paths` fully correct.

```
Sink-merge (…/#893) test suite FAILED: 1 failed, 256 passed.

FAIL: #893 w8: the committed finalization-summary.md must name …/issue-89308/.env.local in its
      ## Sink Findings — a report that exists only on stdout leaves the record silent
```

**Exactly one** red — the durable home — while every envelope assertion stays green. Read against (a),
this proves the two homes are **independently** armed: (a) reds both, (b) reds only the durable one.

### Restore, verified

Mirror restored from pristine → back to `257 assertions passed`. md5 of the restored mirror, the
worktree canonical and the plugin twin all read `ab8bc7034bb33a9911e04fe4d28c1148` — identical, so
neither mutation ever reached the worktree.

## 9.6 md5 after the second wave

| file | after wave 1 | after wave 2 |
|---|---|---|
| `scripts/kaola-workflow-sink-merge.js` | `01f649e30ed05d9d4a8467416f651716` | `ab8bc7034bb33a9911e04fe4d28c1148` |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | `01f649e30ed05d9d4a8467416f651716` | `ab8bc7034bb33a9911e04fe4d28c1148` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | `3ba796edb1d1462c28817ebb4470efcf` | `bb81d90527eb2b724d3072316641b36d` |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | `0cf81ecf2c1604a2bad3bd9c037afde6` | `a82bf59be5902f282959bb90f6ece15c` |

Canonical and plugin twin byte-identical throughout.

## 9.7 Still out of scope

- `scripts/kaola-workflow-claim.js` — untouched. No producer change.
- `CHANGELOG.md` / `docs/api.md` — other agents hold them. `receipt.archived_paths` is a new
  user-visible envelope field and will want a line in both; I did not write it.
- The full walkthrough was not run.
