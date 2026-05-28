# Fast Summary: issue-172

## Status
PASSED

## Scope
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` — rename 3 occurrences of `PICK_NEXT_PROJECT` → `KAOLA_PROJECT`
- `scripts/validate-kaola-workflow-contracts.js` — update 3 assertions at lines 91-93 to match

## Plan
Rename `PICK_NEXT_PROJECT` to `KAOLA_PROJECT` in the Codex-edition SKILL.md (lines 50, 120, 152) and flip the companion validator assertions to enforce the new name.

## Implementation Evidence
- `grep PICK_NEXT_PROJECT SKILL.md` → empty (clean)
- `node scripts/validate-kaola-workflow-contracts.js` → exit 0 ("Codex contract validation passed")
- `node scripts/simulate-workflow-walkthrough.js` → exit 0 ("Workflow walkthrough simulation passed")
- npm test Codex walkthrough failure is pre-existing (confirmed stash-test against main)

## Review
PASS — clean surgical rename, no CRITICAL/HIGH issues, all ACs satisfied. LOW note: GitLab/Gitea drift pre-existing, tracked by #170/#171.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| tdd-guide | invoked | .cache/tdd-guide.md | |
| code-reviewer | invoked | .cache/code-reviewer.md | |

## Escalation
N/A
