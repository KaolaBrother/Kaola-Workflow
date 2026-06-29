evidence-binding: n4-review dd5cca64418b
verdict: pass
findings_blocking: 0

## Mechanical acceptance — all four chains green
`KAOLA_RUN_CHAINS_CONCURRENCY=serial npm test` — exit code 0 (captured directly: EXIT_CODE:0).
All four edition sentinels confirmed (no short-circuit — codex/gitlab/gitea each advanced past their contract validator + walkthrough):
- claude: "Workflow contract validation passed" + "Workflow walkthrough simulation passed"
- codex: "Kaola-Workflow Codex contract validation passed" + "Kaola-Workflow walkthrough simulation passed"
- gitlab: "Kaola-Workflow GitLab contract validation passed" + "GitLab workflow walkthrough simulation passed" + "GitLab Codex workflow walkthrough simulation passed"
- gitea: "Kaola-Workflow Gitea contract validation passed" + "Gitea workflow walkthrough simulation passed" + "Gitea Codex workflow walkthrough simulation passed"
Opencode: `node scripts/test-opencode-edition.js` -> "opencode-edition test passed (494 assertions)" (OPENCODE_EXIT_CODE:0). Not the 6-failure worktree-env hooks artifact — fully green.

## Code-quality review (zero findings: CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0)
- PROVENANCE_BAN regex identical across all 5 guard sites: /#\d{1,4}|D-\d{3}-\d{2}|\bINV-\d+|ADR[ -]\d{2,4}|\b(?:PR|MR|AC)#\d+/. Each arm covers its class with no cross-class false-negative.
- Byte-mirror pair (scripts/validate-workflow-contracts.js vs plugins/kaola-workflow/scripts/validate-workflow-contracts.js): BYTE_IDENTICAL. Three workflow-planner.toml (codex/gitlab/gitea): BYTE_IDENTICAL.
- Surface coverage per edition correct: claude scans agents/*.md+commands/*.md; codex scans plugins/kaola-workflow agents/*.toml+skills (no commands/ dir); gitlab/gitea reuse pre-existing agentFiles+commandFiles+skillFiles; codex validator mirrors existing PHASE_NUMBER_BAN loop shape; gitlab/gitea integration is cleanest (no redundant enumeration).
- Error message at all 5 sites: `<rel>:<line>: PROVENANCE_BAN — provenance token "<tok>" must not appear in agent-facing prompt surfaces; see docs/conventions.md` — actionable (file:line + token + pointer).
- Strip edits: grep `#[0-9]` across all scanned prompt-surface dirs -> 0 matches. INV-17->validator-derived reads naturally (parallel_safe is validator-derived). #42/#47/#53->#N and #142->#<N> placeholders read naturally. KAOLA_TARGET_ISSUES=42,47,53 shell-var example preserved (runtime var, no # prefix). No functional token / route-wiring string / env var removed; no rule altered.
- A25 assertions non-tautological: 7 positive (all 5 banned classes incl. ADR 0005 + ADR-0005) + 10 negative (#N/#<issue>/#<n>/KAOLA_TARGET_ISSUE=N/--target-issue <N>/Closes #<issue>/G1/G3/AC7/M4). AC7 negative correct (\b(?:PR|MR|AC)#\d+ requires the #). Surface scan uses sync.OUT_AGENT_DIR + sync.OUT_COMMAND_DIR (correct generated mirror paths).
- Docs: docs/conventions.md enforcement subsection accurate (full regex, per-edition table, corrected allowlist, PR#/MR#/AC# ban row); docs/decisions/D-576-01.md consistent with existing records.

Verdict: APPROVE — zero findings; all four edition chains green; opencode 494 green; PROVENANCE_BAN blocks correct and structurally clean across all five guard sites.
