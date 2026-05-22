# Phase 1 - Research / Discovery: issue-155

## Deliverable
Fix fail-open behavior across all three forge editions (GitHub, GitLab, Gitea): when remote issue validation fails outside `KAOLA_WORKFLOW_OFFLINE=1`, return typed refusals (`remote_validation_unavailable` from classifier, `target_unavailable` from startup) instead of silently returning `green`.

## Why
Prevents silently claiming closed, blocked, or remotely-claimed issues whenever `gh`/`glab`/`tea` is unavailable, unauthenticated, or temporarily failing. Weakens the explicit-target validation contract that the workflow depends on for correctness.

## Affected Area

### GitHub
- `scripts/kaola-workflow-classifier.js:352–359` — `cmdClassify` catch block returns `{ verdict: 'green' }`
- `scripts/kaola-workflow-claim.js:297–312` — `classifyIssue()` wrapper has 3 green leak points (missing classifier file, empty stdout, subprocess crash)
- `scripts/kaola-workflow-active-folders.js:38–47` — `issueIsClosed()` returns `false` on remote failure

### GitLab
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js:253–258,295–300` — `classifyIssue()` and `cmdClassify` both catch and return `green`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:249–255` — claim wrapper catches and returns `green`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js:40–47` — `issueIsClosed()` no OFFLINE guard, returns `false` on failure

### Gitea
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js:258–263,299–304` — same as GitLab
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:252–258` — same as GitLab
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js:40–47` — same as GitLab

### Tests
- `scripts/simulate-workflow-walkthrough.js` — primary test harness, gh-shim pattern established
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — `withFakeForge` pattern
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — `withFakeForge` pattern

## Key Patterns Found
1. Typed refusal shape: `{ status: 'user_target_blocked', claim: 'none', issue, project, reasoning }` — `scripts/kaola-workflow-claim.js:366`
2. Classifier verdict shape: `{ verdict: 'green'|'yellow'|'red'|'blocked'|'owned', reasoning }` — subprocess stdout for GitHub, return value for GitLab/Gitea
3. `cmdStartup` auto-maps `result.status` → `verdict` for non-acquired results (`scripts/kaola-workflow-claim.js:395–402`), so new `target_unavailable` status flows through automatically
4. OFFLINE constant: `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';` — top of each file, no shared helper
5. GitHub uses subprocess dispatch for classifier (`execFileSync`); GitLab/Gitea use direct `require()` in-process call — affects how exceptions propagate

## Test Patterns
- Framework: hand-rolled `assert()` in simulate-workflow-walkthrough.js
- Location: `scripts/simulate-workflow-walkthrough.js` (GitHub), `plugins/*/scripts/test-*-workflow-scripts.js` (GitLab/Gitea)
- Structure: gh-shim Node script in temp `bin/` dir injected via PATH env for GitHub; `withFakeForge(overrides, fn)` for GitLab/Gitea
- New tests needed: (1) failing gh shim → expect `target_unavailable` verdict; (2) same with `KAOLA_WORKFLOW_OFFLINE=1` → expect `green` still

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — explicit offline mode; remote validation skipped when set; must still work after fix
- No new env vars needed

## External Docs
N/A — internal Node.js patterns only (process.env, try/catch, execFileSync, JSON)

## GitHub Issue
KaolaBrother/Kaola-Workflow#155

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | — | Internal Node.js patterns only; no external API/library behavior needed |

## Notes / Future Considerations
- `issueIsClosed` in `readActiveFolders()` path (filtering stale folders): returning false on failure is less dangerous here than in the claim path. The fix should focus on the claim path's reliance on `issueIsClosed`.
- The subprocess vs. direct-call difference means GitHub claim.js must handle classifier process crash (exit code ≠ 0) without mapping to green; GitLab/Gitea claim wrappers must not catch and convert exceptions to green.
- New `remote_validation_unavailable` verdict must be handled in `claimExplicitTarget` routing to produce `target_unavailable` status — same routing pattern as `user_target_blocked`.
