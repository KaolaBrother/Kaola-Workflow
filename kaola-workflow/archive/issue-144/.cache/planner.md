# Planner Output — issue-144

## Files to Touch
1. `install.sh` — insert Gitea uninstall command inside conflict remediation echo block
2. `README.md` — insert Gitea uninstall command inside fenced bash conflict block

## Exact Changes

### install.sh (remediation block ~line 200)
Insert after the GitLab uninstall line inside the `echo` conflict remediation block:
```
echo "  claude plugin uninstall kaola-workflow-gitea@kaolabrother-kaola-workflow  # if installed" >&2
```
(preserve 2-space indent inside the quoted string and trailing `>&2`)

### README.md (conflict block ~line 145)
Insert after the GitLab uninstall line inside the fenced bash block:
```
claude plugin uninstall kaola-workflow-gitea@kaolabrother-kaola-workflow  # if installed
```
(plain bash, no indent, no `>&2`)

## Gitea Command Name
`kaola-workflow-gitea@kaolabrother-kaola-workflow` — confirmed against:
- Detection regex at `install.sh:192`
- Codex config block at `README.md:282`
- GitLab line's naming convention

## Acceptance Check Commands
1. `bash -n install.sh` exits 0
2. `node scripts/simulate-workflow-walkthrough.js && npm test` exit 0
3. `grep -n "kaola-workflow-gitea@kaolabrother-kaola-workflow" install.sh README.md` shows new lines in both remediation locations

## Out of Scope
- Detection regex at `install.sh:192` (already matches Gitea)
- Codex config block at `README.md:276-284` (already lists Gitea; unrelated to remediation)
- GitHub/GitLab uninstall lines, marketplace-remove line, `exit 1`, surrounding prose
- No CHANGELOG entry (messaging-only, no behavior change, small-fix lightweight path)
- No new tests
