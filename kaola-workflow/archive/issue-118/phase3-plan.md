# Phase 3 - Plan: issue-118

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `uninstall.sh` | 4 spots: usage string, two-arg error, case validation, gitea remove_dir block | Core deliverable: accept `--forge=gitea`, remove support dir |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | 4 assertions on `uninstall.sh` after `installSupportScripts` loop closes | Contract enforcement — catch partial implementations |
| `README.md` | Add `./uninstall.sh --forge=gitea` line after `--forge=gitlab` (before `--forge=all`) | User-visible doc parity |
| `CHANGELOG.md` | Add bullet under `[Unreleased] > ### Added`, mirroring adjacent entry format | Project documentation convention |

### Build Sequence
1. Edit `uninstall.sh` (4 spots) — load-bearing; validator reads this file
2. Edit `validate-kaola-workflow-gitea-contracts.js` (4 assertions) — parallel with step 1
3. Edit `README.md` (1 line insertion) — parallel with steps 1-2
4. Edit `CHANGELOG.md` (1 bullet) — parallel with steps 1-3
5. Validate — sequential after all writes

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | 1, 2, 3, 4 | Disjoint write sets; each touches a different file |
| B | Validation | Sequential after Group A; validator reads files written in A |

### External Dependencies
None. Pure shell script edits + JS assertions + Markdown docs.

## Task List

### Task 1: Patch uninstall.sh — 4 spots
- File: `uninstall.sh`
- Test File: N/A (validated by Task 2's contract assertions)
- Write Set: `uninstall.sh`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement:
  - Spot 1 (line ~11): `"Usage: ./uninstall.sh [--forge=github|gitlab|all]"` → `"Usage: ./uninstall.sh [--forge=github|gitlab|gitea|all]"`
  - Spot 2 (line ~22): `"--forge requires github, gitlab, or all"` → `"--forge requires github, gitlab, gitea, or all"`
  - Spot 3 (line ~42): `github|gitlab|all) ;;` → `github|gitlab|gitea|all) ;;`
  - Spot 4 (after gitlab if-block, before Python hook comment): add block:
    ```bash
    if [[ "$FORGE" = "gitea" || "$FORGE" = "all" ]]; then
      remove_dir "$HOME/.claude/kaola-workflow-gitea"
    fi
    ```
- Mirror: `if [[ "$FORGE" = "gitlab" || "$FORGE" = "all" ]]; then remove_dir "$HOME/.claude/kaola-workflow-gitlab"; fi` (uninstall.sh line ~110)
- Validate: `bash -n uninstall.sh`

### Task 2: Add uninstall.sh assertions to Gitea contract validator
- File: `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
- Test File: N/A (self-testing validator)
- Write Set: `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
- Depends On: Task 1 (must be complete before validator runs)
- Parallel Group: A (write is parallel; test runs after Task 1 completes)
- Action: MODIFY
- Implement: Insert after the `installSupportScripts` loop closes (use `grep -n 'installSupportScripts'` to locate; do not rely on bare line numbers):
  ```js
  const uninstallScript = read('uninstall.sh');
  assert(uninstallScript.includes('github|gitlab|gitea|all'), 'uninstall.sh must accept --forge=gitea in case validation');
  assert(uninstallScript.includes('"$FORGE" = "gitea"'), 'uninstall.sh must branch on gitea forge selection');
  assert(uninstallScript.includes('kaola-workflow-gitea'), 'uninstall.sh must remove the Gitea install directory');
  assert(/Usage:.*gitea/.test(uninstallScript), 'uninstall.sh usage string must list gitea');
  ```
- Mirror: Existing `const installScript = read('install.sh'); assert(...)` pattern in the same file
- Validate: `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`

### Task 3: Update README.md uninstall docs
- File: `README.md`
- Test File: N/A
- Write Set: `README.md`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: After `./uninstall.sh --forge=gitlab` line (before `./uninstall.sh --forge=all`), insert `./uninstall.sh --forge=gitea`
- Mirror: Existing github→gitlab→all ordering pattern in README uninstall block
- Validate: Visual inspection of README lines 183–192

### Task 4: Add CHANGELOG entry
- File: `CHANGELOG.md`
- Test File: N/A
- Write Set: `CHANGELOG.md`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Read existing Gitea entry format under `[Unreleased] > ### Added`, then add:
  `- **Gitea uninstall support**: \`uninstall.sh\` now accepts \`--forge=gitea\` to remove the \`~/.claude/kaola-workflow-gitea\` directory. Usage string, argument validation, and error messages updated to list \`gitea\` alongside \`github\`, \`gitlab\`, and \`all\`.`
  (Mirror adjacent entry format exactly)
- Mirror: Adjacent Gitea entries in CHANGELOG [Unreleased] section
- Validate: Visual inspection

### Task 5: Validate all changes
- File: N/A
- Write Set: none
- Depends On: Tasks 1, 2, 3, 4
- Parallel Group: B (sequential)
- Action: VALIDATE
- Implement:
  ```bash
  bash -n uninstall.sh
  ./uninstall.sh --forge=badforge 2>&1 | grep -q 'gitea' && echo "usage string OK"
  node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
  node scripts/simulate-workflow-walkthrough.js
  ```

## Advisor Notes
- Plan is sound; proceed to Phase 4.
- Anchor validator insertion on structural landmark (`installSupportScripts` loop close), not bare line number.
- Read CHANGELOG.md first to mirror adjacent entry format.
- Smoke check: `--forge=badforge 2>&1 | grep -q 'gitea'` is more explicit than `--help`.
- All critical verifications from Phase 2 already confirmed (command glob, agent marker, hook-stripping, bash 3.2 compat).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor found no gaps requiring architect revision |
