# Finalize node evidence — issue #247

## Deliverable

Added ONE CHANGELOG.md entry as the FIRST bullet under `## [Unreleased]` → `### Fixed`,
immediately after the `### Fixed` line and before the existing `#262`/`#278`/`#275`
bullets. `CHANGELOG.md` is the finalize node's ONLY production write.

The inserted bullet (verbatim):

- **adaptive: unify the task→`in_progress` flip trigger to DISPATCH across the adapt + plan-run surfaces (#247).** The adaptive path's two orchestrator-facing surfaces contradicted each other on WHEN the main session flips a node's task to `in_progress` in the live task-list mirror: `kaola-workflow-adapt` (establish-time) said flip "when it opens that node (via `open-next`)", while `kaola-workflow-plan-run` (run-time) said flip "when you dispatch its role (after `open-next`)" — the same cosmetic, ledger-derived mirror with two different trigger moments. The task list carries no correctness weight (it is rebuilt from the durable `## Node Ledger` on every resume), so this was a spec/observability defect, but two authoritative prompts literally disagreed and only the orchestrator can act on either. **Fix:** canonicalize on the DISPATCH trigger (the moment the session already acts) and state it identically across all four editions of both surfaces. Adapt-side (4 files: `commands/kaola-workflow-adapt.md`, `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md`, and the GitLab/Gitea command ports) now reads "the executor flips each task `in_progress` when it dispatches that node's role (after `open-next`) and `completed` after the commit step closes it (`n/a` nodes → skipped)" — the three command editions share a byte-identical clause (the edition-specific `kaola-…-adaptive-node.js` script name is dropped in favour of the edition-agnostic bare `open-next`), and the previously vague codex adapt SKILL ("flips `in_progress`/`completed` per node") is pinned to the same trigger. Plan-run-side was already canonical in the three command editions; only the plan-run SKILL's passive "when its role is dispatched" is normalized to the active "when you dispatch its role". `commands/kaola-workflow-plan-run.md` is intentionally left untouched (already correct) to keep the branch conflict-free with the concurrent #279 work, which edits that file's repair-routing section. Docs/prose only — no script logic changed. `node scripts/simulate-workflow-walkthrough.js` and `npm test` green across all four editions (claude/codex/gitlab/gitea). Companion under-specification issue #248 (fused double-flip / tool-naming / `n/a` / halt-state) is tracked separately and is still open.

## Validation

Run from the worktree root; REAL exit codes captured directly (not via pipe/tail):

- `node scripts/simulate-workflow-walkthrough.js` → SIM_EXIT=0
  - Pass sentinel printed: `Workflow walkthrough simulation passed`
- `npm test` → NPM_EXIT=0
  - All four editions green (claude/codex/gitlab/gitea); each edition printed its
    respective `... walkthrough simulation passed` line and contract validation passed.

## Closure note

8/8 review ACs met; code-review gate verdict: pass / findings_blocking: 0; docs-only,
unreleased close — no version bump.
