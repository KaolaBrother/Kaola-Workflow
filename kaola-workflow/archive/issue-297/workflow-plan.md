# Workflow Plan — issue #297

<!-- plan_hash: d460042ebb2a40066103cdbeb2a660f9df8d1ee4c06ef25e2706813490fed46c -->

## Meta
labels: bug, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| reconcile-main-roadmap | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| code-review | code-reviewer | reconcile-main-roadmap | — | 1 | sequence |
| finalize | finalize | code-review | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| reconcile-main-roadmap | complete |
| code-review | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (reconcile-main-roadmap) | subagent-invoked | ## reconcile-main-roadmap evidence | |

| code-reviewer | subagent-invoked | verdict: fail | |
| finalize (finalize) | subagent-invoked | ## finalize evidence | |
## Plan Notes

Resume-safe specification for #297. Severity: bug (no security label → no G2 expected;
the validator derives sensitivity from the frozen labels + write set — none of
`scripts/`/`plugins/.../*claim*.js` match the sensitive patterns). Single linear spine:
implement → code-review (G1) → finalize sink. No code-architect (one-function symmetric
fix), no fanout (the three plugin claim ports share the `plugins/` top-level dir, so
fanout's top-level-directory disjointness check would reject the split), no doc-updater
(see "Docs" below — verified non-stale).

### Root cause (verified 2026-06-08)

On an adaptive WORKTREE run the roadmap source `kaola-workflow/.roadmap/issue-N.md` is
created + `git add`-ed at PLANNING time in the MAIN repo's index by
`kaola-workflow-adaptive-handoff.js` Step 5 (~lines 305-334; the planner runs the handoff
at repo-root and never cd's into the worktree). At finalize, `cmdFinalize` runs in the
WORKTREE and `archiveProjectDir` (claim.js ~:781-830) removes only the WORKTREE's copy of
that file — which doesn't exist there → `roadmap_source_removed: "absent"`. The MAIN
repo's STAGED ADD is never reconciled, so it survives as `A kaola-workflow/.roadmap/
issue-N.md` and trips `kaola-workflow-sink-merge.js:73-74`'s clean check
(`git status --porcelain --untracked-files=no` is non-empty on a staged add).

### Fix site (Option A from the issue — symmetric to the existing main-live-folder removal)

`archiveProjectDir` already has a worktree-aware branch that removes the MAIN repo's stale
live folder when `mainRoot !== linkedRoot` (claim.js ~:807-809). Add the SYMMETRIC
main-side roadmap-source reconciliation in that same closing path: when
`statusValue === 'closed'` AND `mainRoot && mainRoot !== linkedRoot`, reconcile the MAIN
repo's `<mainRoot>/kaola-workflow/.roadmap/issue-N.md`.

CRITICAL (the #292 false-green trap restated): the orphan is a STAGED ADD in the MAIN
index — `fs.unlinkSync` alone leaves a staged add/delete that STILL trips the clean check.
The reconcile MUST be a git INDEX operation against `mainRoot`, e.g. `git -C <mainRoot> rm
--cached --force --ignore-unmatch <relpath>` (drops the staged add) FOLLOWED by removing
the working-tree file if present (`fs.unlinkSync` guarded for ENOENT). Wrap in try/catch so
a failure does not crash closure (mirror the existing best-effort style; existing receipt
field `roadmap_source_removed` is the worktree-local result and need not be repurposed —
keep its contract intact). Do NOT add a new closure invariant and do NOT alter the handoff
(issue Options 2/3 are out of scope — Option A is the chosen, lowest-blast-radius fix).

### Per-node intent

- **reconcile-main-roadmap** (tdd-guide). FAILING-TEST-FIRST: add a NEW worktree-finalize
  sub-block to `scripts/simulate-workflow-walkthrough.js` (the existing linked-worktree
  block at ~4690-4745 is the template for the worktree plumbing, but it is the WRONG
  scenario to extend by analogy — see the discriminator below). That is the ONLY walkthrough
  exercising the worktree-finalize path; the 5 edition walkthrough copies have zero
  linked-worktree-finalize coverage (verified by grep), so no test mirror is needed.

  DISCRIMINATOR (this is the bug; getting it wrong is a false-green — the #292/#291 trap):
  the existing block COMMITS `issue-911.md` onto HEAD (~4694-4695), so the worktree forked
  from HEAD HAS the file and finalize returns `roadmap_source_removed: "removed"` — that is
  NOT the bug. The real bug is the file ABSENT from the worktree AND a STAGED-ONLY `A` in
  the MAIN index (the handoff `git add`s a NEWLY-CREATED, never-committed file; the worktree
  was forked from a HEAD that LACKS it). So the new sub-block MUST set up the file as
  staged-uncommitted in main, NOT committed-on-HEAD:
    1. Create the linked worktree FIRST, from a HEAD that does NOT contain
       `kaola-workflow/.roadmap/issue-N.md` (do not commit the roadmap source before the
       worktree add).
    2. THEN create `kaola-workflow/.roadmap/issue-N.md` in the MAIN tree and `git -C
       <mainRoot> add` it WITHOUT committing — reproducing the handoff's Step-5 staged add.
    3. Assert PRE-FIX the test FAILS: `git -C <mainRoot> status --porcelain
       --untracked-files=no` is NON-EMPTY (a staged `A`). If it is already clean here, the
       setup is wrong (file was committed, not staged-only) → fix the setup, do not weaken
       the assert.
  The new assertion must (a) reproduce that staged-only main-index `A` per the steps above,
  and (b) AFTER the worktree finalize, assert `git -C <mainRoot> status --porcelain
  --untracked-files=no` is EMPTY — replicating sink-merge.js:73 EXACTLY (NOT a bare
  `!fs.existsSync`, which would pass on a staged delete). Watch the test the failing way
  first (it must fail on today's code per step 3), then make the symmetric reconcile in
  `archiveProjectDir`. MIRROR the identical fix into all four
  claim ports — they share the same `archiveProjectDir` body (parity verified: every port
  has the `mainRoot !== linkedRoot` branch — root :807, base-plugin :807, gitlab-named
  :769, gitea-named :755). All five paths are in this node's frozen write-set.
  - The root `scripts/kaola-workflow-claim.js` and `plugins/kaola-workflow/scripts/
    kaola-workflow-claim.js` are a BYTE-IDENTICAL sync group (md5 match) enforced by
    `validate-script-sync.js` — they MUST stay byte-identical after the edit.
  - The gitlab/gitea ports are edition-NAMED (`kaola-gitlab-workflow-claim.js`,
    `kaola-gitea-workflow-claim.js`), NOT byte-identical to root (different require paths /
    line offsets); port the same logical change at each port's `mainRoot !== linkedRoot`
    closing branch.

- **code-review** (code-reviewer). G1: post-dominates the single code-producing implement
  node on the sequential spine. Read-only governance posture (no write set). Must emit the
  machine verdict block (`verdict: pass`, `findings_blocking: 0`) into its `.cache`
  evidence so Phase-6 `--verdict-check` passes.

- **finalize** (finalize sink; writes only `CHANGELOG.md`). Adds the [Unreleased] entry;
  the contractor runs the Phase-6 8a/8b/7/8 finalize bookkeeping at the sink.

### Docs (verified non-stale → no doc-updater node)

`docs/workflow-state-contract.md:168-169` states roadmap-source removal + `ROADMAP.md`
regeneration are "performed exactly once by `cmdFinalize` / `archiveProjectDir` (Phase-6
Step 8b)". Adding the SYMMETRIC main-side reconcile on the worktree path does NOT make that
wording stale (closure is still owned once by `archiveProjectDir`; we extend its worktree
branch, not add a second owner). `docs/architecture.md:206,232` ("Clean up
.roadmap/issue-N.md and regenerate ROADMAP.md") likewise remains accurate. No public
interface changes, no new env var, no new receipt field. Hence no doc-updater node; the
only doc write is the CHANGELOG entry, reserved to the finalize sink.

### Scope guards

- Author repo-root-relative paths only; the executor mirrors this folder into the
  `.kw/worktrees/issue-297/` worktree — do NOT list any `.kw/worktrees/...` path. (Note:
  an orphan `.kw/worktrees/issue-283/` exists in the tree — ignore it; not in scope.)
- Do NOT change `kaola-workflow-adaptive-handoff.js` (Option 2) or add a `sink-merge`
  pre-flight (Option 3) — Option A is the chosen fix.
- Do NOT touch the closure-contract invariants or the `roadmap_source_removed` enum.

### Acceptance (whole-plan, at finalize)

- A worktree-run finalize reconciles the MAIN repo's staged `kaola-workflow/.roadmap/
  issue-N.md`: after finalize `git -C <mainRoot> status --porcelain --untracked-files=no`
  is clean (no surviving `A`/`D` for the roadmap source) so `sink-merge` passes.
- The in-place (non-worktree) path is UNCHANGED (the new branch is guarded by
  `mainRoot !== linkedRoot`).
- New assertion fails on pre-fix code and passes post-fix (true failing-test-first).
- `node scripts/simulate-workflow-walkthrough.js` green.
- `npm test` green ×4 editions (claim.js is a multi-edition surface; the byte-identity
  sync group + edition ports must all carry the fix).
- Phase-6 whole-plan `--barrier-check` clean (every changed file in exactly one write-set).

### Out of scope

- Handoff-side change (Option 2) and sink-merge pre-flight (Option 3).
- Any new closure invariant or receipt-field change.
- The 5 edition walkthrough copies (no linked-worktree-finalize coverage to extend there).
