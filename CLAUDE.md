# Kaola-Workflow — Claude Code Instructions

## Project Overview
Kaola-Workflow is a 6-phase multi-session workflow system built on top of GitHub issues and Claude Code. The core scripts live in `scripts/`. Workflow state is tracked per-project under `kaola-workflow/{project}/`.

## Workflow Design Principles

### Agent Owns Reasoning; Scripts Own Atomicity (issue #44)

Issue selection is an agent decision, not a hidden script decision.

- **When user names an issue**: use that exact issue. Scripts validate and claim but must not fall back to another.
- **When user asks for "next issue"**: agent inspects local roadmap, GitHub issues, recent completed work, active locks, and user goal, then states the selected issue before claiming via `KAOLA_TARGET_ISSUE=N`.
- **Startup scripts validate, not select**: `cmdStartup` and `cmdPickNext` now require explicit `--target-issue N` flag. They validate the target is unclaimed and green/yellow, then claim. They refuse auto-pick with typed refusals.
- **Ambiguity handling**: When next issue is ambiguous or conflicts with active state, ask or stop. Do not let a script silently choose.

## Key Scripts
- `scripts/kaola-workflow-claim.js` — claim, release, heartbeat, sweep, status, patch-branch, watch-pr, bootstrap, pick-next, resume, worktree-status, worktree-finalize subcommands; explicit-target validation via `claimExplicitTarget()` helper
- `scripts/simulate-workflow-walkthrough.js` — integration test suite (hand-rolled assert, no framework)
- `scripts/kaola-workflow-roadmap.js` — roadmap generation from GitHub issues

## Running Tests
```bash
node scripts/simulate-workflow-walkthrough.js
```
Must exit 0 with "Workflow walkthrough simulation passed".

## Documentation Update Checklist

- [ ] README.md - update feature list, usage examples, env vars
- [ ] API docs - add/update endpoint descriptions and examples
- [ ] CHANGELOG.md - add entry under [Unreleased]
- [ ] Architecture docs - update if structure changed
- [ ] .env.example - add any new environment variables
- [ ] Inline comments - update where public interfaces changed
