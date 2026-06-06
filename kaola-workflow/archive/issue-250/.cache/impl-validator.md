# Node `impl-validator` evidence — issue #250 (`implementer` role, validator Sets)

## Assigned write set

1. `scripts/kaola-workflow-plan-validator.js`
2. `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js`
3. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js`
4. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js`
5. `scripts/simulate-workflow-walkthrough.js`

## RED failure (verbatim, before any validator edit)

```
Error: implementer node with code-reviewer must be in-grammar+auto-run, got: {"result":"refuse","errors":["unknown role \"implementer\" not in installed library (node impl)","read-only role implementer (node impl) declares a write set"],"planHash":"11b1c42b845d4345dfaddf85f2735319730bbd63b67cbab7a30db856f36e0fd9","sink":"done"}
    at assert (/Users/ylpromax5/Workspace/Kaola-Workflow/scripts/simulate-workflow-walkthrough.js:23:25)
    at testAdaptiveValidatorGovernance (/Users/ylpromax5/Workspace/Kaola-Workflow/scripts/simulate-workflow-walkthrough.js:876:5)
    at main (/Users/ylpromax5/Workspace/Kaola-Workflow/scripts/simulate-workflow-walkthrough.js:7500:5)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

G1 error token confirmed by probing validator with `tdd-guide` (existing IMPLEMENT_ROLE) in the same shape:
`"G1: code-reviewer does not post-dominate code-producing node(s): impl"` — `/G1/` regex matches.

## GREEN — simulate-workflow-walkthrough.js output (last lines)

```
testAdaptiveAuthoringEntryGuard: PASSED
testAdaptiveTier2Composition: PASSED
testAdaptiveAuditFixes: PASSED
testAdaptiveResumeHashDeletedTypedRefusal: PASSED
testAdaptiveValidatorNodeCap: PASSED
testAdaptiveCheapWinFixes: PASSED
testAdaptiveAuditCoverage: PASSED
testAdaptiveVerdictCheck: PASSED
testAdaptivePatternLibrary: PASSED
testAdaptiveHandoffInGrammarReady: PASSED
testAdaptiveHandoffAskFreezesNotApproval: PASSED
testAdaptiveHandoffRefuseNoMutation: PASSED
testAdaptiveHandoffIdempotentReRun: PASSED
testAdaptiveHandoffProjectFlagResolvesRepoRoot: PASSED
Workflow walkthrough simulation passed
```

Exit code: 0

## GREEN — validate-script-sync.js output

```
OK: 14 common scripts and 5 byte-identical file group in sync.
```

Exit code: 0

Byte-identity confirmed: `cmp scripts/kaola-workflow-plan-validator.js plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` → BYTE-IDENTICAL.

## Membership confirmation

`implementer ∈ CANONICAL_ROLES ∩ WRITE_ROLES ∩ IMPLEMENT_ROLES` in all 4 validator copies (root, github-plugin, gitlab-plugin, gitea-plugin).
