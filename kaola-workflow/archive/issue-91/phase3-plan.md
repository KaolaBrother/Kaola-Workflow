# Phase 3 - Plan: issue-91

## Files To Create Or Modify

- `scripts/kaola-workflow-repair-state.js`
  - Add delegation-policy ledger helper, route integration, and preservation of
    `delegation_policy:`.
- `plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js`
  - Byte-identical mirror of the root script.
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js`
  - Add equivalent helper, route integration, state preservation, and export.
- `scripts/validate-kaola-workflow-contracts.js`
  - Add executable helper fixtures and assertions for intentional non-role
    `invoked` comments.
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
  - Add GitLab equivalent helper fixtures and assertions.
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
  - Document extracting/reassigning `delegation_policy:` on resume.
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
  - GitLab equivalent documentation.
- `plugins/kaola-workflow/skills/kaola-workflow-ideation/SKILL.md`
- `plugins/kaola-workflow/skills/kaola-workflow-plan/SKILL.md`
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-ideation/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md`
  - Add explanatory comments for intentional non-role `invoked` rows.

## Ordered Build Sequence

### Task 1: Codex policy helper and validator

- File: `scripts/kaola-workflow-repair-state.js`
- Test File: `scripts/validate-kaola-workflow-contracts.js`
- Write Set: `scripts/kaola-workflow-repair-state.js`,
  `plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js`,
  `scripts/validate-kaola-workflow-contracts.js`
- Depends On: none
- Parallel Group: serial
- Action: MODIFY
- Implement: parse `delegation_policy:` from state content, classify known
  Codex-role compliance rows, ignore intentional non-role rows, and return a
  blocking compliance issue when row status contradicts policy. Preserve
  `delegation_policy:` when repair-state rewrites state. Export the helper for
  validator fixture coverage.
- Mirror: existing `complianceRows()` and `unresolvedCompliance()` patterns.
- Validate: `node scripts/validate-kaola-workflow-contracts.js`

### Task 2: GitLab equivalent policy helper and validator

- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js`
- Test File:
  `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- Write Set:
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js`,
  `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- Depends On: Task 1 semantics
- Parallel Group: serial
- Action: MODIFY
- Implement: add equivalent policy helper and validator fixtures for GitLab.
- Mirror: Codex helper semantics adapted to GitLab repair-state style.
- Validate:
  `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`

### Task 3: Skill routing and intentional invoked documentation

- File: plugin skill markdown files listed above
- Test File: Codex and GitLab validators
- Write Set:
  `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`,
  `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`,
  advisor/finalize skill files in both plugins
- Depends On: Task 1 and Task 2 validator assertions
- Parallel Group: serial
- Action: MODIFY
- Implement: document resume extraction/reassignment of `delegation_policy:`
  and add comments explaining why advisor/finalize non-doc rows intentionally
  use plain `invoked`.
- Mirror: current next-skill Routing wording and Required Agent Compliance
  tables.
- Validate:
  `npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab`

## Safe Parallel Groups

All tasks are serial because validators depend on shared helper semantics and
skill-doc assertions.

## Out Of Scope

- Changes to `scripts/validate-workflow-contracts.js`.
- Runtime detection of subagent availability.
- Any issue other than #91.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | local-fallback-tool-unavailable | .cache/code-architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| blueprint revisions | N/A | .cache/advisor-plan.md | Advisor accepted the plan without revision. |
