# Advisor — Plan Gate: issue-151

## Verdict: REVISION NEEDED

## Issue
Edits 3, 8, and 9a use `(GitHub/Gitea)` grouping for script file names, which is factually wrong. `kaola-workflow-sink-pr.js` and `kaola-workflow-claim.js` are GitHub-only scripts — Gitea has distinct `kaola-gitea-workflow-sink-pr.js` and `kaola-gitea-workflow-claim.js` scripts.

Phase 1 naming table is unambiguous:
- Claim: GitHub=`kaola-workflow-claim.js`, Gitea=`kaola-gitea-workflow-claim.js`
- PR sink: GitHub=`kaola-workflow-sink-pr.js`, Gitea=`kaola-gitea-workflow-sink-pr.js`

`docs/api.md:11` (the reference convention) uses three-entry triads for all script names.

## Correction Rule
- **Script names** → three-entry triad
- **Subcommand names** that genuinely match (e.g. `watch-pr` shared by GitHub+Gitea) → grouping OK when subcommand is the subject; NOT OK when script file name is the subject

## Required Fixes
- **Edit 3 (line 467 cell):** `` `kaola-workflow-sink-pr.js` (GitHub) / `kaola-gitlab-workflow-sink-mr.js` (GitLab) / `kaola-gitea-workflow-sink-pr.js` (Gitea) ``
- **Edit 8 (line 583 tail):** name all three sink scripts with three-entry triad
- **Edit 9a (line 598):** name all three claim scripts, or restructure as per-forge subcommand note

## Everything Else: OK
- Guarded substrings preserved correctly
- Retired-tokens list does not collide with new wording
- Edits 9b/9c duplicate-substring hazard correctly handled
- Edit 7 vs 10b casing correctly noted
- Subcommand-table Usage column staying GitHub-default: correct
- Edits 6, 11 have no script-name grouping problem (name subcommands not scripts)
