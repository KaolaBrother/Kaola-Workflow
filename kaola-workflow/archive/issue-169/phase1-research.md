# Phase 1 - Research / Discovery: issue-169

## Deliverable
1. `kaola-workflow-classifier.js`: Add `target_unverified` verdict — returned when `KAOLA_WORKFLOW_OFFLINE=1` and neither `.roadmap/issue-N.md` nor an active folder for the target exists.
2. `kaola-workflow-claim.js` `claimExplicitTarget()`: Map `target_unverified` → `{ status: 'target_unverified', claim: 'none' }`. Do not fall through to `claimProject()`.
3. `commands/workflow-next.md` Step 0b: Add extraction of `KAOLA_VERDICT` and `KAOLA_REASONING` from `STARTUP_OUT`. Add explicit target validation step before Step 0a-1.
4. `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`: Mirror the same verdict/reasoning extraction.
5. `kaola-workflow-classifier.js` CLI: Accept `--issue N` at top level (in addition to `classify --issue N`); print meaningful `--help` output.
6. `scripts/simulate-workflow-walkthrough.js`: Update `testClassifierOfflineBypassesFailClosed` (now expects `claim: 'none'` when no roadmap entry); add new test for valid offline roadmap target still acquires; add test for unverified verdict surfacing through wrapper.
7. Mirror all script changes from `scripts/` to `plugins/kaola-workflow/scripts/`.

## Why
A prior workflow-next session in a **downstream consumer project using Kaola-Workflow** targeted issue #317 (a target in that consumer project, not in `KaolaBrother/Kaola-Workflow`). The agent fabricated a fast-path rubric judgment and proceeded despite typed startup refusals, creating a fake active folder. Two root causes: (1) startup wrapper hides `verdict`/`reasoning` fields the contract says to act on, (2) offline classifier with no roadmap entry in the active project returns `green` instead of a distinct unverified verdict, so `claimExplicitTarget()` creates a real folder for a target whose existence was never proven.

The validation invariant is **consumer-repo context**: `/workflow-next` must validate the selected target against the repo where it is currently running (the cwd's git repo), not against the Kaola-Workflow package repo. Whether `#317` exists in `KaolaBrother/Kaola-Workflow` is irrelevant.

## Affected Area
| File | Change |
|------|--------|
| `scripts/kaola-workflow-classifier.js` | Add `target_unverified` verdict in offline path (line 334–351) |
| `scripts/kaola-workflow-claim.js` | Add `target_unverified` case in `claimExplicitTarget()` (lines 428–444) |
| `commands/workflow-next.md` | Step 0b snippet (lines 124–143): add 2 extraction lines |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Step 0b snippet (lines 113–120): same 2 lines |
| `scripts/simulate-workflow-walkthrough.js` | Update `testClassifierOfflineBypassesFailClosed`; add new tests |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | Byte-identical copy of classifier |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical copy of claim script |

## Key Patterns Found

1. **Verdict-to-status mapping in `claimExplicitTarget()`** (`scripts/kaola-workflow-claim.js:428–444`): Each blocked classifier verdict has its own explicit `if` branch returning `{ status: '...', claim: 'none', ... }`. New `target_unverified` follows this exact pattern.

2. **Offline classifier path** (`scripts/kaola-workflow-classifier.js:334–351`): `OFFLINE=1` guard reads `.roadmap/issue-N.md`; if the file is missing, falls through with empty labels/body → `classify()` returns `green`. Guard must be added before calling `classify()` to return `target_unverified` when the file is absent AND no active folder for the target exists.

3. **Step 0b extraction snippet** (`commands/workflow-next.md:136–138`): Three `node -e` one-liners extract `worktree_path`, `project`, `claim`. Two more lines follow the same pattern for `verdict` and `reasoning`. The subsequent prose routing section (lines 146–155) already references `verdict` and `reasoning` conceptually but no variables carry those values.

4. **SKILL.md uses `PICK_NEXT_PROJECT` not `KAOLA_PROJECT`** (`plugins/.../SKILL.md:117`): The variable name for project differs. New `KAOLA_VERDICT`/`KAOLA_REASONING` lines should be consistent with SKILL.md's existing naming style.

5. **Classifier CLI top-level dispatch** (`scripts/kaola-workflow-classifier.js:382–385`): `process.argv[2]` checked for subcommand; only `classify` recognized. To support `--issue N` at top level, check if `argv[2]` starts with `--` and route to `cmdClassify` with `process.argv.slice(2)`. For `--help`, add a `help` subcommand and a `--help` / `-h` flag check before the subcommand dispatch.

6. **Test pattern for classifier** (`scripts/simulate-workflow-walkthrough.js:2307–2363`): `testClassifierFailClosedOnRemoteError` (online, fail-closed) and `testClassifierOfflineBypassesFailClosed` (offline bypass) are a matched pair. A third test `testClassifierOfflineUnverifiedTarget` should follow this structure: `KAOLA_WORKFLOW_OFFLINE=1`, no roadmap entry planted, no active folder — assert `claim: 'none'`, no folder created, `verdict: 'target_unverified'`. A fourth `testClassifierOfflineVerifiedTarget` proves valid roadmap entry still acquires.

7. **Active folder detection for offline unverified guard** (`scripts/kaola-workflow-classifier.js` uses `activeFolders`): `activeFolders` is already computed before the offline path; can use it to check if `issue-N` is already active — if so, skip the unverified guard (already owned).

8. **Consumer-repo context is already wired correctly in scripts** (`scripts/kaola-workflow-classifier.js:29–33, 45–53`): `ghExec()` calls `gh args` with no `--repo` flag → uses cwd's `gh` context. `getRoot()` uses `git rev-parse --show-toplevel` → returns the cwd's git root. `.roadmap/issue-N.md` is read under `getRoot()/kaola-workflow/.roadmap/`. No script change needed for consumer-repo context; the docs and tests must make this explicit. Existing test shim `writeGhShimForStartup` (line 449) already returns `{"owner":{"login":"test"},"name":"repo"}` — non-Kaola fixture data modeling a downstream project.

## Test Patterns
- Framework: hand-rolled assert (`assert()`), no external framework
- Location: `scripts/simulate-workflow-walkthrough.js` (3000+ lines)
- Structure: each test is a named function `testXxx()`, registered in the test runner at ~line 3400–3457. Tests call `runNode()` (sets `KAOLA_WORKFLOW_OFFLINE=1`) or `spawnSync` directly. Temp dirs via `fs.mkdtempSync`. Cleanup via `fs.rmSync(tmp, { recursive: true, force: true })` in `finally`.
- Run command: `node scripts/simulate-workflow-walkthrough.js` (must exit 0 with "Workflow walkthrough simulation passed")

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — enables offline mode in classifier and startup scripts
- `KAOLA_TARGET_ISSUE` — issue number passed to startup
- No new env vars needed for this change

## External Docs
None — all changes are to internal Node.js scripts using only built-in modules (fs, path, child_process, assert).

## GitHub Issue
KaolaBrother/Kaola-Workflow#169

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient, no external deps |

## Notes / Future Considerations
- `target_mismatch` appears in workflow-next.md/SKILL.md prose but does NOT exist in JS — not in scope for this issue.
- `target_occupied` is returned by `claimProject` on EEXIST but is not handled in `claimExplicitTarget()` — not in scope for this issue.
- Legacy `.sessions/*.json` cleanup is explicitly de-scoped per issue body: "either omitted or implemented as legacy-state audit that does not make those folders durable workflow state again."
- `cmdStartup` in `kaola-workflow-claim.js` (line ~463–469) emits `verdict` in its JSON output already; only the wrapper shell extraction is missing for `verdict` and `reasoning` fields.
