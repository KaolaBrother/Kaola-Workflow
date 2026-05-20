# Code Explorer Output — issue-118

## Entry Points

- `uninstall.sh` — main file to modify; `--forge` flag parsed by `while` loop then validated by `case` statement; directory removal handled by `remove_dir()` in forge-specific `if` blocks.
- `README.md` lines 183–189 — the uninstall documentation block to update.
- `scripts/validate-workflow-contracts.js` and `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — contract validators checking consistency between install/uninstall scripts and README.
- `scripts/simulate-workflow-walkthrough.js` — integration walkthrough (no uninstall coverage; covers claim/repair/roadmap/hook/sink surfaces only).

## Execution Flow (uninstall.sh current state)

1. Default `FORGE=github`.
2. `while` loop parses `--forge=X` or `--forge X`.
3. `case "$FORGE"` validates; currently accepts `github|gitlab|all`; rejects else with exit 2.
4. Agent files loop: removes managed agent `.md` files by `kaola-workflow-managed-agent: true` marker.
5. Agent manifest file removed if no managed agents remain.
6. Command files loop: removes fixed list under `~/.claude/commands/`.
7. `remove_dir()` helper: `if [[ -d "$dir" ]]; then rm -rf "$dir"; ...fi`.
8. Forge-specific blocks:
   - `if [[ "$FORGE" = "github" || "$FORGE" = "all" ]]; then remove_dir "$HOME/.claude/kaola-workflow"; remove_dir "$HOME/.claude/claude-workflow"; fi`
   - `if [[ "$FORGE" = "gitlab" || "$FORGE" = "all" ]]; then remove_dir "$HOME/.claude/kaola-workflow-gitlab"; fi`
   - **No block for gitea.**
9. Python3 inline script strips managed hook entries from `~/.claude/settings.json` — forge-agnostic (matches `kaola-workflow:` prefix); no change needed for Gitea.

## Forge-to-Directory Mapping (from install.sh)

- `github` → `$HOME/.claude/kaola-workflow`
- `gitlab` → `$HOME/.claude/kaola-workflow-gitlab`
- `gitea` → `$HOME/.claude/kaola-workflow-gitea`

## Three Precise Spots in uninstall.sh

1. **`usage()` function (~line 11)**: Change `"Usage: ./uninstall.sh [--forge=github|gitlab|all]"` to include `gitea`.
2. **`--forge` two-argument error (~line 23)**: Change `"--forge requires github, gitlab, or all"` to include `gitea`.
3. **`case "$FORGE"` validation (~line 42)**: Change `github|gitlab|all)` to `github|gitlab|gitea|all)`.
4. **New forge-specific block (after ~line 112)**: Add block for gitea alongside existing github and gitlab blocks.

## README Change

Lines 185–189 — uninstall bash block missing `./uninstall.sh --forge=gitea`. Add between gitlab line and all line (github→gitlab→gitea→all ordering).

## Test Coverage

| File | Current Coverage | Gap |
|------|-----------------|-----|
| `scripts/validate-workflow-contracts.js` | `bash -n` syntax check only | No semantic uninstall assertions |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | Reads install.sh, asserts content | Can be extended to assert uninstall.sh contains `kaola-workflow-gitea` |
| `scripts/simulate-workflow-walkthrough.js` | Covers Node.js scripts only | Not appropriate for shell-level fix |

## Error Handling Patterns

- All arguments validated before any filesystem work.
- Unknown forge: print to stderr, call `usage >&2`, exit 2.
- `remove_dir()`: silent if directory absent (`[[ -d "$dir" ]]` guard).
- `removed` counter: prints "Not installed — nothing to remove" if zero.
- `set -euo pipefail` at top.
- Python3 hook-stripping is non-fatal.

## Naming Conventions

- Support dir: `$HOME/.claude/kaola-workflow-{forge}` (github → no suffix).
- Scripts: `kaola-{forge}-workflow-*.js` for non-GitHub forges.
- Test functions: `test{Description}()`, hand-rolled `assert()`, no framework.
