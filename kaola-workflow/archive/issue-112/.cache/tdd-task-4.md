# TDD Task 4 - Create kaola-gitea-workflow-sink-merge.js

## Created File
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js

## RED Evidence
N/A — test file created in Task 5

## GREEN Evidence
node --check plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js
→ exits 0 with no output

## Key adaptations applied
- forge: kaola-gitea-forge, claim: ../../../scripts/kaola-workflow-claim
- readProjectInfo: reads full_name/project_html_url, fallback forge.discoverProject() in try/catch
- closeLinkedIssue: uses forge.createIssueComment (not createIssueNote), returns {comment_id, issue}
- runDirectMerge skipGit path: returns {merged: true, close: closeResult}
- postMergeCleanup: uses forge.createIssueComment + forge.closeIssue
- exit codes: 0=success, 2=FF exhausted, 3=merge-impossible (+sink-fallback.json)
