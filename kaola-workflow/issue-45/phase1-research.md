# Phase 1 - Research / Discovery: issue-45

## Deliverable
Fix 4 stale-state/routing flaws and 3 lifecycle gaps in `scripts/kaola-workflow-claim.js` and `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` (and its Codex mirror `kaola-workflow-next/SKILL.md`). All post-#40 correctness holes that cause closed issues to appear active, resume to advance past incomplete work, `KAOLA_WORKTREE_PATH` to never be populated, finalize sink dispatch to fail, and orphan dirs to accumulate.

## Why
Stale locks for closed issues pass `consistent: true`, `workflow:in-progress` labels survive closed issues, `resume` can silently advance to Phase 5 when Phase 4 is still in-progress, Codex phase skills silently `cd` to nowhere, and finalize can silently swallow the sink branch. Orphan `*.kw/` parent dirs and `.abandoned-*` dirs accumulate on disk with no operator visibility or cleanup.

## Affected Area

| Component | File | Functions |
|-----------|------|-----------|
| Closed-issue status | `scripts/kaola-workflow-claim.js` | `cmdStatus` (~2151–2193), `cmdWorktreeStatus` (~2548–2588) |
| Resume routing | `scripts/kaola-workflow-claim.js` | `scanPhaseArtifacts` (~2475–2507) |
| Startup receipt | `scripts/kaola-workflow-claim.js` | `cmdStartup` (~1378–1461) |
| Sweep GC | `scripts/kaola-workflow-claim.js` | `cmdSweep` (~2075–2148) |
| Worktree removal | `scripts/kaola-workflow-claim.js` | `removeWorktree` (~624–680) |
| Finalize sink dispatch | `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Steps 8b → sink dispatch (lines ~171–219) |
| Worktree path export | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Startup block (lines ~56–83) |
| Tests | `scripts/simulate-workflow-walkthrough.js` | Epic 17 (line ~4855), new 17O+ |

## Key Patterns Found

1. **`cmdWatchPr` closed-issue cleanup** (`claim.js:2273–2281`): when `state === 'CLOSED'`, calls `removeWorktree(...)` + `releaseSession(..., 'aborted')`. Mirror this for `cmdStatus` drift detection and `cmdWorktreeStatus` annotation.

2. **`scanPhaseArtifacts` path 2** (`claim.js:2493–2506`): `PHASE_ARTIFACTS.find(e => fs.existsSync(...))` maps `phase4-progress.md` → phase5 unconditionally. Must parse task rows for `pending`/`in_progress` before advancing.

3. **`kaola-workflow-repair-state.js` pattern** (tested at `simulate-workflow-walkthrough.js:268–296`): correctly reads phase4-progress.md rows and routes to phase4 when any row is non-complete. Exact same logic needed in `scanPhaseArtifacts` path 2.

4. **`PICK_NEXT_VERDICT` / `PICK_NEXT_PROJECT` extraction** (`kaola-workflow-next/SKILL.md:58–59`): use same pattern to extract `worktree_path` from startup/pick-next output and export as `KAOLA_WORKTREE_PATH`.

5. **`archiveProjectDir` rename** (`claim.js:1860–1886`): line 1884 `fs.renameSync(srcDir, destDir)` — after this call, `kaola-workflow/{project}/workflow-state.md` is gone. `finalize/SKILL.md` reads sink metadata from this path AFTER the rename.

6. **`removeWorktree` parent cleanup** (`claim.js:624–680`): `worktreePathFor` returns child path; parent is `path.dirname(wtPath)`. After `git worktree remove` at line 658, attempt `fs.rmdirSync(path.dirname(wtPath))` with catch — `ENOTEMPTY` guards against removing a non-empty parent.

7. **`cmdSweep` GC_CUTOFF_MS** (`claim.js:2124`): 30-min constant already defined. `.abandoned-*` dirs should be GC'd in a third pass using `fs.statSync(dir).mtimeMs` for age check.

## Test Patterns

- Framework: hand-rolled `assert(condition, message)` at `simulate-workflow-walkthrough.js:27`
- Location: `scripts/simulate-workflow-walkthrough.js` (primary), `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (plugin mirror)
- New tests: Epic 17O (closed-issue status drift), 17P (resume phase4 pending rows), 17Q (empty parent cleanup), 17R (abandoned GC), 17S (unregistered dir detection)
- Pattern for resume test: write `phase4-progress.md` with `in_progress` row → call `resume` → assert `next_command` contains `phase4`
- Pattern for sweep test: mirror Epic 9C1/9C2 for GC

## Config & Env

- `KAOLA_WORKTREE_PATH`: env var consumed by all 6 phase skills; must be exported by `kaola-workflow-next/SKILL.md`
- `GC_CUTOFF_MS`: 30 minutes (line ~2124 in claim.js)
- `coordRoot`: `~/.claude/kaola-workflow/` — stores locks, sessions, tickers
- `worktreePathFor(root, project)` → `{root.parent}/{root.basename}.kw/issue-N`

## External Docs

docs-lookup: N/A — all internal patterns sufficient; no external library or API changes needed.

## GitHub Issue

KaolaBrother/Kaola-Workflow#45

## Completeness Score

9/10

- Goal clarity: 3/3
- Expected outcome: 3/3
- Scope boundaries: 2/2
- Constraints: 1/2 (constraint: Flaw 3 fix in cmdStartup must NOT break any of the Epic 14 target-issue tests; the `writeStartupReceipt` call used by target_mismatch path must remain no-write — existing behavior preserved)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | all fixes are internal to claim.js and SKILL.md | no external API/library behavior needed |

## Notes / Future Considerations

- Flaw 3: `cmdStartup` adds `worktree_path` to the receipt. The `target_mismatch` path must remain NO-WRITE (issue-44 HIGH fix). Only the `owned` and `acquired` paths should add `worktree_path`.
- Gap B: grace period for abandoned GC is 30min (GC_CUTOFF_MS). Consider making it configurable later (out of scope here).
- Labels/assignee cleanup for closed issues: `cmdSweep` already handles labels for stale locks. The Flaw 1 fix adds a `drift` annotation to `cmdStatus` only — it does not auto-remediate. Full sweep-triggered remediation is out of scope for this issue.
- Issue #47 (auto-pick bootstrap): separate issue; do not conflate.
