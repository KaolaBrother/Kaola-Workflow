# Review Fix 1 - Delegate Mixed Row Guard

Status: complete

Finding:

Under `delegation_policy: delegate`, a ledger with one `subagent-invoked` row
and one `local-fallback-explicit` row should be rejected. The first helper
version accepted it because it stopped after finding any `subagent-invoked`
row.

Fix:

- Added validator fixtures that block mixed delegate/local-explicit ledgers in
  Codex and GitLab validators.
- Tightened Codex and GitLab `delegationPolicyCompliance()` so delegate policy
  rejects `local-fallback-explicit` and permits only `subagent-invoked` plus
  evidenced `local-fallback-tool-unavailable`.

Verification:

```bash
npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab
```

Result: passed.
