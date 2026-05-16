# Phase 2 - Ideation: issue-33

## Approaches Evaluated

### Option A: Node-only fix (script self-protection)
- Summary: Add `process.chdir(mainRootFromCoord(coordRoot))` in `sink-merge.js` after `removeWorktree()` returns `removed` or `abandoned`. Hoist `coordRoot` out of block scope.
- Pros: Smallest diff (~5 lines in one JS file plus one test). Eliminates script crash when launched from inside the worktree.
- Cons: Does NOT fix user-visible bug — parent shell CWD unchanged after script exits. Risks claiming issue fixed when symptom persists.
- Risk: Medium — appears complete in tests but ships a half-fix.
- Complexity: Low.

### Option B: Shell-only fix (Phase 6 markdown)
- Summary: Capture `_MAIN_ROOT` before sink dispatch; add `cd "$_MAIN_ROOT"` after the case block in `commands/kaola-workflow-phase6.md`.
- Pros: Directly addresses user-visible bug. Covers both sink-merge and sink-pr. No JS changes.
- Cons: Leaves in-script CWD bug latent — sink-merge can crash on its own `git` calls when launched from worktree. Shell-side hard to test in Node simulator.
- Risk: Medium — fixes headline but script can still crash.
- Complexity: Low.

### Option C: Two-track fix (Node + shell) — SELECTED
- Summary: Combine A and B. Node-side fix is defensive (script completes); shell-side fix is authoritative (user session restored).
- Pros: Fixes both CWD layers. Each track independently mergeable/testable. Clear separation of concerns.
- Cons: Slightly larger surface area (two files, two test additions).
- Risk: Low.
- Complexity: Low–Medium.
- Architectural fit: Best — no new helpers invented; uses existing patterns.

## Advisor Findings

Advisor confirmed Approach C and validated all risks as accurately characterized. Critical gotchas surfaced:

1. **`getRoot()` is CWD-dependent** — must not call `getRoot()` after worktree deletion. Instead derive main root from pre-captured `coordRoot` using `mainRootFromCoord(coordRoot)`.
2. **Shell-side must capture `_MAIN_ROOT` before sink dispatch** — capturing after would fail if CWD is already deleted.
3. **Additional `removeWorktree` callers at `claim.js:1971,1977`** — flagged by advisor. Confirmed these are in `cmdWatchPr`, always invoked from repo root via `runBootstrapWatchPr(cwd=repoRoot)`. Not affected by the CWD bug; no fix needed there.

## Selected Approach

**Approach C — Two-track fix (Node + shell)**

Rationale: The two CWD layers are independently broken and require independently targeted fixes. Node's `process.chdir()` cannot mutate the parent shell; the shell-side `cd` cannot prevent in-script crashes on `git` calls after removal. Only Approach C fully eliminates both failure modes. The surface area is small and both tracks are independently verifiable.

## Implementation Scope

### Track 1: Node self-protection (sink-merge.js)

1. Hoist `coordRoot` out of Step 0 block scope — declare at function scope before the block, capture `removeWorktree()` return value.
2. After `removeWorktree()` returns `removed` or `abandoned`, call `process.chdir(mainRootFromCoord(coordRoot))`.
   - `mainRootFromCoord(coordRoot)`: if `path.basename(coordRoot) === '.git'` → `path.dirname(coordRoot)`, else `coordRoot`. Implement as local helper in `sink-merge.js`.
   - Wrap in try/catch. Skip on `skipped`/`deferred`.
3. Add test-only CWD probe: if `KAOLA_WORKFLOW_DEBUG_CWD` is set and parent dir exists, `fs.writeFileSync(process.env.KAOLA_WORKFLOW_DEBUG_CWD, process.cwd())`. Wrap in try/catch. Written at end of `main()`.

### Track 2: Shell-side restoration (kaola-workflow-phase6.md)

4. Before `case "$SINK_KIND"` dispatch, capture: `_MAIN_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"`.
5. After the case block, append: `cd "$_MAIN_ROOT" 2>/dev/null || true`.
6. Add inline comment: `# Restore CWD: sink-merge may have removed the worktree this shell was in (issue #33).`

### Track 3: Test extension (simulate-workflow-walkthrough.js)

7. Extend test 16G — spawn `sink-merge.js` with `cwd: lock605.worktree_path` (inside worktree). Assert exit 0 and worktree gone. Use `KAOLA_WORKFLOW_DEBUG_CWD` probe to assert CWD equals main repo root after restoration.

## Out of Scope (explicit)

- `drainPendingRemovals()` chdir — only called from sweep subprocess, independent CWD
- `cmdWatchPr` removeWorktree calls (claim.js:1971,1977) — always run from repo root, not affected
- Generic `restoreCwd()` helper — YAGNI at 2 call sites
- `sink-pr.js` JS changes — no `removeWorktree` call
- `removeWorktree()` return-shape refactor
- Chdir on `deferred` branch — removal didn't occur, CWD still valid
- `sink-pr.js` shell CWD handled by Track 2 (Phase 6 markdown)
- Plugin mirror sync — no changes to `plugins/` directory (scripts/ changes only)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
