# validator-roles (implementer) — issue #328

## task
Add `'issue-scout'` to the `CANONICAL_ROLES` array (11 → 12 entries) in all 4 plan-validator
editions, as a read-only role not added to WRITE_ROLES / IMPLEMENT_ROLES / GATE_VERDICT_ROLES.

## non_tdd_reason
closed-library list extension — one declarative array entry per validator, existing parse tests cover it

## write_set
- `scripts/kaola-workflow-plan-validator.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js`

## edit made
In each file, CANONICAL_ROLES array was extended on line 54:
```
  'adversarial-verifier', 'implementer', 'issue-scout',
```
(previously ended `'implementer',`). No other lines touched. 'issue-scout' does NOT appear in
WRITE_ROLES, IMPLEMENT_ROLES, or GATE_VERDICT_ROLES in any file.

## build-green

### Baseline (before change)
```
node scripts/simulate-workflow-walkthrough.js
-> Workflow walkthrough simulation passed
-> EXIT:0
```

### Grep confirmation — issue-scout present in CANONICAL_ROLES of all 4 validators
```
scripts/kaola-workflow-plan-validator.js:54:  'adversarial-verifier', 'implementer', 'issue-scout',
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js:54:  'adversarial-verifier', 'implementer', 'issue-scout',
plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js:54:  'adversarial-verifier', 'implementer', 'issue-scout',
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js:54:  'adversarial-verifier', 'implementer', 'issue-scout',
```

### Grep confirmation — issue-scout NOT in any other role set (only 4 hits, all CANONICAL_ROLES)
All 4 occurrences are ONLY in CANONICAL_ROLES. WRITE_ROLES / IMPLEMENT_ROLES / GATE_VERDICT_ROLES
contain no 'issue-scout' entry.

### Byte-diff confirmation — root↔claude pair
```
diff scripts/kaola-workflow-plan-validator.js plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
-> (no output)
-> DIFF_EXIT:0
```
Files are byte-identical.

### Forge port syntax checks
```
node -c plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
-> GITLAB_SYNTAX:0

node -c plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
-> GITEA_SYNTAX:0
```
Both forge ports pass syntax check. Only the CANONICAL_ROLES array was modified (surgical edit);
pre-existing #294 drift in the rest of each file was not touched.

### Root validator JSON self-check on frozen plan
```
node scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-328/workflow-plan.md --json
-> {"result":"in-grammar","decision":"ask","planHash":"7783298e5e6e8b7ac8c335bb68aca1db874443c860d93e271fcbeeefa412c338","sink":"finalize","risk":{"sensitivity":false,"blastRadius":true,"uncertain":false,"reasons":["declared write set touches SHARED_INFRA"]},"nodeCount":19,"diagnostics":{"wideFanout":[]}}
-> VALIDATOR_EXIT:0
```
result: "in-grammar" with valid JSON, exit 0.

### validate-script-sync.js
```
node scripts/validate-script-sync.js
-> OK: 18 common scripts and 7 byte-identical file group in sync.
-> SYNC_EXIT:0
```
Root↔claude byte pair confirmed in sync. No COMMON_SCRIPTS additions made (forge ports are not in
sync list; test-bundle-*.js not added here — that is contracts-registration's node).

### simulate-workflow-walkthrough.js (after change)
```
node scripts/simulate-workflow-walkthrough.js
-> Workflow walkthrough simulation passed
-> WALKTHROUGH_EXIT:0
```
All tests pass. Exit 0.
