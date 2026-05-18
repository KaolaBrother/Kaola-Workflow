# Doc Updater - issue-91

Status: local-fallback-tool-unavailable

The named workflow role `doc-updater` is not available as a callable Codex
subagent role in this session, so documentation update review was performed
locally under `delegation_policy: tool-unavailable`.

Documentation updated:

- `docs/workflow-state-contract.md` now records the policy-ledger enforcement
  contract when `delegation_policy:` is present.
- Codex and GitLab next skills now document resume extraction of
  `delegation_policy:`.
- Codex and GitLab ideation/plan/finalize skills now explain intentional plain
  `invoked` rows for non-Codex-role workflow gates.

No README, API, setup, environment, or changelog updates are required because
the user-facing contract is covered by the workflow-state contract document and
skill docs.
