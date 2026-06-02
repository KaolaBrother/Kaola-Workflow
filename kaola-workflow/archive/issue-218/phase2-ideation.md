# Phase 2 - Ideation: issue-218

## Approaches Evaluated

### Option A: Fail-closed three-way inside port `probeIssueState` (SELECTED)
- Summary: Replace the binary `state === 'closed' ? 'closed' : 'open'` ternary in
  each port's `probeIssueState` with a three-way branch on the value returned by
  `forge.viewIssue`: `closed` → `closed`, `open` → `open`, and the **residual**
  (anything else, including `'unknown'`) → `unavailable` with a degraded reason
  string. No forge change. Justified by the Phase 1 invariant that GitLab/Gitea
  issues are only opened/closed, so a residual state is definitionally a
  degraded/unparseable response.
- Pros: minimal/surgical (one function per port); no new forge export → no growth
  of the #211–#213 cross-forge parity surface; produces the same
  `state === 'unavailable'` outcome the `claimProject` guard actually gates on;
  keys on the residual so any future unexpected non-binary state also fails
  closed; each port edits only its own independent tree (no root/Codex byte-sync
  churn); zero overlap with the in-progress #216 (does not touch `claim.js`,
  `sink-merge`, or `postMergeCleanup`).
- Cons: loses the empty-vs-non-JSON distinction at the reason-string level — but
  this is cosmetic (the guard reads only `state`, never the reason; root collapses
  both into one `unavailable` outcome too). Does not address the classifier's
  parallel latent gap (tracked as a named follow-up, see Out of Scope).
- Risk: Low
- Complexity: Small

### Option B: Add `viewIssueRaw` accessor + replicate root's literal three-way
- Summary: Export a new `viewIssueRaw(id)` from each forge returning raw stdout;
  port `probeIssueState` mirrors root exactly (`if (!raw) unavailable` / parse in
  try / catch → unavailable / else map state).
- Pros: byte-faithful mirror of root; preserves empty-vs-non-JSON reason.
- Cons: adds a new public forge export to BOTH trees → enlarges the parity
  surface the recent #211–#213 slicer must cover; the preserved distinction is
  marginal (guard never reads the reason); re-implements JSON parsing the forge
  already centralizes.
- Risk: Medium
- Complexity: Medium

### Option C: Make `viewIssue` itself signal degraded (throw or sentinel)
- Summary: change `viewIssue` so a degraded exit-0 response throws/returns a
  sentinel, letting the existing catch → `unavailable` path handle it.
- Pros: a single change fixes every caller at once (incl. the classifier).
- Cons: widest blast radius — `viewIssue` has multiple callers with divergent
  degraded expectations (`issueIsClosed` wants `false` = the SAFE direction;
  roadmap `issueIsClosed`; classifier `:157/302/352`). Forcing a throw flips
  `issueIsClosed` toward an exception path it currently swallows (risk of dropping
  live work) and changes classifier verdicts outside #218's scope. Violates
  "surgical changes."
- Risk: High
- Complexity: Large–XL

## Advisor Findings
Advisor (`.cache/advisor-ideation.md`) confirms **probe-only, Option A**, nothing
blocks. Plain reading of #218 (title + Suggested fix) is probe-scoped and names
exactly A and B; the classifier is mentioned only as context, not in the Files
list — out of scope. Option C is rejected as non-surgical and dangerous
(`issueIsClosed` degraded→false is the safe direction). Option A over B because
acceptance asserts only on `state`, not the reason string, so B's preserved
distinction buys nothing the guard reads while growing the parity surface. Keep
the planner's refinement: fail closed on the RESIDUAL, not a literal `unknown`
check. Critical verification carry-forwards recorded for Phase 4–6 (see Notes).

## Selected Approach
**Option A** — fail-closed three-way (`closed`/`open`/residual→`unavailable`) in
each port's `probeIssueState`, applied symmetrically to GitLab and Gitea, plus a
RED-first test in each port exercising the real `glabExec/teaExec → parseJson →
normalizeIssue → probeIssueState` pipeline via subprocess mock for BOTH empty and
non-JSON exit-0 responses. Endorsed by both planner and advisor; minimal,
root-consistent in outcome, contract-safe, parity-safe, and zero-conflict with
the in-progress #216.

## Out of Scope (explicit)
- No `viewIssueRaw` / new forge export (rejects B).
- No `viewIssue` contract change — no throw/sentinel (rejects C).
- Do NOT touch `issueIsClosed` (port `:42-49`, roadmap `:254-260`) — degraded→
  `false` is the safe direction.
- Do NOT edit root or Codex scripts — already correct, out of scope.
- No new env vars / config flags.
- **Named follow-up (do NOT fix here):** the classifier carries the identical
  latent degraded fail-open — `checkDependsOn` (`:157`), `classifyIssue`
  (`:302`), `cmdClassify` (`:352`) in both port classifiers treat a degraded
  `state:'unknown'` as claimable-open. Must be filed as a new tracked issue and
  noted in the Phase-6 close note / PR body and final report — not fixed in #218,
  not dropped silently.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |

## Notes / Carry-forward to Phase 4–6 (from advisor)
1. Root `simulate-workflow-walkthrough.js` does NOT exercise the ports. Changed
   code is in the GitLab/Gitea trees → must run `test-gitlab-workflow-scripts.js`
   + `test-gitea-workflow-scripts.js` (via the per-edition simulate walkthroughs
   or aggregate `npm test`) and show them green. The root walkthrough alone is
   necessary-but-insufficient for this issue.
2. RED-first: confirm each new test FAILS on the unfixed port. A test passing
   before the fix means the mock isn't driving the real pipeline (OFFLINE captured
   at module load, or a `withForge` stub bypassing parseJson/normalizeIssue) →
   vacuous. Use the subprocess-mock-feeding-real-pipeline exerciser called
   in-process.
3. After editing, run BOTH port contract validators
   (`validate-kaola-workflow-gitlab-contracts.js` rejects `\bgh\b`;
   `validate-kaola-workflow-gitea-contracts.js` rejects `\bglab\b` and `\bgh\b`).
   New reason strings (e.g. `empty glab response` / `unparseable tea response`)
   must pass.
4. Fix both ports symmetrically (same three-way shape + a test in each).
