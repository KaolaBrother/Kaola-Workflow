# Finalization — Summary: issue-1018

## Delivered

- Added the canonical heavy-reasoning `fable` tier and moved planner/code-architect to it.
- Shipped the three-way Codex dispatch contract: Luna/max, Sol/medium, Sol/high.
- Verified Grok heavy frontmatter live at xhigh and shipped Cursor heavy xhigh pins.
- Preserved OpenCode reasoning-class and Kimi session-inherited divergences.
- Added the bounded reviewer heavy escalation, its executable Claude `model="fable"` exception, and reviewer surface/acceptance scope packets.
- Repaired heavy-roster parity in the plugin walkthrough, all three contract validators, route reachability, and the legacy installer-upgrade fixture.
- Docked user-facing documentation and ADR 0019 to the verified candidate.

## Files Changed

The candidate changes canonical agent profiles, resolver/profile-class carriers, routing skeletons and generated surfaces, additive runtime transformers and tests, validator/walkthrough coverage, runtime documentation, ADR 0019, and the Unreleased changelog. The finalize transaction records the authoritative changed-path inventory below.

## Test Coverage

- Live Grok CLI 1.0.5 planner child: `reasoning_effort: xhigh`, `HEAVY_CHILD_OK`.
- Additive editions: Grok 564, Cursor 856, OpenCode 684, Kimi 647 assertions.
- Route reachability: 557 assertions.
- Full unsharded walkthrough: 186/186 scenarios; spawn census 2173.
- Self-host receipt: Claude, Codex, GitLab, Gitea all green; no waiver or accepted red.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- agents/adversarial-verifier.md
- agents/code-architect.md
- agents/code-reviewer.md
- agents/planner.md
- agents/security-reviewer.md
- commands/kaola-workflow-finalize.md
- commands/workflow-init.md
- commands/workflow-next.md
- plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml
- plugins/kaola-workflow-gitea/agents/code-reviewer.toml
- plugins/kaola-workflow-gitea/agents/security-reviewer.toml
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/workflow-init.md
- plugins/kaola-workflow-gitea/commands/workflow-next.md
- plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml
- plugins/kaola-workflow-gitlab/agents/code-reviewer.toml
- plugins/kaola-workflow-gitlab/agents/security-reviewer.toml
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/workflow-init.md
- plugins/kaola-workflow-gitlab/commands/workflow-next.md
- plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow/agents/adversarial-verifier.toml
- plugins/kaola-workflow/agents/code-reviewer.toml
- plugins/kaola-workflow/agents/security-reviewer.toml
- plugins/kaola-workflow/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-codex-preflight.js
- scripts/kaola-workflow-resolve-agent-model.js
- scripts/sync-cursor-edition.js
- scripts/sync-grok-edition.js
- scripts/sync-opencode-edition.js
- scripts/test-agent-model-resolver.js
- scripts/test-cursor-edition.js
- scripts/test-grok-edition.js
- scripts/test-install-model-rendering.js
- scripts/test-install-upgrade-rewrite.js
- scripts/test-kimi-edition.js
- scripts/test-opencode-edition.js
- scripts/test-route-reachability.js
- scripts/validate-kaola-workflow-contracts.js
- templates/reviewers/behavior-contracts.json
- templates/routing/finalize.skeleton.md
- templates/routing/init.skeleton.md
- templates/routing/next.skeleton.md
- templates/routing/slots.js

## Mission List

items: 6
carrying an outcome while their status is not `done`: 1

The record contradicts itself at this `item:` line — the outcome landed and the status did not
follow. Reported, never repaired, and the finalize is unaffected: this record is the run's own
bookkeeping, and what to do about it is the reader's call.

- line 23

## Documentation Docking

`DOCKED`. README, docs index, API, architecture, conventions, Grok/Cursor/OpenCode/Kimi guides, ADR 0019, and `[Unreleased]` changelog reflect the verified three-tier behavior. Environment variables, dependency surface, public schema, and roadmap topology have no change.

## Run gaps

The scanner reported zero swept gap classes; there is no run-discovered defect to file or classify as noise.

## Follow-Up Items

None. All issue obligations are satisfied, no critical/high review finding remains, and no decision is deferred.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: green

archived_paths:
- kaola-workflow/archive/issue-1018/.cache/acceptance.md
- kaola-workflow/archive/issue-1018/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1018/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-1018/.cache/doc-docking.md
- kaola-workflow/archive/issue-1018/.cache/doc-updater.md
- kaola-workflow/archive/issue-1018/.cache/implementer-review-fix.md
- kaola-workflow/archive/issue-1018/.cache/live-grok.md
- kaola-workflow/archive/issue-1018/.cache/review.md
- kaola-workflow/archive/issue-1018/.cache/run-gaps.json
- kaola-workflow/archive/issue-1018/.cache/tdd-guide-chain-fix.md
- kaola-workflow/archive/issue-1018/.cache/tdd-guide-review-fix.md
- kaola-workflow/archive/issue-1018/finalization-summary.md
- kaola-workflow/archive/issue-1018/mission-list.md
- kaola-workflow/archive/issue-1018/workflow-state.md
