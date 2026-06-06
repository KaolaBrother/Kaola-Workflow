# Node `explore` evidence — issue #264 worktree surface map

Role: `code-explorer` (read-only; declared write set: none). Findings ground the `plan` (code-architect) node.

## 1. Worktree path helpers (claim.js)
- `getCoordRoot(root)` claim.js:70 — shells `git rev-parse --git-common-dir`.
- `mainRootFromCoord(coordRoot)` claim.js:~80 — strips trailing `.git`.
- `worktreePathFor(root, project)` **claim.js:140-143** → `path.join(path.dirname(mainRoot), path.basename(mainRoot) + '.kw', project)` = visible sibling `<parent>/<repo>.kw/<project>`. **Split into:** new `worktreePathFor` → `path.join(mainRoot, '.kw', 'worktrees', project)`; new `legacySiblingWorktreePathFor` → the old formula.
- `provisionWorktree` claim.js:252 — `fs.mkdirSync(path.dirname(wtPath), {recursive:true})` then `git worktree add`.
- `removeWorktree(root, project, folder)` claim.js:211 — `wtPath = (folder && folder.worktree_path) || worktreePathFor(root, project)`; shells `git worktree remove --force`.
- Exported: `worktreePathFor` (claim.js:1229), `getCoordRoot` (1223). `mainRootFromCoord` used inline.

## 2. Adaptive suppression gate
- **claim.js:467**: `if (!OFFLINE && WORKTREE_NATIVE && requestedPath !== adaptiveSchema.ADAPTIVE_PATH && hasGitHistory(root)) { worktreePath = provisionWorktree(...).path }`.
- `adaptiveSchema.ADAPTIVE_PATH === 'adaptive'` (kaola-workflow-adaptive-schema.js:24).
- ×4: root claim.js:467; Codex mirror :467 (byte-identical); gitlab claim :431; gitea claim :435. Drop the `requestedPath !== ADAPTIVE_PATH` term.

## 3. worktree_path write + ACTIVE_WORKTREE_PATH read (Phase 6 pattern to COPY)
- Write: claim.js:332 `if (data.worktree_path) lines.push('worktree_path: ' + data.worktree_path);` in `## Sink`; set at claim.js:475.
- **Phase 6 resolver (verbatim, phase6.md:377-379):**
  ```bash
  ACTIVE_WORKTREE_PATH="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
  [ -z "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
  ```
  Also in phase4.md:21-23 (+gitlab/gitea), phase6 gitlab:372 gitea:371, finalize SKILLs. Codex variant uses `process.env.KAOLA_PROJECT`.
- Empty/absent `worktree_path` → `$(pwd)` = repo-root fallback (THIS run has `worktree_path: ''`). **Adaptive plan-run.md/adapt.md currently have ZERO occurrences** — this is the wiring to add. KEEP the fallback (do NOT make resolution mandatory) so repo-root runs keep working.

## 4. sink-merge.js guard insertion
- No existing changed-files/diff-vs-origin logic. Flow: Step0 removeWorktree (305); fetch (331); assertCleanWorktree (334); checkout branch (335); `assertNoLiveWorkflowFolder` (336); merge-base skip-check (342-352); doRebase+npm test (124-148); ffMergeLoop (150-195); postMergeCleanup push/close (197-277).
- **Insert guard after line 336**, before merge-base skip-check: `git -C mainRoot diff --name-only origin/main...branch`; if files.length>0 AND all start with `kaola-workflow/` → throw (refuse). Skip when `origin/main` unresolvable (mirror `alreadyUpToDate`).

## 5. next-action.js / commit-node.js cwd
- Both take `<plan-path>` as argv[2], `fs.readFileSync(planPath)`. **No cwd/`-C`/root resolution.** commit-node resolves validator via `path.join(__dirname, VALIDATOR)`.
- **No SOURCE change needed** — the calling convention (cd into worktree, or pass absolute plan path) changes in the command/skill markdown only. Empty-worktree → `$(pwd)` preserves repo-root.

## 6. Four-edition layout + byte-identity
- claim/sink-merge/next-action/commit-node exist in root `scripts/`, Codex `plugins/kaola-workflow/scripts/`, gitlab `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-*.js`, gitea `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-*.js`.
- `validate-script-sync.js`: COMMON_SCRIPTS (lines 39-58) enforces **byte-identity Claude↔Codex** for claim/sink-merge/next-action/commit-node/adaptive-handoff/plan-validator. BYTE_IDENTICAL_GROUPS = adaptive-schema ×4. gitlab/gitea claim+sink-merge are forge-ported (gh→glab/tea), NOT byte-identical.
- plan-run: root `commands/kaola-workflow-plan-run.md`, Codex `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`, gitlab/gitea `commands/kaola-workflow-plan-run.md`.
- New scripts (if any) → add to install.sh SUPPORT_SCRIPT_NAMES allowlists (lines 142/170/199) + COMMON_SCRIPTS.

## 7. Existing cleanup tooling to REUSE
- `cmdStaleWorktreeCleanup` claim.js:939-1031. Dirty-skip: `if (state==='dirty' && !(args.archive||args.export||args.force)) skipped_dirty`. `--archive`→`stashWorktree` (150); `--export`→`exportWorktreeDiff` (160-188); `--force`→removeWorktree --force. Missing→`git worktree prune` (994).
- Helpers: `worktreeDirtyState(wtPath)` (200) → clean|dirty|missing; `stashWorktree` (150); `exportWorktreeDiff` (160); `removeWorktree` (211).
- Legacy-container cutover reuses this dirty-skip contract; net-new = empty-dir removal (`fs.rmdirSync` of legacy `<repo>.kw/`) after worktrees removed, and targeting `legacySiblingWorktreePathFor`.

## 8. Test harness
- `simulate-workflow-walkthrough.js` main() at 7296; final line `console.log('Workflow walkthrough simulation passed')` ~7455.
- **Invert:** `testWorktreeAdaptiveSuppressed` (2767), assertion claim.js:2783 `result.worktree_path === ''` → must become non-empty for adaptive when KAOLA_WORKTREE_NATIVE=1.
- **Update:** `testStartupJsonAndSiblingWorktrees` (2675), `kwRoot = realpath(tmp)+'.kw'`; `worktree_path === path.join(kwRoot,'issue-501')` → `path.join(tmp,'.kw','worktrees','issue-501')`; cleanup at 2691.
- New tests slot after ~7445: hidden-local path, legacy cutover dry-run, dirty-skip, adaptive worktree provisioned e2e, sink-merge refuses workflow-only, sink-merge allows mixed.
- Forge tests run via `simulate-{gitlab,gitea}-workflow-walkthrough.js` `run()` chain (NOT package.json directly): gitlab run() at 453-455 invokes `test-gitlab-workflow-scripts.js`; gitea at 534-536. New forge worktree assertions go there.

## 9. .gitignore
- Current: `.DS_Store`, `node_modules/`, `.claude/`, `.codex/`, `kaola-workflow/.locks/`, `.sessions/`, `.tickers/`, `.kw-env`, `kaola-workflow/issue-55/`. **`.kw/` NOT ignored — must add `.kw/`.**

## 10. Docs surface
- README.md:902-905 (multi-terminal), :917-921 (Per-issue worktrees), :928-930 (Where: `<parent>/<repo>.kw/<project>`).
- docs/api.md:106 (KAOLA_WORKTREE_NATIVE path), :108 (adaptive exemption clause — remove), :113 (discriminator adaptive bullet), :501 (adaptive startup "does NOT provision").
- workflow-init.md:135 (×3 editions root+gitlab+gitea) "sibling worktree at `<repo>.kw/<project>/`".
- adapt.md:9-11 (+Codex/gitlab/gitea mirrors) "adaptive does NOT provision a worktree ... tracked in #264".

## Recommendations
- COPY the Phase 6 3-line ACTIVE_WORKTREE_PATH resolver verbatim into adaptive command/skill; do not invent a new pattern; KEEP repo-root fallback.
- REUSE cmdStaleWorktreeCleanup dirty-skip contract for legacy cutover.
- DO NOT edit next-action.js/commit-node.js source (calling convention is in markdown).
- DO NOT touch adaptive-schema.js. Mind byte-identity Claude↔Codex on claim/sink-merge.
- Any new script → COMMON_SCRIPTS + install.sh allowlists.
