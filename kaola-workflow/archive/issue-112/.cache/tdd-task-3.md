# TDD Task 3 - Create kaola-gitea-workflow-sink-pr.js

## Created File
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js

## RED Evidence
N/A — test file created in Task 5

## GREEN Evidence
node --check plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js
→ exits 0 with no output

## Key adaptations applied
- forge: kaola-gitea-forge, claim: ../../../scripts/kaola-workflow-claim
- updateStateSinkBlock: 5 args, writes sink:pr/pr_url/pr_number/full_name/project_html_url
- appendSummary: PR URL/PR Number labels
- ensurePullRequest: calls discoverProject, returns {pr, project}
- skipMetadataCommit defaults true when gitExec/skipPush (intentional coupling)
- mergePullRequest(pr, project, args) calls forge.mergePullRequest(project, pr.pr_number, opts)
