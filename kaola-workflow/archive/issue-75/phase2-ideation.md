# Phase 2 - Ideation: issue-75

## Approaches Evaluated

### Gap 1 — watch-pr skips closed-issue PR-backed folders

**Option A (Selected)**: Change `readActiveFolders(root)` → `readActiveFolders(root, { excludeClosedIssues: false })` in `cmdWatchPr` line 543.
- Pros: 1-line fix, matches existing pattern in sink-merge.js:225
- Cons: none
- Risk: Low
- Complexity: Trivial

### Gap 2 — Phase 6 archive order / sink-fallback recreation

**Option A (Selected)**: Two-part fix:
1. **Doc change**: Make Phase 6 Step 8b conditional on `sink: merge`. For `sink: pr`, skip Step 8b entirely — folder stays active, watch-pr archives it later when PR closes/merges. This aligns with the intent stated at `commands/kaola-workflow-phase6.md:596`: "After sink-pr.js exits 0, the active folder remains open. It is archived automatically when watch-pr detects..."
2. **Code change**: Add guard in `cmdSinkFallback`: if `projectDir(root, args.project)` directory doesn't exist (folder was archived by Step 8b in merge→PR pivot case), skip `updateState` and return `{ updated: false, project, reason: 'project archived' }`. Without this guard, `updateState` → `writeFile` → `fs.mkdirSync({ recursive: true })` recreates the archived directory with an empty state file.

**Option B**: Fix `sink-pr.js` to try both active and archive paths.
- Cons: violates post-commit write invariant (phase6.md:76). Archived state file is committed; writing post-commit creates dirty worktree. `readActiveFolders` skips archive/ so pr_url would never be read by watch-pr.
- **Rejected**: breaks invariants, doesn't serve the watch-pr tracking purpose.

**Option C**: Add `--state-file` override to sink-pr.
- Same post-commit write problem as B plus new CLI surface.
- **Rejected**.

### Gap 3 — Worktree cleanup missing

Single approach (no contest): Add `try { removeWorktree(root, folder.project, folder); } catch (_) {}` after each `archiveProjectDir` call in `cmdRelease`, `cmdFinalize`, and both MERGED/CLOSED branches of `cmdWatchPr`. Mirrors `sink-merge.js:227` exactly. Do NOT surface `worktree_removed` in JSON output.

### Gap 4 — status hides closed-issue local remnants

**Option A**: Single flat list with `excludeClosedIssues: false`.
- Mixes drift into `active[]`, breaks semantics, breaks existing test contract.
- **Rejected**.

**Option B (Selected)**: Structured output `{ active, drift, count }`:
- Call `readActiveFolders(root, { excludeClosedIssues: false })` once.
- Partition: open/unknown issue → `active`, `issueIsClosed(issue_number) === true` → `drift`.
- Keep `count: active.length` (backward compat). No `drift_count` — callers use `drift.length`.
- OFFLINE fail-open: `issueIsClosed` returns false when offline → all folders in `active[]`, `drift=[]`. Correct behavior.

### Gap 5 — Startup claims before Git freshness (doc-only)

**Option A (Selected)**: Add note under Startup Step 0b: "If the subsequent Git freshness check blocks, run `node "$CLAIM_JS" release --project "$KAOLA_PROJECT" --reason git-freshness-block` to release the just-claimed folder and worktree before stopping."

**Option B**: Restructure doc to move Git freshness before startup transaction — larger blast radius, changes the startup contract that `cmdStartup`'s typed refusals are written for.
- **Rejected**: separate refactor, out of scope.

### Gap 6 — Parallel write-set isolation (advisory)

Add one advisory paragraph under a "Co-active Folders" section in `commands/workflow-next.md` and its SKILL mirror.

## Advisor Findings

- `cmdSinkFallback` can recreate archived folders via `updateState` → `writeFile` → `mkdirSync({ recursive: true })`. Fix required in addition to doc ordering change.
- Gap 2 approach must be implemented AFTER Gap 1 fix is in place (Gap 2 doc approach relies on watch-pr working for closed-issue folders).
- Implementation order: Gap 1 → Gap 3 → Gap 2 (doc + cmdSinkFallback code) → Gap 4 → Gap 5+6 docs → tests.
- Gap 4 OFFLINE fail-open behavior is correct; document it.
- Skip `drift_count` field.

## Selected Approach

**Per-gap summary**:
| Gap | Decision | Type |
|-----|----------|------|
| 1 | `excludeClosedIssues: false` in `cmdWatchPr` | code |
| 2 | Conditional Step 8b doc (PR-sink skips archive) + guard in `cmdSinkFallback` | doc + code |
| 3 | Silent `removeWorktree` in `cmdRelease`, `cmdFinalize`, `cmdWatchPr` | code |
| 4 | `{ active, drift, count }` structured output | code |
| 5 | Cleanup note under Startup Step 0b | doc |
| 6 | Advisory paragraph | doc |

**Implementation order**: 1 → 3 → 2 → 4 → 5+6 → tests

## Out of Scope (explicit)

- Do NOT change `excludeClosedIssues: true` default in `readActiveFolders`
- Do NOT add a drift cleanup command
- Do NOT modify `sink-merge.js`
- Do NOT add `--skip-archive` flag on `cmdFinalize`
- Do NOT add second post-sink commit to persist `pr_url`
- Do NOT refactor the archive path scheme
- Do NOT restructure startup transaction ordering in workflow-next.md
- Do NOT add `drift_count` to status output

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
