# Phase 1 - Research / Discovery: issue-225

## Deliverable
Nine independent prompt/doc/repo-hygiene fixes (mostly documentation; no runtime impact unless noted), verified against the current tree (post #220/#230/#222):
- #19 remove the stale `target_mismatch` typed-refusal token from 6 live prompt files (emitted by no script).
- #20 self-scope the Gitea classifier (drop foreign `kaola-workflow-gitlab/` entries from SHARED_INFRA + areaForPath).
- #21 uninstall.sh removes legacy `workflow-next-pr.md` (glob the COMMANDS entry).
- #22 install.sh `trap 'rm -rf "$_TMPDIR"' EXIT` so the curl|bash clone is cleaned on inner-install failure.
- #23 add a phantom-advisor hook BYTE_IDENTICAL_GROUP (3 copies) to validate-script-sync.js.
- #25 repoint the 2 functional Codex skill refs from the non-shipped `commands/kaola-workflow-fast.md` to the in-distribution `kaola-workflow-fast` skill (keep the provenance "Mirror of" note).
- #26 port the two phase6 prose notes (atomic main-worktree cleanup; sink-merge exit-1 safety guard) to the forge phase6 commands + the safety-guard note to the 3 finalize SKILLs.
- #30 .env.example: widen two test-hook parentheticals to "(GitHub, GitLab, and Gitea)".
- #31 remove the stray untracked `./--help` dir (working-tree cleanup only).

## Why
Each is confirmed drift/hygiene: a refusal token no script emits (#19), a cross-forge asymmetry (#20), an uninstall gap (#21), a temp-dir leak (#22), an unguarded byte-identical group (#23), dangling skill refs (#25), prose parity drift (#26), an understated env-var scope (#30), and working-tree cruft (#31).

## Affected Area (verified current line numbers; corrections to issue text)
- #19: 6 files — commands/workflow-next.md:161 + gitlab:162 + gitea:162 (commands) and the 3 kaola-workflow-next SKILLs (Codex:168, gitlab:171, gitea:169). (Issue said "command + 3 ports + SKILLs" — ground truth is these 6.)
- #20: gitea classifier `:49` (SHARED_INFRA) + `:65-69` (areaForPath gitlab branch). #230 edited classifyIssue/cmdClassify (different region) — no conflict.
- #21: uninstall.sh COMMANDS array `:85`. #22: install.sh `mktemp -d` `:24`.
- #23: scripts/validate-script-sync.js BYTE_IDENTICAL_GROUPS (root-only). 3 phantom-advisor copies (root + gitlab + gitea; NO Codex copy — corrects the 4-file guess), md5 cee811e4. Coexists with #220's resolve-agent-model group.
- #25: plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:113,128 (functional, repoint) + fast SKILL:9 (provenance, KEEP). #222 added the Mid-Flight Escalation/Resume Detection headings the refs now describe.
- #26: source root commands/kaola-workflow-phase6.md:579 (cleanup) + :589 (safety-guard). CORRECTION: all 3 finalize SKILLs already have the cleanup note → safety-guard only; forge phase6 commands need both. Notes are forge-agnostic.
- #30: .env.example:19,23 (KAOLA_WORKFLOW_FORCE_FF_FAIL / KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE).
- #31: ./--help (untracked, stray .codex tree); ./issue-149 already gone. Must NOT touch tracked kaola-workflow/archive/issue-149/.

## Linked issue
GitHub #225 (grouped doc/hygiene tracker: #19-23, #25, #26, #30, #31). Acceptance: all sub-items applied, byte-sync (now 4 groups) + contract validators + full suite green.
