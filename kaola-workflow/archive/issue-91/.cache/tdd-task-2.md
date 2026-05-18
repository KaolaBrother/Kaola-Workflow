# TDD Task 2 Evidence - GitLab Equivalent Policy Helper And Validator

Status: complete

## RED

Command:

```bash
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
```

Result: failed as expected.

Key failure:

```text
Error: kaola-gitlab-workflow-repair-state.js must export delegationPolicyCompliance
```

## GREEN

Implemented:

- `delegationPolicyCompliance()` in
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js`.
- Compliance ledger parsing and delegation-policy gate integration.
- Preservation of `delegation_policy:` when GitLab repair-state rewrites state.
- GitLab validator fixtures covering delegate, local-authorized,
  tool-unavailable, all-unavailable fallback, blocked local fallback under
  delegate, and blocked subagent invocation under tool-unavailable.

Command:

```bash
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
```

Result:

```text
Kaola-Workflow GitLab contract validation passed
```

## Regression Fix

The broader GitLab walkthrough initially failed at
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:252`.
The new GitLab repair-state integration was blocking legacy phase artifacts
that lacked a compliance table even when `workflow-state.md` had no
`delegation_policy:`. The fix narrows GitLab post-phase gating to the issue #91
requirement: only enforce ledger policy checks when `delegation_policy:` is
present.

Verification:

```bash
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js && node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
```

Result:

```text
GitLab workflow script tests passed
Kaola-Workflow GitLab contract validation passed
```
