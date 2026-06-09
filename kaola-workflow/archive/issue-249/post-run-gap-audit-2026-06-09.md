# Issue 249 Post-Run Gap Audit

Observed at: 2026-06-09T16:19:07+0800  
Scope: completed Claude Code session in `tmux` pane `claudetwo:0.0`, archived issue #249 artifacts, GitHub issue #249 state, local main/worktree state.

## Completion State

- GitHub issue #249: closed at 2026-06-09T08:06:02Z.
- Main branch: clean and aligned with `origin/main` at `66824848b9ceeac86c144509d89f7086a88ba7f0`.
- Worktree list: only `/Users/ylpromax5/Workspace/Kaola-Workflow` remains; `.kw/worktrees/issue-249` was removed.
- Archive exists at `kaola-workflow/archive/issue-249/`.
- Final commits visible in `git log`:
  - `6682484 chore: finalize issue-249`
  - `8958587 chore: archive issue-249`

## Newly Confirmed Post-Run Gaps

### 1. Sink merge aborts on a local workflow branch without upstream

Transcript evidence:

```text
node scripts/kaola-workflow-sink-merge.js --branch workflow/issue-249 --issue 249 --project issue-249
Error: Exit code 1
Branch 'workflow/issue-249' has no upstream tracking ref.
Push and set upstream before merging: git push -u origin workflow/issue-249
```

The orchestrator manually recovered with `git push -u origin workflow/issue-249`, then reran sink-merge successfully.

Filed: https://github.com/KaolaBrother/Kaola-Workflow/issues/323

### 2. Archived finalization artifacts remain pre-final-git-gate/stale after successful merge

Archived `finalization-summary.md` still says:

```text
Pending final git gate. Final hash reported after push.
READY FOR FINAL GIT GATE
```

Archived `workflow-state.md` is `status: closed` and `step: complete`, but still carries:

```text
## Pending Gates
- workflow-plan

## Last Evidence
last_command: startup
last_result: folder_claimed

## Last Updated
2026-06-09T06:04:14.240Z
```

Archived final validation evidence also says no files changed after the n16 test chains, although n17 later changed `CHANGELOG.md`. That may be acceptable for validation reuse, but the evidence phrase is too broad for audit use.

Filed: https://github.com/KaolaBrother/Kaola-Workflow/issues/324

## Previously Filed Mid-Run Gaps Still Applicable

- `#318` — batch evidence can drift into nested `kaola-workflow/kaola-workflow` cache.
- `#319` — implementer evidence shape failures report `evidence_missing` and require manual `build-green` patching.
- `#320` — write-role batch subagents leak edits to parent worktree instead of member worktrees.
- `#321` — planner allows file-disjoint fanout that runtime `open-batch` refuses on coarse-area overlap.
- `#322` — plan-run calls `parallel-batch top-up` after `active-batch.json` is removed.
- Existing `#317` — ledger-mutating transitions leave task mirror/UI stale until resume; issue #249 evidence was added as a comment.

## Reviewed But Not Filed As New Issues

- `timeout 3m`, `timeout 1m`, and `timeout 2m` markers in the Claude pane were not treated as confirmed failures. The visible commands continued, evidence files recorded PASS, and the run completed.
- The doc-docking step initially ran commit-range `git diff` commands that returned no output before the changes were committed. The same step then inspected `git status` and wrote a concrete doc-docking record, so I did not file it separately. If repeated as a false-negative in a future run, it should be folded into finalization evidence hardening.
- Repeated rendered blocks in the pane around `open-next`/`close-and-open-next` were not treated as proof of duplicate script mutation because the ledger remained valid with a single active node.
