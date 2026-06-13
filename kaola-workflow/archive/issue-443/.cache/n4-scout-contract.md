evidence-binding: n4-scout-contract 47f89c4b8b6e

non_tdd_reason: Glue/wiring — adds a new output-contract shape to an agent prose doc + its three byte-identical TOML mirrors. No behavioral logic; declarative agent-instruction text wiring the scout's empty-backlog signal to the autopilot's `stop: backlog_empty`. No script parses the md/toml at runtime → no natural failing unit test.

verification_tier: build-green

MD edit (agents/issue-scout.md): added "### Empty-Backlog Alternative Shape" after the Output Format section — documents when it fires (full survey finds no claimable/unblocked same-scope bundle; all open issues claimed/red/externally-blocked, or backlog empty), the exact shape `{ "backlog_empty": true, "recommended_bundle": null }` (recommended_bundle null, not omitted), the negative guard (not merely low confidence), and the downstream effect (autopilot emits stop: backlog_empty).

TOML edit (plugins/*/agents/issue-scout.toml): one bullet added to the Output contract block in developer_instructions, edition-neutral, forge-neutral (no forge CLI/brand). Edited canonical then cp'd verbatim to the other two.

Pairwise byte-identity:
- cmp github==gitlab: IDENTICAL
- cmp github==gitea: IDENTICAL

Forbidden-token check:
- gitlab validate --forbidden-only issue-scout.toml → passed (1 file), exit 0
- gitea  validate --forbidden-only issue-scout.toml → passed (1 file), exit 0

build-green — agent-profile parity:
- `node scripts/test-agent-profile-parity.js` → "agent-profile parity tests passed (9 assertions)", exit 0
- baseline simulate-workflow-walkthrough.js green pre-change (walkthrough does not exercise agent md content).

write_set (exactly the four declared): agents/issue-scout.md + plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/agents/issue-scout.toml. No out-of-lane writes.
