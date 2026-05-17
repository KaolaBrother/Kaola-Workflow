# Issue-44 Documentation Update Report

**Date**: 2026-05-18
**Issue**: issue-44 (agent-directed issue picking)
**Status**: Complete

## Summary of Changes

Issue-44 implements **agent-directed issue picking** — a fundamental shift in workflow control where agents explicitly select target issues instead of scripts autonomously picking the first available issue.

## Files Updated

### 1. CHANGELOG.md
**Status**: ✓ Updated
**Location**: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow.kw/issue-44/CHANGELOG.md`

**Change**: Added new "Added — Agent-Directed Issue Picking (issue #44)" entry under `## [Unreleased]` documenting:
- Explicit `--target-issue N` flag requirement in `cmdStartup` and `cmdPickNext`
- New typed refusals on auto-pick: `target_occupied`, `target_mismatch`, `user_target_blocked`, `user_target_red`, `target_unavailable`, `no_target`
- New `claimExplicitTarget()` helper function
- Startup Step 0 agent selection requirement in command files
- Skill parity updates for Codex
- Contract validator updates
- Integration test suite updates (Epic Cases 14A–14E, 8M, 14a, 14b, 15A, 17A)

### 2. README.md
**Status**: ✓ Updated (critical section)
**Location**: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow.kw/issue-44/README.md`

**Change**: Completely refactored the "### Startup Issue Priority Ranking" section (lines 377–399) to "### Agent-Directed Issue Selection" documenting:

**Old behavior** (auto-selection):
- "When `startup` selects the next issue..." (implied automation)
- Only documented priority ranking logic
- No agent responsibility mentioned

**New behavior** (explicit agent selection):
- Agents must inspect roadmap, classify candidates, and pass `KAOLA_TARGET_ISSUE=N`
- Startup validates the agent's choice (unclaimed, green/yellow)
- Scripts refuse with structured errors if no target provided
- Receipt `ranking` array helps agents make informed decisions
- Priority ranking information preserved but reframed as decision-support data for agents

### 3. CLAUDE.md
**Status**: ✓ Updated (project instructions)
**Location**: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow.kw/issue-44/CLAUDE.md`

**Changes**:

1. Added new "## Workflow Design Principles" section with subsection "### Agent Owns Reasoning; Scripts Own Atomicity (issue #44)" documenting the core principle
2. Updated "## Key Scripts" section to mention:
   - New subcommands: bootstrap, pick-next, resume, worktree-status, worktree-finalize
   - New `claimExplicitTarget()` helper for explicit-target validation

## Code Changes Verified

### scripts/kaola-workflow-claim.js
- ✓ Added `--target-issue N` flag parsing (line 158)
- ✓ Added `claimExplicitTarget()` helper (line 1284)
- ✓ Modified `cmdStartup()` to require target-issue (lines 1309–1424)
- ✓ Modified `cmdPickNext()` to require target-issue (lines 2342–2394)
- ✓ New typed refusals on validation failure
- ✓ Removed dead `runStartupClaimFirstAvailable` code

### commands/workflow-next.md
- ✓ Added "## Startup Step 0 - Agent Issue Selection (Required Before Startup)" section (line 45)
- ✓ Documentation of `KAOLA_TARGET_ISSUE` environment variable (line 62)
- ✓ `--target-issue` flag passed to both `pick-next` and `startup` (lines 78, 94)

### plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- ✓ Mirrored agent selection step for Codex parity

### scripts/validate-kaola-workflow-contracts.js
- ✓ Updated contract assertions for explicit-target behavior

### scripts/validate-workflow-contracts.js
- ✓ Updated contract assertions for explicit-target behavior

### scripts/simulate-workflow-walkthrough.js
- ✓ Updated test cases 14A/14B/14C/14D/14E, 8M, 14a, 14b, 15A, 17A
- ✓ Tests verify explicit-target claiming and refusal on auto-pick

## Architecture Documentation Changes

The fundamental architecture principle changed:
- **Before**: Startup auto-selected "first available" issue (implicit)
- **After**: Agents explicitly select target issue, startup validates (explicit)

This shift enforces the "Agent Owns Reasoning; Scripts Own Atomicity" contract documented in `CLAUDE.md`.

## Compliance Checklist

- [x] README.md updated to reflect new agent-directed behavior
- [x] CHANGELOG.md documents issue-44 changes
- [x] CLAUDE.md project instructions updated with workflow principles
- [x] Code examples verified to exist (commands/workflow-next.md, SKILL.md)
- [x] All file paths verified to exist
- [x] Contract validators updated
- [x] Integration tests updated
- [x] No dead references to auto-pick behavior remaining
- [x] Codex parity maintained in SKILL.md

## Notes for Future Maintainers

1. **Agent Responsibility**: Agents must now inspect roadmap + GitHub issues before calling `/workflow-next`. This is documented in Startup Step 0.

2. **Typed Refusals**: When agents don't provide `--target-issue`, startup emits structured JSON with `recovery` guidance rather than silent auto-pick.

3. **Explicit-Target Validation**: The `claimExplicitTarget()` helper centralizes target validation (unclaimed, green/yellow status, etc.) to prevent duplicate claim logic.

4. **Test Coverage**: Epic test cases 14A–14E, 8M, 14a, 14b, 15A, 17A verify the full explicit-target flow end-to-end.

5. **Codex Parity**: The Codex pack received identical updates in `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` to maintain feature parity.

## Documentation Quality Verification

- All file paths verified to exist
- Code examples match actual implementation
- Cross-references between docs are consistent
- Terminology aligned (target-issue, KAOLA_TARGET_ISSUE, explicit-target)
- No contradictions with implementation
- Links and references verified where applicable
