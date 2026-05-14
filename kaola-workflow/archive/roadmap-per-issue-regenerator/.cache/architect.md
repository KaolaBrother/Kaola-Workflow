# Code Architect — roadmap-per-issue-regenerator

## Design Decisions

- **D1: current_phase and claim_holder rendering** — derived at generate-time only, NOT stored in per-issue files. Table remains 5-column schema. Byte-diff idempotency is reliable from per-issue files alone.
- **D2: migrate data source** — parses `## Active Work` table in existing `kaola-workflow/ROADMAP.md`; produces one per-issue file per row with a valid `#N` issue number. Idempotent: skips existing files.
- **D3: Phase 1 per-issue file creation is conditional** — only when `phase1-research.md` contains a parseable GitHub issue number. If no linked issue, skip.
- **D4: ROADMAP.md race after concurrent Phase 6 sink-merges** — acceptable under Gated Regeneration. `workflow-next validate` detects staleness and warns. No fix inside `sink-merge.js`.
- **D5: .roadmap/ must NOT be in .gitignore** — these files are committed by each session.
- **D6: generate byte-diff idempotency** — computes full content in memory, reads existing file, writes only when different. Running twice on unchanged inputs = no dirty git state.

## Files to Create

| File | Purpose |
|------|---------|
| `scripts/kaola-workflow-roadmap.js` | Regenerator script; generate/migrate/validate subcommands |
| `kaola-workflow/.roadmap/` | Directory; created implicitly by first per-issue file write |

## Files to Modify

| File | Changes |
|------|---------|
| `hooks/kaola-workflow-pre-commit.sh` | Add `grep -v '^kaola-workflow/\.roadmap/'` exclusion after archive line |
| `install.sh` | Add `kaola-workflow-roadmap.js` to explicit copy loop |
| `commands/kaola-workflow-phase1.md` | Add conditional step: run `migrate` if GitHub issue linked |
| `commands/kaola-workflow-phase6.md` | Step 7: delete per-issue file, run generate, commit both |
| `commands/workflow-next.md` | Startup Step 2: replace commit logic with validate-only + warn |
| `commands/workflow-init.md` | Bootstrap: `mkdir -p kaola-workflow/.roadmap` + run generate |
| `scripts/validate-workflow-contracts.js` | Add 6 new assertions |
| `scripts/simulate-workflow-walkthrough.js` | Add Epic Case 5 (generate/idempotency/validate/migrate tests) |

## Script Interface: kaola-workflow-roadmap.js

### Functions

- `roadmapDir(root)` → `path.join(root, 'kaola-workflow', '.roadmap')`
- `roadmapFile(root)` → `path.join(root, 'kaola-workflow', 'ROADMAP.md')`
- `RULES_BLOCK` — verbatim `## Rules` constant string
- `HEADER` — verbatim header constant (generated comment + title + Active Work table header)
- `readRoadmapIssues(roadmapDir)` — reads all `issue-{N}.md`, sorted numerically; returns array of `{ issue, title, status, workflow_project, next_step }`
- `buildTableRow(data)` — formats one pipe-delimited row; replaces empty fields with `—`
- `buildRoadmapContent(issues)` — assembles full ROADMAP.md content from HEADER + rows + RULES_BLOCK
- `writeIfDiff(filePath, content)` — reads existing (ENOENT → ''), writes only if different; returns bool wasWritten
- `parseRoadmapTable(text)` — regex extracts rows from `## Active Work` section; returns parsed row objects
- `cmdGenerate()` — reads .roadmap/, builds content, calls writeIfDiff
- `cmdMigrate()` — reads existing ROADMAP.md table, writes per-issue files (idempotent)
- `cmdValidate()` — builds expected content, compares vs disk; exit 1 if stale
- `main()` — dispatch on argv[2]; wrapped in try/catch → stderr + exitCode=1

### Per-issue file format

```
issue: #N
title: {title}
status: {open|closed}
workflow_project: {folder name or —}
next_step: {free-text}
```

## Build Sequence

1. Task 1: Create `scripts/kaola-workflow-roadmap.js` (all subcommands)
2. Task 2: Hook exclusion (independent; parallel with Task 1)
3. Task 3: `install.sh` (after Task 1 exists)
4. Tasks 4–7: Command edits (after Task 1; each touches a distinct file — parallel)
5. Task 8: `validate-workflow-contracts.js` (after Tasks 2–7)
6. Task 9: `simulate-workflow-walkthrough.js` (after Task 1; parallel with Task 8)

## Parallelization Plan

| Group | Tasks | Notes |
|-------|-------|-------|
| A+B | Task 1 + Task 2 | Disjoint write sets; run in parallel |
| C+D+F | Tasks 3, 4, 5, 6, 7, 9 | After Task 1; each has disjoint write set; run in parallel |
| E | Task 8 | After Tasks 2–7 complete |

Minimum sequential depth: 3 rounds — (A+B) → (C+D+F) → E.

## Task List

### Task 1: Create scripts/kaola-workflow-roadmap.js
- File: `scripts/kaola-workflow-roadmap.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (Epic Case 5)
- Write Set: `scripts/kaola-workflow-roadmap.js`
- Depends On: nothing
- Parallel Group: A
- Action: CREATE
- Implement: Full script (~220-250 LOC). No console.*. No function >45 lines. Object.assign immutability. process.stdout.write/process.stderr.write only.
- Mirror: `scripts/kaola-workflow-claim.js` (skeleton), `scripts/kaola-workflow-repair-state.js` lines 14-60 (migrate pattern)
- Validate: `node scripts/kaola-workflow-roadmap.js generate` in a temp dir; `node scripts/simulate-workflow-walkthrough.js`

### Task 2: Modify hooks/kaola-workflow-pre-commit.sh
- File: `hooks/kaola-workflow-pre-commit.sh`
- Test File: `scripts/validate-workflow-contracts.js`
- Write Set: `hooks/kaola-workflow-pre-commit.sh`
- Depends On: nothing
- Parallel Group: B
- Action: MODIFY — add `  | grep -v '^kaola-workflow/\.roadmap/'` after archive exclusion line
- Mirror: existing exclusion block lines 26-31
- Validate: `bash -n hooks/kaola-workflow-pre-commit.sh`; `node scripts/validate-workflow-contracts.js`

### Task 3: Modify install.sh
- File: `install.sh`
- Test File: `scripts/validate-workflow-contracts.js`
- Write Set: `install.sh`
- Depends On: Task 1
- Parallel Group: C
- Action: MODIFY — add `"$SOURCE_SCRIPTS_DIR"/kaola-workflow-roadmap.js \` to script copy loop
- Mirror: install.sh lines 113-116
- Validate: `bash -n install.sh`; `node scripts/validate-workflow-contracts.js`

### Task 4: Modify commands/kaola-workflow-phase1.md
- File: `commands/kaola-workflow-phase1.md`
- Test File: `scripts/validate-workflow-contracts.js`
- Write Set: `commands/kaola-workflow-phase1.md`
- Depends On: Task 1
- Parallel Group: D
- Action: MODIFY — add conditional step at end of Step 5: run `migrate` if GitHub issue linked
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 5: Modify commands/kaola-workflow-phase6.md
- File: `commands/kaola-workflow-phase6.md`
- Test File: `scripts/validate-workflow-contracts.js`
- Write Set: `commands/kaola-workflow-phase6.md`
- Depends On: Task 1
- Parallel Group: D
- Action: MODIFY — Step 7: delete per-issue file, run generate, stage both in final commit
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 6: Modify commands/workflow-next.md
- File: `commands/workflow-next.md`
- Test File: `scripts/validate-workflow-contracts.js`
- Write Set: `commands/workflow-next.md`
- Depends On: Task 1
- Parallel Group: D
- Action: MODIFY — Startup Step 2: validate-only + warn (NO commit)
- Validate: `node scripts/validate-workflow-contracts.js`; `wc -l commands/workflow-next.md` ≤220

### Task 7: Modify commands/workflow-init.md
- File: `commands/workflow-init.md`
- Test File: `scripts/validate-workflow-contracts.js`
- Write Set: `commands/workflow-init.md`
- Depends On: Task 1
- Parallel Group: D
- Action: MODIFY — bootstrap: mkdir -p kaola-workflow/.roadmap + run generate
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 8: Modify scripts/validate-workflow-contracts.js
- File: `scripts/validate-workflow-contracts.js`
- Test File: self-validating
- Write Set: `scripts/validate-workflow-contracts.js`
- Depends On: Tasks 2-7
- Parallel Group: E
- Action: MODIFY — append 6 new assertIncludes calls after existing multi-session-substrate assertions
- Assertions to add:
  - `assert(exists('scripts/kaola-workflow-roadmap.js'), 'scripts/kaola-workflow-roadmap.js is missing')`
  - `assertIncludes('install.sh', 'kaola-workflow-roadmap.js')`
  - `assertIncludes('hooks/kaola-workflow-pre-commit.sh', 'kaola-workflow/\\.roadmap/')`
  - `assertIncludes('commands/kaola-workflow-phase6.md', 'kaola-workflow-roadmap.js')`
  - `assertIncludes('commands/kaola-workflow-phase1.md', 'kaola-workflow-roadmap.js')`
  - `assertIncludes('commands/workflow-next.md', 'kaola-workflow-roadmap.js')`
- Validate: `node scripts/validate-workflow-contracts.js` exits 0

### Task 9: Modify scripts/simulate-workflow-walkthrough.js
- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: self-executing
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Task 1
- Parallel Group: F
- Action: MODIFY — add Epic Case 5 (5 sub-tests: generate, idempotency, validate-current, validate-stale, migrate+migrate-idempotent); update ROADMAP.md fixture at line 140 to include "do not edit" header
- Epic Case 5 sub-tests:
  - A: generate produces ROADMAP.md with correct table rows from fixture .roadmap/ files
  - B: second generate reports 'up-to-date', bytes identical
  - C: validate exits 0 when ROADMAP.md is current
  - D: validate exits 1 when ROADMAP.md is stale
  - E: migrate from existing ROADMAP.md table; second migrate reports 'skip'
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0

## External Dependencies

None — Node.js built-ins only (fs, path, child_process).

## Critical Constraints

- No `console.*` in kaola-workflow-roadmap.js
- No in-place object mutation
- No function >45 lines; file total ~230 LOC (<800)
- Hook exclusion: `'^kaola-workflow/\.roadmap/'` with trailing `/` and leading `^`
- workflow-next.md: validate-only, NO commit, NO git add in Startup Step 2
- Phase 6 Step 7: `rm -f` (idempotent if missing)
- migrate: `fs.mkdirSync(roadmapDir, { recursive: true })` before writing
- validate-workflow-contracts.js hook assertion needle: use `\\.roadmap/` (double-backslash in JS string)
