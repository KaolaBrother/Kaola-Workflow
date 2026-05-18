# Architect Blueprint — Issue #81

## Design Decisions

- `bootstrap` is a pure alias for `startup` at the dispatch layer (line 602); no separate `cmdBootstrap` function. The sole `active.length === 1` branch lives only at line 372 inside `cmdStartup`. No other sole-active branch exists anywhere in the file.
- The shape parity fix is a surgical sub-step within the same `cmdStartup` edit, not a separate function. It hoists `worktree_path` from `result.folder.worktree_path` into the `Object.assign` output for the `status === 'owned'` path.
- The `Object.assign({...base}, result)` ordering at lines 380-386 causes `result` (which contains `folder: {...}` but not a top-level `worktree_path`) to never supply `worktree_path`. The fix adds an explicit `worktree_path` derivation before the spread.
- `CLAUDE.md` lines 21-22 already say "validate, not select" and "ambiguity → ask or stop." Those statements cover sole-active by implication. No edit is needed; recorded as explicit decision.
- The four doc files are fully disjoint from each other and from both script files. They can be edited in any order or in parallel.
- The GitLab SKILL.md at `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` line 66 has the same carve-out and is Task F.

## Files to Create

None.

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `scripts/kaola-workflow-claim.js` | (1) Delete `if (active.length === 1)` sole-active branch (lines 372-375) so all no-target paths fall through to `no_target` exit-1 at line 376. (2) In explicit-target path (lines 380-386), add `worktree_path: result.folder ? (result.folder.worktree_path || '') : (result.worktree_path || '')` to assembled output so owned-via-explicit path surfaces `worktree_path` at top level. | P0 |
| `scripts/simulate-workflow-walkthrough.js` | Add four regression tests: (T1) no-target + zero active → `no_target` + exit 1; (T2) no-target + one active → `no_target` + exit 1 (post-fix); (T3) no-target + multiple active → `no_target` + exit 1; (T4) round-trip: plant one active folder → call `status` → confirm `active[0].issue_number` set → call `startup --target-issue N` → assert `verdict: owned`, `worktree_path` non-empty. | P0 (depends on claim.js edit) |
| `commands/workflow-next.md` | Replace step 5 line 56: old text → "If exactly one active folder is already present, read its issue number from `node \"$CLAIM_JS\" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call." | P1 |
| `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | Same step-5 replacement, using GitLab-appropriate surrounding prose (MR, `glab`). | P1 |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Same step-5 replacement (GitHub edition; uses `gh` in surrounding context). Line at ~line 66 in "Agent Issue Selection" section. | P1 |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | Same step-5 replacement (GitLab edition; uses `glab`). Line 66 in "Agent Issue Selection" section. | P1 |

## Data Flow

Before fix: `cmdStartup` with no `--target-issue` and one active folder returned `verdict: owned` directly from `readActiveFolders` output, bypassing `claimExplicitTarget`. Bash glue read `worktree_path` from that shortcut.

After fix: that shortcut is gone; no-target path always exits 1 with `no_target`. Agent calls `status`, reads `active[0].issue_number`, sets `KAOLA_TARGET_ISSUE`, calls `startup --target-issue N`, which routes through `claimExplicitTarget` → `claimProject` → returns `{status: 'owned', folder: {...}}`. `cmdStartup` output layer promotes `folder.worktree_path` so bash glue `KAOLA_WORKTREE_PATH="$(node -e "...JSON.parse(...).worktree_path...")"` continues to work.

## Build Sequence

1. **Task A — claim.js edit**: Remove sole-active branch (lines 372-375). Add `worktree_path` hoisting in explicit-target output block. Both sub-steps in single atomic edit — round-trip test (T4) verifies both together.
2. **Task B — walkthrough.js edit**: Add all four regression tests. Must happen after claim.js is updated (T2 asserts `no_target` for single-active case; would pass erroneously against old code).
3. **Validation**: `node scripts/simulate-workflow-walkthrough.js` — must exit 0.
4. **Tasks C, D, E, F — doc edits (parallel after Task A)**: All four doc files independent; can be edited concurrently or in any order after claim.js edit is confirmed.

## Task List

| # | Task | File | Write Set | Depends On | Validation |
|---|------|------|-----------|------------|------------|
| A | Remove sole-active branch; add worktree_path hoist | `scripts/kaola-workflow-claim.js` | lines 370-386 | none | `node scripts/simulate-workflow-walkthrough.js` |
| B | Add four regression tests | `scripts/simulate-workflow-walkthrough.js` | new test functions + main() additions | Task A | `node scripts/simulate-workflow-walkthrough.js` exits 0 |
| C | Rewrite step 5 — GitHub command doc | `commands/workflow-next.md` | line 56 | Task A (conceptual) | diff review |
| D | Rewrite step 5 — GitLab command doc | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | line 56 | Task A (conceptual) | diff review |
| E | Rewrite step 5 — GitHub skill doc | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | line ~66 | Task A (conceptual) | diff review |
| F | Rewrite step 5 — GitLab skill doc | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | line 66 | Task A (conceptual) | diff review |

## Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| Serial | A then B | T2 in B would false-green against old A code |
| Parallel | C, D, E, F | Disjoint files; no shared sections |
| Post-A gate | C, D, E, F can start after A | They don't depend on B or validation passing |

## External Dependencies

None. All changes use Node.js built-ins and existing script patterns.

## Out-of-Scope Items

- `cmdPickNext` — already returns `no_target` + exit 1 unconditionally; no change
- `cmdResume` — separate subcommand; not part of startup contract change
- `cmdBootstrap` — dispatch alias for `cmdStartup` (line 602); fixing `cmdStartup` covers it
- `CLAUDE.md` — lines 21-22 correct as-is; no edit needed
- `docs/architecture.md`, `docs/api.md`, `docs/decisions/` — no structural system change
- Changes to `claimExplicitTarget`, `classifyIssue`, `claimProject` — shape parity fixed at `cmdStartup` output layer only

## Phase 2 Entry Conditions Resolution

| Condition | Resolved By |
|-----------|-------------|
| Sole-active branch removed from `cmdStartup` | Task A |
| Shape parity restored: `worktree_path` at top level in owned-via-explicit output | Task A |
| Four regression tests written and passing against fixed code | Task B |
| All four doc files teach agent-side `status` read + explicit `KAOLA_TARGET_ISSUE` for sole-active resume | Tasks C, D, E, F |
| `CLAUDE.md` decision confirmed (no edit needed) | Recorded in blueprint |
| `node scripts/simulate-workflow-walkthrough.js` exits 0 | Task B validation |
