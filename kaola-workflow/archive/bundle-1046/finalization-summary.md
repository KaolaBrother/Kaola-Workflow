# Finalization — Summary: bundle-1046

## Delivered

- One 3,293-byte runtime-neutral global Workflow contract and a measured nine-host adapter registry.
- A preflighted, ownership-safe, atomic install/check/uninstall transaction with per-target hashes,
  receipts, Cursor local carrier deduplication, and explicit Cursor Cloud `REMOTE_REQUIRED` routing.
- Subtractive workflow-init project instructions: project facts, commands, constraints, validation,
  docs and stricter local overrides remain; repeated universal rules move to the machine contract.
- Dispatch remains always loaded; compact recovery is injected only after compact on measured hosts;
  ordinary tool use adds zero Kaola recovery bytes and zero Kaola recovery subprocesses.
- Seven local/runtime live semantic PASS results, a truthful Claude owner-accepted mechanics boundary,
  and a Cursor Cloud candidate Build proof whose saved-Active-Build top-level semantic gate remains
  mandatory after publication.
- Issue #1046 rewritten as the complete Design of Record with architecture, runtime capability
  evidence, length measurements, raw locators, limitations, and the 10.2.0 convergence plan.

## Files Changed

The branch changes 79 paths across the global source/registry/transaction, project-instruction
migration, routing skeletons and generated surfaces, Cursor/Grok installers, all forge editions,
focused and integration suites, README, CHANGELOG, API, architecture, conventions, runtime/edition
documentation, and ADR 0022.

## Test Coverage

- Producer-selected validation: four forge chains, all exit 0, exact candidate bound.
- Canonical `npm test`: PASS; walkthrough 179/179 scenarios with 2,118 spawns.
- Global-contract focused suite 154, runtime architecture 784, prompt framework 153, routing 506,
  and install-all 275: all PASS.
- All affected edition, generated, mirror, and byte-parity checks: PASS.
- Released-host acceptance is not claimed here: this summary closes the frozen issue candidate; the
  user-directed 10.2.0 publication and post-release reinstall/live convergence follow immediately.

## Validation

classification: chains_green
green: true
mode: chain-receipt
candidate: bd766e8f47ca04ae716870d441bc9f4d8ea17d50
code_tree_hash: 40556f924b287181e64c0b4425b2ac66e49650fac29d55d72df7fcce5f92e9e1

4 chain(s) green over this tree

## Changed Paths

Files reported by the finalize transaction outside documentation and run-state bands:

- commands/kaola-workflow-finalize.md
- commands/workflow-init.md
- commands/workflow-next.md
- hooks/kaola-workflow-compact-recovery.md
- install-all.sh
- install-cursor.sh
- install-grok.sh
- package.json
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/workflow-init.md
- plugins/kaola-workflow-gitea/commands/workflow-next.md
- plugins/kaola-workflow-gitea/hooks/kaola-workflow-codex-compact-recovery.md
- plugins/kaola-workflow-gitea/hooks/kaola-workflow-compact-recovery.md
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-project-instruction-templates.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-project-instructions.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/workflow-init.md
- plugins/kaola-workflow-gitlab/commands/workflow-next.md
- plugins/kaola-workflow-gitlab/hooks/kaola-workflow-codex-compact-recovery.md
- plugins/kaola-workflow-gitlab/hooks/kaola-workflow-compact-recovery.md
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-project-instruction-templates.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-project-instructions.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow/hooks/kaola-workflow-codex-compact-recovery.md
- plugins/kaola-workflow/scripts/kaola-workflow-project-instruction-templates.js
- plugins/kaola-workflow/scripts/kaola-workflow-project-instructions.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- scripts/generate-routing-surfaces.js
- scripts/kaola-workflow-cursor-surface.js
- scripts/kaola-workflow-global-contract.js
- scripts/kaola-workflow-project-instruction-templates.js
- scripts/kaola-workflow-project-instructions.js
- scripts/sync-cursor-edition.js
- scripts/sync-grok-edition.js
- scripts/test-cursor-edition.js
- scripts/test-generate-routing-surfaces.js
- scripts/test-grok-edition.js
- scripts/test-install-all.js
- scripts/test-install-model-rendering.js
- scripts/test-issue-1044-prompt-bundle.js
- scripts/test-issue-1044-runtime-adapters.js
- scripts/test-issue-1046-global-contract.js
- scripts/test-kernel-conformance.js
- scripts/test-route-reachability.js
- scripts/test-runtime-agent-architecture.js
- scripts/test-zcode-edition.js
- scripts/validate-kaola-workflow-contracts.js
- scripts/validate-workflow-contracts.js
- templates/agents/runtime-capabilities.json
- templates/global/kaola-workflow-global.md
- templates/global/runtime-contract-adapters.json
- templates/routing/compact-recovery.skeleton.md
- templates/routing/dispatch-contract.md
- templates/routing/finalize.skeleton.md
- templates/routing/init.skeleton.md
- templates/routing/next.skeleton.md
- templates/routing/required-blocks.js
- templates/routing/slots.js

## Mission List

items: 6
carrying an outcome while their status is not `done`: 0

## Documentation Docking

`kaola-workflow/bundle-1046/.cache/doc-docking.md` is `DOCKED`. README, CHANGELOG, API,
architecture, conventions, runtime capability and relevant edition documentation, ADR 0022, the
documentation index, generated operation surfaces, and Issue #1046 agree on the frozen candidate.

## Run gaps

## Follow-Up Items

- Publish 10.2.0 from the exact publication commit, reinstall every supported local runtime from the
  released tree, and repeat fresh released-runtime probes as already directed by the owner.
- On Cursor Cloud, install the released default-branch Workflow into the environment, save the
  successful Build as Active, restart a new top-level same-repository Agent from that environment,
  and complete the no-tool semantic probe. This is a required deployment acceptance gate, not a
  candidate-code defect or waived gap.
- Claude remains `loggedIn:false`; owner explicitly accepted the released mechanics proof in place
  of an unavailable live model response, without converting it to a live semantic PASS.

## Status: READY FOR FINALIZATION

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-1046/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1046/.cache/doc-docking.md
- kaola-workflow/archive/bundle-1046/.cache/doc-updater.md
- kaola-workflow/archive/bundle-1046/.cache/issue-1046-body.md
- kaola-workflow/archive/bundle-1046/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1046/.cache/release-10.2.0-plan.md
- kaola-workflow/archive/bundle-1046/.cache/run-gaps.json
- kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/README.md
- kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/compact-probe-prompt.txt
- kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-prompt.txt
- kaola-workflow/archive/bundle-1046/.cache/runtime-live-matrix/probe-repo
- kaola-workflow/archive/bundle-1046/finalization-summary.md
- kaola-workflow/archive/bundle-1046/mission-list.md
- kaola-workflow/archive/bundle-1046/workflow-state.md
