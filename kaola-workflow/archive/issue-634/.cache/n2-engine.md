evidence-binding: n2-engine ea4bdc11b558

R4 repair (bounded): the evidence-shape gate had NO `metric-optimizer` branch in
`checkEvidenceShape` (scripts/kaola-workflow-adaptive-node.js), so a metric-optimizer node
fell through to the generic file-present-and-non-empty tail and closed COMPLETE on a fully
hollow seeded stub (all four D6 token VALUES empty, zero ratchet log) — violating AC6.

RED: checkEvidenceShape('metric-optimizer', 'n2-opt', <hollow seeded stub — every D6 token
KEY present but VALUE empty>) returned {"ok":true} before the fix (hollow stub WRONGLY
ACCEPTED); new test T7m-a asserts `rHollow.ok === false` → AssertionError pre-impl. Captured
via direct require of the exported fn: `RED capture (pre-fix) ... => {"ok":true}`.

GREEN: added an explicit `metric-optimizer` branch requiring a NON-EMPTY column-0 value for
each of the four non-binding D6 tokens (metric_baseline, metric_final, iterations_used,
regression-green), mirroring the tdd-guide/implementer house pattern (returns
{ ok:false, kind:'shape', missingTokenClass:<token>, ... } on the first empty token; { ok:true }
when all present; { kind:'absent' } on null). Post-fix: hollow → ok:false
missingTokenClass:metric_baseline; partial (one empty) → ok:false missingTokenClass:metric_final;
fully filled → ok:true; null → ok:false kind:absent. Presence-only (value not validated), per the
function's documented contract; the stub's `<!-- <token>: paste ... -->` comment is not column-0
anchored so it never satisfies the check. `node scripts/test-adaptive-node.js` GREEN — 1491
assertions incl. new T7m-a..d; `node scripts/simulate-workflow-walkthrough.js` GREEN
("Workflow walkthrough simulation passed"); `npm run sync:editions --write` regenerated the 3
edition ports; `node scripts/edition-sync.js --check` GREEN ("10 forge aggregator ports in
rename-normalized parity"); `node scripts/validate-script-sync.js` GREEN.

Files changed (all inside n2-engine's write set):
- scripts/kaola-workflow-adaptive-node.js (canonical: metric-optimizer branch + header comment)
- scripts/test-adaptive-node.js (new T7m RED→GREEN case)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js (regenerated)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js (regenerated)
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js (codex-sync regenerated)
