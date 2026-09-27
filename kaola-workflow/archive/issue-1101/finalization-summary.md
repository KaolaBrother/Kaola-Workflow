# Finalization Summary — issue-1101

## Delivered

- **Native-only dispatch on every runtime (ADR 0029, which supersedes ADR 0025).** Kaola-Workflow
  defines no subagent roles, role profiles, role→model map, or pinned subagent model/effort.
  - The retired pieces: `templates/agents/behavior-contracts.json`, `scripts/generate-agent-profiles.js`,
    `agents/generated-agent-manifest.json`, the Claude `agents/*.md`, Codex `plugins/*/agents/*.toml`
    and `plugins/*/config/agents.toml`, and the edition agent renders.
  - The dispatch contract (`templates/routing/dispatch-contract.md`) and the per-runtime adapter
    facts (`templates/agents/runtime-capabilities.json` schema 2, `scripts/runtime-adapter-facts.js`)
    name only each host's native mechanism.
- **Proof-based migration on every installer.** On install, upgrade and uninstall, the Claude,
  Codex, Grok, Cursor, ZCode, Devin, Kimi and OpenCode installers do the same thing:
  - They remove a previously installed Kaola profile only on proof: its ownership record lists the
    file's current digest, or its bytes equal a released render
    (`scripts/kaola-workflow-retired-agents.js`, `RELEASED_PROFILE_SHA256`).
  - Everything else is kept and reported with a reason.
  - Codex retires its registration block only when the block is a released body, apart from Codex's
    own `[hooks.state.*]` trust tables, which stay verbatim. It keeps the ownership record while
    that record proves a kept profile.
- **AC7 live native-dispatch smoke.** The record is `ac7-native-dispatch-smoke.md`, with evidence
  in `ac7-evidence/`.
  - Verified on Claude Code 2.1.283 (`Agent`/`Explore`), Codex 0.157.1 (`spawn_agent`/`default`),
    Grok 1.0.41 (`spawn_subagent`/`general-purpose`), Cursor 2026.09.26 (`Task`/`generalPurpose`),
    Kimi 2.1.1 (`Agent`/`explore`) and Droid 0.228.0 (`Task`/`explorer`).
  - Recorded limits: OpenCode 2.0.18 (no session could be created), Devin 3000.11.3 (empty session
    model list) and DSH 0.1.5-rc.3 (no DeepSeek credential). ZCode was not attempted (no headless CLI).

## Files Changed

268 files against origin/main at the rebased candidate. The list is in `## Changed Paths`, which
the transaction writes.

## Test Coverage

- `scripts/test-issue-1101-native-only.js`: a mutation-proven guard that no role, profile or pinned
  model re-enters any agent-facing render.
- `scripts/test-issue-1101-claude-agent-migration.js` (161), `test-issue-1101-codex-agent-migration.js`
  (296, including the C14 hooks.state and kept-record cases) and
  `test-issue-1101-grok-cursor-agent-migration.js` (405). They run against frozen installed-state
  fixtures from earlier releases; the fixtures are excluded from the npm package.
- Edition, installer, routing and walkthrough suites were migrated to the native-only meaning.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- AGENTS.md
- CHANGELOG.md
- README.md
- agents/generated-agent-manifest.json
- commands/kaola-workflow-finalize.md
- commands/workflow-next.md
- docs/README.md
- docs/agents-source.md
- docs/api.md
- docs/architecture.md
- docs/conventions.md
- docs/cursor-edition.md
- docs/decisions/0025-lean-orchestrator-single-subagent-binding.md
- docs/decisions/0029-native-subagents-only.md
- docs/devin-edition.md
- docs/droid-edition.md
- docs/dsh-edition.md
- docs/grok-edition.md
- docs/installation.md
- docs/kimi-edition.md
- docs/opencode-edition.md
- docs/prompt-size.md
- docs/runtime-capabilities.md
- docs/workflow-state-contract.md
- docs/zcode-edition.md
- install-all.sh
- install-cursor.sh
- install-devin.sh
- install-grok.sh
- install-kimi.sh
- install-opencode.sh
- install-zcode.sh
- install.sh
- package.json
- plugins/kaola-workflow-gitea/.codex-plugin/plugin.json
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/workflow-next.md
- plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json
- plugins/kaola-workflow-gitlab/agents/.gitkeep
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/workflow-next.md
- plugins/kaola-workflow-gitlab/config/agents.toml
- plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow/.codex-plugin/plugin.json
- plugins/kaola-workflow/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js
- plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- scripts/fixtures/issue-1055-render-baseline.json
- scripts/fixtures/issue-1101/PROVENANCE.md
- scripts/fixtures/issue-1101/orphan-80244600/docs-lookup.md
- scripts/fixtures/issue-1101/tools/claude-catalog.sh
- scripts/fixtures/issue-1101/tools/codex-catalog.js
- scripts/fixtures/issue-1101/tools/render-edition-catalog.sh
- scripts/fixtures/issue-1101/v10.0.1/home/dot-cursor/agents/code-architect.md
- scripts/fixtures/issue-1101/v10.0.1/home/dot-cursor/agents/security-reviewer.md
- scripts/fixtures/issue-1101/v10.0.1/home/dot-cursor/agents/tdd-guide.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-claude/agents/dot-kaola-workflow-agent-manifest
- scripts/fixtures/issue-1101/v11.1.1/home/dot-claude/agents/implementer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-claude/agents/planner.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-claude/agents/synthesizer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-codex/agents/kaola-workflow/dot-kaola-managed-profiles.json
- scripts/fixtures/issue-1101/v11.1.1/home/dot-codex/agents/kaola-workflow/implementer.toml
- scripts/fixtures/issue-1101/v11.1.1/home/dot-codex/agents/kaola-workflow/planner.toml
- scripts/fixtures/issue-1101/v11.1.1/home/dot-codex/agents/kaola-workflow/synthesizer.toml
- scripts/fixtures/issue-1101/v11.1.1/home/dot-codex/config.toml
- scripts/fixtures/issue-1101/v11.1.1/home/dot-config/devin/agents/implementer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-config/devin/agents/planner.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-config/devin/agents/synthesizer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-config/opencode/agents/dot-kaola-workflow-agent-manifest
- scripts/fixtures/issue-1101/v11.1.1/home/dot-config/opencode/agents/implementer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-config/opencode/agents/planner.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-config/opencode/agents/synthesizer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-cursor/agents/implementer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-cursor/agents/planner.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-cursor/agents/synthesizer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-cursor/kaola-workflow/cursor-authority.json
- scripts/fixtures/issue-1101/v11.1.1/home/dot-grok/agents/implementer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-grok/agents/planner.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-grok/agents/synthesizer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-kimi-code/agents/dot-kaola-workflow-agent-manifest
- scripts/fixtures/issue-1101/v11.1.1/home/dot-kimi-code/agents/implementer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-kimi-code/agents/planner.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-kimi-code/agents/synthesizer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-zcode/agents/implementer.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-zcode/agents/planner.md
- scripts/fixtures/issue-1101/v11.1.1/home/dot-zcode/agents/synthesizer.md
- scripts/fixtures/issue-1101/v11.1.1/home/proj/dot-zcode/agents/implementer.md
- scripts/fixtures/issue-1101/v11.1.1/home/proj/dot-zcode/agents/planner.md
- scripts/fixtures/issue-1101/v11.1.1/home/proj/dot-zcode/agents/synthesizer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/cproj/dot-cursor/agents/code-explorer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/cproj/dot-cursor/agents/code-reviewer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/cproj/dot-cursor/agents/doc-updater.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/cproj/dot-cursor/agents/implementer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/cproj/dot-cursor/agents/investigator.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/cproj/dot-cursor/agents/knowledge-lookup.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/cproj/dot-cursor/agents/tdd-guide.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/cproj/dot-cursor/kaola-workflow-materialization.json
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-claude/agents/code-explorer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-claude/agents/code-reviewer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-claude/agents/doc-updater.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-claude/agents/dot-kaola-workflow-agent-manifest
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-claude/agents/implementer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-claude/agents/investigator.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-claude/agents/knowledge-lookup.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-claude/agents/tdd-guide.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-claude/rules/kaola-workflow-global.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-codex/AGENTS.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-codex/agents/kaola-workflow/code-explorer.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-codex/agents/kaola-workflow/code-reviewer.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-codex/agents/kaola-workflow/doc-updater.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-codex/agents/kaola-workflow/dot-kaola-managed-profiles.json
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-codex/agents/kaola-workflow/implementer.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-codex/agents/kaola-workflow/investigator.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-codex/agents/kaola-workflow/knowledge-lookup.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-codex/agents/kaola-workflow/tdd-guide.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-codex/config.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-config/kaola-workflow/global-contract-targets/claude-local.json
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-config/kaola-workflow/global-contract-targets/codex-local.json
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-config/kaola-workflow/global-contract-targets/cursor-app-local.json
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-config/kaola-workflow/global-contract-targets/cursor-cli-local.json
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-config/kaola-workflow/global-contract-targets/grok-local.json
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-config/kaola-workflow/shared-refs.json
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-cursor/agents/code-explorer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-cursor/agents/code-reviewer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-cursor/agents/doc-updater.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-cursor/agents/implementer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-cursor/agents/investigator.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-cursor/agents/knowledge-lookup.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-cursor/agents/tdd-guide.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-cursor/kaola-workflow/cursor-authority.json
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-cursor/rules/kaola-workflow-global.mdc
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-grok/agents/code-explorer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-grok/agents/code-reviewer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-grok/agents/doc-updater.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-grok/agents/implementer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-grok/agents/investigator.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-grok/agents/knowledge-lookup.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-grok/agents/tdd-guide.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/dot-grok/rules/kaola-workflow-global.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/gproj/dot-grok/agents/code-explorer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/gproj/dot-grok/agents/code-reviewer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/gproj/dot-grok/agents/doc-updater.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/gproj/dot-grok/agents/implementer.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/gproj/dot-grok/agents/investigator.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/gproj/dot-grok/agents/knowledge-lookup.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/gproj/dot-grok/agents/tdd-guide.md
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/proj/dot-codex/agents/kaola-workflow/code-explorer.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/proj/dot-codex/agents/kaola-workflow/code-reviewer.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/proj/dot-codex/agents/kaola-workflow/doc-updater.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/proj/dot-codex/agents/kaola-workflow/dot-kaola-managed-profiles.json
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/proj/dot-codex/agents/kaola-workflow/implementer.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/proj/dot-codex/agents/kaola-workflow/investigator.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/proj/dot-codex/agents/kaola-workflow/knowledge-lookup.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/proj/dot-codex/agents/kaola-workflow/tdd-guide.toml
- scripts/fixtures/issue-1101/v12.2.6-46fbe12d/home/proj/dot-codex/config.toml
- scripts/fixtures/issue-1101/v5.11.0/home/dot-claude/agents/contractor.md
- scripts/fixtures/issue-1101/v5.11.0/home/dot-claude/agents/dot-kaola-agent-models.json
- scripts/fixtures/issue-1101/v5.11.0/home/dot-claude/agents/dot-kaola-workflow-agent-manifest
- scripts/fixtures/issue-1101/v5.11.0/home/dot-claude/agents/implementer.md
- scripts/fixtures/issue-1101/v5.11.0/home/dot-claude/agents/workflow-planner.md
- scripts/fixtures/issue-1101/v5.11.0/home/proj/dot-codex/agents/kaola-workflow/contractor.toml
- scripts/fixtures/issue-1101/v5.11.0/home/proj/dot-codex/agents/kaola-workflow/implementer.toml
- scripts/fixtures/issue-1101/v5.11.0/home/proj/dot-codex/agents/kaola-workflow/workflow-planner.toml
- scripts/fixtures/issue-1101/v5.11.0/home/proj/dot-codex/config.toml
- scripts/fixtures/issue-1101/v6.8.0/home/dot-config/opencode/dot-opencode/agent/implementer.md
- scripts/fixtures/issue-1101/v6.8.0/home/dot-config/opencode/dot-opencode/agent/planner.md
- scripts/fixtures/issue-1101/v6.8.0/home/dot-config/opencode/dot-opencode/agent/workflow-planner.md
- scripts/fixtures/issue-1101/v6.8.0/home/proj/dot-opencode/agent/implementer.md
- scripts/fixtures/issue-1101/v6.8.0/home/proj/dot-opencode/agent/planner.md
- scripts/fixtures/issue-1101/v6.8.0/home/proj/dot-opencode/agent/workflow-planner.md
- scripts/fixtures/issue-1101/v9.12.0/home/dot-claude/agents/adversarial-verifier.md
- scripts/fixtures/issue-1101/v9.12.0/home/dot-claude/agents/code-reviewer.md
- scripts/fixtures/issue-1101/v9.12.0/home/dot-claude/agents/dot-kaola-workflow-agent-manifest
- scripts/fixtures/issue-1101/v9.12.0/home/dot-claude/agents/metric-optimizer.md
- scripts/fixtures/issue-1101/v9.12.0/home/dot-grok/agents/adversarial-verifier.md
- scripts/fixtures/issue-1101/v9.12.0/home/dot-grok/agents/code-reviewer.md
- scripts/fixtures/issue-1101/v9.12.0/home/dot-grok/agents/metric-optimizer.md
- scripts/fixtures/issue-1101/v9.17.1/home/dot-kimi-code/skills/kaola-role-implementer/SKILL.md
- scripts/fixtures/issue-1101/v9.17.1/home/dot-kimi-code/skills/kaola-role-planner/SKILL.md
- scripts/fixtures/issue-1101/v9.17.1/home/dot-kimi-code/skills/kaola-role-synthesizer/SKILL.md
- scripts/fixtures/issue-1101/v9.4.0/home/proj/dot-opencode/agent/dot-kaola-workflow-agent-manifest
- scripts/fixtures/issue-1101/v9.4.0/home/proj/dot-opencode/agent/implementer.md
- scripts/fixtures/issue-1101/v9.4.0/home/proj/dot-opencode/agent/planner.md
- scripts/fixtures/issue-1101/v9.4.0/home/proj/dot-opencode/agent/synthesizer.md
- scripts/generate-agent-profiles.js
- scripts/generate-routing-surfaces.js
- scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-codex-preflight.js
- scripts/kaola-workflow-cursor-surface.js
- scripts/kaola-workflow-install-manifest.js
- scripts/kaola-workflow-resolve-agent-model.js
- scripts/kaola-workflow-retired-agents.js
- scripts/runtime-adapter-facts.js
- scripts/runtime-edition-forge.js
- scripts/sync-cursor-edition.js
- scripts/sync-devin-edition.js
- scripts/sync-droid-edition.js
- scripts/sync-dsh-edition.js
- scripts/sync-grok-edition.js
- scripts/sync-kimi-edition.js
- scripts/sync-opencode-edition.js
- scripts/sync-zcode-edition.js
- scripts/test-codex-session-proof.js
- scripts/test-cursor-edition.js
- scripts/test-devin-edition.js
- scripts/test-droid-edition.js
- scripts/test-dsh-edition.js
- scripts/test-generate-routing-surfaces.js
- scripts/test-grok-edition.js
- scripts/test-install-adaptive-config.js
- scripts/test-install-model-rendering.js
- scripts/test-install-upgrade-rewrite.js
- scripts/test-issue-1044-prompt-bundle.js
- scripts/test-issue-1045-cursor-conformance.js
- scripts/test-issue-1046-global-contract.js
- scripts/test-issue-1051-global-contract.js
- scripts/test-issue-1052-cursor-cli-startup-prep.js
- scripts/test-issue-1053-next-task-quality.js
- scripts/test-issue-1054-role-redesign.js
- scripts/test-issue-1055-render-subtraction-oracle.js
- scripts/test-issue-1087-lane-a.js
- scripts/test-issue-1087-lane-b.js
- scripts/test-issue-1101-claude-agent-migration.js
- scripts/test-issue-1101-codex-agent-migration.js
- scripts/test-issue-1101-grok-cursor-agent-migration.js
- scripts/test-issue-1101-native-only.js
- scripts/test-kimi-edition.js
- scripts/test-opencode-edition.js
- scripts/test-relative-tmpdir-escape.js
- scripts/test-runtime-agent-architecture.js
- scripts/test-validate-script-sync.js
- scripts/test-zcode-edition.js
- scripts/test-zcode-install-trust.js
- scripts/validate-kaola-workflow-contracts.js
- scripts/validate-script-sync.js
- scripts/validate-vendored-agents.js
- scripts/validate-workflow-contracts.js
- templates/agents/behavior-contracts.json
- templates/agents/provenance.json
- templates/agents/runtime-capabilities.json
- templates/axioms.md
- templates/routing/dispatch-contract.md
- templates/routing/finalize.skeleton.md
- templates/routing/next.skeleton.md
- templates/routing/rename-table.js
- templates/routing/slots.js
- uninstall.sh

## Documentation Docking

DOCKED — see `.cache/doc-docking.md`.

## Follow-Up Items

These are non-blocking. Per Host instruction they are listed on the #1101 closing comment rather
than filed as separate issues:

- N6 test custody not restored: nested-cwd and trusted-root project layers (c2, c3); multi-scope
  ambiguous-marker ordering (c4); combined per-field bounds (c6); plugin-cache and manifest symlink
  refusals (c9).
- `kaola-workflow-retired-agents.js retire-skills` (Kimi) has no `--root` option.
- The #1101 migration suites need `scripts/fixtures/issue-1101/`, which the package does not ship,
  so they run only from a source checkout.
- The Cursor D0 drift checks are skipped when edition suites run under an isolated
  `KAOLA_EDITION_TREE_ROOT`.
- The Codex host-table regex accepts `true|false` values, which no observed Codex table uses. This
  only widens what is preserved.

## Readiness

The Host accepted the candidate after the round-4 targeted re-check (PASS). It was rebased onto
origin/main d70173e2 with conflicts only in CHANGELOG ordering and the regenerated #1055 render
baseline, then fully re-validated. The chain receipt is bound to the rebased HEAD. Ready for the
merge sink.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1101/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1101/.cache/doc-docking.md
- kaola-workflow/archive/issue-1101/.cache/final-validation.md
- kaola-workflow/archive/issue-1101/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1101/ac7-evidence/build.js
- kaola-workflow/archive/issue-1101/ac7-evidence/claude.contract-source
- kaola-workflow/archive/issue-1101/ac7-evidence/claude.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/claude.stream.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/claude.version
- kaola-workflow/archive/issue-1101/ac7-evidence/codex-rollout-excerpt-rollout-2026-09-27T14-21-37-01a0e186-b63b-7a33-aeba-15616a633fd8.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/codex-rollout-excerpt-rollout-2026-09-27T14-21-46-01a0e186-d9e1-7cd3-bd57-b420dbff3f31.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/codex.contract-source
- kaola-workflow/archive/issue-1101/ac7-evidence/codex.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/codex.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/codex.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/codex.version
- kaola-workflow/archive/issue-1101/ac7-evidence/codex2.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/codex2.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/codex2.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/cursor-attempt1.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/cursor-attempt1.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/cursor-attempt1.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/cursor-probe.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/cursor-probe.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/cursor.contract-source
- kaola-workflow/archive/issue-1101/ac7-evidence/cursor.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/cursor.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/cursor.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/cursor.version
- kaola-workflow/archive/issue-1101/ac7-evidence/devin-attempt1.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/devin-attempt1.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/devin-attempt2.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/devin-attempt2.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/devin-models.txt
- kaola-workflow/archive/issue-1101/ac7-evidence/devin.contract-source
- kaola-workflow/archive/issue-1101/ac7-evidence/devin.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/devin.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/devin.version
- kaola-workflow/archive/issue-1101/ac7-evidence/droid-attempt1.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/droid-attempt1.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/droid.contract-source
- kaola-workflow/archive/issue-1101/ac7-evidence/droid.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/droid.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/droid.version
- kaola-workflow/archive/issue-1101/ac7-evidence/dsh.contract-source
- kaola-workflow/archive/issue-1101/ac7-evidence/dsh.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/dsh.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/dsh.version
- kaola-workflow/archive/issue-1101/ac7-evidence/grok-attempt1.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/grok-attempt1.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/grok-attempt1.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/grok-attempt2.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/grok-attempt2.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/grok-attempt2.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/grok-session-excerpt.json
- kaola-workflow/archive/issue-1101/ac7-evidence/grok.contract-source
- kaola-workflow/archive/issue-1101/ac7-evidence/grok.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/grok.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/grok.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/grok.version
- kaola-workflow/archive/issue-1101/ac7-evidence/kimi.contract-source
- kaola-workflow/archive/issue-1101/ac7-evidence/kimi.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/kimi.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/kimi.version
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode-attempt1.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode-attempt1.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode-attempt1.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode-attempt2.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode-attempt2.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode-attempt2.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode-probe.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode-probe.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode.contract-source
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode.exit
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode.jsonl
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode.stderr
- kaola-workflow/archive/issue-1101/ac7-evidence/opencode.version
- kaola-workflow/archive/issue-1101/ac7-evidence/prompt.txt
- kaola-workflow/archive/issue-1101/ac7-native-dispatch-smoke.md
- kaola-workflow/archive/issue-1101/finalization-summary.md
- kaola-workflow/archive/issue-1101/mission-ledger.jsonl
- kaola-workflow/archive/issue-1101/workflow-state.md
