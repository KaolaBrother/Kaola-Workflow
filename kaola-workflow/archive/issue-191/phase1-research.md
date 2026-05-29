# Phase 1 - Research / Discovery: issue-191

## Deliverable
Six independent low-severity fixes:
- L1: Port audit-labels/repair-labels subcommands to GitLab and Gitea claim scripts
- L2: Fix parseRoadmapTable to handle pipe-escaped titles (in 4 roadmap script copies)
- L3: Fix field() regex \s* → [ \t]* in 4 scripts (+ plugin sync)
- L4: Persist --runtime flag to workflow-state.md in writeState
- L5: Fix bare uninstall.sh to auto-detect or default to --forge=all for support dirs
- L6: Three doc nits: add 2 mock env vars to .env.example, add 3 entries to docs/README.md, add sink-fallback to README subcommand table

## Why
Latent/cosmetic issues that mislead operators or leave stale state:
- L1: Operators used to audit-labels on GitHub won't find it on GitLab/Gitea
- L2: parseRoadmapTable silently drops rows when a title contains a pipe (affects migrate and safety guard)
- L3: field() can read the wrong value when a field is empty (next line's content consumed)
- L4: --runtime flag is parsed and silently dropped; workflow-state.md records workflow_path but not runtime
- L5: Bare uninstall.sh after gitlab/gitea install leaves support dirs behind; reports success
- L6: Missing docs cause confusion for operators and new contributors

## Affected Area
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — L1
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — L1
- `scripts/kaola-workflow-roadmap.js` — L2
- `plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js` — L2 (plugin sync)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` — L2 (gitlab copy)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` — L2 (gitea copy)
- `scripts/kaola-workflow-active-folders.js` — L3
- `scripts/kaola-workflow-classifier.js` — L3
- `scripts/kaola-workflow-repair-state.js` — L3
- `scripts/kaola-workflow-compact-context.js` — L3
- (+ plugin copies of above for L3 via validate-script-sync.js)
- `scripts/kaola-workflow-claim.js` — L4 (writeState template)
- `uninstall.sh` — L5
- `.env.example` — L6a
- `docs/README.md` — L6b
- `README.md` — L6c

## Key Patterns Found
1. cmdAuditLabels/cmdRepairLabels pattern: claim.js:910-932; router: 1079-1080; test: simulate-workflow-walkthrough.js:2763
2. parseRoadmapTable parser regex: roadmap.js:174; writer escape: roadmap.js:85; fix: `([^|]|\\\|)+?` or `(?:[^|]|\\\|)+?`
3. field() correct pattern: `[ \\t]*` at roadmap.js:12; wrong: `\\s*` at active-folders.js:22, classifier.js:25, repair-state.js:82, compact-context.js:64
4. writeState template section: claim.js:281-291; claimProject call: 415-423
5. uninstall.sh FORGE default: line 4; support-dir gate: lines 105-116; not-installed guard: line 193
6. KAOLA_GLAB_MOCK_SCRIPT consumed: kaola-gitlab-forge.js:21; .env.example reference: line 37 (GH only)

## Test Patterns
- Framework: hand-rolled assert (scripts/simulate-workflow-walkthrough.js)
- Location: scripts/simulate-workflow-walkthrough.js, plugins/*/scripts/simulate-*-walkthrough.js
- Structure: self-contained test functions, registered in runner block
- L1 reference test: testAuditAndRepairLabels (lines 2763-2878) — model for GitLab/Gitea ports

## Config & Env
- KAOLA_GLAB_MOCK_SCRIPT: used by kaola-gitlab-forge.js:21 — undocumented in .env.example
- KAOLA_TEA_MOCK_SCRIPT: used by kaola-gitea-forge.js:27 — undocumented in .env.example
- args.runtime: parsed by claim.js but never written to workflow-state.md

## External Docs
None — all internal.

## GitHub Issue
KaolaBrother/Kaola-Workflow#191

## Completeness Score
10/10 — all 6 items have exact file:line locations, clear pass criteria, no missing facts.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | all internal patterns, no external API/library behavior |

## Notes / Future Considerations
- L1: The GitLab/Gitea equivalents use `glab`/`tea` CLI instead of `gh`; the cmdAuditLabels logic needs forge-specific issue list command
- L2: All 4 roadmap script copies (main + 3 plugins) need the same parser fix; validate-script-sync only checks the kaola-workflow plugin copy
- L3: validate-script-sync.js will catch the kaola-workflow plugin copies; GitLab/Gitea plugin copies need separate attention
- L4: Runtime field placement should be near workflow_path for logical grouping
- L5: Safest fix: detect installed support dirs and remove them (forge-agnostic) rather than changing default FORGE
