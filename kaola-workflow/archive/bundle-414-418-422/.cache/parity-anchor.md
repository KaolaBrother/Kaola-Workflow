ff929642636e
evidence-binding: parity-anchor ff929642636e

## Node: parity-anchor

### Work completed

**Part 1: `scripts/test-agent-profile-parity.js` (NEW FILE — #422.2)**

Created regression guard that checks each `agents/*.md` with a full `.toml` triple (codex/gitlab/gitea) against FEATURE_TOKENS. Token skipped unless it appears in the `.md` — unused tokens never cause false RED.

FEATURE_TOKENS at HEAD:
- `write_set_granularity` — in `agents/workflow-planner.md` + all three `.toml` twins (confirmed)
- `main-session-gate` — in `agents/workflow-planner.md` + all three `.toml` twins (confirmed)

Candidates checked and EXCLUDED (absent from toml twins):
- `planner_control_boundary_violation` — present in `.md` (4 occurrences) but ABSENT from all three `.toml` twins → excluded (would RED at HEAD)
- `governance_ack_stale`, `sync-order`, `ledger-compare`, `running-set`, `freeze-checked` — absent from both `.md` and `.toml` twins → excluded (no impact either way, but not verified-green)

**Part 2: `scripts/validate-script-sync.js` edits (#422.1 + #418.1)**

Added to `BYTE_IDENTICAL_GROUPS`:
- Programmatic toml triple entries via `fs.readdirSync` on `plugins/kaola-workflow/agents` — 20 `.toml` files now covered, BYTE_IDENTICAL_GROUPS length = 30

Added before `renameNormalize`:
- `CONFIG_HOOKS_FAMILY` const — 3-tree config/hooks.json family, reference = codex tree
- `normalizeConfigHooks(referenceText, forge)` — replaces only the compact-resume token

Added in `require.main` body after RENAME_NORMALIZED_FAMILIES loop:
- CONFIG_HOOKS_FAMILY check block

Updated:
- Success log message to include `and 1 config/hooks.json family in sync.`
- `module.exports` to export `CONFIG_HOOKS_FAMILY, normalizeConfigHooks`

### RED/GREEN evidence

RED: test_agent_profile_parity_governance_probe — when `governance_ack_stale_PROBE` was temporarily appended to `agents/workflow-planner.md` AND added to `FEATURE_TOKENS`, the test emitted:
```
FAIL: #422.2: token "governance_ack_stale_PROBE" is in agents/workflow-planner.md but MISSING from plugins/kaola-workflow/agents/workflow-planner.toml (md↔toml feature drift — mirror the feature paragraph token into the .toml twin)
FAIL: #422.2: token "governance_ack_stale_PROBE" is in agents/workflow-planner.md but MISSING from plugins/kaola-workflow-gitlab/agents/workflow-planner.toml (md↔toml feature drift — mirror the feature paragraph token into the .toml twin)
FAIL: #422.2: token "governance_ack_stale_PROBE" is in agents/workflow-planner.md but MISSING from plugins/kaola-workflow-gitea/agents/workflow-planner.toml (md↔toml feature drift — mirror the feature paragraph token into the .toml twin)
agent-profile parity tests FAILED (3 failures, 6 passed)
exit: 1
```
Mutations reverted; test returned to GREEN.

GREEN: test-agent-profile-parity passes; 6/6 assertions green (write_set_granularity×3 + main-session-gate×3). validate-script-sync.js: OK: 19 common scripts, 30 byte-identical groups, 2 rename-normalized families, and 1 config/hooks.json family in sync.

GREEN: both scripts pass
