# Code Architect — Blueprint for Issue #161

## Key Design Decisions

1. **Single forge-agnostic basename across all 4 trees** — module keeps identical basename `kaola-workflow-closure-contract.js` in every tree (same precedent as pre-commit hook in BYTE_IDENTICAL_GROUPS).
2. **`emptyReceipt()` defaults every status field to `'failed'`** — every status enum contains `failed`; a uniform `failed` default encodes "fail-loud" structurally.
3. **Guard with `assertConcept` (term-presence)** — pins load-bearing terms without making prose edits brittle; matches existing validation idiom.
4. **Mapping table NAMES cross-forge gaps, points them at follow-ups, fixes nothing.**
5. **Do NOT add module to `COMMON_SCRIPTS`** — COMMON_SCRIPTS only covers scripts/ vs plugins/kaola-workflow/; use BYTE_IDENTICAL_GROUPS for all 4 trees.

---

## Files to Create

| File (absolute) | Purpose |
|------|---------|
| `scripts/kaola-workflow-closure-contract.js` | Canonical pure-data schema module |
| `plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js` | Byte-identical copy (Codex GitHub) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js` | Byte-identical copy (GitLab) |
| `plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js` | Byte-identical copy (Gitea) |

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `docs/api.md` | Append `## Closure Contract` section after line 412 | P1 |
| `docs/workflow-state-contract.md` | Add one cross-ref bullet in `## Durable Sources` | P1 |
| `scripts/validate-script-sync.js` | Add 2nd `BYTE_IDENTICAL_GROUPS` entry | P2 |
| `scripts/validate-workflow-contracts.js` | Add `assertConcept` guard | P2 |
| `scripts/validate-kaola-workflow-contracts.js` | Add identical `assertConcept` guard + copy validate-workflow-contracts.js to Codex tree | P2 |

---

## Build Sequence

1. T1: Create canonical module (serial-root)
2. T2, T3, T4: Copy byte-identical to plugin trees (parallel, after T1)
3. T5: Append `## Closure Contract` to docs/api.md (parallel with T1-T4)
4. T6: Add cross-ref to docs/workflow-state-contract.md (parallel with T1-T4)
5. T7: Add BYTE_IDENTICAL_GROUPS entry to validate-script-sync.js (after T1-T4)
6. T8: Add assertConcept guard to validate-workflow-contracts.js (after T5, T6)
7. T9: Add assertConcept guard to validate-kaola-workflow-contracts.js + sync the validator (after T8) — CRITICAL: cp validate-workflow-contracts.js to plugins/kaola-workflow/scripts/ or script-sync will fail
8. T10: Full validation gate (all prior)

---

## T1 — CREATE canonical schema module

**File:** `scripts/kaola-workflow-closure-contract.js`
**Depends on:** none

Exact content:

```js
#!/usr/bin/env node
'use strict';

// Closure Contract schema (issue #161, Option B).
//
// Pure data: no I/O, no forge calls, no callers in #161. This is the single
// machine-readable source of truth for the closure receipt. The follow-up
// shared closure executor (#164) is expected to require() this module and seed
// a receipt with emptyReceipt(), then flip each field from its 'failed' default
// to a success enum as each closure step completes.
//
// Byte-identical copies live in all four forge trees and are pinned by
// validate-script-sync.js (BYTE_IDENTICAL_GROUPS). The human-readable contract
// lives in docs/api.md § Closure Contract.

// Each closure-receipt field maps to its allowed enum values. The first value
// is NOT a default; emptyReceipt() defaults every status field to 'failed'
// (fail-loud: an unpopulated receipt reads as total failure, not silent
// success). `warnings` is a free-form string array.
const CLOSURE_RECEIPT_FIELDS = {
  project: 'string',
  issue_number: 'number',
  archive: ['closed', 'abandoned', 'skipped', 'failed'],
  roadmap_source_removed: ['removed', 'absent', 'failed'],
  roadmap_regenerated: ['regenerated', 'skipped', 'failed'],
  remote_issue_closed: ['closed', 'already_closed', 'skipped_offline', 'failed'],
  claim_label_removed: ['removed', 'already_absent', 'skipped_offline', 'failed'],
  worktree_removed: ['removed', 'missing', 'kept', 'failed'],
  branch_removed: ['removed', 'kept', 'failed'],
  warnings: 'string[]',
};

// The seven closure invariants for a completed linked issue N. `id` is a stable
// machine token; `description` mirrors docs/api.md § Closure Contract.
const CLOSURE_INVARIANTS = [
  { id: 'roadmap-source-absent', description: 'kaola-workflow/.roadmap/issue-N.md is absent.' },
  { id: 'roadmap-mirror-clean', description: 'Generated kaola-workflow/ROADMAP.md does not list #N as active work.' },
  { id: 'active-folder-absent', description: 'kaola-workflow/{project}/ is absent from active folders.' },
  { id: 'archive-state-closed', description: 'kaola-workflow/archive/{project}/workflow-state.md exists with status: closed and step: complete when local archive is available.' },
  { id: 'remote-closed-after-publish', description: 'The remote issue is closed only after acceptance criteria pass and implementation is published.' },
  { id: 'in-progress-label-removed', description: 'The remote issue does not have workflow:in-progress after closure.' },
  { id: 'branch-worktree-resolved', description: 'Any branch/worktree cleanup is either complete or explicitly reported by stale-worktree tooling.' },
];

// Returns a fresh receipt for the given project/issue with every status field
// defaulted to its failure state and warnings empty. Callers flip fields to a
// success enum as each step completes.
function emptyReceipt(project, issueNumber) {
  return {
    project: project,
    issue_number: issueNumber,
    archive: 'failed',
    roadmap_source_removed: 'failed',
    roadmap_regenerated: 'failed',
    remote_issue_closed: 'failed',
    claim_label_removed: 'failed',
    worktree_removed: 'failed',
    branch_removed: 'failed',
    warnings: [],
  };
}

module.exports = { CLOSURE_RECEIPT_FIELDS, CLOSURE_INVARIANTS, emptyReceipt };
```

---

## T2/T3/T4 — COPY byte-identical to plugin trees

Depends on T1. Byte-identical — no changes.

```bash
cp scripts/kaola-workflow-closure-contract.js plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js
cp scripts/kaola-workflow-closure-contract.js plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js
cp scripts/kaola-workflow-closure-contract.js plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js
```

---

## T5 — MODIFY `docs/api.md` (append `## Closure Contract`)

Append after the final line (412). New section:

```markdown

## Closure Contract

This section defines the closure-system invariants for a completed linked issue
N. It is the human-readable counterpart to the machine-readable schema in
`scripts/kaola-workflow-closure-contract.js`. No runtime path emits a receipt
yet; emission and enforcement land in the follow-up issues mapped below.

### Closure invariants

For a completed linked issue N:

1. `kaola-workflow/.roadmap/issue-N.md` is absent.
2. Generated `kaola-workflow/ROADMAP.md` does not list `#N` as active work.
3. `kaola-workflow/{project}/` is absent from active folders.
4. `kaola-workflow/archive/{project}/workflow-state.md` exists with `status: closed` and `step: complete` when local archive is available.
5. The remote issue is closed only after acceptance criteria pass and implementation is published.
6. The remote issue does not have `workflow:in-progress` after closure.
7. Any branch/worktree cleanup is either complete or explicitly reported by stale-worktree tooling.

### Closure receipt schema

The closure receipt is an auditable record of every closure step. Field names
and enum values are exported from `scripts/kaola-workflow-closure-contract.js`
as `CLOSURE_RECEIPT_FIELDS`; `emptyReceipt(project, issueNumber)` returns a
receipt with every status field defaulted to `failed` (fail-loud: an
unpopulated receipt reads as total failure, never silent success) and
`warnings` empty.

```json
{
  "project": "issue-N",
  "issue_number": N,
  "archive": "closed|abandoned|skipped|failed",
  "roadmap_source_removed": "removed|absent|failed",
  "roadmap_regenerated": "regenerated|skipped|failed",
  "remote_issue_closed": "closed|already_closed|skipped_offline|failed",
  "claim_label_removed": "removed|already_absent|skipped_offline|failed",
  "worktree_removed": "removed|missing|kept|failed",
  "branch_removed": "removed|kept|failed",
  "warnings": []
}
```

Offline behavior is explicit: local invariants (1-4) are always checked; remote
actions (`remote_issue_closed`, `claim_label_removed`) record `skipped_offline`
under `KAOLA_WORKFLOW_OFFLINE=1` rather than `failed`.

### Flow mapping

Existing closure code is mapped to the contract below. This issue documents the
mapping; it does not change any runtime path. Cross-forge parity gaps are named
here and deferred to the listed follow-up issues.

| Closure surface | Invariants covered | Current behavior | Follow-up |
|-----------------|--------------------|------------------|-----------|
| `cmdFinalize` / `archiveProjectDir` | 1, 2, 3, 4 | Roadmap source removal + regen are best-effort/non-fatal; `removeLegacyStateBlocks` runs on GitHub but is missing from GitLab/Gitea `archiveProjectDir`. | #162 |
| `sink-merge` (all forges) | 5, 6, 7 | Closes remote issue and deletes branch on success; does not assert `workflow:in-progress` removal. | #163, #164 |
| `sink-pr` / PR-MR fallback | 3, 5 | Leaves active folder open until `watch-pr`/`watch-mr`; `cmdSinkFallback` live-folder guard checks archive on GitLab/Gitea but GitHub misses that archive check. | #164 |
| `watch-pr` / `watch-mr` | 1, 2, 3, 4, 6, 7 | Archives + roadmap cleanup on MERGED; closure can be delayed or skipped if the watcher never runs. | #164, #165 |
| `clearAdvisoryClaim` (label cleanup) | 6 | Removes the advisory claim label; Gitea silently skips when `projectInfo.full_name` is absent. | #163 |
| `stale-worktree-check` / `stale-worktree-cleanup` | 7 | Reports/removes stale worktrees and branches; relied on for invariant 7's "explicitly reported" clause. | #165 |

### Follow-up scope

This issue ships the contract and the machine-readable schema only. Enforcement
and repair are decomposed into:

- #162 — Make roadmap source cleanup mandatory after issue closure (invariants 1, 2).
- #163 — Guarantee `workflow:in-progress` label cleanup for closed issues (invariant 6).
- #164 — Unify closure execution behind a shared closure receipt (all invariants).
- #165 — Add closure audit and repair command for stale completed work (drift detection + repair).
```

---

## T6 — MODIFY `docs/workflow-state-contract.md` (cross-reference)

Insert final bullet in `## Durable Sources` section:

```markdown
- Closure of a completed linked issue is governed by explicit invariants and an
  auditable receipt schema. See `docs/api.md` § Closure Contract for the seven
  closure invariants, the receipt field/enum schema, and the flow mapping.
```

---

## T7 — MODIFY `validate-script-sync.js` (add byte-identical group)

Add to `BYTE_IDENTICAL_GROUPS` after the existing pre-commit hook entry:

```js
  {
    label: 'closure-contract module copies',
    files: [
      'scripts/kaola-workflow-closure-contract.js',
      'plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js',
      'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js',
      'plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js',
    ],
  },
```

Optional cosmetic: change "byte-identical file group" → "byte-identical file groups" at line 98. Not required for test to pass.

---

## T8 — MODIFY `scripts/validate-workflow-contracts.js` (assertConcept guard)

Insert after the `assertConcept('docs/workflow-state-contract.md', 'legacy coordination...')` block:

```js
assertConcept('docs/api.md', 'closure contract invariants and receipt schema', [
  '## Closure Contract',
  'closure invariants',
  'roadmap_source_removed',
  'remote_issue_closed',
  'claim_label_removed',
  'kaola-workflow-closure-contract.js',
  '#162',
  '#163',
  '#164',
  '#165'
]);
assertConcept('docs/workflow-state-contract.md', 'closure contract cross-reference', [
  'closure contract'
]);
```

---

## T9 — MODIFY `scripts/validate-kaola-workflow-contracts.js` + sync validate-workflow-contracts.js

Insert the same assertConcept blocks as T8 at the same position in validate-kaola-workflow-contracts.js.

**CRITICAL:** After T8, copy validate-workflow-contracts.js to keep COMMON_SCRIPTS in sync:
```bash
cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js
```

---

## T10 — Full validation gate

```bash
node scripts/validate-script-sync.js
node scripts/validate-workflow-contracts.js
node scripts/validate-kaola-workflow-contracts.js
node scripts/simulate-workflow-walkthrough.js
node -e "require('./scripts/kaola-workflow-closure-contract.js')"
```

All must pass.

---

## Key Risks

1. **T9 `cp` of `validate-workflow-contracts.js` is mandatory** — forgetting it makes validate-script-sync.js fail
2. **Nested markdown fences in docs/api.md** — verify no dangling open fence after the edit
3. **CHANGELOG.md not listed** — likely needs `[Unreleased]` entry; flag to user
4. **Advisor was unreachable** during planning — recommend running advisor() after T1-T6 land before validator edits
