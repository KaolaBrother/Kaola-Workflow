# Advisor — Closure Decision Gate: issue-164

## Recommendation (governs per session goal "follow advisor's recommendation")

1. **Close #164.** AC met, MEDIUM resolved + re-reviewed APPROVE, 43 tests green, docs DOCKED. No blockers.

2. **Create no new issues.** Both deferred items already have a home:
   - skip-path regression test (`receipt.archive === 'skipped'` on double-finalize) → folds into #165, which touches the same closure paths; adding it then is cheap and contextually correct.
   - invariant 5 (`remote-closed-after-publish`) + sink:pr runtime closure → already scoped to #165 in `docs/api.md` follow-up list.

3. **No roadmap reorganization.** Standard finalize: cmdFinalize deletes `.roadmap/issue-164.md` and regenerates `ROADMAP.md`. #161 stays open (its AC5 depends on #165).

4. **STOP after #164.** Prior context-risk note ("Ship #164, then STOP") + workflow-next Completion Contract (one issue per run). Do not auto-route into #165.

## Execution watchouts
- Branch/issue/sink already captured (`workflow/issue-164` / `164` / `merge`) — do NOT re-read workflow-state.md after cmdFinalize (it gets renamed into archive/).
- `kaola-workflow/issue-164/` → `kaola-workflow/archive/issue-164/` after cmdFinalize; `git add` the archive path so artifacts ship with the implementation commit.
- Staging Guard: active-folder count → 0 after archive (archive/ excluded). Verify before commit.
- Sequence: cmdFinalize (local archive) → stage → commit on `workflow/issue-164` → push → sink-merge.js (merges to main, closes #164). Order matters: sink-merge enforces `assertNoLiveWorkflowFolder` against branch HEAD.

## #165 follow-up note (do NOT fix now)
- sink-merge's `--remove-label` uses literal `'workflow:in-progress'` instead of a `CLAIM_LABEL` constant (claim.js has the constant). If the label ever changes, sink-merge drifts. Address in #165.
