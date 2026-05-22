# Documentation Docking — issue-153 (2026-05-22)

## Changed code/config/test/workflow files reviewed
- install.sh (inherit-rewrite mechanism + helpers + resolver pivot)
- scripts/test-install-model-rendering.js (F2: installed agents = inherit + marker)
- scripts/validate-workflow-contracts.js + plugins/kaola-workflow/scripts/validate-workflow-contracts.js (F3 guard + byte-identical mirror; mirror also backfilled pre-existing #152 drift)
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js (F3 guard)
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js (F3 guard)
- kaola-workflow/.roadmap/issue-153.md (per-issue roadmap source; removed in Step 7)
- kaola-workflow/issue-153/* (workflow artifacts)

## Documents checked
- README.md — UPDATED: install-time inherit-rewrite + reinstall/restart note (after agent-model table). MATCHES the behavior change.
- CHANGELOG.md — UPDATED: [Unreleased] ### Added entry for #153. MATCHES.
- docs/architecture.md — checked, NO-IMPACT (does not document agent-model resolution / install flow).
- docs/api.md — checked, NO-IMPACT (Sink/env/roadmap APIs only; no installer model-resolution contract).
- .env.example — NO-IMPACT (no new env vars).
- Inline comments — NO-IMPACT (helpers self-explanatory; F1 invariant captured in artifacts + enforced by test).

## AC ↔ doc/test mapping
- AC regression (a) installed model: inherit → scripts/test-install-model-rendering.js F2 loop. Documented in README + CHANGELOG.
- AC regression (b) command-file concrete model= per profile → existing test-install-model-rendering.js assertions (--profile=higher).
- AC regression (c) no model= dropped → F3 assertEveryDispatchHasModel across all 3 forge validators. Documented in CHANGELOG.
- AC simulate exit 0 + existing tests pass → npm test green (.cache/final-validation.md).
- AC GitLab/Gitea mirrored → command copies unchanged; F3 guard enforces all 3 forges.
- AC live badge render → MANUAL (reinstall + Claude Code restart; frontmatter cached at session start). README + CHANGELOG both state the reinstall+restart requirement. Mechanism empirically proven in prior session (inherit baseline → badge on every concrete model, no parent-equal edge).

## Gaps found and fixed
None. README + CHANGELOG cover the user-facing behavior; no-impact classes justified above.

## Common-profile AC note
AC (a) "installed frontmatter = inherit for BOTH common and higher": the inherit-rewrite in
install_managed_agent is PROFILE-INDEPENDENT (it always writes `inherit` regardless of $PROFILE; profile only
selects which SOURCE's concrete model feeds the command files). The F2 test exercises --profile=higher; the
common-profile installed=inherit result is identical by construction. Satisfied; not separately re-tested
(would only re-exercise the same profile-independent code path).

## Final verdict: DOCKED
