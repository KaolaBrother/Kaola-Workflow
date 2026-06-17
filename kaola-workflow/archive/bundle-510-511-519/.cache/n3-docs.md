evidence-binding: n3-docs 87e619bef729

Documented the gh-fetch error-class axis change (bundle #510/#511/#519):

1. CHANGELOG.md — prepended three `### Fixed` entries under `## [Unreleased]` (before the existing #508 entry):
   - #519: headline axis fix — stderr error-class partition replacing process-exit-code at all 4 sites ×4 editions; `probeIssueState` additive `transient:true` discriminant; transient→escalate / genuine-negative→refuse / unrecognized-clean-nonzero→refuse. Points to `docs/decisions/D-519-01.md`.
   - #510: forge `_st`-guard parity — exit-0-with-malformed-body now returns `indeterminate` (not `target_unavailable`) in the gitlab/gitea classifiers, mirroring root's `JSON.parse` SyntaxError path.
   - #511: forge determinate-refuse test-pin — gitlab+gitea claim-flow tests updated to stub a genuine-negative stderr (real "Could not resolve to an Issue" / 404) rather than a generic "gh exits 1".

2. docs/decisions/D-519-01.md (new) — decision record using the standard template. Covers:
   - Context: the live kaolaGIT false-negative (transient TLS fault → `target_unavailable` → aborted claim on a claimable issue); why exit code is the wrong discriminant.
   - Decision: axis replacement (transient-infra→escalate / genuine-negative→refuse / unrecognized-clean-nonzero→refuse by default); the non-breaking `probeIssueState` additive `transient:true` discriminant; the #510 forge `_st`-guard parity fix; the #511 test-pin.
   - Implementation: all four sites, all four editions.
   - Consequences and three recorded known-limitations: F1 (unrecognized transient patterns default to refuse — widening is additive), F2 (stale test comment in gitlab #510 test — cosmetic), F3 (forge `probeIssueState` malformed-non-empty exit-0 stays `unverified`→refuse — a narrow #307 divergence, both editions fail-closed, not a real forge-CLI failure mode).
