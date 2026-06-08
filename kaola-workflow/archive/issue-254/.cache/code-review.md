node: code-review (code-reviewer, opus) — issue #254, re-review after harden-editions plan-repair

verdict: pass
findings_blocking: 0
finding: id=H1 scope=in_scope action=fix status=resolved severity=high fix_role=none rationale=harden_editions_4_files_correct_3_edition_validators_flag-only_to_default_identical_to_approved_claude_pair_install_test_aligned_to_new_default-ON_behavior_all_five_verification_commands_exit_0

Review summary: harden-editions 4-file diff reviewed and APPROVED. The 3 edition contract validators (codex/gitlab/gitea) apply the identical flag-only->default swap + model comment as the approved claude validator (array now [KAOLA_ENABLE_ADAPTIVE, adaptive, fast|full|adaptive, default, typed refusal]); the only substantive change per file; pre-existing #294 drift untouched. The install test now asserts the new #254 default-ON behavior (bare->true+parallel_mode:auto; =no->false; stale-config-trap stale:true+=no->false+parallel_mode preserved) without weakening cases b/c/f/g/contractor. Previously-red chains now GREEN across all four editions.
Verification (all exit 0): scripts/validate-kaola-workflow-contracts.js; plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js; plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js; scripts/test-install-adaptive-config.js; scripts/validate-workflow-contracts.js. Worktree pristine (only the 18 implement files + untracked ADR + project dir); gate edited nothing.
