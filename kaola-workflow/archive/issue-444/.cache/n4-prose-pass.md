evidence-binding: n4-prose-pass 68f4e1f5947e

## Summary

Added the `dispatch` descriptor documentation block to all 6 plan-run prose surfaces.

## Changes per file

### 1. `commands/kaola-workflow-plan-run.md`
Added the `**Script-emitted \`dispatch\` descriptor (#444):**` paragraph inside step 2, after the "Open-time evidence seeding (#433)" block and before the "Special case — `role: finalize` sink" block. The new paragraph directs the orchestrator to pass the `dispatch` sub-object verbatim instead of assembling fields per-hand, and documents the 10 fields: `node_id`, `role`, `model`, `working_dir`, `declared_write_set`, `evidence_file`, `nonce`, `required_tokens`, `forge_rider`, `guards`.

### 2. `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`
Same insertion at the identical logical position (after open-time seeding, before finalize special case). Uses "role agent" (Codex delegation terminology) instead of "role subagent" (Claude Agent() terminology) to match the SKILL's dispatch idiom.

### 3. `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`
The gitlab command does not contain the open-time seeding block (it was not propagated to forge editions in #433). Inserted the dispatch descriptor paragraph between the nonce paragraph and the `finalize` special case — the equivalent logical position in the gitlab edition's step 2.

### 4. `plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md`
Same insertion after the open-time seeding block (which is present in the gitlab SKILL), before the finalize special case.

### 5. `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`
Same as gitlab command: inserted between the nonce paragraph and the finalize special case (no seeding block in gitea command either).

### 6. `plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md`
Same insertion after the open-time seeding block, before the finalize special case.

## Forge-neutral rule compliance

The inserted paragraph in all 6 surfaces uses only generic terms: "the role subagent" (commands) or "the role agent" (SKILLs). No forge-specific CLI binary names or brand names appear.

## Pinned literals preserved

The exact literal `frontier unit` appears in all 6 files and was not modified. Verified by route-reachability test.

## Route-reachability test result

```
Route-reachability test passed (32 assertions).
```

All 32 assertions green. No pinned literals were removed or altered.
