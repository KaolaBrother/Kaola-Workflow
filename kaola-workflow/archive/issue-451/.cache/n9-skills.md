evidence-binding: n9-skills 5e4ea7413332

non_tdd_reason: The 3 Codex plan-run SKILLs carry the runtime DISPATCH LOGIC for the Codex executor (not docs) — there is no unit test of SKILL prose. Correctness is verified by running the forge-codex walkthroughs that READ these SKILLs (they previously asserted the `<role>-max`/`model_variant_missing` prose; n8 dropped that assertion, n9 rewrites the prose) plus a token-clean scan.

verification_tier: regression-green
- Rewrote the `## Dispatch` tier->profile paragraph + the step-3 "Pass model per the tier rule" line in all 3 SKILLs (github-codex canonical + gitlab/gitea forge mirrors): always delegate to the base `dispatch.agent_type` profile; when `dispatch.codex_reasoning_effort` is non-null (opus->xhigh) ensure the Codex session effort equals it BEFORE spawning, else leave the standing session effort (base profiles OMIT model_reasoning_effort -> inherit session, PR #14807).
- Token scan: 0 `-max`, 0 `model_variant_missing`, 0 `OPUS_ELIGIBLE` in any of the 3 SKILLs; each now carries `dispatch.agent_type` (2) + `dispatch.codex_reasoning_effort` (2).
- gitlab-codex + gitea-codex walkthroughs: both exit 0 ("workflow walkthrough simulation passed") — the forge-codex SKILL reads succeed with the retired-token check removed.

write_set: plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md
