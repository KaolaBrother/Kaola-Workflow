# Node evidence — impl-plan-run

Node: `impl-plan-run`
Role: `tdd-guide`
Write set: 4 plan-run files (root + Codex SKILL + gitlab + gitea)

---

## RED baseline (before edits)

```
$ grep -c ACTIVE_WORKTREE_PATH commands/kaola-workflow-plan-run.md
0
```

```
$ node scripts/simulate-workflow-walkthrough.js 2>&1 | grep testPlanRunWiredForWorktree
testPlanRunWiredForWorktree: SKIPPED (impl-plan-run pending)
```

- `ACTIVE_WORKTREE_PATH` count in root plan-run.md: **0**
- `testPlanRunWiredForWorktree`: **SKIPPED** (feature-detect gate not yet triggered)

---

## GREEN (after edits)

```
$ grep -c ACTIVE_WORKTREE_PATH commands/kaola-workflow-plan-run.md
15

$ grep -c "Working directory:" commands/kaola-workflow-plan-run.md
9
```

Full suite tail:

```
testAdaptiveWorktreeProvisionedE2E: SKIPPED (worktree_path empty, impl-claim+impl-plan-run pending)
testSinkRefusesWorkflowOnlyBranch: PASSED
testSinkAllowsMixedBranch: PASSED
testPlanRunWiredForWorktree: PASSED
Workflow walkthrough simulation passed
```

Exit: **0**

- `testPlanRunWiredForWorktree`: **PASSED**
- `testAdaptiveWorktreeProvisionedE2E`: **SKIPPED** (expected — needs impl-claim to drop suppression
  and provision a non-empty `worktree_path`; this node's scope is the plan-run orchestration wiring)

---

## All 4 plan-run copies wired

1. **`commands/kaola-workflow-plan-run.md`** (root / GitHub edition)
   - Added `## Adaptive Worktree` section before `## Resume Detection` with:
     - Verbatim ACTIVE_WORKTREE_PATH resolver (phase6.md:377-379 3-liner)
     - `[ -z "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"` fallback (back-compat guard)
     - One-time main→worktree mirror gated `if [ "$ACTIVE_WORKTREE_PATH" != "$(pwd)" ]` (lines 602-604 pattern; project-folder only — no porcelain loop)
   - Added `Working directory: ${ACTIVE_WORKTREE_PATH}` to all 6 Agent() blocks:
     - orient (contractor), advance (contractor), tdd-guide, code-reviewer, build-error-resolver, commit+advance (contractor)
   - Updated read-only fan-out prose to note `Working directory: ${ACTIVE_WORKTREE_PATH}` requirement

2. **`plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`** (Codex mirror)
   - Added `## Adaptive Worktree` section with Codex resolver variant using `process.env.KAOLA_PROJECT`
     (matches existing Codex finalize SKILL pattern at SKILL.md lines 45-46)
   - Added `Working directory:` prose at each delegation point (steps 1, 2, 3) per Codex style
     (prose delegation, not Agent() blocks)

3. **`plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`** (GitLab edition)
   - Same wiring as root; forge-neutral (resolver/mirror are pure bash + node, no glab token)
   - `Working directory: ${ACTIVE_WORKTREE_PATH}` added to all 6 Agent() blocks

4. **`plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`** (Gitea edition)
   - Same wiring as root; forge-neutral
   - `Working directory: ${ACTIVE_WORKTREE_PATH}` added to all 6 Agent() blocks

---

## Back-compat guard confirmed

The `[ -z "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"` fallback is present in all
4 copies. When `worktree_path: ''` (this very issue's run), `ACTIVE_WORKTREE_PATH` resolves to
`$(pwd)` (repo root), the mirror `if` condition is false (paths equal) → mirror SKIPPED, and the
`Working directory:` line in every Agent() resolves to repo root → identical to today's behavior.

## Relative plan paths preserved

No absolute paths introduced. All `kaola-workflow/{project}/workflow-plan.md` paths remain
relative throughout; `cwd == ACTIVE_WORKTREE_PATH` is the resolution mechanism.
