evidence-binding: n7-validators 9417676d75bc

non_tdd_reason: Contract-validator change to assert the post-#451 source-tree state. The natural RED was already present after n5/n6: the github validator's deriveCodexRoleCatalog asserted a `model_reasoning_effort` line on every base profile (n6 stripped all 42), and the two forge validators hard-assert `agentFiles.length === 20` (n5 deleted the 6 -max → 14). These are validators (no unit test of their own); correctness is "run the three validators GREEN against the real tree".

verification_tier: regression-green
- github validate-kaola-workflow-contracts.js: deriveCodexRoleCatalog now derives the role SET only (no effort assert); the README `| Role | Reasoning effort |` table contract removed; the retired-role guard re-scoped to the role-list block (blockMatch); the #405 -max derivation guard (OPUS_ELIGIBLE_ROLES/variantProfileText byte-derivation) replaced by a #451 FORBID (0 `*-max.toml`, 0 `[agents.*-max]`); the two `<role>-max`/`model_variant_missing` SKILL pins removed. Run => exit 0 ("contract validation passed").
- gitlab + gitea validators: count assert flipped `=== 20` -> `=== 14` ("14 base; <role>-max retired #451"); the -max derivation guard replaced by the same #451 FORBID; the SKILL `<role>-max`/`model_variant_missing` pins removed; schema-wall comment "a legal" -> "an optional" model_reasoning_effort. Run => both exit 0.
- Residual scan: 0 live (non-comment) `OPUS_ELIGIBLE`/`variantProfileText`/`=== 20` in any validator.
- validate-script-sync exit 0 (the 3 validators are edition-specific, not a byte/rename group — independent edits, sync unaffected).

write_set: scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
