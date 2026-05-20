# Advisor Plan Gate — Issue #127

## Blueprint Reviewed
Based on .cache/architect.md (main session synthesis from verified worktree line numbers) and architect agent output.

## Findings

### Item 1 — Task Structure (Structural Improvement, Recommended)
The split into separate test tasks (T1, T2) and impl tasks (T4, T5) with no dependency is not TDD-friendly. Dispatching T1 and T4 independently causes T1 to produce a misleading standalone RED with no green path in the same invocation.

Recommendation: Collapse to one task per forge that combines test + impl so `tdd-guide` runs the full red→green cycle in one invocation:
- Task A: GitHub (impl only — no unit test available)
- Task B: GitLab (test extension + impl in one tdd-guide task)
- Task C: Gitea (test extension + impl in one tdd-guide task)
- Task D: CHANGELOG

Tasks A, B, C, D all have disjoint write sets — all can run in parallel.

### Item 2 — Gitea Step 8 Variable Name (Minor Clarification)
Use `root` (not `mainRoot`) for the `readProjectInfo` call at Gitea Step 8. Line 234 already declares `const root = mainRoot;` and line 235 already calls `readProjectInfo(root, args.project)`. The new label-removal insertion (after line 236) should match the variable name used on the line directly above it.

Corrected Gitea Step 8 insertion:
```js
try { forge.updateIssueLabels(readProjectInfo(root, args.project), args.issue, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}
```

### Items Confirmed Correct
- GitHub uses literal `'workflow:in-progress'` (no `forge.CLAIM_LABEL` available) — correct
- Step 8 production-merge path in GitLab/Gitea has no new test; `closeLinkedIssue` (skipGit:true) path is sufficient to validate the forge API call
- Label removal try/catch is independent of closeIssue try/catch — matches `clearAdvisoryClaim` pattern; accepted

## Decision
Proceed to `phase3-plan.md` with 4-task structure (A=GitHub, B=GitLab, C=Gitea, D=CHANGELOG). No change to Option A approach.
