# TDD-Guide Output — issue-144

## Changes Made

### install.sh — line 201
Added after GitLab uninstall echo line in conflict remediation block:
```
echo "  claude plugin uninstall kaola-workflow-gitea@kaolabrother-kaola-workflow  # if installed" >&2
```

### README.md — line 146
Added after GitLab uninstall line in fenced bash conflict block:
```
claude plugin uninstall kaola-workflow-gitea@kaolabrother-kaola-workflow  # if installed
```

## Acceptance Check Results
- `bash -n install.sh`: PASS
- `grep -n "kaola-workflow-gitea@..."`: found at install.sh:201 and README.md:146 (remediation locations); README.md:283 is pre-existing Codex config, not changed
- `node scripts/simulate-workflow-walkthrough.js`: PASSED
- `npm test`: all suites PASSED (GitHub, GitLab, Gitea walkthroughs, Codex walkthroughs, contract validations)
