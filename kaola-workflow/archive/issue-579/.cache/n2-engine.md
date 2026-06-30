evidence-binding: n2-engine 7662b76a4dd9

## Defect

Cross-edition propagation gap: `scripts/kaola-workflow-active-folders.js` (canonical) and `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` (codex twin) were updated in #579 to parse and surface three new liveness-marker fields (`main_root`, `session_marker`, `claim_ts`) from `workflow-state.md`. The two forge ports were NOT updated:

- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js`

Consequence: in both forge editions, `readActiveFolders()` items returned `session_marker: undefined`. `classifyLane` checks `lane.session_marker === ownSession` as its first (highest-priority) bucket; with `undefined`, it always falls through to `stale`. A session's own live lane was therefore never classified `mine` in gitlab/gitea editions — breaking `cmdResume` auto-select, `cmdStatus` labeling, and the issue-scout co-tenant collision guard in 2 of 4 editions.

## RED

RED: testGitlabActiveFoldersSessionMarker579 — AssertionError: '#579(gl): readActiveFolders item.session_marker must be "s-MINE-session-579gl", got: undefined' (actual: undefined, expected: 's-MINE-session-579gl', operator: strictEqual) — pre-fix, gitlab parseStateFile did not parse session_marker so readActiveFolders items returned undefined for the field, classifyLane fell to stale bucket.

RED: testGiteaActiveFoldersSessionMarker579 — AssertionError: '#579(gt): readActiveFolders item.session_marker must be "s-MINE-session-579gt", got: undefined' (actual: undefined, expected: 's-MINE-session-579gt', operator: strictEqual) — pre-fix, gitea parseStateFile did not parse session_marker so readActiveFolders items returned undefined for the field, classifyLane fell to stale bucket.

## Fix applied

Added `main_root`, `session_marker`, `claim_ts` to BOTH places in EACH forge port (mirroring the canonical pattern verbatim, using the existing `field(content, '<name>')` helper):

1. `parseStateFile` return object — parses all three fields from content with `|| ''` backward-compat default.
2. `readActiveFolders` item construction — propagates the three parsed fields with `|| ''` default.

Files changed:
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js` (parseStateFile return + readActiveFolders item)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js` (parseStateFile return + readActiveFolders item)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (added testGitlabActiveFoldersSessionMarker579)
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (added testGiteaActiveFoldersSessionMarker579)

Codex twin (`plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js`) already had the fields — confirmed, no change needed.

## GREEN

GREEN: testGitlabActiveFoldersSessionMarker579 passes; readActiveFolders item.session_marker = 's-MINE-session-579gl', classifyLane bucket = 'mine'. GitLab suite: all assertions green, "GitLab workflow script tests passed".

GREEN: testGiteaActiveFoldersSessionMarker579 passes; readActiveFolders item.session_marker = 's-MINE-session-579gt', classifyLane bucket = 'mine'. Gitea suite: all assertions green, "Gitea workflow script tests passed".

## Verification results

- `node scripts/validate-script-sync.js`: OK (25 common scripts, 25 byte-identical groups, 8 rename-normalized families, 1 config/hooks.json family, and 7 forge export-superset families in sync)
- `node scripts/edition-sync.js --check`: edition-sync: 12 forge aggregator ports in rename-normalized parity with canonical
- gitlab forge test: testGitlabActiveFoldersSessionMarker579: PASSED + GitLab workflow script tests passed
- gitea forge test: testGiteaActiveFoldersSessionMarker579: PASSED + Gitea workflow script tests passed
- `node scripts/test-claim-hardening.js`: claim-hardening tests passed (149 assertions)
