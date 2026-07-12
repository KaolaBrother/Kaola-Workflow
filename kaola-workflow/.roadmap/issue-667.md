issue: #667
title: bug(overlap-guard): unclosed fence in fast-summary silently disables the claim-overlap guard — decide fail direction
status: open
workflow_project: —
next_step: DECISION FIRST (value call on failure direction, consent-valve shaped). Commit 0b0dc5a0 (#660) flipped the unclosed-fence fast-summary case red→green (test-gitlab-workflow-scripts.js:954): structurally-ambiguous Scope → sectionBody '' → no write set → overlap guard silently GREENs — a fail-closed claim-overlap defense became fail-open on malformed self-authored input, and the removed pre-#660 comment warned this exact false-GREEN; the trade is recorded nowhere. Decide: ambiguous Scope classifies indeterminate/blocked (restore protective intent; scanner still refuses to manufacture sections) vs affirm fail-open with a recorded rationale. Fix (S) after decision; all-editions classifier consumers. Full body on GitHub #667.
