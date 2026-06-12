evidence-binding: n8b-prose-adapt-430 59b1ed5b8799
non_tdd_reason: prose-only routing doc update (6-surface #400-family); verified by regression-green four-chain suite + route-reachability
regression-green

## Summary

Added `target_set_mismatch` to the bundle claim refusal table in all four #400-family routing surfaces.

### Files updated

**commands/kaola-workflow-adapt.md** — added row after `target_set_label_rollback_failed`:
`| target_set_mismatch | persisted issue_numbers in workflow-state.md does not match the claimed --target-issues set — startup validated the claim but the persisted state is inconsistent |`

**plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md** — same row added in identical position.

**plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md** — same row added in identical position.

**plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md** — same row added in identical position.

The existing guidance paragraph "On any bundle claim refusal, treat it the same as a single-issue claim refusal: surface the typed code and STOP; do not retry with a different issue set." already covers `target_set_mismatch` by construction (it applies to any refusal in the table), so no additional guidance prose was needed.

### Validation results

route-reachability: passed (32 assertions)
four-chain: claude PASS, codex PASS, gitlab PASS, gitea PASS (exit 0)
