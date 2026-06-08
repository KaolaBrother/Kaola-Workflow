# build-forge node evidence — issue #292

## task
Mechanical four-edition mirror: port the R3 gitCheckout ref-vs-path fix and AC#3 write-role worktree
join changes from the base `scripts/kaola-workflow-parallel-batch.js` into the two renamed forge
editions (gitlab + gitea). The `build` node already applied and RED→GREEN-verified those fixes in
the base edition.

## non_tdd_reason
category: Behavior-preserving refactor / glue (cross-edition mechanical mirror)

The forge ports (`kaola-gitlab-workflow-parallel-batch.js` and `kaola-gitea-workflow-parallel-batch.js`)
have NO per-edition unit harness for the changed functions — they are byte-synced mirrors of the base,
differing ONLY in the 7 edition-rename lines. All behavioral RED→GREEN testing was done in the base
edition (parallel-batch tests: 117 assertions). The port is a mechanical `cp + 7-line rename` — verified
by the 7-line diff parity check, `node --check` syntax validation, the gitlab/gitea walkthrough sims,
and the gitlab/gitea forge contract validators in `npm test`. No new behavioral logic was introduced here.

## write_set
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js`

## verification_commands

### Diff parity (7 lines each — ONLY the edition renames differ)
```
diff scripts/kaola-workflow-parallel-batch.js plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js
diff scripts/kaola-workflow-parallel-batch.js plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js
```

### Syntax check
```
node --check plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js
node --check plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js
```

### Walkthrough + full test suite
```
node scripts/simulate-workflow-walkthrough.js
npm test > /tmp/forge-npm.log 2>&1; echo "NPM_TEST_EXIT=$?"
```

## before_result
The forge ports were stale — they lacked all new code from the build node. The diffs showed ~140+
changed lines between base and each forge port (all the new snapshotMember/anchorMergeRef helpers,
worktree activation, degraded mode, member-scoped barrier, mergeRef capture, fail-closed runJoin,
and io shim additions).

## after_result (diff outputs — exactly 7 lines each)

### gitlab diff
```
5c5
< // kaola-workflow-parallel-batch.js (issue #281)
---
> // kaola-gitlab-workflow-parallel-batch.js (issue #281)
41,46c41,46
< const NEXT_ACTION = 'kaola-workflow-next-action.js';
< const COMMIT_NODE = 'kaola-workflow-commit-node.js';
< const VALIDATOR   = 'kaola-workflow-plan-validator.js';
< const ADAPTIVE_NODE = './kaola-workflow-adaptive-node';
< const PLAN_VALIDATOR = './kaola-workflow-plan-validator';
< const CLASSIFIER     = './kaola-workflow-classifier';
---
> const NEXT_ACTION = 'kaola-gitlab-workflow-next-action.js';
> const COMMIT_NODE = 'kaola-gitlab-workflow-commit-node.js';
> const VALIDATOR   = 'kaola-gitlab-workflow-plan-validator.js';
> const ADAPTIVE_NODE = './kaola-gitlab-workflow-adaptive-node';
> const PLAN_VALIDATOR = './kaola-gitlab-workflow-plan-validator';
> const CLASSIFIER     = './kaola-gitlab-workflow-classifier';
```

### gitea diff
```
5c5
< // kaola-workflow-parallel-batch.js (issue #281)
---
> // kaola-gitea-workflow-parallel-batch.js (issue #281)
41,46c41,46
< const NEXT_ACTION = 'kaola-workflow-next-action.js';
< const COMMIT_NODE = 'kaola-workflow-commit-node.js';
< const VALIDATOR   = 'kaola-workflow-plan-validator.js';
< const ADAPTIVE_NODE = './kaola-workflow-adaptive-node';
< const PLAN_VALIDATOR = './kaola-workflow-plan-validator';
< const CLASSIFIER     = './kaola-workflow-classifier';
---
> const NEXT_ACTION = 'kaola-gitea-workflow-next-action.js';
> const COMMIT_NODE = 'kaola-gitea-workflow-commit-node.js';
> const VALIDATOR   = 'kaola-gitea-workflow-plan-validator.js';
> const ADAPTIVE_NODE = './kaola-gitea-workflow-adaptive-node';
> const PLAN_VALIDATOR = './kaola-gitea-workflow-plan-validator';
> const CLASSIFIER     = './kaola-gitea-workflow-classifier';
```

### Syntax check
```
gitlab syntax OK  (exit 0)
gitea syntax OK   (exit 0)
```

### Walkthrough
```
Workflow walkthrough simulation passed
WALKTHROUGH_EXIT=0
```

### npm test key results
```
parallel-batch tests passed (117 assertions)
Workflow walkthrough simulation passed
Kaola-Workflow Codex contract validation passed
Kaola-Workflow walkthrough simulation passed
Kaola-Workflow GitLab contract validation passed
GitLab workflow walkthrough simulation passed
GitLab Codex workflow walkthrough simulation passed
Kaola-Workflow Gitea contract validation passed
Gitea workflow walkthrough simulation passed
Gitea Codex workflow walkthrough simulation passed
NPM_TEST_EXIT=0
```

regression-green
