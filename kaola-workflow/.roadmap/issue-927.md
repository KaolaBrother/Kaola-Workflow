issue: #927
title: opencode subagent effort tiers are inert — carry the tier in agent.options so both tiers still inherit the main session's model
status: open
workflow_project: issue-927
next_step: Replace the emitted `agent.<role>.variant` with the tier's `options` payload in sync-opencode-edition.js:672 (payloads already exist in CONTRACT_EFFORT_TABLE), drop the now-dead provider.*.variants block, and correct the false mechanism claim at :651. Then add the Layer 2 `chat.params` hook to plugins/kaola-workflow-hooks.js reading a generated effort-tiers.json sidecar, so the effort knob resolves against the model actually in use per call and the "switched your opencode model?" regeneration warning retires. Oracle is tokens_reasoning in opencode.db measured on a SUBAGENT pair sharing one inherited model — config-resolution assertions stayed green throughout the whole failure. Mutation-prove the guard. opencode-edition-only diff; no four-chain run owed.
