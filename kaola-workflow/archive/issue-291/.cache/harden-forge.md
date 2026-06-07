# harden-forge node — evidence record

## task
Mechanical cross-edition mirror of R1/R2/R4 bug fixes (originally applied to the github/codex base files by the `harden` node) to the 4 edition-named port files: gitlab and gitea parallel-batch + adaptive-node scripts.

## non_tdd_reason
Category: **Glue / wiring** (mechanical cross-edition mirror). The gitlab/gitea editions have no unit-test harness for the patched functions (`runSealMember`, `runOpenBatch`, `crossCheckStatus`, `runOrient`). Behavioral correctness is covered by the base-edition unit tests (`test-parallel-batch.js`, `test-adaptive-node.js`) plus the edition walkthroughs (`simulate-gitlab-workflow-walkthrough.js`, `simulate-gitea-workflow-walkthrough.js`). No new behavioral logic was introduced; the only change is bringing the port function bodies into byte-equivalence with the already-fixed base.

## write_set
1. plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js
2. plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js
3. plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js
4. plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js

## hunks applied

### R1 — runSealMember idempotent guard (both parallel-batch ports)
Added after the `if (!member) { return … not_a_member }` block:
```js
if (member.sealed) {
  return { result: 'ok', sealed: nodeId, state: manifest.state, alreadySealed: true };
}
```

### R2 — baseline-first ordering in runOpenBatch (both parallel-batch ports)
Moved the baseline-recording loop (`for (const m of capped) { const baseline = shell(commitNodePath, …'--start'…) … members.push(...) }`) to run BEFORE the ledger-flip loop and `writeFile(planPath, planContent)`. Added the same "BASELINES-FIRST:" comment block as the base. Order is now: cap → record all baselines (build `members[]`) → flip ledger rows → writeFile(plan) → write manifest.

### R4a — crossCheckStatus unsealed-only filter (both parallel-batch ports)
Changed:
```js
const memberIds = (manifest.members || []).map(m => m.id).slice().sort();
```
to:
```js
// R4 (#291): UNSEALED members only — a partial-seal keeps sealed members in the manifest.
const memberIds = (manifest.members || []).filter(m => !m.sealed).map(m => m.id).slice().sort();
```

### R4b — runOrient unsealed-only filter (both adaptive-node ports)
Changed:
```js
const manifestMemberIds = manifest ? (manifest.members || []).map(m => m.id) : [];
```
to:
```js
// R4 (#291): UNSEALED members only — a partial-seal keeps sealed members in the manifest.
const manifestMemberIds = manifest ? (manifest.members || []).filter(m => !m.sealed).map(m => m.id) : [];
```

## per-file equivalence notes
- `kaola-gitlab-workflow-parallel-batch.js`: function bodies of `crossCheckStatus`, `runOpenBatch`, and `runSealMember` now match `scripts/kaola-workflow-parallel-batch.js` modulo the `require(ADAPTIVE_NODE)` and `commitNodePath`/`nextActionPath` variables (which are edition-renamed in the `require()` block above these functions, not inside them).
- `kaola-gitlab-workflow-adaptive-node.js`: function body of `runOrient` now matches `scripts/kaola-workflow-adaptive-node.js` modulo the same edition-renamed require strings.
- `kaola-gitea-workflow-parallel-batch.js`: same as gitlab parallel-batch above.
- `kaola-gitea-workflow-adaptive-node.js`: same as gitlab adaptive-node above.

Verified by: `git diff` on each port produces +/- lines character-for-character identical to the base hunks from `git diff HEAD~1 scripts/kaola-workflow-parallel-batch.js scripts/kaola-workflow-adaptive-node.js`.

## verification_commands

```
node scripts/validate-script-sync.js                                     # exit 0
node scripts/simulate-workflow-walkthrough.js                             # exit 0
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js  # exit 0
node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js       # exit 0
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js    # exit 0
node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js         # exit 0
npm test                                                                  # exit 0
```

## regression-green
npm test exit 0 — all 4 editions passed (github/codex: parallel-batch tests passed (86 assertions), adaptive-node tests passed (138 assertions), Workflow walkthrough simulation passed; codex: Kaola-Workflow walkthrough simulation passed; gitlab: GitLab workflow walkthrough simulation passed; gitea: Gitea workflow walkthrough simulation passed). validate-script-sync.js: OK (18 common scripts and 7 byte-identical file group in sync). simulate-workflow-walkthrough.js: exit 0.

## before_result
All 4 port files contained the pre-fix code identical to base pre-fix (no R1/R2/R4 guards). npm test was green on the base-edition fixes already committed by the `harden` node (the port files were simply missed in that write set).

## after_result
build-green: npm test exit 0, all editions. validate-script-sync exit 0. simulate exit 0.
