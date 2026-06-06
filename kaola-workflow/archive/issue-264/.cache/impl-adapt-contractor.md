# Node `impl-adapt-contractor` evidence — issue #264

Role: `tdd-guide` (Node 4, prose/doc node)

---

## RED: Before-edit grep

Command: `grep -nE "does NOT provision|pending #264|tracked in #264" commands/kaola-workflow-adapt.md`

Output (stale disclaimers, pre-edit):
```
9:starting contract (claim + `workflow-state.md`, at repo-root — the adaptive path does NOT provision
10:a worktree; that is for the full/fast paths only, adaptive worktree support is tracked in #264) and
153:does NOT provision a worktree, pending #264) and **authors** the
187:*before* the claim, because the front end claims at repo-root (the adaptive path does NOT provision a
188:worktree — that is for the full/fast paths only, pending #264) — the router's post-claim
202:  prompt="...This creates the project folder + workflow-state.md at repo-root — the adaptive path does NOT provision a worktree (that is for the full/fast paths only, pending #264). ...
221:The claim (at repo-root — the adaptive path provisions no worktree, pending #264) was cut from a now-clean main...
```

---

## GREEN: After-edit grep (all four adapt copies)

All four commands below return 0 hits (no stale disclaimers):

```
grep -nE "does NOT provision|provisions no worktree|pending #264|tracked in #264|full/fast paths only" \
  commands/kaola-workflow-adapt.md \
  plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md \
  plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md \
  plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md
```
Result: (empty — 0 hits across all four files)

---

## Walkthrough tail

```
testAdaptiveHandoffIdempotentReRun: PASSED
testAdaptiveHandoffProjectFlagResolvesRepoRoot: PASSED
testGitignoreCoversKw: PASSED
testWorktreeHiddenLocalPath: PASSED
testLegacyWorktreeCleanupDryRun: SKIPPED (impl-claim pending)
testLegacyWorktreeCleanupDirtySkip: SKIPPED (impl-claim pending)
testAdaptiveWorktreeProvisionedE2E: SKIPPED (worktree_path empty, impl-claim+impl-plan-run pending)
testSinkRefusesWorkflowOnlyBranch: PASSED
testSinkAllowsMixedBranch: PASSED
testPlanRunWiredForWorktree: PASSED
Workflow walkthrough simulation passed
```

Exit code: 0 — no regression.

---

## contractor.md note — additivity confirmation

Added as Method item **5** (strictly additive — did not modify items 1-4):

- When a dispatch prompt carries `Working directory: <path>`, relative arguments
  (plan paths, `.cache/` paths) are resolved from that directory.
- Script paths are still self-derived to an absolute path (Method 1 unchanged).
- **When the prompt omits the `Working directory:` line, behavior is unchanged:
  current working directory (repo-root) exactly as today.**

The orchestrator's OWN remaining contractor dispatches in this run carry no
`Working directory:` line. They continue to run at repo-root, unchanged.

---

## Files edited

- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/commands/kaola-workflow-adapt.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/agents/contractor.md`

No files outside the declared 5-file lane were touched. No git commit made.
