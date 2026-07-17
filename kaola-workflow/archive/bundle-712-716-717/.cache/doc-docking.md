# Documentation Docking — bundle-712-716-717

## Changed code/config/test/workflow files reviewed

- scripts/kaola-workflow-adaptive-node.js + plugins/kaola-workflow{,-gitlab,-gitea}/scripts/kaola-(gitlab-|gitea-)workflow-adaptive-node.js — #717 versioned codex plugin-cache tuple detection; #712 claude-install detection carve-out + ordered claude profile candidates
- scripts/kaola-workflow-codex-preflight.js + the three byte-identical plugin mirrors — #716 PLAN_BUILTIN_NON_DELEGABLE_ROLES exemption
- scripts/test-adaptive-node.js, scripts/simulate-workflow-walkthrough.js, scripts/test-install-model-rendering.js — RED-first regression fixtures ($TMPDIR-synthesized)
- CHANGELOG.md, docs/api.md — the documentation delta itself (n3)
- kaola-workflow/bundle-712-716-717/** — workflow state (validation-invisible)

## Documents checked

- CHANGELOG.md — covers all three fixes in one [Unreleased] entry: MATCHES the diff
- docs/api.md — preflight vocabulary now states the built-in non-delegable exemption and delegated-role scope of role_not_in_template: MATCHES the diff; n3 verified zero pre-existing runtime-detection prose (no stale detectReviewRuntime/reviewerProfilePath description exists to correct)
- README.md — no feature/usage/env change in the diff: no-impact, skipped
- docs/architecture.md — no structure change: no-impact, skipped
- .env.example — no new env vars: no-impact, skipped
- Inline comments — detection-order contract comments updated at the edit sites (verified in n4 certifier pass)
- Issue comments — posted by the sink at closure (Step 9), not a pre-commit document

## Gaps found and fixed

None. (n3's docs delta was verified line-by-line against the code by the n4 code certifier and the n5 adversarial gate.)

## Explicit no-impact reasons

- README/architecture/.env.example: internal resolver/preflight bug fixes only — no public surface, setup, architecture, or env change.

final verdict: DOCKED
