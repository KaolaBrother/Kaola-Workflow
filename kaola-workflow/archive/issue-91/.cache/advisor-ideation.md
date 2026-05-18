# Advisor Ideation Gate - issue-91

Verdict: choose Option B.

The issue asks for an assertion or post-phase check that reads
`delegation_policy:` and compares it with phase ledger rows. Static text checks
alone are too weak because they cannot catch a malformed artifact. Rewriting all
`invoked` rows is also too broad because advisor, final validation,
documentation docking, roadmap refresh, archive, and commit rows are workflow
gates rather than Codex role delegation.

Hidden risk:

- A strict "at least one matching row" rule can falsely fail phases whose only
  delegable row is legitimately `N/A`, such as `doc-updater` when no
  documentation changes are needed. The policy helper should check known
  delegable rows, ignore intentional non-role `invoked` rows, and allow all
  delegable rows to be `N/A` only when evidence or skip reason is present.

Scope control:

- Do not modify `validate-workflow-contracts.js`; it is explicitly out of
  scope and byte-sync sensitive.
- Keep GitHub and GitLab Codex plugin behavior parallel.
