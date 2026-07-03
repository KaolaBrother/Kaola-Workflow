evidence-binding: n4-remediation-review d5bd5f0a9ce0
# n4-remediation-review — code-reviewer gate (opus) over n3-remediation-reorder (issue-601 lane)

Scope reviewed: the 19 n3 files vs merge-base with main (installer byte-group ×3, preflight byte-group ×4, 3 pinning suites, README.md, docs/api.md, 6 workflow-init surfaces, install-opencode.sh).

verdict: pass
findings_blocking: 0

finding: id=R1 scope=in_scope action=fix status=resolved severity=high fix_role=implementer rationale=install-opencode.sh:84 usage heredoc still listed retired auto command contradicting the fixed header comment at 28-29 and the ADAPTIVE_CORE_COMMANDS array at 149-152 resolution=fixed one-line at the finalize seam (Trivial Inline Edit Exception; between windows, after this gate closed, before n5 baseline; file is in n3's frozen write set) — usage heredoc now lists the 5 adaptive-core commands; verified by grep sweep (no stale retired-command refs remain) + node scripts/test-opencode-edition.js real exit 0 (499 assertions)

## Findings

[HIGH → RESOLVED] R1 — Ride-along incomplete: stale `auto` reference remained in install-opencode.sh:83-84 usage() heredoc ("adapt, auto, finalize, plan-run, workflow-init, workflow-next") while the header comment (28-29) and ADAPTIVE_CORE_COMMANDS (149-152) said 5 files without auto. Help-text only (no behavior impact). RESOLVED: one-line edit removing `auto` from the heredoc, applied between windows at the finalize seam under the Trivial Inline Edit Exception (target file within n3's declared write set → whole-plan barrier allowlist); re-verified with a grep sweep (remaining `auto` hits are the legitimate parallel_mode config value) and `node scripts/test-opencode-edition.js` exit 0 (499 assertions). Recorded in finalization-summary.md.

## Verified clean (adversarial)

1. Behavior preservation: dispatchPostureRemediation + deriveDispatchPosture read in full (preflight.js:294-326); only the two string literals reordered, posture-derivation logic byte-unchanged; REPORT/WARN stays non-fatal; proactive still returns null (unit-asserted).
2. Byte-groups: preflight ×4 identical (c9a7fe81…), installer ×3 identical (a274ce8c…); validate-script-sync.js OK.
3. Retained pins: suite diffs purely additive (zero '-' lines); model_reasoning_effort = "ultra", codex -c model_reasoning_effort=ultra, 0.142.5, proactive-suppresses-remediation all survive.
4. Order assertions RED-first: indexOf(ask) < indexOf(ultra) on fresh non-proactive stdout; old wording led with ultra → genuinely fails on old wording; targets unambiguous; matches each suite's assert style.
5. Prose consistency: README + docs/api.md + all 6 workflow-init surfaces carry the reordered/qualified message; command↔SKILL pairs consistent; no issue refs / decision IDs / ADR citations introduced.
6. Suites: all three run from the worktree, real exit 0 (claude, gitlab, gitea sentinels confirmed). Binding four-chain receipt over the branch (incl. the R1 fix in its workTreeHash): all four chains exit 0.
