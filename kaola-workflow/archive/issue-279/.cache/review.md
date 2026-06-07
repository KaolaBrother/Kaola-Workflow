# Node review — #279 adaptive verdict-gate hardening (code-reviewer, G1)
APPROVE. All 6 focus points empirically verified against origin/main (13 files):
- schema parseNodeFindings (col-0 anchor, absent=>[], keys lowercased, first-value-wins) + unresolvedInScopeFixes (fail-closed on status: missing=>open=>blocks; resolved/deferred pass; severity-agnostic; explicit in_scope/fix) — correct.
- validator verifyVerdictBlock hardened in BOTH fanout + sequence paths; verdict:pass + unresolved in-scope fix => ok:false; absent findings => pass (backward-compatible; #251 tests still green).
- cross-edition: validate-script-sync exit 0; 4 schema copies byte-identical; root==plugin validator; gitlab/gitea ports carry identical #279 logic.
- tests: AC1 (per-node pure), AC3 (out_of_scope non-blocking), AC6 (WHOLE-PLAN --verdict-check CLI exit 1 on a complete review node + resolved negative control exit 0) — AC6 exercises the real finalize gate.
- routing prose: ## Repair routing section byte-identical across 4 docs; accurate to mechanism; additive (no concept tokens removed).
- regression: npm test GREEN across all 4 editions (Claude/Codex/GitLab/Gitea walkthroughs + contracts + vendored-agents 13 + validate-script-sync).
AC mapping: all 6 acceptance criteria satisfied.
Non-blocking LOW (out_of_scope follow-up): parseNodeFindings lowercases keys not values, so a mis-cased scope=In_Scope fails open; spec-compliant (predicate requires explicit in_scope/fix) — future hardening only.

verdict: pass
findings_blocking: 0
finding: id=R1 scope=out_of_scope action=follow_up status=open severity=low fix_role=none rationale=parseNodeFindings lowercases keys not values so mis-cased scope/action values fail open; spec-compliant explicit-match but a future hardening item to align with parseNodeVerdict value-lowercasing
