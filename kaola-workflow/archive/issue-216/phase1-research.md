# Phase 1 - Research / Discovery: issue-216

## Deliverable
Add a `runDirectMerge`-style early-exit archive check to root/Codex `sink-merge` main flow (before any git operation), plus a defense-in-depth guard inside `postMergeCleanup` (before the `fs.mkdirSync` call), and a root walkthrough regression test (`testFallbackGuardsAfterArchive`) that uses a real git repo with a committed archive to exercise the `git reset --hard` wipe-then-resurrect path.

## Why
When sink-merge hits a classified merge-impossible push error after the project was already archived and the archive committed to a feature branch, `postMergeCleanup` unconditionally runs `fs.mkdirSync(kaola-workflow/{project}/.cache, {recursive:true})` which resurrects the archived project's live dir. This defeats `cmdSinkFallback`'s archive guard (claim.js:981), leaves a phantom active folder (status `unknown`, issue_number `null`), and creates a 0-byte `workflow-state.md`. The GitLab/Gitea ports carry two-layer protection (issue #108, commit `98bdec1`) that was never back-ported to root/Codex.

## Affected Area
- `scripts/kaola-workflow-sink-merge.js` (root): `postMergeCleanup` lines 197–231, specifically `fs.mkdirSync` at line 220; no `runDirectMerge` wrapper
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` (Codex): byte-synced copy, identical gap
- `scripts/kaola-workflow-claim.js:976–990` (`cmdSinkFallback` guard — context, not modified)
- `scripts/simulate-workflow-walkthrough.js` (root test suite): add regression test
- Reference (do not modify): `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js:239–328`, gitea equivalent

## Key Patterns Found

1. **`runDirectMerge` early-exit (Layer 1 — operative fix)**: GitLab sink-merge lines 320–328 — checks `!fs.existsSync(liveDir) && fs.existsSync(archiveDir)` BEFORE any git op; exits 3 with stderr. Root has no such wrapper. This must be the primary fix because `git reset --hard origin/main` wipes the archive before `postMergeCleanup` can see it.
   - Reference: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js:320-328`

2. **`postMergeCleanup` defense-in-depth guard (Layer 2 — non-operative alone)**: GitLab sink-merge lines 241–246 — same `!exists(live) && exists(archive)` check after reset, before `fs.mkdirSync`. In real-git flow the reset already wiped the archive so this guard is always false; it's defense-in-depth only. Still worth porting for belt-and-suspenders.
   - Reference: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js:241-246`

3. **`git reset --hard origin/main` wipes the committed archive**: The realistic flow is: feature branch commits archive move → FF-merge to local `main` → push fails → `git reset --hard origin/main` resets local `main` to pre-archive commit → `kaola-workflow/archive/{project}/` removed from disk. After reset: `exists(archive)` → false. The forge guard fires based on pre-reset state; root must fire BEFORE the reset.
   - Location: root `postMergeCleanup` line 214

4. **`testFallbackGuardsAfterArchive` forge test is OFFLINE + no-git — does not cover reset path**: The test uses `fs.renameSync` (not git commit) + `OFFLINE: '1'` → hits the early-exit before reset runs. Root regression must use `initGitRepoWithBareRemote` + committed archive + `OFFLINE: '0'` to exercise the reset interaction.
   - Reference: `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js:24-82`

5. **Archive-aware guard pattern**: `!fs.existsSync(liveDir) && fs.existsSync(archiveDir)` — AND logic (both conditions required). The weaker live-only check in `cmdSinkFallback` (claim.js:981) is bypassed by the mkdir. The AND form is the correct pattern.

## Test Patterns
- Framework: hand-rolled assert (no test framework) in `scripts/simulate-workflow-walkthrough.js`
- Location: `scripts/simulate-workflow-walkthrough.js`, new test function near `testSinkFallbackSkipsArchivedProject` (line 1138) or `testSinkMergeMockabilityAndReceipt` (line 3487)
- Structure: `initGitRepoWithBareRemote(tmp)` → feature branch with committed archive move → FF-merge to local `main` → run sink-merge with `FORCE_MERGE_IMPOSSIBLE=branch_protected` + `OFFLINE=0` → assert exit 3, `!exists(liveDir)`, no `sink-fallback.json`

## Config & Env
- `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE`: env var to inject a synthetic merge error token (used in tests)
- `KAOLA_WORKFLOW_OFFLINE`: `'1'` bypasses git push; test must use `'0'` to exercise real reset
- No feature flags or config files involved

## External Docs
N/A — all patterns are internal to the kaola-workflow codebase

## GitHub Issue
KaolaBrother/kaola-workflow#216

## Completeness Score
10/10 — goal, root cause, operative fix approach, both file targets, test structure, and constraints are all fully established

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | internal patterns only | no external library or API behavior needed |

## Notes / Future Considerations
- `finalValidationPassed` gate (present in GitLab/Gitea `runDirectMerge` line 308, absent from root) is a separate gap out of scope for this issue
- The forge `testFallbackGuardsAfterArchive` test structure (OFFLINE + `fs.renameSync`) does not expose the root gap; do not reuse it verbatim for the root test
- Codex must receive an identical fix to root (byte-sync discipline)
