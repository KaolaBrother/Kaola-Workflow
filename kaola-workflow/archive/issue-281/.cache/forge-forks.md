# Node Evidence: forge-forks

## task
Create gitlab/gitea forge forks of the new `parallel-batch.js` and apply the readyPending+active additive change to the existing gitlab/gitea `next-action` forks.

## non_tdd_reason
Behavior-preserving renamed ports of root scripts (`kaola-gitlab-workflow-*` / `kaola-gitea-workflow-*`); no new behavior — no natural failing unit test. Coverage is the root tdd-guide suites (test-parallel-batch.js, test-next-action.js) plus the forge structural/parity checks.

## write_set
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js (CREATED)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js (CREATED)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js (MODIFIED)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-next-action.js (MODIFIED)

## forge rename discipline (learned from existing pairs)

From `diff scripts/kaola-workflow-commit-node.js plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js`:
- Line 33: `VALIDATOR = 'kaola-workflow-plan-validator.js'` → `kaola-gitlab-workflow-plan-validator.js`

From `diff scripts/kaola-workflow-adaptive-node.js plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`:
- Header comment (line 5): filename renamed
- Sibling constants `COMMIT_NODE`, `NEXT_ACTION`, `VALIDATOR`: prefixed with `kaola-gitlab-workflow-`
- `require('./kaola-workflow-plan-validator')`: renamed to `./kaola-gitlab-workflow-plan-validator`

`kaola-workflow-adaptive-schema` is NOT renamed (byte-identical across editions — confirmed from next-action and adaptive-node forks).

`spliceLedgerNode` export confirmed in both forge adaptive-node forks (grep verified at lines 78/90/835).

## parallel-batch fork diff (rename-only confirmation)

`diff scripts/kaola-workflow-parallel-batch.js plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js`:
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
Gitea fork: identical pattern with `kaola-gitea-workflow-` prefix. No other differences.

## next-action fork diff (additive block + rename-only confirmation)

After modification, both forks differ from root ONLY by the require rename line:

`diff scripts/kaola-workflow-next-action.js plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js`:
```
27c27
< const { parseNodes, parseLedger } = require('./kaola-workflow-plan-validator');
---
> const { parseNodes, parseLedger } = require('./kaola-gitlab-workflow-plan-validator');
```
Gitea fork: identical pattern with `kaola-gitea-workflow-plan-validator`. The additive block (comment header lines 15-17, explanation comment lines 20-22, readyPending/active compute block at section 7, return fields) is byte-identical to root in both forks.

## verification_commands

### baseline (before changes)
- `node scripts/simulate-workflow-walkthrough.js` → exit 0 "Workflow walkthrough simulation passed"
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → exit 0 "GitLab workflow script tests passed"
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → exit 0 "Gitea workflow script tests passed"

### after changes
- `node scripts/simulate-workflow-walkthrough.js` → exit 0 "Workflow walkthrough simulation passed"
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → exit 0 "GitLab workflow script tests passed"
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → exit 0 "Gitea workflow script tests passed"

### parse checks (new fork status subcommand, no active batch → active:false is correct)
- `node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js status --project issue-281 --json` → `{"result":"ok","active":false,"inProgress":["forge-forks"],"crossCheck":{"valid":true,"orphan":false,"reason":"single_in_progress"}}` (exit 0)
- `node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js status --project issue-281 --json` → `{"result":"ok","active":false,"inProgress":["forge-forks"],"crossCheck":{"valid":true,"orphan":false,"reason":"single_in_progress"}}` (exit 0)

## build-green

All verification checks passed. build-green.
