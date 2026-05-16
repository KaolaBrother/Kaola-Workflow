# Phase 2 - Ideation: issue-34

## Approaches Evaluated

### Option A: New `finalize` Subcommand in `kaola-workflow-claim.js` (SELECTED)

- Summary: Add `cmdFinalize()` to claim.js and its plugin copy. Called from the linked worktree context (between Step 8a mirror and Step 8 git add). Writes `status: closed` + renames project dir to `archive/` atomically. Phase 6 prose replaced with one runnable shell line.
- Pros: Single source of truth for ordering; unit-testable in existing harness; follows established subcommand pattern (`cmdRelease`, `cmdSweep`); uses `fs.renameSync` already proven at claim.js:665; idempotent re-entry
- Cons: ~80 lines added to each of two claim.js copies; caller still needs to `git add` the renamed paths
- Risk: Low — ordering constraint (run after 8a) is the only load-bearing rule, documented in the prompt
- Complexity: Small

### Option B: Inline Bash in phase6.md + SKILL.md

- Summary: Replace prose archive block with `sed -i` + `git mv` in both prompt files
- Pros: No claim.js changes
- Cons: BSD/GNU `sed -i` flag incompatibility; logic duplicated across 2 files guaranteed to drift; `git mv` in main worktree does NOT transfer index entries through `cp -R` Step 8a mirror — staged rename is lost before the Step 8 commit
- Risk: HIGH — cross-worktree `git mv` semantics actively break this approach
- Complexity: Small but dangerous

### Option C: Helper Module + Sink-Script Post-Commit Amend

- Summary: New `kaola-workflow-finalize.js` + sink scripts verify and amend post-merge if `status: closed` is missing
- Pros: Belt-and-suspenders
- Cons: New file for one function; sink amend changes commit hash after it was recorded in the GitHub issue comment — known anti-pattern in this codebase; triples ordering surface area
- Risk: Medium-High
- Complexity: Medium

## Advisor Findings

Two load-bearing items identified and resolved before selection:

1. **Cross-worktree ordering (CRITICAL):** `cmdFinalize` cannot rename the project dir at Step 7 time because Step 8a's `cp -R "kaola-workflow/{project}/." "$ACTIVE_WORKTREE_PATH/..."` needs the source to exist. Correct invocation site: AFTER Step 8a, BEFORE Step 8 `git add`, running with CWD = linked worktree. The subcommand operates on `CWD/kaola-workflow/{project}` — writes `status: closed` there, then renames to `CWD/kaola-workflow/archive/{project}`. Git detects the rename at `git add` time.

2. **Plugin claim.js is a separate file (confirmed):** `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (69530 bytes) differs from `scripts/kaola-workflow-claim.js` (77272 bytes). Both must receive `cmdFinalize` and the `cmdSweep` second pass.

3. **GC eligibility guard:** Sweep second pass must require BOTH missing/expired `expires:` AND stale mtime — `expires:` alone insufficient (protects corrupted-but-live state files).

## Selected Approach

**Approach A** — `cmdFinalize` subcommand, called from linked worktree context (between Step 8a and Step 8).

Rationale: Only approach that (1) preserves Step 8a's `cp -R` source, (2) puts status-write and archive-rename in the same git commit, (3) is unit-testable, (4) uses proven `fs.renameSync` pattern, (5) avoids duplicating logic across prompt files.

### Implementation plan

**Files changed:**
1. `scripts/kaola-workflow-claim.js` — add `cmdFinalize()`, extend `cmdSweep()` second pass, extract `archiveProjectDir()` helper
2. `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — mirror the same changes
3. `commands/kaola-workflow-phase6.md` — replace prose archive block (lines 453-459) with `node "$CLAIM_JS" finalize ...` placed between Step 8a and Step 8
4. `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` — mirror Step 7→Step-8 relocation
5. `scripts/simulate-workflow-walkthrough.js` — add tests F1/F2/F3 (finalize) and G1/G2/G3 (sweep second pass)

**`cmdFinalize` behavior (in linked worktree CWD):**
- Verify session owns project (via lock file)
- Optionally assert `phase6-summary.md` exists (exit 3 with message if not)
- Regex-replace `status: active` → `status: closed` and `step: .*` → `step: complete` in `CWD/kaola-workflow/{project}/workflow-state.md`
- `fs.renameSync(CWD/kaola-workflow/{project}, CWD/kaola-workflow/archive/{project})` — timestamp suffix on collision
- Return JSON `{archived_path, status: 'closed'}` or `{already: true}` if already done

**`cmdSweep` second pass (Bug 3):**
- After existing lock-scan loop: iterate `activeStateProjects(root)`
- Skip if lock file exists
- Parse `expires:` via `field()` helper; also check mtime as fallback
- Eligible only if BOTH `expires:` past cutoff (24h) AND no lock file
- Write `status: abandoned` (distinct from `closed`), then `archiveProjectDir(root, project, 'abandoned')`

**Shared helper `archiveProjectDir(root, project, statusValue)`:**
- Status regex-replace → write
- Collision-suffix rename
- Reused by both `cmdFinalize` and `cmdSweep` second pass

## Out of Scope (explicit)

- No `kaola-workflow/abandoned/` directory separate from `archive/`
- No retry/backoff in `cmdFinalize`
- No migration of existing archive entries (write-forward only)
- No amend-after-commit in sink scripts
- No removal of `cp -R` at Step 8a (separate concern — linked worktree mirror)
- No change to `releaseSession`'s `status: released` path
- No status-write in `sink-merge.js` or `sink-pr.js` (runs too late — after Step 8 commit)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
