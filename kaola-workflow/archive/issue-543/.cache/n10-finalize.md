# n10-finalize (main-session-direct) — CHANGELOG sink

evidence-binding: n10-finalize f37f9cd14b53

## Changes
- CHANGELOG.md: added the issue #543 entry under `## [Unreleased] → ### Changed` (first bullet), documenting BOTH scopes:
  - (1) Codex partition (Option A — installer config-writer in the byte-identical install-codex-agent-profiles.js triplet; runtime gate already enforced; pure-JS seedKaolaConfig UNION writer mirroring install.sh:712-734 D4; no plugin.json/version change).
  - (2) opencode partition + standalone fix (folded #544-run-discovered): install-opencode.sh --with-fast/--with-full partition + opencode-native script deploy; sync-opencode-edition.js rewriteClaudeScriptPaths regenerates .opencode/ with ZERO CLAUDE_PLUGIN_ROOT/.claude/ leaks (146→0); generator still emits all 12 commands (install-time COPY selection).
- Verification receipts cited: four #307 chains green; test-opencode-edition.js 363 green (incl. absence assertion A); 10 Codex partition sub-cases pass; opus gates n7+n8 PASS 0-blocking. Decision record docs/decisions/D-543-01.md.
- Deferred (filed as follow-up): Codex skills/kaola-workflow-init/SKILL.md opt-in prose ×3 — blocked at the n6 barrier by sync-group #301 (SKILL.md has byte-identical commands/workflow-init.md peers that must move together); flags work without it.

## Run gaps (for finalization-summary.md)
- Codex SKILL.md opt-in discoverability prose ×3 (plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-init/SKILL.md): DEFERRED. Not a hard #543 acceptance gate (the --with-fast/--with-full flags are accepted by the installer; only the in-SKILL discoverability docs are missing). Blocked in-run by a write-set overflow at the n6 barrier; a plan-repair to re-add via n9 was refused by the plan-validator's sync-group constraint (#301 — SKILL.md has byte-identical commands/workflow-init.md peers). TO BE FILED as a follow-up issue.
