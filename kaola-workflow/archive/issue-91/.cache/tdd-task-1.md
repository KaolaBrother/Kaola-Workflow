# TDD Task 1 Evidence - Codex Policy Helper And Validator

Status: complete

## RED

Command:

```bash
node scripts/validate-kaola-workflow-contracts.js
```

Result: failed as expected.

Key failure:

```text
Error: kaola-workflow-repair-state.js must export delegationPolicyCompliance
```

## GREEN

Implemented:

- `delegationPolicyCompliance()` in `scripts/kaola-workflow-repair-state.js`.
- Boundary gating through `unresolvedCompliance()`.
- Preservation of `delegation_policy:` when state is repaired.
- `require.main === module` guard and helper exports.
- Byte-identical mirror in
  `plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js`.
- Codex validator fixtures for delegate, local-authorized, tool-unavailable,
  all-unavailable fallback, blocked local fallback under delegate, and blocked
  subagent invocation under tool-unavailable.

Command:

```bash
node scripts/validate-kaola-workflow-contracts.js
```

Result:

```text
Kaola-Workflow Codex contract validation passed
```
