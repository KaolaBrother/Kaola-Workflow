# Phase 3 - Plan: issue-23

## Blueprint

Add exact path extraction to the existing deterministic classifier. The classifier will build exact path sets and coarse area sets for the candidate issue and for each active claimed project. It will return `red` on exact path overlap before applying existing coarse-area, shared-infra yellow, area-label yellow, dependency, and unknown-scope rules.

## Files To Modify

| File | Purpose | Key Interfaces |
|------|---------|----------------|
| `scripts/kaola-workflow-classifier.js` | Root classifier behavior | `extractFilePaths`, `extractCoarseAreas`, `scanClaimedOverlap`, `classify` |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | Packaged Codex plugin classifier copy | Same as root classifier |
| `scripts/simulate-workflow-walkthrough.js` | Root regression coverage | Epic Case 6 exact path/shared infra/offline metadata cases |
| `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` | Packaged plugin regression coverage | Compact classifier exact-path cases |
| `scripts/validate-workflow-contracts.js` | Static root contract markers | assert exact-path helper/marker |
| `scripts/validate-kaola-workflow-contracts.js` | Static plugin contract markers | assert packaged helper/marker |
| `README.md` | Document exact path classifier behavior | Classifier configuration section |
| `CHANGELOG.md` | Release note | Unreleased entry |

## Build Sequence

1. Modify root classifier helper layer first because all tests depend on this behavior.
2. Mirror classifier changes to `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` to keep packaged Codex behavior in sync.
3. Expand root Epic Case 6 with exact shared-infra red, different-file shared-infra yellow, area-label-only yellow, unknown-scope red, and offline `touches:` metadata.
4. Add plugin simulator coverage for packaged classifier exact-path behavior.
5. Add static validator markers so future edits cannot remove exact-path extraction silently.
6. Update README and CHANGELOG.
7. Run focused validations, then `npm test`.

## Task List

### Task 1: Root classifier exact path extraction

- File: `scripts/kaola-workflow-classifier.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-classifier.js`
- Depends On: none
- Parallel Group: serial
- Action: MODIFY
- Implement: add exact path extraction for `scripts/`, `commands/`, `hooks/`, `kaola-workflow/`, and `plugins/kaola-workflow/`; parse offline roadmap file content including `touches:`; check exact path overlap before area fallback.
- Mirror: current `extractCoarseAreas`, `scanClaimedOverlap`, and `classify` structure.
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task 2: Plugin classifier mirror

- File: `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`
- Test File: `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- Write Set: `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`
- Depends On: Task 1
- Parallel Group: serial
- Action: MODIFY
- Implement: mirror Task 1 behavior exactly in the packaged copy.
- Mirror: root classifier after Task 1.
- Validate: `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`

### Task 3: Root regression coverage

- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: same file
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Task 1
- Parallel Group: serial
- Action: MODIFY
- Implement: add Epic Case 6 subtests for exact shared-infra path red, different-file shared-infra yellow, area-label-only yellow, unknown-scope Phase <= 2 red, and offline `touches:` exact metadata.
- Mirror: existing Epic Case 6 style using temp repo, `.locks`, `.roadmap`, and `execFileSync`.
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task 4: Plugin regression coverage

- File: `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- Test File: same file
- Write Set: `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- Depends On: Task 2
- Parallel Group: serial
- Action: MODIFY
- Implement: add packaged classifier checks for exact plugin path red and different shared-infra file yellow.
- Mirror: existing Case 5 temp repo patterns.
- Validate: `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`

### Task 5: Static contracts

- File: `scripts/validate-workflow-contracts.js`, `scripts/validate-kaola-workflow-contracts.js`
- Test File: same files
- Write Set: `scripts/validate-workflow-contracts.js`, `scripts/validate-kaola-workflow-contracts.js`
- Depends On: Tasks 1-2
- Parallel Group: serial
- Action: MODIFY
- Implement: assert exact-path helper and `plugins/kaola-workflow` path support exist in both classifier copies.
- Mirror: current `assertIncludes(...)` pattern.
- Validate: `node scripts/validate-workflow-contracts.js && node scripts/validate-kaola-workflow-contracts.js`

### Task 6: Documentation

- File: `README.md`, `CHANGELOG.md`
- Test File: validators and full package test
- Write Set: `README.md`, `CHANGELOG.md`
- Depends On: Tasks 1-5
- Parallel Group: serial
- Action: MODIFY
- Implement: document exact path overlap red, shared-infra different-file yellow, and offline `touches:` metadata support.
- Mirror: existing Classifier Configuration and changelog style.
- Validate: `npm test`

## Parallelization Plan

Serial execution only. The classifier interface is small, and root/plugin copies plus tests must stay synchronized.

## Exact Validation Commands

1. `node scripts/simulate-workflow-walkthrough.js`
2. `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
3. `node scripts/validate-workflow-contracts.js`
4. `node scripts/validate-kaola-workflow-contracts.js`
5. `npm test`

## Out Of Scope

- Model-based semantic analysis.
- Git merge simulation before claim.
- New commands or scheduler behavior.
- Required issue schema migration.
- Changing the bootstrap green/yellow claim contract.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | inline | .cache/architect.md | Spawned agents require explicit user request in this Codex session. |
| advisor plan gate | inline | .cache/advisor-plan.md | Local advisor gate completed. |
| blueprint revisions | invoked | .cache/advisor-plan.md | Advisor revisions folded into Task 3 and Task 4. |
