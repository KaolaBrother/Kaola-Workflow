# advisor — issue-218 ideation gate

**Scope decision (deferred to advisor per /goal): probe-only, Option A. Proceed — nothing blocks.**

## Why probe-only (not forge-wide / Option C)
- #218 title + "Suggested fix" are both about `probeIssueState`; the suggested fix names exactly A and B ("a `forge.viewIssueRaw` helper, OR map `normalizeIssue` state `unknown`→`unavailable`"). The classifier appears only in "Why it matters" as context — NOT in Files, NOT in suggested fix. Out of scope.
- Option C (changing `viewIssue`) violates "surgical changes" and is dangerous: `issueIsClosed` degraded→`false` is the SAFE direction (keeps a folder active). Making `viewIssue` throw/sentinel would flip that and risk dropping live work. Don't.

## Option A over B
- Issue sanctions both; acceptance asserts only on `state`, not the reason string → B's preserved empty-vs-nonJSON distinction buys nothing the guard reads, while adding a forge export to the parity surface.
- Keep the planner's refinement: fail closed on the RESIDUAL (anything not `open`/`closed`), not a literal `unknown` check — strictly safer given the open/closed-only invariant.

## Classifier gap
Out of scope for #218 but a real latent fail-open. Document as a NAMED follow-up in phase2-ideation.md, carry into Phase-6 close note / PR body, surface to user in final report. Do NOT fix here; do NOT drop silently.

## Carry into Phase 4–6 (where it can quietly go green-but-wrong)
1. **Root `simulate-workflow-walkthrough.js` does NOT exercise the ports.** Changed code lives in GitLab/Gitea trees, tested via `simulate-gitlab/gitea-workflow-walkthrough.js` → `test-gitlab/gitea-workflow-scripts.js`. CLAUDE.md's default command is necessary-but-insufficient for THIS issue — running only it would leave the fix unverified yet report success. Run the port runners (or aggregate `npm test`) and show them green.
2. **RED-first, and use it to validate the harness.** Confirm each new test FAILS on the current unfixed port. If a test passes BEFORE the fix, the mock isn't driving the real pipeline (OFFLINE captured at module load, or a `withForge` stub bypassing parseJson/normalizeIssue) → vacuous test. The "subprocess mock feeding the real pipeline, called in-process" exerciser is right; the RED check proves it's wired.
3. **Run BOTH port contract validators after editing** — gitlab (rejects `\bgh\b`) + gitea (rejects `\bglab\b` and `\bgh\b`). New reason strings (e.g. `empty glab response` / `unparseable tea response`) must pass.
4. **Fix both ports symmetrically** — same three-way shape + a test in each.

## #216 no-conflict (user constraint)
Option A touches ONLY the two port `*-active-folders.js` files + their test files. Does NOT edit `claim.js` (guard already correct), nowhere near `sink-merge`/`postMergeCleanup`. Zero overlap with #216.

Record Option A in phase2-ideation.md and route to Phase 3.
