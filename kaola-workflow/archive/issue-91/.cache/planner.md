# Planner Notes - issue-91

Status: local-fallback-tool-unavailable

The named workflow role `planner` is not available as a callable Codex subagent
role in this session, so strategy analysis was performed locally under
`delegation_policy: tool-unavailable`.

## Options

### Option A: Static validator-only text assertions

Add assertions that skill files mention `delegation_policy` and that advisor
rows remain `invoked`.

Pros:

- Minimal change.
- Low implementation risk.

Cons:

- Does not actually validate phase artifacts against workflow state.
- Does not satisfy the issue's "reads `delegation_policy:` from
  `workflow-state.md`" intent.

### Option B: Repair-state post-phase check plus validator fixtures

Teach repair-state to read `delegation_policy:` from state content and add a
delegation-policy compliance gate when crossing phase boundaries. Export the
helper and assert it with synthetic state/phase content in the Codex and GitLab
validators.

Pros:

- Enforces the policy where phase artifacts are already parsed.
- Gives validators direct, deterministic coverage without depending on live
  active workflow folders.
- Preserves the current distinction between Codex role rows and non-role
  workflow gates.

Cons:

- Requires synchronized root/plugin repair-state edits.
- GitLab repair-state needs a matching helper even though its current router is
  simpler.

### Option C: Rewrite all rows to delegation vocabulary

Convert advisor and finalize non-doc rows from `invoked` to typed delegation
statuses.

Pros:

- Single status vocabulary everywhere.

Cons:

- Incorrectly treats advisor/final validation/roadmap/archive/commit gates as
  Codex role delegation.
- Expands scope across command docs and phase examples.

## Recommendation

Use Option B. It implements the runtime post-phase check, keeps validators as
the executable contract, and avoids conflating non-role workflow gates with
delegated Codex roles.
