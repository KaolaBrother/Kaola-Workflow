evidence-binding: n2-profile-contracts ca71dbdf270d
upstream_read: n1-architecture ea05782ab1d5

# n2-profile-contracts structured TDD deliverable

assigned_task: Create versioned canonical code-reviewer and adversarial-verifier behavior contracts, closed runtime adapters, a deterministic nine-output generator, mutation-proof parity tests, and OpenCode normalized-behavior parity.
role: tdd-guide
validation_verdict: focused-green
delegation_outcome: completed

RED: `node scripts/test-agent-profile-parity.js` exited 1 before implementation with `FAIL: canonical reviewer profile generator must load: Cannot find module './generate-reviewer-profiles.js'`; summary `agent-profile parity tests FAILED (1 failures, 215 passed)`.
GREEN: `node scripts/test-agent-profile-parity.js` exited 0 after implementation with `agent-profile parity tests passed (275 assertions)`; the same suite now proves one-byte drift, omitted output, foreign adapter prose, contradictory description, stale core, duplicate self-hash, and both forbidden Codex pin keys fail.
REFACTOR: Required-policy token walls and runtime-neutrality checks were added to the source validator; generated outputs were regenerated from canonical JSON and remained green.

## Changed files

tests_changed:
- scripts/test-agent-profile-parity.js
- scripts/test-opencode-edition.js

implementation_files_changed:
- templates/reviewers/behavior-contracts.json
- templates/reviewers/runtime-adapters.json
- scripts/generate-reviewer-profiles.js
- agents/code-reviewer.md
- agents/profiles/higher/code-reviewer.md
- agents/adversarial-verifier.md
- plugins/kaola-workflow/agents/code-reviewer.toml
- plugins/kaola-workflow/agents/adversarial-verifier.toml
- plugins/kaola-workflow-gitlab/agents/code-reviewer.toml
- plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml
- plugins/kaola-workflow-gitea/agents/code-reviewer.toml
- plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml

## Implemented contract

- Strict schema 1 behavior source with exactly two version-2 roles, closed ordered section ids, non-string/duplicate/unknown rejection, runtime-neutral descriptions and cores, contradiction rejection, receipt vocabularies, and prompt-provenance rejection.
- Closed schema 1 adapters with exactly `tools`, `model_policy_ref`, and `evidence_transport`; Claude base/higher and Codex inherit-by-omission are the only admitted adapter entries.
- Deterministic `--write`, `--check`, and `--manifest-json` generator for three Claude Markdown outputs and six Codex TOMLs.
- Shared `behavior_contract_hash` over canonical normalized behavior, exact delimited behavior-core bytes across every role render, and per-render `resolved_profile_hash` over complete bytes with its one unique value normalized to 64 zeroes.
- Codex role outputs omit both `model` and `model_reasoning_effort`; each role is byte-identical across GitHub, GitLab, and Gitea trees.
- Code-review behavior retains the >80% admission rule, candidate-caused/unchanged boundary, surrounding callers/tests, exact trigger and anchor, HIGH/CRITICAL proof, false-positive suppression, consolidation, zero-finding success, discovery/closure, canonical findings, and domain receipt.
- Adversarial behavior retains refute-if-uncertain, one claim/surface, strongest falsification and attempted counterexamples, context-authoritative investigation/change_gate handling, independent execution/domain/gate axes, declared aggregation, canonical findings, and domain receipt.
- OpenCode generation preserves the exact normalized reviewer core, role, behavior version, and behavior hash while making no equality claim about stochastic findings, verdicts, or prose.
- Generated agent-facing profiles contain no issue or decision provenance.

## Commands and results

- `node scripts/generate-reviewer-profiles.js --write --check` -> exit 0; `Wrote 9 reviewer profiles.` and `Reviewer profile generation check passed.`
- `node scripts/generate-reviewer-profiles.js --check` -> exit 0; `Reviewer profile generation check passed.`
- `node scripts/test-agent-profile-parity.js` -> exit 0; `agent-profile parity tests passed (275 assertions)`.
- `node scripts/test-opencode-edition.js` -> exit 0; `opencode-edition test passed (525 assertions).`
- `node scripts/validate-vendored-agents.js` -> exit 0; `Vendored agent validation passed for 16 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1`.
- `git diff --check` -> exit 0 with no output.

## Exact out-of-scope integration diagnostic

diagnostic_command: `node -e "const paths=['plugins/kaola-workflow','plugins/kaola-workflow-gitlab','plugins/kaola-workflow-gitea']; let bad=false; for (const p of paths) { const v=require('./'+p+'/scripts/install-codex-agent-profiles.js').validateSourceProfiles('./'+p); for (const e of v.errors) console.log(p+': '+e); if (!v.ok) bad=true; } process.exitCode=bad?1:0"`
diagnostic_result: exit 1
diagnostic_classification: integration-contract write-ownership gap; pre-existing config metadata is stale relative to the newly required normalized description contract, not an n2 focused behavior/test failure.

diagnostic_output:
- `plugins/kaola-workflow: agents/code-reviewer.toml: top-level 'description' does not match config/agents.toml`
- `plugins/kaola-workflow: agents/adversarial-verifier.toml: top-level 'description' does not match config/agents.toml`
- `plugins/kaola-workflow-gitlab: agents/code-reviewer.toml: top-level 'description' does not match config/agents.toml`
- `plugins/kaola-workflow-gitlab: agents/adversarial-verifier.toml: top-level 'description' does not match config/agents.toml`
- `plugins/kaola-workflow-gitea: agents/code-reviewer.toml: top-level 'description' does not match config/agents.toml`
- `plugins/kaola-workflow-gitea: agents/adversarial-verifier.toml: top-level 'description' does not match config/agents.toml`

affected_config_paths:
- plugins/kaola-workflow/config/agents.toml
- plugins/kaola-workflow-gitlab/config/agents.toml
- plugins/kaola-workflow-gitea/config/agents.toml

affected_generated_profiles:
- plugins/kaola-workflow/agents/code-reviewer.toml
- plugins/kaola-workflow/agents/adversarial-verifier.toml
- plugins/kaola-workflow-gitlab/agents/code-reviewer.toml
- plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml
- plugins/kaola-workflow-gitea/agents/code-reviewer.toml
- plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml

expected_normalized_descriptions:
- code-reviewer: `Precision-first code review specialist for correctness, regression, scope, maintainability, and test coverage.`
- adversarial-verifier: `Adversarial verifier for one recorded claim and surface, using strongest falsification with uncertainty counting against the claim.`

why_pre_existing_and_out_of_scope: The three config catalogs were unchanged by n2 and still contain the prior Codex-specific descriptions; the adversarial entry also says `never a gate`, which contradicts the new context-derived change-gate contract. All three config files are outside n2's frozen product write set. The orchestrator explicitly directed n2 to preserve scope and route missing ownership through adaptive plan repair rather than edit or waive these files.

## Remaining risks

- The three Codex source-profile validators remain red on the six description mismatches above until adaptive plan repair assigns ownership for the config catalogs or an equivalent exact contract reconciliation. Full cross-edition validation must not waive this blocker.
- No full npm chain was run; this node was explicitly limited to the focused generator/parity/OpenCode commands.
