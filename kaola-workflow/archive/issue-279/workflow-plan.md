# Adaptive Workflow Plan — issue-279

<!-- plan_hash: 0a6de4cd1fc5032fc133686e6ffa65b5a8e20f80c1f5c060fc9b17aaaf1b2c00 -->

adaptive: in-scope reviewer/verifier findings must force repair before finalize (#279). Harden the
adaptive verdict gate so a completed gate-role node (code-reviewer/security-reviewer/
adversarial-verifier) with `verdict: pass` / `findings_blocking: 0` STILL fails the mechanical gate
when its `.cache` evidence carries an unresolved in-scope `action: fix` finding. Add a
machine-readable findings contract plus bounded repair-routing prose. Linear chain
schema → gate → routing → review → finalize: review (code-reviewer) post-dominates all three code
producers (G1); no `*security*` filename in any write-set and empty labels (G2 not triggered);
finalize is the unique docs/state sink (CHANGELOG.md only).

## Meta

labels:

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| schema | implementer | — | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js | 1 | sequence |
| gate | tdd-guide | schema | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| routing | implementer | gate | plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md | 1 | sequence |
| review | code-reviewer | routing | — | 1 | sequence |
| finalize | finalize | review | CHANGELOG.md | 1 | sequence |

non_tdd_reason: schema is `implementer` (non-TDD) because its new behavior — FINDING_SCOPE/ACTION/
STATUS vocab, `parseNodeFindings(cacheText)`, and `unresolvedInScopeFixes(findings)` added to the 4
byte-identical adaptive-schema copies — is necessarily exercised by the `gate` node's walkthrough
tests; the single test file (simulate-workflow-walkthrough.js) must be owned by one node, and tests
of the validator gate must live at/after the validator, so schema is verified here by build-green
rather than a node-local failing unit test. routing is `implementer` (non-TDD) because it edits
prose/dispatch-contract docs only — the findings-emission dispatch contract and bounded
repair-routing prose across the 4 plan-run docs — which has no natural failing unit test.

## Node Ledger

| id | status |
| --- | --- |
| schema | complete |
| gate | complete |
| routing | complete |
| review | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (schema) | subagent-invoked | # Node schema — #279 findings vocabulary + parser (implementer) | |

| tdd-guide (gate) | subagent-invoked | # Node gate — #279 verdict-gate hardening (tdd-guide) | |
| implementer (routing) | subagent-invoked | # Node routing — #279 findings contract + repair-routing prose (implementer) | |
| code-reviewer | subagent-invoked | # Node review — #279 adaptive verdict-gate hardening (code-reviewer, G1) | |
| finalize (finalize) | subagent-invoked | # Node finalize — #279 Phase-6 sink | |
## Design Notes

Goal: harden the adaptive verdict gate so a completed gate-role node (code-reviewer/
security-reviewer/adversarial-verifier) with `verdict: pass` / `findings_blocking: 0` STILL fails
the mechanical gate when its `.cache` evidence carries an unresolved in-scope `action: fix` finding.
Plus repair-routing prose + a machine-readable findings contract.

- schema node: adds FINDING_SCOPE/ACTION/STATUS vocab + `parseNodeFindings(cacheText)` (FLAT,
  column-0, one-line-per-finding format
  `finding: id=R1 scope=in_scope action=fix status=open severity=low fix_role=tdd-guide`, native
  multiline regex like parseNodeVerdict, fence-blind-by-anchor) + `unresolvedInScopeFixes(findings)`
  to the 4 byte-identical adaptive-schema copies. ABSENT findings block ⇒ empty array ⇒ pass
  (backward-compat). A PRESENT finding with missing status ⇒ treated as open (fail-closed). It is
  `implementer` (non-TDD) because its behavior is necessarily tested in the gate node's walkthrough
  — the single test file (simulate-workflow-walkthrough.js) must be owned by one node, and tests of
  the validator gate must live at/after the validator; verified here by build-green.
- gate node (tdd-guide, RED→GREEN): hardens `verifyVerdictBlock`/`checkOne` in the 4 plan-validator
  copies (root+plugin byte-identical; gitlab/gitea are renamed ports — same logic, different require
  lines) to fail when `schema.unresolvedInScopeFixes(...)` is non-empty even with verdict:pass. Adds
  walkthrough tests: parser units (incl. absent⇒pass, missing-status⇒blocks), AC1 per-node signal,
  and the AC6 WHOLE-PLAN regression (a complete review node ledger row + .cache verdict:pass + an
  unresolved in-scope fix ⇒ whole-plan --verdict-check FAILS).
- routing node: findings-emission dispatch contract + bounded repair-routing prose (fix-role map
  tdd-guide/implementer/build-error-resolver/security-then-re-review; repair envelope = frozen
  write-set ∪ tests/docs/mirrors enforced by barrier-check; LOOP_CAP bound; halt/escalate via
  existing write-halt on exhaustion; out_of_scope/pre_existing/needs_user_decision recorded as
  EXPLICIT machine-readable follow-ups) across all 4 plan-run prose docs. NOTE:
  code-reviewer/security-reviewer are VENDORED agents (provenance-pinned) — the findings contract
  lives in the DISPATCH PROSE, never in agent bodies.
- No write-set path is sensitive (no *security* filename) ⇒ code-reviewer alone suffices; no
  security-reviewer node required. finalize is the unique sink; review post-dominates
  schema/gate/routing.
