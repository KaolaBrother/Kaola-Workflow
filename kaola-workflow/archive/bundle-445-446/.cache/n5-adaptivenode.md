evidence-binding: n5-adaptivenode 76761cba574d

RED: 5 structural checks failed before implementing —
  RED: missing OPERATOR_HINT_REGISTRY
  RED: missing getOperatorHint
  RED: missing route-findings subcommand
  RED: missing --summary flag
  RED: missing findings-route.json
  (VERDICT_ROLES already present as a module-level Set, so that 6th check passed pre-impl)
RED command: node $TMPDIR/test-adaptive-node-hints.js (exit 1)

GREEN: GREEN: all checks pass
GREEN command: node $TMPDIR/test-adaptive-node-hints.js (exit 0)

Behavioral GREEN (beyond structural tokens):
  - vocabulary contract: all 56 OPERATOR_HINT_REGISTRY hints rendered; overflow family
    (write_set_overflow / write_set_granularity / lockfile_write / mirror_write / count_bump /
    barrier_failed) ALL reference revert-overflow; barrier_failed also references repair-node;
    ZERO hints reference drop-base; ZERO hints carry gh/glab/tea forge CLI tokens.
  - operator_hint is top-level (sibling of result/reason), present on refuse/halt, absent on a
    reason-less ok envelope (decorateOperatorHint).
  - route-findings CLI parsed 4 finding: lines into .cache/findings-route.json: F1→implementer
    (n4 owns scripts/foo.js), F2→security-reviewer (security keyword), F3→code-reviewer +
    owning_node:null (plan-repair signal, orphan file), F4→status n/a (non-blocking, null file).
  - --summary printed exactly `summary: ok` on success and
    `summary: refuse | reason: evidence_absent | hint: ...` on a refuse, caching the full envelope
    to .cache/<op>-envelope.json (route-findings-envelope.json, close-and-open-next-envelope.json).
  - close-and-open-next on a code-reviewer gate AUTO-INVOKED route-findings (findings-route.json
    produced as a non-blocking side effect); an implementer (non-VERDICT_ROLES) close did NOT.

walkthrough: PASSED — node scripts/simulate-workflow-walkthrough.js (exit 0, "Workflow walkthrough simulation passed"), run BEFORE sync and AGAIN after sync.

editions synced: all 4 files — canonical scripts/kaola-workflow-adaptive-node.js edited; codex twin
  plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js BYTE-IDENTICAL; gitlab + gitea
  ports regenerated via `npm run sync:editions` (ADAPTIVE_NODE_SCRIPT const forge-renamed to
  kaola-gitlab-/kaola-gitea-workflow-adaptive-node.js; renderForgePort parity check: PORT IN PARITY
  for both). Non-adaptive-node aggregator ports the global sync also regenerated (commit-node /
  parallel-batch / plan-validator x6) were restored to HEAD — sibling nodes own those.

operator_hint: OPERATOR_HINT_REGISTRY with 56 entries covering every typed reason adaptive-node.js
  emits (guard prologue, orient, mirror-project, open-next/fused-advance, close paths, evidence,
  halt, reopen/repair primitives, open-ready scheduler, main() arg validation, write-set overflow
  family) + getOperatorHint emit-time accessor with non-empty generic fallback +
  decorateOperatorHint applied at the single main() output point and on the invalid_project
  early-exit + the write-halt halt outcome.
route-findings: subcommand added (runRouteFindings + parseFindingLine + resolveOwningNode);
  auto-invoked silently/non-blocking in runCloseAndOpenNext on a VERDICT_ROLES close; writes
  .cache/findings-route.json (array of { finding_id, file, owning_node, fix_role, status }).
summary_mode: --summary flag added to all subcommands via the single main() emit path; default
  (no --summary) output is byte-unchanged FULL JSON.
