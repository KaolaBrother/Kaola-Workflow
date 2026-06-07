# Node Registration Evidence — issue-281

## task
Wire `kaola-workflow-parallel-batch.js` into the sync-check list, all three installer SUPPORT_SCRIPT_NAMES blocks, and the npm test chain.

## non_tdd_reason
**Glue / wiring** — adding a script name to a sync-list, three installer array manifests, and the npm test chain. No behavioral logic is introduced; all logic lives in the already-authored parallel-batch script. Verification is the registration checks passing (build-green token).

## write_set
- `scripts/validate-script-sync.js`
- `install.sh`
- `package.json`

## changes_summary
1. `scripts/validate-script-sync.js` — added `'kaola-workflow-parallel-batch.js'` to `COMMON_SCRIPTS` after `kaola-workflow-adaptive-node.js` (comment: `#281 parallel-batch`). Count goes from 17 to 18.
2. `install.sh` — added:
   - `kaola-workflow-parallel-batch.js` to the github/codex base block (after `kaola-workflow-adaptive-node.js`)
   - `kaola-gitlab-workflow-parallel-batch.js` to the gitlab block (after `kaola-gitlab-workflow-adaptive-node.js`)
   - `kaola-gitea-workflow-parallel-batch.js` to the gitea block (after `kaola-gitea-workflow-adaptive-node.js`)
3. `package.json` — added `node scripts/test-parallel-batch.js &&` to `test:kaola-workflow:claude` chain, after `node scripts/test-adaptive-node.js`.

## verification_commands

### Pre-change baseline
```
node scripts/validate-script-sync.js
# OK: 17 common scripts and 7 byte-identical file group in sync.
# exit: 0
```

### Post-change checks
```
node scripts/validate-script-sync.js
# OK: 18 common scripts and 7 byte-identical file group in sync.
# exit: 0

node -e "require('./package.json')"
# exit: 0

bash -n install.sh
# exit: 0

npm test
# exit: 0
```

## before_result
`node scripts/validate-script-sync.js` → OK: 17 common scripts (exit 0)

## after_result
build-green

- `node scripts/validate-script-sync.js` → OK: 18 common scripts (exit 0); parallel-batch.js byte-identity confirmed.
- `node -e "require('./package.json')"` → exit 0 (valid JSON).
- `bash -n install.sh` → exit 0 (shell syntax OK).
- `npm test` → exit 0; `parallel-batch tests passed (75 assertions)` confirmed in output chain.
- Edition port files verified present on disk:
  - `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js` (exit 0)
  - `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js` (exit 0)
