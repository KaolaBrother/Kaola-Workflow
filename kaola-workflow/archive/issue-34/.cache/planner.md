# Planner Output — Issue #34

## Critical Ordering Constraint (verified)

Step 7 runs archive in main worktree, Step 8a mirrors to linked worktree, Step 8 commits in linked worktree.
- `status: closed` write AND archive-rename must both happen in Step 7
- Sink scripts (sink-merge.js, sink-pr.js) run in Step 9 — too late; injection there ruled out

## Approaches Evaluated

### Approach A — New `finalize` subcommand in `kaola-workflow-claim.js` (RECOMMENDED)

Add `cmdFinalize()` that:
1. Verifies session owns project
2. Reads workflow-state.md, replaces `status: active` → `status: closed` + `step: <X>` → `step: complete`
3. Writes updated state file BEFORE move
4. `fs.renameSync(kaola-workflow/{project}, kaola-workflow/archive/{project})` with timestamp suffix on collision
5. Returns JSON `{archived_path, status: 'closed'}` on stdout

Phase 6 prompt + skill become: `node "$claim_script" finalize --session "$KAOLA_SESSION_ID" --project "$KAOLA_PROJECT"`

- Pros: Single source of truth, unit-testable, follows existing subcommand pattern, fs.renameSync already at claim.js:665, idempotent re-entry
- Cons: ~60 lines added to claim.js; caller still needs to `git add` both paths
- Risk: Low — collision-suffix result must flow back to summary file; cross-session check required
- Complexity: Small
- Architectural fit: Excellent — mirrors `cmdRelease` structure exactly

### Approach B — Inline bash in phase6.md + SKILL.md

Replace prose archive block with `sed -i` + `git mv`.
- Pros: No claim.js changes, visible in prompt
- Cons: BSD/GNU `sed -i` incompatibility; must duplicate across 2 files; `git mv` in main worktree does NOT transfer to linked worktree's index (cp -R at Step 8a copies files, not .git/index)
- Risk: HIGH — cross-worktree git-mv semantics actively break this approach
- Complexity: Small but dangerous
- Architectural fit: Poor

### Approach C — Helper module + sink-script post-commit fixup

New `kaola-workflow-finalize.js` + sink amend after merge.
- Pros: Belt-and-suspenders
- Cons: New file for one function; sink amend changes commit hash after it was recorded on GitHub issue; triples ordering surface area
- Risk: Medium-High — amend anti-pattern
- Complexity: Medium
- Architectural fit: Poor

## Recommended: Approach A

## Bug 3 fix — `cmdSweep` second pass

Extend `cmdSweep()` after existing lock-scan:
1. Iterate `activeStateProjects(root)` (line 376)
2. Skip if lock file exists
3. Parse `expires:` via `field()` helper
4. If expired >24h OR missing/unparseable AND mtime stale → eligible
5. Write `status: abandoned` (distinct from `closed` and `released`) then `fs.renameSync` to `archive/`

## Shared helper: `archiveProjectDir(root, project, statusValue)`

Extract status-replace + rename-with-collision-suffix into shared private function used by both `cmdFinalize` and `cmdSweep` second pass.

## What NOT to build

- No `kaola-workflow/abandoned/` directory parallel to `archive/`
- No retry/backoff in `cmdFinalize`
- No async hooks or watchers
- No migration of existing archive entries (write-forward only)
- No amend-after-commit in sink scripts
- No removal of `cp -R` at Step 8a (different purpose)
- No change to `releaseSession` `status: released` path

## Implementation Steps

1. Add `cmdFinalize()` to `scripts/kaola-workflow-claim.js` (~80 lines)
2. Register `finalize` in subcommand dispatcher
3. Extract `archiveProjectDir()` shared helper
4. Extend `cmdSweep()` with second pass for crashed claims (~50 lines)
5. Replace prose archive block in `commands/kaola-workflow-phase6.md` Step 7 (lines 453-459)
6. Mirror change in `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` line 90
7. Add tests to `scripts/simulate-workflow-walkthrough.js` (~120 lines):
   - F1: finalize writes status: closed, moves dir, frees issue number
   - F2: finalize is idempotent
   - F3: finalize rejects wrong session
   - G1: sweep second pass archives abandoned dirs (no lock + expired)
   - G2: sweep second pass skips dirs with live locks
   - G3: sweep second pass skips fresh expires

## Missing Facts That Could Change Decision

1. If Step 7 archive is post-Step-8 commit — would undermine Approach A ordering rationale (confirmed: Step 7 → Step 8a → Step 8 ordering says no)
2. Whether `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` exists as a separate copy that also needs updating
3. Whether any consumer relies on `status: closed` vs `status: released` distinction (grep shows only `status: active` is read; others are write-only audit values)
