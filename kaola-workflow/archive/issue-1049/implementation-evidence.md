# Issue #1049 implementation evidence

## Task

Apply the requested Codex Astra dispatch defaults and the audited instruction corrections while
preserving role membership, Codex profile model omission, other-runtime mappings, receipt evaluators,
lifecycle state, scheduling, and experimental context settings.

## Verification tier

`tests-green` — focused authored acceptance and production parity checks pass. The independent RED
baseline supplied by test custody was **13 failures / 795 passes** at commit
`7e93763e43864091f722b306c404bb85d7f96052`; it was not rerun.

## Authoring authorities changed

- `templates/agents/runtime-capabilities.json`: all three Codex forge adapters now carry
  standard `gpt-5.6-luna`/max, reasoning `gpt-6-astra`/medium, and heavy `gpt-6-astra`/high;
  all three intent mappings remain `inherit`.
- `templates/agents/behavior-contracts.json`: implementer verification may consume supplied
  evidence for the same candidate/check/scope, otherwise it establishes a baseline; behavior
  contract version incremented to 2.
- `templates/global/kaola-workflow-global.md`, `templates/axioms.md`, and
  `templates/routing/{dispatch-contract,init,next,finalize}.skeleton.md`: scoped authorization
  persistence, host/session permission qualification, freshness protection, and bounded
  finalization-evidence reuse rules.

## Generated carriers and documentation

Used the existing generators; no rendered surface was hand-edited. The generated manifest and all
runtime role profiles reflect the implementer contract update. Canonical commands/hooks and the
three Codex forge skill/hook trees reflect the routing changes. Updated `README.md`, `docs/api.md`,
`docs/runtime-capabilities.md`, `docs/installation.md`, ADR 0019, ADR 0021, and `CHANGELOG.md`
under `[Unreleased]`. Added this evidence file only under the issue folder; lifecycle records were
not changed.

## Commands and results

Generation (all exit 0):

- `node scripts/generate-agent-profiles.js --write` — 126 profiles generated.
- `node scripts/generate-routing-surfaces.js --write` — 24 surfaces rendered.
- `node scripts/edition-sync.js --write` — edition sync completed; tree already in sync afterward.

Focused checks (all exit 0):

- `node scripts/generate-agent-profiles.js --check`
- `node scripts/generate-routing-surfaces.js --check`
- `node scripts/edition-sync.js --check`
- `node scripts/validate-workflow-contracts.js`
- `node scripts/validate-kaola-workflow-contracts.js`
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
- `node scripts/test-runtime-agent-architecture.js` — 808 assertions.
- `node scripts/test-generate-routing-surfaces.js` — 480 assertions.
- `node scripts/test-route-reachability.js` — 172 assertions.
- `node scripts/test-issue-1046-global-contract.js` — 140 passed.
- `node scripts/test-issue-1044-runtime-adapters.js` — 65 passed, 0 failed.
- `node scripts/test-install-model-rendering.js` — passed.
- `git diff --check`

## Limits and handoff

The full `npm test`, `npm run test:parallel`, `run-chains`, integration walkthrough, installation
refresh, lifecycle finalization, and review were intentionally left to the parent owner. No user
home files, runtime settings, receipt evaluators, scheduler/gating machinery, or experimental
context management were changed. The edition sync tool emitted its normal notice that present
additive trees in the main checkout were refreshed from this worktree's canonical sources; the
parent should include that shared-worktree state in its review.

## Frozen-candidate B5 repair

On frozen candidate `f7a57144`, `node scripts/test-issue-1044-prompt-bundle.js` measured 150 passed
and 3 failed: each Cursor forge prompt was 8,937 B against the existing 6,500–8,500 B budget. The
pre-#1049 baseline was 8,499 B; the increase was exactly the global source delta (+325 B) plus the
shared dispatch source delta (+113 B). Cursor adapter/model sources were unchanged.

The smallest source repair folded the scoped-authorization rule into the existing global axiom,
removed compact-redundant global dispatch wording, and shortened the shared host-policy qualifier;
`templates/axioms.md` remains byte-aligned with the shared dispatch decision wording. After
regeneration, global source is 3,251 B and dispatch source is 1,954 B. Fresh Cursor/github,
gitlab, and gitea compact prompts are each **8,498 B**.

Repair commands (all exit 0):

- `node scripts/generate-routing-surfaces.js --write`
- `node scripts/test-issue-1044-prompt-bundle.js` — 153 passed, 0 failed.
- `node scripts/generate-routing-surfaces.js --check`
- `node scripts/test-runtime-agent-architecture.js` — 808 assertions.
- `node scripts/test-generate-routing-surfaces.js` — 480 assertions.
- `node scripts/validate-workflow-contracts.js`
- `node scripts/validate-kaola-workflow-contracts.js`
- `node scripts/test-issue-1046-global-contract.js` — 140 passed.
- `node scripts/test-route-reachability.js` — 172 assertions.
- `git diff --check`
