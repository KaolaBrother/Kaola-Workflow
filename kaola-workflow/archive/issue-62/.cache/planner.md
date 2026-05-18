# Phase 2 - Planner Output (issue-62)

(Raw planner agent response — see conversation for full trace.)

## Recommendation

**Option A — Cleanup inside `archiveProjectDir`** (atomic with rename).

## Discriminating constraint

Atomicity. Splitting archive + cleanup across two functions (Option B = `cmdFinalize` only) or two scripts (Option C = sink-merge layer) creates windows where one ran and the other didn't, and leaves the underlying cwd-locality class of bug present for future callers.

## Options summary

| Option | Layer | Pros | Cons |
|--------|-------|------|------|
| A (RECOMMENDED) | `archiveProjectDir` | Atomic with rename; covers cmdFinalize + cmdRelease + cmdWatchPr (no-op for watch-pr); reuses existing `mainRootFromCoord` plumbing | Slightly wider blast radius |
| B | `cmdFinalize` only | Narrowest blast radius; literal Part A match | Misses `cmdRelease`; non-atomic; doesn't address class of bug |
| C | sink-merge.js | Aligned with "main absorbs work" narrative | Wrong layer (archive is the lifecycle); doesn't help release or sink-fallback; conflates concerns |

## Key implementation steps (from planner)

1. Extend `archiveProjectDir`: after `fs.renameSync(src, dest)`, compute `mainRoot = mainRootFromCoord(getCoordRoot(root))`. If `realpathSync(mainRoot) !== realpathSync(root)` AND `existsSync(mainLive)`, remove the main copy.
2. Regression test `testFinalizeCleansMainRepoLeak` in `simulate-workflow-walkthrough.js`.
3. Mirror to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-identical).
4. Port to `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (add `mainRootFromCoord` helper first).
5. Mirror regression test to plugin walkthrough.
6. Run validators + simulator.

## Out of scope

- `cmdWatchPr` (already runs from main root)
- `kaola-workflow-sink-merge.js` (orthogonal)
- No new env flag (runtime path comparison)
- No signature change to `archiveProjectDir`

## Open questions answered by advisor

1. **Verify-then-delete policy**: cheap-but-verified (`rmSync` after confirming archive present and `mainRoot !== linkedRoot`). Skip the planner's defensive sentinel — Phase 6 Step 8a mirror guarantees `linked ⊇ main` at archive time.
2. **`realpathSync` semantics**: required on both sides of comparison to handle macOS `/tmp` → `/private/tmp` and `/var/folders` ↔ `/private/var/folders` symlinks.
3. **`getCoordRoot` shape from main worktree**: verify once with a throwaway test trace before locking the comparison.
