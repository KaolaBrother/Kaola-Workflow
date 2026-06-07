verdict: pass
findings_blocking: 0

# Code Review — issue #272 (review node, G1 gate)

Adversarial review of the adaptive-engine rewire. Keystone `scripts/kaola-workflow-adaptive-node.js`
(843 lines, NEW) is the primary correctness surface. All 7 review focus areas verified empirically
(not just read). Full `npm test` green across all four editions.

## Verdict: PASS — no blocking (correctness/security) findings.

---

## 1. adaptive-node.js correctness — VERIFIED

- **close-and-open-next ordering** is correct: (a) evidence-shape → (b) barrier → (c) close+compliance →
  (e) selector arm→n/a → (d) fused advance. Refuse paths for evidence-absent (516) and barrier-fail (530)
  both return BEFORE any advance/write. Confirmed empirically: RED-only tdd-guide evidence refuses with
  `evidence_missing`/missing-GREEN (exit 1); a node with no recorded baseline refuses at the barrier
  (`barrier_failed`, exit 1) — never advances.
- **"only advance if barrier exit 0 AND evidence present" guard** — solid. Test T15 exercises the real
  `runCloseAndOpenNext` and asserts `writeFile NOT called` and `next-action NOT called` on barrier failure.
- **selector arming BEFORE advance** — correct (582-588 run before the 593 next-action shell). Test T17
  asserts armsToNa written to n/a before fused advance.
- **spliceLedgerNode allowFrom** — refuses out-of-allowFrom transitions (136-138 returns match unchanged);
  idempotent via `alreadyAtTarget` (130-133). Never touches ## Meta/## Nodes (plan_hash region).
- **write-halt consent dual-marker** — writes BOTH escalated_to_full:consent AND :security, plus
  consent_halt:pending. Test T18 asserts both markers AND idempotency (each appears exactly once on re-run).
- **Crash-safe write order** — .cache (record-evidence) → ledger/compliance (close) → state LAST
  (write-halt writes plan marker before state). Honored.
- **Error/refuse paths exit non-zero** — `process.exitCode = 1` on every `result:'refuse'` (825-827);
  confirmed empirically (exit 1 on all refuse cases). JSON shapes well-formed.

## 2. Recursion-safety invariant — VERIFIED
`git diff --stat HEAD` on the 5 frozen-core scripts (next-action, commit-node, plan-validator,
kaola-workflow-resolve-agent-model, adaptive-schema) is EMPTY. adaptive-node only `shellNode`s
next-action/commit-node/validator and read-only `require`s `parseNodes`/`resolveModel`. Pure composition.

## 3. handoff change — VERIFIED
spliceLedgerNode, step 5 (baseline), step 6 (open node1), and checklist fields first_node_opened/
baseline_recorded are all DELETED from the handoff (diff + grep confirm). Returns `ready_to_run`;
`first_node` is advisory ("not yet opened"); `if (!firstNode)` guard kept (294-295); main() exit gate
checks `ready_to_run` (459). Codex copy BYTE-IDENTICAL; gitlab/gitea ports differ only by forge tokens.

## 4. Cross-edition parity — VERIFIED
- codex adaptive-node BYTE-IDENTICAL to canonical; gitlab/gitea ports normalize to byte-identical after
  the `kaola-{forge}-workflow → kaola-workflow` rename (zero non-rename diffs). Ports `--help` resolve.
- install.sh: all 3 SUPPORT_SCRIPT_NAMES arrays include the new script (lines 157/183/213).
- validate-script-sync COMMON_SCRIPTS includes kaola-workflow-adaptive-node.js (line 59; "15 common
  scripts in sync"). Contract validators (both forks) assert the script exists + repin `ready_to_run`.

## 5. Prose consistency — VERIFIED
- adapt.md / SKILL: no longer dispatch first_node.role — route DIRECTLY to /kaola-workflow-plan-run;
  handoff prose updated ("does NOT open node1 or record the node1 baseline").
- plan-run.md wires all 5 subcommands (orient/open-next/record-evidence/close-and-open-next/write-halt)
  and preserves governance/resume/caps/quorum/completion (53 governance lines retained).
- workflow-planner.toml describes ready_to_run.
- No stale `ready_to_dispatch_first_node` in LIVE code assertions (only in CHANGELOG/ADR/archive history
  and two stale leading COMMENTS in the walkthrough — see nits).

## 6. Tests — VERIFIED non-vacuous
test-adaptive-node.js: 104 assertions, exercises real core via injected seams. Covers barrier-fail-no-
advance (T15), selector-arm-before-advance (T17), consent-dual-marker+idempotency (T18), evidence-shape
by role, allowFrom transitions. test-adaptive-handoff.js: 58 assertions, asserts ready_to_run. Walkthrough
handoff asserts updated to ready_to_run; explore ledger row asserted to REMAIN pending after handoff.

## 7. Issue AC — MET
(1) /kaola-workflow-plan-run is sole owner incl. first node — open-next opens node1; (2) script
transactions replace contractor brackets — 5 typed subcommands in plan-run.md; (3) adapt stops
dispatching the first node — routes to plan-run.

---

## Non-blocking nits (do not affect the verdict)

- **[LOW] spliceComplianceRow is not idempotent** (adaptive-node.js:176-211). A crash-replay double
  `close-and-open-next` appends a DUPLICATE compliance row (confirmed: row count 1→2 on re-close).
  NON-BLOCKING: the adaptive core (plan-validator/next-action/commit-node) never reads this table; it is
  outside the plan_hash region (Meta+Nodes only); the only structured reader (repair-state.complianceRows)
  is a phase-file reader using dup-tolerant .some()/.every() semantics. Cosmetic only. Contrast the ledger
  splice, which IS idempotent. Optional: add a "row already present" guard.
- **[LOW] advance-baseline failure is reported, not refused** (adaptive-node.js:625-636). If the NEWLY
  opened next node's `--start` baseline fails, it returns `baselineRecorded:false` (vs runOpenNext:446
  which refuses). NON-BLOCKING and self-healing: the next `close-and-open-next` on that node refuses at
  the barrier (`no recorded per-node base` — confirmed empirically), and orient/resume detects the
  in_progress node. plan-run step 4 instructs the session to read the result.
- **[LOW] dead-but-harmless selector_invalid branch** (adaptive-node.js:571-578). commit-node folds
  selectorPass into overallOk, so a bad selector already surfaces as `barrier_failed` (530) before this
  branch is reached. Harmless redundancy.
- **[LOW] stale comments** in simulate-workflow-walkthrough.js:7093,7322 still say
  `ready_to_dispatch_first_node`; the actual assertions correctly use `ready_to_run`. Comment-only drift.

## Validation evidence
- `node scripts/test-adaptive-node.js` → 104 assertions, exit 0
- `node scripts/test-adaptive-handoff.js` → 58 assertions, exit 0
- `node scripts/simulate-workflow-walkthrough.js` → passed
- `npm test` → green across claude/codex/gitlab/gitea (15 common scripts in sync; all contract validators
  pass; all walkthroughs pass)
- Empirical end-to-end: RED-only tdd refuse, no-baseline barrier refuse, valid close (node→complete,
  next→in_progress, baseline recorded), double-close idempotency probe.
