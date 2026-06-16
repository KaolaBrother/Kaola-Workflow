evidence-binding: n5-code-review f3761612d2cc
verdict: pass
findings_blocking: 0

finding: id=R1 scope=out_of_scope action=follow_up status=open severity=medium fix_role=none rationale=boundary-2 CLI-fetch swallow is edition-uniform (root gh-catch + forge glab/tea catch) and surfaces transient faults as determinate target_unavailable; hardening it to emit indeterminate would activate the forge forward-compat handlers; explicitly out of #495 scope, file as follow-up
finding: id=R2 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=classifySubprocessError returns 'owned_exit' for status===2 but the caller short-circuits to verdict:'owned' before consulting it; dead-defensive, harmless, not a defect

## n5-code-review — G1 gate verdict (issue #495)

VERDICT: pass — 0 blocking findings. All code-producing nodes (n1, n2, n3) reviewed.

### 1. Four-chain cross-edition result (#307) — REAL exit codes
- CLAUDE_EXIT=0  (ends "Workflow walkthrough simulation passed")
- CODEX_EXIT=0   (ends "Kaola-Workflow walkthrough simulation passed")
- GITLAB_EXIT=0  (ends "GitLab Codex workflow walkthrough simulation passed")
- GITEA_EXIT=0   (ends "Gitea Codex workflow walkthrough simulation passed")
Run sequentially (not via `&&` short-circuit); each verified to end on its own success sentinel.
No real FAIL/Error in any log (grep hits were test-name strings about fail-handling, e.g.
testClassifierFailClosedOnRemoteError: PASSED). gitlab/gitea scratch dirs removed post-run.

### 2. Forge-mirror hand-diff adjudication (HIGHEST PRIORITY) — SOUND + COMPLETE
Adjudicated each root hunk as boundary-1 (subprocess-spawn retry machinery) vs boundary-2 (envelope).

Boundary-1 hunks (CORRECTLY OMITTED from both forge ports — token count = 0 in each):
  - classifySubprocessError, classifierTimeoutMs, syncSleepMs helpers
  - KAOLA_CLASSIFIER_MOCK_SCRIPT test seam, MAX_ATTEMPTS retry loop, KAOLA_CLASSIFIER_BACKOFF_MS
  - the indeterminate verdict EMISSION inside classifyIssue
Rationale verified SOUND by source inspection: forge claim.js calls classifyIssue → in-process
`classifier.classifyIssue(...)` (require at line 9; wrapper at gitlab:573-575 / gitea twin), NOT an
execFileSync subprocess spawn. Root spawns the classifier as a subprocess (execFileSync process.execPath).
So boundary-1 (claim.js→classifier subprocess fault) genuinely DOES NOT EXIST in the forge editions —
nothing to retry. Boundary-2 (forge.viewIssue catch → target_unavailable, gitlab classifier:459-463)
mirrors root boundary-2 (ghExec catch → target_unavailable, root classifier:~609). Both editions leave
boundary-2 as a graceful determinate swallow — symmetric, out of #495 scope.

Boundary-2 / envelope hunks (FAITHFULLY MIRRORED in BOTH ports, byte-identical to each other modulo
the bundle-before-target ordering of the two functions in the forge files):
  - 7× `result: 'refuse'` additions: target_unavailable (claimExplicitTarget) +
    target_set_conflicts_active_work, target_set_has_closed_issue, target_set_unavailable (probe),
    target_set_conflicts_active_work (classify), target_set_red, target_set_unavailable (classify)
  - 2× indeterminate handler with `result: 'escalate'` (target_indeterminate / target_set_indeterminate)
  - forward-compat comment present in BOTH ports (2 instances each — before each handler), correctly
    annotating that the handler is currently unreachable (forge classifier does not yet emit indeterminate).
No forge brand/CLI nouns (#341) introduced in any new code line (grep clean; only diff-header matches).
gitlab and gitea port diffs are byte-identical to each other.
Adjudication: every envelope hunk mirrored; every boundary-1 hunk correctly omitted; rationale sound.
NO missing envelope hunk, NO wrongly-included boundary-1 hunk → no blocking finding.

### 3. n1 correctness (scripts/kaola-workflow-claim.js + byte-twin)
- Byte-twin: scripts/...claim.js == plugins/kaola-workflow/scripts/...claim.js (diff empty: TWIN_IDENTICAL).
- Retry bounded: MAX_ATTEMPTS=3 (1 original + ≤2 retries). ✓
- Transient-only retry: clean_nonzero breaks the loop (NOT retried) → determinate target_unavailable;
  spawn_fault/killed/unknown loop to exhaustion → indeterminate. ✓
- status===2 (owned) short-circuits to verdict:'owned' BEFORE classifySubprocessError, never retried,
  never indeterminate — stays owned. ✓ (R2: owned_exit return path is dead-defensive, harmless.)
- result:'escalate' ONLY on indeterminate; result:'refuse' ONLY on determinate refusals. ✓
- Tests (test-claim-hardening.js): drive the REAL execFileSync path via the mock seam; assert
  (a) transient→success retry fires (counter>1), (b) persistent→target_set_indeterminate+escalate
  (counter≥3), (c) clean-nonzero NOT retried (counter==1) + result:refuse. Genuine subprocess tests,
  not a shim false-green.

### 4. n3 correctness (18 surfaces + planner + T6 pin + parity token)
- T6 route-reachability pin lists exactly 18 surfaces (adapt×6 + workflow-next×6 + auto×6) and
  asserts BOTH `<!-- PIN: claim-escalate -->` and the `result: escalate` literal in each. ✓
- Routing semantics verified across command + SKILL + planner surfaces: result:refuse → HARD STOP /
  fail closed / determinate RED is final; result:escalate → PAUSE and ASK THE USER (retry / different
  target / offline / abort); "NOT an adaptive-node write-halt — no plan/ledger exists yet at claim
  time" nuance present. ✓ Forge SKILL prose forge-neutral (no brand contamination in routing block).
- test-agent-profile-parity.js adds FEATURE_TOKEN `target_set_indeterminate` → enforces the three
  .toml twins carry it (md↔toml parity). ✓

### 5. Security
- KAOLA_CLASSIFIER_MOCK_SCRIPT mirrors the existing KAOLA_GH_MOCK_SCRIPT test-seam precedent; it
  swaps the classifier *path* only — same execFileSync arg shape, no shell, no injection surface
  widening. Reading an env var to point at a script is the established test pattern. No new risk.
- No secrets/PII logged; stderr is truncated to 200 chars in the determinate branch. No injection.

### 6. n4 corroboration
n4 (read-only) verified indeterminate-vs-determinate distinctness (pass). Corroborated, not redone:
indeterminate=transient-exhausted→escalate; determinate=clean-nonzero/owned→refuse/owned. Distinct.
