# Node: install-wiring — Evidence Record

## task
Register the new SubagentStart dispatch-log hook (`kaola-workflow-subagent-dispatch-log.sh`) into `install.sh` (all 3 `SUPPORT_HOOK_NAMES` blocks) and add a byte-identical-group entry to `scripts/validate-script-sync.js`, making future hook drift script-enforced.

## non_tdd_reason
category: glue / wiring — adding a hook filename to shell arrays and a registry entry to a sync validator; no behavioral logic is introduced. Verified by `bash -n install.sh` (syntax) and `node scripts/validate-script-sync.js` (group count 5→6, exit 0). No unit test applies.

## write_set
- install.sh
- scripts/validate-script-sync.js

## verification_commands

### Before (baseline)
```
bash -n install.sh          → exit 0
node scripts/validate-script-sync.js
  → OK: 15 common scripts and 5 byte-identical file group in sync.
  → exit 0
```

### After
```
bash -n install.sh          → exit 0
node scripts/validate-script-sync.js
  → OK: 15 common scripts and 6 byte-identical file group in sync.
  → exit 0
```

## before_result
- `bash -n install.sh`: exit 0
- `node scripts/validate-script-sync.js`: 5 byte-identical file groups, exit 0

## after_result
- `bash -n install.sh`: exit 0
- `node scripts/validate-script-sync.js`: 6 byte-identical file groups, exit 0

## diff_scope
Only `install.sh` (+3 lines, one per SUPPORT_HOOK_NAMES block) and `scripts/validate-script-sync.js` (+8 lines, new group entry). No other files touched by this node.

## build-green
- `bash -n install.sh`: exit 0
- `node scripts/validate-script-sync.js`: "OK: 15 common scripts and 6 byte-identical file group in sync." exit 0
- diff scope: ONLY install.sh + scripts/validate-script-sync.js modified by this node
