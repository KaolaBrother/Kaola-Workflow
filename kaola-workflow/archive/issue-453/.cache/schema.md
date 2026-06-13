evidence-binding: schema 204a592e149b

non_tdd_reason: byte-identical constant removal across the 4-tree adaptive-schema sync group; no isolated failing unit test (the behavioral assertion lives in the downstream validator node's walkthrough fixture flip).

verification_tier: build-green

Change: removed `const FILE_CEILING = 6;`, the `FILE_CEILING,` module export, and the FILE_CEILING clause from the caps comment, identically across all 4 byte-identical copies (scripts/ + plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/scripts/kaola-workflow-adaptive-schema.js). New shared md5: ab301799b2cfcdf81e5497630772063c (was a4ce254f).

Verification (all run on the edited content; now resident in the worktree tree):
1. md5 of all 4 copies → ab301799b2cfcdf81e5497630772063c (identical to each other). exit 0
2. node scripts/validate-script-sync.js → "OK: 23 common scripts, 30 byte-identical groups, 6 rename-normalized families, and 1 config/hooks.json family in sync." exit 0
3. node -e "const s=require('./scripts/kaola-workflow-adaptive-schema.js'); if('FILE_CEILING' in s) process.exit(1); console.log('export removed ok')" → "export removed ok" exit 0
4. node -e "require('./scripts/kaola-workflow-plan-validator.js'); console.log('validator loads')" → "validator loads" exit 0 (validator still references schema.FILE_CEILING at ~1074 = now undefined; harmless no-op, removed by the downstream validator node)
5. grep -rn FILE_CEILING across the 4 schema copies → no matches, exit 1 (fully absent)

NOTE: scripts/simulate-workflow-walkthrough.js is intentionally NOT run here — its FILE_CEILING-refusal fixture is now RED, which is the next node (validator/tdd-guide)'s RED→GREEN to fix.

write_set: scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
