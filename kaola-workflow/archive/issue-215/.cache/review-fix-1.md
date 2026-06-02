# Review Fix 1: Revert heading-locator fence-tracking regression

## What changed
Removed fence-detection block from the heading-locator loop (first `for` loop) in sectionBody() in all 4 classifier editions. The body-collector loop (second for loop) is unchanged. Updated comment to explain why locator has no fence tracking.

## Files modified
- scripts/kaola-workflow-classifier.js (locator loop, comment)
- plugins/kaola-workflow/scripts/kaola-workflow-classifier.js (cp from canonical)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js (same change)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js (same change)
- scripts/simulate-workflow-walkthrough.js (added testClassifierFastScopePreSectionUnclosedFenceRed)
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js (withForge block IIDs 34/35)
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js (withForge block IIDs 34/35)

## RED evidence (failing-first)
- Root: Error: issue #215 regression: unclosed fence before ## Scope must not hide the section; expected red, got green
- GitLab: AssertionError: actual: 'green', expected: 'red'
- Gitea: AssertionError: actual: 'green', expected: 'red'

## GREEN evidence
- node scripts/simulate-workflow-walkthrough.js → Workflow walkthrough simulation passed
- node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js → GitLab workflow script tests passed
- node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js → Gitea workflow script tests passed
- node scripts/validate-script-sync.js → OK: 11 common scripts and 2 byte-identical file groups in sync
- npm test → exit code 0

## Status
COMPLETE
