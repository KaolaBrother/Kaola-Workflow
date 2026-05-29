# Code Explorer Output — issue-190

## M1 — Codex SKILL.md Path-Intent Gap

### Files to edit
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md`

### Insertion point
Between end of `## Startup Step 0a` (line 96) and `## Startup` (line 98) in all three files.

### Source to port
`commands/workflow-next.md` lines 80–117: `## Startup Step 0a-1 — Path Intent` section verbatim, with forge-specific issue-fetch command:
- GitHub: `gh issue view "$KAOLA_TARGET_ISSUE" --json number,title,body,labels`
- GitLab: `glab issue view "$KAOLA_TARGET_ISSUE" --output json`
- Gitea: `tea issues view "$KAOLA_TARGET_ISSUE" --output json`

### Required Output gap (all 3 Codex files, lines 219-229)
Missing vs Claude-format `commands/workflow-next.md` lines 335-348:
- `Branch: {branch from Sink block in workflow-state.md, or TBD if not yet claimed}`
- `Workflow path: {fast|full — from KAOLA_PATH or Step 0a-1 judgment}`
- `Parallel decision: {green|yellow|red|blocked|target_unavailable|target_unverified|skipped — classifier verdict or "skipped" if offline/unavailable}`

### kaola-workflow-fast skill exists
- `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md` ✓
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md` ✓
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-fast/SKILL.md` ✓
(routing target is available; just needs the router to set KAOLA_PATH and surface it)

## M2 — Stale Session Vars

### .env.example removals
Lines 11-13 (KAOLA_ENFORCE_PLATFORM_SESSION + comment block)
Lines 15-17 (KAOLA_KERNEL_SESSION_SKIP + comment block)
Lines 19-21 (KAOLA_COORD_ROOT + comment block)
Lines 27-29 (KAOLA_SESSION_ID + comment block)
Lines 31-33 (KAOLA_KERNEL_SESSION_FAKE_PID + comment block)
Also: blank line separators at 14, 18, 22, 26, 30 need review to avoid double blanks.

validate-workflow-contracts.js confirms kaola-workflow-session-env.js must not exist (line 129, 172).

### docs/api.md removal
Line 109: `- **KAOLA_KERNEL_SESSION_FAKE_PID=<pid>** — Override process-tree walk...`
Section remains valid since KAOLA_WORKFLOW_OFFLINE=1 (line 108) stays.

## M3 — package-lock.json Version Drift

Lines 3 and 9: `"version": "3.16.0"` → `"version": "3.16.1"`
package.json is already at 3.16.1 (correct).
