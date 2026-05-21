# Documentation Update — Issue #149

## Summary

Issue #149 fixed a behavior mismatch: `KAOLA_WORKTREE_NATIVE` was documented as opt-in (default OFF) but all three forge claim scripts provisioned worktrees unconditionally. The fix adds a `WORKTREE_NATIVE` module-level const to all four claim scripts and gates provisioning on `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`.

**This is a breaking behavior change**: users who relied on automatic worktree provisioning (the buggy prior behavior) must now set `KAOLA_WORKTREE_NATIVE=1` to restore it.

## Documentation Review

### Changed Files (Code)
- `scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- `scripts/simulate-workflow-walkthrough.js` (tests)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (tests)
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (tests)

### Documentation Status

#### README.md
- **Status**: ✅ No change needed
- **Reason**: `KAOLA_WORKTREE_NATIVE` is already documented correctly at lines 744–781 as opt-in (default OFF). The fix makes the implementation match the documented contract, so README needs no update.

#### API docs (`docs/api.md`)
- **Status**: ✅ No change needed
- **Reason**: No public API change; claim scripts' internal behavior is not part of the documented API surface.

#### Architecture docs (`docs/architecture.md`, `docs/workflow-state-contract.md`)
- **Status**: ✅ No change needed
- **Reason**: No structural change to the architecture; the fix aligns implementation with existing design.

#### .env.example
- **Status**: ✅ No change needed
- **Reason**: `KAOLA_WORKTREE_NATIVE=0` is already documented at line 42 with the correct default value.

#### Inline comments
- **Status**: ✅ No change needed
- **Reason**: No public interfaces changed; the fix is an internal behavior correction.

#### CHANGELOG.md
- **Status**: ❌ **UPDATE REQUIRED**
- **Action**: Add a `### Breaking / Upgrade Notes` section under `## [Unreleased]`, **before** `### Added` (line 5)

## CHANGELOG.md Edit

**File**: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/CHANGELOG.md`

**Placement**: Insert before line 5 (before `### Added`)

**Content to add**:

```markdown
### Breaking / Upgrade Notes

- **Worktree provisioning is now opt-in.** All three forge editions (GitHub, GitLab, Gitea) previously provisioned a sibling worktree unconditionally when online with a git history. This matched the buggy implementation but not the documented contract. The claim scripts now respect `KAOLA_WORKTREE_NATIVE` as documented: provisioning is gated on `KAOLA_WORKTREE_NATIVE=1`. **Set `KAOLA_WORKTREE_NATIVE=1` in your environment to preserve prior sibling-worktree behavior.**
```

## Verification

The documentation fix has been identified. The CHANGELOG entry is the only required documentation update. All other documentation surfaces already match the corrected behavior.

