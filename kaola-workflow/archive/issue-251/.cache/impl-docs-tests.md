# Node: impl-docs-tests — RED→GREEN evidence

## Part A: doc-honesty rewrites

### RED (before edits — old fictional claims present)

```
validateNodeOutput as load-bearing claim count per file:
commands/kaola-workflow-plan-run.md:2
plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md:2
plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md:2
plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md:2

script-decidable count:
commands/kaola-workflow-plan-run.md:1
plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md:1
plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md:1
(SKILL.md: 0 — uses "dry_streak convergence cap" but not "script-decidable")
```

### GREEN (after edits — old load-bearing claims removed, honest wording present)

```
validateNodeOutput as load-bearing claim: 0 in all 4 files
validateNodeOutput debunked reference present: 1 in all 4 files
  (text: "there is no `validateNodeOutput()` script; that schema checkpoint was never script-enforced")
script-decidable count: 0 in all 4 files

New honest wording confirmed present in all 4 files:
- verdict-check  (all 4)
- tally arithmetic is prose  (all 4)
- agent-tracked dry_streak  (all 4)
```

Three claims reworded per §7 (all 4 files — root, SKILL.md, gitea, gitlab):
1. Enforcement-boundary tail: --verdict-check (#251) now script-enforces the reviewer/skeptic verdict; quorum tally count and dry_streak counting remain agent-discipline.
2. Quorum/decision-node paragraph: each child verdict is a `verdict: pass|fail` block in `.cache`, mechanically checked by --verdict-check; no `validateNodeOutput()` script — that checkpoint was never script-enforced; tally arithmetic is prose.
3. dry_streak/loop paragraph: terminates on static LOOP_CAP (script-enforced) plus an agent-tracked dry_streak; only LOOP_CAP is validator-enforced.

gitlab "step 4 above" preserved (not in the replaced text regions).

Contract validators (root, codex plugin, gitea, gitlab): all require `validateNodeOutput` token.
Strategy: token retained as explicit debunked reference — "there is no `validateNodeOutput()` script" — in all 4 doc files. Contract satisfied without modifying any validator (out-of-lane edits avoided).

## Part B: testAdaptiveVerdictCheck

### Mutation RED (teeth proof)

Mutated verifyVerdictBlock checkOne to always return ok:true (fail-open).

Test assertion: `result.ok === false` for a `verdict: fail / findings_blocking: 3` cache.

Mutated result: `ok: true` (mutation bypasses the assertion) → test WOULD FAIL → mutation has teeth.

Evidence:
```
Mutated result ok: true
Failures: []
Test WOULD FAIL against mutation: YES - mutation has teeth
```

### In-suite GREEN

`testAdaptiveVerdictCheck: PASSED` printed in walkthrough output.

```
testAdaptiveVerdictCheck: PASSED
Workflow walkthrough simulation passed
```

Cases covered:
1. parseNodeVerdict pure: pass; fail/3; missing→found:false; malformed(maybe)→found:true/verdict:null; indented→found:false (col-0 anchor)
2. verifyVerdictBlock pure (injected readCache/globCache):
   - gate role pass → ok:true
   - gate role fail → ok:false/failures.length===1
   - missing cache → ok:false/found:false
   - findings_blocking>0 with verdict:pass → ok:false
   - non-gate role self-skip → ok:true/found:false
   - fanout 1/3 refute (minority) → ok:true
   - fanout 2/3 refute (majority) → ok:false/reason contains "majority-refute"
3. --verdict-check CLI per temp .cache:
   - per-node missing gate cache → exit 1
   - per-node non-gate node → exit 0 (self-skip)
   - per-node passing gate → exit 0
   - whole-plan all pass → exit 0 / ok:true / failures:[]
   - whole-plan complete gate fail → exit 1 / ok:false / failures.length===1

## Regression

```
node scripts/validate-workflow-contracts.js → Workflow contract validation passed (exit 0)
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js → Kaola-Workflow Gitea contract validation passed (exit 0)
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js → Kaola-Workflow GitLab contract validation passed (exit 0)
node scripts/simulate-workflow-walkthrough.js → Workflow walkthrough simulation passed (exit 0)
```

Note: scripts/test-commit-node.js test4b FAILS (2/27) — pre-existing regression introduced by the impl-commit-node prior node in this DAG. Not introduced by impl-docs-tests (confirmed by git stash check: commit-node passed before prior-node changes, fails after). Orchestrator needs to address in a follow-up node.
