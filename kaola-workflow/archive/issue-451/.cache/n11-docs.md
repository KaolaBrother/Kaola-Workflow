evidence-binding: n11-docs 23bf2b8e2a00

DOCKED — documentation reflects the #451 code change; no stale `-max`/per-role-effort claims remain.

non_tdd_reason: Pure documentation node — transcribes the #451 mechanism (verified against the actual code: dispatchEffort/buildDispatch wiring, the optional-effort validateProfileText, the deletions) into the durable docs. No fabricated API/schema; every claim traces to real code or the settled design.

verification_tier: regression-green (the 3 contract validators that READ README — role-list block + retired-role guard — pass exit 0 after the effort-table removal; doc residual scan clean across all 7 files).

Changed docs:
- README.md: replaced the per-role `| Role | Reasoning effort |` table + the `<role>-max` dispatch sentence with the session-effort-inheritance model (base profiles omit effort; opus raises the session to xhigh before dispatch; `<role>-max` retired, points to D-451-01). The Codex role-LIST block (the validator's set-equality contract) is untouched and still passes.
- docs/api.md: (1) #382 per-node-tier clause — Codex `opus` now raises the session effort, not selects `<role>-max`; (2) the `agents/contractor.toml` profile note — base profiles omit `model_reasoning_effort` (#451); (3) the codex-preflight schema bullet — `model_reasoning_effort` now OPTIONAL.
- docs/architecture.md: (1) preflight gate schema desc — effort now optional; (2) the agent roster line — "14 base + 6 -max (20 files, 20 triples)" -> "14 base (14 files, 14 triples); the 6 -max variants retired in #451".
- 3 `kaola-workflow-adapt/SKILL.md`: the stale "(on Codex, the role's `model_reasoning_effort` profile tier)" fallback line -> "the parent session's reasoning effort — base profiles omit a pinned effort and inherit the session, #451".
- docs/decisions/D-451-01.md (NEW): the ADR — AC6 docs-based feasibility proof (Codex 0.139 mechanism #2 + PR #14807, version-pinned, no live observation required), the AC4 deviation (D1: base profiles carry no tuned effort), the descriptor/agent_type design (D2/D3), the SKILL application (D4), the deletion (D5), AND the known session-effort-persistence tradeoff the G1 reviewer flagged (sonnet-after-opus inherits xhigh — the "don't raise" semantic, intended for v1, follow-up territory).

write_set: docs/decisions/D-451-01.md, README.md, docs/api.md, docs/architecture.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md
