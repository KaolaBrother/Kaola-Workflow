# Phase 3 - Plan: issue-46

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `commands/workflow-next.md` | (1) Delete foot-gun clause from Goal-Driven Autonomy; (2) Revise Startup Step 3 to remove auto-pick; (3) Append /goal warning to Goal-Driven Autonomy; (4) Append `## Completion Contract` at EOF | Root-cause fix: removes the autonomy clause that misled agents into cross-issue continuation |
| `commands/kaola-workflow-phase6.md` | Append `## Completion Contract` section after line 664 | Closes the loop at the phase that actually issues the terminal event |
| `commands/workflow-init.md` | Add "next issue in line" warning bullet after the /goal bullet | Prevents incorrect /goal template phrasing at init time |
| `README.md` | Add 4-sentence completion contract block to Autonomy And Goal Contract section | Makes the contract discoverable to users and agents reading the top-level doc |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Append `## Completion Contract` after `## Required Output` | Codex skill mirror: ensures Codex-driven agents see the same stop contract |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Append `## Completion Contract` at EOF | Codex skill mirror: finalize skill sees same stop contract |
| `scripts/validate-workflow-contracts.js` | Add 10 `assertIncludes` calls before final `console.log` | Machine-verifiable enforcement of prose contract presence |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | Mirror: `cp scripts/validate-workflow-contracts.js ...` | Plugin scripts must be byte-identical to scripts/ counterparts |
| `scripts/validate-kaola-workflow-contracts.js` | Add 6 `assertIncludes` calls for Codex skill surfaces | Verifies SKILL.md contracts independently |

### Build Sequence
1. Group 1 (parallel) — 4 independent prose edits
2. Group 2 (parallel) — 2 independent SKILL.md edits
3. Group 3 (sequential) — validate-workflow-contracts.js edit → mirror cp → validate-kaola-workflow-contracts.js edit

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| 1 | Tasks 1-4 (workflow-next.md, phase6.md, workflow-init.md, README.md) | Disjoint files |
| 2 | Tasks 5-6 (kaola-workflow-next SKILL.md, kaola-workflow-finalize SKILL.md) | Disjoint files |
| 3 | Tasks 7-9 (validate-workflow-contracts.js edit, mirror cp, validate-kaola-workflow-contracts.js) | Sequential within group: mirror must follow scripts edit |

### External Dependencies
None — prose-only, no new packages or imports.

## Task List

### Task 1: Edit commands/workflow-next.md
- File: `commands/workflow-next.md`
- Test File: `scripts/validate-workflow-contracts.js`
- Write Set: `commands/workflow-next.md`
- Depends On: none
- Parallel Group: 1
- Action: MODIFY
- Implement:
  - **Edit A — Goal-Driven Autonomy body**: Replace `Treat nonessential workflow bookkeeping as autonomous: issue selection when\nthere is one unambiguous open issue, generated project names, collision suffixes` with `Treat nonessential workflow bookkeeping as autonomous: generated project names,\ncollision suffixes`
  - **Edit B — /goal warning** (append to Goal-Driven Autonomy section): Add after `authorization or materially user-owned choices.` → blank line + `The \`/goal\` template must NOT use "next issue in line" or similar phrasing that\nimplies cross-issue continuation. Each run targets exactly one issue.`
  - **Edit C — Startup Step 3**: Replace `If no active project is selected, choose one unambiguous open GitHub issue or\nprovided task automatically. If there are multiple plausible issues/tasks or no\ntask is available, ask the user what to implement. New work starts with:` with `If no active project is selected and no target was named in Startup Step 0,\nask the user what to implement. New work starts with:`
  - **Edit D — Completion Contract at EOF**: Append blank line + `## Completion Contract` section (7 body lines) after the last line
- Mirror: architect-revision-1.md verbatim old/new specifications
- Validate: `node scripts/validate-workflow-contracts.js` (must exit 0)

### Task 2: Edit commands/kaola-workflow-phase6.md
- File: `commands/kaola-workflow-phase6.md`
- Test File: `scripts/validate-workflow-contracts.js`
- Write Set: `commands/kaola-workflow-phase6.md`
- Depends On: none
- Parallel Group: 1
- Action: MODIFY
- Implement: Append after line 664 (`After \`sink-pr.js\` exits 0...`):
  ```
  
  ## Completion Contract
  
  This phase closes exactly one issue. After issue #N is closed and the lease is
  released, the single-issue completion contract is satisfied. Do not auto-route
  into the next issue in line. Stop and await explicit re-direction from the user.
  ```
- Mirror: `.cache/architect.md` Section 3 verbatim
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 3: Edit commands/workflow-init.md
- File: `commands/workflow-init.md`
- Test File: `scripts/validate-workflow-contracts.js`
- Write Set: `commands/workflow-init.md`
- Depends On: none
- Parallel Group: 1
- Action: MODIFY
- Implement: After the bullet `- Use \`/goal\` or equivalent...`, insert new bullet:
  `- The \`/goal\` template must not use "next issue in line" or any phrasing that implies automatic cross-issue continuation. Each \`/workflow-next\` run targets one issue; finishing it is the terminal event. The single-issue completion contract requires explicit re-direction for the next issue.`
- Mirror: `.cache/architect.md` Section 4 verbatim
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 4: Edit README.md
- File: `README.md`
- Test File: `scripts/validate-workflow-contracts.js`
- Write Set: `README.md`
- Depends On: none
- Parallel Group: 1
- Action: MODIFY
- Implement: After `credential or deployment actions, or issue/roadmap reorganization.` in the Autonomy And Goal Contract section, append:
  ```
  
  The single-issue completion contract applies at the end of every run: after
  Phase 6 closes issue #N and releases the lease, the agent stops and awaits
  explicit re-direction. Do not use "next issue in line" phrasing in \`/goal\`
  templates — cross-issue continuation is never automatic.
  ```
- Mirror: `.cache/architect.md` Section 5 verbatim
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 5: Edit plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- File: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- Test File: `scripts/validate-kaola-workflow-contracts.js`
- Write Set: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- Depends On: none
- Parallel Group: 2
- Action: MODIFY
- Implement: Append at EOF:
  ```
  
  ## Completion Contract
  
  Each kaola-workflow-next run implements exactly one issue. After
  kaola-workflow-finalize closes issue #N and releases the lease, the
  single-issue completion contract is satisfied. Stop and await explicit
  re-direction. Do not auto-route into the next issue in line.
  ```
- Mirror: `.cache/architect.md` Section 6 verbatim
- Validate: `node scripts/validate-kaola-workflow-contracts.js`

### Task 6: Edit plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- File: `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- Test File: `scripts/validate-kaola-workflow-contracts.js`
- Write Set: `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- Depends On: none
- Parallel Group: 2
- Action: MODIFY
- Implement: Append at EOF:
  ```
  
  ## Completion Contract
  
  This skill closes exactly one issue. After issue #N is closed and the lease is
  released, the single-issue completion contract is satisfied. Stop and await
  explicit re-direction from the user. Do not auto-route into the next issue in
  line.
  ```
- Mirror: `.cache/architect.md` Section 7 verbatim
- Validate: `node scripts/validate-kaola-workflow-contracts.js`

### Task 7: Edit scripts/validate-workflow-contracts.js
- File: `scripts/validate-workflow-contracts.js`
- Test File: self
- Write Set: `scripts/validate-workflow-contracts.js`
- Depends On: Tasks 1-4 (assertions must succeed after prose edits)
- Parallel Group: 3
- Action: MODIFY
- Implement: Add before the final `console.log`:
  ```javascript
  // Issue #46: single-issue completion contract
  assertIncludes('commands/workflow-next.md', '## Completion Contract');
  assertIncludes('commands/workflow-next.md', 'single-issue completion contract');
  assertIncludes('commands/workflow-next.md', 'await explicit re-direction');
  assertIncludes('commands/workflow-next.md', 'next issue in line');
  assertIncludes('commands/kaola-workflow-phase6.md', '## Completion Contract');
  assertIncludes('commands/kaola-workflow-phase6.md', 'single-issue completion contract');
  assertIncludes('commands/workflow-init.md', 'single-issue completion contract');
  assertIncludes('commands/workflow-init.md', 'next issue in line');
  assertIncludes('README.md', 'single-issue completion contract');
  assertIncludes('README.md', 'next issue in line');
  ```
- Validate: `node scripts/validate-workflow-contracts.js` (exit 0)

### Task 8: Mirror validate-workflow-contracts.js to plugins
- File: `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
- Write Set: `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
- Depends On: Task 7
- Parallel Group: 3
- Action: MODIFY (cp)
- Implement: `cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
- Validate: `node scripts/validate-script-sync.js` (exit 0)

### Task 9: Edit scripts/validate-kaola-workflow-contracts.js
- File: `scripts/validate-kaola-workflow-contracts.js`
- Test File: self
- Write Set: `scripts/validate-kaola-workflow-contracts.js`
- Depends On: Tasks 5-6 (assertions must succeed after SKILL.md edits)
- Parallel Group: 3
- Action: MODIFY
- Implement: Add before the final `console.log`:
  ```javascript
  // Issue #46: single-issue completion contract — Codex skill surfaces
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '## Completion Contract');
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'single-issue completion contract');
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'await explicit re-direction');
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, '## Completion Contract');
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'single-issue completion contract');
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'await explicit re-direction');
  ```
- Validate: `node scripts/validate-kaola-workflow-contracts.js` (exit 0)

## Advisor Notes

See `.cache/advisor-plan.md`. Two blockers found in original blueprint:
1. Foot-gun clause "issue selection when there is one unambiguous open issue," must be REMOVED from Goal-Driven Autonomy body (not just warned about). Resolved in architect-revision-1.md.
2. Startup Step 3 (lines 180-182) must be revised to remove "choose automatically" instruction. Resolved in architect-revision-1.md.

Line budget: 283 (current) + 6 (net delta after all edits) = 289 — within 300-line cap.

## Validation Commands

```bash
node scripts/validate-script-sync.js
node scripts/validate-workflow-contracts.js
node scripts/validate-kaola-workflow-contracts.js
node scripts/simulate-workflow-walkthrough.js
```

All must exit 0.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | invoked | .cache/architect-revision-1.md | Two gaps: foot-gun clause removal + Startup Step 3 |
