# Workflow Plan — issue-592

<!-- plan_hash: 14ef6996081ddaac26924ad540a39f8a452205d44c882fbb5a5b818515f923f1 -->

Bug fix (RED-first) for `sink-merge --sink`: the `--sink` transaction's `closure` step is
gated on the SINGULAR `--issue` flag (`kaola-workflow-sink-merge.js:1166`,
`if (!OFFLINE && args.issue != null)`). Invoked with only `--issue-numbers A,B` (a bundle sink
with no primary `--issue`), the entire close block is skipped yet execution falls straight through
to `stepDone('closure')` (`:1212`) — no forge issue close, no `workflow:in-progress` removal, but
the receipt reports `closure: done` and the transaction reports `status: sinked`. Because the
step-receipt marks closure done, a plain re-run resumes past the step and never retries, so the
miss is permanent (observed live 2026-07-02, bundle-587-589: both issues left OPEN while the sink
reported success).

**Fix (issue's option a + record the closed set):** run the close loop when
`args.issue != null` **OR** `args.issueNumbers` is non-empty; when the primary is null, iterate
the member set from `--issue-numbers` (the same probe-before-close + already-closed re-probe +
`closed`/`failed` bucketing the block already uses at `:1170-1190`); record the actually-closed
set into the receipt so a resume can VERIFY-then-retry rather than skip; keep the existing
fail-closed refuse (`sink_incomplete`, `step: closure`) on any genuine close failure. Single-issue
(`--issue N`) and bundle-with-primary (`--issue N --issue-numbers A,B`) invocations MUST remain
byte-for-byte behaviorally unchanged (AC3).

**Cross-edition scope (four-chain obligation).** `kaola-workflow-sink-merge.js` is a
HAND-PORTED data-layer forge script (NOT a GENERATED_AGGREGATOR): the codex twin
`plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` is BYTE-IDENTICAL to canonical
(`validate-script-sync.js` COMMON_SCRIPTS — enforced in the claude AND codex chains), while the
gitlab/gitea ports (`kaola-{gitlab,gitea}-workflow-sink-merge.js`) are hand-maintained forge ports
that mirror the SAME closure logic modulo the forge CLI — these are legitimate forge scripts, NOT
agent-facing prompt surfaces, so the forge-neutral prose ban does not apply. The one semantic fix
therefore lands atomically in all four editions in ONE node; the RED coverage lands in each chain's
sink-closure test (claude `test-bundle-finalize.js`; gitlab/gitea `test-{gitlab,gitea}-sinks.js`,
which drive the real `--sink` transaction closure). The codex chain needs no new test file — the
byte-identical fix is transitively proven by the canonical `test-bundle-finalize.js`, and the fix
only ADDS behavior for the primary-null case (existing single-issue/bundle assertions in
`simulate-kaola-workflow-walkthrough.js` stay green). All four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains must be green (run sequentially,
`KAOLA_RUN_CHAINS_CONCURRENCY=serial` on this host) before finalize.

## Meta

labels: bug, area:scripts
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix | tdd-guide | — | scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, scripts/test-bundle-finalize.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js | 7 | sequence | sonnet |
| n2-docs | doc-updater | n1-fix | CHANGELOG.md, docs/decisions/D-592-01.md, docs/api.md, docs/workflow-state-contract.md | 4 | sequence | sonnet |
| n3-review | code-reviewer | n2-docs | — | 1 | sequence | opus |
| n4-finalize | finalize | n3-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### DAG shape / scheduling rationale
- **Genuinely serial task, so a serial chain is correct (not under-decomposed):** fix → docs →
  review → finalize each truly depends on the prior. There is no independent write work to fan out
  (the four sink-merge editions + their tests are ONE semantically-coupled change and must move
  atomically), and no independent read frontier to overlap. Forcing parallelism here would burn
  context for zero makespan gain (design precedence #3: cheapest sufficient mechanism).
- **n1-fix is ONE tdd-guide node across all four editions + three test files.** The fix is a single
  semantic change (the closure gate + closed-set recording) replicated modulo forge nouns; the
  byte-identical root↔codex pair (COMMON_SCRIPTS) MUST stay byte-equal and the hand-ported forge
  pair mirrors the same logic — splitting them across nodes would be a cross-edition drift risk and
  a `validate-script-sync.js` red. tdd-guide (not implementer): the AC is explicitly RED-first — a
  `--sink --issue-numbers A,B` (no `--issue`) invocation currently leaves both issues open while
  reporting `closure: done`; the failing test is the oracle.
- **Model tiers:** n1-fix `sonnet` — a well-specified fix (the issue names option (a) + the exact
  gate line; the `--sink` closure step already has the closed/failed bucketing + `sink_incomplete`
  fail-closed pattern to extend). n3-review `opus` — the change touches an IRREVERSIBLE operation
  (forge issue-close + merge) and fail-closed/resume-retry semantics; a strong reviewer over a
  cheap-but-guided implementer is the right posture. No adversarial-verifier: the RED test is the
  falsification oracle and one opus gate is the cheapest sufficient correctness mechanism for a
  focused, well-specified fix.

### Gate coverage
- **G1 (code-reviewer post-dominance):** the only code-producing node is n1-fix; n3-review depends
  transitively on it via n2-docs (n1 → n2 → n3 → n4), so it lies on every path from n1 to the sink.
- **G2 (security-reviewer):** not triggered — labels `bug, area:scripts` are not sensitive, and no
  write-set path matches a SENSITIVE_PATTERN (no auth/token/secret/etc.). No security gate authored.
- **Unique sink:** n4-finalize (docs-only write: `CHANGELOG.md`).

### Write-set under-declaration guard (walked before freeze)
- **GENERATED forge ports:** N/A — `kaola-workflow-sink-merge.js` is NOT a GENERATED_AGGREGATOR
  (it is a hand-ported data-layer forge script); the `generated_port_split` wall does not apply.
  The four editions are still declared together for byte-sync + four-chain correctness.
- **Byte-identical SYNC-GROUP peer:** root ↔ codex sink-merge (COMMON_SCRIPTS) — both in n1-fix.
- **Test files the RED/GREEN touches:** `test-bundle-finalize.js` (claude), `test-gitlab-sinks.js`
  (gitlab, drives `--sink` transaction closure at ~:946/:1186), `test-gitea-sinks.js` (gitea) — all
  in n1-fix.
- **CONTRACT-validator pins:** none moved — no needle/count/allowlist changes (the fix is behavioral
  within existing scripts; no script added/removed, no agent-set delta).
- **`.cache` receipts:** exempt at the per-node barrier (`.cache/*.md`) — not declared.
- **Docs:** the sink closure receipt + `--sink` behavior is documented in `docs/api.md` § Closure
  Contract (and cross-referenced from `docs/workflow-state-contract.md`); both in n2-docs alongside
  `CHANGELOG.md` (### Fixed) and the new decision record for issue 592.

### Decision-record numbering
- The new decision record id for issue 592 is the next free id in the series (no record for this
  issue exists yet in `docs/decisions/`). n2-docs authors `docs/decisions/D-592-01.md`.

## Node Ledger

| id | status |
| --- | --- |
| n1-fix | complete |
| n2-docs | complete |
| n3-review | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix) | subagent-invoked | evidence-binding: n1-fix 8932b5303689 | |
| doc-updater (n2-docs) | subagent-invoked | evidence-binding: n2-docs f7030dba2b4b | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 26c285a6dba1 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 74d9e0fe3f8c | |
