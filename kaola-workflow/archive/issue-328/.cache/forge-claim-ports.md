# Node Evidence: forge-claim-ports (REOPENED — CR1: bundle finalization parity repair)

## task
CR1 plan-repair: mirror root `scripts/kaola-workflow-claim.js` bundle-FINALIZATION logic (the 5
components added in #328) into both forge claim.js ports. The code-review + adversarial-verify
gates found the forge ports had the CLAIM half of bundle support but were missing all five
finalization components. The active-folders/classifier ports from the initial run are correct —
untouched.

## non_tdd_reason
behavior-preserving forge port parity repair — mirror of root bundle-finalization logic modulo
forge nouns; coverage is root tests + forge chains + offline finalize smoke

## write_set
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`

## changes_summary

### 1. `archiveProjectDir` (both ports)

Added `archiveIssueNumbersRaw` pre-read before `renameSync`, per-member loop for roadmap source
removal (single-issue falls through to one iteration), accumulates `removedSources` array, and
returns `roadmap_sources_removed` alongside existing scalar fields. Noun-free — applied verbatim.

### 2. `checkClosureInvariants` (both ports)

Expanded to `memberNumbers = Array.isArray(receipt.issue_numbers) && receipt.issue_numbers.length
? receipt.issue_numbers : [scalar]` and loops the `roadmap-source-absent` + `roadmap-mirror-clean`
checks per member. Bundle violations annotated with `(issue #N)` suffix. Noun-free — applied verbatim.

### 3. `cmdFinalize` (both ports)

Added bundle member array read (`issueNumbers`/`issueIids`) from live folder or null-folder fallback
(archive state), per-member `clearAdvisoryClaim` loop using forge-specific 4-arg form:
- gitlab: `clearAdvisoryClaim(n, reason, {project_id, path_with_namespace}, project)`
- gitea: `clearAdvisoryClaim(n, reason, {full_name, html_url}, project)`

Per-member remote close probe loop (gitlab: `probeIssueState` for both bundle and single-issue;
gitea: same). POST-ATTACH of `issue_numbers`/`closed_issues`/`failed_issue_closures`/
`roadmap_sources_removed` AFTER `buildClosureReceipt` (filter-bypass). Single-issue path
unchanged: scalar call falls through when array length === 0.

### 4. `cmdRelease` (both ports)

Added `if (Array.isArray(folder.issue_numbers) && folder.issue_numbers.length > 0)` bundle branch
with per-member `clearAdvisoryClaim` loop using forge-specific 4-arg signature. Single-issue falls
through to unchanged scalar call.

### 5. `watchMergeRequests`/`cmdWatchPr` (both ports)

Added per-member `clearAdvisoryClaim` loop for MERGED and CLOSED state paths using forge-specific
4-arg form. Primary member's result is the canonical `claimLabelStatus`. Bundle receipt post-attach
(`issue_numbers` + `roadmap_sources_removed`) added AFTER `buildClosureReceipt` for both paths.
Variable names disambiguated: `claimLabelStatus` (merged) vs `claimLabelStatus2` (closed) matching
root pattern.

### Forbidden-token checks
- No `\bgh\b` introduced in gitlab port
- No `\bglab\b` introduced in gitea port
- No `require('../` fallbacks

## verification_commands

```
npm run test:kaola-workflow:gitlab             # exit 0
npm run test:kaola-workflow:gitea              # exit 0
npm run test:kaola-workflow:claude             # exit 0
npm run test:kaola-workflow:codex              # exit 0
node scripts/simulate-workflow-walkthrough.js  # exit 0
# + offline behavioral smoke (see below)
```

## before_result
Baseline claude chain: exit 0 (verified before changes were made).

## after_result
build-green

1. `npm run test:kaola-workflow:gitlab` → exit 0 ("GitLab workflow walkthrough simulation passed")
2. `npm run test:kaola-workflow:gitea` → exit 0 ("Gitea workflow walkthrough simulation passed")
3. `npm run test:kaola-workflow:claude` → exit 0 ("Workflow walkthrough simulation passed")
4. `npm run test:kaola-workflow:codex` → exit 0 ("Kaola-Workflow walkthrough simulation passed")
5. `node scripts/simulate-workflow-walkthrough.js` → exit 0

## Offline Behavioral Smoke: forge bundle FINALIZE (3-issue bundle)

Smoke drove `cmdFinalize` with OFFLINE=1 on a 3-issue bundle (`issue_numbers: N,N+1,N+2`) in a
$TMPDIR git repo with 3 `.roadmap/issue-N.md` files. Script NOT committed to repo.

```
--- gitlab bundle-finalize smoke ---
PASS: gitlab: project folder archived
PASS: gitlab: .roadmap/issue-101.md removed
PASS: gitlab: .roadmap/issue-102.md removed
PASS: gitlab: .roadmap/issue-103.md removed
PASS: gitlab: closure_receipt present
PASS: gitlab: receipt.closed_issues is array
PASS: gitlab: receipt.failed_issue_closures is array
PASS: gitlab: receipt.roadmap_sources_removed is array
PASS: gitlab: roadmap_sources_removed has 3 entries (got 3)
PASS: gitlab: receipt.issue_numbers has 3 entries
PASS: gitlab: roadmap_regenerated field present (value: regenerated)

--- gitea bundle-finalize smoke ---
PASS: gitea: project folder archived
PASS: gitea: .roadmap/issue-201.md removed
PASS: gitea: .roadmap/issue-202.md removed
PASS: gitea: .roadmap/issue-203.md removed
PASS: gitea: closure_receipt present
PASS: gitea: receipt.closed_issues is array
PASS: gitea: receipt.failed_issue_closures is array
PASS: gitea: receipt.roadmap_sources_removed is array
PASS: gitea: roadmap_sources_removed has 3 entries (got 3)
PASS: gitea: receipt.issue_numbers has 3 entries
PASS: gitea: roadmap_regenerated field present (value: regenerated)

--- Smoke summary ---
passed: 22  failed: 0
SMOKE PASSED   exit 0
```
