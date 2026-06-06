# impl-forge-counts — Evidence

## Files changed (4)

1. `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — line 139: `12` → `13` (count + message)
2. `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — line 138: `12` → `13` (count + message)
3. `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — line 1954: `12` → `13`, message updated to "should install 13 agent TOML files"
4. `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — line 1993: `12` → `13`, message updated to "should install 13 agent TOML files"

## RED (before edits)

```
$ node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
Error: expected 12 GitLab agent profiles
    at assert (validate-kaola-workflow-gitlab-contracts.js:19:25)
    at Object.<anonymous> (validate-kaola-workflow-gitlab-contracts.js:139:1)
exit code: 1

$ node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
Error: expected 12 Gitea agent profiles, got 13
    at assert (validate-kaola-workflow-gitea-contracts.js:19:25)
    at Object.<anonymous> (validate-kaola-workflow-gitea-contracts.js:138:1)
exit code: 1
```

## GREEN (after edits)

```
$ node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
Kaola-Workflow GitLab contract validation passed
exit code: 0

$ node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
Kaola-Workflow Gitea contract validation passed
exit code: 0

$ node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
GitLab workflow script tests passed
exit code: 0

$ node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
Gitea workflow script tests passed
exit code: 0
```

## Rationale

These count bumps (12→13) are the direct consequence of adding the `implementer` agent toml to each forge edition (GitLab and Gitea), which increased the agent profile count from 12 to 13 in both plugin directories.
