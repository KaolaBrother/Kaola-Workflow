# Phase 4 - Progress: issue-225

## Applied (all 9)
- #23 scripts/validate-script-sync.js: added 'phantom-advisor hook copies' group (3 copies). RED-proven: perturb gitlab copy → exit 1 "phantom-advisor hook copies: ...gitlab... differs"; restore → exit 0 "OK: 10 common scripts and 4 byte-identical file group in sync."
- #19: removed `target_mismatch` from 6 files (commands/workflow-next.md:161, gitlab:162, gitea:162; next-SKILLs Codex:168, gitlab:171, gitea:169). grep -rl target_mismatch over the 6 → 0. Optional retired-lock APPLIED to scripts/validate-workflow-contracts.js + Codex byte copy (COMMON_SCRIPTS) via `['target','mismatch'].join('_')` (so the validator doesn't flag itself); cmp confirms byte-identical.
- #20 gitea classifier: dropped 'plugins/kaola-workflow-gitlab/scripts' from SHARED_INFRA (:49); deleted the gitlab areaForPath branch (:65-69).
- #21 uninstall.sh:85 → glob `workflow-next"*.md`.
- #22 install.sh:24 → `trap 'rm -rf "$_TMPDIR"' EXIT` after mktemp -d.
- #25 Codex next-SKILL:113,128 repointed to `kaola-workflow-fast` skill; fast SKILL:9 provenance untouched.
- #26 confirmed all 3 finalize SKILLs already had the cleanup note (Codex:118, gitlab:124, gitea:124) → added SAFETY-GUARD only (${KAOLA_PROJECT}); forge phase6 commands (gitlab+gitea) got BOTH notes ({project}).
- #30 .env.example:19,23 → "(GitHub, GitLab, and Gitea)".
- #31 rm -rf -- ./--help (untracked stray .codex tree; not in commit; tracked archive/issue-149 untouched).

## Acceptance (all exit 0)
validate-script-sync (4 groups); bash -n install.sh uninstall.sh; 4 contract validators; test-fast-audit (45 assertions); root + gitlab + gitea walkthroughs.

## Files modified: 18 tracked
16 from blueprint + 2 (validate-workflow-contracts.js root + Codex byte copy for the #19 retired-lock). ./--help removed (untracked).

## For Phase 5
- Re-prove #23 bite (perturb a phantom-advisor copy → exit 1).
- Confirm #19 grep→0 + retired-lock byte-identical (validate-workflow-contracts root↔Codex).
- Confirm #20 gitea-only (gitlab classifier unchanged), #25 fast-SKILL:9 untouched, #26 no duplicate cleanup note in finalize SKILLs.
- Scope: 18 files, no conflict with #220/#230/#222.
- Security: #22 trap (shell), #20 classifier self-scope — light note; no untrusted-input/injection surface.
