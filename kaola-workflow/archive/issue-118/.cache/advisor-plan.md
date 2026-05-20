# Advisor Output — issue-118 Phase 3 Plan

## Verdict: Plan is sound. Proceed to Phase 4.

## Action Items for Phase 4 (not blockers)

1. **Validator insertion point**: Do not rely on "line 148". Anchor on the structural landmark instead:
   `grep -n 'installSupportScripts' plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
   Insert after that loop closes. Line numbers drift; landmarks don't.

2. **CHANGELOG format**: Read `CHANGELOG.md` first and mirror the adjacent Gitea entry's format (line ~7). Don't introduce a new bullet style next to existing entries.

3. **Smoke check note**: `./uninstall.sh --help` may not be handled explicitly (hits "Unknown argument" → exit 2 + prints usage). More explicit smoke check: `./uninstall.sh --forge=badforge 2>&1 | grep -q 'gitea'`. Acceptable either way.

## Already Confirmed (no re-verification needed)

- Command file glob already covers Gitea commands
- Agent file removal is forge-agnostic via MANAGED_AGENT_MARKER
- Hook-stripping is forge-agnostic
- Bash 3.2 compatible (new block uses `[[ ]]` only, no associative arrays)
- `--forge=all` correctly triggers new gitea block via `gitea|all` clause
- Missing `~/.claude/kaola-workflow-gitea` is handled silently by `remove_dir`'s `[[ -d ]]` guard
- Build sequence is dependency-safe (disjoint write sets, validation after writes)
- A developer can implement from this plan alone

## Scope Reminder
After #118 closes, stop. Do not auto-route into #119.
