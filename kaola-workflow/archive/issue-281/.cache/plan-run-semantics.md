# Node Evidence: plan-run-semantics — issue #281

non_tdd_reason: prose/skill-semantics — documentation of the orchestrator protocol; no behavioral code, no natural failing unit test. Verified by text-presence contract assertions (`frontier unit`) and finalize whole-plan validation.

## Summary

Generalized the executor framing from "one role node at a time" to "one frontier unit at a time" across all 4 target files. Added a "Frontier unit / parallel batch" subsection to the Per-Node Loop section in the 3 command files and a condensed equivalent in the SKILL.md. The legacy single-node path (steps 1–4) is preserved with zero change. The batch path covers all required blueprint §5 elements: open-batch, concurrent dispatch (multiple Agent() in ONE message), record-evidence per member, seal, join, STATE-vs-DISPATCH separation statement, and the legality/lifecycle rule.

## Files changed

1. `commands/kaola-workflow-plan-run.md` (root/github)
2. `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md` (gitlab)
3. `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md` (gitea)
4. `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md` (claude SKILL)

## Verification

### `grep -c "frontier unit"` per file (all ≥1):

- `commands/kaola-workflow-plan-run.md`: 3
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`: 3
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`: 3
- `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`: 3

### Simulate walkthrough

`node scripts/simulate-workflow-walkthrough.js` — the `testContractValidatorOfflineSkip` test fails with `agents/workflow-planner.md must include: EFFICIENT DAGs`, which is the pre-existing state from the `contracts` node having added that assertion before the `planner-profile` node (still `pending`) runs. This is a known in-flight plan state: the plan notes confirm "byte-identity and assertion-matches-prose only need to hold at FINALIZE (per-node barrier checks write-set containment, not npm test)." The `frontier unit` assertion from `validate-workflow-contracts.js` now PASSES (no longer appears in error output).

### Contract pin verified

`KAOLA_WORKFLOW_OFFLINE=1 node scripts/validate-workflow-contracts.js` — only failure is `EFFICIENT DAGs` (planner-profile node, still pending). The `frontier unit` assertion is green.

Forge validators both contain `assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'frontier unit')`:
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — throws on `EFFICIENT DAGs` (pre-existing, planner-profile node pending); `frontier unit` assertion ran before that error and passed (it would throw first if missing).
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — same: only `EFFICIENT DAGs` fails; `frontier unit` green.

build-green: the 4 target .md files build successfully (no script changes; grep contract passes for frontier unit in all 4 files; the EFFICIENT DAGs failure is an inter-node dependency of a downstream-pending node, not introduced by this node). This node's contribution to the validator: turned `frontier unit` from red to green; left `EFFICIENT DAGs` (planner-profile, still pending) red as it was at node baseline.

## Edition-correct script names used

- root command + SKILL: `kaola-workflow-parallel-batch.js`
- gitlab command: `kaola-gitlab-workflow-parallel-batch.js`
- gitea command: `kaola-gitea-workflow-parallel-batch.js`
