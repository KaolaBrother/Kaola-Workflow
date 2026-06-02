# Phase 3 - Plan: issue-225

## Blueprint — 16 files edited + rm ./--help (untracked)

### Files to Modify
| # | File | Edit |
|---|------|------|
| #19 | commands/workflow-next.md :161 | delete `` `target_mismatch`, `` (mid-line) |
| #19 | plugins/kaola-workflow-gitlab/commands/workflow-next.md :162 | same |
| #19 | plugins/kaola-workflow-gitea/commands/workflow-next.md :162 | same |
| #19,#25 | plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md | #19 delete `target_mismatch` (:168); #25 repoint :113 + :128 to `kaola-workflow-fast` skill |
| #19 | plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md :171 | delete `target_mismatch` |
| #19 | plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md :169 | delete `target_mismatch` |
| #20 | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js :49,:65-69 | drop gitlab from SHARED_INFRA + delete gitlab areaForPath branch |
| #21 | uninstall.sh :85 | glob `workflow-next"*.md` |
| #22 | install.sh :24 | `trap 'rm -rf "$_TMPDIR"' EXIT` after mktemp -d |
| #23 | scripts/validate-script-sync.js | add 'phantom-advisor hook copies' group (3 copies) after :79 |
| #26 | plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md | add cleanup note (after code-block close ~:586) + safety-guard (append ~:591) |
| #26 | plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md | same (~:586 / ~:590) |
| #26 | plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md | safety-guard ONLY (after ~:130, ${KAOLA_PROJECT}) |
| #26 | plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md | safety-guard ONLY (after ~:129) |
| #26 | plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md | safety-guard ONLY (after ~:129) |
| #30 | .env.example :19,:23 | "(GitHub and GitLab)" → "(GitHub, GitLab, and Gitea)" |
| #19 | (optional) scripts/validate-workflow-contracts.js :96 | add 'target_mismatch' to the `retired` token array (drift-lock root command) |

### Working-tree cleanup (NOT a commit edit)
- #31: `rm -rf -- ./--help` (untracked stray .codex tree). Do NOT touch tracked kaola-workflow/archive/issue-149/.

### Exact note text (#26)
- Cleanup (forge phase6 commands, {project}): "**Main-worktree cleanup is atomic.** `cmdFinalize` now cleans up both the linked worktree's `kaola-workflow/{project}/` AND the main repo's copy. After `fs.renameSync` archives the linked-worktree copy, `archiveProjectDir` compares the resolved main root with the caller root; if they differ, the main repo's copy is removed; when they are the same (e.g. KAOLA_WORKTREE_NATIVE=0 or manual main-repo invocation) the cleanup is a no-op." (forge-normalize the prose to match each forge phase6's voice; keep it behavior-accurate to the implemented script.)
- Safety-guard (forge phase6 {project}; finalize SKILLs ${KAOLA_PROJECT}): "`sink-merge` will refuse with exit 1 if `kaola-workflow/{project}/workflow-state.md` is still present on the branch HEAD when it runs; this is a safety guard that ensures finalize always precedes the merge."

## Build sequence
1. #23 validate-script-sync group → run validator (expect "4 byte-identical file group"); RED-prove (perturb a phantom-advisor copy → exit 1; revert).
2. #19 remove target_mismatch in 6 files (+ optional retired-token lock); grep -rl target_mismatch over the 6 → 0.
3. #20 gitea classifier self-scope.
4. #21 uninstall.sh glob; #22 install.sh trap; bash -n install.sh uninstall.sh.
5. #25 repoint Codex next-SKILL refs (2).
6. #26 forge phase6 commands (both notes) + 3 finalize SKILLs (safety-guard only).
7. #30 .env.example (2 lines).
8. #31 rm -rf -- ./--help.
9. Full acceptance.

## Acceptance
node scripts/validate-script-sync.js (4 groups); bash -n install.sh uninstall.sh; 4 contract validators; node scripts/test-fast-audit.js; all 6 walkthroughs; npm test.
