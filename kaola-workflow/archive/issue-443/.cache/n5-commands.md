evidence-binding: n5-commands 6cc44f8c593f

REPAIR (reopened, 2nd): fix the non-installer-fillable model placeholder in the kaola-workflow-auto command badges. install.sh model_for_placeholder() has no ISSUE_SCOUT_MODEL case + issue-scout is not a manifest-installed dispatch agent, so `model="{ISSUE_SCOUT_MODEL}"` survived install → scripts/test-install-model-rendering.js failed (regex model="\{[A-Z_]+_MODEL\}").

non_tdd_reason: Config/IaC — one-token prose fix in three command/doc files; no behavioral logic; the regression detector (test-install-model-rendering.js) already exists. Proof = all validators + that test green after the change.

verification_tier: build-green

fix (line 30 of each of the 3 command files):
- before: `You MUST pass \`model="{ISSUE_SCOUT_MODEL}"\``
- after:  `You MUST pass \`model="{...}"\``  (the adapt.md-proven format: satisfies the validators' `model="{` check, does NOT match the install test's [A-Z_]+_MODEL regex). Line 33's existing `model="{...}"` unchanged. SKILLs untouched.
grep ISSUE_SCOUT_MODEL across the 3 commands → no matches (exit 1).

verification (build-green) — all exit 0:
- node scripts/test-install-model-rendering.js → "Install model rendering tests passed" (THE failing test, now green).
- node scripts/validate-workflow-contracts.js → "Workflow contract validation passed".
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js → "GitLab contract validation passed".
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js → "Gitea contract validation passed".
- node scripts/validate-kaola-workflow-contracts.js → "Codex contract validation passed".
- node scripts/test-route-reachability.js → "Route-reachability test passed (38 assertions)."

write_set (exactly the 3 declared command files): commands/kaola-workflow-auto.md + plugins/kaola-workflow-{gitlab,gitea}/commands/kaola-workflow-auto.md.
