# Finalization summary — bundle-1088 (#1088)

## Delivered

Grok 4.6 → 4.7 adaptation (minimal scope, pure id swap) per issue #1088's inventory and its four
open-question resolutions: operative pins moved to 4.7 (grok subagent_default grok-4.7/medium;
cursor bindings cursor-grok-4.7-* equivalents per the measured catalog note); historical measured
evidence strings keep their 4.6 text with fresh 2026-09-22 4.7 measured rows appended; ADR 0019
measurement rows and URL slug retained with dated notes; untracked mirrors regenerated via
sanctioned sync scripts only; render oracle recaptured paired in-commit.

Single commit 359b4628 (19 files +196/−142).

## Files Changed

templates/agents/runtime-capabilities.json, agents/generated-agent-manifest.json,
scripts/{sync-cursor-edition,sync-grok-edition,test-cursor-edition,test-grok-edition,
test-issue-1052-cursor-cli-startup-prep,test-runtime-agent-architecture}.js,
scripts/fixtures/issue-1055-render-baseline.json, docs (grok/cursor-edition, runtime-capabilities,
api, architecture, README index, ADR 0019/0021/0025 notes), CHANGELOG [Unreleased].

## Test Coverage / Validation

Host re-ran everything after the worker's turn ended with background validation unfinished:
test-grok-edition 412 (3-tree parity), test-cursor-edition 611 (3-tree parity),
test-agent-model-resolver, test-install-model-rendering, test-runtime-agent-architecture 742,
test-issue-1052 250, generate-agent-profiles --check, edition-sync --check, #1055 oracle green.
Four forge chains + walkthrough: receipt bound to candidate HEAD 359b4628, all green, unwaived
(kaola-workflow/bundle-1088/.cache/chain-receipt.json). One transient suite hang (install-model-
rendering in a piped batch, 0.6s CPU over 51min) cleared on direct rerun — not a candidate defect.

## Changed Paths

(finalize transaction reports the authoritative list)

## Documentation Docking

DOCKED — .cache/doc-docking.md.

## Follow-Up Items

- Resolver mapping of the new bracket value (grok-4.7[effort=medium]) to a provider slug was not
  re-probed (recorded in the new measured row); re-probe when a live Cursor child dispatch happens.
- Non-mine ACP holders on this host left untouched (other orchestrators/infra).

## Measured

- Grok CLI 1.0.40 model catalog lists grok-4.7 (low/medium/high/xhigh) — basis recorded in
  runtime-capabilities.json's 2026-09-22 entry and docs' dated notes.

## Hypothesis

- None.

searched: gh issue list before opening (delegator-directed issue; duplicate probe: open list was
empty at dispatch of the Fable issue-author seat).
