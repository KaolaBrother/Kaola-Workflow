# issue #932 — implementation record (implementer)

> A failed claim must not delete anything the claim did not create.

Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-932`
Branch: `workflow/issue-932`. **No test file was edited** (custody: `tdd-guide`) — the two test
files' diffstat is byte-for-byte what it was when I started: `+242` / `+120`, 0 deletions.

Verification tier: **tests-green** (both authored suites), plus a **smoke-integration** run for the
two forge hand-ports, which no suite covers.

---

## Baseline — BEFORE any production edit (exit codes captured directly, never through a pipe)

```
$ node scripts/simulate-workflow-walkthrough.js
WALKTHROUGH_EXIT=1
  ... testArchiveNeverRelocatesReservedDir930: PASSED (4/4 names x 2 lanes)
  Error: #932 .roadmap: kaola-workflow/.roadmap must still exist after a claim that failed — the claim did not create it
  exit: 1
  stderr: ENOTDIR: not a directory, mkdir '.../kw-claim-adopts-932-mdHntf/kaola-workflow/.roadmap/.cache/origin'
  spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":2295}
    (the run ABORTS here — testClaimRollbackRemovesOnlyWhatItCreated932 never executes)

$ node scripts/test-bundle-claim.js
BUNDLE_EXIT=1
  test-bundle-claim: 5 test(s) FAILED, 191 passed
  FAIL: #932: kaola-workflow/bundle-9330-9331 must still exist after a claim that failed ...
  FAIL: #932: the rollback deleted kaola-workflow/bundle-9330-9331/NOTES.md ...
  FAIL: #932: the rollback altered kaola-workflow/bundle-9330-9331/NOTES.md
  FAIL: #932: the rollback deleted kaola-workflow/bundle-9330-9331/notes/evidence.txt ...
  FAIL: #932: the rollback altered kaola-workflow/bundle-9330-9331/notes/evidence.txt
```

## After — the same two commands on the final tree

```
$ node scripts/simulate-workflow-walkthrough.js
FINAL_WALKTHROUGH_EXIT=0
  testClaimNeverDeletesWhatItDidNotCreate932: PASSED (2 names)
  testClaimRollbackRemovesOnlyWhatItCreated932: PASSED (created removed, adopted intact)
  ##KW-SHARD {"scenarios":205,"ran":205,"passed":205,"failed":0}
  Workflow walkthrough simulation passed

$ node scripts/test-bundle-claim.js
FINAL_BUNDLE_EXIT=0
  test-bundle-claim: all 196 tests passed
```

Also run (I edited two forge editions, so their own gates were checked; `npm test` deliberately NOT
run — the lead owns that):

| command | exit |
|---|---|
| `node scripts/edition-sync.js --check` | 0 |
| `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | 0 |
| `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | 0 |
| `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | 0 |
| `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | 0 |
| `node --check` on all four production files | 0, 0, 0, 0 |

---

## The diff shape — identical in all four files, +82/-3 each

Two new module-level helpers, placed next to `persistSelectionRecord` (the code that writes the
artifact they take back), plus four call-site changes.

**`probeAdoptedDir(root, project)`** — run BEFORE the transaction, only when the directory was
adopted. Returns what was already on disk: `record` (the selection-record path), `recordFound`,
`stateFound`, and `dirsFound` (the record's ancestor directories that already existed).

**`rollbackAdoptedDir(root, project, probe)`** — removes `workflow-state.md` only if
`!stateFound`, the selection record only if `!recordFound`, then prunes the record's ancestor
directories upward while they are *both* absent from `dirsFound` *and* empty, stopping at the
project dir. Every removal is individually wrapped, so a `.cache`-is-a-file fixture is a clean
no-op rather than a throw.

**Site 1 — `claimProject`:**
- the non-recursive `fs.mkdirSync(dir)` now records its outcome in `let dirCreated = true`, set to
  `false` on the EEXIST fall-through (the adopt arm). That signal was already being computed; it
  was simply discarded.
- `const adopted = dirCreated ? null : probeAdoptedDir(root, project);` immediately after.
- the rollback's `try { fs.rmSync(dir, {recursive:true,force:true}); } catch (_) {}` became
  `if (dirCreated) { ...same line, unchanged... } else rollbackAdoptedDir(root, project, adopted);`

**Site 2 — `claimBundle`** (not `claimExplicitBundle`):
- same `dirCreated` capture; `applied.dir = true` became `applied.dir = dirCreated`, i.e. it now
  records CREATION rather than arrival;
- `if (!dirCreated) adopted = probeAdoptedDir(root, project);`, with `adopted` declared beside
  `claimErr` so the catch block can see it. Deliberately NOT stored on `applied` — that object is
  serialized to a human as the `partial` field, and this is internal teardown bookkeeping, not a
  surviving mutation anyone must clean up by hand;
- teardown step (c) gained an `else if (adopted) rollbackAdoptedDir(...)`. Its comment already read
  *"Remove project dir if created"*; the comment now says the code matches that, rather than
  announcing a new mechanism.

### Cross-copy fidelity, measured rather than eyeballed

Extracting the code-only added/removed lines from each of the three DIVERGENT copies gives 44 lines
each, and sorted they are **identical**:

```
canonical vs gitlab, sorted diff -q  -> exit 0
canonical vs gitea,  sorted diff -q  -> exit 0
wc -l: 44 / 44 / 44
```

The only unsorted difference is line ORDER, because `claimBundle` sits before the helper block in
canonical and after it in the forge copies.

### The byte-identical copy

```
$ git show HEAD:scripts/kaola-workflow-claim.js > /tmp/canonical-head.js
$ diff -q /tmp/canonical-head.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
BASELINE_BYTE_IDENTICAL_EXIT=0                       # confirmed identical BEFORE I started

$ cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
$ diff -q scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
DIFF_Q_EXIT=0                                        # still identical AFTER (386986 bytes each)
```

---

## Load-bearing proof — ONE site reverted at a time, verbatim output

`scripts/kaola-workflow-claim.js` was snapshotted to the scratchpad first and restored by `cp`
(never `git checkout`), with `diff -q` confirming the restore and `grep -rn MUTATION-PROOF scripts/
plugins/` returning **exit 1 (no matches)** afterwards.

### SITE 1 reverted (`claimProject` rollback back to the unscoped `rmSync`)

`node scripts/simulate-workflow-walkthrough.js --only testClaimNeverDeletesWhatItDidNotCreate932`
→ **exit 1**:

```
Error: #932 .roadmap: kaola-workflow/.roadmap must still exist after a claim that failed — the claim did not create it
exit: 1
stdout:
stderr: ENOTDIR: not a directory, mkdir '/private/var/folders/8s/.../T/kw-claim-adopts-932-R1eH3P/kaola-workflow/.roadmap/.cache/origin'
    at assert (.../scripts/simulate-workflow-walkthrough.js:36:25)
    at Object.testClaimNeverDeletesWhatItDidNotCreate932 [as fn] (.../simulate-workflow-walkthrough.js:2922:7)
```

`--only testClaimRollbackRemovesOnlyWhatItCreated932` → **exit 1**:

```
Error: #932: kaola-workflow/issue-9324 must still exist after a claim that failed — the claim did not create it
exit: 1
stdout:
stderr: refused: codex_dispatch_mode contains a newline/CR — durable-state field injection. Provide a single-line value.
    at Object.testClaimRollbackRemovesOnlyWhatItCreated932 [as fn] (.../simulate-workflow-walkthrough.js:3021:5)
```

`node scripts/test-bundle-claim.js` under the SAME mutant → **exit 0**, `all 196 tests passed`.
Site 2's coverage is not standing in for site 1's.

### SITE 2 reverted (`claimBundle` teardown back to an unscoped whole-tree rm on the adopted path)

`node scripts/test-bundle-claim.js` → **exit 1**:

```
Test (8d)/#932: rollback must not delete content of a project folder it did not create
FAIL: #932: kaola-workflow/bundle-9330-9331 must still exist after a claim that failed — the claim did not create it
FAIL: #932: the rollback deleted kaola-workflow/bundle-9330-9331/NOTES.md — a file the claim did not create
FAIL: #932: the rollback altered kaola-workflow/bundle-9330-9331/NOTES.md
FAIL: #932: the rollback deleted kaola-workflow/bundle-9330-9331/notes/evidence.txt — a file the claim did not create
FAIL: #932: the rollback altered kaola-workflow/bundle-9330-9331/notes/evidence.txt
test-bundle-claim: 5 test(s) FAILED, 191 passed
```

Both walkthrough scenarios under the SAME mutant → **exit 0** each
(`Walkthrough --only subset passed (1 scenarios)`). Each site is pinned by its own test, and
neither test is covering for the other.

### The negative control holds

`testClaimRollbackRemovesOnlyWhatItCreated932`'s created leg and bundle Test (8) both stay green on
the fixed tree: a directory the claim genuinely created is still removed whole. The fix is a
scoping, not a "stop deleting".

---

## Smoke-integration for the forge ports (they have NO test)

`grep -rln 932` across `plugins/kaola-workflow-gitea/scripts/*.js`,
`plugins/kaola-workflow-gitlab/scripts/*.js` and `scripts/test-forge-*.js` matches **only the two
claim scripts I just edited**. Both hand-ports are unpinned, so I executed them instead of trusting
the port by inspection. Driver:
`/private/tmp/claude-501/.../scratchpad/smoke-forge-932.js`, **exit 0 — SMOKE PASSED**, four legs
against each of the three divergent copies:

| leg | what it drives | result on canonical / gitea / gitlab |
|---|---|---|
| A | shipped CLI `claim`, created vs adopted, one fault (`--codex-dispatch-mode $'v2\ninjected'`) | created folder REMOVED; adopted folder + both foreign files survive byte-exact; **no half-written `workflow-state.md`** left behind |
| B | exported `claimProject` WITH `selectionRecordBytes`, fault inside `writeState` | the record this transaction wrote is taken back out; `.cache/origin` and `.cache` pruned; folder left exactly `["evidence.md","notes"]` |
| C | same, but the adopted folder ALREADY held a `selection-record.json` | the pre-existing record is **not deleted** |
| D | same fixture, NO fault (claim succeeds) | `"acquired"` — see the limitation below |

Leg B is the branch **no authored test reaches**: `cmdClaim` never sets `selectionRecordBytes`
(it is assigned at `scripts/kaola-workflow-claim.js:2034`, inside `cmdStartup`), and the two tests
that do go through `startup` use a fault that fires *before* the record is written. So
"record written → rollback removes it → directories pruned" is exercised only here.

---

## Named limitation, measured not assumed

**A pre-existing selection record survives the rollback but is OVERWRITTEN by the transaction.**
Leg C shows `selection-record.json` present afterwards with the new run's bytes, not the prior
run's. Leg D settles whose behaviour that is: a claim over the same fixture that **succeeds** leaves
exactly the same bytes. `persistSelectionRecord` is an unconditional write — *"the record is the
authority, so a staged file of the same name never wins"* — so the overwrite is the shipped
transaction's, independent of any failure and of this fix.

I did not change it. #932 demands that a failed claim not **delete** what it did not create, and it
does not; restoring prior bytes would need a content snapshot/restore mechanism nothing asks for,
and scoping it to the failing path only would make the rollback disagree with the success path.
Recorded rather than built.

## For the lead

1. **`CHANGELOG.md` is NOT updated.** `CLAUDE.md` wants an `[Unreleased]` entry for a user-visible
   change; the brief enumerated four files and I stayed in them rather than racing another agent
   for that file. Flagging, not doing.
2. **The two forge hand-ports carry zero test coverage** for this behaviour (grep above). The
   sibling `#930` has `scripts/test-forge-archive-scoping.js`, so the precedent for a forge-level
   suite of exactly this shape exists. Test authorship is not mine — raising it as a gap.
3. **A minor inaccuracy in a test's rationale comment, not the test.**
   `testClaimRollbackRemovesOnlyWhatItCreated932`'s header explains it omits an additions assertion
   because *"persistSelectionRecord has already written `.cache/origin/selection-record.json` into
   the adopted folder by the time it throws"*. On the `claim` door that scenario uses, it has not —
   `selectionRecordBytes` is set only in `cmdStartup`, so nothing is written at all. The omission is
   still harmless and the test is correct and satisfiable; only the stated reason is off. I did not
   touch it.
