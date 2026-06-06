# Orchestrator governance decisions — issue #264 (READ ON EVERY RESUME)

Refinements layered on `.cache/plan.md` (the architect blueprint) after orchestrator verification
against primary source + an advisor second-model review. These OVERRIDE the blueprint where they conflict.

## VERIFIED FACTS (primary-source, do not re-derive)
1. **Walkthrough harness is FAIL-FAST + NON-REQUIRABLE.** `simulate-workflow-walkthrough.js` `main()`
   runs all tests in ONE try block (7298-7455); `assert` throws (line 23); `main().catch` aborts on
   first failure; `main()` self-invokes at load (line 7461, NOT `require.main`-guarded → cannot
   require to run a single test). CONSEQUENCE: a hard-RED test anywhere walls off ALL later tests for
   every node until it's greened. The inverted tests sit MID-FILE (~7339, ~7343).
2. **`next-action.js` TERMINAL = `new Set(['complete','n/a'])`** (line 27); an `n/a` node satisfies
   its successors' depends_on (lines 26, 69-70). → marking a node `n/a` does NOT stall the DAG.
3. **`plan-validator.js findRepoRoot` (line 76) uses `fs.existsSync('.git')`** — TRUE for a worktree's
   `.git` FILE. So the per-node barrier root correctly follows a worktree plan-path with ZERO change
   to validator/commit-node/next-action. AC6 = pure calling-convention (plan-path + cwd), markdown-owned.

## DECISIONS
- **D1 — Node 1 (impl-gitignore-sim) tests FEATURE-DETECT, never hard-RED.** Because the harness is
  fail-fast, every walkthrough test for a capability delivered by a LATER node must detect the new
  API/signal and assert new-behavior-when-present / old-behavior-until-then, so the suite stays GREEN
  and runnable after node 1 and after every later node. Signals: `typeof claim.legacySiblingWorktreePathFor
  === 'function'` (node impl-claim), presence of the sink guard export (node impl-sink-guard), grep of
  plan-run.md for the resolver (node impl-plan-run). Genuine per-node RED→GREEN is shown by the impl
  agent's INLINE before/after probe recorded in that node's `.cache`, not by a committed hard-RED test.
  Run `node scripts/simulate-workflow-walkthrough.js` after EVERY impl node to catch regressions early.
- **D2 — impl-commit-node and impl-next-action → mark `n/a`** (NOT the blueprint's filler comment).
  Verified: these scripts + the validator are already worktree-correct (Fact 3); no honest RED→GREEN
  exists, and a comment-only diff with a fabricated RED→GREEN is exactly what the barrier exists to
  catch. Skip reason: "script is path-agnostic; AC6 worktree operation delivered by impl-plan-run +
  impl-adapt-contractor (markdown) and proven by the e2e + findRepoRoot following the plan-path; no
  source change is safe or needed (this very run executes via these scripts with worktree_path:'')."
  Safe per Fact 2 (impl-claim still becomes ready). When opened, do NOT dispatch tdd-guide — have the
  contractor mark `n/a` with the reason and fused-advance. RE-CONFIRM at that point that nodes 3-5
  didn't introduce a real need.
- **D3 — Add a grep/structural assertion in node 1's walkthrough** (`testPlanRunWiredForWorktree`):
  assert `commands/kaola-workflow-plan-run.md` contains the `ACTIVE_WORKTREE_PATH` resolver AND a
  `Working directory:` line — the only check that impl-plan-run/impl-adapt-contractor did their job
  (markdown isn't unit-testable). Feature-detect (green until impl-plan-run lands). Promoted from
  "optional" to required.
- **D4 — RESIDUAL RISK to hold (not fix):** the e2e proves the MECHANISM (validator root follows a
  worktree plan path; sink sees the impl), NOT the literal `plan-run.md` bash. So the `review`
  (code-reviewer) node + the by-hand finalize smoke carry the real AC6 proof. Do NOT read green tests
  as full proof of AC6. Finalize will be hand-driven (repo-root adaptive run: see memory
  project_adaptive_repo_root_finalize — no branch ref, sink-merge refuses, finalize by hand).

## D5 — THE "ABSORB PATTERN" for feature-detect activation fixups (RECURS — read carefully)
Every feature-detecting walkthrough test node-1 authored ACTIVATES when its signal lands (impl-plan-run
flips testPlanRunWiredForWorktree + the e2e; impl-claim flips the adaptive-provisioned + hidden-local
tests). An activation can surface a fixture mismatch in node-1's lane (the walkthrough). Because the
working tree is cumulative+uncommitted and `--record-base` is IDEMPOTENT (#239: re-`--start` on a
node REUSES its stale baseline), you CANNOT re-open a completed node to fix its lane — its old baseline
would flag the current node's changes as out-of-lane. RESOLUTION (reusable):
  1. Close the CURRENT in_progress node WITHOUT the fused advance (barrier passes on its own lane; the
     suite may be transiently RED on the activated test — document it in the node's evidence as "guard/impl
     correct + complete; breakage is a node-1 fixture that predates this behavior").
  2. Fix the walkthrough fixture directly (orchestrator Edit is defensible for mechanical test maintenance,
     OR a one-shot tdd-guide). Run the FULL suite → green.
  3. Run the STANDALONE advance (loop step 1) to open the next node — its fresh `--start` baseline ABSORBS
     the fixture fix, so no later per-node barrier sees it out-of-lane.
The fixture fix is lane-validated at Phase 6's WHOLE-PLAN UNION barrier (walkthrough ∈ impl-gitignore-sim's
declared set ∈ union — the union-escape from memory project_adaptive_frozen_writeset_union_escape). Cost:
no per-node RED→GREEN attribution for the fixture — fine, it's test maintenance, not a deliverable.
Keep running the full suite after EVERY node (D1) so mismatches surface one-at-a-time, not piled at Phase 6.

### Applied instance #1 (impl-sink-guard → #216 fixture):
DESIGN A chosen: guard refuses all-`kaola-workflow/**` branches UNCHANGED. The #216 phantom test
(`testSinkMergeSkipsArchivedProjectPhantom`, ~walkthrough:5447) used an archive-only-NO-impl issue-850
branch expecting exit 3, which AC7 correctly refuses (exit 1). FIX: add a root-level (OUTSIDE
kaola-workflow/) impl file `impl-850.txt` to the issue-850 branch fixture so it's not workflow-only →
reaches exit 3. Verify: #216 reaches exit 3 AND the liveDir-not-recreated discriminator still holds.
node-1's refuse test (issue-911, archive-only-no-impl → refuse) stays valid (impl presence is the
discriminator: 911 no-impl→refuse, 850 +impl→exit3 — coherent).

## ENGINE-EDIT SAFETY (this run executes via the scripts it edits)
Only impl-claim makes a behavioral engine edit (worktreePathFor split + suppression drop + legacy
cleanup). It runs LAST (before review). It MUST preserve the empty-`worktree_path`→repo-root fallback.
After impl-claim: full walkthrough green + `npm test` green + validate-script-sync (Claude↔Codex
byte-identity on claim/sink-merge/commit-node/next-action) clean — verify before closing the node.
