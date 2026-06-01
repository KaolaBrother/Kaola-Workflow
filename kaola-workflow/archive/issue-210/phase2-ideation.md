# Phase 2 - Ideation: issue-210

## Approaches Evaluated

### Option A: Prose-default + additive RED-guards (SELECTED)
- Summary: Rewrite the byte-identical "## Delegation Contract" block (L27–55) and
  the resume clause tail (github L225 / gitlab+gitea L237) in all 3 forge
  `kaola-workflow-next/SKILL.md` to default `delegate` with no prompt, auto-detect
  tool-unavailable via `.codex/agents/kaola-workflow/` and record it as evidence,
  and gate `local-authorized` behind an explicit user request. Add additive
  contract tests (assertNotIncludes the two retired prompt sentinels +
  assertIncludes the new default/detection/explicit-opt-out sentinels + two
  #210-labeled `assertPolicyAllowed` cases) to ALL 3 Codex validators. Update
  README L373–378 + docs/workflow-state-contract.md L39–43. No script logic
  change; no version bump.
- Pros: Surgical; rides repair-state's existing acceptance of
  `delegate`+evidenced-`local-fallback-tool-unavailable` (zero logic risk);
  RED-guards positively prevent prompt regression; honors every do-not-touch
  boundary (byte-synced scripts, package.json, commands/).
- Cons: gitlab/gitea delegation prose has no enforced cross-forge parity guard
  (pre-existing); relies on lifting sentinels byte-exactly.
- Risk: Low (only failure mode = sentinel/prose mismatch, caught by the validator).
- Complexity: Medium (3 SKILLs + 3 validators + 2 docs + CHANGELOG = 9 edits, all prose/tests).

### Option B: Option A + a new cross-forge parity guard
- Summary: As A, plus a new assertion that the 3 forge next-SKILL Delegation
  Contract blocks match.
- Pros: Closes the residual gitlab/gitea drift gap; makes byte-identity enforced.
- Cons: Out of #210 scope; adds a new validator surface + maintenance coupling;
  violates "make surgical changes."
- Risk: Medium. Complexity: Medium.

### Option C: Minimal — prose rewrite only, no new tests
- Summary: Rewrite SKILLs + docs; rely on existing green assertions.
- Cons: FAILS the explicit AC "Contract tests cover the no-prompt default path and
  explicit local fallback path." Existing assertions pass against both prompting
  and non-prompting prose, so nothing prevents regression.
- Risk: High (AC miss). Complexity: Lowest.

## Advisor Findings
Design endorsed as sound and complete against the AC; no blocker. Mirror the new
tests to all 3 forge validators (gitlab L213–324, gitea L220–331 are real). Risk
is purely mechanical byte-exact string matching — grep every sentinel after edits;
diff the rewritten block across the 3 SKILLs; match each validator's idiom
(github helpers vs gitlab/gitea `assert(!read().includes())` + delegationNegativeChecks);
preserve per-forge tokens (github all 3 status tokens L155–157; gitlab/gitea loops
only `subagent-invoked`); keep README version rows L403–408 untouched. Final gate:
full `npm test` green AND `git diff --name-only main` lists only in-scope files.
Full notes in `.cache/advisor-ideation.md`.

## Selected Approach
**Option A** — minimal change that fully satisfies the end state and the explicit
"add contract tests" AC while honoring every hard constraint and do-not-touch
boundary. Option B's parity guard is a real improvement but out of scope → log as
follow-up. Option C misses an AC.

## Canonical Design Decisions (locked)
1. **Detection signal**: absence of `*.toml` role profiles under
   `.codex/agents/kaola-workflow/` (the exact dir `install-codex-agent-profiles.js`
   writes). Deterministic and assertable as a prose sentinel.
2. **Evidence requirement**: the auto-detect path MUST write a non-empty Evidence
   value for each `local-fallback-tool-unavailable` row (repair-state's `delegate`
   branch only passes when `hasEvidenceOrSkip(row)` is true).
3. **Resume clause**: preserve the asserted first line verbatim; change the tail to
   "if it is absent, default `delegation_policy` to `delegate` without prompting
   and continue."
4. **Preserve verbatim**: printf patch + `KAOLA_DELEGATION_POLICY` 3-value
   enumeration; all 4 ledger tokens; the resume-reference substring.
5. **Sentinels** (single-line, byte-lifted into validators): NOT-includes
   `Ask the user once at startup`, `How should delegation be handled`; includes
   `Codex subagent delegation is the default.`,
   `` The default `delegation_policy` is `delegate` ``, `.codex/agents/kaola-workflow/`,
   `` record `local-fallback-tool-unavailable` with a non-empty Evidence value ``,
   `only when the user explicitly`,
   `` default `delegation_policy` to `delegate` without prompting ``.

## Out of Scope (explicit)
- No change to `kaola-workflow-repair-state.js` / `release-surface-drift.js`
  (byte-synced → touches Claude) or any logic.
- No change to the other 7 Codex phase skills (they only RECORD the vocabulary).
- No version bump (codex stays 1.8.2; user decision). No package.json, no
  `commands/`, no Claude validators/walkthroughs, no `validate-script-sync.js`.
- No new cross-forge parity guard (Option B) — follow-up only.
- No walkthrough edits (Codex walkthroughs assert no delegation prose).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md (opus; flagged "one validator" premise — corrected via primary-source reads) | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
