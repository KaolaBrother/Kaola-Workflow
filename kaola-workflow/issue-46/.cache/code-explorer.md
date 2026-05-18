# Code Explorer: issue-46

## Key Findings

### workflow-next.md (283 lines; 300-line cap enforced at validate-workflow-contracts.js:176)
- Only 17 lines of budget remain before the cap assertion fails
- `## Goal-Driven Autonomy` section: lines 34-43 — insertion point for single-issue stop contract
- Reconstruction route at line 230: `phase6-summary.md exists -> workflow complete; show summary and stop`
- No current guidance about single-issue vs multi-issue continuation

### kaola-workflow-phase6.md (664 lines)
- `## Step 9 - Sink` starts at line 606 — last section
- File ends at line 664 with no content after the sink-pr.js exit-code table
- `## Completion Contract` section would be appended after line 664

### Plugin mirror map
- `commands/workflow-next.md` → `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` (conceptually parallel, not byte-identical)
- `commands/kaola-workflow-phase6.md` → `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` (conceptually parallel)
- `scripts/` JS files → `plugins/kaola-workflow/scripts/` JS files (byte-identical, enforced)

### Current /goal and stop-hook guidance
- README.md `## Autonomy And Goal Contract` (lines 5-21): no warning about "next issue in line" wording
- workflow-init.md line 127: `/goal` mention but no single-issue warning
- Neither file warns against multi-issue auto-continuation phrasing

### KAOLA_AUTOCONTINUE env var
- Does not exist anywhere — green-field identifier if needed

### Test patterns
- Epic Cases in simulate-workflow-walkthrough.js — highest numbered is 17; new test = Epic Case 18 (first use)
- validate-workflow-contracts.js uses `assertIncludes(file, needle)` pattern
- validate-kaola-workflow-contracts.js has parallel assertions for SKILL.md files (lines 145-150, 255)
- Plugin validate-workflow-contracts.js (plugins/kaola-workflow/scripts/) is a byte-identical mirror

## Files to Change
| File | Change |
|------|--------|
| commands/workflow-next.md | Add 2-3 sentence single-issue stop contract to Goal-Driven Autonomy (≤17 lines budget) |
| commands/kaola-workflow-phase6.md | Add ## Completion Contract section after line 664 |
| plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md | Codex-parallel single-issue stop contract |
| plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md | Codex-parallel completion contract |
| README.md | Add /goal template guidance and "next issue in line" warning |
| commands/workflow-init.md | Add single-issue /goal template alongside existing /goal guidance |
| scripts/validate-workflow-contracts.js | assertIncludes for anchor phrases |
| scripts/validate-kaola-workflow-contracts.js | Parallel assertions for SKILL.md files |
| scripts/simulate-workflow-walkthrough.js | Epic Case 18 testing completion contract |
| plugins/kaola-workflow/scripts/validate-workflow-contracts.js | Byte-identical mirror of scripts/ version |
