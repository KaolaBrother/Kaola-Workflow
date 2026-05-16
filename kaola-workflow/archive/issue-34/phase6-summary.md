# Phase 6 - Summary: issue-34

## Delivered

Three bugs in the Phase 6 finalize path fixed:

1. **Bug 1 — Non-atomic archive**: Added `archiveProjectDir(root, project, statusValue)` helper and `cmdFinalize` subcommand to `kaola-workflow-claim.js`. `cmdFinalize` atomically writes `status: closed` + `step: complete` to `workflow-state.md`, then renames `kaola-workflow/{project}/` → `kaola-workflow/archive/{project}/` via `fs.renameSync`. Phase 6 now invokes this in Step 8b (linked worktree context, between Step 8a artifact mirror and Step 8 git commit).

2. **Bug 2 — Missing status:closed**: `cmdFinalize` writes `status: closed` before the rename, ensuring the archived dir always records closure. Append guards added for missing `status:` and `step:` fields.

3. **Bug 3 — No GC for crashed claims**: `cmdSweep` second pass GC added — scans `kaola-workflow/` dirs, archives to `abandoned` status any dir that is `status:active`, has no lock file, has an expired heartbeat (>30 min), and has no `phase*.md` artifacts (phase-artifacts-empty guard prevents GC of interrupted in-flight work).

## Files Changed

- `scripts/kaola-workflow-claim.js` — `archiveProjectDir`, `cmdFinalize`, sweep second pass, dispatcher, module.exports
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — mirror (without `enforcePlatformSessionOrExit`)
- `commands/kaola-workflow-phase6.md` — archive prose replaced; Step 8b `cmdFinalize` section added
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` — mirror Step 8b
- `scripts/simulate-workflow-walkthrough.js` — Tests 34-A (cmdFinalize), 34-B (sweep GC), 34-C (structural docs)
- `CHANGELOG.md` — [Unreleased] entry for all three bug fixes
- `README.md` — `finalize` subcommand added to table; sweep GC description enhanced

## Test Coverage

Tests added in `scripts/simulate-workflow-walkthrough.js`:
- **34-A**: cmdFinalize archives atomically, writes status:closed, idempotent on missing source, rejects wrong session, lock file survives finalize
- **34-B**: sweep GC archives expired orphan (no lock, expired, no phase artifacts), leaves live (not expired) and in-flight (has phase*.md) alone
- **34-C**: structural — both phase6.md and SKILL.md contain `finalize --project` invocation and Step 8b appears before Step 8 git commit section

Coverage: hand-rolled assert suite, no framework. `node scripts/simulate-workflow-walkthrough.js` exits 0.

## Final Validation Evidence

| Command | Result | Evidence |
|---------|--------|----------|
| `node scripts/simulate-workflow-walkthrough.js` | PASS | .cache/final-validation.md |
| `node --check scripts/kaola-workflow-claim.js` | PASS | .cache/final-validation.md |
| `node --check plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | PASS | .cache/final-validation.md |

## Documentation Docking

DOCKED — `.cache/doc-docking.md`

All public behavior documented: `finalize` subcommand in README + CHANGELOG; sweep GC in README + CHANGELOG; Phase 6 step 8b in phase6.md and SKILL.md. No gaps found.

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items

From Phase 5 (non-blocking):
- Test 34-B: add locked-proj fixture to cover lock-presence guard in sweep GC
- Sweep GC: add stderr on archive error (consistency with other sweep error paths)
- Archive collision suffix: add randomness or counter for same-millisecond safety
- Plugin cmdFinalize: add comment noting intentional `enforcePlatformSessionOrExit` omission
- Security L1: consider post-rename state write ordering (future hardening)

Closure scan: no blocking deferred items. All items above are MEDIUM/LOW non-blocking follow-ups. No user decisions required.

## Closure Decision

Advisor-guided: Design A (linked-worktree cmdFinalize between Step 8a and Step 8) confirmed by advisor in `.cache/advisor-plan.md`. No user decision items found. Closure scan clean.

## Commit And Push

Pending final Git gate — final hash reported after push.

## GitHub Issue

CLOSED — issue #34 closed with validation evidence comment (https://github.com/KaolaBrother/Kaola-Workflow/issues/34#issuecomment-4467393953).

## Roadmap

UPDATED — `kaola-workflow/.roadmap/issue-34.md` deleted; `ROADMAP.md` regenerated (only issue-35 remains).

## Archive

Pending — Step 8b `cmdFinalize` runs in linked worktree and performs archive atomically as part of Step 8 commit.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan clean — no deferred/conflict/user-decision items | |
| final-validation fix executors | N/A | final validation passed on first run | |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | Step 8b cmdFinalize | |
| final commit and push | ready | git status/git diff/upstream check — final gate runs after this file is committed | |

## Status
READY FOR FINAL GIT GATE
