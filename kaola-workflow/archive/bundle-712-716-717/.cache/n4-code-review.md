evidence-binding: n4-code-review 483d04c1c98f
contract_version: 2
plan_schema_version: 2
behavior_contract_version: 2
review_context_hash: 4ebe8f0fe7f5d19812b31ad00b379c7234c7057560cbcef4598f2f5673357f9e
behavior_contract_hash: 42b6332c311ce07c511d67d3c7fb02cf874ab94872aaee87fadae2d0577fa789
resolved_profile_hash: 4f9e7c9aad33216895b1e618d06ad1bfb3beeea55af7094643af59ec927c8b6a
candidate_digest: b8b618a4f2ef7a056e9ef535cd5bd2105a54083b319ecabbb2af9b8d6d342a97
gate_mode: change_gate
upstream_read: n3-documentation 91d32191ea7f
upstream_read: n1-reviewer-profile-resolution 0126b9d3ef32
upstream_read: n2-preflight-builtin-roles faef57844c0a

## Verification performed (against the actual diff, in the run worktree)

Candidate = synth commit 683e4171 (n1+n2 legs) over base a1b3a1ed plus n3 docs (CHANGELOG.md, docs/api.md). Review context read first: validation_obligations: [] — zero inherited obligations, no validation-runner receipt required.

#712 — claude native-install candidate order + fail-closed default: VERIFIED
- scripts/kaola-workflow-adaptive-node.js:815 — claude branch placed BEFORE the #708 opencode pattern; -gitlab/-gitea claude-forge dirs still fall through to the claude default.
- :870-891 — reviewerProfilePath claude branch: [1] __dirname/../agents/<role>.md (self-dev canonical AND documented symlink-workaround dir), [2] $KAOLA_AGENT_DIR || ~/.claude/agents (matches install.sh:36 and kaola-workflow-resolve-agent-model.js:264). Total miss returns native candidate -> review_profile_unavailable, never silent wrong-runtime binding.

#717 — cache tuples, override precedence, unchanged detection, identity binding: VERIFIED
- New tuple regex probed empirically (8 cases): all three edition tuples match; deeper layouts, missing-version, wrong-plugin, source-tree rejected; Windows separators handled.
- Override still first (:786); kimi branch still fires before opencode; unknown layouts fail closed.
- Identity binding call sites: prepareReviewOpen -> resolveReviewerProfileIdentity (:1238) reached from runOpenNext (:5476), runCloseAndOpenNext (:6154), runOpenReady (:9272), runReopenNode (:6757); close side binds at :1582.

#716 — built-in exclusion, delegated refusals preserved, byte-identity: VERIFIED
- PLAN_BUILTIN_NON_DELEGABLE_ROLES = Object.freeze(['main-session-gate','finalize']) (scripts/kaola-workflow-codex-preflight.js:2224); delegatedPlanRoles consumed at exactly the three availability-check sites (:2770 template filter, :2786 required-role union, :3021 checkProfiles). No remaining bare planRoles availability use.
- All four preflight copies byte-identical: sha256 56455fcd26f84f35c00992c3ef0b8ddbeea276a72421a8751247b85099618c77 x4.
- Adaptive-node: canonical == codex mirror; gitlab/gitea ports differ only by @generated header and forge rename tokens — regenerated, not hand-edited.

Independent re-runs in this worktree (not trusting producer evidence):
- node scripts/test-adaptive-node.js -> passed (2425 assertions)
- node scripts/simulate-workflow-walkthrough.js -> testReviewerContractV2Conformance PASSED + walkthrough passed
- node scripts/test-install-model-rendering.js -> passed (covers #716 a/b/c)
- node scripts/test-kimi-edition.js -> passed (577); node scripts/test-opencode-edition.js -> passed (547)
- node scripts/edition-sync.js --check -> 12 ports, 25 mirrors, 28 byte groups in parity
- node scripts/validate-script-sync.js -> OK; node scripts/validate-kaola-workflow-contracts.js -> passed

n3 documentation delta: VERIFIED — one [Unreleased] Fixed bullet covering #712/#716/#717; docs/api.md item 3 exemption, item 6 delegated-role wording, exit-3 role_not_in_template row match the code; zero pre-existing runtime-detection prose in docs/api.md (skip-with-reason correct).

findings_none: true
domain_outcome: approved
gate_claim: both fix lanes implement the diagnosed root causes exactly, carry RED-first regression proof in every touched edition copy, and leave every unchanged-runtime behavior (kimi, opencode, claude self-dev, unknown-layout fail-closed, override precedence, delegated-role refusals) intact
gate_surface: complete candidate: the adaptive-node and codex-preflight four-edition families, their claude-chain test surfaces, and the documentation delta
gate_aggregation: sequence
verdict: pass
findings_blocking: 0
