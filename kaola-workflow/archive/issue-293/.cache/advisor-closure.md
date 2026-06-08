# Closure Decision Gate — issue #293

## Deferred / follow-up scan
One non-blocking finding from the G1 `code-review`:
- **R1** (severity low, `scope=out_of_scope`, `action=follow_up`, `status=open`): in
  `test-adaptive-node.js` the imported `ORPHAN_LEGALITY_IN_PROGRESS_IDS` is unused — the orient
  assertion re-derives its single `in_progress` ledger row inline, so the shared-fixture binding
  covers the **manifest axis on both sites** (the F1 disagreement source) but the **in_progress
  axis only on the parallel-batch site**.

No CRITICAL/HIGH findings. `--verdict-check` returned `unresolvedFixes: []` (no `in_scope/fix`
unresolved defect). All four ledger rows `complete`.

## Advisor consultation (closure decision)
The advisor was consulted on R1 (twice, including a reconcile after I empirically confirmed the
per-node barrier scopes to the node's OWN allowlist — `plan-validator.js:955-958`). Verdict:
**accept the G1 verdict and close**, do NOT plan-repair for R1. Reasoning:
1. The `in_progress` axis **cannot be mechanically shared by construction**: `crossCheckStatus`
   consumes an `inProgressIds` array; `runOrient` parses a markdown ledger — structurally different
   inputs. The "fix" would catch zero production drift the current tests don't already catch (if
   `runOrient` re-diverged on single-`in_progress`, the orient assertion breaks either way).
2. The load-bearing manifest axis (the actual F1 disagreement source) **is** genuinely shared on
   both sites, so the issue's deliverable ("a shared fixture exercising both sites so they cannot
   drift") is **met**, not half-true.
3. Landing R1 would require plan-repair on a frozen plan + a full Opus re-review — disproportionate
   cost/risk for a LOW test-cleanliness nit.

## Decision
- **#293 acceptance criteria pass.** The `crossCheckStatus` ↔ `runOrient` alignment is complete
  across all four editions; the shared anti-drift fixture exercises both sites on the load-bearing
  axis; the #291 F1 divergence is closed. → **close #293**.
- **R1**: recorded durably (this note + code-review evidence `.cache/code-review.md` + the CHANGELOG
  entry). **User directive (post-finalize):** the user explicitly asked to file follow-up issues for
  any gaps, so R1 **will be filed as a GitHub issue** after the sink (overrides the earlier
  offer-only disposition).
- Closing #293 is authorized by the run goal "finish #293".

## Release decision
**User directive (post-finalize):** the user asked to bump the version and cut a release. The #293
adaptive branch itself merges normally (a version bump touches `package.json` / `.codex-plugin`
manifests / README — all outside the frozen plan's barrier allowlist, so the bump cannot ride this
branch). The **release is cut as a separate operation on `main` after the #293 sink**, bundling the
accumulated `[Unreleased]` work (#287, #261, #291, #294, #292, #293) into one tagged release.
