# Code Architect Revision 1: issue-46

## Gaps Addressed

### Gap 1 — Remove foot-gun clause from Goal-Driven Autonomy

The original blueprint kept the "issue selection when there is one unambiguous
open issue," clause intact and only added a warning below it. The Phase 2
decision (Option A) requires surgical deletion of this clause.

**Verbatim old (lines 38-43 of commands/workflow-next.md):**
```
Treat nonessential workflow bookkeeping as autonomous: issue selection when
there is one unambiguous open issue, generated project names, collision suffixes
like `-2`, cache paths, and harmless ordering choices. Consult the configured
advisor internally for essential technical decisions, apply the chosen answer,
and record it under `.cache/` or the phase artifact. Ask only for true external
authorization or materially user-owned choices.
```

**Verbatim new (same paragraph, foot-gun clause deleted + /goal warning appended):**
```
Treat nonessential workflow bookkeeping as autonomous: generated project names,
collision suffixes like `-2`, cache paths, and harmless ordering choices.
Consult the configured advisor internally for essential technical decisions,
apply the chosen answer, and record it under `.cache/` or the phase artifact.
Ask only for true external authorization or materially user-owned choices.

The `/goal` template must NOT use "next issue in line" or similar phrasing that
implies cross-issue continuation. Each run targets exactly one issue.
```

Net line delta for this section: -1 line (remove "issue selection when\nthere is one unambiguous open issue, " shrinks one wrapped line) + 3 lines (warning) = +2 lines.

### Gap 2 — Revise Startup Step 3 to remove auto-pick

Lines 180-182 of commands/workflow-next.md instruct agents to "choose one
unambiguous open GitHub issue or provided task automatically" — this directly
contradicts CLAUDE.md's "Agent Owns Reasoning" principle and the existing
Startup Step 0 which already handles explicit issue selection.

**Verbatim old (lines 180-183 of commands/workflow-next.md):**
```
If no active project is selected, choose one unambiguous open GitHub issue or
provided task automatically. If there are multiple plausible issues/tasks or no
task is available, ask the user what to implement. New work starts with:
```

**Verbatim new:**
```
If no active project is selected and no target was named in Startup Step 0,
ask the user what to implement. New work starts with:
```

Net line delta for this section: -2 lines (3-line paragraph → 2-line sentence).

## Updated Line Budget

Starting lines: 283
Gap 1 Goal-Driven Autonomy removal: -1 line for foot-gun, +2 lines for /goal warning = net +1
Gap 2 Startup Step 3: -2 lines
Completion Contract section (appended at EOF): +7 lines (blank + heading + 6 body lines)
Net change from 283: +6 lines → **289 total** — within the 300-line cap.

## Revised Files-to-Modify Table

| File | Changes | Parallel Group |
|------|---------|---------------|
| `commands/workflow-next.md` | (1) Delete foot-gun clause from Goal-Driven Autonomy body; (2) Revise Startup Step 3 lines 180-182; (3) Append /goal warning to Goal-Driven Autonomy; (4) Append `## Completion Contract` at EOF | 1 |
| `commands/kaola-workflow-phase6.md` | Append `## Completion Contract` after EOF (line 664) | 1 |
| `commands/workflow-init.md` | Add "next issue in line" warning bullet after the /goal bullet | 1 |
| `README.md` | Add 4-sentence completion contract block to Autonomy And Goal Contract | 1 |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Append `## Completion Contract` after `## Required Output` | 2 |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Append `## Completion Contract` at EOF | 2 |
| `scripts/validate-workflow-contracts.js` | Add 10 `assertIncludes` calls before `console.log` | 3 |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | Mirror: `cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | 3 |
| `scripts/validate-kaola-workflow-contracts.js` | Add 6 `assertIncludes` calls for Codex skill surfaces | 3 |

No new files to create. Out-of-scope items unchanged from original blueprint.

## All Other Blueprint Content

All verbatim edit specifications from `.cache/architect.md` remain valid except for
Goal-Driven Autonomy (revised above) and Startup Step 3 (revised above):

- kaola-workflow-phase6.md Completion Contract text: unchanged
- workflow-init.md bullet text: unchanged
- README.md completion contract block: unchanged
- SKILL.md texts: unchanged
- Validator assertions (10 + mirror + 6): unchanged
- Validation commands: unchanged
- Epic Case 18: NOT added (prose-only; validators are correct home)
