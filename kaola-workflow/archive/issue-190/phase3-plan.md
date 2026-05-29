# Phase 3 - Plan: issue-190

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/validate-kaola-workflow-contracts.js` | Add 4 assertIncludes for GitHub Codex SKILL | RED guard (T-M1a) |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | Add 4 assertIncludes for GitLab Codex SKILL | RED guard (T-M1a) |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | Add 4 assertIncludes for Gitea Codex SKILL | RED guard (T-M1a) |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Insert Step 0a-1 + 3 Required Output lines | M1 GREEN (T-M1b) |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | Insert Step 0a-1 + 3 Required Output lines | M1 GREEN (T-M1b) |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | Insert Step 0a-1 + 3 Required Output lines | M1 GREEN (T-M1b) |
| `.env.example` | Delete 5 dead session var blocks (content-based, not line-based) | M2 |
| `docs/api.md` | Delete KAOLA_KERNEL_SESSION_FAKE_PID bullet (match text, not line) | M2 |
| `package-lock.json` | "3.16.0" → "3.16.1" on both version fields | M3 |
| `CHANGELOG.md` | Add [Unreleased] entry | docs |

### Build Sequence
1. T-M1a: Add 4 assertIncludes to each of the 3 per-edition validators (RED guard first)
2. Verify RED: run each validator, confirm it fails for missing Step 0a-1 / Required Output lines
3. T-M1b: Insert Step 0a-1 (from edition's OWN command file) + 3 Required Output lines in each SKILL.md
4. Verify GREEN: run each validator, confirm it now passes
5. T-M2: Delete stale env var blocks from .env.example and docs/api.md (content-based)
6. T-M3: Hand-edit package-lock.json lines 3 and 9
7. Run full validation: simulate-workflow-walkthrough.js + npm test
8. T-Docs: CHANGELOG.md entry

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | T-M2 (.env.example, docs/api.md) | Disjoint from all other files |
| B | T-M3 (package-lock.json) | Disjoint from all other files |
| C | T-M1a then T-M1b (6 validator/SKILL files) | Intra-group sequenced; disjoint from A/B |
| D | T-Docs (CHANGELOG.md) | Disjoint from all other files |

A, B, C, D pairwise-disjoint write sets. C is internally sequential (RED then GREEN).

### External Dependencies
None new.

## Task List

### Task T-M1a: Add contract assertions (RED guard)
- Files: scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- Write Set: the 3 validator files above
- Depends On: none
- Parallel Group: C (first)
- Action: MODIFY
- Implement: After existing `*nextSkill` assertion block in each validator, add 4 short-prefix assertIncludes:
  - `'Startup Step 0a-1'`
  - `'Branch: {branch from Sink block'`
  - `'Workflow path: {fast|full'`
  - `'Parallel decision: {green|yellow|red'`
- Mirror: `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` lines 248-254 (existing assertIncludes pattern)
- Validate: `node scripts/validate-kaola-workflow-contracts.js` → must FAIL; same for gitlab/gitea variants

### Task T-M1b: Port Step 0a-1 to Codex SKILLs (GREEN)
- Files: plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
- Write Set: the 3 SKILL.md files above
- Depends On: T-M1a (RED confirmed)
- Parallel Group: C (second)
- Action: MODIFY
- Implement:
  1. Read each SKILL's insertion point (between `## Startup Step 0a` block end and `## Startup`)
  2. Port `## Startup Step 0a-1 — Path Intent` from SAME edition's command file (GitHub←commands/workflow-next.md, GitLab←plugins/kaola-workflow-gitlab/commands/workflow-next.md, Gitea←plugins/kaola-workflow-gitea/commands/workflow-next.md)
  3. Apply ONLY adaptation #3: "Step 0b" → "the Startup transaction" (2 occurrences)
  4. Do NOT retarget cross-ref (commands/kaola-workflow-fast.md kept verbatim per D2)
  5. In `## Required Output` fenced block, insert after `Pending gates:` line: Branch / Workflow path / Parallel decision lines
- Mirror: commands/workflow-next.md Step 0a-1 for content; validate-kaola-workflow-gitlab-contracts.js lines 248-254 for assertion patterns
- Validate: `node scripts/validate-kaola-workflow-contracts.js` → must PASS; same for gitlab/gitea

### Task T-M2: Delete stale session var docs
- Files: .env.example, docs/api.md
- Write Set: .env.example, docs/api.md
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement:
  - `.env.example`: delete each block by unique content (not line number) — KAOLA_ENFORCE_PLATFORM_SESSION, KAOLA_KERNEL_SESSION_SKIP, KAOLA_COORD_ROOT, KAOLA_SESSION_ID, KAOLA_KERNEL_SESSION_FAKE_PID blocks with their comment lines. PRESERVE KAOLA_WORKTREE_PATH. Re-grep after each deletion to confirm target gone and KAOLA_WORKTREE_PATH survived.
  - `docs/api.md`: delete the KAOLA_KERNEL_SESSION_FAKE_PID bullet by matching its text (not line 109)
- Mirror: No existing pattern; straightforward deletion
- Validate: `grep -n "KAOLA_ENFORCE_PLATFORM_SESSION\|KAOLA_KERNEL_SESSION_SKIP\|KAOLA_SESSION_ID\|KAOLA_KERNEL_SESSION_FAKE_PID\|KAOLA_COORD_ROOT" .env.example docs/api.md` → 0 matches; `grep -n "KAOLA_WORKTREE_PATH" .env.example` → non-zero

### Task T-M3: Fix package-lock.json version drift
- Files: package-lock.json
- Write Set: package-lock.json
- Depends On: none
- Parallel Group: B
- Action: MODIFY
- Implement: Edit "version": "3.16.0" → "version": "3.16.1" in both top-level and packages[""] entries. Match by unique surrounding context.
- Mirror: package.json for the correct target version (3.16.1)
- Validate: `node -e "const l=require('./package-lock.json'); console.log(l.version, l.packages[''].version)"` → both print 3.16.1

## Advisor Notes
- Two deviations approved: D2 (drop cross-ref retargeting — fast SKILLs have no Mid-Flight Escalation section), D3 (3 per-edition validators vs 1)
- Execution caution: M2 must use content-based deletion (not line numbers) because KAOLA_WORKTREE_PATH is interleaved
- Per-edition sourcing must not cross-wire: GitLab SKILL ← gitlab command, etc.
- Observe RED per edition before GREEN (run all 3 validators, confirm each fails independently)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | no gaps requiring revision | advisor endorsed first blueprint |
