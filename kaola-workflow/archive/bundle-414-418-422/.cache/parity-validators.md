a603a8f9310c
evidence-binding: parity-validators a603a8f9310c
non_tdd_reason: contract-assert wiring + chain plumbing; the behavior is proven by parity-anchor's RED fixture, not a new unit here
regression-green: all 4 validators pass; byte-pair identical

## Task
parity-validators node for issues #418.2 and #422.3 in bundle-414-418-422.

## Changes

### package.json — test:kaola-workflow:claude chain
- #418.2: inserted `&& node scripts/test-parallel.js --self-test` after `node scripts/test-parallel-batch.js`
- #422.3: inserted `&& node scripts/test-agent-profile-parity.js` before `node scripts/validate-workflow-contracts.js`

### scripts/validate-workflow-contracts.js (+ byte-pair copy)
- #422.3: inserted block before final console.log that asserts `test-agent-profile-parity.js` is in the claude chain; reuses existing `packageJson` binding

### scripts/validate-kaola-workflow-contracts.js
- #422.3: inserted block before final console.log; parses package.json via read()

### plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- #422.3: same block as codex

### plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- #422.3: same block as codex

## Verification

Baseline (before): node scripts/validate-workflow-contracts.js → EXIT:0

After all edits:

1. node scripts/validate-workflow-contracts.js → EXIT:0 — "Workflow contract validation passed"
2. node scripts/validate-kaola-workflow-contracts.js → EXIT:0 — "Kaola-Workflow Codex contract validation passed"
3. node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js → EXIT:0 — "Kaola-Workflow GitLab contract validation passed"
4. node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js → EXIT:0 — "Kaola-Workflow Gitea contract validation passed"
5. md5 scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js
   MD5 both = 6814172183407d370eea7f92e474cff4 (IDENTICAL)

verification_tier: regression-green
regression-green: all verified
