evidence-binding: n6-installed-contract-proof e4f670abbcf7
upstream_read: n1-architecture ea05782ab1d5
upstream_read: n2-profile-contracts ca71dbdf270d
upstream_read: n3-validation-runner 7eb9cc90efb9
upstream_read: n4-review-engine 01af83fb4cdf
upstream_read: n5-runtime-guidance 68ac15fe7117

# n6 installed contract proof

role: tdd-guide
assigned_task: Reconcile installer metadata with generated reviewer profiles, prove exact repository-to-installed identities for Claude and all three Codex editions, make doctor/preflight source and plugin-cache drift fail closed, and pin the integrated runner/reviewer-v2 contract into every validator.
validation_verdict: focused-four-edition-green
delegation_outcome: completed

RED: `node scripts/test-install-model-rendering.js` first exited 1 because removing `behavior_contract_version` produced no typed `reviewer_contract_version_missing` refusal; after the Codex wall was green, the new Claude installed-byte assertion exited 1 because the installer retained the generated source self-hash `b878661b86c796b15a51b2169163b143df690816418bb9282b93e3a1cb40a489` after rewriting `model: inherit`, instead of recomputing the installed-byte self-hash `3cef03b856b3468c21ff84eca1f195a3671d3cddb0fe5a0538639a87f8806258`; closed-schema mutations then exited 1 because adapter fields appended after `developer_instructions`, including dotted TOML keys, produced only self-hash mismatches rather than `reviewer_adapter_field_forbidden`.
GREEN: `node scripts/test-install-model-rendering.js` exits 0; source-version/hash/closed-schema mutations refuse, Claude installs are deterministic inherit-rewritten generated profiles with recomputed self-hashes and five-column identity manifest rows, Codex installs are exact selected-source bytes with exact file/behavior/resolved hashes, project drift autofixes through the exact installer command, and plugin-cache drift is read-only but doctor-gating with an exact refresh command.
REFACTOR: Reviewer identity verification was centralized inside each installer/preflight family, all three Codex installers remain byte-identical, all four preflights remain byte-identical, and validators now pin generation, validation-runner distribution, reviewer-v2 lifecycle exports, and all authoring/execution/finalization surfaces.

## Implemented contract

- The three `config/agents.toml` catalogs now carry the exact generated runtime-neutral descriptions for `code-reviewer` and `adversarial-verifier`.
- Codex source validation requires behavior contract version 2, exact behavior-core identity, one valid complete-byte `resolved_profile_hash`, a closed top-level reviewer schema, and inheritance by omission. Source drift refuses before writes and reports exactly `node scripts/generate-reviewer-profiles.js --write && node scripts/generate-reviewer-profiles.js --check`.
- Codex installed profiles are byte-identical to the selected source. `.kaola-managed-profiles.json` keeps exact installed file hashes and adds reviewer behavior version/hash plus resolved-profile hash; post-install verification compares every installed profile with its source.
- Claude source generation is checked before agent writes. The documented `model: inherit` rewrite is followed by deterministic resolved-profile self-hash recomputation, exact expected-byte verification, behavior-core equality, and a five-column managed-manifest reviewer row.
- The Claude installer states the proof boundary verbatim: `filesystem bytes only; runtime prompt loading is not attested`. No private or proprietary runtime prompt-loader claim is made.
- Preflight validates source profile identity, installed bytes, manifest identity, and exact repairs. Doctor reports repository, user, project, and plugin-cache scopes; plugin-cache inspection remains read-only but stale schema or bytes now fails the gate and reports `codex plugin remove <plugin>@<marketplace> && codex plugin add <plugin>@<marketplace>  # refresh plugin cache`.
- Repository validators now prove generated profile currency, source/install identity, validation-runner registration and byte parity, reviewer-v2 engine exports, legacy-v1 boundary retention, and all six-surface authoring/execution/finalization marker families.

## Configuration and distribution proof

- Codex installer SHA-256, all three editions: `eae4aae022b3cbb27f102ae05252e9fec5794c87a0266cd6faba8948202b69b4`.
- Codex preflight SHA-256, root plus all three editions: `6e23c3eb5ecbd5ac4f931870126df83f7612a64f59915f9c51f0347329c3015c`.
- Claude workflow validator SHA-256, root plus plugin mirror: `8b9a3f9d0899e57c176c6e11c0cb87cd00fa436ba6dcbca5d2d7ed1d8f3a7ce0`.
- All three config catalogs passed both forge forbidden-token checks after reconciliation.
- All three plugin preflight copies passed both forge forbidden-token checks after the final changes.
- The shared plugin walkthrough passed both forge forbidden-token checks. Both forge-specific workflow test files were run through both checks as required; their full-file scans retain expected pre-existing edition-native literals and intentional forbidden-token fixtures, while a diff-only scan proves their installed-contract additions introduce no forbidden references.
- Standalone forbidden-only scanning of the validator implementations themselves still exits 1 on their pre-existing self-referential `./scripts` checker vocabulary; a diff-only scan of all added validator lines passed both forbidden-token pattern sets. The full GitLab and Gitea contract validators both pass.

## Bounded installed-byte/hash matrix

All rows below were produced by fresh temporary HOME/project installs and deleted immediately afterward. `exact=true` means the installed bytes equal the required deterministic transformation/source, and every manifest hash matched the installed SHA-256.

| Runtime/edition | Role | Source SHA-256 | Installed SHA-256 | Behavior hash | Resolved profile hash | Exact |
|---|---|---|---|---|---|---|
| Claude higher | code-reviewer | `a29ac6a0094fb2f6e5e12811087283760bbeb0abddb65a036c5b55a59093852f` | `99eafb519ad3199976dcf8dbd88ee9648c85722164b3066da16306216a35d219` | `3a29bbdbeb3541e0b4e53a21b3e67e28f8cae346024dbe6972c4d942d1baf735` | `3cef03b856b3468c21ff84eca1f195a3671d3cddb0fe5a0538639a87f8806258` | true, documented inherit rewrite |
| Claude higher | adversarial-verifier | `1ca02e0a8c3bf701b4a0ceec67d6cef590d946e6f39d6fa2fdb0af6bcecc01e3` | `6554c61a6edaed07d0bd94e30b1c8bd98de0220b8aad4948a062ac128d6c7a10` | `0ad9331a05da66b2b18f4eb67facd1b686bd9dd3e8b5398399d4738cafed6e9b` | `17974986b3e593a6cd02436f2992e7bc5b9e82629bfea6f4dcd0d89ac4d8da9f` | true, documented inherit rewrite |
| Codex, all three editions | code-reviewer | `7fd5e2c019fb89aaebb97df72f9d380d6016bc63c9c3c7e07bf79ad24854f0c5` | `7fd5e2c019fb89aaebb97df72f9d380d6016bc63c9c3c7e07bf79ad24854f0c5` | `3a29bbdbeb3541e0b4e53a21b3e67e28f8cae346024dbe6972c4d942d1baf735` | `b3d03da020e0eace0a969e29971c8c345f1f9e555ee6ad9c2487a95f1107fa57` | true, exact source bytes |
| Codex, all three editions | adversarial-verifier | `51aa9cd77fc86b3bd52fb4e836e6020d8e0d768da51b94017321ff994848aa65` | `51aa9cd77fc86b3bd52fb4e836e6020d8e0d768da51b94017321ff994848aa65` | `0ad9331a05da66b2b18f4eb67facd1b686bd9dd3e8b5398399d4738cafed6e9b` | `7345474b3844e5ee7abc8e292a3e669ecb918eeeaaf9229420cb97300e4ba996` | true, exact source bytes |

## Changed files

- `install.sh`
- `scripts/kaola-workflow-codex-preflight.js`
- `scripts/test-install-model-rendering.js`
- `scripts/validate-vendored-agents.js`
- `scripts/validate-workflow-contracts.js`
- `scripts/validate-kaola-workflow-contracts.js`
- `plugins/kaola-workflow/config/agents.toml`
- `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js`
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
- `plugins/kaola-workflow-gitlab/config/agents.toml`
- `plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- `plugins/kaola-workflow-gitea/config/agents.toml`
- `plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`

## Commands and results

- Exact architecture Task-5 validation chain (`test-install-model-rendering` through both forge workflow-script suites) -> exit 0 against the final bytes.
- `bash -n install.sh` -> exit 0.
- `node scripts/test-install-model-rendering.js` -> exit 0; `Install model rendering tests passed`.
- `node scripts/test-install-upgrade-rewrite.js` -> exit 0.
- `node scripts/test-install-adaptive-config.js` -> exit 0.
- `node scripts/generate-reviewer-profiles.js --check` -> exit 0; generation check passed.
- `node scripts/test-agent-profile-parity.js` -> exit 0; 275 assertions passed.
- `node scripts/test-validation-runner.js` -> exit 0.
- `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` -> exit 0; full Codex plugin walkthrough passed.
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` -> exit 0.
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` -> exit 0.
- `node scripts/validate-vendored-agents.js` -> exit 0.
- `node scripts/validate-workflow-contracts.js` -> exit 0.
- `node scripts/validate-kaola-workflow-contracts.js` -> exit 0.
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` -> exit 0.
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` -> exit 0.
- `node scripts/validate-script-sync.js` -> exit 0; 24 common scripts, 28 byte-identical groups, 8 normalized families, 2 hooks families, and 7 export-superset families in sync.
- `node scripts/test-validate-script-sync.js` -> exit 0; 48 assertions passed.
- `node scripts/edition-sync.js --check` -> exit 0.
- `node scripts/test-install-manifest-single-source.js` -> exit 0.
- `node scripts/test-route-reachability.js` -> exit 0; 1400 assertions passed.
- `node scripts/test-generate-routing-surfaces.js` -> exit 0; 172 assertions passed.
- `node scripts/test-release-surface-drift.js` -> exit 0; 9 assertions passed.
- `node --check` on all 17 changed JavaScript implementation/test/validator files -> exit 0.
- `checkEvidenceShape` with the seeded node id/nonce -> exit 0; n6 evidence shape and binding passed.
- `checkUpstreamConsumed` against the frozen plan and current upstream cache bindings -> exit 0.
- `git diff --check` -> exit 0.
- Bounded temp-install matrix command -> exit 0; all Claude/Codex source, installed, manifest, behavior, and resolved hashes matched the table above.

## Residual risks and boundaries

- No live user, global Codex, Claude plugin, or plugin-cache installation was refreshed. All installation and cache-drift behavior was exercised in disposable temporary homes/projects; any real stale plugin cache still requires the emitted explicit remove/add refresh command.
- Filesystem bytes and deterministic manifests are proven. Private runtime prompt loading is intentionally not attested because the runtimes expose no public loader introspection contract here.
- The complete package-wide four-chain release suite remains assigned to downstream final validation by the frozen plan. This node ran every changed installer/preflight test, all four contract validators, the full Codex plugin walkthrough, generation/runner/profile/routing/sync gates, and bounded installed-byte proofs.
