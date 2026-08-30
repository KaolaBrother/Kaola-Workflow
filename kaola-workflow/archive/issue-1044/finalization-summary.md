# Finalization — Summary: issue-1044

## Delivered

- A single always-loaded dispatch contract rendered into Workflow Next, Finalization and compact-recovery artifacts for every supported runtime.
- Static, runtime-native compact recovery for measured compact-risk hosts: Claude/Codex SessionStart artifacts, one Grok Rule and one Cursor alwaysApply Rule.
- Zero Kaola PreToolUse/PostToolUse/Stop recovery hooks and zero ordinary-tool recovery bytes/subprocesses.
- Subtractive prompt redesign with full runtime capability adapters, trust-preserving installer migration and complete user-facing documentation.
- Issue #1044 rewritten as a 17,015-byte Design of Record containing corrected premises, decision history, measurements, hashes, live probes and evidence boundaries.

## Files Changed

The branch changes 91 paths across routing skeletons and rendered surfaces, runtime capability data, Claude/Codex hook artifacts, Cursor/Grok/Kimi/OpenCode/ZCode sync/install adapters, focused acceptance suites, README, CHANGELOG and architecture/API/convention/edition documentation. Retired compact-time JS and obsolete OpenCode hook plugin files are deleted.

## Test Coverage

- Producer chain receipt: four forge chains, all exit 0, exact candidate bound.
- Runtime editions: OpenCode 874, Kimi 824, Grok 712, Cursor 834, ZCode 877; ZCode hook protocol 32 and install trust 47, all PASS.
- Issue #1044 prompt framework 140, runtime adapters 65, runtime agent architecture 786 and routing generator 524, all PASS.
- Full walkthrough 179/179 PASS with spawn census 2118.
- `install-all.sh --check`, 24-surface byte parity and `git diff --check` PASS.
- Live compact: current Codex, standalone Cursor CLI and Grok native Rule PASS; Cursor App local/Cloud compact remains explicitly unexecuted.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- commands/kaola-workflow-finalize.md
- commands/workflow-next.md
- hooks/hooks.json
- hooks/kaola-workflow-compact-recovery.md
- install-cursor.sh
- install-grok.sh
- install-kimi.sh
- install-opencode.sh
- install-zcode.sh
- install.sh
- package.json
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/workflow-next.md
- plugins/kaola-workflow-gitea/config/hooks.json
- plugins/kaola-workflow-gitea/hooks/hooks.json
- plugins/kaola-workflow-gitea/hooks/kaola-workflow-codex-compact-recovery.md
- plugins/kaola-workflow-gitea/hooks/kaola-workflow-compact-recovery.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-codex-compact-resume.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-compact-context.js
- plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/workflow-next.md
- plugins/kaola-workflow-gitlab/config/hooks.json
- plugins/kaola-workflow-gitlab/hooks/hooks.json
- plugins/kaola-workflow-gitlab/hooks/kaola-workflow-codex-compact-recovery.md
- plugins/kaola-workflow-gitlab/hooks/kaola-workflow-compact-recovery.md
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-codex-compact-resume.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-compact-context.js
- plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow/config/hooks.json
- plugins/kaola-workflow/hooks/kaola-workflow-codex-compact-recovery.md
- plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js
- plugins/kaola-workflow/scripts/kaola-workflow-compact-context.js
- plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- scripts/edition-sync.js
- scripts/generate-agent-profiles.js
- scripts/generate-routing-surfaces.js
- scripts/kaola-workflow-compact-context.js
- scripts/kaola-workflow-cursor-surface.js
- scripts/kaola-workflow-install-manifest.js
- scripts/sync-cursor-edition.js
- scripts/sync-grok-edition.js
- scripts/sync-kimi-edition.js
- scripts/sync-opencode-edition.js
- scripts/sync-zcode-edition.js
- scripts/test-cursor-edition.js
- scripts/test-generate-routing-surfaces.js
- scripts/test-grok-edition.js
- scripts/test-install-model-rendering.js
- scripts/test-issue-1044-prompt-bundle.js
- scripts/test-issue-1044-runtime-adapters.js
- scripts/test-kimi-edition.js
- scripts/test-opencode-edition.js
- scripts/test-relative-tmpdir-escape.js
- scripts/test-runtime-agent-architecture.js
- scripts/test-zcode-edition.js
- scripts/test-zcode-hook-protocol.js
- scripts/test-zcode-install-trust.js
- scripts/validate-kaola-workflow-contracts.js
- scripts/validate-script-sync.js
- scripts/validate-workflow-contracts.js
- templates/agents/runtime-capabilities.json
- templates/opencode/plugins/kaola-workflow-hooks.js
- templates/routing/compact-recovery.skeleton.md
- templates/routing/dispatch-contract.md
- templates/routing/finalize.skeleton.md
- templates/routing/next.skeleton.md
- templates/routing/required-blocks.js
- templates/routing/slots.js

## Mission List

items: 9
carrying an outcome while their status is not `done`: 0

## Documentation Docking

`kaola-workflow/issue-1044/.cache/doc-docking.md` is `DOCKED`. README, CHANGELOG, API, architecture, conventions, runtime capability and relevant edition documentation cover every changed public behavior; no environment variable or external dependency was introduced.

## Run gaps

## Follow-Up Items

None discovered by the run-gap sweep. Cursor App local and Cloud live compact, and their child model/source observability, remain measured unknowns rather than promised follow-up work.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1044/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1044/.cache/doc-docking.md
- kaola-workflow/archive/issue-1044/.cache/doc-updater.md
- kaola-workflow/archive/issue-1044/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1044/.cache/run-gaps.json
- kaola-workflow/archive/issue-1044/finalization-summary.md
- kaola-workflow/archive/issue-1044/mission-list.md
- kaola-workflow/archive/issue-1044/workflow-state.md
