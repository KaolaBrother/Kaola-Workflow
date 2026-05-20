# Advisor Output — issue-118 Phase 2 Ideation

## Verdict: Approach C is sound.

## Items to Verify Before Phase 3

### 1. Files outside support directory (RESOLVED)
Advisor asked: does install.sh write Gitea artifacts outside `$HOME/.claude/kaola-workflow-gitea/`?

**Verified:** The existing `uninstall.sh` `COMMANDS` array uses glob `"$HOME/.claude/commands/kaola-workflow"*.md` which already matches all Gitea commands (kaola-workflow-fast.md, kaola-workflow-phase1.md through phase6.md, etc.). Agent files are handled forge-agnostically via the managed-agent marker. The ONLY gap is the support directory `~/.claude/kaola-workflow-gitea` — the `remove_dir` block is the only addition needed. Plan is complete.

### 2. Validator assertion exact strings (ACTION REQUIRED in Phase 3)
Exact format of the gitlab block (verified from uninstall.sh line 110):
`if [[ "$FORGE" = "gitlab" || "$FORGE" = "all" ]]; then`

The gitea assertions must use these exact strings:
- `'"$FORGE" = "gitea"'` — will match `if [[ "$FORGE" = "gitea" || "$FORGE" = "all" ]]; then`
- `'github|gitlab|gitea|all'` — will match after case validation fix
- `'kaola-workflow-gitea'` — will match directory name
- `/Usage:.*gitea/` regex — will match usage string after fix

### 3. CHANGELOG (ACTION REQUIRED)
Project CLAUDE.md documentation checklist requires CHANGELOG.md entry under [Unreleased]. This is a user-visible CLI surface change. Add one line under [Unreleased]:
`- Add \`--forge=gitea\` support to \`uninstall.sh\`; \`--forge=all\` now removes the Gitea edition directory`

## Summary
- No missed approaches
- Risks are accurate
- Recommendation (Approach C) is sound
- CHANGELOG addition is required by project conventions
- Validator assertions are safe — assert on stable literal strings in the forge blocks
