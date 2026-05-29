# Closure advisor — issue #184

## Verdict
Implementation solid; do not re-open. Tests green, RED-verified discriminators, code-reviewer PASS, docs DOCKED, byte-mirrors identical, acceptance independently re-run. Fix #1 semantics correct (unverifiable probe → `unresolved`, never `closedSet` → non-destructive). The two open items are user decisions, not gaps. Nothing blocks the final git gate.

## Sink type
Recommend **PR**. Evidence: every recent issue (174–178) carries a `chore: record PR metadata for issue-N` commit — the `sink-pr.js` signature; PR is this repo's established norm. `sink: merge` in workflow-state is only the unset default (no `KAOLA_SINK=pr` passed at startup). PR also adds a review checkpoint before main. Offer merge as the alternative; user picks.

## Deferred LOW (timeout upper bound)
Outside #184's stated acceptance criteria (NaN/negative/0); reviewer rated defer. Do NOT expand the current fix. Offer the user: file a follow-up issue, or keep as the noted item.

## Pre-commit checks
1. Confirm roadmap Step 7 is a true no-op (no `.roadmap/issue-*.md` sources; ROADMAP.md already "no active work") so regen doesn't dirty the commit.
2. If user picks merge: follow finalize→commit→sink-merge ordering exactly (cmdFinalize archives + renames workflow-state.md; that rename must be committed before sink-merge or it refuses with exit 1). PR path: folder stays open, sink-pr writes metadata commit.

## Note to user
The fast path still ran four subagents (planner/tdd-guide/code-reviewer/doc-updater) + full Phase 6 for a ~30-line hardening change — worth calibrating whether truly trivial fixes warrant this ceremony next time.

Advisor output is not user approval (closure gate requires explicit user permission before issue/roadmap changes).
