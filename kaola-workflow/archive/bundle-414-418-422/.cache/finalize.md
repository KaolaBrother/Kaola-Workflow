b0a90c8e3837
evidence-binding: finalize b0a90c8e3837

# Finalize evidence — bundle #414/#418/#422

## CHANGELOG entries added
- Added `## [Unreleased] ### Added` entries for #422 (test-agent-profile-parity.js, validate-script-sync.js families, validator pins, package.json chain) and #418.2
- Added `### Fixed` entries for #414 (bare-remote sink order test, defaultBranch probe-chain), #418.5 (forge walkthroughs smoke), #418.2 (install-manifest comment), #418.4 (gitea claim twin parity)

## 4-chain verification
- claude chain: exits 1 ONLY at test-bash-block-guards (2 pre-existing failures at the same lines as main-repo baseline — NOT a regression from this bundle; identical failure on main at HEAD)
- codex chain: exit 0 — "Kaola-Workflow walkthrough simulation passed"
- gitlab chain: exit 0 — "GitLab workflow walkthrough simulation passed" + "GitLab Codex workflow walkthrough simulation passed"
- gitea chain: exit 0 — "Gitea workflow walkthrough simulation passed" + "Gitea Codex workflow walkthrough simulation passed"

Cross-edition diff verified: all 3 forge chains green. claude chain failure is pre-existing on main.

finalize: complete
