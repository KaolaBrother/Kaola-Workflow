# Node: explore (code-explorer) — issue #251

Read-only exploration. Implementation map for the verdict-gate change. Evidence persisted by the
orchestrator (code-explorer is read-only; no RED/GREEN — non-tdd-guide node, barrier = zero source writes).

## 1. `--gate-verify` is the template for `--verdict-check`
`scripts/kaola-workflow-plan-validator.js`:
- Pure core `verifyGateExecution(content, opts)` — lines 299-328. Calls `parseNodes` + `parseLedger`,
  returns `{ ok, unsatisfied: [{requirement, reason}] }`. Mirror as new pure `verifyVerdictBlock`.
- `--gate-verify` CLI handler — lines 751-756 (parse args, print JSON, `process.exitCode = 1` on fail).
- `flagVal` helper — line 791: `const flagVal = name => {...}` → use `flagVal('--node-id')`.
- `--barrier-check` handler — lines 790-834 (sibling flag-taking pure-read pattern; takes `--node-id`).
- Help text — lines 708-721 (add a `--verdict-check --node-id <id>` line).
- `module.exports` — lines 858-872 (export `verifyVerdictBlock`).
- Proposed return shape: `{ ok, nodeId, verdict: 'pass'|'fail'|null, findings_blocking, reason? }`.

## 2. `parseNodeVerdict` placement — `scripts/kaola-workflow-adaptive-schema.js` (213 lines)
- MUST NOT use `classifier` (renamed in forks); native regex only.
- Anchor: `readDurableConsentHalt` lines 79-88 — add `parseNodeVerdict` immediately after, same pattern.
- Token-set style to mirror: `LEDGER_STATUSES` (l.39, Object.freeze), `ESCALATION_MARKERS` (l.62-66),
  `CONSENT_HALT_MARKER='consent_halt: pending'` (l.74).
- New: `VERDICT_PASS='pass'`, `VERDICT_FAIL='fail'`, `VERDICT_VOCABULARY=Object.freeze([...])`.
- `parseNodeVerdict(cacheText)` → `{ found, verdict: 'pass'|'fail'|null, findings_blocking: number|null }`.
  Regex matches bare top-level lines `verdict: pass|fail` and `findings_blocking: N` (NOT inside fences/quotes).
- `module.exports` lines 181-212: add the constants + parser. BYTE-IDENTICAL ×4 (write once, copy verbatim).

## 3. `commit-node.js` wiring (196 lines)
- JSON schema comment lines 18-22: add `verdictCheck:object|null`.
- `combineResults` lines 77-116 (pure): destructure adds `verdictCheck` (l.80); per-node branch (l.89-97)
  = informational; whole-plan branch (l.98-105) = blocking (mirror `gateVerify`).
- Per-node-end branch lines 175-179: after the barrier/gate shell-outs, add
  `verdictCheck = shellValidator(validatorPath, planPath, ['--verdict-check','--node-id',nodeIdValue,'--json']);`
- **DESIGN DECISION (resolved): role-gating lives IN the validator, not commit-node.** commit-node stays
  role-blind. `--verdict-check` reads the node's role from the plan `## Nodes` (it has the plan path):
  if role ∈ {code-reviewer, security-reviewer, adversarial-verifier} require a parseable verdict
  (fail-closed on fail/missing/unparseable); else `{ ok:true, found:false }` (self-skip). Matches issue B2.
- Sync: `COMMON_SCRIPTS` → byte-identical `scripts/` ↔ `plugins/kaola-workflow/scripts/` (×2). Gitlab/gitea
  ports manual (only diff: `VALIDATOR='kaola-{forge}-workflow-plan-validator.js'`, gitlab port l.33).

## 4. Phase-6 merge gate — `commands/kaola-workflow-phase6.md`
- Adaptive barrier block lines 28-35: add `node ... "$PLAN" --verdict-check --json; VC=$?` before the `if`,
  extend condition `|| [ "$VC" -ne 0 ]`, add `verdict=$VC` to the echo. Prose bullet near l.38-45.
- Mirror to `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md` (gitlab validator name) and
  `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md` (gitea validator name). NO claude SKILL phase6.

## 5. `.cache/{node-id}.md` verdict block — agent emission
Fence-free greppable block at top level:
```
verdict: pass
findings_blocking: 0
```
- `agents/code-reviewer.md` (333 lines): `## Review Summary` table ends `Verdict: APPROVE|WARNING|BLOCK`
  (l.284-297); add emit instruction before `## Approval Criteria` (l.299). APPROVE/WARNING→pass, BLOCK→fail.
- `agents/profiles/higher/code-reviewer.md`: byte-identical except `model: opus` — same addition.
- `agents/security-reviewer.md` (+ higher): no machine token today (ends ~l.110-127); add block + define
  prose→pass/fail mapping explicitly.
- `agents/adversarial-verifier.md` (100 lines): existing `## Verdict REFUTED|NOT-REFUTED` l.92-94; output path
  is `.cache/adversarial-verifier-{claim-id}.md` (per-instance), NOT `.cache/{node-id}.md`.
  **DESIGN DECISION: REFUTED→verdict: fail, NOT-REFUTED→verdict: pass.** For a fan-out, `--verdict-check`
  globs the sibling `.cache/adversarial-verifier-*.md` files and applies `majority-refute` (issue B2);
  a single (non-fanout) verifier reads `.cache/{node-id}.md`. NOTE: issue-251's OWN plan has NO
  adversarial-verifier node (only a single `code-reviewer` review node) — fanout tally must still be
  implemented + unit-tested, but is not exercised by our own run.

## 6. Cross-edition sync — `scripts/validate-script-sync.js`
| File | Editions | Mechanism |
|------|----------|-----------|
| adaptive-schema.js | ×4 all forges | BYTE_IDENTICAL_GROUPS (l.94-107) — enforced |
| plan-validator.js | ×2 (root + plugins/kaola-workflow) | COMMON_SCRIPTS (l.52) — enforced |
| commit-node.js | ×2 | COMMON_SCRIPTS (l.55) — enforced |
| kaola-{gitlab,gitea}-workflow-plan-validator.js | ×1 each, MANUAL | no guard |
| kaola-{gitlab,gitea}-workflow-commit-node.js | ×1 each, MANUAL | no guard |
`node scripts/simulate-workflow-walkthrough.js` catches the enforced ×2/×4; forge ports have NO guard — port by hand.

## 7. Part A — 3 over-promising claims (in 4 files each: root cmd + gitlab cmd + gitea cmd + claude SKILL)
- **dry_streak**: `commands/kaola-workflow-plan-run.md` l.239-240 "script-decidable `dry_streak` convergence
  cap layered under the mandatory static `LOOP_CAP`" (SKILL l.145). No script computes dry_streak → reword to
  agent-tracked; only the static cap is script-enforced.
- **quorum/decision node + validateNodeOutput**: cmd l.229-240 "each child verdict passes a
  `validateNodeOutput()` schema checkpoint" (SKILL l.137-144). Reword: tally is orchestrator prose; the schema
  check becomes real via `--verdict-check` (Part B) for the gate/verifier roles.
- **validateNodeOutput checkpoints**: cmd l.225-227 "Only the quorum tally and the `validateNodeOutput`
  schema checkpoints remain agent-discipline prose" (SKILL l.132-135). Reword: drop validateNodeOutput as a
  fictional script; state the real remaining agent discipline.
Same line numbers in gitlab + gitea command copies.

## 8. Tests — `scripts/simulate-workflow-walkthrough.js` (6441 lines)
- `assert(condition, message)` helper l.21-23.
- Template: `testAdaptiveGateBarrierEnforcement` l.1033-1172 (pure core in-memory + CLI via execFileSync +
  real temp git repo). Also `testAdaptivePerInstanceBarrier` l.1178-1235.
- New `testAdaptiveVerdictCheck`: (1) `parseNodeVerdict` pure (pass/fail/missing/malformed); (2)
  `verifyVerdictBlock` pure (in-memory plan + synthetic cache, incl. role-gating + fanout majority-refute);
  (3) `--verdict-check` CLI via execFileSync on a temp `.cache/{node-id}.md`; (4) missing cache for a gate
  role → `{ok:false}` fail-closed; non-gate role missing → `{ok:true,found:false}`.
- Invocation: add `testAdaptiveVerdictCheck()` before the `console.log('Workflow walkthrough simulation passed')` (~l.6430).

## Build order recommendation
schema (parseNodeVerdict) → validator (verifyVerdictBlock + --verdict-check, role-gating + fanout tally) →
commit-node (shell --verdict-check per-node) → agents (emit block) → phase6 (merge gate) → docs+tests.
Part A is independent and could land first. After every schema edit: copy verbatim ×4. After every
validator/commit-node edit: copy ×2 (COMMON_SCRIPTS) + manual-port gitlab/gitea.
