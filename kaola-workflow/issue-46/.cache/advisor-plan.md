# Advisor Gate: Phase 3 Plan — issue-46

## Question Asked

The code-architect produced a blueprint (`.cache/architect.md`) for issue-46 (single-issue completion contract). The advisor was asked:
1. Is the build sequence dependency-safe?
2. Are files or integration points missing?
3. Could a developer implement this from the plan alone?
4. Are edge cases or error paths missing?

## Advisor Response

### Build Sequence

The three-group parallel structure is dependency-safe:
- Group 1 (prose edits) is correct — all 4 command/README files are independent.
- Group 2 (SKILL.md edits) is correct — the two SKILL.md files are independent.
- Group 3 (validators) correctly follows Groups 1 and 2 — validators must assert content that already exists.

The `cp` mirror for `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` must run after the scripts edit, not in parallel with it. The architect's blueprint correctly places both in Group 3 as sequential.

### Gap 1 — Foot-Gun Clause NOT Removed (BLOCKER)

The architect's "New" text for Goal-Driven Autonomy still contains the offending clause:

> Treat nonessential workflow bookkeeping as autonomous: issue selection when there is one unambiguous open issue, generated project names...

The Phase 2 decision (Option A) required REMOVING `issue selection when there is one unambiguous open issue, ` from that list, not just adding a warning after it. The blueprint as written leaves a contradicting instruction:
- Body says: "issue selection ... is nonessential bookkeeping" (agents will auto-pick)
- Appended warning says: "do NOT use 'next issue in line' phrasing" (agents should stop)

These cannot coexist. The body must be edited to remove the clause.

**Required fix:** Surgical deletion of `issue selection when there is one unambiguous open issue, ` from the autonomy list (lines 38-39 of workflow-next.md).

### Gap 2 — Startup Step 3 Not Touched (BLOCKER)

The architect's blueprint has 9 files to modify but does NOT include a revision to lines 180-182 of `commands/workflow-next.md` (Startup Step 3):

> If no active project is selected, choose one unambiguous open GitHub issue or provided task automatically.

The advisor-ideation.md Gotcha #1 explicitly named this clause as a required edit. It directly instructs agents to auto-pick, contradicting CLAUDE.md's "Agent Owns Reasoning; Scripts Own Atomicity" principle.

**Required fix:** Replace lines 180-182 with: `If no active project is selected and no target was named in Startup Step 0, ask the user what to implement.`

### Line Budget Recomputation

After Gap 1 and Gap 2 fixes:
- Gap 1 removal frees ~2 lines (removes `issue selection when there is one unambiguous open issue, `)
- Gap 2 revision frees ~2 lines (3-line paragraph → 1-line sentence)
- /goal warning addition adds ~3 lines
- Completion Contract section adds ~7 lines
- Net change: -4 +10 = +6 lines from 283 → ~289, comfortably within the 300-line cap

### Other Files and Integration Points

The remaining 8 files in the blueprint are correct:
- `commands/kaola-workflow-phase6.md`: Completion Contract appended at EOF ✓
- `commands/workflow-init.md`: /goal warning bullet inserted after /goal bullet ✓
- `README.md`: completion contract block in Autonomy And Goal Contract ✓
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`: Completion Contract appended ✓
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`: Completion Contract appended ✓
- `scripts/validate-workflow-contracts.js`: 10 assertIncludes calls ✓
- Mirror copy to plugins scripts ✓
- `scripts/validate-kaola-workflow-contracts.js`: 6 assertIncludes calls ✓

### Edge Cases

No new error paths introduced — prose-only change. The `assertIncludes` validator calls are the correct enforcement mechanism.

### Epic Case 18

Correctly excluded. The script layer (`cmdStartup` lines 1422-1441) already enforces `verdict: no_target` when `--target-issue` is absent. The walkthrough tests script behaviors; prose contracts belong in `validate-workflow-contracts.js`.

## Verdict

**SEND BACK TO ARCHITECT.** Two blockers require revision before phase3-plan.md can be written:

1. Remove `issue selection when there is one unambiguous open issue, ` from Goal-Driven Autonomy body (lines 38-39). Do NOT add a warning instead of removing; do both.
2. Revise Startup Step 3 lines 180-182: replace 3-line auto-pick paragraph with 1-line explicit ask.
3. Provide verbatim old/new for both edits.
4. Recompute line budget with removals applied.
