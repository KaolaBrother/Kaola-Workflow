# implement node evidence — issue #271

## RED evidence (before fix)

Tests added to `scripts/simulate-workflow-walkthrough.js`:
- AC#1: `#271 AC#1: duplicate group name with different classifiers must refuse with G-SEL-1 duplicate-group message`
- AC#2: `#271 AC#2: duplicate group name with same classifier and overlapping write sets must refuse via G-SEL-4`
- AC#3: Existing single-group `select(fix)` coverage from #263/#267 remains as-is (untouched)

Running `node scripts/simulate-workflow-walkthrough.js` BEFORE the validator fix produced:

```
Error: #271 AC#1: duplicate group name with different classifiers must refuse with G-SEL-1 duplicate-group message, got: {"result":"refuse","errors":["select group \"fix\" arms name conflicting selector_source(s): classify1, classify2","select group \"fix\" arms have overlapping write sets (coarse-area overlap at \"src\" between nodes 0 and 1)"],"planHash":"1cc424eb212098b1f4d85bf95c3582c36a36040d3afa1bdd851cdd4579d30558","sink":"done"}
    at assert (.../scripts/simulate-workflow-walkthrough.js:23:25)
    at testAdaptivePatternLibrary (.../scripts/simulate-workflow-walkthrough.js:6915:7)
```

Exit code: non-zero (process terminated with Error).

Explanation: The validator was already refusing AC#1 (because G-SEL-1b fires on `srcs.size > 1`), but with the wrong message: "conflicting selector_source(s): classify1, classify2" instead of the new "G-SEL-1: select group name "fix" used by arms with different selector_source nodes; use distinct group names for independent groups". The test regex did not match, so AC#1 failed RED as required.

## AC#2 structural note

AC#2 ("two select(fix) groups with the SAME classifier node is a typed refusal") is structurally infeasible as a NEW refusal under option 1. When two independent select groups share the same name AND the same classifier node, they are indistinguishable from one valid N-arm group — there is no signal the pre-pass can use to detect them as separate groups. This mirrors the `#244 AC#3 unreachable` precedent in project memory.

AC#2's fixture (arm-a/arm-c sharing `src/shared.js`) refuses via the pre-existing G-SEL-4 rule (overlapping write sets). A same-classifier duplicate with fully disjoint writes across non-overlapping top-level directories validates in-grammar (verified: result = "in-grammar"). The test exercises G-SEL-4 coverage under the #271 rubric, not a new #271-caused refusal. This is documented in the test comment. The test assertion was updated to match the actual governing error ("overlapping write sets") rather than a generic `result === 'refuse'`.

## GREEN evidence (after fix)

Four files edited with identical additive pre-pass logic inserted before the `// --- #263 G-SEL` block:

1. `scripts/kaola-workflow-plan-validator.js`
2. `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` — byte-identical to #1 (verified: `diff` reports "IDENTICAL")
3. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js`
4. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js`

The pre-pass collects `Set<selectorSource>` per group name; if size > 1, pushes:
```
G-SEL-1: select group name "${grp.label}" used by arms with different selector_source nodes; use distinct group names for independent groups
```

This is purely additive: the existing G-SEL-1b ("conflicting selector_source(s)") and G-SEL-4 checks are untouched.

Running `node scripts/simulate-workflow-walkthrough.js` AFTER the fix:

```
testAdaptivePatternLibrary: PASSED
testAdaptiveHandoffInGrammarReady: PASSED
testAdaptiveHandoffAskFreezesNotApproval: PASSED
testAdaptiveHandoffRefuseNoMutation: PASSED
testAdaptiveHandoffIdempotentReRun: PASSED
testAdaptiveHandoffProjectFlagResolvesRepoRoot: PASSED
Workflow walkthrough simulation passed
```

Exit code: 0

Running `npm test` AFTER the fix — all four suites pass:

- `test:kaola-workflow:claude` — includes validate-script-sync.js: "OK: 14 common scripts and 5 byte-identical file group in sync"; simulate-workflow-walkthrough.js: "Workflow walkthrough simulation passed"
- `test:kaola-workflow:codex` — "Kaola-Workflow walkthrough simulation passed"
- `test:kaola-workflow:gitlab` — "GitLab workflow walkthrough simulation passed"
- `test:kaola-workflow:gitea` — "Gitea workflow walkthrough simulation passed"

npm test exit code: 0 (captured directly, not via tail)

## AC checklist

- [x] AC#1: two independent `select(fix)` groups with DIFFERENT classifiers refuse with the new G-SEL-1 message — RED→GREEN confirmed
- [x] AC#2: two `select(fix)` groups with SAME classifier + overlapping write sets refuse via G-SEL-4; same-classifier + disjoint-writes case is structurally undetectable under option 1 (documented above)
- [x] AC#3: existing single-group select() coverage from #263/#267 still passes — `testAdaptivePatternLibrary: PASSED`
- [x] AC#4: `npm test` exits 0; byte-identity enforced by validate-script-sync.js (5 byte-identical file group confirmed)
