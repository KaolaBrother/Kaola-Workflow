# Advisor — Phase 2 Ideation Gate (issue-211)

Consulted the configured Opus advisor on the A-vs-B home decision and execution risks. Verbatim substance:

**Recommendation: Option A — put the check in `scripts/validate-workflow-contracts.js`.** Not the close call Phase 1 framed it as.

- Issue author named it the "natural home" and explicitly pre-accepted its one downside ("touches the Claude tree — acceptable for a parity guard but worth a conscious decision"). That conscious decision is the one in front of us; the answer is yes.
- Direct precedent in that exact file: the cross-forge plugin.json baseline-compare at L343–361. SKILL.md section parity is the same shape in the same place.
- Option B's sole advantage is dodging the byte-sync edit — already waved through by the author — at the cost of a new file, new test wiring, and duplicated `read`/`assert` helpers.

**Missed approaches?** None material. A is correct; the issue settled the design — don't belabor Phase 2.

**Risks accurate?** The real risk is execution, not A-vs-B. Guardrails:
1. **Byte-sync or it fails before your check runs.** `validate-workflow-contracts.js` is in COMMON_SCRIPTS; `validate-script-sync.js` runs FIRST in both `:claude` and `:codex` chains. After editing `scripts/validate-workflow-contracts.js`, copy verbatim to `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`.
2. **Mirror the baseline-compare; don't embed a canonical copy.** Read github section as baseline; assert `gitlab === baseline` and `gitea === baseline`. No 4th copy of the block.
3. **Inline the slicer; don't `require()` the classifier.** Reimplement the ~12-line section extractor (stop at next `#{1,2}` heading) inline. Heading `## Delegation Contract` → ends at `## Agent Issue Selection`.
4. **Resume clause: compare the isolated clause, not the `## Routing` section.** Forge-specific `repair_script=` path sits immediately after and will false-flag if the enclosing section is grabbed. Anchor on `On resume, extract and reassign`, take that line + the next, compare to baseline.
5. **Prove the failing direction (AC #1).** Plant a one-word change in gitlab's section, run validator, confirm non-zero exit + clear message, revert. Then full `npm test`. Green-only does not satisfy AC #1.

**Recommendation sound?** Yes. Proceed with A. Stay on full (already set up).
