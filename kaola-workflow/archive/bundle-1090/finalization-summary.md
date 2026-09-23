# Finalization Summary — bundle-1090 (#1090)

## Delivered

The Codex standard-tier subagent binding moves from `gpt-5.6-luna` to `gpt-6-luna`. The effort stays
`model_reasoning_effort = "max"`. Branch `workflow/bundle-1090`: implementation `83358a74`, evidence
`bd0d11ba`.

Issue statement walk (acceptance 1–5):

1. **Zero `gpt-5.6-luna` on live surfaces.** Satisfied under the Host ruling:
   `git grep -n "gpt-5.6-luna" -- ':!kaola-workflow/archive/**'` finds only 3 released CHANGELOG
   entries, the ADR 0019 historical matrix, and the D-687-01 superseded contract. All 5 are
   immutable history. The run's own evidence file also quotes catalog rows.
2. **Every pinned pair is `gpt-6-luna` + `max`.** 21 of 21 Codex role TOMLs carry both lines.
   `CODEX_PINNED_MODEL` / preflight / 3 contract validators / Codex walkthrough enforce the pair.
   Mission 2 mutated the old pin back in, and the generator check, the Codex validator, and the
   Codex walkthrough all went red.
3. **Mirrors regenerated; install verified.** f01 `generate-agent-profiles --check`, f02
   `generate-routing-surfaces --check`, and f04 `edition-sync --check` all rc=0. i1
   `./install-all.sh --check` rc=0 (dry-run). No `--yes` refresh was run before release; see
   Follow-Up Items.
4. **Chains green.** n1 `npm test` rc=0 (980s), w1 `node scripts/simulate-workflow-walkthrough.js`
   rc=0 (178/178), and focused f01–f12 rc=0, all on `83358a74`. The finalize four-chain receipt
   (`kaola-workflow-run-chains.js --project bundle-1090`) is on `bd0d11ba`; see `## Validation`.
5. **Docs + CHANGELOG `[Unreleased]`.** Docked; see Documentation Docking.

Catalog premise: re-verified by this run. On codex-cli 0.156.0, `model/list` lists `gpt-6-luna`
(not hidden, efforts low…max, 7 models, `nextCursor: null`). The load/bind path is measured in
`local-runtime-evidence.md`. The thread/config bind passes the pinned id through without checking
the catalog. The catalog depends on the client version (0.153.4 does not see `gpt-6-luna`). The
Runner ACP (codex-acp 1.11.0 on 0.153.4) rejects `gpt-6-luna` as a session-model option.

Acceptance: Host acceptance was GRANTED 2026-09-23 for mission 4. The basis was the chain receipts,
the Host diff review, and an independent verifier seat. Whether the backend serves a child spawned
from a 0.153.4 ACP seat was ruled not required. It stays documented with the working assumption
that Luna 6 dispatch runs under a codex-cli ≥ 0.156.0 parent.

## Files Changed

56 files vs `bc495a4d`. They are the binding source `templates/agents/runtime-capabilities.json`,
the schema/preflight scripts plus their 3 plugin copies each, the 3 contract validators, the Codex
walkthrough, 3 pin tests, 21 regenerated role TOMLs, `agents/generated-agent-manifest.json`,
6 regenerated SKILL.md, 10 docs + `CHANGELOG.md`, and the run's `local-runtime-evidence.md`. See
`## Changed Paths` for the transaction's own list.

## Test Coverage

- Pins: `scripts/test-runtime-agent-architecture.js`, `scripts/test-install-model-rendering.js`,
  and `scripts/test-agent-model-resolver.js` assert `gpt-6-luna` / `max`.
- Contract validators (codex/gitlab/gitea) and the Codex walkthrough reject any other pin. Mission 2
  proved this with the old-pin mutant.
- Integration: the walkthrough ran 178/178. `npm test` covers the claude, codex, gitlab, and gitea
  chains.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- agents/generated-agent-manifest.json
- docs/README.md
- docs/api.md
- docs/architecture.md
- docs/conventions.md
- docs/decisions/0019-the-heavy-reasoning-tier.md
- docs/decisions/0021-runtime-native-orchestration-guidance.md
- docs/decisions/0025-lean-orchestrator-single-subagent-binding.md
- docs/decisions/D-687-01.md
- docs/opencode-edition.md
- docs/runtime-capabilities.md
- plugins/kaola-workflow-gitea/agents/code-explorer.toml
- plugins/kaola-workflow-gitea/agents/code-reviewer.toml
- plugins/kaola-workflow-gitea/agents/doc-updater.toml
- plugins/kaola-workflow-gitea/agents/implementer.toml
- plugins/kaola-workflow-gitea/agents/investigator.toml
- plugins/kaola-workflow-gitea/agents/knowledge-lookup.toml
- plugins/kaola-workflow-gitea/agents/tdd-guide.toml
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow-gitlab/agents/code-explorer.toml
- plugins/kaola-workflow-gitlab/agents/code-reviewer.toml
- plugins/kaola-workflow-gitlab/agents/doc-updater.toml
- plugins/kaola-workflow-gitlab/agents/implementer.toml
- plugins/kaola-workflow-gitlab/agents/investigator.toml
- plugins/kaola-workflow-gitlab/agents/knowledge-lookup.toml
- plugins/kaola-workflow-gitlab/agents/tdd-guide.toml
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow/agents/code-explorer.toml
- plugins/kaola-workflow/agents/code-reviewer.toml
- plugins/kaola-workflow/agents/doc-updater.toml
- plugins/kaola-workflow/agents/implementer.toml
- plugins/kaola-workflow/agents/investigator.toml
- plugins/kaola-workflow/agents/knowledge-lookup.toml
- plugins/kaola-workflow/agents/tdd-guide.toml
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-codex-preflight.js
- scripts/test-agent-model-resolver.js
- scripts/test-install-model-rendering.js
- scripts/test-runtime-agent-architecture.js
- scripts/validate-kaola-workflow-contracts.js
- templates/agents/runtime-capabilities.json

## Documentation Docking

`.cache/doc-docking.md`: DOCKED. CHANGELOG `[Unreleased]` and 10 docs were fixed on the branch.
README has no impact because it states no Codex binding. The 5 historical literals stay by Host
ruling.

## Follow-Up Items

- **Install convergence (not a defect; release follow-up).** The installed
  `~/.codex/agents/kaola-workflow/*.toml` and the codex marketplace cache (12.2.4) still pin
  `gpt-5.6-luna`. Live dispatch binds Luna 6 at the next version-bumped release plus
  `./install-all.sh --yes`. The codex marketplace plugin only updates on a version bump. This is
  recorded on #1090's closing comment. Cutting a release is an Owner decision and not part of this
  finalize.
- **Observation, not filed.** `./install-all.sh --check` reports `carrier CURRENT` / `PLAN` for all
  runtimes while the installed Codex role TOMLs hold the older pin. It is a dry-run plan and does
  not compare role-file contents. The Codex preflight (`profiles_stale`) is the surface that detects
  this. Whether `--check` should detect it too is a scope question for the Owner, so no issue was
  filed.
- **Unmeasured (ruled not required).** Whether the backend serves `gpt-6-luna` to a child spawned
  inside a 0.153.4-based ACP seat. The decisive experiment is recorded in
  `local-runtime-evidence.md`. The ACP pin itself belongs to the Runner (KPR #142 class), not this
  repo.
- **Operational.** The local `main` ref sits at `39a6ad88`, behind `origin/main` `bc495a4d`.
  Finalize ran with `--base origin/main` so `## Changed Paths` measures only this branch.

## Readiness

READY: missions 1–4 are done, Host acceptance is granted, and docs are docked. Sink: merge (default,
no PR). Closes #1090.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-1090/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1090/.cache/doc-docking.md
- kaola-workflow/archive/bundle-1090/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1090/finalization-summary.md
- kaola-workflow/archive/bundle-1090/local-runtime-evidence.md
- kaola-workflow/archive/bundle-1090/mission-ledger.jsonl
- kaola-workflow/archive/bundle-1090/workflow-state.md
