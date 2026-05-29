# Phase 3 - Plan: issue-177

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/validate-workflow-contracts.js` | Insert tag-existence assertion block at line 324 (between CHANGELOG check and assertIncludes) | Add validation that rootVersion git tag exists locally |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | Byte-identical mirror of same insertion | validate-script-sync.js enforces exact byte parity |
| `scripts/simulate-workflow-walkthrough.js` | Two new test assertions: offline-skip pass, missing-tag fail | Covers the new branches in the validator |
| `CHANGELOG.md` | Add [Unreleased] entry for tag-existence contract check | Document the new validation behavior |
| `docs/conventions.md` | One-line note that `git tag kaola-workflow--v<version>` is contract-enforced unless KAOLA_WORKFLOW_OFFLINE=1 | Update release checklist documentation |

### Build Sequence
1. SHA verification gate (orchestrator runs git commands; abort if any fail)
2. Create local tags (orchestrator git ops; prerequisite for npm test to pass)
3. Edit `scripts/validate-workflow-contracts.js` (Task 1 via tdd-guide)
4. Mirror to `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (byte-identical, same Task 1)
5. Add two test assertions to `scripts/simulate-workflow-walkthrough.js` (same Task 1)
6. Update `CHANGELOG.md` and `docs/conventions.md` (same Task 1 or separate doc-only edit)
7. npm test (orchestrator validates: sync check + new assertion pass with local tags)
8. Push tags: `git push origin kaola-workflow--v3.15.0` then `kaola-workflow--v3.16.0` (orchestrator, one at a time by name)
9. Open PR for the code changes

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| serial | Task 0, Task 1, push | Git ops must precede implementation; npm test must pass before push |

### External Dependencies
- `child_process.execFileSync` (Node built-in, no install)

## Pre-Task: Git Operations (Orchestrator-Run)

These are shell commands run by the main session, not delegated to tdd-guide.

**Step 1 — SHA verification gate (must all exit 0):**
```bash
git log --format='%H %s' -1 1313aaf837e67d6a1bc1a0ea65eb5d504cd7a6b0 | grep -q 'chore(release): 3.15.0'
git log --format='%H %s' -1 5e8084b438bf084f7efc5ad59412821c8c69204b | grep -q 'chore(release): 3.16.0'
git merge-base --is-ancestor 1313aaf837e67d6a1bc1a0ea65eb5d504cd7a6b0 HEAD
git merge-base --is-ancestor 5e8084b438bf084f7efc5ad59412821c8c69204b HEAD
```

**Step 2 — Create local lightweight tags:**
```bash
git tag kaola-workflow--v3.15.0 1313aaf837e67d6a1bc1a0ea65eb5d504cd7a6b0
git tag kaola-workflow--v3.16.0 5e8084b438bf084f7efc5ad59412821c8c69204b
git tag --list 'kaola-workflow--v3.1[56].0'  # must show both
```

## Task List

### Task 1: Implement tag-existence validator + tests + docs
- File: `scripts/validate-workflow-contracts.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/validate-workflow-contracts.js`, `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`, `scripts/simulate-workflow-walkthrough.js`, `CHANGELOG.md`, `docs/conventions.md`
- Depends On: Pre-Task (local tags must exist before npm test validates the new check)
- Parallel Group: serial
- Action: MODIFY

**Implement: Insert at line 324 (existing blank line between the CHANGELOG assert and assertIncludes):**
```js
if (process.env.KAOLA_WORKFLOW_OFFLINE !== '1' && exists('.git')) {
  const tagName = 'kaola-workflow--v' + rootVersion;
  let tagPresent = false;
  try {
    const { execFileSync } = require('child_process');
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'refs/tags/' + tagName],
      { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
    tagPresent = true;
  } catch (_) {
    tagPresent = false;
  }
  assert(
    tagPresent,
    'Git tag "' + tagName + '" must exist for package.json version (' + rootVersion +
      '). Create it locally with: git tag ' + tagName + ' <release-commit-sha>'
  );
}
```

File tail context at insertion point (lines 320-327):
```js
assert(
  read('CHANGELOG.md').includes('## [' + rootVersion + ']'),
  'CHANGELOG.md must contain "## [' + rootVersion + ']" heading...'
);
                                 ← INSERT BLOCK HERE (line 324)
assertIncludes('scripts/simulate-workflow-walkthrough.js', 'Workflow walkthrough simulation passed');

console.log('Workflow contract validation passed');
```

**Mirror:** After editing the primary file, copy byte-for-byte:
```bash
cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js
```

**Tests to add in `scripts/simulate-workflow-walkthrough.js`:**

Test 1 — offline skip: Run the contracts script with `KAOLA_WORKFLOW_OFFLINE=1` and assert exit 0. Note: `runNode()` already sets `KAOLA_WORKFLOW_OFFLINE: '1'`, so calling `runNode('scripts/validate-workflow-contracts.js', [], <repo-root>)` and asserting `result.status === 0` covers this.

Test 2 — missing-tag failure: Run the contracts script with `KAOLA_WORKFLOW_OFFLINE` unset/0 but with a mock `git` binary on PATH that exits non-zero for `rev-parse --verify` (so the tag appears absent). Use the same mock-bin-dir pattern used in `testClassifierFolderOverlapRed()` and other tests (create a temp dir, write a mock `git` shim, prepend to PATH via `spawnSync` env). Assert `result.status !== 0` and `result.stderr` contains the substring `kaola-workflow--v`.

Both test functions must be added to the main `async function main()` call list at the bottom.

**CHANGELOG.md:** Add under the `## [Unreleased]` section:
```
### Changed
- `validate-workflow-contracts.js` now asserts that a local git tag `kaola-workflow--v<version>` exists matching `package.json` version; check is skipped when `KAOLA_WORKFLOW_OFFLINE=1` or outside a git repository
```

**docs/conventions.md:** Add a note in the release checklist section that `git tag kaola-workflow--v<version> <sha>` must be created locally before running `npm test` on a new release bump (unless `KAOLA_WORKFLOW_OFFLINE=1` is set).

**Mirror:** The code mirror in step above. `validate-script-sync.js` will fail `npm test` if the two contracts files diverge by even one byte.

- Validate: `npm test` (covers byte-identical sync check + new tag assertion passing with local tags + walkthrough tests passing)

## Post-Task: Push Tags (Orchestrator-Run, After npm test Passes)
```bash
git push origin kaola-workflow--v3.15.0
git push origin kaola-workflow--v3.16.0
git ls-remote origin 'refs/tags/kaola-workflow--v3.1[56].0'  # verify remote
```

## Advisor Notes

The advisor approved the approach with one required revision:
- **Worktree fix (applied):** Use `git rev-parse --verify` shell-out instead of direct `.git/refs/tags/...` file reads. Git handles worktree gitdir resolution natively; direct file reads break in `git worktree` contexts where `.git` is a file pointer.
- **Tag name correction (applied):** Tag name is `kaola-workflow--v{X.Y.Z}`, not `v{X.Y.Z}`. Confirmed from `.git/refs/tags/` contents (kaola-workflow--v3.12.0 through kaola-workflow--v3.14.0).
- **Test coverage:** Two new walkthrough tests are included in the write set; they are non-blocking nice-to-haves that the advisor recommended.
- **SHA verification:** git log subject match + merge-base ancestry checks are the safety net against accidentally tagging wrong commits (Phase 2 Adjustment 2).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | invoked | .cache/architect-revision-1.md | Worktree fix + tag name correction |
