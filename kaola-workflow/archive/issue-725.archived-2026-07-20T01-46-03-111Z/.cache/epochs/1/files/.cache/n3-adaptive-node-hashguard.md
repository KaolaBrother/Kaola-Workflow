evidence-binding: n3-adaptive-node-hashguard 71c22497046c
upstream_read: n2-review-edition-sync 619d1e44ad82
RED: #725a (WS2 dedup) FAILED pre-implementation — "FAIL: #725a: L1 integrity DEDUP — the in-process hash match SKIPS the --resume-check subprocess (no validator resume-check shell), got [\"kaola-workflow-plan-validator.js /p/workflow-plan.md --resume-check --json\", \"kaola-workflow-next-action.js ...\", \"kaola-workflow-commit-node.js ... --start ...\", \"kaola-workflow-task-mirror.js ...\"]". The old guard-prologue Layer 1 unconditionally shelled the validator `--resume-check` even on an UNTAMPERED matching-hash frozen plan, so the dedup assertion (expect ZERO validator resume-check shells) tripped. Exactly 1 FAIL in the pre-change run; #725b already passed because the old L1 always shells and the mock returns ok:false on the tampered plan.
GREEN: both #725a and #725b pass after the in-process fast path. `node scripts/test-adaptive-node.js` → "adaptive-node tests passed (2487 assertions)" (exit 0); `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (exit 0, the #387 open-ready-over-tampered-plan → plan_integrity_failed assertion stays green); `node scripts/edition-sync.js --write` regenerated 3 forge ports; `node scripts/validate-script-sync.js` → "OK: 22 common scripts, 28 byte-identical groups, 5 rename-normalized families, 2 hooks.json families, and 7 forge export-superset families in sync."; `node scripts/edition-sync.js --check` → "edition-sync: 12 forge aggregator ports in parity with canonical."

## What changed

WS2 guard-prologue Layer-1 dedup. `mutationGuardPrologue` (scripts/kaola-workflow-adaptive-node.js ~:8324) previously ran `shell(validatorPath, [planPath, '--resume-check', '--json'])` on EVERY mutating opener (open-next / open-ready / close-node) whenever `cfg.integrity`, refusing `plan_integrity_failed` on a non-zero / `ok!==true` result. Layer 1 now first recomputes the plan_hash IN-PROCESS and compares to the frozen embedded marker:

- read the plan bytes via `readFile(planPath)`;
- extract the frozen marker via the local `planHashFromContent` extractor (the `<!-- plan_hash: ... -->` comment);
- recompute via the plan-validator's exported `computePlanHash` (inline `require('./kaola-workflow-plan-validator')`, calling the SAME hasher `--resume-check` uses via `revalidateForResume`, so the covered-byte set can never drift);
- on a clean MATCH → skip the subprocess (the dedup);
- on a MISMATCH, a MISSING marker, or ANY error (read failure / `computePlanHash` throw), wrapped in try/catch → `hashMatch=false` → FALL BACK to the full `shell(... --resume-check ...)` and refuse `plan_integrity_failed` EXACTLY as before.

Layer 2 (consent-halt fence) and Layer 3 (live-coordination) are byte-unchanged. The crash-repair paths are untouched: `runReconcileRunningSet` and the mirror-project's own `--resume-check` (~:5324) still run the full subprocess. The `cfg.integrity && typeof shell === 'function'` outer guard is preserved, so an absent `shell` skips L1 exactly as today (the fallback still needs `shell`).

## RED -> GREEN narrative

RED-first: added two tests to scripts/test-adaptive-node.js immediately after #499b (before S387b):
- #725a (dedup, the RED driver): build a real frozen plan (`makePlan` body + a stamped `<!-- plan_hash: computePlanHash(body) -->` marker), run `runOpenNext` with a shell spy, assert the open still succeeds AND that NO validator `--resume-check` shell fired. Pre-change this FAILED (L1 always shelled). Post-change it passes (in-process hash match → subprocess skipped).
- #725b (AC-C tamper): freeze a plan, then widen `impl-core`'s declared_write_set WITHOUT restamping the marker (recompute != stale marker; a setup assert pins that). `runOpenNext` must refuse `plan_integrity_failed` with zero mutation, and the spy must show the `--resume-check` subprocess WAS shelled — proving the fast path is a TRUE recompute that falls back on mismatch, not a naive "marker present" trust that would wrongly skip the check and open the tampered node. Passes post-change (and would be RED against a naive marker-trust fast path).

The end-to-end #387 tamper assertion in simulate-workflow-walkthrough.js (~:1540, open-ready over a tampered plan → plan_integrity_failed) stays green — the walkthrough was not edited (it belongs to n5's write set) and its tampered plan takes the mismatch→fallback→refuse path.

## Cross-edition

Edited the canonical `scripts/kaola-workflow-adaptive-node.js`, then `node scripts/edition-sync.js --write` regenerated the codex byte twin (`plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`) and the gitlab/gitea rename-normalized ports (`kaola-{gitlab,gitea}-workflow-adaptive-node.js`). Verified all four carry the fast path; the gitlab/gitea require paths are correctly forge-renamed to `kaola-{gitlab,gitea}-workflow-plan-validator`. `validate-script-sync` + `edition-sync --check` both green. The four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains are deferred to the certifier/finalize node per the plan.

## Verification commands + outcomes

- `node scripts/test-adaptive-node.js` → adaptive-node tests passed (2487 assertions); exit 0; 0 FAIL. (Pre-change RED run: 1 FAIL = #725a.)
- `node scripts/simulate-workflow-walkthrough.js` → Workflow walkthrough simulation passed; exit 0.
- `node scripts/edition-sync.js --write` → write complete (3 file(s) updated).
- `node scripts/validate-script-sync.js` → OK (22 common / 28 byte-identical / 5 rename-normalized / 2 hooks.json / 7 forge export-superset families in sync).
- `node scripts/edition-sync.js --check` → 12 forge aggregator ports in parity with canonical.

Write set touched (5 files, all declared): scripts/kaola-workflow-adaptive-node.js; plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js; plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js; plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js; scripts/test-adaptive-node.js. No file outside the write set + this evidence file was modified (edition-sync.js / test-edition-sync.js changes are n1 upstream, not mine).
