# TDD Task 2 — T4 shell fix in kaola-workflow-phase6.md
Generated: 2026-05-16

## Files Modified
- `commands/kaola-workflow-phase6.md`

## Changes

**Capture block inserted before `SINK_BRANCH=` line (lines 588-593):**
```bash
# Capture main repo root before sink dispatch.
# --git-common-dir always resolves to the shared .git dir (mirrors lines 305-306, 533-534, 565-566).
# --show-toplevel returns the worktree root sink-merge is about to delete (issue #33).
_COORD_ROOT_RAW_SINK="$(git rev-parse --git-common-dir 2>/dev/null || echo ".git")"
if [[ "$_COORD_ROOT_RAW_SINK" != /* ]]; then _COORD_ROOT_RAW_SINK="$(pwd)/$_COORD_ROOT_RAW_SINK"; fi
_MAIN_ROOT="$(dirname "$_COORD_ROOT_RAW_SINK")"
```

**Restore block inserted after `esac` (lines 628-629):**
```bash
# Restore CWD: sink-merge may have removed the worktree this shell was in (issue #33).
cd "$_MAIN_ROOT" 2>/dev/null || true
```

## RED Evidence
RED: N/A — shell-side fix in phase6.md is validated by manual review and the end-to-end walkthrough test.

## GREEN Evidence
Grep output confirms both blocks present:
```
591:_COORD_ROOT_RAW_SINK="$(git rev-parse --git-common-dir 2>/dev/null || echo ".git")"
592:if [[ "$_COORD_ROOT_RAW_SINK" != /* ]]; then _COORD_ROOT_RAW_SINK="$(pwd)/$_COORD_ROOT_RAW_SINK"; fi
593:_MAIN_ROOT="$(dirname "$_COORD_ROOT_RAW_SINK")"
628:# Restore CWD: sink-merge may have removed the worktree this shell was in (issue #33).
629:cd "$_MAIN_ROOT" 2>/dev/null || true
```

## Deviations
None. All changes within write set.
