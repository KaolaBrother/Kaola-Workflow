evidence-binding: n5-finalize f174c800bcd0

# n5-finalize — sink node (main-session-direct)

compliance: main-session-direct

## Work performed

1. CHANGELOG.md: added the `## [Unreleased]` block with the two bundle entries — `### Fixed` #600 (synthesizer added to `REQUIRED_AGENTS` in install.sh + uninstall.sh; 15-role roster; RED-first roster + manifest→opus assertions in scripts/test-install-model-rendering.js) and `### Changed` #601 (dispatch-posture remediation reordered to lead with the in-session explicit ask; ultra route second, qualified undocumented/server-gated; installer ×3 + preflight ×4 byte-groups, README, docs/api.md, 6 workflow-init surfaces; install-opencode.sh ride-along). Written BEFORE the binding chain run (receipt-freshness discipline).

2. Trivial Inline Edit Exception (recorded): the n4 gate surfaced R1 (HIGH, in_scope, action=fix) — install-opencode.sh:83-84 usage heredoc still listed the retired `auto` command ("6 files"). Fixed as a one-line edit applied BETWEEN windows (after n4's close, before n5's baseline snapshot); the target file is in n3-remediation-reorder's frozen declared write set, so the whole-plan barrier allowlist covers it. Verified: `node scripts/test-opencode-edition.js` real exit 0 (499 assertions); no other stale retired-command references remain in the file (grep-swept; remaining `auto` hits are the legitimate `parallel_mode: 'auto'` config value).

## Validation (binding receipt)

All four chains green, run serially via `KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --project bundle-600-601` from the worktree:
- claude exit 0 (821s), codex exit 0 (18s), gitlab exit 0 (219s), gitea exit 0 (223s); accepted_red: none.
- Receipt: kaola-workflow/bundle-600-601/.cache/chain-receipt.json, headSha 7f9e0e6316c7ce46ae1f660d192cacd49326ded0, completedAt 2026-07-03T03:04:21Z; workTreeHash covers the uncommitted CHANGELOG + R1 working-tree state.
- Opencode edition (D-530-02 additive, outside the four chains): test-opencode-edition.js exit 0 (499 assertions) after the R1 fix.
- Earlier advisory codex chain over the branch: exit 0 (superseded by the binding receipt above).

## Gate verdicts

- n2-synth-review (sonnet): verdict pass, findings_blocking 0 (one LOW: default_agent_model() lacks a synthesizer arm — inert, follow-up candidate).
- n4-remediation-review (opus): verdict pass, findings_blocking 0 (R1 fixed as above).

verdict: pass
