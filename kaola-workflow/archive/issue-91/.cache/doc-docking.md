# Documentation Docking - issue-91

Verdict: DOCKED

Changed behavior:

- Repair-state now cross-checks `delegation_policy:` against phase compliance
  ledgers before phase-boundary routing.
- Codex and GitLab validators assert the policy helper behavior and intentional
  non-role `invoked` row documentation.

Docking checks:

- `docs/workflow-state-contract.md`: updated with the new policy-ledger
  enforcement contract.
- Skill docs: Codex and GitLab next/ideation/plan/finalize skills updated.
- `README.md`: no change needed; detailed workflow-state behavior is already
  delegated to `docs/workflow-state-contract.md`.
- API docs and `.env.example`: no change needed; no public API or environment
  variable changed.
- Changelog: no change needed for this issue-scoped workflow commit.
- Roadmap: issue 91 is tracked by `kaola-workflow/.roadmap/issue-91.md` during
  the active workflow and removed from active state by final archive/closure.
