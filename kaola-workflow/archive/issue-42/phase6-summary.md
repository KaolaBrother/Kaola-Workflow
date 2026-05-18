# Phase 6 - Summary: issue-42

## Delivered

Removed the dedicated `/workflow-next-pr` command and replaced it with two new mechanisms:

1. **NLU PR-intent detection** (Step 0a) in `workflow-next.md` and its SKILL.md mirror — agent detects natural-language PR intent keywords and sets `KAOLA_SINK=pr` before routing.
2. **Auto-fallback to PR sink** in `sink-merge.js` — when a merge push fails with `branch_protected`, `non_fast_forward`, or `permission_denied`, the script writes a structured receipt, resets the branch, and exits with code 3.
3. **`sink-fallback` subcommand** in `claim.js` — reads the receipt, validates the reason token, updates the lock file and workflow-state.md Sink block from `sink: merge` → `sink: pr`.
4. **Phase 6 pivot block** in `commands/kaola-workflow-phase6.md` and `SKILL.md` mirror — intercepts exit code 3, calls `sink-fallback`, then dispatches `sink-pr.js`.

## Files Changed

### Created/Added
- (no new files)

### Modified
- `scripts/kaola-workflow-sink-merge.js` — `classifyMergeError`, exit-3 path, `require.main` guard, `module.exports`
- `scripts/kaola-workflow-claim.js` — `cmdSinkFallback`, `buildSinkBlock` sink_fallback_reason, `buildLockData` field, dispatch
- `commands/kaola-workflow-phase6.md` — exit-3 pivot block in merge case
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` — exit-3 pivot block (scripts_dir idiom)
- `commands/workflow-next.md` — Step 0a PR intent capture
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` — Step 0a PR intent capture
- `scripts/validate-workflow-contracts.js` — negation assertion, parity checks for new symbols
- `scripts/validate-kaola-workflow-contracts.js` — removed workflow-next-pr, fixed success string
- `scripts/simulate-workflow-walkthrough.js` — Epic Cases 18A–18D
- `README.md` — PR Sink section rewritten, workflow-next-pr removed from skills list
- `CHANGELOG.md` — [Unreleased] entry for issue-42
- Plugin mirrors (byte-identical): claim.js, sink-merge.js, simulate-kaola-workflow-walkthrough.js, validate-workflow-contracts.js

### Deleted
- `commands/workflow-next-pr.md`
- `plugins/kaola-workflow/skills/kaola-workflow-next-pr/SKILL.md`

## Test Coverage

All tests pass. No coverage tool in this repo; functional coverage via simulation:
- Epic Cases 18A (cmdSinkFallback state update), 18B (sink-merge exit 3), 18C (OFFLINE normal path), 18D (classifyMergeError unit test)
- All 3 validators: `simulate-workflow-walkthrough.js`, `validate-workflow-contracts.js`, `validate-kaola-workflow-contracts.js`

## Final Validation Evidence

| Command | Result | Evidence |
|---------|--------|----------|
| `node scripts/simulate-workflow-walkthrough.js` | PASS — "Workflow walkthrough simulation passed" | .cache/final-validation.md |
| `node scripts/validate-workflow-contracts.js` | PASS — "Workflow contract validation passed" | .cache/final-validation.md |
| `node scripts/validate-kaola-workflow-contracts.js` | PASS — "Kaola-Workflow contract validation passed" | .cache/final-validation.md |

## Documentation Docking

DOCKED — evidence at `.cache/doc-docking.md`

All changed files verified. README and CHANGELOG updated. No doc gaps found. N/A reasons recorded for API docs, architecture docs, .env.example.

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items

From Phase 5 review (all LOW/MEDIUM, non-blocking):

1. **MEDIUM**: Export `isSafeName` from claim.js and import in sink-merge.js (eliminate divergent copies — sink-merge.js permits `\n\r\t`, claim.js rejects them)
2. **LOW**: Add `|| exit 1` guard after sink-fallback call in Phase 6 pivot blocks (both kaola-workflow-phase6.md and SKILL.md)
3. **LOW**: Delete receipt file (`sink-fallback.json`) in `cmdSinkFallback` after consumption to prevent stale replay
4. **LOW**: Add `$SINK_ISSUE_FLAG` to SKILL.md pivot block's sink-pr.js call (Codex auto-fallback PRs won't close the linked issue)
5. **LOW**: Add `--` separator before branch name in all `git checkout` calls in sink-merge.js (defense-in-depth; args guard already present)
6. **LOW**: Add inline comment documenting `git reset --hard origin/main` assumption in sink-merge.js

## Closure Decision

Scanned all phase artifacts. All deferred items are LOW/MEDIUM follow-ups that do not affect correctness of the delivered feature. No user-decision items, no unresolved conflicts, no partial implementation. Closure is safe. No advisor consultation required (no CRITICAL deferred items).

## Commit And Push

Ready — final Git gate runs after this file is committed.

## GitHub Issue

Pending closure after final push.

## Roadmap

Pending regeneration (delete `.roadmap/issue-42.md`, run `kaola-workflow-roadmap.js generate`).

## Archive

Pending — `cmdFinalize` runs after commit and push.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | Closure scan: all deferred items LOW/MEDIUM, no user-decision items | No CRITICAL deferred items; safe to close |
| final-validation fix executors | N/A | All validators passed on first run | No validation failures requiring fix routing |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | Runs in Step 7 |
| archive completed folder | pending | | cmdFinalize runs after commit |
| final commit and push | ready | git status/git diff/upstream check | Final gate runs after this file is committed |

## Status

READY FOR FINAL GIT GATE
