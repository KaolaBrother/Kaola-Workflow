evidence-binding: n3-review-513 38a5fc3ec433
verdict: pass
findings_blocking: 0

# n3-review-513 — opus code-reviewer gate for issue #513 (planner speculative-open authoring rubric)

Scope reviewed: the 6 files of #513 only. Sibling #514 surfaces (adaptive-node.js ×4 +
test-route-reachability.js) excluded as instructed.

## Verdict: PASS — 0 blocking findings.

The rubric is correct against the live runtime contract, NOT inert (concrete recognition rule +
in-grammar worked example), twin-parity-clean, the needle is load-bearing, and there is no INV-17
violation. The #463 "inert rubric" relapse is NOT present.

## Dimension-by-dimension evidence

1. CORRECTNESS vs runtime contract — PASS. Every eligibility condition the new prose states matches
   the live mechanism verbatim:
   - (a) read-only required: rubric says "declared_write_set: —, NEVER for a write node" ==
     next-action.js:225 `if (!isReadOnlyNode) return false` and card §1 line 18-19.
   - (b) sole unsatisfied predecessor is an in-progress gate: rubric "its only unsatisfied
     predecessor is a single in-progress gate" == next-action.js:226-229 (`unsatisfied.length !== 1`
     + `gateRoleSet.has(gate.role)` + `st(gate.id) === 'in_progress'`) and card §1 line 16-17.
   - (c) policy key in ## Meta, default off: rubric "set speculative_open_policy: consent in ## Meta
     (default off)" == adaptive-node.js:87-92 resolveSpeculativePolicy → 'off' default; next-action.js
     emits speculativePending ONLY when policy === 'consent' (line 215); card §2 line 59.
   - (d) verdict:fail rollback: rubric "on a gate verdict:fail the operator decides whether to keep
     or discard" == runtime speculativeReviewRequired (adaptive-node.js:3613-3627, returns
     gate_verdict:'fail' + speculative ids) + card §5/§6 (discard-speculative). No contradiction.

2. NOT INERT — PASS. Concrete recognition rule ("ALL of (a)(b)(c) hold") + explicit When-NOT-to +
   an in-grammar worked example: a read-only adversarial-verifier (or code-explorer) depending ONLY
   on a code-reviewer gate over a small mechanical change. Roles verified canonical:
   plan-validator.js:139-142 CANONICAL_ROLES contains code-explorer, code-reviewer,
   adversarial-verifier; code-reviewer ∈ GATE_VERDICT_ROLES (line 171); verifier/explorer are
   read-only (absent from WRITE_ROLES line 159). The worked topology is exactly the runtime
   eligibility shape — not a decorative example.

3. TWIN PARITY & FORGE-NEUTRALITY — PASS. `diff` shows all three .toml twins byte-identical
   (github==gitlab, github==gitea, no output). No forge brand/CLI in the speculative paragraph;
   both forge --forbidden-only contract checks pass (gitlab exit 0, gitea exit 0). The .md carries
   the fuller form (additional bullet structure), which is the sanctioned md-may-be-fuller shape.

4. NEEDLE LOAD-BEARING — PASS. Needle "unsatisfied predecessor is a high-probability-pass gate" is
   byte-present in agents/workflow-planner.md (1) and in each of the 3 twins (1 each). Parity test
   passes; assertion count 15 (origin/main, run in-place) → 18 (#513) = +3 = exactly the 3-twin
   coverage of the new FEATURE_TOKENS entry. Test logic (lines 62-68) asserts presence in all 3
   twins for every token present in the .md, so the needle is enforced, not vacuously skipped.

5. NO INV-17 VIOLATION — PASS. The rubric instructs setting the ## Meta key ONLY and explicitly says
   "NEVER hand-add a speculative: true annotation to a node row — the Meta key is the ONLY authoring
   control; eligibility stays validator/runtime-derived (the same INV-17 discipline as parallel_safe)."
   This mirrors next-action.js's mechanical/never-authored eligibility (comment line 200) — correct.

6. SCOPE DISCIPLINE — PASS. git diff --name-only confirms #513 touched exactly its 6 declared files.
   The only other changed files are the sibling #514 set (adaptive-node.js ×4 +
   test-route-reachability.js), explicitly out of this node's scope. No #500 mechanism surface
   (next-action speculativePending, adaptive-node open-ready, card §1-§7) was modified by #513 — only
   a new "Authoring (planner)" section was inserted into the card, additively.

## Non-blocking nits (cosmetic, do NOT block)

- finding: id=N1 scope=in_scope action=none status=open severity=low fix_role=none rationale=md
  rubric line "Rule of thumb:" (workflow-planner.md:37) is a slightly redundant restatement of the
  paragraph it closes; harmless reinforcement, not an error.
- finding: id=N2 scope=in_scope action=none status=open severity=low fix_role=none rationale=card
  "Authoring (planner)" section partially duplicates the md rubric prose; intentional cross-surface
  reinforcement (card points back to the md as the source of truth), acceptable.

Both nits are wording-only and explicitly non-blocking per the gate rubric.
