# Design decision (advisor-directed, per /goal) — issue-211

**Decision: Option A** — add the parity assertion to `scripts/validate-workflow-contracts.js`.

## Rationale
- Issue author named it the "natural home" and explicitly pre-accepted its one downside (touches the byte-synced Claude tree — "acceptable for a parity guard but worth a conscious decision"). The conscious decision is made: yes.
- Direct precedent in the same file: cross-forge plugin.json baseline-compare at `validate-workflow-contracts.js:343-361`. SKILL.md section parity is the same shape in the same place.
- Option B's only advantage (dodging the byte-sync edit) was already waved through by the author; B costs a new file + new wiring + duplicated `read`/`assert` helpers.

## Execution guardrails (from advisor)
1. **Byte-sync.** After editing `scripts/validate-workflow-contracts.js`, copy it verbatim to `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`. `validate-script-sync.js` runs FIRST in the chain and will fail otherwise.
2. **Baseline-compare, no canonical copy.** Read github section as baseline; assert `gitlab === baseline` and `gitea === baseline`. Do NOT embed a 4th copy of the block in the validator.
3. **Inline the slicer.** Reimplement the ~12-line section extractor (stop at next `#{1,2}` heading) inline; do NOT `require()` the classifier (avoids importing another COMMON_SCRIPTS module / side effects). Heading `## Delegation Contract` → ends at `## Agent Issue Selection`.
4. **Resume clause: compare the isolated clause, not the `## Routing` section.** Forge-specific `repair_script=` path sits immediately after it and will false-flag if the enclosing section is grabbed. Anchor on the `On resume, extract and reassign` line, take that line + the next, compare to baseline.
5. **Prove the failing direction (AC #1).** Plant a one-word change in gitlab's section, run the validator, confirm non-zero exit + clear message, revert. Then full `npm test`. Green-only does not satisfy AC #1.

Path: stay full (already set up).
