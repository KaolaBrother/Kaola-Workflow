# Finalization - Summary: bundle-600-601

## Delivered

- **#600 (bug):** the Claude edition now installs the `synthesizer` agent — `REQUIRED_AGENTS` in `install.sh` AND `uninstall.sh` went 14→15. No `profiles/higher/` override needed (`agents/synthesizer.md` frontmatter pins `model: opus`; the emitted `.kaola-agent-models.json` carries `opus`, verified in a sandboxed-$HOME install/uninstall round-trip). RED-first roster + manifest→opus assertions added to `scripts/test-install-model-rendering.js`.
- **#601 (enhancement):** the Codex dispatch-posture remediation now leads with the always-available documented in-session explicit ask; the `ultra` effort route is second, qualified as undocumented/server-gated (codex-tui 0.142.5). Authored once, propagated to the installer ×3 + preflight ×4 byte-groups, README, docs/api.md, and the 6 workflow-init config-audit surfaces; RED-first order assertions in the codex walkthrough + both forge suites; behavior-preserving (deriveDispatchPosture untouched, report/WARN non-fatal, all pinned substrings retained). Ride-along: `install-opencode.sh` header comment AND usage heredoc corrected to the 5-file adaptive-core set.

## Files Changed

- n1: install.sh, uninstall.sh, scripts/test-install-model-rendering.js
- n3: plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/scripts/install-codex-agent-profiles.js; scripts/kaola-workflow-codex-preflight.js + 3 plugin copies; plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js; plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js; plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js; README.md; docs/api.md; commands/workflow-init.md ×3; skills/kaola-workflow-init/SKILL.md ×3; install-opencode.sh
- n5 + finalize window: CHANGELOG.md ([Unreleased]: Fixed #600, Changed #601); install-opencode.sh (R1); docs/architecture.md, docs/conventions.md, docs/opencode-edition.md (docking count/list corrections)

## Test Coverage

No coverage tooling in this repo (hand-rolled Node assert suites, no framework). Behavioral coverage: RED-first assertions in test-install-model-rendering.js (roster + manifest), order assertions in 3 suites (codex walkthrough, gitlab, gitea); four chains + opencode suite green.

## Final Validation Evidence

- Binding four-chain receipt: `.cache/chain-receipt.json` — claude/codex/gitlab/gitea all exit 0 (serial, `KAOLA_RUN_CHAINS_CONCURRENCY=serial`), headSha 7f9e0e63, workTreeHash covers the uncommitted CHANGELOG + R1 state; completed 2026-07-03T03:04:21Z.
- Validation reuse boundary: the receipt covers code/test impact through n5's CHANGELOG write and the R1 fix (both in the hashed working tree). The three later docking doc edits (docs/architecture.md, docs/conventions.md, docs/opencode-edition.md) are inert-docs-only and outside the receipt's code-relevant tree — no re-run trigger.
- Opencode edition (additive, outside the four chains): `node scripts/test-opencode-edition.js` exit 0 (499 assertions), run after the R1 fix AND re-run after the docs/opencode-edition.md docking fix.
- Adaptive script gates: --resume-check 0, --gate-verify 0, --barrier-check 0, --verdict-check 0 (after R1 was recorded resolved in n4 evidence).

## Documentation Docking

DOCKED — `.cache/doc-docking.md` (4 gaps found and fixed; README/docs-api/CHANGELOG verified byte-accurate against code).

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none — all validation passed first run at finalize) | | | | |

## Trivial Inline Edit Exception record

- install-opencode.sh:83-84 usage heredoc: removed retired `auto` from the adaptive-core command list (one line). Surfaced as R1 (HIGH, in_scope) by the n4 code-reviewer gate; target file is in n3's frozen declared write set; applied between windows (after n4 closed, before n5's baseline). Verified: grep sweep + opencode suite exit 0. Recorded in n4 evidence as status=resolved.

## Follow-Up Items

- LOW (n2 gate, non-blocking, inert): `install.sh` `default_agent_model()` has no `synthesizer)` arm — currently unreachable (frontmatter always resolves first). Recommendation: one-line defense-in-depth addition riding any future install.sh change. NOT filed as an issue — issue creation requires user permission per the Closure Decision Gate; surfaced to the user in the session summary.
- Process incident (no repo impact): during n2's review, a sandbox chain's first install.sh invocation missed its HOME= override and deployed pre-gate branch content (commit 7f9e0e63) into the live ~/.claude/kaola-workflow/. Orchestrator decision: true up with a standard `./install.sh --yes --forge=github --profile=higher` from main after the sink-merge lands (the merged main equals the deployed content for the affected surfaces, plus the finalize-window fixes).

## Closure Decision

No deferred/partial implementation items block closure: all #600 ACs and #601 ACs verified met (gate evidence n2/n4). The one LOW follow-up is recorded above and routed to the user in the session summary; no roadmap/issue reorganization performed without permission. Both bundle issues close per the all_or_nothing closure policy.

## Commit And Push

Pending final Git gate (contractor Step 8 + sink-merge --sink); final hash reported after push.

## GitHub Issue

#600 + #601 — to be closed by sink-merge (all_or_nothing bundle closure; --issue 600 --issue-numbers 600,601).

## Roadmap

Closure removes kaola-workflow/.roadmap/issue-600.md (issue-601 source never existed — filed post-release); ROADMAP.md regenerated once by cmdFinalize.

## Archive

Pending — kaola-workflow/archive/bundle-600-601/ via cmdFinalize.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failure to route |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md (regen at cmdFinalize Step 8b) | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/upstream check | final gate runs after this file is committed |

## Status

ARCHIVED AFTER FINAL GIT GATE
