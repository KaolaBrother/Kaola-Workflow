non_tdd_reason: cross-edition ports + install/sync wiring, verified by validate-script-sync + bash -n

## Build Green

- validate-script-sync: OK: 15 common scripts and 5 byte-identical file group in sync. [build-green]
- bash -n install.sh: install.sh syntax OK [build-green]
- node --check plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js: gitlab syntax OK [build-green]
- node --check plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js: gitea syntax OK [build-green]
- diff canonical vs codex copy: BYTE-IDENTICAL [build-green]

## Files Written (write-set)

1. plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js — codex copy, byte-identical to canonical
2. plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js — gitlab forge port (forge-rename only)
3. plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js — gitea forge port (forge-rename only)
4. install.sh — 3 SUPPORT_SCRIPT_NAMES arrays each gained one entry next to adaptive-handoff
5. scripts/validate-script-sync.js — COMMON_SCRIPTS gained kaola-workflow-adaptive-node.js with #272 comment

## Forge-rename Transform Applied

Gitlab port: COMMIT_NODE/NEXT_ACTION/VALIDATOR constants prefixed with `kaola-gitlab-`; require('./kaola-workflow-plan-validator') → require('./kaola-gitlab-workflow-plan-validator').
Gitea port: same transform with `kaola-gitea-` prefix.
All referenced sibling scripts verified to exist in each plugin's scripts/ dir.

## Boundary Confirmation

- canonical scripts/kaola-workflow-adaptive-node.js: NOT modified (read-only in this node)
- frozen-core scripts: NOT touched
- no out-of-lane files written
