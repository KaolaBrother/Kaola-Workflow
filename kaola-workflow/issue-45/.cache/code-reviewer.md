# Code Review: issue-45

## Summary
Reviewed: scripts/kaola-workflow-claim.js, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, scripts/simulate-workflow-walkthrough.js (tests 17P–17V)

## CRITICAL
None.

## HIGH
None.

## MEDIUM

### MEDIUM-1: cmdStartup worktree_path in receipt lacks direct startup test
File: scripts/kaola-workflow-claim.js, lines 1379–1399 (owned) and 1452–1473 (acquired)

Test 17V exercises pick-next (which includes worktree_path from the pre-existing pick-next augmenter at line 2481). The new P3-A code reads the lock file inside cmdStartup and is not reached by 17V. Existing startup tests (Epic 14 series) verify issue/claim/verdict/target_source but none assert worktree_path from the startup subcommand directly.

Risk: Low — the logic is a straightforward JSON.parse(readFileSync(lockPath(...))) with try/catch fallback to null. But the owned branch re-attach path is untested for this field.

Fix recommended: add test calling startup directly with an already-claimed issue and asserting receipt.worktree_path is a non-null path.

### MEDIUM-2: KAOLA_WORKTREE_PATH exported without -d existence check (TWO SITES)
File: plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, lines 61 and 83

The new export lines used `[ -n "$KAOLA_WORKTREE_PATH" ]` but the established pattern in kaola-workflow-finalize/SKILL.md line 199 uses `[ -n "$_WT" ] && [ -d "$_WT" ]`.

**RESOLVED via TIE**: Both sites updated to `[ -n "$KAOLA_WORKTREE_PATH" ] && [ -d "$KAOLA_WORKTREE_PATH" ] && export KAOLA_WORKTREE_PATH`

## LOW

### LOW-1: P2-A incomplete-status regex does not cover all possible non-terminal statuses
File: scripts/kaola-workflow-claim.js, line 2550
Regex `/\|\s*(pending|in[_-]progress)\s*\|/i` would misroute if non-standard status values (blocked, todo, wip) were used. Current production data only uses pending/complete. Noting for awareness; no action required.

## Verified Clean
- Plugin mirror: byte-identical (validate-script-sync.js → OK: 7 scripts in sync)
- P1-D rmdirSync placement: correct (inside success branch of git worktree remove)
- P2-B ISO timestamp regex: correct ($1/$2/$3 backreferences valid in JS replace)
- P2-C realpathSync deduplication: handles symlinks, ENOENT falls back to raw path
- P1-A/P1-B closed drift: OFFLINE-safe (remote.state defaults to null)
- P1-C SKILL.md sink order: SINK_KIND/SINK_BRANCH now before finalize call
- No debug statements, no hardcoded credentials, no new external API endpoints
- All 17P–17V tests pass; simulation exits 0
