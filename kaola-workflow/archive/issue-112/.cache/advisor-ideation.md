# Advisor Output — Issue 112 Phase 2

## Recommendation
Approach B confirmed: direct port with localized adaptation. Signature changes
(mergePullRequest, createIssueComment) are structural, not cosmetic — sed substitution would produce broken code.

## Key Findings

1. tea pr create: forge adapter uses cwd-based resolution (no --repo flag in createPullRequest).
   Tests use execFileSync injection — no real tea binary needed. No change required.

2. Worktree helpers: getCoordRoot, readActiveFolders, removeWorktree are exported from
   scripts/kaola-workflow-claim.js at lines 631/634/636. Import works.

3. State schema: base claim.js ignores unknown keys in ## Sink block. Adding full_name,
   project_html_url is backward-compatible.

4. path_with_namespace pattern: GitLab claim.js writes it (not sink-mr). For Gitea,
   sink-pr writes full_name since claim.js doesn't exist yet. Pragmatically correct;
   claim.js (issue #113) can supersede when ready.

5. Missing-full_name fallback test: REQUIRED, not optional. readProjectInfo fallback to
   discoverProject() must have an explicit test case for older state files.

## Out of Scope
- mr_auto_merge MEDIUM follow-up from issue #114 — do NOT pull into #112; belongs in #115/#117.

## Confirmed Approach
B — direct port with localized adaptation.
