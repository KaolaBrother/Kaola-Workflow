# Phase 3 - Plan: roadmap-per-issue-regenerator

## Blueprint

### Files to Create

| File | Purpose | Key Interfaces |
|------|---------|----------------|
| `scripts/kaola-workflow-roadmap.js` | Regenerator script | generate, migrate, validate, init-issue subcommands |
| `kaola-workflow/.roadmap/` | Per-issue state directory | Created via mkdirSync recursive on first write |

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `hooks/kaola-workflow-pre-commit.sh` | Add `grep -v '^kaola-workflow/\.roadmap/'` exclusion | Without it sessions committing per-issue files are falsely blocked by cross-session ownership check |
| `install.sh` | Add `kaola-workflow-roadmap.js` to explicit copy loop | Contract test asserts every script is in install.sh |
| `commands/kaola-workflow-phase1.md` | Conditional step: run `init-issue` if GitHub issue linked | Creates per-issue file at workflow start |
| `commands/kaola-workflow-phase6.md` | Step 7: rm -f per-issue file, run generate, stage both | Closes issue's roadmap entry and regenerates ROADMAP.md |
| `commands/workflow-next.md` | Startup Step 2: validate-only + warn; no commit | Router is thin; commits stay phase-owned |
| `commands/workflow-init.md` | Bootstrap: mkdir -p .roadmap + run generate | Initial empty ROADMAP.md on new installs |
| `scripts/validate-workflow-contracts.js` | 6 new assertions | Contract coverage for new script and command edits |
| `scripts/simulate-workflow-walkthrough.js` | Epic Case 5 (6 sub-tests) | Dynamic validation of generate/migrate/validate/init-issue |

### Design Decisions

- **D7: Phases 4 and 5 do NOT update per-issue files** — `next_step` is set once at Phase 1 via `init-issue`. The per-issue file is a static in-flight marker (created Phase 1, deleted Phase 6). Phase 4 and Phase 5 make zero writes to `.roadmap/`.
- **D8: cmdGenerate does NOT call gh issue list** — per-issue files are the single source of truth. Deterministic output, no live-state coupling, OFFLINE guard is a no-op in generate. Deviation from Phase 1 research (which mentioned gh enrichment); explicitly rejected for simplicity.

### Build Sequence

1. Task 1 (create `scripts/kaola-workflow-roadmap.js`) + Task 2 (hook exclusion) — parallel (disjoint write sets)
2. Tasks 3, 4, 5, 6, 7, 9 — parallel after Task 1 completes (each has disjoint write set)
3. Task 8 (`validate-workflow-contracts.js`) — after Tasks 2–7

Minimum sequential depth: 3 rounds.

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A+B | Task 1, Task 2 | Disjoint write sets |
| C+D+F | Tasks 3, 4, 5, 6, 7, 9 | All depend on Task 1; each touches a distinct file |
| E | Task 8 | Depends on Tasks 2-7; validates all edits |

### External Dependencies

None — Node.js built-ins only (fs, path, child_process).

---

## Task List

### Task 1: Create scripts/kaola-workflow-roadmap.js

- **File**: `scripts/kaola-workflow-roadmap.js`
- **Test File**: `scripts/simulate-workflow-walkthrough.js` (Epic Case 5)
- **Write Set**: `scripts/kaola-workflow-roadmap.js`, `kaola-workflow/.roadmap/issue-{N}.md` (7 bootstrap files), `kaola-workflow/ROADMAP.md` (header update)
- **Depends On**: none
- **Parallel Group**: A
- **Action**: CREATE
- **Implement**:
  - Mirror `scripts/kaola-workflow-claim.js` for script skeleton (shebang, require, OFFLINE, assert, isSafeName, field, ghExec, getRoot, parseArgs, subcommand dispatch, try/catch main wrapper)
  - Constants: `RULES_BLOCK` (verbatim `## Rules` section from current ROADMAP.md), `HEADER` (generated comment + title + Active Work table header)
  - `roadmapDir(root)` → `path.join(root, 'kaola-workflow', '.roadmap')`
  - `roadmapFile(root)` → `path.join(root, 'kaola-workflow', 'ROADMAP.md')`
  - `readRoadmapIssues(dir)` — reads all `issue-{N}.md`, sorted by N numerically desc; returns array of {issue, title, status, workflow_project, next_step}
  - `buildTableRow(data)` — pipe-delimited row; empty fields → `—`
  - `buildRoadmapContent(issues)` — HEADER + rows + RULES_BLOCK; if empty issues → placeholder row `| none | No active work | — | — | — |`
  - `writeIfDiff(filePath, content)` — ENOENT → treat existing as ''; write only if different; return bool
  - `parseRoadmapTable(text)` — regex to extract `| #N | ...` rows from `## Active Work` section only
  - `cmdGenerate()` — readRoadmapIssues, buildRoadmapContent, writeIfDiff; stdout 'generated' or 'up-to-date'; zero gh calls
  - `cmdMigrate()` — parseRoadmapTable from existing ROADMAP.md; write per-issue files (skip if exists); mkdirSync recursive
  - `cmdValidate()` — buildRoadmapContent, compare vs disk; exit 0 ok / exit 1 stale
  - `cmdInitIssue(args)` — parse --issue (required, positive integer), --title, --status, --workflow-project, --next-step; mkdirSync recursive; skip if exists; write key:value file
  - `main()` — argv[2] dispatch; throw on unknown; try/catch → stderr + exitCode=1
  - Constraints: no console.*; no function >45 lines; ~260 LOC; Object.assign immutability
  - **Bootstrap (run during implementation after creating script)**:
    1. `node scripts/kaola-workflow-roadmap.js migrate` → creates 7 per-issue files
    2. `ls kaola-workflow/.roadmap/` → verify 7 files
    3. `git add kaola-workflow/.roadmap/`
    4. `node scripts/kaola-workflow-roadmap.js generate` → byte-identical modulo new header comment
    5. `git add kaola-workflow/ROADMAP.md`
    6. Include both in Task 1 commit
- **Mirror**: `scripts/kaola-workflow-claim.js` (skeleton), `scripts/kaola-workflow-repair-state.js` lines 14-60 (migrate read/write pattern)
- **Validate**: `node scripts/simulate-workflow-walkthrough.js` exits 0

### Task 2: Modify hooks/kaola-workflow-pre-commit.sh

- **File**: `hooks/kaola-workflow-pre-commit.sh`
- **Test File**: `scripts/validate-workflow-contracts.js`
- **Write Set**: `hooks/kaola-workflow-pre-commit.sh`
- **Depends On**: none
- **Parallel Group**: B
- **Action**: MODIFY
- **Implement**: Add `  | grep -v '^kaola-workflow/\.roadmap/'` after `  | grep -v '^kaola-workflow/archive/'` in KW_PATHS pipeline (after line 30)
- **Mirror**: existing exclusion block `hooks/kaola-workflow-pre-commit.sh` lines 26-31
- **Validate**: `bash -n hooks/kaola-workflow-pre-commit.sh`; `node scripts/validate-workflow-contracts.js`

### Task 3: Modify install.sh

- **File**: `install.sh`
- **Test File**: `scripts/validate-workflow-contracts.js`
- **Write Set**: `install.sh`
- **Depends On**: Task 1
- **Parallel Group**: C
- **Action**: MODIFY
- **Implement**: Add `  "$SOURCE_SCRIPTS_DIR"/kaola-workflow-roadmap.js \` as 4th entry in script copy loop (after sink-merge.js line)
- **Mirror**: `install.sh` lines 113-116
- **Validate**: `bash -n install.sh`; `node scripts/validate-workflow-contracts.js`

### Task 4: Modify commands/kaola-workflow-phase1.md

- **File**: `commands/kaola-workflow-phase1.md`
- **Test File**: `scripts/validate-workflow-contracts.js`
- **Write Set**: `commands/kaola-workflow-phase1.md`
- **Depends On**: Task 1
- **Parallel Group**: D
- **Action**: MODIFY
- **Implement**: Add at end of Step 5 (Write Phase File), before "Continue to Phase 2":
  ```
  ## Per-Issue Roadmap File (Conditional)

  If a GitHub issue number N was extracted in Step 1:

  1. Resolve title (ONLINE: `gh issue view N --json title -q .title`; OFFLINE: use title from phase1-research.md or `—`)
  2. Resolve workflow-project: current kaola-workflow project folder name
  3. Run:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/kaola-workflow}/scripts/kaola-workflow-roadmap.js" init-issue \
       --issue N --title "TITLE" --status open \
       --workflow-project "WORKFLOW_PROJECT" --next-step "ready"
     ```
  4. Stage: `git add kaola-workflow/.roadmap/issue-N.md` (skip if init-issue printed "skip:")

  Note: Phases 4 and 5 do NOT update this file. Phase 6 deletes it.
  ```
- **Mirror**: conditional bash block pattern from phase1.md Step 6 (Cut Feature Branch)
- **Validate**: `node scripts/validate-workflow-contracts.js`; `grep init-issue commands/kaola-workflow-phase1.md`

### Task 5: Modify commands/kaola-workflow-phase6.md

- **File**: `commands/kaola-workflow-phase6.md`
- **Test File**: `scripts/validate-workflow-contracts.js`
- **Write Set**: `commands/kaola-workflow-phase6.md`
- **Depends On**: Task 1
- **Parallel Group**: D
- **Action**: MODIFY
- **Implement**: Replace Step 7 "Refresh kaola-workflow/ROADMAP.md from open GitHub issues when available" with:
  ```
  **Roadmap regeneration (Step 7):**

  If linked to issue N:
  1. Delete per-issue file: `rm -f kaola-workflow/.roadmap/issue-N.md`
  2. Regenerate: `node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/kaola-workflow}/scripts/kaola-workflow-roadmap.js" generate`
  3. Stage both: `git add kaola-workflow/.roadmap/issue-N.md kaola-workflow/ROADMAP.md`

  `rm -f` is idempotent (safe if file missing or issue not linked).
  ```
- **Mirror**: Phase 6 Step 8 (Sink Merge) bash block pattern
- **Validate**: `node scripts/validate-workflow-contracts.js`; `grep kaola-workflow-roadmap.js commands/kaola-workflow-phase6.md`

### Task 6: Modify commands/workflow-next.md

- **File**: `commands/workflow-next.md`
- **Test File**: `scripts/validate-workflow-contracts.js`
- **Write Set**: `commands/workflow-next.md`
- **Depends On**: Task 1
- **Parallel Group**: D
- **Action**: MODIFY
- **Implement**: Replace the "regenerate and commit if dirty" logic in Startup Step 2 with validate-only:
  ```
  Validate that ROADMAP.md is current:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/kaola-workflow}/scripts/kaola-workflow-roadmap.js" validate
  ```
  If exit 1: warn "ROADMAP.md is stale — run generate before next commit" and continue.
  Do NOT run generate automatically. Do NOT commit or stage ROADMAP.md in this step.
  If kaola-workflow-roadmap.js is unavailable, skip validation.
  ```
- **Mirror**: Startup Step 0 conditional script execution pattern
- **Validate**: `node scripts/validate-workflow-contracts.js`; `wc -l commands/workflow-next.md` (verify ≤220)

### Task 7: Modify commands/workflow-init.md

- **File**: `commands/workflow-init.md`
- **Test File**: `scripts/validate-workflow-contracts.js`
- **Write Set**: `commands/workflow-init.md`
- **Depends On**: Task 1
- **Parallel Group**: D
- **Action**: MODIFY
- **Implement**: After existing ROADMAP.md creation block, add:
  ```bash
  mkdir -p kaola-workflow/.roadmap
  node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/kaola-workflow}/scripts/kaola-workflow-roadmap.js" generate
  ```
  Skip if kaola-workflow-roadmap.js unavailable.
- **Mirror**: Session Initialization block at end of workflow-init.md
- **Validate**: `node scripts/validate-workflow-contracts.js`

### Task 8: Modify scripts/validate-workflow-contracts.js

- **File**: `scripts/validate-workflow-contracts.js`
- **Test File**: self-validating
- **Write Set**: `scripts/validate-workflow-contracts.js`
- **Depends On**: Tasks 2, 3, 4, 5, 6, 7
- **Parallel Group**: E
- **Action**: MODIFY
- **Implement**: Append after existing multi-session-substrate assertions (after the `assertIncludes('scripts/kaola-workflow-claim.js', 'workflow/issue-')` block):
  ```js
  // roadmap-per-issue-regenerator
  assert(exists('scripts/kaola-workflow-roadmap.js'), 'scripts/kaola-workflow-roadmap.js is missing');
  assertIncludes('install.sh', 'kaola-workflow-roadmap.js');
  assertIncludes('hooks/kaola-workflow-pre-commit.sh', '\\.roadmap/');
  assertIncludes('commands/kaola-workflow-phase6.md', 'kaola-workflow-roadmap.js');
  assertIncludes('commands/kaola-workflow-phase1.md', 'init-issue');
  assertIncludes('commands/workflow-next.md', 'kaola-workflow-roadmap.js');
  ```
- **Mirror**: `validate-workflow-contracts.js` lines 186-206 assertion block style
- **Validate**: `node scripts/validate-workflow-contracts.js` exits 0

### Task 9: Modify scripts/simulate-workflow-walkthrough.js

- **File**: `scripts/simulate-workflow-walkthrough.js`
- **Test File**: self-executing
- **Write Set**: `scripts/simulate-workflow-walkthrough.js`
- **Depends On**: Task 1
- **Parallel Group**: F
- **Action**: MODIFY
- **Implement**:
  1. Update ROADMAP.md fixture at line ~140: add `<!-- generated by scripts/kaola-workflow-roadmap.js — do not edit -->` comment header to the fixture content
  2. Add Epic Case 5 block before the final `console.log` at line ~561:
     - **Sub-test A**: generate from fixture .roadmap/ files → assert ROADMAP.md has correct rows + "do not edit" comment
     - **Sub-test B**: second generate → assert stdout 'up-to-date', bytes identical
     - **Sub-test C**: validate → assert exit 0
     - **Sub-test D**: write stale ROADMAP.md → validate → assert exit 1
     - **Sub-test E**: migrate from fixture ROADMAP.md table → assert per-issue files created; second migrate → assert 'skip' output
     - **Sub-test F**: init-issue with new --issue 42 → assert file created with correct content; second call → assert 'skip' output
  3. Use mkdtempSync temp dirs with try/finally cleanup (mirror Epic Case 1 structure)
  4. Capture exit codes via try { execFileSync(...) } catch (e) { code = e.status }
- **Mirror**: Epic Case 1 structure (simulate-workflow-walkthrough.js lines ~329-408)
- **Validate**: `node scripts/simulate-workflow-walkthrough.js` exits 0

---

## Advisor Notes

From `.cache/advisor-plan.md`:
- BLOCKER resolved: added `init-issue` subcommand for Phase 1 (migrate was chicken-and-egg for new issues)
- GAP #2 resolved: documented D7 — Phases 4/5 don't update per-issue files; next_step frozen at Phase 1 value
- GAP #3 resolved: bootstrap procedure added to Task 1 implementation steps
- GAP #4 resolved: documented D8 — gh enrichment dropped; per-issue files are single source of truth

All sound elements from original architect kept:
- D1: current_phase/claim_holder not rendered in ROADMAP.md table
- D4: Phase 6 race accepted; workflow-next validate detects staleness
- D6: byte-diff write idempotency
- Hook exclusion needle and escaping
- Parallelization plan (3 rounds minimum)
- Epic Case 5 structure (now with 6 sub-tests)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | invoked | .cache/architect-revision-1.md | |
