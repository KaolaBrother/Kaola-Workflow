# Workflow Plan — issue-671

<!-- plan_hash: 3240aa696abfa7aafeb39fee1e97fa9452101027fde7d7c33d2b21eb80eafba9 -->

## Meta
speculative_open_policy: auto
labels: bug, area:scripts
validation_command: npm test

Fix a fail-open OBSERVABILITY bug (#671, low severity — the fail-open is BY DESIGN and MUST be
preserved). `refreshTaskMirror` (`scripts/kaola-workflow-adaptive-node.js:463`) regenerates
`workflow-tasks.json` by SHELLING the task-mirror CLI and deliberately fail-opens on the child's
non-zero exit (a mirror write must never block a run). But the child's write —
`fs.writeFileSync(outPath, json, 'utf8')` at `kaola-workflow-task-mirror.js:143`, inside the CLI
`main()` with NO local try/catch — throws EISDIR when `workflow-tasks.json` collides with a
directory, so the child crash-prints a raw multi-line stack trace to stderr (the `#588-TASKMIRROR`
+ `#437-lane` fixtures in `test-adaptive-node.js` reproduce ~4 such traces; the suite still exits
0). Two harms: (1) the stack trace is noise that can MASK a real failure in a long test log; (2) a
production EISDIR silently skips the state mirror with only stderr noise.

Fix (S, low): catch the write fault at the SOURCE — wrap `task-mirror.js`'s `writeFileSync` (:143)
so an EISDIR/collision emits a concise ONE-LINE refusal via the script's already-imported
`emit`/`refuse` shared envelope (line 30) — the same envelope it already uses for
`refuse('plan_not_found', ...)`, `refuse('plan_not_frozen', ...)`, etc. — and exits non-zero
WITHOUT a raw stack trace, KEEPING the fail-open (the invoker `refreshTaskMirror` still swallows the
non-zero exit). No `adaptive-node.js` touch is required: the #355 mechanism already surfaces the
child's stdout `reason` (`refreshTaskMirror` returns `{ status: 'failed', reason: (res && res.reason)
|| null }`), so the new one-line envelope on stdout is consumed cleanly with no invoker change.

A small, surgical, well-scoped observability fix — one coherent write-fault guard applied across the
4 task-mirror edition copies plus one regression in the sibling collision-test home. A serial spine
is correct: fix (tdd-guide, genuine RED-then-GREEN) → code-review (G1) → terminal finalize sink.
This is a cross-edition diff (task-mirror ships in 4 editions), so all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains (the recorded
`validation_command: npm test`) must be green, run SERIALLY, before finalization.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-mirror-guard | tdd-guide | — | scripts/kaola-workflow-task-mirror.js, plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-task-mirror.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-task-mirror.js, scripts/test-adaptive-node.js | 5 | sequence | standard | — |
| n2-review | code-reviewer | n1-mirror-guard | — | 1 | sequence | reasoning | — |
| n3-finalize | finalize | n2-review | CHANGELOG.md | 1 | sequence | — | — |

## Plan Notes

- **Session directive (/goal), recorded for dispatch:** the reasoning-tier reviewer-class node
  (`n2-review`) carries **model fable at dispatch time** per the operator goal ("fable model for
  reviewer subagents"); the `model` column above stays in-grammar (`reasoning`/`standard`) because
  `fable` is not a `NODE_MODEL_TIERS` token (it would trip `model_invalid`). The executor applies the
  fable override at dispatch.
- **Edition class of `kaola-workflow-task-mirror.js` — COMMON byte-mirror + RENAME-normalized forge
  ports (NOT a GENERATED aggregator).** It is a `COMMON_SCRIPTS` entry (`validate-script-sync.js`
  L69), so the codex twin `plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js` is
  BYTE-IDENTICAL to canonical and `npm run sync:editions` (`edition-sync.js --write` COMMON_SCRIPTS
  branch) copies canonical → codex. The gitlab/gitea copies are EDITION-NAMED forge hand-ports
  (`kaola-gitlab-workflow-task-mirror.js`, `kaola-gitea-workflow-task-mirror.js`) that are explicitly
  NOT byte-synced (`validate-script-sync.js` L68) — the same one-line guard must be HAND-APPLIED to
  both. It is ABSENT from `GENERATED_AGGREGATORS`, so `generated_port_split` does NOT apply and this
  4-way declaration is not machine-forced — it is declared because the change is genuinely
  cross-edition. Sequence: edit canonical → `npm run sync:editions` (syncs codex twin) → hand-apply
  to both forge ports → `node scripts/edition-sync.js --check` clean.
- **Fix body is edition-identical.** All 4 copies already import `{ emit, refuse }` from the
  byte-identical `kaola-workflow-adaptive-schema` (line 30 — the require is NOT forge-renamed) and
  all have the same `writeFileSync(outPath, json, 'utf8')` at :143, so the try/catch guard uses only
  already-in-scope functions and is structurally the same in every edition (no forge-namespace token
  concern; no plugin agent/command/skill prose touched).
- **No adversarial-verifier — deliberate (axiom 3: cheapest sufficient mechanism).** Unlike #669 (a
  correctness/safety-fence FLIP) or #670 (a wedge-class `plan_hash` fence-parity bug where an
  adversary had historically constructed a surviving decoy), this is stderr HYGIENE that PRESERVES an
  intentional fail-open. The failure mode of a bad fix is bounded and non-silent (a broken fail-open
  would surface as a red chain / blocked run, not a masked correctness defect), and the contract to
  verify — "one-line envelope, non-zero exit, fail-open still swallowed by the invoker" — is a
  direct-read review target, not a decoy-construction search. A single reasoning-tier `code-reviewer`
  G1 gate is the sufficient skeptic; an independent adversary would be overkill.
- **G1 post-dominance holds.** `n2-review` (code-reviewer) post-dominates the sole code-producing
  node `n1-mirror-guard`, and `n3-finalize` depends on `n2-review`, so every path from the writer to
  the sink passes through the review gate. No G2 (`security-reviewer`): `labels: bug, area:scripts`
  is not security-sensitive and the change touches no auth/secrets/crypto/network surface.
- **Cross-edition four-chain obligation.** task-mirror ships in 4 editions → Finalization requires
  all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green, run SERIALLY (a
  green claude chain alone is insufficient — `npm test` short-circuits on the first `&&` failure, so
  a red codex/gitlab/gitea behind a green claude is never reached). `scripts/test-adaptive-node.js`
  (the regression home) runs only in the claude chain; the codex byte-identity and the forge
  rename-ports are exercised by `edition-sync.js --check` + the forge contract validators + the forge
  walkthroughs in the codex/gitlab/gitea chains.
- **No decision record.** A low-severity observability fix that preserves an existing intentional
  fail-open — not a value/standing/irreversible call. Provenance belongs in `CHANGELOG.md` + the
  commit message, not a `D-671-NN` record. (Verified: no existing D-671 records or mentions.)
- **Evidence discipline:** every node's evidence lands at
  `kaola-workflow/issue-671/.cache/<node-id>.md` (absolute path at dispatch; never a bare
  `.cache/<id>.md` at the worktree root). `.cache/` is a barrier-exempt band, so it is not declared
  in any write set.

## Node Briefs

### n1-mirror-guard

Test-first (genuine RED-then-GREEN — this is why `tdd-guide`, not `implementer`). Read the sibling
collision fixtures FIRST so the regression follows the established harness: the direct-shell S3 test
at `scripts/test-adaptive-node.js` ~L4470 (`shellNode(tmPath, ...)` on the real
`kaola-workflow-task-mirror.js`, already asserting a refusal `reason` is recovered from STDOUT) and
the `#588-TASKMIRROR-FAILOPEN` block ~L7921 (which `fs.mkdirSync(...workflow-tasks.json)` to force
the EISDIR collision and pins the fail-open). Read `refreshTaskMirror`
(`scripts/kaola-workflow-adaptive-node.js` ~L463) to confirm the invoker already surfaces
`res.reason` — so NO `adaptive-node.js` change is needed.

RED FIRST — add a regression (extend the S3 direct-shell home) that builds a temp project with a
FROZEN `workflow-plan.md` and `workflow-tasks.json` created as a DIRECTORY, then shells the real
`kaola-workflow-task-mirror.js --project <p> --json` directly and asserts: (a) exit is non-zero;
(b) STDOUT carries the one-line `emit`/`refuse` envelope (`result: 'refuse'` with a write-fault
`reason` — pick a stable reason token, e.g. `mirror_write_failed`); (c) STDERR contains NO
multi-line stack trace (no `\n    at ` V8 stack frames — assert the absence of `/\n\s+at /` and/or
that stderr is at most a single concise line). Against the CURRENT code this MUST be RED: the
unguarded `writeFileSync` throws EISDIR → Node crash-prints a multi-line stack to stderr and emits
NO stdout envelope.

GREEN — the fix, applied identically to ALL 4 task-mirror edition copies: wrap the
`fs.writeFileSync(outPath, json, 'utf8')` at :143 in a try/catch; on catch, `emit(refuse('<stable
reason>', { status: '<stable reason>', path: outPath, code: e.code, message: e.message }))` (mirror
the existing `refuse('plan_not_found', ...)` shape, one compact line) and `process.exit(1)` — a
non-zero exit with NO raw stack trace, KEEPING the fail-open (the invoker still swallows it). Do NOT
alter the success path, the exported `generateMirror`/`mapLedgerStatus` core, or `refreshTaskMirror`.
On whether to "surface more loudly to the operator": the one-line stdout envelope is already
surfaced to the invoker's return via `res.reason` (and thus to the orchestrator) — that is the
primary loud-enough signal; you MAY add at most a single concise stderr warning line for a
direct-CLI operator, but NEVER a multi-line stack trace and NEVER anything that blocks the fail-open.
Keep it minimal.

Cross-edition: after the canonical edit run `npm run sync:editions` (byte-syncs the codex twin),
then HAND-APPLY the identical guard to both forge rename-ports
(`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-task-mirror.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-task-mirror.js`), and confirm
`node scripts/edition-sync.js --check` is clean. Verify locally: `node scripts/test-adaptive-node.js`
(RED before, GREEN after) and `node scripts/simulate-workflow-walkthrough.js`. Flag anything that
would widen this write set so the plan can be repaired BEFORE an overflow.

### n2-review

Code review of n1's diff (G1 gate; reasoning tier, dispatched on fable per the /goal directive).
Focus: (a) the EISDIR/collision write fault is caught at the SOURCE (`task-mirror.js:143` try/catch)
and emits a SINGLE-LINE `emit`/`refuse` envelope — NOT a raw multi-line stack trace — then exits
non-zero; (b) the FAIL-OPEN is genuinely PRESERVED: `refreshTaskMirror` still swallows the non-zero
exit and returns `status: 'failed'`, so a mirror-write fault never blocks or rolls back a ledger
transition (the #317/#588 contract); (c) the guard is NARROW — the success path, the exported
clock-free core (`generateMirror`/`mapLedgerStatus`), and the invoker are untouched; (d) the 4
edition copies are consistent (canonical ↔ codex twin BYTE-IDENTICAL; gitlab/gitea rename-ports
carry the same guard using their already-imported `emit`/`refuse`) and `edition-sync.js --check` is
clean; (e) the regression genuinely distinguishes old-vs-new (RED against the unguarded write, GREEN
after) and actually asserts the ABSENCE of a multi-line stack trace plus the presence of the
one-line envelope; (f) no forge-neutral prose concern (no plugin agent/command/skill prose touched).
Note the four-chain implication: the regression runs only in the claude chain; the codex/forge
copies are covered by `edition-sync.js --check` + the forge contract validators/walkthroughs.

### n3-finalize

Terminal sink (not a subagent — the main session runs Phase-6 as this node's evidence). CHANGELOG.md
entry under `[Unreleased]` describing the fix: task-mirror now catches an EISDIR/directory-collision
on `workflow-tasks.json` and emits a concise one-line warning instead of a raw stack trace, keeping
the deliberate fail-open (mirror-write faults never block a run); #671. This is a CROSS-EDITION diff:
record the four-chain receipt (`npm test`, run SERIALLY — the codex byte-identity + forge
rename-ports are checked by `edition-sync.js --check` and the forge chains, the regression by
`test-adaptive-node.js` in the claude chain) BEFORE finalize; then feature commit → run-chains
receipt (`--project issue-671`) → `cmdFinalize --keep-worktree` → push branch → sink-merge --sink
from the MAIN repo root. Verify the remote issue #671 actually CLOSED (a zero exit can still leave it
OPEN — re-check state and close manually if needed). Do not commit transient
sink-receipt/sink-fallback journals (terminal sinks self-dispose).

## Node Ledger

| id | status |
| --- | --- |
| n1-mirror-guard | complete |
| n2-review | complete |
| n3-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-mirror-guard) | subagent-invoked | evidence-binding: n1-mirror-guard e95390a29996 | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review 3d66e4812b23 | |
| finalize (n3-finalize) | main-session-direct | evidence-binding: n3-finalize b466f3d5314c | |
