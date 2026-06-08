# Node Evidence: align-forge

## task
Mirror the base-edition `crossCheckStatus` fix (node `align`, issue #293) into the two forge ports:
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js`

The fix hoists a `ip.length <= 1` guard ABOVE the manifest branch so a single `in_progress` row is
treated as the legacy single-node path regardless of whether a manifest exists, matching the
`runOrient` AC#5 gate behaviour in the base edition.

non_tdd_reason: edition-port mechanical mirror — the gitlab and gitea editions are byte-for-byte
mirrors of the base edition (differing only in `require()` prefixes). The gitlab/gitea editions
carry no unit-test harness for `crossCheckStatus`; behavioral coverage is provided by the
base-edition unit tests (`test-parallel-batch.js` exercises `crossCheckStatus` directly) and the
edition walkthroughs/contracts in `npm test`. No natural failing unit test exists in the forge
port files — a ceremonial RED→GREEN test in the port files would duplicate existing base-edition
coverage without testing anything new. Note: this is NOT a behavior-preserving refactor — for
`ip.length === 1` with a mismatched manifest, the result flips from `orphan_member_set_mismatch`
(valid:false) to `single_in_progress` (valid:true); the suite staying green before/after reflects
the absence of a port-specific unit harness, not behavioral equivalence.

## write_set
1. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js`
   — `crossCheckStatus` function body replaced to match base edition's post-fix structure
2. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js`
   — `crossCheckStatus` function body replaced to match base edition's post-fix structure

Both ports' `crossCheckStatus` bodies now match the base edition at
`scripts/kaola-workflow-parallel-batch.js` verbatim (the function bodies have no `require()`s
inside them, so the forge-prefix naming restriction does not apply to the body).

## change_summary
### Before (both ports — pre-fix structure)
```javascript
function crossCheckStatus(manifest, inProgressIds) {
  const ip = (inProgressIds || []).slice().sort();

  if (!manifest) {
    // No manifest: ≤1 in_progress is the legacy serial path (valid); >1 is orphan.
    if (ip.length <= 1) {
      return { valid: true, orphan: false, reason: ip.length === 1 ? 'single_in_progress' : 'idle' };
    }
    return { valid: false, orphan: true, reason: 'orphan_multi_in_progress' };
  }

  // R4 (#291): UNSEALED members only — a partial-seal keeps sealed members in the manifest.
  const memberIds = (manifest.members || []).filter(m => !m.sealed).map(m => m.id).slice().sort();
  const setsEqual = memberIds.length === ip.length && memberIds.every((id, i) => id === ip[i]);

  if (setsEqual) {
    return { valid: true, orphan: false, reason: 'valid_batch' };
  }
  return { valid: false, orphan: true, reason: 'orphan_member_set_mismatch' };
}
```

### After (both ports — post-fix structure, matching base edition)
```javascript
function crossCheckStatus(manifest, inProgressIds) {
  const ip = (inProgressIds || []).slice().sort();

  // ≤1 in_progress — always the legacy single-node path regardless of manifest.
  if (ip.length <= 1) {
    return { valid: true, orphan: false, reason: ip.length === 1 ? 'single_in_progress' : 'idle' };
  }

  if (!manifest) {
    // >1 in_progress + no manifest → orphan.
    return { valid: false, orphan: true, reason: 'orphan_multi_in_progress' };
  }

  // R4 (#291): UNSEALED members only — a partial-seal keeps sealed members in the manifest.
  const memberIds = (manifest.members || []).filter(m => !m.sealed).map(m => m.id).slice().sort();
  const setsEqual = memberIds.length === ip.length && memberIds.every((id, i) => id === ip[i]);

  if (setsEqual) {
    return { valid: true, orphan: false, reason: 'valid_batch' };
  }
  return { valid: false, orphan: true, reason: 'orphan_member_set_mismatch' };
}
```

## verification_commands

### Baseline (before change)
```
node scripts/simulate-workflow-walkthrough.js
```
Result: "Workflow walkthrough simulation passed" (exit 0) — confirmed via background task bv711qskw (exit code 0)

```
npm test
```
Result: exit 0 — confirmed via background task bvc8taqhl (exit code 0)

### Post-fix
```
node scripts/simulate-workflow-walkthrough.js
```
Result: "Workflow walkthrough simulation passed" (WALKTHROUGH_EXIT:0) — confirmed via background task beke0p1wc (exit code 0)

```
npm test
```
Result: exit 0 — confirmed via background task b1c328e3c (exit code 0) and b1qz76utg (exit code 0, direct capture)

All four npm test lanes passed:
- claude lane: "Workflow walkthrough simulation passed"
- codex lane: "Kaola-Workflow walkthrough simulation passed"
- gitlab lane: "GitLab workflow walkthrough simulation passed" + "GitLab Codex workflow walkthrough simulation passed"
- gitea lane: "Gitea workflow walkthrough simulation passed" + "Gitea Codex workflow walkthrough simulation passed"

### Body-diff (all three editions)
Node.js extraction of the `crossCheckStatus` function body from all three files confirmed:
```
DIFF_RESULT: ALL THREE BODIES ARE IDENTICAL
BASE_LINES: 22
GITLAB_LINES: 22
GITEA_LINES: 22
```
The function bodies in all three files are byte-identical (22 lines each, no differences).

## before_result
build-green — baseline suite passed (walkthrough: exit 0; npm test: exit 0)

## after_result
build-green — regression-green — post-fix suite passed (walkthrough: exit 0; npm test: exit 0)
All edition walkthroughs (claude, codex, gitlab, gitea) passed.
`parallel-batch tests passed (120 assertions)` confirmed in claude lane.
Body-diff confirmed: crossCheckStatus bodies are byte-identical across base, gitlab, and gitea editions.
