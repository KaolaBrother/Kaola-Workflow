evidence-binding: n3-609-review 6b84816d33c2
verdict: pass
findings_blocking: 0

## Gate scope
Post-dominates n1-b2-prose + n2-opencode-sync (#609 legs), reconciliation checkpoint before the #610 phase rewords these surfaces. Lean scope — n8 owns the four chains.

## Independent verification (not just re-run)
- B2 purge complete: grep over all 3 codex trees' agents/*.toml + config/agents.toml + skills/*/SKILL.md → 9 survivors, every one a legitimate B1 rank token ({opus|sonnet} set literal or model: opus/sonnet effort map). haiku + "opus ~= 5x sonnet" gone.
- Matcher sound: standalone probe TRIPS on every old B2 shape incl. the **Opus**-floor bold evasion + "on Sonnet"/possessive via word boundaries; CLEAN on all B1 forms. Codex validator (scrub + case-insensitive) is byte-identical claude/codex twin; gitlab/gitea twins reuse correct per-edition agentFiles/skillFiles.
- Prose correct vs code: reasoning→xhigh / standard→high matches dispatchEffort() in adaptive-schema.js:58-67 exactly.
- workflow-init constraint present on all 6 surfaces, inside the KW-CLAUDE-TEMPLATE region, byte-parity holds; codex validator initFiles spans all six.
- n2's 9 exact-phrase regexes: mapped all 11 canonical capitalized B2 sites; post-sync capitalized sweep of the whole .opencode agent+command tree = 0 matches; idempotent by construction. Lowercase B1 in workflow-planner.md body is the intended exemption, deferred to #610/n5.
- n1's boundary call ("pass the role's configured model" init line left unchanged) — agreed: it names no vendor model and diverging would break template byte-parity.

## Gates run (all green)
- node scripts/validate-workflow-contracts.js → pass
- node scripts/validate-kaola-workflow-contracts.js → pass
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js → pass
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js → pass
- node scripts/test-route-reachability.js → passed (257 assertions)
- node scripts/sync-opencode-edition.js --write + node scripts/test-opencode-edition.js → passed (499 assertions)

No four-chain run here (n8 owns the #307 obligation). APPROVE — ready for the #610 phase (n4/n5).
