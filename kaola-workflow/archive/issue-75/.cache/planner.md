# Planner Output — issue-75

## Key Finding

`commands/kaola-workflow-phase6.md:596` states PR-sink intent: active folder remains open after sink-pr; `watch-pr` archives on next startup when PR closes/merges. Step 8b (cmdFinalize) is internally inconsistent for the PR-sink path — it archives the folder unconditionally before sink-pr dispatch. The fix is doc-only: make Step 8b conditional on `sink: merge`.

## Gap 2 — Options Evaluated

### Approach A — Conditional Step 8b on sink kind (RECOMMENDED)
- Merge sink: 8a mirror → 8b cmdFinalize archive → 8 commit → 9 sink-merge (current)
- PR sink: 8a mirror → 8 commit → 9 sink-pr (writes pr_url to active folder) → folder remains → watch-pr archives later
- No code change in sink-pr.js or cmdFinalize. Pure doc update.
- **Risk**: Low. Matches existing stated design.

### Approach B — Fix sink-pr.js to try archived path
- After archive, sink-pr falls back to `kaola-workflow/archive/{project}/workflow-state.md`
- **Violates post-commit write invariant** (phase6.md:76). Archived state file already committed; writing post-commit creates dirty worktree. `readActiveFolders` skips archive/ so pr_url would never be read by watch-pr.
- **Risk**: High.

### Approach C — --state-file override in sink-pr.js
- Same post-commit write problem as B plus new CLI surface.
- **Risk**: Medium.

## Gap 4 — Options Evaluated

### Option A — Single flat list with excludeClosedIssues: false
- 1-line change but mixes drift into `active[]` — breaks semantics and existing test contract.
- **Risk**: Medium.

### Option B — Structured `{ active, drift, count, drift_count }` (RECOMMENDED)
- Partition readActiveFolders(root, {excludeClosedIssues: false}) by issueIsClosed.
- Preserves `active[]` and `count` semantics. Matches AC "as drift" language.
- **Risk**: Low (additive).

## Other Gaps

- Gap 1: `excludeClosedIssues: false` in cmdWatchPr — trivial 1-line fix
- Gap 3: `try { removeWorktree(root, folder.project, folder) } catch (_) {}` after each archiveProjectDir — 3 sites, silent (matches sink-merge.js:227 pattern). Do NOT surface worktree_removed in JSON output.
- Gap 5: Doc note under Step 0b: if Step 1 Git freshness blocks, run `cmdRelease --project ... --reason git-freshness-block`
- Gap 6: Advisory paragraph only

## Explicit Out-of-Scope

- Do NOT change excludeClosedIssues: true default in readActiveFolders
- Do NOT add a drift cleanup command
- Do NOT modify sink-merge.js
- Do NOT add --skip-archive flag on cmdFinalize
- Do NOT add second commit after sink-pr to persist pr_url
- Do NOT refactor archive path scheme
- Do NOT restructure workflow-next.md for Gap 5

## Missing Facts Resolved

- Plugin mirror is byte-for-byte identical to scripts/ copy ✓
- cmdFinalize has only two callers in docs (phase6.md and SKILL.md) ✓

## Test Plan

- **Gap 1**: Online test with gh shim returning closed issue + MERGED PR, seed folder with pr_url, call watch-pr, assert folder archived
- **Gap 2**: Verify that PR-sink flow leaves active folder intact after sink-pr writes pr_url; verify merge-sink flow still archives
- **Gap 3**: initGitRepo + startup to provision worktree, call release/finalize/watch-pr-merge, assert fs.existsSync(worktreePath) === false
- **Gap 4**: Two folders (one open issue, one closed issue), call status, assert { active: [1 item], drift: [1 item], count: 1, drift_count: 1 }

## Recommendation Summary

| Gap | Approach | Type |
|-----|----------|------|
| 1 | excludeClosedIssues: false in cmdWatchPr | code |
| 2 | Conditional Step 8b (doc-only) | doc |
| 3 | Silent removeWorktree in 3 sites | code |
| 4 | Structured { active, drift } output | code |
| 5 | Note under Step 0b about post-claim release | doc |
| 6 | Advisory paragraph | doc |
