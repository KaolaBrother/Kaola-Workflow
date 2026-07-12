# Workflow Plan — issue #667

<!-- plan_hash: 1a6230aaa64f774bffdea7edaf3752120515cacf85912ea5bd3d222530e37f2d -->

## Meta
labels: workflow:in-progress
delegation_policy: delegate
speculative_open_policy: auto
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| fix-overlap-fail-closed | tdd-guide | — | scripts/kaola-workflow-classifier.js, plugins/kaola-workflow/scripts/kaola-workflow-classifier.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 7 | sequence | standard |
| review-overlap-fix | code-reviewer | fix-overlap-fail-closed | — | 1 | sequence | reasoning |
| record-fail-closed-decision | doc-updater | review-overlap-fix | CHANGELOG.md, docs/decisions/D-667-01.md | 2 | sequence | standard |
| finalize | finalize | record-fail-closed-decision | — | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| fix-overlap-fail-closed | complete |
| review-overlap-fix | complete |
| record-fail-closed-decision | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (fix-overlap-fail-closed) | subagent-invoked | evidence-binding: fix-overlap-fail-closed d4ec59d99991 | |

| code-reviewer | subagent-invoked | evidence-binding: review-overlap-fix 73ed9ed60aea | |
| doc-updater (record-fail-closed-decision) | subagent-invoked | evidence-binding: record-fail-closed-decision cb8e33789f50 | |
| finalize (finalize) | main-session-direct | evidence-binding: finalize 48fb8e815aaa | |
## Node Briefs

### fix-overlap-fail-closed
Restore the fail-closed claim-overlap defense for a structurally-ambiguous fast-summary `## Scope`, reversing the #660 (commit 0b0dc5a0) fail-open trade. The value call is ALREADY SETTLED by the operator: FAIL-CLOSED. Do not re-open or escalate it.

Root cause: the overlap-guard consumer `scanClaimedOverlap` in each classifier reads a claimed fast project's write set via `sectionBody(fastSummary, 'Scope')`. `sectionBody` collapses `sectionBodyState`'s `{status:'ambiguous',body:''}` (an unclosed fence, or a duplicate `## Scope` heading) into a bare `''`, so the consumer sees "no write set" → no overlap → silent GREEN on malformed self-authored input. The scanner primitive's refusal-to-manufacture is correct; the questionable step is the CONSUMER mapping "ambiguous → no overlap risk."

Fix (RED → GREEN), at the CONSUMER only: in `scanClaimedOverlap`, read the claimed fast-summary Scope via `sectionBodyState(...)` (already exported — add NO new export) and branch on status. When status is `'ambiguous'`, treat the claimed project's write set as INDETERMINATE and fail closed so `classify` returns `verdict:'red'` with reasoning that names the ambiguous/unparseable fast-summary Scope. A genuinely ABSENT Scope (status `'absent'`, no `## Scope` at all) must NOT be manufactured into an overlap — keep today's behavior for absent; only ambiguous/unparseable becomes indeterminate. Keep the primitives `sectionBody`/`sectionBodyState` UNCHANGED (they still return `''`/`{status:'ambiguous'}` — no manufacture).

RED-first tests to flip from the current false-GREEN to fail-closed (assert `verdict === 'red'`), and add a companion assertion that an absent Scope is still NOT manufactured:
- `scripts/simulate-workflow-walkthrough.js` — `testClassifierFastScopePreSectionUnclosedFenceRed` (currently asserts green; flip to the fail-closed red and update its stale comment). Do NOT touch `testClassifierSectionBodyFenceIdentity` (the primitive still returns `''` for an unclosed fence — that assertion stays true) or `testPlanConsumerFenceMatrix` (that is the plan-validator's `## Nodes` consumer, a DIFFERENT consumer — leave it intact).
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — the `fast-fence-pre` case (`assert.strictEqual(result.verdict, 'green')`) flips to `'red'`.
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — the `fast-fence-pre` case flips to `'red'`.

Edition consistency (single semantic change across four DIVERGENT editions — mirror by the SAME canonical spec, do not free-form each): `scripts/kaola-workflow-classifier.js` and `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` are COMMON byte-identical (validate-script-sync enforces exact byte equality — edit both identically); `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` are hand-ports — apply the identical logic with forge nouns. Canonical spec for all four: "at the fast-summary overlap-guard consumer, an ambiguous `## Scope` classifies indeterminate → fail-closed red; primitives unchanged; absent Scope unchanged."

Validation: run the focused `node scripts/simulate-workflow-walkthrough.js` during RED/GREEN, then reuse the Meta `validation_command` for the full four-chain cross-edition gate (this diff touches the gitlab/gitea plugin trees, so all four chains must be green — a green claude chain alone is insufficient). Do not add a module export, do not widen the classifier registration surface, and keep the fix surgical to the overlap-guard consumer.

### review-overlap-fix
Review the complete bug-fix diff and TDD evidence. Confirm: the fail-closed mapping lives at the overlap-guard CONSUMER (`scanClaimedOverlap`/`classify`), not in the scanner primitives; `sectionBody`/`sectionBodyState` are unchanged and still refuse to manufacture a missing section; an ambiguous fast-summary Scope (unclosed fence or duplicate heading) now yields `verdict:'red'` while a genuinely absent Scope is NOT manufactured into an overlap; all four editions changed consistently (root↔codex byte-identical, gitlab/gitea rename-equivalent logic with forge nouns); no new module export or widened registration surface; the `testClassifierSectionBodyFenceIdentity` and `testPlanConsumerFenceMatrix` regressions are preserved; exact write-set compliance; and the recorded four-chain (`claude`,`codex`,`gitlab`,`gitea`) validation is green. Emit the required verdict and blocking-findings fields.

### record-fail-closed-decision
Read the reviewed final diff before writing. Author two docs recording the now-visible value call (the issue's core complaint is that the #660 trade was "recorded nowhere"):
- `CHANGELOG.md` — a concise user-visible `[Unreleased]` entry: the claim-overlap guard now fails closed on a structurally-ambiguous or unparseable fast-summary `## Scope` — an unclosed fence or duplicate heading no longer silently GREENs an overlapping candidate; the scanner still refuses to manufacture a missing Scope.
- `docs/decisions/D-667-01.md` — a decision record: the failure-direction value call for an ambiguous fast-summary Scope is FAIL-CLOSED (indeterminate/blocked), reversing the #660 (commit 0b0dc5a0) fail-open trade and restoring the pre-#660 protective intent. State the rationale (a fail-closed defense must not become fail-open on malformed self-authored input), that the scanner's refusal-to-manufacture is retained, that only the consumer's "ambiguous → no overlap risk" mapping changed, and that a genuinely absent Scope is unchanged. Keep provenance (issue/commit/decision id) in the decision record and CHANGELOG only — never in agent-facing prompts. Do not widen documentation beyond this change.

### finalize
After the docs are recorded and the review has passed, reuse the recorded four-chain validation evidence (do not re-derive a new suite) and perform the merge-sink finalization for issue #667. Keep the sink docs/state-only; do not widen scope.
