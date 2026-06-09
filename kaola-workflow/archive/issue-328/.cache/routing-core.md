# routing-core evidence — issue #328 bundle-lane routing

## task
Document the multi-issue bundle lane routing in the root/Claude command and skill files
(commands/workflow-next.md, commands/kaola-workflow-adapt.md,
plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md,
plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md).
Additive only — single-issue behavior unchanged (AC#1).

## non_tdd_reason
command/skill prose routing — documentation of the bundle entry points, no behavioral logic.
Category: config / IaC / scaffolding (command and skill markdown files carry routing prose,
not executable logic; the proof is build/regression-green, not a RED→GREEN test).

## write_set
- commands/workflow-next.md
- commands/kaola-workflow-adapt.md
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md

## content added

### workflow-next pair (selection phase)
- Step 0 `/goal` note: updated to "exactly one issue or one explicitly selected same-scope bundle"
  (preserved the real invariant: no auto-continuation to an unselected next issue).
- New "Startup Step 0 — Bundle Lane (Multi-Issue)" section with three subsections:
  1. Explicit-bundle entry: KAOLA_TARGET_ISSUES=42,47,53 / --target-issues; project/branch shape
     (bundle-42-47-53 / workflow/bundle-42-47-53); adaptive-path-only; compatibility rule
     (KAOLA_TARGET_ISSUE unchanged; both set → target_ambiguity).
  2. Auto-bundle entry (AC#5/AC#6): issue-scout read-only agent (dispatched as prose,
     no {ISSUE_SCOUT_MODEL} placeholder per design Decision 1); orchestrator STATES set before
     claim; scripts validate never select (#44); fallback to single-issue when no high-confidence
     bundle (AC#6); conditions for auto-bundle fire.
  3. Bundle closure: one finalization closes all issues; one merge/PR sink; roadmap regenerated once.
- Completion Contract: updated to "exactly one issue or one explicitly selected same-scope bundle";
  bundle closure is all-or-nothing; anti-auto-continuation invariant preserved.

### adapt pair (claim phase)
- New "Bundle Lane — Multi-Issue Adaptive Claim" section with subsections:
  1. Bundle startup call: --target-issues A,B,C; compatibility rule.
  2. Bundle project and branch shape: bundle-42-47-53, workflow/bundle-42-47-53,
     three additive workflow-state.md fields (issue_numbers, bundle_id, closure_policy).
  3. Bundle is adaptive-only.
  4. Bundle authoring: one implementation-lane DAG, not one-node-per-issue; union labels.
  5. Bundle finalization: all-or-nothing; one merge/sink; one closure receipt.
  6. Claim refusals table: all 9 bundle-specific typed refusal codes.
- The adapt pair references the workflow-next bundle-lane selection section rather than
  re-hosting issue-scout logic (correct distribution per advisor guidance).

## verification_commands

### before (baseline)
1. node scripts/simulate-workflow-walkthrough.js → EXIT 0 (Workflow walkthrough simulation passed)
2. node scripts/validate-script-sync.js → EXIT 0 (OK: 18 common scripts and 7 byte-identical file group in sync)
3. node scripts/validate-kaola-workflow-contracts.js → EXIT 0 (Kaola-Workflow Codex contract validation passed)
4. node scripts/validate-workflow-contracts.js → EXIT 0 (Workflow contract validation passed)

### after (regression-green)
1. node scripts/simulate-workflow-walkthrough.js → EXIT 0 (Workflow walkthrough simulation passed)
2. node scripts/validate-script-sync.js → EXIT 0 (OK: 18 common scripts and 7 byte-identical file group in sync)
3. node scripts/validate-kaola-workflow-contracts.js → EXIT 0 (Kaola-Workflow Codex contract validation passed)
4. node scripts/validate-workflow-contracts.js → EXIT 0 (Workflow contract validation passed)

## regression-green
All four checks passed before and after the edits. No behavioral scripts were modified;
these are documentation-only changes to command and skill markdown files.

## grep confirmations
- `target-issues`: present in all 4 files (3+ occurrences each)
- `bundle`: present in all 4 files (11-21 occurrences each)
- `issue-scout`: present in workflow-next pair only (correct — selection-time agent;
  adapt pair references the workflow-next bundle section instead of re-hosting selection logic)

## routing seam closure (advisor follow-up)
The Step 0a-2 / Adaptive front-end entry handoff point in both next-pair files was updated
to add a "Bundle:" pointer: when KAOLA_TARGET_ISSUES is set, route to /kaola-workflow-adapt
with the full issue set using --target-issues. This wires the bundle signal into the actual
handoff junction rather than leaving it in a floating standalone section.

## heading collision fix (advisor follow-up)
Renamed "## Startup Step 0 — Bundle Lane" to "## Startup Step 0c — Bundle Lane" in
workflow-next.md to avoid ambiguity with "## Startup Step 0 - Agent Issue Selection".
The SKILL.md used "## Agent Issue Selection — Bundle Lane" which was already distinct.

## before_result
simulate-workflow-walkthrough.js: EXIT 0
validate-script-sync.js: EXIT 0
validate-kaola-workflow-contracts.js: EXIT 0
validate-workflow-contracts.js: EXIT 0

## after_result
simulate-workflow-walkthrough.js: EXIT 0
validate-script-sync.js: EXIT 0
validate-kaola-workflow-contracts.js: EXIT 0
validate-workflow-contracts.js: EXIT 0
