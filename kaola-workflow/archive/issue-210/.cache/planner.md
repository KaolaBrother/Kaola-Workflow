# Planner (opus) — issue-210 ideation

> NOTE (orchestrator correction): the planner's "there is ONE Codex validator /
> ONE walkthrough" premise corrections were WRONG — it only inspected top-level
> `scripts/` and missed the plugin-dir forge validators
> (`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
> L213–324, gitea L220–331) and the 3 Codex walkthroughs. Verified via
> primary-source grep + the green baseline `npm test`. New tests therefore mirror
> to ALL 3 forge validators. The planner's prose proposals, detection signal, and
> recommendation (Approach A) are sound and adopted.

## Recommendation: Approach A — prose-default + additive RED-guards
Rewrite the byte-identical Delegation Contract (L27–55) + resume-clause tail in all
3 forge next-SKILLs; add additive guards to the Codex validator(s); update README +
docs. No script logic change. Minimal change that meets the end state AND the
explicit "add contract tests" AC.

## Design crux (resolves the apparent constraint tension)
- Default `delegation_policy: delegate`, always, no prompt.
- The 3-value enum survives verbatim in the `KAOLA_DELEGATION_POLICY` description +
  printf patch, but `tool-unavailable` is no longer a *presented* choice.
- Tool absence → per-row `local-fallback-tool-unavailable` under `delegate`;
  repair-state `delegate` branch already accepts this, but ONLY when each row's
  Evidence cell is non-empty (`hasEvidenceOrSkip`). So prose must instruct writing
  the Evidence value, not just the token.
- `local-authorized` (records `local-fallback-explicit`) only on explicit user opt-out.
- No script logic changes — repair-state already enforces the end state.

## Detection signal (Decision 2)
Presence/absence of `*.toml` role profiles under `.codex/agents/kaola-workflow/` —
the exact dir `install-codex-agent-profiles.js` writes (targetAgentsDir, copies
`*.toml`). The brief's `.codex/agents/*.toml` was one level too shallow. Assertable
as a prose sentinel.

## Resume clause (Decision 3)
Keep the asserted first line verbatim; change only the tail to
"default `delegation_policy` to `delegate` without prompting and continue."

## Validator strategy (Decision 4)
Additive RED-guards: assertNotIncludes the two retired prompt sentinels +
assertIncludes the new default/detection/explicit sentinels; the existing
`assertPolicyAllowed('delegate', tool-unavailable)` is the auto-detect regression
lock. Sentinels lifted byte-exact from the prose; write prose first.

## Scope guard (Decision 6)
The other 7 Codex skills only RECORD the 4-token vocabulary — no prompt, no change.
Do not alter their vocabulary or the `Plain `invoked` is intentional…` sentinels.

## Do-NOT-build
byte-synced scripts (`kaola-workflow-repair-state.js`, `release-surface-drift.js`);
package.json version; any `commands/`; `validate-workflow-contracts.js` delegation
logic; walkthrough edits; cross-forge parity guard (Approach B → follow-up);
removing `tool-unavailable` from the enum; altering the asserted resume substring.
