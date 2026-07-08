evidence-binding: n2-validator 4e6f3bce0f6b

# n2-validator REOPEN — gate finding R2 repair: duplicate-brief wall (brief_duplicate_node)

Scope statement: the prior gate-reviewed n2 scope STANDS unchanged (## Node Briefs grammar +
conditional hash coverage + brief_unknown_node + the 8 ROLE_TOKEN_REGISTRY rows + PRODUCER_ROLES/
IMPLEMENT_ROLES exports + both test surfaces — all four chains green at n7-cr-engine). This reopen
adds ONLY the duplicate-brief-id freeze wall + its test, per the gate's R2 finding: a repeated
`### <node-id>` in ## Node Briefs previously resolved silently first-wins (ambiguous goal_line).

## RED → GREEN (failing-test-first, this repair)

RED: test-adaptive-handoff.js — briefs-dup "a repeated ### <node-id> in ## Node Briefs refuses brief_duplicate_node, got {"result":"in-grammar"}" + "the duplicated node id is named in the errors, got undefined" — 2 failures, 151 passed (pre-impl: two ### explore blocks froze in-grammar, silent first-wins).
GREEN: test-adaptive-handoff.js passes (153 assertions, exit 0) — the dup plan now refuses brief_duplicate_node with the offending id in errors; all prior briefs/observes/handoff cases still green.
GREEN: test-adaptive-node.js passes (1598 assertions, 0 FAIL, exit 0) — untouched by this repair, exactly the pre-repair count.

## Implementation (canonical scripts/kaola-workflow-plan-validator.js)

- validatePlan briefs loop (the brief_unknown_node wall, ~:1433): now tracks a `seenBriefIds` Set;
  a repeated `### <node-id>` → early typed refusal `brief_duplicate_node` (mirrors the duplicate-
  node-id wall's seen-Set style; unknown-id takes precedence by parse order within one pass).
- OPERATOR_HINT_REGISTRY: new `brief_duplicate_node` entry ("merge the blocks into one and re-freeze").
- Freeze-only: NOT added to revalidateForResume (briefs are hash-covered — a frozen plan can never
  carry a duplicated brief). Verified: clean-briefs plan still freezes + resume-checks ok:true.
- Edge checks run: dup → brief_duplicate_node; unknown-before-dup → brief_unknown_node; clean →
  in-grammar; frozen clean plan → revalidateForResume ok:true.

## Files changed (all inside the declared write set)

- scripts/kaola-workflow-plan-validator.js (canonical: hint entry + seen-Set wall)
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js (codex twin, edition-sync)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js (edition-sync)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js (edition-sync)
- scripts/test-adaptive-handoff.js (briefs-dup case appended after briefs-unknown)
(scripts/test-adaptive-node.js NOT touched by this repair; its working-tree modification is the
already-merged bundle state.)

## Verification commands + exit codes

- node -c scripts/kaola-workflow-plan-validator.js — syntax OK
- node scripts/edition-sync.js --write — 3 files updated (codex twin + gitlab/gitea validator ports)
- node scripts/edition-sync.js --check — exit 0 (10 forge ports, 24 COMMON_SCRIPTS mirrors, 27 byte-identical groups in parity)
- node scripts/test-adaptive-handoff.js — exit 0 (153 assertions passed)
- node scripts/test-adaptive-node.js — exit 0 (1598 assertions passed, 0 FAIL)
