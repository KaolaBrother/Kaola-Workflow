# Issue #1049 acceptance evidence

## RED baseline

- Baseline commit: `7e93763e43864091f722b306c404bb85d7f96052` (`chore: release 10.2.1`).
- Focused command: `node scripts/test-runtime-agent-architecture.js`.
- The unmodified baseline suite was green: `799 assertions`.
- The #1049 parser has a positive fixture for decimal model versions and negative fixtures for the
  historical Sol pair and `xhigh` versus exact `high`; standard/Luna/max passes that fixture.
- After adding the corrected #1049 acceptance assertions, the same command failed with exit code
  `1`: `runtime-agent-architecture test FAILED: 13 failure(s), 795 passed.`
- The failures are the old Codex tier mapping in the source adapter and every generated/tracked
  Codex Next, Finalize, and compact carrier. No production implementation was changed for this
  RED run.

Failure signatures:

```text
FAIL: A1049/source: Codex adapters carry Luna/max, Astra/medium, Astra/high and inherit model — gaps ["codex-github/reasoning","codex-github/heavy", ...]
FAIL: A1049/render: fresh Codex next/finalize carriers across all three forges carry the requested tier defaults — gaps ["plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md/reasoning", ...]
FAIL: A1049/render: fresh Codex compact carriers across all three forges carry the requested tier defaults — gaps ["codex/github/compact-recovery/reasoning", ...]
FAIL: A1049/tracked: generated Codex next/finalize/compact bytes across all three forges carry the requested tier defaults — gaps ["plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md/reasoning", ...]
```

The independent acceptance test is [scripts/test-runtime-agent-architecture.js](../../scripts/test-runtime-agent-architecture.js).
An earlier RED capture used an invalid helper that treated the decimal in `gpt-5.6-luna` as a
segment boundary; this corrected run supersedes that capture. At the RED point, the implementation
verdict remained pending; the current focused candidate result is recorded below.

## GREEN focused proof

Against the current issue-1049 candidate, after the source and generated carriers were updated:

- `node scripts/test-runtime-agent-architecture.js` → `runtime-agent-architecture test passed (808 assertions)`.
- `node scripts/test-generate-routing-surfaces.js` → `test-generate-routing-surfaces: all 480 assertions passed`.
- The runtime acceptance covers the three Codex source adapters, six fresh Next/Finalize renders,
  three fresh compact renders, nine tracked Codex Next/Finalize/compact files, model-free inherited
  profiles, and exact `high` versus `xhigh` discrimination.
- Full `npm test` and the required integration chain were not run by this acceptance owner; the
  parent owns those checks and the final candidate-bound receipt.

## Frozen-chain oracle correction

The producer-selected Claude chain on frozen candidate
`9b630a059b62c6e8f6179b7f4c7f9c005c85e174` failed inside
`simulate-workflow-walkthrough.js` because `scripts/validate-workflow-contracts.js:277` still
required the retired contiguous phrase `justification, approval, or fallback stigma`. The current
source and generated surfaces intentionally say that Workflow adds no separate approval requirement
while dispatch remains subject to the active host/session permission policy. That wording is the
approved issue scope and preserves native host permission, custody, and choice behavior; the failure
was a stale validator oracle.

Acceptance custody updated that validator assertion to require both current semantic clauses:
`justification, or fallback stigma attaches to the judgment` and `Workflow adds no separate approval
requirement, and dispatch remains subject to the active host/session permission policy`. No product
source was changed for this correction.

Focused correction proof:

- `KAOLA_WORKFLOW_OFFLINE=1 node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed`.
- `node scripts/test-runtime-agent-architecture.js` → `runtime-agent-architecture test passed (808 assertions)`.
- `node scripts/test-generate-routing-surfaces.js` → `test-generate-routing-surfaces: all 480 assertions passed`.
- The full producer chain was not rerun after this oracle-only correction; the parent owns the
  candidate-bound integration receipt.

## Cross-edition mirror repair

The retry at candidate `6d5cf620025aabca19beddd9b3c635220131d37b` failed before contract execution
because the canonical `scripts/validate-workflow-contracts.js` oracle was ahead of its Codex mirror
at `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`. This was mechanical generated
test-script drift; the acceptance meaning was unchanged.

Following the documented `npm run sync:editions` convention copied the canonical validator into the
Codex mirror (`codex-sync .../validate-workflow-contracts.js`). Focused repair proof now passes:

- `node scripts/validate-script-sync.js` → `OK: 14 common scripts, 25 byte-identical groups, 0 rename-normalized families, 2 hooks.json families (config + hooks dir), and 5 forge export-superset families in sync.`
- `node scripts/edition-sync.js --check` → `6 forge aggregator ports in parity with canonical`; committed kernel parity verified.
- `KAOLA_WORKFLOW_OFFLINE=1 node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed`.

The Codex mirror is the only additional changed path from this repair. The full producer chain was
not rerun; parent owns re-freezing and the candidate-bound integration receipt.

## Prompt-budget RED at `f7a57144ab378f7e36fdea660cbce66642130bfc`

The existing Issue #1044 prompt-budget acceptance remains authoritative: each complete static
prompt must be between 6.5 KB and 8.5 KB (6,500–8,500 bytes). The current candidate was measured
without changing that oracle:

- `node scripts/test-issue-1044-prompt-bundle.js` → `150 passed, 3 failed`.
- Failure signature: `B5[cursor/github]: complete static prompt stays within measured 6.5–8.5 KB budget (got 8937 B)`; the same assertion failed for `cursor/gitlab` and `cursor/gitea`.
- The detached baseline `7e93763e43864091f722b306c404bb85d7f96052` rendered all three Cursor prompts
  at `8499 B` and passed `153 passed, 0 failed`.

The byte delta is attributable to shared source growth, not Cursor-specific guidance: baseline to
current component sizes are `global 3293 → 3618 B` (+325), `dispatch 1913 → 2026 B` (+113),
`skeleton 682 → 682 B`, and `guidance 2720 → 2720 B`; the complete prompt is `8499 → 8937 B`
(+438). Any implementation compression must therefore recover at least 438 bytes to return below
the existing 8,500-byte ceiling, with margin preferred because the baseline had only one byte of
headroom. The lower 6,500-byte bound remains in force.

No prompt-budget assertion was loosened and no production source was changed during this RED
investigation. The implementation must retain one shared global contract and one shared dispatch
contract in every generated surface, vendor-neutral runtime overlays, durable reload and mission
semantics, host/session permission policy, scoped authorization behavior, exact `high` versus
`xhigh` routing, and the existing no-script/no-lifecycle machinery constraints. Full-chain rerun
and final GREEN remain parent-owned and pending source reconciliation.

## Narrowed-scope GREEN focused proof

After the owner scope correction, the producer restored the shared author sources and regenerated
the narrowed Codex-only carriers. Against the current worktree at `HEAD`
`f7a57144ab378f7e36fdea660cbce66642130bfc`, the independent acceptance proof is green:

- `node scripts/test-issue-1044-prompt-bundle.js` → `153 passed, 0 failed`.
- `node scripts/test-issue-1044-runtime-adapters.js` → `65 passed, 0 failed`.
- `node scripts/test-issue-1045-cursor-conformance.js` → `24 assertions passed`.
- `node scripts/test-issue-1046-global-contract.js` → `140 passed`.
- `node scripts/test-runtime-agent-architecture.js` → `808 assertions` passed.
- `node scripts/test-generate-routing-surfaces.js` → `480 assertions` passed.
- `node scripts/generate-routing-surfaces.js --check` → all `24` surfaces byte-match the skeleton.
- `KAOLA_WORKFLOW_OFFLINE=1 node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed`.
- `node scripts/validate-script-sync.js` → `14` common scripts and all registered mirror groups in sync.
- `node scripts/edition-sync.js --check` → `6` forge aggregator ports in parity; committed kernel parity verified.
- `node scripts/test-bash-block-guards.js` → `49 assertions passed`.
- `node scripts/test-spawn-classification.js` → `10 mutation assertions` passed.
- `node scripts/test-relative-tmpdir-escape.js` → `50 passed, 0 failed`.
- `node scripts/test-install-model-rendering.js` → `Install model rendering tests passed`.

The generated complete static prompt sizes are `claude 7497 B`, `codex 7460 B`, `grok 7164 B`,
and `cursor 8499 B` for each of GitHub, GitLab, and Gitea. This preserves the original Cursor
budget ceiling with one byte of headroom and preserves the lower bound.

Independent byte checks report all shared author sources and both validator copies equal to baseline
`7e93763e43864091f722b306c404bb85d7f96052`; the baseline-delta allowlist contains exactly `18`
files and no unexpected shared or non-Codex runtime deltas. Full `npm test`, the integration chain,
and installation remain parent-owned and were not claimed here.

## Scope correction and validator restoration

The owner narrowed issue #1049 to the Codex model-tier mapping and withdrew the intermediate
shared authorization, dispatch, and evidence-reuse policy changes. In response, acceptance custody
restored both validator copies to the baseline policy oracle from
`7e93763e43864091f722b306c404bb85d7f96052`:

- `scripts/validate-workflow-contracts.js`
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`

The restored assertion is the original `justification, approval, or fallback stigma` requirement;
the temporary host-policy wording assertions were removed. Both files now byte-match the baseline
and each other. The independent Codex tier assertions in
`scripts/test-runtime-agent-architecture.js` remain in custody. Focused post-restoration results
await the producer's narrowed-scope source handback; no production source was edited here.
