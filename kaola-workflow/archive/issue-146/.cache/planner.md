# Planner Output — issue-146

## Files to Touch
1. `README.md` only — wording fix in Codex pack section (lines 241-244)

## Exact Change

### README.md (lines 241-244)
Old:
```
This repository also includes Codex packs under `plugins/`. They expose the same
Kaola-Workflow identity through Codex-native skills, using `kaola-workflow/`
project artifacts and `AGENTS.md` guidance rather than Claude Code slash
commands and `CLAUDE.md`.
```
New:
```
This repository also includes Codex packs under `plugins/`. They expose the same
Kaola-Workflow identity through Codex-native skills and `kaola-workflow/` project
artifacts rather than Claude Code slash commands. Codex uses `AGENTS.md` as its
entrypoint, which redirects to `CLAUDE.md` as the single canonical source of repo
guidance — the same `CLAUDE.md` contract applies to Codex and Claude Code alike.
```

## Rationale
- Preserves the correct skills-vs-slash-commands distinction
- Fixes the wrong framing: AGENTS.md is the entrypoint TO CLAUDE.md, not a replacement for it
- Edition-agnostic — accurate for GitHub, GitLab, Gitea without per-edition changes

## Acceptance Check Commands
1. `node scripts/validate-workflow-contracts.js`
2. `node scripts/validate-kaola-workflow-contracts.js`
3. `node scripts/simulate-workflow-walkthrough.js`
4. `grep -n "AGENTS.md" README.md` — confirm new phrasing

## Out of Scope
- `AGENTS.md` itself — already correct, leave untouched
- Plugin SKILL.md AGENTS.md redirect blocks — already correct, asserted by contracts
- Edition listing at README lines 246-248 — no per-edition change needed
- `CHANGELOG.md` — doc wording correction, not warranted
- Any other README sections
