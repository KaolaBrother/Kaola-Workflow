node: review (code-reviewer, G1 — post-dominates adapt-side + planrun-side)

verdict: pass
findings_blocking: 0

Issue #247 docs/prose review — all 6 acceptance criteria pass:
1. Canonical DISPATCH trigger on both surfaces (adapt: "the executor flips each task `in_progress` when it dispatches that node's role (after `open-next`)..."; plan-run: "Mark a node's task `in_progress` when you dispatch its role (after `open-next`)...").
2. Byte-consistency within editions: 3 adapt-side command clauses byte-identical (bare `open-next`, edition script-name dropped); 4 plan-run editions carry the identical dispatch trigger. grep "opens that node" / "flips .*per node" / "its role is dispatched" → all NONE.
3. No contradiction remains — no surface references open/advance-bracket as the flip trigger.
4. No script-logic change — 0 .js files in diff; .md only.
5. #279 rebase-safety — commands/kaola-workflow-plan-run.md UNCHANGED (absent from diff); only the plan-run SKILL changed.
6. Regression gate — node scripts/simulate-workflow-walkthrough.js → exit 0, "Workflow walkthrough simulation passed".

Non-blocking notes: AC text says "8 files" but only 5 changed — the 3 plan-run COMMAND editions were already correct and correctly left untouched (consistent with AC#5). Approve.
