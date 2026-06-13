evidence-binding: n9-prose-halt cb0a79c61ff2

non_tdd_reason: documentation-only node — no executable logic was added; the changes are purely prose additions to command and SKILL documentation files with no testable functions.

build-green: no code compiled; forbidden-only validator checks passed for both forge SKILL.md files (exit 0 on both).

## Changes made

### commands/kaola-workflow-plan-run.md

Added "Halt-triage operator touchpoints (#440)" block inside step 4 "judge the barrier", immediately after the five typed per-reason actionable messages and before the `test_thrash` escalation bullet. The block documents:
- The `triage` object shape returned by `write-halt` when a `barrierOut` is provided
- Three subtype classes (`lockfile_write`, `mirror_write`, `count_bump`) with operator action for each
- `proposed_repair` structured object (computed, never auto-applied)
- `testDelta` field semantics (informational context, not a repair directive)

### plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
### plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
### plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md

Each SKILL.md received an identical "Halt-triage operator touchpoints (#440)" block placed immediately after the per-reason summary sentence ("In every case...one-line re-author + re-freeze..."). The wording is forge-neutral — no forge CLI names (`gh`, `glab`, `tea`) appear. The three SKILL.md triage blocks are byte-identical to each other.

## Validation

Forbidden-only checks:
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md` → PASSED
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md` → PASSED

Diff comparison of triage blocks across all three SKILL.md files confirmed identical content.
