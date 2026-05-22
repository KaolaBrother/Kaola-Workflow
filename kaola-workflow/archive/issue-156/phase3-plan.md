# Phase 3 - Plan: issue-156

## Blueprint

### Files to Create
(none)

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/validate-workflow-contracts.js` | Insert CHANGELOG drift guard after line 281 | AC3: guard CHANGELOG heading against package.json version |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | Byte-identical cp from scripts/ | Script-sync contract |
| `README.md` | Fix release checklist lines 424-435: double-dash tag, single-tag push, edition policy, commit-selection guidance | AC2: correct documented tag format |

### Build Sequence
1. Task 1 — Publish git tag (orchestrator, no code changes, independent)
2. Task 2 — Add CHANGELOG guard to `scripts/validate-workflow-contracts.js` (tdd-guide, depends on nothing)
3. Task 3 — Mirror to `plugins/kaola-workflow/scripts/` (orchestrator cp, depends on Task 2)
4. Task 4 — Fix README release checklist (tdd-guide, independent of Tasks 2-3)

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | 1, 2, 4 | disjoint targets (git refs, scripts/, README.md) |
| B | 3 | depends on Task 2 completing |

### External Dependencies
None beyond Node.js and git (already available).

## Task List

### Task 1: Publish git tag kaola-workflow--v3.13.0
- File: none (git ref only)
- Test File: none
- Write Set: none (git refs only)
- Depends On: none
- Parallel Group: A
- Action: ORCHESTRATOR-EXECUTED (not delegated to tdd-guide; tdd-guide cannot execute git ref operations)
- Implement:
  ```bash
  # Pre-flight: verify SHA and metadata
  git show fc1219b --stat --format='%H %s' | head -1
  git show fc1219b:package.json | node -e "const j=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(j.version+'\n')"
  # Must print 3.13.0; abort if not
  git show fc1219b^:package.json | node -e "const j=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(j.version+'\n')"
  # Must print 3.12.0; abort if not
  # Tag and push
  git tag kaola-workflow--v3.13.0 fc1219b
  git push origin kaola-workflow--v3.13.0
  # Verify
  git ls-remote --tags origin | grep kaola-workflow--v3.13.0
  ```
- Mirror: existing tag publishing pattern (`kaola-workflow--v3.12.0` on release commit)
- Validate: `git ls-remote --tags origin | grep kaola-workflow--v3.13.0` exits 0 with the tag ref

### Task 2: Add CHANGELOG drift guard to validate-workflow-contracts.js
- File: `scripts/validate-workflow-contracts.js`
- Test File: implicit (the guard runs as part of `npm test` via `node scripts/validate-workflow-contracts.js`)
- Write Set: `scripts/validate-workflow-contracts.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: After line 281 (closing `}` of the forge loop), before line 283 (`assertIncludes('scripts/simulate-workflow-walkthrough.js'...)`), insert a blank line then:
  ```js
  assert(
    read('CHANGELOG.md').includes('## [' + rootVersion + ']'),
    'CHANGELOG.md must contain "## [' + rootVersion + ']" heading matching package.json version (' + rootVersion + ')'
  );
  ```
  `read` and `assert` are already defined in scope. `rootVersion` is defined at line 267.
- Mirror: existing `assert(manifest.version === rootVersion, ...)` pattern at lines 276-280
- Validate: `node scripts/validate-workflow-contracts.js` exits 0 (guard passes on live repo — it is a regression guard, not a currently-failing test)

### Task 3: Mirror to plugins/kaola-workflow/scripts/
- File: `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
- Test File: none (validated by `scripts/validate-script-sync.js`)
- Write Set: `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
- Depends On: Task 2
- Parallel Group: B
- Action: MODIFY (via cp)
- Implement:
  ```bash
  cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js
  ```
- Mirror: script-sync contract documented in `.cache/code-explorer.md`
- Validate: `node scripts/validate-script-sync.js` exits 0

### Task 4: Fix README release checklist
- File: `README.md`
- Test File: implicit (`npm test` via `node scripts/validate-workflow-contracts.js` does NOT check tag format in README — this is a doc-only fix)
- Write Set: `README.md`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Replace lines 424-435 region:

  Current (wrong):
  ```
  Official release checklist:

  \`\`\`bash
  npm test
  git diff --check
  git tag kaola-workflow-v<X.Y.Z>
  git push origin main --tags
  \`\`\`

  Create a tag only when publishing a tagged release. For normal development
  pushes, update the versions and changelog, run validation, commit, and push the
  branch.
  ```

  Replacement:
  ```
  Official release checklist:

  \`\`\`bash
  npm test
  git diff --check
  git tag kaola-workflow--v<X.Y.Z> <release-commit>
  git push origin kaola-workflow--v<X.Y.Z>
  \`\`\`

  Tag rules:
  - Tag the specific release commit (the commit that bumped `package.json`
    version and added the CHANGELOG section), not HEAD.
  - GitHub/main tag (`kaola-workflow--v<X.Y.Z>`) is required. GitLab tag
    (`kaola-workflow-gitlab--v<X.Y.Z>`) is optional (no 3.12.0 GitLab tag
    was published — intentional). Gitea has no separate release tag.
  - Never use `--tags` or `git push origin main --tags`; push only the
    single new tag by name.

  Create a tag only when publishing a tagged release. For normal development
  pushes, update the versions and changelog, run validation, commit, and push the
  branch.
  ```
- Mirror: existing README prose style and existing tag naming in `.cache/code-explorer.md`
- Validate: `npm test` passes (README version rows are guarded by validate-workflow-contracts.js; tag format lines are not checked by tests — manual inspection suffices)

## Advisor Notes

From `.cache/advisor-plan.md`:
- Task A (tag push) must be placed explicitly in the plan; tdd-guide cannot execute git ref operations. → Task 1 is orchestrator-executed.
- Phase 2 positive-test commitment was dropped; phase2-ideation.md updated with advisor fallback rationale (PR-description disclosure).
- CHANGELOG guard is a regression guard (passes today); state plainly in PR.
- Codex-plugin guard reads `package.json#version` only; does not cross-check `.codex-plugin/plugin.json`.
- No mandatory GitLab tag; document as optional per 3.12.0 precedent.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | advisor blocking items resolved inline in phase3-plan.md | architect blueprint was structurally complete; only phase placement and test commitment required resolution, not a full re-invocation |
