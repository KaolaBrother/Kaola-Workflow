# Phase 1 - Research / Discovery: issue-210

## Deliverable
Make the Codex Kaola-Workflow **default to delegated compliance** instead of
prompting the user (`delegate` / `local-authorized` / `tool-unavailable`) at
startup. The `kaola-workflow-next` Codex "Delegation Contract" must: default
`delegation_policy: delegate` without asking; auto-detect & record
`tool-unavailable` as evidence when subagent role profiles are absent; allow
`local-authorized` only on an explicit user request to disable delegation;
preserve repair-state enforcement and the 4-token compliance vocabulary. Update
`README.md` + `docs/workflow-state-contract.md`. Add contract tests for the
no-prompt default path and the explicit local-fallback path.

## Why
The startup prompt leaks an implementation fallback into the product workflow.
"Workflow as code" means delegation should be deterministic policy, not a
repeated user preference. Users should only be asked for genuine user-owned
overrides or risky fallbacks, not whether the workflow should comply with its own
delegated-role contract.

## Affected Area (CODEX-only; Claude tree untouched)
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` (L27–55, L224–225)
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` (L27–55, L236–237)
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` (L27–55, L236–237)
- `scripts/validate-kaola-workflow-contracts.js` (github-codex validator; additive tests)
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` (additive)
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` (additive)
- `README.md` (L373–378 delegation prose only)
- `docs/workflow-state-contract.md` (L39–43 only; preserve L44–56)
- `CHANGELOG.md` (`## [Unreleased]` bullet; no version bump)

**Explicitly NOT touched:** `package.json` version, all `commands/`,
`scripts/validate-workflow-contracts.js`, `scripts/simulate-workflow-walkthrough.js`,
`scripts/kaola-workflow-fast-audit.js`, `scripts/test-fast-audit.js`,
`kaola-workflow-repair-state.js` (byte-synced), `release-surface-drift.js`
(byte-synced), the 3 `.codex-plugin/plugin.json` versions.

## Key Patterns Found
1. The "## Delegation Contract" block is **byte-identical** in all 3 forge
   `kaola-workflow-next/SKILL.md` at L27–55; only downstream forge wording differs.
   Rewrite the SAME canonical block into all 3 to keep parity (no validator diffs
   the 3 blocks, so divergence would be a latent bug).
2. `kaola-workflow-repair-state.js:235–263` (`delegate` branch) **already** accepts
   an all-evidenced `local-fallback-tool-unavailable` ledger — the #210 auto-detect
   end state — so the fix is **pure prose + additive tests**, zero script change.
3. The 3 Codex validators couple only to the resume-reference string, the 4-token
   vocabulary, and the 3 policy values (all preserved by #210). New tests are
   additive RED-guards (`assertNotIncludes` old prompt / `assertIncludes` new
   default sentinels), mirrored across forges.
4. Codex version is hard-coupled to the root tag (Branch-A #193,
   `validate-workflow-contracts.js:388–396`) → a codex-only bump fails `npm test`.
   **User decision: ship at codex 1.8.2, no version bump.**

## Test Patterns
- Framework: hand-rolled Node assert (no test runner).
- Location: `scripts/validate-kaola-workflow-contracts.js` + the gitlab/gitea
  `validate-…-contracts.js`; Codex walkthroughs
  `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` and the
  gitlab/gitea `simulate-*-codex-workflow-walkthrough.js`.
- Structure: top-level `assert*` helper calls; validators run via
  `npm run test:kaola-workflow:codex` (+ gitlab/gitea suites); full `npm test`.
- Style: string-includes / not-includes (`assertIncludes` / `assertNotIncludes`)
  for prose contracts; `assertPolicyAllowed/Blocked` for repair-state outcomes.

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` skips the tag-existence + release-surface-drift checks
  (not the canonical release gate).
- Codex subagent role profiles are installed by `install-codex-agent-profiles.js`
  → `.codex/agents/*.toml` (the availability signal for delegate vs auto
  tool-unavailable).

## External Docs
none — internal patterns are sufficient; no external library/API behavior is involved.

## GitHub Issue
KaolaBrother/Kaola-Workflow#210

## Completeness Score
10/10 — Goal clarity 3/3, Expected outcome 3/3, Scope boundaries 2/2, Constraints 2/2.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md (8-agent code-explorer Workflow fan-out, run wf_08d1c5d9-00a) | |
| docs-lookup | N/A | internal patterns sufficient; no external/library behavior in scope | docs-lookup not needed |

## Notes / Future Considerations
- Open design decisions for Phase 2/3: (a) the exact canonical Delegation Contract
  prose; (b) the concrete tool-unavailable **detection signal** (presence of
  `.codex/agents/` role profiles) so the policy is deterministic and testable;
  (c) the exact sentinel strings shared byte-for-byte between SKILL prose and the
  3 validators; (d) ensure the auto-detect path writes an **Evidence** value (not
  just the status token) so repair-state's `delegate` branch passes.
- Success gate: both `test:kaola-workflow:codex` and `test:kaola-workflow:claude`
  green, full `npm test` green, and `git diff --name-only main` lists ONLY the
  in-scope files above + `CHANGELOG.md` + `kaola-workflow/issue-210/` artifacts.
