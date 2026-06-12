d01ed2e04813
evidence-binding: n_claude_docs d01ed2e04813

## Changes per file

### CLAUDE.md

- **Key Scripts / plan-validator bullet**: Added `--freeze-checked`/`--governance-ack` flags and the emit envelope (typed `reason` field in `barrierCheck` output) to the description.
- **Key Scripts / new parallel-batch bullet**: Added `scripts/kaola-workflow-parallel-batch.js` after `kaola-workflow-next-action.js` with full subcommand list and `degraded: true` note.
- **Key Scripts / adaptive-handoff bullet**: Rewrote to reflect the post-#408 fused 3→2-spawn chain (SPAWN 1 `--freeze-checked`, SPAWN 2 `--freeze --governance-ack`, `governance_ack_stale` tamper guard, folded `--resume-check`).
- **Key Scripts / adaptive-node bullet**: Extended subcommand list to include `open-ready`, `close-node`, `reconcile-running-set`; added the `--freeze-checked`/`--governance-ack` cross-reference to adaptive-handoff; noted the `#383 mutual-exclusion guard prologue`.

### docs/api.md

- **Per-node model tier paragraph**: Changed "is a tracked follow-up" clause for `<role>-max` xhigh to "shipped in #405" (on Codex the `opus` tier selects the `<role>-max` xhigh effort-variant profile).
- **Write-set shape refusals subsection**: Appended round-2 shapes (#388), atomic freeze (#389), and point-of-use `model_invalid` gate (#390) notes at the end of the existing #381 block.

### docs/architecture.md

- **Model Resolution section**: Added a "Runtime per-node override" paragraph cross-referencing the #382 per-node model tier and explaining that the plan-time `model` column beats install-time profile selection, with mention of how it threads through `next-action`, `open-next`/`open-ready`, and the running-set manifest.

### docs/workflow-state-contract.md

- **.cache/ inventory**: Expanded the single-entry `dispatch-log.jsonl` description into a bulleted inventory. Added four new entries: `running-set.json` (running-set manifest, prevents double-open), `active-batch.json` (parallel-batch manifest, crash-safe two-phase), `barrier-base-<id>` (per-node baseline SHA, dropped on rollback), and `barrier-open-<id>` (freshness token for `stale:head_advanced` detection).

docs: complete
