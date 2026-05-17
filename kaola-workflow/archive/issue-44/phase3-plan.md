# Phase 3 Plan: issue-44

## Issue
Design change: Issue picking must be agent-directed; scripts only claim explicit targets.

## Approach Selected
Break auto-pick in `cmdStartup` and `cmdPickNext`. Replace with explicit `--target-issue N`
path that validates, classifies, and claims only the named target. Add typed refusals.
Update `workflow-next.md` and `SKILL.md` to add agent-side issue selection step.
Update Epic 14 tests and contract assertions.

## Files to Touch

| File | Change |
|------|--------|
| `scripts/kaola-workflow-claim.js` | Add `--target-issue`, explicit-target path in `cmdStartup` and `cmdPickNext`, typed refusals |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical copy of above (required by validate-script-sync.js) |
| `commands/workflow-next.md` | Add agent-side target selection step before startup call |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Mirror workflow-next.md update for Codex |
| `scripts/simulate-workflow-walkthrough.js` | Update Epic 14A/B/C tests; add 14D/14E refusal tests |
| `scripts/validate-kaola-workflow-contracts.js` | Add --target-issue contract assertion |

## Implementation Tasks

### Task 1 — parseArgs: add --target-issue
File: `scripts/kaola-workflow-claim.js` line 157
Add after `--issue` line:
```javascript
if (argv[i] === '--target-issue' && argv[i + 1]) { args.targetIssue = parseInt(argv[++i], 10); continue; }
```

### Task 2 — claimExplicitTarget helper (new function before cmdStartup)
Validates + claims a named target issue:
- If already claimed by any session → `status: 'target_occupied'`
- Classify via classifier → if blocked → `status: 'user_target_blocked'`
- Classify → if red → `status: 'user_target_red'`
- Classify → if other non-green/yellow → `status: 'target_unavailable'`
- Attempt claim → if race-lost → `status: 'target_occupied'`
- Success → `status: 'acquired'`, `verdict: classifier verdict`

### Task 3 — cmdStartup: owned-check + target-issue gate
- If session owns a project:
  - And no targetIssue or targetIssue matches owned.issue_number → return owned receipt (unchanged)
  - And targetIssue mismatches → return `verdict: 'target_mismatch'`, `claim: 'none'`, exitCode 1
- If session owns nothing:
  - No targetIssue → return `verdict: 'no_target'`, `claim: 'none'`, exitCode 1 (breaks auto-pick)
  - targetIssue set → call claimExplicitTarget, return typed refusal or acquired receipt with `target_source: 'user_directed'`

### Task 4 — cmdPickNext: same owned-check + target-issue gate
- If session owns:
  - targetIssue absent or matches → return owned verdict (existing behavior)
  - targetIssue mismatches → return `verdict: 'target_mismatch'`
- If not owned:
  - No targetIssue → return `verdict: 'none'`, `reason: 'no_target'`
  - targetIssue set → classify + claim target, write receipt, return acquired verdict

### Task 5 — workflow-next.md: agent-side target selection
Before the `startup` call in Startup Step 0, add a step where the agent:
1. Reads `kaola-workflow/ROADMAP.md` for open unfinished issues
2. Reads GitHub issue list
3. Checks active locks
4. States and records the selected target issue number
5. Passes `--target-issue N` to the startup call

### Task 6 — SKILL.md: mirror for Codex
Same agent-side step before `pick-next` call; pass `--target-issue N`.

### Task 7 — Tests: update Epic 14A/B/C, add 14D/14E
- 14A: add `--target-issue 201` to startup call; assertions unchanged
- 14B: add `--target-issue 203`; remove skipped/blocked assertions (no full scan); add `target_source: 'user_directed'`
- 14C: remove target; update assertion to check `verdict === 'no_target'`
- 14D (new): `--target-issue 201` when 201 already claimed → `verdict: 'target_occupied'`
- 14E (new): `--target-issue 202` when 202 dependency-blocked → `verdict: 'user_target_blocked'`

### Task 8 — validate-kaola-workflow-contracts.js: new assertion
Assert that the workflow-next.md startup call passes `--target-issue` (or equivalent explicit target string).

### Task 9 — Copy claim.js to plugin mirror
`cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`

### Task 10 — Run tests
`node scripts/simulate-workflow-walkthrough.js` must exit 0.

## Acceptance Criteria
- `node scripts/simulate-workflow-walkthrough.js` exits 0
- `node scripts/validate-script-sync.js` exits 0 (plugin mirror in sync)
- startup without `--target-issue` returns `verdict: 'no_target'`
- startup with `--target-issue N` claims N when N is free and green/yellow
- startup with already-claimed target returns `target_occupied`
- startup with blocked target returns `user_target_blocked`
- workflow-next.md shows agent selects target before calling startup
