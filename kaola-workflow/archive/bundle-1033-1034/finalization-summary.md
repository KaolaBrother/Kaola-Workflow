# Finalization — Summary: bundle-1033-1034

## Delivered

- Closed #1034's false-positive uninstall test gap with real sandboxed outcome checks, deletion-mutation proof, and an aggregate runner that always attempts all five additive edition suites while preserving any child failure.
- Replaced Claude-first project instruction ownership with one runtime-neutral `AGENTS.md` authority. Claude now uses only a thin `CLAUDE.md` `@AGENTS.md` bridge plus Claude-only overlay; Codex, OpenCode, Kimi, Grok, Cursor, and ZCode consume the universal authority directly within their native discovery contracts.
- Centralized 14 role behaviors, runtime capabilities, and provenance in runtime-neutral authorities, then generated 126 deterministic native role renders for seven runtime families through declared adapters.
- Made workflow-init migration ownership-safe and distribution-owned across GitHub, GitLab, Gitea, and packaged layouts, including exact v9.17.2 migration, mixed-owner refusal, byte/mode preservation, symlink refusal, and producer-repository preservation.
- Replaced retired or unsupported native surfaces: Kimi custom agents, OpenCode plural agents, adapter-owned runtime model/tool carriers, and ZCode user hook state with receipt-backed restoration.
- Closed every independent security, ownership, routing, documentation, and adversarial re-review finding before freezing the candidate.

## Files Changed

The delivery spans the root instruction bridge, runtime-neutral authorities under `templates/agents/`, generated Claude/Codex profiles, all additive-runtime generators and installers, workflow-init migration support, routing surfaces, focused and walkthrough acceptance suites, public documentation, ADR 0020, and the unreleased changelog.

## Test Coverage

- Runtime architecture: 427 assertions.
- Routing surfaces: 476 assertions.
- Single-authority route reachability: 170 assertions.
- Generated profiles: 14 roles × 7 runtimes, 126 deterministic renders.
- Full workflow walkthrough: 179/179 scenarios.
- Additive editions: OpenCode 887, Kimi 848, Grok 711, Cursor 825, and ZCode 852 assertions.
- Exact-SHA producer-selected chains: Claude, Codex, GitLab, and Gitea all passed once, with no waiver, timeout, accepted red, or retry.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- .cache/kimi-native-agent-acceptance-red.md
- .cache/opencode-native-agent-path-red.md
- .cache/runtime-native-carrier-red.md
- AGENTS.md
- CLAUDE.md
- agents/adversarial-verifier.md
- agents/build-error-resolver.md
- agents/code-architect.md
- agents/code-explorer.md
- agents/code-reviewer.md
- agents/doc-updater.md
- agents/generated-agent-manifest.json
- agents/implementer.md
- agents/investigator.md
- agents/knowledge-lookup.md
- agents/metric-optimizer.md
- agents/planner.md
- agents/security-reviewer.md
- agents/synthesizer.md
- agents/tdd-guide.md
- commands/kaola-workflow-finalize.md
- commands/workflow-init.md
- commands/workflow-next.md
- install-kimi.sh
- install-opencode.sh
- install-zcode.sh
- install.sh
- package.json
- plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml
- plugins/kaola-workflow-gitea/agents/build-error-resolver.toml
- plugins/kaola-workflow-gitea/agents/code-architect.toml
- plugins/kaola-workflow-gitea/agents/code-explorer.toml
- plugins/kaola-workflow-gitea/agents/code-reviewer.toml
- plugins/kaola-workflow-gitea/agents/doc-updater.toml
- plugins/kaola-workflow-gitea/agents/implementer.toml
- plugins/kaola-workflow-gitea/agents/investigator.toml
- plugins/kaola-workflow-gitea/agents/knowledge-lookup.toml
- plugins/kaola-workflow-gitea/agents/metric-optimizer.toml
- plugins/kaola-workflow-gitea/agents/planner.toml
- plugins/kaola-workflow-gitea/agents/security-reviewer.toml
- plugins/kaola-workflow-gitea/agents/synthesizer.toml
- plugins/kaola-workflow-gitea/agents/tdd-guide.toml
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/workflow-init.md
- plugins/kaola-workflow-gitea/commands/workflow-next.md
- plugins/kaola-workflow-gitea/config/agents.toml
- plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-project-instruction-templates.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-project-instructions.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml
- plugins/kaola-workflow-gitlab/agents/build-error-resolver.toml
- plugins/kaola-workflow-gitlab/agents/code-architect.toml
- plugins/kaola-workflow-gitlab/agents/code-explorer.toml
- plugins/kaola-workflow-gitlab/agents/code-reviewer.toml
- plugins/kaola-workflow-gitlab/agents/doc-updater.toml
- plugins/kaola-workflow-gitlab/agents/implementer.toml
- plugins/kaola-workflow-gitlab/agents/investigator.toml
- plugins/kaola-workflow-gitlab/agents/knowledge-lookup.toml
- plugins/kaola-workflow-gitlab/agents/metric-optimizer.toml
- plugins/kaola-workflow-gitlab/agents/planner.toml
- plugins/kaola-workflow-gitlab/agents/security-reviewer.toml
- plugins/kaola-workflow-gitlab/agents/synthesizer.toml
- plugins/kaola-workflow-gitlab/agents/tdd-guide.toml
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/workflow-init.md
- plugins/kaola-workflow-gitlab/commands/workflow-next.md
- plugins/kaola-workflow-gitlab/config/agents.toml
- plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-project-instruction-templates.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-project-instructions.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow/agents/adversarial-verifier.toml
- plugins/kaola-workflow/agents/build-error-resolver.toml
- plugins/kaola-workflow/agents/code-architect.toml
- plugins/kaola-workflow/agents/code-explorer.toml
- plugins/kaola-workflow/agents/code-reviewer.toml
- plugins/kaola-workflow/agents/doc-updater.toml
- plugins/kaola-workflow/agents/implementer.toml
- plugins/kaola-workflow/agents/investigator.toml
- plugins/kaola-workflow/agents/knowledge-lookup.toml
- plugins/kaola-workflow/agents/metric-optimizer.toml
- plugins/kaola-workflow/agents/planner.toml
- plugins/kaola-workflow/agents/security-reviewer.toml
- plugins/kaola-workflow/agents/synthesizer.toml
- plugins/kaola-workflow/agents/tdd-guide.toml
- plugins/kaola-workflow/config/agents.toml
- plugins/kaola-workflow/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js
- plugins/kaola-workflow/scripts/kaola-workflow-project-instruction-templates.js
- plugins/kaola-workflow/scripts/kaola-workflow-project-instructions.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- scripts/generate-agent-profiles.js
- scripts/generate-reviewer-profiles.js
- scripts/kaola-workflow-codex-preflight.js
- scripts/kaola-workflow-install-manifest.js
- scripts/kaola-workflow-project-instruction-templates.js
- scripts/kaola-workflow-project-instructions.js
- scripts/run-edition-tests.js
- scripts/simulate-workflow-walkthrough.js
- scripts/sync-cursor-edition.js
- scripts/sync-grok-edition.js
- scripts/sync-kimi-edition.js
- scripts/sync-opencode-edition.js
- scripts/sync-zcode-edition.js
- scripts/test-agent-profile-parity.js
- scripts/test-cursor-edition.js
- scripts/test-generate-routing-surfaces.js
- scripts/test-grok-edition.js
- scripts/test-install-model-rendering.js
- scripts/test-kernel-conformance.js
- scripts/test-kimi-edition.js
- scripts/test-opencode-edition.js
- scripts/test-route-reachability.js
- scripts/test-runtime-agent-architecture.js
- scripts/test-zcode-edition.js
- scripts/validate-kaola-workflow-contracts.js
- scripts/validate-script-sync.js
- scripts/validate-vendored-agents.js
- scripts/validate-workflow-contracts.js
- templates/agents/behavior-contracts.json
- templates/agents/provenance.json
- templates/agents/runtime-capabilities.json
- templates/reviewers/behavior-contracts.json
- templates/reviewers/runtime-adapters.json
- templates/routing/finalize.skeleton.md
- templates/routing/init.skeleton.md
- templates/routing/next.skeleton.md
- templates/routing/required-blocks.js

## Mission List

items: 40
carrying an outcome while their status is not `done`: 0

## Documentation Docking

`DOCKED`. README, documentation index, architecture/API/conventions, provenance and runtime-capability guides, all five additive-edition guides, ADR 0020, and `[Unreleased]` changelog now describe the shipped AGENTS-first authority, smallest native bridges, runtime-only adapters, ownership-safe migration, and aggregate edition-runner contract. The final documentation-only correction is committed at `f7494313a8bcd66469ce2650fae79c54e1858665`.

## Run gaps

## Follow-Up Items

None. The requested #1033/#1034 bundle is complete; version/tag/publication and installed-runtime convergence are the authorized post-finalize release transaction, not a deferred issue.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-1033-1034/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1033-1034/.cache/doc-docking.md
- kaola-workflow/archive/bundle-1033-1034/.cache/doc-updater.md
- kaola-workflow/archive/bundle-1033-1034/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1033-1034/.cache/run-gaps.json
- kaola-workflow/archive/bundle-1033-1034/finalization-summary.md
- kaola-workflow/archive/bundle-1033-1034/mission-list.md
- kaola-workflow/archive/bundle-1033-1034/workflow-state.md
