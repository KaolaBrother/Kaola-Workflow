# Node implement (tdd-guide) — issue #289 fail-open fix

## Bug
parseNodeFindings lowercased finding KEYS but not VALUES, so a mis-cased finding
`scope=In_Scope action=Fix status=Open` parsed but did NOT match unresolvedInScopeFixes
(exact-lowercase predicate) => --verdict-check passed when it should BLOCK (fail-open).

## RED
Failing-first regression added to testAdaptiveVerdictCheck (#279 unresolvedInScopeFixes block),
after "low severity still blocks":
  assert(unresolvedInScopeFixes(parseNodeFindings('finding: id=R7 scope=In_Scope action=Fix status=Open\n')).length === 1,
    'unresolvedInScopeFixes: mixed-case scope/action/status still blocks (#289 fail-open fix)')
Pre-fix proof: node -e ... -> 0 (FAIL-OPEN, expected 1); walkthrough threw on this assertion.

## GREEN
Fix: added GATE_RELEVANT_FINDING_KEYS = Object.freeze(new Set(['scope','action','status','fix_role']));
at the single value-assignment site, lowercase the value only when key is gate-relevant:
  finding[key] = GATE_RELEVANT_FINDING_KEYS.has(key) ? tok.slice(eq+1).toLowerCase() : tok.slice(eq+1);
Doc comment updated. Case-normalization ONLY (no fail-closed expansion — out of scope per issue).
Applied byte-identically to all 4 adaptive-schema copies.

Verification:
- npm test => exit 0 (supersets walkthrough + 4-edition validate-script-sync byte-identity + forge contract validators).
- node scripts/simulate-workflow-walkthrough.js => "Workflow walkthrough simulation passed".
- md5 of 4 schema copies all == 6206e9bb89cb9bb2c268c8fbc8d49503 (was 446055911d5e90a57b7148c93df01061).

## Files changed (declared write-set, 5)
- scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- scripts/simulate-workflow-walkthrough.js
