# Documentation Docking — issue-598

## Changed files reviewed (branch 8bd372ca..95908a35: legs+synth fc229372 [n1+n2], legs+synth db62b9c1 [n5], CHANGELOG 95908a35)
- Code: install-codex-agent-profiles.js ×3, kaola-workflow-codex-preflight.js ×4 (byte-groups), 3 contract validators (needles)
- Tests: test-install-model-rendering.js, codex walkthrough, gitlab/gitea chain tests
- Prose: 6 next/adapt SKILLs (global probe), 6 plan-run surfaces (Gate-Role Degradation Notice), 6 workflow-init surfaces (config-audit posture), README, docs/api.md, docs/architecture.md, D-598-01 (new), CHANGELOG

## Documents checked
- README.md — Codex install section documents the posture report + remediation, matching actual installer output (transcribed, spot-checked by n5 via live require of the exports).
- docs/api.md — preflight/doctor: the four additive fields, WARN semantics, version-guard note; transcribed from code.
- docs/architecture.md — preflight gate story extended with the dispatch-posture clause.
- workflow-init ×6 — config-audit no longer reports "features enabled" alone as dispatch-ready; byte-pair parity per edition preserved (validators green).
- docs/decisions/D-598-01.md — records the report-only design boundary, the version-guard rationale, the probe dual-path fix, the consent-halt closure.
- CHANGELOG.md — #598 ### Fixed entry (n6).
- Six plan-run surfaces + six next/adapt SKILLs — verified in lockstep by n3 (partial-revert reds the validator) and n4 (Notice block md5-identical ×6).
- .env.example — no impact (no new env var).
- kaola-workflow/ROADMAP.md — regenerated at closure by cmdFinalize.

## Gaps found
None. n5 noted one pre-existing #584 dispatch_mode documentation gap in docs/api.md as out-of-scope (predates this issue; not a regression) — left as an observation, not a docking gap for #598.

final verdict: DOCKED
