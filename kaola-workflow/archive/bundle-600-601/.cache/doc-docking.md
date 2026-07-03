# Documentation Docking — bundle-600-601

## Changed code/config/test/workflow files reviewed

- issue-600 lane (n1): install.sh, uninstall.sh, scripts/test-install-model-rendering.js
- issue-601 lane (n3): plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/scripts/install-codex-agent-profiles.js (installer byte-group ×3); scripts/kaola-workflow-codex-preflight.js + plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/scripts/kaola-workflow-codex-preflight.js (preflight byte-group ×4); plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js; plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js; plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js; README.md; docs/api.md; commands/workflow-init.md ×3 editions; skills/kaola-workflow-init/SKILL.md ×3 editions; install-opencode.sh
- finalize window: CHANGELOG.md (n5); install-opencode.sh usage heredoc (R1, Trivial Inline Edit Exception); docs/architecture.md, docs/conventions.md, docs/opencode-edition.md (doc-updater docking fixes)

## Documents checked

README.md, docs/api.md, CHANGELOG.md, docs/architecture.md, docs/conventions.md, docs/opencode-edition.md, .env.example, inline comments (install-opencode.sh header/usage/ADAPTIVE_CORE_COMMANDS).

## Gaps found and fixed

1. docs/architecture.md:491-492 — said "14 base-role profiles (14 files, 14 triples)"; actual roster is 15 (synthesizer profile files landed earlier; only install.sh/uninstall.sh REQUIRED_AGENTS was missing it, fixed by this bundle). Fixed to 15. (doc-updater)
2. docs/conventions.md:118 — same 14→15 count staleness in the .toml triple byte-identity description. Fixed. (doc-updater)
3. docs/opencode-edition.md:274/280/380 — still documented the pre-fix "6 files" adaptive-core set including the retired `auto` command; made stale as a side effect of this bundle's install-opencode.sh correction. Fixed all 3 occurrences to 5 files / correct command list. (doc-updater)
4. install-opencode.sh:83-84 usage heredoc — stale `auto` reference surfaced by the n4 review gate (R1); fixed at the finalize seam under the Trivial Inline Edit Exception. Verified: node scripts/test-opencode-edition.js exit 0 (499 assertions), re-run again after the docs/opencode-edition.md fix (exit 0).

## Verified matches (no gap)

- README.md Codex remediation prose matches dispatchPostureRemediation() in scripts/kaola-workflow-codex-preflight.js byte-for-byte (transcribed + diffed by doc-updater).
- docs/api.md:1259 dispatch_posture_warning example matches the real string literal exactly; docs/api.md states no Claude-edition agent count anywhere.
- CHANGELOG.md [Unreleased] #600 Fixed + #601 Changed entries factually match the diff (independently re-verified by doc-updater).
- README.md agent roster list (~597-611) already listed synthesizer — correct pre-bundle.

## No-impact reasons for skipped document classes

- .env.example: no new process.env references in the full diff (grepped).
- docs/README.md index: no new/removed documents.
- ADRs: none authored — roster-omission fix + behavior-preserving wording reorder; the CHANGELOG entries are the durable record (planner decision, frozen in the plan).

## Final verdict

DOCKED
