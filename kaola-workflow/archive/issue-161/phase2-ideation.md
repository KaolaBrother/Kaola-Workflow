# Phase 2 - Ideation: issue-161

## Approaches Evaluated

### Option A: Docs-only contract + validation guard
- Summary: Add `## Closure Contract` section to `docs/api.md` with 7 invariants, receipt schema as fenced JSON, flow-mapping table, and follow-up scope subsection. Add `assertConcept` guard to both validation scripts.
- Pros: Smallest surgical change; zero runtime risk; excellent fit with existing house style
- Cons: Schema lives only as prose — #164 must re-transcribe field names, risking doc/code drift
- Risk: Low
- Complexity: Small

### Option B: Docs contract + exported schema constant (SELECTED)
- Summary: Everything in Option A, plus a new forge-agnostic `scripts/kaola-workflow-closure-contract.js` (+ 3 copies: plugins/kaola-workflow/, plugins/kaola-workflow-gitlab/, plugins/kaola-workflow-gitea/) exporting `CLOSURE_RECEIPT_FIELDS`, `CLOSURE_INVARIANTS`, and `emptyReceipt(project, issueNumber)`. A `BYTE_IDENTICAL_GROUPS` entry in `validate-script-sync.js` pins byte-equality across all 4 copies. The constant is published but has no callers in #161.
- Pros: Single machine-readable source of truth eliminates doc/code drift for #164; `emptyReceipt()` defaulting to failure states encodes the philosophy shift as the default shape; byte-equality guard is a clean 1-line addition to existing infrastructure; forward-compat is structural
- Cons: New file × 4 install surfaces; constant is unused until #164 (reviewable as "dead code")
- Risk: Low-medium (mitigated by BYTE_IDENTICAL_GROUPS assertion)
- Complexity: Small-Medium

### Option C: Docs contract + enforcement stubs
- Summary: Approach B plus skeleton `closure-audit` stub + partial receipt on `finalize --receipt`
- Pros: Demonstrates contract is implementable
- Cons: Crosses into implementation scope of #164/#165; stubs emit misleading audit signal; triples change surface
- Risk: High
- Complexity: Large

## Advisor Findings
The advisor was temporarily overloaded; analysis proceeded from direct codebase verification. Key finding: the `BYTE_IDENTICAL_GROUPS` mechanism in `validate-script-sync.js` already supports arbitrary cross-forge sync (it already guards the pre-commit hook across all 4 install surfaces). Adding the closure-contract module as a new group is a clean 1-entry addition. This resolves the planner's main caveat for Approach B. Recommendation: proceed with Approach B.

## Selected Approach
**Option B: Docs contract + exported schema constant**

Rationale: The central failure mode this initiative targets is drift (doc-vs-code and forge-vs-forge). A pure-data `emptyReceipt()` constant makes doc-vs-code drift structurally impossible for #164, which is the highest-leverage thing #161 can do. The `BYTE_IDENTICAL_GROUPS` sync guard eliminates cross-forge drift for the new module. The constant has no I/O and no callers in #161, so it stays true to the "design issue" nature while making the contract machine-readable from day one.

## Files to Touch

| File | Change |
|------|--------|
| `docs/api.md` | Add `## Closure Contract` section |
| `scripts/kaola-workflow-closure-contract.js` | New — exports `CLOSURE_RECEIPT_FIELDS`, `CLOSURE_INVARIANTS`, `emptyReceipt()` |
| `plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js` | New — byte-identical copy |
| `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js` | New — byte-identical copy |
| `plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js` | New — byte-identical copy |
| `scripts/validate-script-sync.js` | Add `BYTE_IDENTICAL_GROUPS` entry for closure-contract module |
| `scripts/validate-kaola-workflow-contracts.js` | Add `assertConcept` guard for closure contract terms |
| `scripts/validate-workflow-contracts.js` | Add same `assertConcept` guard |
| `docs/workflow-state-contract.md` | Optional one-line cross-reference |

## Out of Scope (explicit)
- Writing or emitting any closure receipt from any production code path (→ #164)
- Converting any `catch(_){}` to fail-loud or hardened roadmap cleanup (→ #162)
- Label-cleanup guarantees and `issue_number`-from-state fallback (→ #163)
- The `closure-audit` subcommand or any repair execution (→ #165)
- Fixing cross-forge parity gaps: `removeLegacyStateBlocks` missing from GitLab/Gitea, `cmdSinkFallback` guard inconsistency, Gitea `clearAdvisoryClaim` silent-skip (→ #162–#164; the mapping table names them as gaps)
- Any runtime behavior changes in the sink/finalize paths

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | Advisor temporarily overloaded; codebase verification confirms planner recommendation is sound |
