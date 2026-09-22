# Finalization Summary — bundle-1089 (#1089: mission ledger; hard-retire Mission List)

## Delivered

- Mission ledger at `<main_root>/kaola-workflow/.ledger/issue-<N>.jsonl` (one JSON line per mission,
  keys exactly `n,name,details,status`), gitignored, main checkout only, never mirrored into a worktree.
- Claim creates the directory and reports `ledger_path` (+ `ledger_finding` when not ignored; never edits `.gitignore`).
- Archive MOVES the ledger to `kaola-workflow/archive/<project>/mission-ledger.jsonl` inside
  `archiveProjectDir` after `verifyArchiveComplete` and the live-copy deletion (amendment §6);
  finalize reports the move on `closure_receipt.mission_ledger`.
- Hard retire: `mission-list.md`, `MISSION_LIST_FILE`, `parseGoal`, `compareLedgers`,
  `kaola-workflow-ledger-compare.js` (4 trees), `.cache/mirror-digest.json`, `ledger_compare`, and the
  three carrier suites. Routing renders, global contract, ADR 0027, docs, README, CHANGELOG updated.
- Commits (11): eff69083 c682e98d 948bf271 ea62b1c9 5ffe8883 fee248ff 189ba432 2244a312 093c7b8f cab0dbbc.

## Files Changed

Kernel (`scripts/kaola-workflow-claim.js`, `scripts/kaola-workflow-adaptive-schema.js` and the three
plugin ports), `templates/routing/*` + 24 generated renders, `templates/global/kaola-workflow-global.md`,
contract validators (4 copies), acceptance suite `scripts/test-issue-1089-mission-ledger.js`, retargeted
suites, `package.json`, `.gitignore`, render baseline fixture, docs (see `.cache/doc-docking.md`).
The transaction's own `## Changed Paths` is appended below.

## Test Coverage

- `scripts/test-issue-1089-mission-ledger.js`: 494 checks, 0 failures — acceptance items 1–10 across
  all four claim editions, plus §6 (refused archive attempts no move; failed move reported; move
  after verify). Mutants: move hoisted before verify → 3 FAIL; receipt line removed → FAIL.
- Codex walkthrough #333: real `finalize --keep-open` asserts `closure_receipt.mission_ledger === 'moved'`.
- Implementer evidence at cab0dbbc: `KAOLA_WORKFLOW_OFFLINE=1 npm test` exit 0 (claude/codex/gitlab/gitea);
  `node scripts/simulate-workflow-walkthrough.js` exit 0. Host acceptance: PASS.

## Acceptance

Issue #1089 acceptance 1–10: each mapped to a covering check in the acceptance suite (path contract,
gitignore, no-worktree, shape, write moments, Host read, archive move, token budget vs bundle-1087,
retire greps, chains + docs). Amendment (issuecomment-5770350020) §6: ordering + surfacing tested.
The A/B decision table is Host-side read-only interpretation — no repo code, by design.

## Informational: residual non-crash torn-archive route

Amendment row 1 (ledger present AND `archive/<project>/` present) is reachable without a crash in one
pre-existing way: a refused linked-run archive (`archive_incomplete`, #676/#901) keeps its partial
`archive/<project>/` copy for inspection while the live run folder and live ledger stay in place.
Owner ruling 2026-09-22: no behavior change; row 1 already reports that state as
INCONSISTENT / needs owner attention. A failed ledger rename after a complete archive is the other
non-crash route; it is reported as `mission_ledger: 'failed: …'`, never silent.

## Documentation Docking

DOCKED — `.cache/doc-docking.md`.

## Follow-Up Items

None filed. Edition suites (`test:kaola-workflow:editions`) read the main checkout's generated trees
and can only witness this change after the sink; the release loop (Fable review) is the next gate.
No release is cut by this run (version stays 12.2.3).

## Readiness

Ready: Host-accepted candidate cab0dbbc; closure closes #1089.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- .gitignore
- AGENTS.md
- CHANGELOG.md
- README.md
- commands/kaola-workflow-finalize.md
- commands/workflow-init.md
- commands/workflow-next.md
- docs/README.md
- docs/api.md
- docs/architecture.md
- docs/conventions.md
- docs/cursor-edition.md
- docs/decisions/0017-the-mission-list.md
- docs/decisions/0027-the-mission-ledger.md
- docs/devin-edition.md
- docs/droid-edition.md
- docs/dsh-edition.md
- docs/opencode-edition.md
- docs/task-quality.md
- docs/workflow-state-contract.md
- hooks/kaola-workflow-compact-recovery.md
- install-devin.sh
- install-grok.sh
- install-kimi.sh
- install-opencode.sh
- install-zcode.sh
- package.json
- plugins/kaola-workflow-gitea/.claude-plugin/plugin.json
- plugins/kaola-workflow-gitea/.codex-plugin/plugin.json
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/workflow-init.md
- plugins/kaola-workflow-gitea/commands/workflow-next.md
- plugins/kaola-workflow-gitea/hooks/kaola-workflow-codex-compact-recovery.md
- plugins/kaola-workflow-gitea/hooks/kaola-workflow-compact-recovery.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-ledger-compare.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow-gitlab/.claude-plugin/plugin.json
- plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/workflow-init.md
- plugins/kaola-workflow-gitlab/commands/workflow-next.md
- plugins/kaola-workflow-gitlab/hooks/kaola-workflow-codex-compact-recovery.md
- plugins/kaola-workflow-gitlab/hooks/kaola-workflow-compact-recovery.md
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-ledger-compare.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow/.codex-plugin/plugin.json
- plugins/kaola-workflow/hooks/kaola-workflow-codex-compact-recovery.md
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js
- plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js
- plugins/kaola-workflow/scripts/kaola-workflow-ledger-compare.js
- plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
- plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- scripts/fixtures/issue-1054/bundle-1053-mission-list.md
- scripts/fixtures/issue-1055-render-baseline.json
- scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-closure-audit.js
- scripts/kaola-workflow-install-manifest.js
- scripts/kaola-workflow-ledger-compare.js
- scripts/kaola-workflow-resolve-agent-model.js
- scripts/kaola-workflow-sink-merge.js
- scripts/sync-cursor-edition.js
- scripts/test-bash-block-guards.js
- scripts/test-claim-hardening.js
- scripts/test-finalize-door.js
- scripts/test-generate-routing-surfaces.js
- scripts/test-install-manifest-single-source.js
- scripts/test-issue-1044-prompt-bundle.js
- scripts/test-issue-1046-global-contract.js
- scripts/test-issue-1051-global-contract.js
- scripts/test-issue-1053-next-task-quality.js
- scripts/test-issue-1054-ledger-guard.js
- scripts/test-issue-1054-mission-list-carriers.js
- scripts/test-issue-1089-mission-ledger.js
- scripts/test-kernel-conformance.js
- scripts/test-ledger-compare.js
- scripts/test-route-reachability.js
- scripts/test-runtime-agent-architecture.js
- scripts/test-spawn-classification.js
- scripts/validate-kaola-workflow-contracts.js
- scripts/validate-script-sync.js
- scripts/validate-workflow-contracts.js
- templates/agents/runtime-capabilities.json
- templates/global/kaola-workflow-global.md
- templates/routing/compact-recovery.skeleton.md
- templates/routing/finalize.skeleton.md
- templates/routing/init.skeleton.md
- templates/routing/next.skeleton.md
- templates/routing/required-blocks.js
- templates/routing/slots.js

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-1089/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1089/.cache/doc-docking.md
- kaola-workflow/archive/bundle-1089/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1089/finalization-summary.md
- kaola-workflow/archive/bundle-1089/mission-ledger.jsonl
- kaola-workflow/archive/bundle-1089/workflow-state.md
