# Issue #936 — test baseline transcript

Author: `tdd-guide` (test custody). No production `.js` was written or edited in the worktree.

- **Baseline commit**: `ecdb2c88e359ca77bf99bf692309ba58bff0ac6a`
- **Worktree**: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-936`, branch `workflow/issue-936`
- **Platform**: darwin 25.6.0, node v24.18.0. All fixtures under `$TMPDIR`; nothing written inside the repo tree.

---

## 0. Pre-existing baseline of the four suites, BEFORE any test was added

Run at `ecdb2c88`, worktree clean.

| suite | exit | notes |
|---|---|---|
| `node scripts/test-sink-merge.js` | **0** | 745 assertions, 0 FAIL |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | **0** | 577 spawns, "GitLab sink tests passed" |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | **0** | 573 spawns, "Gitea sink tests passed" |
| `node scripts/simulate-workflow-walkthrough.js --only testClearAdvisoryClaim` | 0 | the three existing claim-side marker legs |

### Correction to the standing caution about `init.defaultBranch`

`git config --get init.defaultBranch` **is unset on this box**, and the standing caution says that
reds `test-gitlab-sinks.js` / `test-gitea-sinks.js` at baseline. **It does not, at this commit.**
Both suites are green. The suites now pin the branch themselves — `G.execRaw(['init','--bare','-b','main', …])`
at `test-gitlab-sinks.js:87` and the same at `test-sink-merge.js:161`, each with a comment saying the
host must never decide. So every red recorded below is attributable to the new legs alone.

---

## 1. The four surfaces, RED at baseline

### `scripts/test-sink-merge.js` — 4 scenarios (thorough coverage; this suite runs in no chain)

```
$ node scripts/test-sink-merge.js
EXIT=1
Sink-merge (…) test suite FAILED: 8 failed, 772 passed.
```

The 8 failures are all `#936`; all 745 pre-existing assertions still pass.

| leg | failure signature |
|---|---|
| `(#936 control)` | **PASSES by design** — it measures the instrument, not the sink |
| `(#936 a)` | `FAIL: #936 a: the claim LABEL must be removed from an issue the sink leaves open; calls=[]` |
| `(#936 a)` | `FAIL: #936 a: the kw:claim MARKER COMMENT must be gone from an issue the sink leaves open … Comments still on #93601: ["<!-- kw:claim project=issue-93601 -->\nKaola-Workflow started local work for `issue-93601`.", …]` |
| `(#936 b)` | `FAIL: #936 b: the claim LABEL must be removed from bundle member 93602; calls=[]` (and the same for 93632) |
| `(#936 b)` | `FAIL: #936 b: the kw:claim MARKER must be gone from bundle member 93602` (and 93632) |
| `(#936 c)` | `FAIL: #936 c: postMergeCleanup removes the claim label from #93603 but leaves the kw:claim marker …` (and #93653) |
| `(#936 d, control)` | **PASSES by design** — declared control on the close path |

`calls=[]` in (a)/(b) is the measurement, not noise: under `--sink --keep-issue-open` the sink makes
**zero** forge calls, so neither artifact is released.
(c) shows the other shape: its label clauses are green (postMergeCleanup does remove labels) and only
the marker clauses red.

### `scripts/simulate-workflow-walkthrough.js` — 1 leg, `testSinkKeepOpenReleasesClaimMarker`

```
$ node scripts/simulate-workflow-walkthrough.js --only testSinkKeepOpenReleasesClaimMarker
EXIT=1
Error: #936: --sink --keep-issue-open must remove the workflow:in-progress LABEL from the issue it leaves open; calls=[]
    at Object.testSinkKeepOpenReleasesClaimMarker … simulate-workflow-walkthrough.js:7538
```

This file's `assert` throws, so only the first red shows. The marker clause was proven red
independently, on a disposable copy with the label clause suppressed (copy deleted afterwards):

```
Error: #936: --sink --keep-issue-open must delete the kw:claim MARKER COMMENT from the issue it
leaves open … Comments still on #9360: ["<!-- kw:claim project=issue-9360 -->\n…",
"<!-- kw:claim project=issue-OTHER -->\n…"]
```

Both premise clauses (exit 0 + `status:sinked`; the issue was NOT closed) pass, so the fixture really
did reach the keep-open terminal.

### `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`

```
$ node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js
EXIT=1
AssertionError [ERR_ASSERTION]: #936-gitlab: --sink --keep-issue-open must remove the
workflow:in-progress label from the issue it leaves open; calls=[]
    at test-gitlab-sinks.js:2614
```
Marker clause, proven separately on a disposable copy:
```
AssertionError: #936-gitlab: --sink --keep-issue-open must delete the kw:claim MARKER NOTE from the
issue it leaves open … Notes still on #9360: ["<!-- kw:claim project=issue-9360 -->\n…",
"<!-- kw:claim project=issue-OTHER -->\n…"]
```

### `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`

```
$ node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js
EXIT=1
AssertionError [ERR_ASSERTION]: #936-gitea: --sink --keep-issue-open must remove the
workflow:in-progress label from the issue it leaves open; calls=[]
    at test-gitea-sinks.js:2561
```
Marker clause, proven separately on a disposable copy:
```
AssertionError: #936-gitea: --sink --keep-issue-open must delete the kw:claim MARKER COMMENT from the
issue it leaves open … Comments still on #9360: [ … ]
```

---

## 2. The discrimination proof — the part that matters

Two mutants, each applied to a **disposable `git archive HEAD` copy** of the tree in the scratchpad.
No file in the worktree or the main root was modified.

### Mutant A — the naive fix (export `clearAdvisoryClaim`, call it from the sink, no cwd)

Applied at all three keep-open sites; the `--sink` arm's own label call carries `forgeOpts`, so only
`clearAdvisoryClaim`'s internal calls are cwd-less — exactly the shape a plausible fix produces.

```
MUTANT A EXIT=1 — 8 failed, 772 passed
FAIL: #936 a: the kw:claim MARKER COMMENT must be gone … Comments still on #93601: [ … ]
FAIL: #936 a: every forge call must carry a cwd that resolves the repository … Rejected:
  ["REJECTED-wrong-cwd:/private/var/folders/…/T args=issue edit 93601 --remove-label workflow:in-progress",
   "REJECTED-wrong-cwd:/private/var/folders/…/T args=api repos/{owner}/{repo}/issues/93601/comments"]
```

The label clauses now pass and the marker clauses still fail — the signature of a deleter that ran,
threw into a swallowed `catch (_) {}`, and changed nothing. **Caught.**

### Mutant B — the correct fix (local deleter, `forgeOpts` carried at every call)

```
MUTANT B EXIT=0 — Sink-merge test suite passed: 780 assertions.
gitlab under MUTANT B EXIT=0 — GitLab #936 keep-open sink releases BOTH claim artifacts: PASSED
gitea  under MUTANT B EXIT=0 — Gitea  #936 keep-open sink releases BOTH claim artifacts: PASSED

FULL walkthrough under Mutant B (scratch tree given its own git repo + tag, so the contract-validator
legs have the git state they read):
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,
            "scenarios":207,"ran":207,"passed":207,"failed":0}
Workflow walkthrough simulation passed   EXIT=0
```

Every suite fully green under Mutant B, so the new legs are satisfiable and no pre-existing
assertion regresses under a correct fix. The mutants were scratch-only and are not the deliverable.

One caveat on the scratch tree: a plain `git archive HEAD | tar -x` copy is not a git repository, and
`testContractValidatorMissingTag` reads git state, so it reds there for that reason alone. It passes
in the worktree at baseline (`--only testContractValidatorMissingTag` → PASSED), and the 207/207 run
above was taken after giving the scratch tree a repo and a tag. Not a finding about the tests.

---

## 3. How the cwd trap is pinned observably

The gh mock is **cwd-honest**: it walks up from its own `process.cwd()` looking for `.git` and, if it
finds none, logs `REJECTED-wrong-cwd:<cwd> args=<argv>` and exits 1 — which is what real `gh` does
without `--repo`. `scripts/test-sink-merge.js:183-185` already had this before #936; the marker
routes were added behind it.

Two clauses per scenario carry the discrimination:

1. **the end state** — `issueCommentBodies(binDir, n)` is read back from the mock's store after the
   run and must not contain `<!-- kw:claim project=<slug> -->`. A cwd-less deleter never reaches the
   DELETE route, so the body is still there and this reds regardless of what was called.
2. **the cause** — no `REJECTED-wrong-cwd:` line may be in the call log, so the failure reads as
   "you called gh from tmpdir" instead of "it is still there".

Clause 1 alone is sufficient; clause 2 exists so the red is diagnosable. The `(#936 control)` leg is
the positive control that keeps clause 2 from being vacuous: it spawns the mock directly from
`os.tmpdir()` and asserts the rejection fires, and spawns it from the repo and asserts the DELETE
really mutates the store.

**Port note.** The cwd trap is canonical-only, and the port mocks reflect that rather than inventing
it: `gh` resolves its target repo from cwd, whereas the gitlab/gitea editions address notes/comments
by a fully-qualified project ref (`projects/<id>/issues/<n>/notes`, `/api/v1/repos/<full_name>/…`).
So the port mocks are cwd-honest for `repo view` **only** — the one route those CLIs really do
resolve from cwd — which reds a fix that reaches project identity via `forge.discoverProject()` from
tmpdir, while leaving the `api` routes cwd-agnostic as the real CLIs are.

---

## 4. Not pinned, and why

- **The live end-to-end leak** (claim → sink → re-claim blocked on a real forge) is not reproduced.
  It needs a mutating call against a real GitHub repository; every leg here runs against a mock.
- **AC3 (close path unchanged)** is pinned only as "still closes, still removes the label, still
  reports `status:sinked`". Nothing is asserted about a marker on a closed issue, per the brief: the
  classifier short-circuits on closed state before any claim check, so a leftover there is harmless
  and inventing a requirement would over-constrain the fix.
- **`(#936 d)` is green at baseline, deliberately** — it is a declared control, not a regression test.
  It exists to catch a fix that restructures the closure step and breaks the close path on the way,
  which none of (a)–(c) can see because none of them closes anything.
- **`cmdRepairLabels` (`scripts/kaola-workflow-claim.js:5789`) and `closeIssueIdempotent` (`:245`)**
  remove the claim label without deleting the marker — the same defect class, in claim.js rather than
  the sink. Out of #936's stated scope, so nothing here pins them. Flagged, not tested.
