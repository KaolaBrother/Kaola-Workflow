evidence-binding: n1-prose b4e69fe06021
<!-- RED: paste RED here -->
RED: scripts/test-opencode-edition.js S2 (issue #537, pre-impl, generator reverted to leaky
baseline + regenerated) — 17 failures, 261 passed, exit 1. Failing-test signatures (the
Surface-1 tier-label leak the S2 block detects): every command carrying `## Effort Variant
Resolution` tripped "Effort Variant Resolution section has no Claude-tier-name (opus/sonnet)
leak" (adapt/auto/fast/finalize/phase1-5/plan-run, 10) because the section's `mapTier` line
still read "resolves the variant: opus → top, sonnet → second."; the 5 rewrite-prose commands
(adapt/finalize/phase4/phase5/plan-run) tripped "no opus-tier/sonnet-tier leak in rewrite
prose" because the transformCommandBody replacement strings still emitted opus-tier/sonnet-tier;
and the planner tripped "workflow-planner opencodeAgentSuffix carries no Claude-tier-name
(opus/sonnet) leak" + "...names tiers by role (neutral labels)" because opencodeAgentSuffix
still emitted `{opus, sonnet}` / `opus` → / `sonnet` →. Summary line:
"opencode-edition test FAILED: 17 failure(s), 261 passed."
<!-- GREEN: paste GREEN here -->
GREEN: scripts/test-opencode-edition.js S2 passes post-impl (structurally-scoped rewrite of
OPENCODE_BADGE_BLOCK mapTier line + the 3 transformCommandBody rewrite strings +
opencodeAgentSuffix, then `node scripts/sync-opencode-edition.js --write`) — 0 S2 failures,
278 assertions, exit 0. Summary: "opencode-edition test passed (278 assertions)." Acceptance
grep on the regenerated command prose — ZERO tier-label hits:
  $ rg -wn "opus|sonnet" .opencode/command/   → exit 1 (zero word-bounded tier-label hits, PASS)
  $ rg -n  "sonnet|opus" .opencode/command/   → sole residual match is "octopus" (line 156 of
kaola-workflow-plan-run.md, the synthesizer's octopus-merge — canonical prose, a non-tier-label
substring, not a Surface-1 leak). The badge block now reads: "`mapTier(tier, provider)` resolves
the variant: the reasoning tier → the TOP effort variant, the standard tier → its SECOND."; the
planner suffix now reads: "your per-node `model` choice (the two Kaola tiers) is realized as a
reasoning-EFFORT VARIANT ... the reasoning tier → the provider's TOP effort variant, the standard
tier → its SECOND ...". Neutral labels chosen: opus(as tier label) → reasoning-tier; sonnet(as
tier label) → standard-tier. Canonical NODE_MODEL_TIERS {opus,sonnet} internal tokens untouched.
