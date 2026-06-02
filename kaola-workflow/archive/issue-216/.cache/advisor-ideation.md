# Advisor — issue-216 Ideation Gate

## Verdict

Approach A is sound. Do not re-plan; the three approaches cover the space and the "don't build wrapper / don't port finalValidationPassed" calls are correct.

## Critical Open Question Before Phase 4 Locks Placement

The guard placement decision rests on one unverified fact: **are workflow project folders git-tracked or untracked?**

From git status at session start:
- `?? kaola-workflow/issue-216/` — live folder is UNTRACKED on main
- `M kaola-workflow/archive/issue-219/...` — archive is TRACKED

`git reset --hard` removes tracked-and-ahead files but does NOT touch untracked files. So:

- If `cmdFinalize` moves the project via `fs.renameSync` (pure filesystem, untracked), the archive lands on disk regardless of branch. The forge's pre-git guard (`!exists(live) && exists(archive)`) already fires at script start. Post-checkout placement (Approach A's novel element) is unnecessary.
- If `cmdFinalize` uses `git mv` + commit (tracked), the archive appears on disk only after feature branch checkout, and `git reset --hard` wipes it. The post-checkout placement IS the operative location.

This fact resolves whether Approach A's novel placement adds value or whether the forge-aligned pre-git placement would suffice.

## What This Does NOT Block

Recording Approach A as the selected strategy. The placement is the right family; the exact line number is the open question.

## Instructions for Phase 3/4

- Record placement as **provisional** in `phase2-ideation.md`
- Note the tracked-vs-untracked question explicitly so Phase 3 does NOT hard-code line 328+ placement as fact
- In Phase 4: write the failing test FIRST against current code; confirm it actually reproduces the phantom folder
- Build the test to mirror the real lifecycle (finalize's actual archive mechanism), NOT a synthetic "commit live to main" setup
- Let the failing test drive placement: the three approaches differ almost entirely in WHERE the guard sits
- The failing test reproduction is a hard gate, not a footnote

## Additional Planner Test Setup Note

The planner's test step "commit a live `workflow-state.md` to main and push" would create a world where `git reset --hard` *restores* the live dir with real content — which would NOT reproduce the issue's stated evidence (0-byte state file). The test must mirror the real lifecycle to exercise the correct path.
