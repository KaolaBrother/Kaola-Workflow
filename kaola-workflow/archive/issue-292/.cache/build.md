# build node evidence — issue #292 (tdd-guide, RED→GREEN)

Node: `build` (tdd-guide). Deliverable: make the dormant write-role batch join
actually work — `open-batch` provisions one isolated git worktree per write-role
member (degraded fallback when unavailable), `seal` barriers each member
MEMBER-SCOPED and captures a gc-anchored `mergeRef`, `join` checks out
`git -C <repoRoot> checkout <mergeRef> -- <declared paths>`. Fixes R3 (a
filesystem path was in the git-checkout ref slot) and the seal/join false-greens.

Write set (exactly 3 files, base↔claude byte-identical):
1. `scripts/test-parallel-batch.js`
2. `scripts/kaola-workflow-parallel-batch.js`
3. `plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js`

Empirical grounding probed against real git BEFORE writing (recorded in transcript):
- PROBE A: `git -C <repo> checkout <commit-SHA> -- f.js` lands the snapshot content in the parent. PASS.
- PROBE C (reproduces R3): `git checkout <filesystem-path> -- f.js` → `fatal: invalid reference: <path>`. Confirms the bug: a worktree FS path in the ref slot.
- Linked worktree (`git worktree add --detach <seedCommit>`) has a `.git` FILE → validator `findRepoRoot` resolves the MEMBER worktree → member-scoped baseline/diff.
- Member snapshot (GIT_INDEX_FILE + read-tree HEAD + add -A + write-tree) → commit-tree → update-ref captures member `wa.js`; `git -C <parent> checkout <mergeRef> -- wa.js` lands "AAA" in the parent.
- Barrier exemptions are NAME-based: `^kaola-workflow/` (isWorkflowArtifact) + `.md`/`docs/` (isDocsPath) + tests (isTestPath) — so the member `.cache/barrier-base-*`, the member plan copy, and `.cache/*.md` evidence are all exempt; only the declared `*.js` counts as a "production" write the barrier checks against the member's OWN declared set.
- `.kw/` is gitignored in both the worktree and main repo → `.kw/batch/` can never enter a sink commit.

## RED (before implementation) — `node scripts/test-parallel-batch.js` exit 1, 15 failures / 101 passed

The new E1/E2/E3 subprocess-CLI tests drive the REAL binary
(`node scripts/kaola-workflow-parallel-batch.js <sub> --project P --json`) with
`cwd` = a real `$TMPDIR` git repo, exercising the io-shim git invocation (NOT a
mock). All 15 failures are the documented gaps; ALL 101 existing assertions
(P1–P6, I1–I7, R1/R2/R4a) stayed green (no regression in the harness):

```
FAIL: E1: wa has a non-null worktreePath (R3/dormant join activated)
FAIL: E1: wb has a non-null worktreePath
FAIL: E1: wa worktreePath is rooted at the fixture repo (cwd correctly set)
FAIL: E1: wa member has a non-empty gc-anchored mergeRef after seal
FAIL: E1: wb member has a non-empty mergeRef after seal
FAIL: E1a: PARENT worktree contains wa.js=="AAA" (real checkout landed, not a state-only false-green)
FAIL: E1b: PARENT worktree contains wb.js=="BBB"
FAIL: E1c: wa.js still AAA after idempotent re-join
FAIL: E2: seal-member wa with out-of-lane write → refuse (NOT a false-green)
FAIL: E2: reason barrier_failed (member-scoped barrier saw the overflow)
FAIL: E2: wa member NOT sealed after barrier refusal
FAIL: E3: degraded open-batch → result ok
FAIL: E3: degraded === true when worktree capability absent
FAIL: E3: reason worktree_unavailable
FAIL: E3: opened === [] (zero mutation)
parallel-batch tests FAILED (15 failures, 101 passed)
EXIT=1
```

RED interpretation (maps each failure to the bug it proves):
- **worktreePath null** — `runOpenBatch` hard-codes `worktreePath: null` (line 326); the join path is dormant.
- **no mergeRef** — `sealOne` never captures a member ref; join had nothing real to check out.
- **E1a/E1b content-not-landed (THE false-green)** — current `runJoin` sets `joined:true` / `state:'joined'` unconditionally (the `if (m.worktreePath && ...)` guard is skipped because worktreePath is null), so the join *reports* success while NO content reaches the parent. The state-only assertions would pass; only asserting REAL parent file content exposes it.
- **E2 false-green twin (seal parent-scoped)** — current `sealOne` shells `commit-node` with the PARENT planPath → `findRepoRoot` = repoRoot → the barrier diff is parent-scoped and EMPTY for a member writing in an isolated worktree, so the out-of-lane `intruder.js` is invisible and seal returns `ok` instead of `barrier_failed`.
- **E3 degraded absent** — no degraded mode exists yet, so an open-batch in a non-git dir does not return `{degraded:true,reason:'worktree_unavailable',opened:[]}`.

## GREEN (after implementation)

Implementation applied to the base + byte-identical claude copy (forge ports left
stale by design — a later build-forge node mirrors them):
- `scripts/kaola-workflow-parallel-batch.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js` (synced via `cp` then `diff` → BYTE-IDENTICAL-OK)
- `scripts/test-parallel-batch.js` (E1/E2/E3 added; all P1–P6/I1–I7/R1/R2/R4a byte-unchanged)

What changed (recipe §3.1–§3.6):
- §3.1 R3 io-shim fix: `gitCheckout(mergeRef, paths)` → `git -C <repoRoot> checkout <mergeRef> -- <paths>` (the ref slot is a COMMIT, the `-C` target is the PARENT repoRoot). runJoin now passes `m.mergeRef`, not the worktree FS path.
- §3.2 local gc-safe helpers `snapshotMember` / `anchorMergeRef` (pure git, zero edition token → byte-identical ×4 automatically).
- §3.3 runOpenBatch: write-role members get one isolated `git worktree add --detach <seedCommit>` under `<repoRoot>/.kw/batch/<projTag>/<id>`, the plan is copied into the member's `kaola-workflow/{project}/` and the `--start` baseline is recorded against the MEMBER plan (member-scoped). Degraded mode (`{result:'ok',degraded:true,reason:'worktree_unavailable',opened:[]}`) on any worktree-capability failure, with full rollback → ZERO mutation. Read-only path byte-unchanged.
- §3.4 sealOne: member-scoped barrier (member plan copy) + gc-anchored `mergeRef` capture (`refs/kaola-workflow/batch-merge/<projTag>/<id>`), persisted on the manifest member. threaded project/projTag/repoRoot/snapshotMember/anchorMergeRef through runSealMember + runSeal.
- §3.5 runJoin: removed the `if (m.worktreePath && ...)` guard; a falsy `mergeRef` (or missing gitCheckout seam) → `refuse missing_merge_ref` (fail-closed, NEVER joined:true); `joined:true` reachable ONLY after a real checkout. Idempotent (m.joined skip).
- §3.6 cleanup: member worktree removed best-effort AFTER a successful checkout; `.kw/` gitignored so nothing leaks to a sink commit; mergeRef left anchored (bounded by node count).

Three verification commands — real exit codes captured directly (NOT a piped tail):

```
$ node scripts/test-parallel-batch.js
parallel-batch tests passed (117 assertions)
EXIT_PB=0

$ node scripts/simulate-workflow-walkthrough.js
... (all PASSED)
Workflow walkthrough simulation passed
EXIT_SIM=0

$ npm test
OK: 18 common scripts and 7 byte-identical file group in sync.   <- validate-script-sync: base↔claude byte-identical
parallel-batch tests passed (117 assertions)
... claude / codex / gitlab / gitea editions all green ...
GitLab Codex workflow walkthrough simulation passed
Gitea Codex workflow walkthrough simulation passed
EXIT_NPM=0
```

The headline anti-false-green proof (E1a/E1b) now PASSES: after `join`, the PARENT
worktree REALLY contains `wa.js`=="AAA" and `wb.js`=="BBB" — content actually
landed via a real `git checkout <mergeRef> -- <path>`, not a state-only flip. E2
proves the member-scoped barrier (an out-of-lane write → `barrier_failed`, member
not sealed/joined). E3 proves degraded fallback with zero mutation.

`.kw/batch/` hygiene verified: `git check-ignore .kw/batch/x` → IGNORED; no
leftover after the run; `git status --porcelain` shows ONLY the 3 write-set files
modified (+ the project `.cache/` workflow artifacts, which the barrier exempts).

Edge honored (design §8.2): write-role members are additive/modify; a member that
DELETES a declared path would make `git checkout <ref> -- <path>` error →
surfaces as `join_failed` (in scope; flagged for a follow-up if deletion support
is ever required). The read-only batch path is byte-unchanged.

E2 hardened (asserts-too-little fix): the test now also asserts the barrier error
NAMES `intruder.js` — proving the member-scoped diff refused for THIS specific
out-of-lane file, not an unrelated failure. (117th assertion.)

RESULT: GREEN. RED→GREEN cycle complete; all 117 parallel-batch assertions pass,
walkthrough exits 0, full npm test (4 editions) exits 0.
