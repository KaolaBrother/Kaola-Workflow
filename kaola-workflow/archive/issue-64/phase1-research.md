# Phase 1 — Research / Discovery: issue-64

## Deliverable

A shared helper `readActiveFolders(root, opts)` (or equivalent module) that
enumerates safe `kaola-workflow/{project}/` folders for use by both:

1. `scripts/kaola-workflow-classifier.js` — overlap checks (currently reads `.locks/`).
2. Startup/resume folder selection in `scripts/kaola-workflow-claim.js`.

The helper must filter:

- Include only directories containing `workflow-state.md`.
- Exclude `archive/`, hidden/system dirs (any `entry.name.startsWith('.')`).
- Exclude `status: released` and `status: closed` (and `abandoned`).
- Exclude folders whose linked GitHub issue is CLOSED (online only).

After landing this helper:

- `scripts/kaola-workflow-classifier.js` must no longer read `.locks/` or call
  `readLockFiles`.
- Classifier overlap math (`scanClaimedOverlap` at lines 242-294) keeps the
  same `extractFilePaths` / `extractCoarseAreas` / `parseAreaLabelsFromText`
  semantics; only the enumerator changes.
- Startup routing must not resume or select closed-issue residue folders.
- Lock files in `.locks/` without a corresponding active folder are ignored
  for overlap (and silently for startup).

Locks/sessions/tickers themselves are NOT removed in this phase (that is #63
Phase β). The lock substrate continues to back claim and lease enforcement.

## Why

Today, overlap and folder-selection rely on `.locks/*.lock` files which can
drift from the on-disk workflow folders — a closed GitHub issue whose folder
still says `status: active` (e.g. issue 56 residue on this branch) keeps
producing false overlap or false resume targets. Folders + GH state are the
canonical source; the lock substrate is an internal mutex, not the truth of
active work.

This unblocks #63's deeper architecture shift toward two-source state (folders
+ GitHub) without removing the lock layer in one big step.

## Affected Area

- `scripts/kaola-workflow-classifier.js` — replace `readLockFiles` enumeration
  in `cmdClassify` with the new shared helper; delete the local copy after
  callers migrate.
- `scripts/kaola-workflow-claim.js` — adopt the same helper for startup /
  resume / pick-next folder selection (where it currently relies on `.locks/`
  to detect already-claimed work). Expose `isIssueClosed` (or move it into the
  helper) so the helper can consult GH state.
- `scripts/simulate-workflow-walkthrough.js` — update Epic Case 6 (and
  related) overlap scenarios to plant folders instead of lock files; add
  scenarios for closed-issue residue and lock-without-folder.
- No removal of `.locks/`, sessions, tickers, or heartbeat in this phase.

## Key Patterns Found

1. **Classifier overlap is already folder-based after `lock.project` resolution.**
   `scripts/kaola-workflow-classifier.js:242-294` (`scanClaimedOverlap`) uses
   only `lock.project` from the lock; all file/area data is read from
   `kaola-workflow/{project}/phase3-plan.md` and `phase1-research.md`. The
   change is purely about which enumerator produces the project list.

2. **Two duplicate readers exist today.**
   - `readLockFiles` at `scripts/kaola-workflow-classifier.js:87-99` and
     `scripts/kaola-workflow-claim.js:310-324`.
   - `readActiveStateIssueNumbers` at `scripts/kaola-workflow-classifier.js:101-116`
     and `scripts/kaola-workflow-claim.js:427-442`.
   Classifier comment at line 11 acknowledges the duplication. The new helper
   collapses both pairs into one shared API.

3. **`isIssueClosed` already encapsulates the GH closed-state check.**
   `scripts/kaola-workflow-claim.js:2120-2128` — `isIssueClosed(issueNumber)`
   returns `false` when offline or on any error. Not yet in `module.exports`
   (lines 2888-2893); needs to be exported (or moved into the helper module).

4. **Common project-folder iteration pattern (used in claim.js):**
   - `activeStateSessions()` — `scripts/kaola-workflow-claim.js:358-376`
   - `activeStateProjects()` — `scripts/kaola-workflow-claim.js:378-401`
   - `activeStateIssueNumbers()` — `scripts/kaola-workflow-claim.js:427-442`
   - All exclude `archive` and `entry.name.startsWith('.')`.

5. **Status values seen in the repo:** `active`, `released`, `closed`,
   `abandoned`. Only `closed`/`abandoned` move to `archive/` via
   `archiveProjectDir`; `released` stays in `kaola-workflow/` with status
   changed in-place by `releaseSession()` at `scripts/kaola-workflow-claim.js:1894`.
   So released folders must be excluded by status value, not by location.

6. **No `scripts/lib/` precedent.** All scripts are top-level standalone files.
   Either add a new standalone `scripts/kaola-workflow-active-folders.js` module
   `require()`'d by both, or expose helpers via `module.exports` on
   `scripts/kaola-workflow-claim.js`.

## Test Patterns

- Framework: hand-rolled `assert(condition, message)` in
  `scripts/simulate-workflow-walkthrough.js:27`. No external test runner.
- Location: a single 6526-line integration simulator at
  `scripts/simulate-workflow-walkthrough.js`. Run: `node scripts/simulate-workflow-walkthrough.js`.
  Must print `Workflow walkthrough simulation passed` and exit 0.
- Structure: per-scenario blocks inside `async function main()`. Each scenario
  creates a `fs.mkdtempSync` temp dir, plants fixture files (lock files and/or
  workflow-state.md folders), runs the target command, and asserts on exit
  code + stdout/stderr.
- `gh` is shimmed via a shell script written to a temp `bin/gh` injected
  through `PATH`. Closed/open state is controlled via the shim's stdout.
- Template for active-folder fixture: Epic 6F2 at lines 1061-1089 — write
  `workflow-state.md` directly with `## Project / status: active` and a
  `## Sink` block carrying `issue_number`. New scenarios for this phase append
  to or parallel Epic Case 6 starting at line 892.

## Config & Env

- `KAOLA_WORKFLOW_OFFLINE` — `=1` short-circuits `ghExec()` and `isIssueClosed()`.
  The new helper must skip the closed-issue filter when this is set (treat
  unknown == not closed, as `isIssueClosed` already does).
- `KAOLA_COORD_ROOT` — overrides coord root path. The new helper must honor
  the same dual-root scan pattern (`{coordRoot}/kaola-workflow/` and
  `{root}/kaola-workflow/`) currently used by `readLockFiles` and the existing
  active-state scanners.
- No new env var needed for this slice.

## External Docs

N/A — internal patterns sufficient. See `.cache/docs-lookup.md`.

## GitHub Issue

`KaolaBrother/Kaola-Workflow#64`

## Completeness Score

10/10

- Goal clarity: 3/3 — acceptance criteria explicit in the issue body.
- Expected outcome: 3/3 — observable behaviors enumerated (no `.locks/` in
  classifier, closed-issue residue ignored, lock-without-folder ignored,
  simulator updated).
- Scope boundaries: 2/2 — non-goals explicitly exclude lock/session/ticker
  removal and GitLab work.
- Constraints: 2/2 — must keep existing overlap semantics, offline behavior,
  and full test suite green.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | Internal helper consuming existing in-repo APIs; no external library/framework/API behavior introduced. |

## Notes / Future Considerations

- This is #63's Phase α. Phase β removes locks/sessions/tickers/heartbeat —
  out of scope here.
- Consider whether `isIssueClosed` should grow a tiny in-process memoization
  to avoid N round-trips when classifier scans many active folders. Deferred:
  current call sites are O(small) and the helper can add it later without
  changing the API.
- `status: released` folders are not archived — sweep behavior for those
  folders is unchanged; the new reader simply filters them out for overlap
  and resume.
