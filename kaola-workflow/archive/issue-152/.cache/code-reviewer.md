# Code Review: issue-152 — Explicit model-bearing routed-fix Agent blocks

## CRITICAL
none

## HIGH
none

## MEDIUM
none

## LOW

**[LOW] Routed-fix Agent blocks split a sentence from its completing fenced block**
Files: `commands/kaola-workflow-phase4.md:118-135`, `commands/kaola-workflow-phase5.md:81-112`, `commands/kaola-workflow-phase6.md` (+ all 6 plugin copies)

The new Agent blocks are inserted between the sentence "...Raw output goes to:" and the fenced cache-path block that originally completed that sentence. Functionally harmless — placeholder substitution, badge rendering, and all assertions are unaffected — but a reader hits the cache-path block detached from the sentence introducing it. Consider moving the new Agent blocks after the path block. Readability only.

## Criteria Review (all pass)
1. 9 files consistent, identical per phase across root/gitlab/gitea
2. New blocks match established `You MUST pass model=` + fenced `Agent(...)` with `model=` second
3. `{TDD_GUIDE_MODEL}` / `{BUILD_ERROR_RESOLVER_MODEL}` correct, both registered in install.sh (lines 382-383, 399-400)
4. validate-workflow-contracts.js covers all 9 files; build-error-resolver asserted on all 9, tdd-guide on 6 phase5/6 files (correct: phase4 tdd-guide already at Step 1)
5. Render assertions use multi-line `subagent_type=...,\n  model="sonnet",` form (stronger than bare string)
6. `description="Routed fix: task {n}"` is template-shaped
7. All edits within approved write set
8. No scope creep

## Verdict: APPROVE — no CRITICAL/HIGH/MEDIUM issues
