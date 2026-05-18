# Advisor Gate: Phase 2 Ideation — issue-46

## Question Asked

The planner proposed two options:
- Option A: prose-only changes (delete "unambiguous open issue" auto-pick clause, add single-issue stop contract in workflow-next.md + phase6.md, /goal template in README + workflow-init)
- Option B: prose + KAOLA_AUTOCONTINUE env var (a flag that opts in to cross-issue continuation)

The advisor was asked:
1. Any missed approaches?
2. Are the risks accurate?
3. Is the recommendation sound?
4. Any gotchas that should change the decision?

## Advisor Response

**Recommendation: Option A (prose-only).**

**On missed approaches:** No significant alternatives were missed. A third approach (script-level enforcement via `--block-continuation` flag to `cmdFinalize`) was considered but is unnecessary — `cmdStartup` already enforces single-issue stop at line 1422: it returns `verdict: no_target` / `claim: none` when no `--target-issue` is passed and exits 1. The agent-layer fix is the correct locus for the remaining gap.

**On Option B risks:** The planner's risk assessment is accurate. Re-introducing a continuation toggle (KAOLA_AUTOCONTINUE) reverses the intent of issue-44/47: those issues removed auto-pick precisely because autonomous cross-issue selection was dangerous. Adding KAOLA_AUTOCONTINUE reopens the same bug surface with a slightly different guard. The risk is real.

**On soundness:** Option A is sound. The completion contract is the correct layer to fix. The Goal-Driven Autonomy section in workflow-next.md currently lists "issue selection when there is one unambiguous open issue" as a nonessential autonomous action — this clause is the root cause. Removing it and replacing with an explicit single-issue stop statement closes the gap.

**Verification request (pre-implementation):** Before writing Phase 2, verify that `cmdStartup` at `scripts/kaola-workflow-claim.js:1420-1440` already returns `no_target` when `--target-issue` is absent. The planner claims this is true; the advisor cannot confirm without reading the file. If this is NOT true, Option A must be supplemented with a script-layer change. → **Verified: lines 1422-1441 confirm `verdict: 'no_target'`, `claim: 'none'`, exitCode 1 when `!args.targetIssue`.**

**On the 17-line cap:** This is a real constraint. The insertion in Goal-Driven Autonomy must fit in ≤3 sentences (4-5 lines with surrounding whitespace). The advisor confirmed this is achievable for Option A's prose scope.

**Gotchas:**
1. Startup Step 3 in workflow-next.md (lines 181-186) says "choose one unambiguous open GitHub issue or provided task automatically" — this clause also needs revision to remove the autonomous pick. Option A must touch both locations (Goal-Driven Autonomy + Startup Step 3).
2. The SKILL.md mirrors for kaola-workflow-next and kaola-workflow-finalize must be updated. They are conceptually parallel (not byte-identical) to the command files, but the `## Goal Contract` and `## Completion Contract` sections must be present.
3. Epic Case 18 should test the prose contract indirectly: startup without `--target-issue` returns `verdict: no_target`. This is already true in the script layer, so the test proves the prose matches the implementation.
4. `/goal` template in README.md must include a concrete example with an explicit issue number. Generic "finish the next issue" phrasing is the failure mode to block.

**Final verdict:** Proceed with Option A. No additional approaches needed. KAOLA_AUTOCONTINUE is explicitly out of scope per the issue body ("optional") and should not be added.
