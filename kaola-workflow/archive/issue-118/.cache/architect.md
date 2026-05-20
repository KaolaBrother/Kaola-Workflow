# Architect Output — issue-118

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `uninstall.sh` | 4 spots: usage string, two-arg error, case validation, gitea remove_dir block | P0 |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | 4 new assertions after line 148 | P0 |
| `README.md` | Add `./uninstall.sh --forge=gitea` after line 187 (between gitlab and all) | P1 |
| `CHANGELOG.md` | Add entry under `[Unreleased] > Added` | P1 |

## Files to Create: None

## Exact Change Specifications

### uninstall.sh

Spot 1 — line 11, usage() string:
- current: `echo "Usage: ./uninstall.sh [--forge=github|gitlab|all]"`
- after:   `echo "Usage: ./uninstall.sh [--forge=github|gitlab|gitea|all]"`

Spot 2 — line 22, two-arg error:
- current: `echo "--forge requires github, gitlab, or all" >&2`
- after:   `echo "--forge requires github, gitlab, gitea, or all" >&2`

Spot 3 — line 42, case validation:
- current: `github|gitlab|all) ;;`
- after:   `github|gitlab|gitea|all) ;;`

Spot 4 — after line 112 (after gitlab if-block, before Python hook-stripping comment):
```bash
if [[ "$FORGE" = "gitea" || "$FORGE" = "all" ]]; then
  remove_dir "$HOME/.claude/kaola-workflow-gitea"
fi
```

### validate-kaola-workflow-gitea-contracts.js

Insert after line 148 (after installSupportScripts loop, before Phase 6 dispatch assertion):
```js
const uninstallScript = read('uninstall.sh');
assert(uninstallScript.includes('github|gitlab|gitea|all'), 'uninstall.sh must accept --forge=gitea in case validation');
assert(uninstallScript.includes('"$FORGE" = "gitea"'), 'uninstall.sh must branch on gitea forge selection');
assert(uninstallScript.includes('kaola-workflow-gitea'), 'uninstall.sh must remove the Gitea install directory');
assert(/Usage:.*gitea/.test(uninstallScript), 'uninstall.sh usage string must list gitea');
```

### README.md

After line 187 (`./uninstall.sh --forge=gitlab`), before line 188 (`./uninstall.sh --forge=all`):
- Insert: `./uninstall.sh --forge=gitea`

### CHANGELOG.md

Under `[Unreleased] > ### Added`:
```
- **Gitea uninstall support**: `uninstall.sh` now accepts `--forge=gitea` to remove the `~/.claude/kaola-workflow-gitea` directory. Usage string, argument validation, and error messages updated to list `gitea` alongside `github`, `gitlab`, and `all`.
```

## Build Sequence

1. Edit uninstall.sh (4 spots) — P0, load-bearing
2. Edit validate-kaola-workflow-gitea-contracts.js (4 assertions) — P0, parallel with step 1
3. Edit README.md (1 line) — P1, parallel with steps 1-2
4. Edit CHANGELOG.md (1 bullet) — P1, parallel with steps 1-3
5. Validate — sequential after all writes

## Parallelization Plan

| Group | Tasks | Why Safe |
|-------|-------|----------|
| A | 1, 2, 3, 4 | Disjoint write sets |
| B | Validation | Sequential after Group A |

## Validation Commands (in order)

```bash
bash -n uninstall.sh
./uninstall.sh --help
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
node scripts/simulate-workflow-walkthrough.js
```

## Out of Scope

- install.sh (already supports gitea)
- COMMANDS array (existing glob already covers Gitea commands)
- Hook-stripping Python3 block (forge-agnostic)
- simulate-workflow-walkthrough.js (does not exercise uninstall.sh)
- No new files created
