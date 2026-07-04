# Workflow Plan — issue 616

<!-- plan_hash: 95e4c5fb50ad4ffae09c835f6e0c7015ccb09c722cc5b1a4feb09feac2212670 -->

## Meta
speculative_open_policy: auto
labels: area:scripts
validation_command: npm test

## Plan Notes

**Goal (616).** Follow-up from #615. The #615 fix added a `parentClean` precondition
(`parentCarriesProductionDirt`, the same `--parent-clean-check` fence the last-member close runs)
that gates lane-group formation in `runOpenReady` at two sites. On the SPECULATIVE-write path an
excluded write already surfaces `speculativeWriteExcluded: { reason: 'parent_dirty', ... }`. On the
NON-speculative co-open path (`scripts/kaola-workflow-adaptive-node.js`, the
`liveNodes.length === 0 && writeNodes.length > 0` branch), when `parentCarriesProductionDirt`
returns true the code falls into the plain single-serial-write `else` branch — silently, with NO
field distinguishing a `parent_dirty` degrade from an ordinary serial choice (e.g. only one write
node was ready). A persistently broken/misconfigured fence could therefore serialize every write
frontier forever with zero telemetry. Fix: attach a `serialDegradeReason: 'parent_dirty'` field to
the SUCCESSFUL-open response when the non-speculative co-open degraded to a single serial write
*because* the parent-clean fence returned non-`pass`, mirroring the existing `speculativeWriteExcluded`
pattern — absent for the pre-existing plain single-write-node / cap-1 / not-leg-capable degrades.

**Where the change lands (the one subtlety).** The gating condition is
`if (legCoupled && writeNodes.length >= 2 && !parentCarriesProductionDirt(...))`. The `&&` is
short-circuit, so `parentCarriesProductionDirt` (a validator subprocess spawn) runs at most once and
ONLY when a group could actually form. The reason must be captured from THAT single evaluation
(hoist the fence result into a local — do NOT call the fence a second time in the `else` branch, which
would double-spawn the subprocess and could even disagree with the first result). Only the
`parent_dirty` (fence-non-`pass`) cause sets `serialDegradeReason`; the `!legCoupled` and
`writeNodes.length < 2` legs of that same `else`, and the `groupCeiling < 2` / `!grp.ok` degrades
inside the taken branch, remain unlabeled (they are ordinary serial choices, not a masked bug). Thread
the field conditionally into the success return object next to
`...(speculativeWriteExcluded ? { speculativeWriteExcluded } : {})` so the serial/read/co-open paths
that do NOT degrade for this reason stay byte-identical.

**Write set — generated-aggregator port split.** `kaola-workflow-adaptive-node.js` is a
GENERATED_AGGREGATOR (`scripts/edition-sync.js`), so the canonical edit regenerates its three edition
ports; per the `generated_port_split` freeze wall all four edition files ride in ONE node: the
canonical `scripts/kaola-workflow-adaptive-node.js`, the codex twin
`plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`, and the two forge ports
`plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{gitlab,gitea}-workflow-adaptive-node.js`
(regenerated via `edition-sync`, byte-identity re-verified by the codex/gitlab/gitea chains). The unit
test `scripts/test-adaptive-node.js` (canonical-only, claude chain) rides in the SAME node because it
is this node's RED/GREEN oracle.

**Test-first (tdd-guide, not implementer).** A meaningful failing unit test exists: extend the
existing `#615-MIXED` open-ready serial-degrade case (`scripts/test-adaptive-node.js`, ~line 6944)
to assert `r.serialDegradeReason === 'parent_dirty'` on the dirty-parent response, plus a negative
case asserting the field is ABSENT on a plain single-write-node / non-degrade open. RED before the
field is threaded, GREEN after. This is behavioral logic under test → `tdd-guide`.

### DAG shape / scheduling rationale

- **Linear pipeline, right-sized (no fan-out).** This is a single, cohesive, file-coupled telemetry
  addition — the canonical source + its 3 generated ports + its test MUST move atomically (a
  `generated_port_split` set), and the docs describe the field that node produces. There is no
  genuinely-independent second lane to co-open, so a wider fan-out would only fragment context for no
  makespan gain (CLAUDE.md precedence #3: cheapest sufficient mechanism). Serialize on the true
  dependencies only.
- **n3-docs is shaped for speculative-open.** `n3-docs` depends ONLY on the `n2-review`
  code-reviewer gate (its sole unsatisfied predecessor), writes an exactly-resolvable single path
  (`docs/api.md`, no PROTECTED file, not the sink) — so under `speculative_open_policy: auto` it is
  speculative-open-eligible and overlaps the review for free instead of idling behind it. The review
  is a high-probability-pass gate over a small mechanical telemetry diff. Depending on the gate (not
  on n1-telemetry) also guarantees the docs reflect the final reviewed field shape; a DISCARD-only
  teardown on the unlikely `verdict: fail` is acceptable for a one-file doc write. `serialDegradeReason`
  extends the `open-ready` response documented in `docs/api.md` (the speculative-open kernel / typed-
  outcomes section, alongside `speculativeWriteExcluded` + `parent_dirty`), so a `doc-updater` node is
  warranted (public/documented interface changed). It mirrors the existing `speculativeWriteExcluded`
  doc prose against the real added field — no invented schema.
- **n2-review (`code-reviewer`, reasoning) post-dominates every code-producing node on every path to
  the sink (G1).** `reasoning` because the review is reasoning-bound: verify the fence is evaluated
  exactly once (no double-spawn), that ONLY the `parent_dirty` cause is labeled (the `!legCoupled` /
  `<2` / cap-1 serial degrades stay unlabeled), that non-degrade paths stay byte-identical, and that
  the four generated editions are in byte-sync. It runs `validation_command` (the four chains — this
  is a cross-edition diff, #307) as the falsifiable proof.
- **No adversarial-verifier, security-reviewer, main-session-gate, or knowledge-lookup.** Additive
  telemetry field on a scheduler response — no sensitive label (`area:scripts` only → no G2), every
  acceptance check is a delegable unit test / contract chain (no non-delegable GPU/device/human gate →
  no `main-session-gate`), and every fact is local to `kaola-workflow-adaptive-node.js` + the existing
  `speculativeWriteExcluded` precedent (no external library/API knowledge → no `knowledge-lookup`).
  The `#615-MIXED`-extended unit test + the reasoning-tier reviewer + the four contract chains are a
  sufficient external oracle. No decision record: an additive telemetry field mirroring a shipped
  pattern is covered by CHANGELOG + commit provenance (cheapest sufficient mechanism).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-telemetry | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 5 | sequence | standard | — |
| n2-review | code-reviewer | n1-telemetry | — | 1 | sequence | reasoning | — |
| n3-docs | doc-updater | n2-review | docs/api.md | 1 | sequence | standard | — |
| n4-finalize | finalize | n3-docs | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-telemetry | complete |
| n2-review | complete |
| n3-docs | complete |
| n4-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-telemetry) | subagent-invoked | evidence-binding: n1-telemetry 77fa0e7ecc32 | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review 976308c390c4 | |
| doc-updater (n3-docs) | subagent-invoked | evidence-binding: n3-docs 552e01eb4f5e | |
