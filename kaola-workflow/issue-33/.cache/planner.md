# Planner Cache — issue-33
Generated: 2026-05-16

## Overview

After Phase 6 removes the worktree, two distinct CWDs can be stranded:
1. The **Node script's own `process.cwd()`** inside `sink-merge.js` — subsequent `git fetch`, `checkout`, `merge` fail with opaque errors.
2. The **parent shell's CWD** (Claude Code session shell) — affects every command after the script exits.

These require **separate fixes at separate layers** because `process.chdir()` inside the script cannot mutate the parent shell.

## Approaches Evaluated

### Approach A — Node-only fix (script self-protection)
Add `process.chdir(getRoot())` in `sink-merge.js` after `removeWorktree()` returns `removed` or `abandoned`.

**Pros:** Smallest diff (~5 lines in one JS file plus one test). Fully testable with simulator. Eliminates script crash when launched from inside the worktree.
**Cons:** Does NOT fix user-visible bug (parent shell CWD unchanged after script exits). Risks claiming issue fixed when symptom persists.
**Risk:** Medium — appears complete in tests but ships a half-fix.
**Complexity:** Low.

### Approach B — Shell-only fix (markdown dispatch)
Add `cd "$(git -C "$ACTIVE_WORKTREE_PATH" rev-parse ...)"` after `node "$SINK_*_JS"` calls in Phase 6 markdown.

**Pros:** Directly addresses user-visible bug. Covers both sink-merge and sink-pr in one place. No JS changes.
**Cons:** Leaves in-script CWD bug latent — sink-merge can crash on its own `git` calls when launched from worktree. Shell-side hard to test in Node simulator.
**Risk:** Medium — fixes headline but script can still crash.
**Complexity:** Low.

### Approach C — Two-track fix (Node + shell) — RECOMMENDED
Combine A and B. Node-side fix as defensive (script completes), shell-side fix as authoritative (user session restored).

**Pros:** Fixes both CWD layers. Each track independently mergeable/testable. Clear separation of concerns.
**Cons:** Slightly larger surface area (two files, two test additions). Shell-side asserted indirectly.
**Risk:** Low.
**Complexity:** Low–Medium.
**Architectural fit:** Best — no new helpers invented; uses existing patterns.

## Recommended Option: Approach C

## Implementation Tasks (Approach C)

### Phase 1: Node self-protection (sink-merge.js)

1. **Hoist `coordRoot` out of Step 0 block** — Replace block-scoped `const coordRoot` (lines 158–165) with function-scope declaration. Capture `removeWorktree()` return value.

2. **Add chdir after removal** — If `result.removed || result.abandoned`, call `process.chdir(mainRootFromCoord(coordRoot))`. Wrap in try/catch. Skip on `skipped`/`deferred`.
   - **Critical subtlety:** `getRoot()` calls `git rev-parse --show-toplevel` from `process.cwd()` — if CWD was deleted, this fails. Instead derive from `coordRoot`: `path.basename(coordRoot) === '.git'` → `path.dirname(coordRoot)`, else `coordRoot`. Implement as local `mainRootFromCoord(coordRoot)` helper.

### Phase 2: Test the Node-side fix

3. **Extend test 16G** (simulate-workflow-walkthrough.js near lines 3750–3763) — Spawn `sink-merge.js` with `cwd: lock605.worktree_path` (not `epic16Tmp`). Assert exit 0 and worktree gone. Add `KAOLA_WORKFLOW_DEBUG_CWD=<probe-file>` env assertion that probe equals main repo root.

4. **Add test-only CWD probe to sink-merge.js** — At end of `main()`, if `KAOLA_WORKFLOW_DEBUG_CWD` is set and parent dir exists, `fs.writeFileSync(process.env.KAOLA_WORKFLOW_DEBUG_CWD, process.cwd())`. Wrap in try/catch.

### Phase 3: Shell-side restoration (Phase 6 markdown)

5. **Capture main-root and chdir after sink dispatch** (commands/kaola-workflow-phase6.md) — Before `case "$SINK_KIND"` dispatch, capture `_MAIN_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"`. After case block, append `cd "$_MAIN_ROOT" 2>/dev/null || true`.

6. **Add inline rationale comment** — `# Restore CWD: sink-merge may have removed the worktree this shell was in (issue #33).`

## Out of Scope (Explicit)
- `drainPendingRemovals()` chdir (only called from sweep subprocess)
- Chdir on `deferred` branch (removal didn't occur, CWD still valid)
- Generic `restoreCwd()` helper (YAGNI — 2 call sites)
- `removeWorktree()` return-shape refactor
- Leaked test locks bug (file separately)
- Changes to `sink-pr.js` (no removeWorktree call)
- Plugin mirror sync (confirm with user before PR if needed)

## Missing Facts That Could Change Decision
- GitHub issue body text — does it explicitly exclude shell-side fix? (Approach C covers both; robust either way)
- Plugin-mirror sync convention — must files in `scripts/` be mirrored to `plugins/kaola-workflow/scripts/`?
- Whether `KAOLA_WORKFLOW_DEBUG_CWD` is preferred naming convention (fits existing pattern)
