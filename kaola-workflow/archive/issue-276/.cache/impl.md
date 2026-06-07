# Node impl evidence — issue #276 (tdd-guide)

## RED
With `norm` defined but NOT yet wired into the helpers, the new test
`testContractValidatorReflowTolerant` FAILED: the line-wrapped fixture
("halt for\n   consent") made `assertConcept` throw because raw substring
matching could not find "halt for consent" across the newline + indentation:
  Error: testContractValidatorReflowTolerant: assertConcept must NOT throw for a
  line-wrapped phrase (norm should collapse whitespace)
  at scripts/simulate-workflow-walkthrough.js (testContractValidatorReflowTolerant)

## GREEN
After wiring `norm()` into assertConcept/assertIncludes/assertBefore, the same
test PASSES: "testContractValidatorReflowTolerant: PASSED". The absent-phrase
fixture B still throws (assertConcept did not become always-pass).

## Changes (6 declared files only)
1. scripts/validate-workflow-contracts.js — add `norm` (collapse \s+ -> ' '),
   wire into assertIncludes/assertConcept/assertBefore; add
   `if (require.main !== module){ module.exports={norm,assertIncludes,assertConcept,assertBefore}; return; }`
   guard/export after helper defs; assertNotIncludes unchanged.
2. plugins/kaola-workflow/scripts/validate-workflow-contracts.js — byte-identical
   cp of #1 (cmp confirms IDENTICAL; validate-script-sync green).
3. scripts/validate-kaola-workflow-contracts.js — norm in assertIncludes +
   assertConcept (no assertBefore present); no guard/export.
4. plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js — norm in all 3 helpers.
5. plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js — norm in all 3 helpers.
6. scripts/simulate-workflow-walkthrough.js — add testContractValidatorReflowTolerant
   (mkdtempSync under repo root; path.relative needle; fixture A line-wrapped -> no throw;
   fixture B removed -> throws; cleanup in finally) + registered in run list.

## Acceptance (all real exit 0)
- node scripts/simulate-workflow-walkthrough.js -> "Workflow walkthrough simulation passed"
- node scripts/validate-workflow-contracts.js -> "Workflow contract validation passed"
- node scripts/validate-script-sync.js -> "OK: 15 common scripts and 5 byte-identical file group in sync."
- node scripts/validate-kaola-workflow-contracts.js -> "Kaola-Workflow Codex contract validation passed"
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js -> green
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js -> green
- npm test (4 editions) -> green (independently re-run by orchestrator)

## Write-set containment
git diff --name-only == exactly the 6 declared files (orchestrator-verified).
