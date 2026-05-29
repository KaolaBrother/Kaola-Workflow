# Code Explorer Output — issue-191

## L1 — audit-labels/repair-labels missing from GitLab/Gitea

### GitHub (exists)
- cmdAuditLabels: scripts/kaola-workflow-claim.js:910-915 — `gh issue list --state closed --label workflow:in-progress --json number,title,url`
- cmdRepairLabels: scripts/kaola-workflow-claim.js:917-932 — reads `--execute` flag; without: dry-run; with: removes labels
- Router: claim.js:1079-1080 dispatches `audit-labels` and `repair-labels`
- Tests: simulate-workflow-walkthrough.js:2763-2878 (testAuditAndRepairLabels, 3 sub-cases)
- Called at runner: line 3834

### GitLab/Gitea (missing)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:1050-1066 — no audit-labels/repair-labels
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:1036-1052 — no audit-labels/repair-labels
- No equiv tests in gitlab/gitea walkthrough scripts

## L2 — parseRoadmapTable pipe-in-title bug

### Writer (scripts/kaola-workflow-roadmap.js:85)
`(data.title || '—').replace(/\|/g, '\\|')` — escapes | as \|

### Parser (scripts/kaola-workflow-roadmap.js:174)
`/^\| #(\d+) \| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \|$/gm`
`[^|]+?` cannot match `\|` (escaped pipe) — the `|` after the backslash terminates the cell.

### Plugin copies
Same logic at same lines in:
- plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js:102 (callers at :108, :208)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js:102

### Callers
- guardAgainstMissingRoadmapSource() (line 108)
- cmdMigrate() (line 208)

## L3 — field() regex uses \s* instead of [ \t]*

### Correct pattern (scripts/kaola-workflow-roadmap.js:12)
`new RegExp('^' + escaped + ':[ \\t]*(.+)$', 'm')`

### Files with \s* (needs fix)
| File | Line | Note |
|------|------|------|
| scripts/kaola-workflow-active-folders.js | 22 | string concat |
| scripts/kaola-workflow-classifier.js | 25 | string concat |
| scripts/kaola-workflow-repair-state.js | 82 | template literal |
| scripts/kaola-workflow-compact-context.js | 64 | template literal |

Plus plugin copies (kaola-workflow/ plugin has these as common scripts, so sync required after fixing main scripts).

## L4 — --runtime flag parsed but never persisted

### Parser
parseArgs (claim.js:25-47): catch-all at lines 37-41 converts --key value to args[camelCase(key)]
So --runtime claude → args.runtime = 'claude' — silently parsed.

### writeState template (claim.js:271-313)
## Current Position section (lines 281-291) has: workflow_path, phase, step, next_command, next_skill, main_session_role, implementation_owner, fix_owner, inline_emergency_fallback_authorized
No `runtime:` field written anywhere.

### claimProject (claim.js:415-423)
writeState call passes: sink, worktree_path, workflow_path, status — NOT args.runtime

### Historical evidence
kaola-workflow/archive/issue-44/workflow-state.md:21 has `runtime: claude` — written by older code, not current writeState.

## L5 — Bare uninstall.sh orphans gitlab/gitea dirs

### Default (uninstall.sh:4)
`FORGE=github`

### Unconditional shared removals (lines 54-94)
Agents and commands removed regardless of FORGE → removed > 0 always.

### Forge-gated removals (lines 105-116)
```
FORGE=github → removes $HOME/.claude/kaola-workflow + $HOME/.claude/claude-workflow
FORGE=gitlab → removes $HOME/.claude/kaola-workflow-gitlab
FORGE=gitea → removes $HOME/.claude/kaola-workflow-gitea
```
A bare ./uninstall.sh after gitlab install: $HOME/.claude/kaola-workflow-gitlab is NEVER removed.

### Not-installed guard (line 193)
`if [[ "$removed" -eq 0 ]]` — never fires because shared removals always increment removed.

## L6 — Documentation nits

### L6a: KAOLA_GLAB_MOCK_SCRIPT / KAOLA_TEA_MOCK_SCRIPT
- Consumed: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js:21
- Consumed: plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js:27
- .env.example:37 has KAOLA_GH_MOCK_SCRIPT but NOT KAOLA_GLAB_MOCK_SCRIPT or KAOLA_TEA_MOCK_SCRIPT

### L6b: docs/README.md gaps (9-line file)
Missing: workflow-state-contract.md, agents-source.md, investigations/

### L6c: sink-fallback not in README subcommand table
- README.md:530-542: subcommand table ends at worktree-status/worktree-finalize
- cmdSinkFallback: scripts/kaola-workflow-claim.js:960, router:1078
- Mentioned in prose at README.md:620 but not in the table
