# Phase 1 - Research / Discovery: issue-46

## Deliverable

Add single-issue completion contract to workflow-next.md and kaola-workflow-phase6.md: after Phase 6 closes issue #N, the router stops and awaits explicit re-direction rather than auto-routing into issue #N+1. Add /goal template guidance warning against "next issue in line" phrasing.

## Why

After Phase 6 completes in a normal single-issue run, the agent driven by a `/goal` Stop-hook with ambiguous wording like "finish the next issue in line" may claim and start a second issue. Issue #44 fixed the script layer (scripts no longer auto-pick). This issue fixes the agent/completion-contract layer: single-issue stop is the default; cross-issue continuation requires explicit user re-direction.

## Affected Area

- `commands/workflow-next.md` (router — Goal-Driven Autonomy section, line 34-43)
- `commands/kaola-workflow-phase6.md` (finalize — append after Step 9, line 664)
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` (Codex parallel)
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` (Codex parallel)
- `README.md` (Autonomy And Goal Contract section)
- `commands/workflow-init.md` (/goal guidance line)
- Validators and simulation test

## Key Patterns Found

1. `## Goal-Driven Autonomy` in workflow-next.md (lines 34-43) — natural insertion point for single-issue stop contract; 17-line cap budget constraint (`validate-workflow-contracts.js:176`)
2. Phase 6 ends at line 664 with no trailing content — `## Completion Contract` appended at EOF
3. `assertIncludes(file, needle)` in validate-workflow-contracts.js — pattern for new assertions
4. Epic Case pattern in simulate-workflow-walkthrough.js — next new case is 18 (highest existing is 17)

## Test Patterns

- Framework: hand-rolled assert, no test framework
- Location: `scripts/simulate-workflow-walkthrough.js`
- Structure: `// Epic Case N` comment block with subprocess or direct-require tests
- Contract validation: `scripts/validate-workflow-contracts.js` and `scripts/validate-kaola-workflow-contracts.js`

## Config & Env

- `KAOLA_AUTOCONTINUE` — does not exist; green-field if needed for the optional flag
- No existing env var for controlling continuation

## External Docs

N/A — internal patterns sufficient

## GitHub Issue

KaolaBrother/Kaola-Workflow#46

## Completeness Score

9/10 — goal, outcome, scope all clear; KAOLA_AUTOCONTINUE is optional (not required for core acceptance criteria)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | internal patterns sufficient | no external library/API involved |

## Notes / Future Considerations

- The 17-line budget constraint in workflow-next.md is strict. The single-issue stop contract must be ≤3 sentences (4-5 lines with surrounding whitespace).
- KAOLA_AUTOCONTINUE is optional per issue #46 scope; core acceptance criteria can be met with prose changes alone.
- Epic Case 18 is the first use of that number; no conflicts.
