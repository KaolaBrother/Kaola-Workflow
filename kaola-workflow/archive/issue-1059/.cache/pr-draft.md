# Local PR draft for Nova (not opened)

Branch: `docs/retire-reviewer-heavy-escalation` (no upstream; do not push from this runner)
Base: `main` (`cc1c9a2e`)
HEAD: `e6c1d809e245c50da04e876e3eab14169a19b1ee`
Closes: #1059
Sink: recorded as `pr` in workflow-state; this runner did **not** `git push`, `gh pr create`, or sink-merge.

## Title

docs: retire reviewer→heavy escalation and align 8/10/140 inventory (#1059)

## Body

```markdown
## Summary
- Formally retire the workflow-owned reviewer→Heavy/`fable` re-dispatch in ADR 0019 (intentional since #1032/`7e116d6c`; Yanlei 2026-09-11). Heavy remains the planner-class default. Escalation surfaces are not restored.
- Align live docs to the current manifest: eight runtime families, ten adapter variants, 140 renders. Historical ADR 0020 and CHANGELOG 10.0.0 keep 7/9/126 with an annotation.
- Record follow-up conclusions (not landed): telemetry hollow paths, Grok/Cursor/Devin compact dual-load measurement, optional `elapsed`/`tokens`, extra cost-language sentence.

## Test plan
- [x] `node scripts/generate-agent-profiles.js --check` — 14 roles, eight runtimes, 140 native renders
- [x] `npm test` — exit 0 on `e6c1d809`
- [x] `node scripts/simulate-workflow-walkthrough.js` — 178/178
- [x] Independent review PASS (`findings_blocking`: 0) at `kaola-workflow/issue-1059/.cache/code-review.md`
```

## Commits
- `a5c005f5` docs: retire reviewer→heavy/fable escalation carve-out (ADR 0019)
- `e6c1d809` docs: align live inventory to 8/10/140 and finish ADR 0019 retirement
