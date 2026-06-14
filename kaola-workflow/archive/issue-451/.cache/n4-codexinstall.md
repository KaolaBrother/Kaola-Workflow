evidence-binding: n4-codexinstall 056e942eed9d

non_tdd_reason: This node relaxes an installer/preflight schema rule (model_reasoning_effort now OPTIONAL) and removes the retired `--generate-variants`/generateMaxVariants `<role>-max` generator + its dead helpers across two byte-identical script groups (install-codex-agent-profiles.js ×3, kaola-workflow-codex-preflight.js ×4). There is no natural RED→GREEN unit for "make a field optional + delete a code path"; verified by targeted unit assertions on validateProfileText plus the byte-identity contract.

verification_tier: regression-green
- validateProfileText (installer + preflight): omitted effort => [] (PASS); legal effort => [] (PASS); illegal effort => 1 "not one of" reason (PASS); missing name still rejected (PASS).
- exports.generateMaxVariants === undefined (generator + variantConfigBlock + extractConfigBlock + OPUS_ELIGIBLE_ROLES/variantProfileText require all removed; no dead symbol remains).
- RETIRED_PROFILE_FILES now 7 (docs-lookup + the six <role>-max names) so pruneStaleProfiles (installer) removes a surviving -max on upgrade and doctor/preflight flags it stale — NEVER blanket-globs *-max (user-owned preserved via extraUnmanaged).
- node --check syntax OK on canonical; cp propagated to all edition copies.
- validate-script-sync.js exit 0 (23 common, 30 byte-identical groups, 6 rename-normalized families in sync) — both groups byte-identical across editions.

write_set: scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js
