# Finalization — Summary: issue-1036

## Delivered

- Preserved Cursor `named_roles: true` while splitting runtime routing by the live host catalog instead of treating APP/Cloud and CLI as one surface.
- Kept supported Cursor CLI on Path A: exact Kaola named roles, parent-authored Task calls with the model omitted, and profile-carried `medium` / `high` / `xhigh` tiers.
- Kept Cursor APP/Cloud catalog-miss hosts on Path B: reported built-ins are used only as themselves, absent custody-bearing Kaola roles become per-item `capability_gap`, omit-model follows the parent, and files already present are not mislabeled as an install miss.
- Added a generated-consumer mutation oracle for the Path B parent/profile meaning and made the Codex version-floor tests hermetic instead of relying on a suite-global override.
- Docked the host split, carrier boundary, evidence, and still-unclaimed Cloud boot-load across the public documentation and architecture authorities.

## Surface Acceptance

- APP/Cloud: PASS. Issue #1036 records live built-in-only parent and child probes, including successful omit-model `generalPurpose`, `inherit`, and resolver-listed model routing; the candidate preserves that measured Path B.
- CLI: PASS. Local Cursor CLI `2026.08.25-3e8eec8` resolved exact custom `implementer`, `code-reviewer`, and `planner` roles and carried the expected `medium`, `high`, and `xhigh` profile tiers with the Task model omitted.
- Combined: PASS. Each surface was proved through its own carrier; neither surface's catalog was inferred from the other.

## Review Reconciliation

- The independent code review's suite-global `KAOLA_CODEX_VERSION` finding is resolved by scoped fixtures plus a hermetic no-env live-binary fallback probe.
- The independent falsification finding is resolved by a mutation oracle that reverses the Path B semantic in the real adapter authority, regenerates both consumers, and proves behavioral RED.
- Both original reviewers closed their finding identities at repair commit `0501f2527e04c1ecd896df418e50c97b279aa568` with zero blocking findings and no repair-delta regression.

## Test Coverage

- Cursor edition: 854 assertions.
- Runtime agent architecture: 721 assertions.
- Install/model rendering: 1,493 assertions.
- Generated profiles: 14 roles across seven runtimes, 126 renders.
- Generated routing: 18 surfaces match their skeleton.
- Producer-selected self-host validation: all four unwaived chains (`claude`, `codex`, `gitlab`, `gitea`) passed once, without retry, timeout, signal, or accepted RED.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the run-state and documentation bands:

- scripts/sync-cursor-edition.js
- scripts/test-cursor-edition.js
- scripts/test-install-model-rendering.js
- scripts/test-runtime-agent-architecture.js
- templates/agents/runtime-capabilities.json

## Mission List

items: 11
carrying an outcome while their status is not `done`: 0

## Documentation Docking

`DOCKED` at candidate `90cccd9b1793dba80b4bd5cf01a100147bbad7fe`. `CHANGELOG.md`, `README.md`, the documentation index, API and convention references, Cursor guide, ADR 0021, and runtime capability evidence all carry the verified APP/Cloud versus CLI split. No dependency, setup, environment, config-schema, installer, or structural architecture change required another docking surface.

## Run gaps

- none

## Follow-Up Items

- None. Cursor Cloud boot-load remains explicitly unclaimed rather than being converted into an unsupported acceptance claim.

## Status: MERGED, CLOSED, AND ARCHIVED

Candidate `90cccd9b1793dba80b4bd5cf01a100147bbad7fe` has a clean exact-SHA four-chain receipt with SHA-256 `b873944797c6825e131715b3892b58c1f321655e2823943fe8a06b231b6cd9d6` and code-tree hash `3605f207337c22f7f8b745aa6b35456a4a4fa059ba60fb59d86bd1147b6a16b9`. The sink published it to main, GitHub records PR #1038 merged and Issue #1036 closed, the temporary branch and linked worktree are gone, and the scoped closure audit reports `current_project_clean: true` with zero issue-1036 drift.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1036/.cache/adversarial-closure.md
- kaola-workflow/archive/issue-1036/.cache/adversarial-verification.md
- kaola-workflow/archive/issue-1036/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1036/.cache/code-review-closure.md
- kaola-workflow/archive/issue-1036/.cache/code-review.md
- kaola-workflow/archive/issue-1036/.cache/codex-version-test-repair.md
- kaola-workflow/archive/issue-1036/.cache/cursor-dual-surface.md
- kaola-workflow/archive/issue-1036/.cache/doc-docking.md
- kaola-workflow/archive/issue-1036/.cache/doc-updater.md
- kaola-workflow/archive/issue-1036/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1036/.cache/path-b-test-repair.md
- kaola-workflow/archive/issue-1036/.cache/run-gaps.json
- kaola-workflow/archive/issue-1036/finalization-summary.md
- kaola-workflow/archive/issue-1036/mission-list.md
- kaola-workflow/archive/issue-1036/workflow-state.md
