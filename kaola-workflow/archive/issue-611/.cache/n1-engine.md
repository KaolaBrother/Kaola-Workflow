evidence-binding: n1-engine 5e9b9b0f31ea
delegation_outcome: completed

# n1-engine — Codex dispatch JOIN protocol engine (AC2 / AC3 / AC5) + R1 fix

TDD RED→GREEN per arm. Three engine-side arms plus the adversarial-gate R1 remediation.
- AC2 — every dispatch card carries `wait_budget_minutes`.
- AC3 — reconcile writer kill-safety (`adopt | halt`, fail-closed non-destructive).
- AC5 — typed `delegation_outcome` token in the node evidence contract.
- R1  — close the fail-OPEN hole the adversarial gate refuted in the AC3 classifier.

## RED (initial arms, captured against the frozen worktree)

RED: T611-AC2 — `TypeError: s.waitBudgetMinutes is not a function` (no tier→budget derivation; no `wait_budget_minutes` on any dispatch card).
RED: T611-AC5 — `TypeError: s.parseDelegationOutcome is not a function`; `checkEvidenceShape('tdd-guide','n1','delegation_outcome: exploded\nRED\nGREEN')` returned `ok=true` (unknown token accepted — no vocabulary enforcement).
RED: T611-AC3 — `runReconcileRunningSet(...).writerReconciliation === undefined` (a rolled-back/capped-out writer's stray edits never diffed vs its declared write set).

## RED (R1 — adversarial gate refutation, reproduced end-to-end)

RED: T611-AC3(iv/v) — the AC3 classifier FAIL-OPEN hole. `shellNode` never throws (it returns `{...safeJsonParse(err.stdout), exitCode}`), and `safeJsonParse('')` === `{}`, so a SIGKILL'd / jetsam-killed / crashed / non-JSON / missing-validator `--barrier-check` yields a RESULTLESS truthy object `{exitCode:1}`. The old `classifyWriterReconcile` mapped only `null/non-object` → halt and `result==='refuse'` → the refusal family, then fell through to a terminal `return adopt`. So `{exitCode:1}` and garbage `{result:'banana'}` both fell through:
  `run({exitCode:1})`      → verdict=adopt writerHalt=false  (BUG: silently adopts unverified writer dirt)
  `run({result:'banana'})` → verdict=adopt writerHalt=false  (BUG)
Reachable via the very jetsam kills I documented on this box → a leaked partial edit is silently kept. Contradicts the fail-closed intent.

## GREEN (post-implementation, all arms + R1 fix)

GREEN: `node scripts/test-adaptive-node.js` → `adaptive-node tests passed (1394 assertions)` (1362 baseline → 1388 arms → 1394 after +6 R1 cases). New R1 coverage: resultless `{exitCode:N}` → halt(barrier_unverifiable)/writerHalt:true; garbage `{result:'banana'}` → halt(barrier_unverifiable); explicit `result:'pass'` AND `result:'ok'` still → adopt (no happy-path regression); refuse+outOfAllow → halt+paths; `no_barrier_base` → adopt(vacuous); null → halt(barrier_unavailable).
GREEN: `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed` (AC2 dispatch card carries a concrete positive-integer `wait_budget_minutes`; AC5 exercises `completed` + `interrupted_unresponsive` + an unknown-token refusal).
GREEN: `node scripts/validate-script-sync.js` → OK (24 common, 25 byte-identical groups, 8 rename families …).
GREEN: `node scripts/edition-sync.js --check` → `10 forge aggregator ports in rename-normalized parity with canonical`.

## R1 fix — classification inverted to POSITIVE CONFIRMATION

`classifyWriterReconcile(nodeId, bc)` truth table (fail-closed; `adopt` requires an EXPLICIT clean confirmation):

| `bc` shape                                         | verdict | reason                | outOfWriteSet |
| -------------------------------------------------- | ------- | --------------------- | ------------- |
| `null` / non-object                                | halt    | barrier_unavailable   | []            |
| `{result:'refuse', outOfAllow:[…non-empty]}`       | halt    | write_set_overflow*   | [the paths]   |
| `{result:'refuse', reason:'no_barrier_base'}`      | adopt   | no_baseline (vacuous) | []            |
| `{result:'refuse', …other}`                        | halt    | barrier_refused*      | []            |
| `{result:'pass'}` / `{result:'ok'}`                | adopt   | in_write_set          | []            |
| `{exitCode:N}` (RESULTLESS — killed/crashed shell) | halt    | barrier_unverifiable  | []            |
| `{result:'banana'}` (unrecognized token)           | halt    | barrier_unverifiable  | []            |

(*carries `bc.reason` when present.) The load-bearing change: the terminal branch is now `if (result==='pass'||result==='ok') adopt; else halt(barrier_unverifiable)` — a resultless or unrecognized barrier is UNVERIFIED, so it can never silently adopt. Envelope still carries top-level `writerHalt:boolean`. Reconcile stays NON-DESTRUCTIVE (never auto-deletes; `revert` remains a vocabulary token the orchestrator MAY act on via revert-overflow).

## Design decisions (unchanged from the initial arms)

### AC2 — wait budget (schema `waitBudgetMinutes`, beside `dispatchEffort`)
- `WAIT_BUDGET_MINUTES = { reasoning: 40, standard: 20 }` + `WAIT_BUDGET_MINUTES_DEFAULT = 20` (concrete, never null). `normalizeTier()` first, so legacy `opus`/`sonnet` cells map identically. `buildDispatch` spreads `...waitBudgetMinutes(nodeInfo.model)` → present on EVERY card the three openers emit. Planner override rides the tier (no per-node plan column — the node grammar has no extras field; that is a validator-grammar change owned elsewhere). `runOrient` is read-only (frontier previews, not dispatch cards), so it is correctly not a card source.
- Note for n3-prose: an untiered node resolves to the DEFAULT standard tier in open-next, so its card shows `wait_budget_minutes: 20`, `wait_budget_source: planner_model` (a truly tierless card is role_default). SKILL prose should tell the orchestrator to read `wait_budget_minutes` off the card and never interrupt a `running` agent before it elapses.

### AC3 — reconcile writer kill-safety (extended `runReconcileRunningSet`; NO new subcommand)
- Every WRITER member LEAVING the live set (rolled back / capped out / stale, `kind==='write'`) is diffed vs its declared set via `--barrier-check` (same baseline+diff as the per-node barrier), computed BEFORE the `--drop-base` loop. Verdict per writer via the truth table above; top-level `writerHalt` when any writer halts. Fail-soft (a thrown shell yields the `barrier_unavailable` halt via the null guard). Read/gate members skipped → existing reconcile tests (R8/S385/D419-INV7, all read-kind) unperturbed; the real LEG-RECONCILE-TEARDOWN CLI (writer B, verifiable-clean) → adopt, `rec.result` unchanged.

### AC5 — typed delegation outcomes (schema vocabulary + `checkEvidenceShape`)
- `DELEGATION_OUTCOME_VOCABULARY = [completed, returned_partial, interrupted_unresponsive, interrupted_obsolete]`, default `completed`. `parseDelegationOutcome` mirrors `parseNodeVerdict` discipline. OPTIONAL/back-compat: ABSENT ⇒ completed (this evidence file carries `delegation_outcome: completed` as a live positive); a PRESENT unknown value is a typed refusal, enforced BEFORE the role branches AND the n/a carve-out so it governs every role.

## Write-set / edition sync
- Canonical edits: `scripts/kaola-workflow-adaptive-schema.js` + `scripts/kaola-workflow-adaptive-node.js` + `scripts/test-adaptive-node.js` + `scripts/simulate-workflow-walkthrough.js`.
- `edition-sync.js --write` propagated: schema byte-copied ×4 (arms pass), adaptive-node codex twin byte-copied + the two renamed forge ports regenerated (arms + R1). All 10 declared write-set files in sync (`--check` + `validate-script-sync.js` green). The R1 fix touched adaptive-node only (schema untouched, as the gate noted).

## Deviations / notes for siblings
- No new adaptive-node subcommand (extended `reconcile-running-set`, per the issue NON-goal).
- Did NOT touch SKILL/command prose, contract validators, preflight, or docs (n3-prose / n2-preflight / n5-docs own those).
- Env note: `test-adaptive-node.js` is intermittently OS-killed (jetsam) mid-run on this box during the subprocess-heavy leg tests; a clean re-run completes at 1394. That same kill class is exactly the barrier-check failure R1 now fails closed on.
