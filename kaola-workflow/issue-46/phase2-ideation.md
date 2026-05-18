# Phase 2 - Ideation: issue-46

## Approaches Evaluated

### Option A: Prose-Only Completion Contract
- Summary: Remove the "unambiguous open issue" auto-pick clause from workflow-next.md Goal-Driven Autonomy; add a 2-3 sentence single-issue stop contract; add `## Completion Contract` to kaola-workflow-phase6.md; add /goal template with explicit issue number to README.md and workflow-init.md; mirror in SKILL.md files; add validator assertions and Epic Case 18.
- Pros: Minimal surface area; no new env vars or script changes; addresses the agent-layer gap directly; stays within the 17-line budget constraint; aligns with cmdStartup behavior already enforcing `verdict: no_target` at line 1422.
- Cons: Does not add an explicit opt-in mechanism (KAOLA_AUTOCONTINUE) for teams that want multi-issue autonomous runs — but the issue body marks this optional and the /goal template serves as the opt-in pattern.
- Risk: Low
- Complexity: Small

### Option B: Prose + KAOLA_AUTOCONTINUE Env Var
- Summary: Same prose changes as Option A, plus a new `KAOLA_AUTOCONTINUE=1` check in `cmdStartup` that re-enables autonomous cross-issue continuation when set.
- Pros: Explicit opt-in for multi-issue autonomous workflows; more discoverable than /goal template guidance.
- Cons: Reopens the issue-44/47 bug surface (auto-pick gated by env var); increases script complexity; KAOLA_AUTOCONTINUE is labeled "optional" in the issue body; the /goal template pattern already serves as the opt-in; cmdStartup already correctly blocks auto-pick without --target-issue.
- Risk: Medium (regression risk)
- Complexity: Medium

## Advisor Findings

The advisor confirmed Option A is sound. Key points:
- `cmdStartup` already enforces single-issue stop at lines 1422-1441 via `verdict: no_target` / `claim: none` when no `--target-issue` is passed. The agent-layer fix (prose contract) is the correct remaining gap.
- Option B's KAOLA_AUTOCONTINUE reverses the intent of issue-44/47. The risk assessment is accurate.
- Two locations in workflow-next.md need updating: Goal-Driven Autonomy (line 39) and Startup Step 3 (lines 181-186).
- The /goal template in README.md must show a concrete example with an explicit issue number (blocking the "next issue in line" failure mode).
- Epic Case 18 tests the contract indirectly: startup without `--target-issue` returns `verdict: no_target`.

Full advisor output: `.cache/advisor-ideation.md`

## Selected Approach

**Option A: Prose-Only Completion Contract**

Rationale: The script layer already enforces single-issue stop. The gap is the agent-layer contract: workflow-next.md's Goal-Driven Autonomy section lists autonomous issue selection as a nonessential action, which misleads agents into thinking cross-issue continuation is default. Removing that clause and adding an explicit stop contract closes the gap with minimum risk and within the 17-line budget. KAOLA_AUTOCONTINUE is deferred per issue scope.

## Out of Scope (explicit)
- KAOLA_AUTOCONTINUE env var (labeled "optional" in issue body; deferred)
- Changes to `cmdStartup`, `cmdFinalize`, or any other script
- New GitHub Actions or CI changes
- Changes outside the 10 files listed in phase1-research.md

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
