# Workflow Plan — issue #287

<!-- plan_hash: c5ae8dd316b2d2ba67d176d58c86fe15b7a179916e57e0a6eccad62cef913426 -->

## Meta
labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| recon | code-architect | — | — | 1 | sequence |
| author-boundary | implementer | recon | agents/workflow-planner.md, commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md | 1 | sequence |
| pin-contracts | implementer | author-boundary | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js | 1 | sequence |
| code-review | code-reviewer | pin-contracts | — | 1 | sequence |
| doc-sync | doc-updater | code-review | docs/decisions/0006-planner-first-entry.md | 1 | sequence |
| finalize | finalize | doc-sync | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| recon | complete |
| author-boundary | complete |
| pin-contracts | complete |
| code-review | complete |
| doc-sync | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (recon) | subagent-invoked | # Recon Evidence — node `recon` (code-architect, read-only) — issue #287 | |

| implementer (author-boundary) | subagent-invoked | # Node Evidence — author-boundary (implementer) — issue #287 | |
| implementer (pin-contracts) | subagent-invoked | # Node Evidence — pin-contracts (implementer) — issue #287 | |
| code-reviewer | subagent-invoked | verdict: pass | |
| doc-updater (doc-sync) | subagent-invoked | # doc-sync node evidence | |
| finalize (finalize) | subagent-invoked | # Finalize node evidence — issue-287 (adaptive Phase-6 sink) | |
## Plan Notes

Non-author free-text (outside the `plan_hash`, which covers only `## Meta` + `## Nodes`).
Resume-safe specification of issue #287: enforce planner-first entry before any DAG shaping on the
adaptive path, and refuse a planner dispatch prompt that pre-authors the `## Nodes` DAG.

### This is a PROSE + CONTRACT-PIN task — there is no runtime-code lane

The decisive recon finding (verified before authoring this plan): **no script ever receives or
inspects the planner dispatch prompt.** Claude Code sets no env var distinguishing a dispatched
subagent from the main session, and `kaola-workflow-claim.js startup` is driven by the
`--attest-planner-spawn` back-fill flag, NOT by reading any prompt text. Therefore:

- Proposed change #2 (the `planner_control_boundary_violation` typed refusal) is **agent-profile
  behavioral prose** in `agents/workflow-planner.md` (the only actor that can read its own dispatch
  prompt is the planner itself), reinforced in the adapt command/skill docs, and **pinned by a
  contract test**. It is NOT a new `claim.js`/`plan-validator.js` code path — there is no prompt for
  a script to gate on.
- Proposed change #1 (relocate "missing roadmap evidence repair" out of the main session) and the
  task-list timing (AC5) are **main-session preflight prose** in `commands/kaola-workflow-adapt.md`
  (and its mirrors) being tightened/reassigned — a doc move, not a code path.
- Proposed change #5 (contract validation of the boundary tokens) is the ONLY `.js` write: token-pin
  assertions added to the contract validators.

Because there is no business-logic code path with a failing-unit-test-first character (an agent's
prose-driven refusal cannot be unit-tested in this hand-rolled harness), BOTH write nodes are
`implementer`, each with a recorded `non_tdd_reason`. `tdd-guide` would have no RED test to write.

### Node-by-node

- **recon** (`code-architect`, read-only, zero blast radius): produce the exact boundary-token
  placement map — which validator pins each of the 5 doc/agent files, the byte-mirror pair
  (`scripts/` + `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`) that
  `validate-script-sync.js` enforces, and the precise refusal vocabulary
  (`planner_control_boundary_violation`) + the repair-path carve-out wording (allowed ONLY when
  re-dispatching after `handoff_status: plan_invalid` on an unfrozen plan, with validator errors as
  repair context). De-risks the FROZEN write sets of the two write nodes. Read-only ⇒ no G1.

  IMPORTANT recon deliverable for AC6: `validate-workflow-contracts.js` today references the
  gitlab/gitea PHASE command docs but NOT the gitlab/gitea `kaola-workflow-adapt.md` command docs.
  AC6 says "command docs" (plural — all three editions: Claude + gitlab + gitea). So `pin-contracts`
  must likely ADD gitlab/gitea adapt-command boundary-token assertions, not merely extend an existing
  reference. Confirm the exact current coverage per edition before `pin-contracts` writes, so AC6 is
  not under-delivered by pinning only the Claude command.

- **author-boundary** (`implementer`, depends recon — `non_tdd_reason`: behavioral spec authored in
  agent-profile + command/skill markdown; the refusal is enforced by the planner reading its own
  prompt, which has NO unit-testable surface in this harness). Authors across 5 files (≤ FILE_CEILING
  6): (a) `agents/workflow-planner.md` — the `planner_control_boundary_violation` refusal + its
  return contract + the unfrozen-plan validator-repair carve-out, PRESERVING the locally-authored
  provenance comment (lines 7-14) so `validate-vendored-agents.js` stays green; (b)
  `commands/kaola-workflow-adapt.md` — planner-first ordering (main session must dispatch planner
  immediately after the allowed non-design preflight; must not pre-author nodes), and the
  orchestrator task-list created only after `ready_to_run` + reading the frozen plan (AC5); (c)+(d)
  the gitlab + gitea `commands/kaola-workflow-adapt.md` mirrors edited IDENTICALLY (keeps
  `validate-script-sync.js` green); (e) the codex `skills/kaola-workflow-adapt/SKILL.md` mirror.
  Covers AC1/AC2/AC3/AC4/AC5.

- **pin-contracts** (`implementer`, depends author-boundary — `non_tdd_reason`: adding `assertIncludes`
  token pins to existing contract validators is test-harness assertion wiring against tokens that
  the prior node just introduced; no RED-first behavior). MUST run AFTER author-boundary so the
  pinned tokens already exist — a pin authored before its token closes the node RED under
  `npm test`. Writes 3 validator files (≤6): `scripts/validate-workflow-contracts.js` + its
  `plugins/kaola-workflow/scripts/` byte-mirror (edited IDENTICALLY or `validate-script-sync.js`
  fails) to pin the boundary language in the Claude command doc AND add gitlab/gitea adapt-command
  assertions (see the recon deliverable above — those editions are NOT yet pinned for adapt) plus
  `agents/workflow-planner.md`; and `scripts/validate-kaola-workflow-contracts.js` to pin the codex
  skill mirror. Covers AC6.

### DAG shape rationale (fully serial — no write fan-out is possible here)

Every write node collides on a shared top-level lane: author-boundary writes under `agents/`,
`commands/`, `plugins/`; pin-contracts writes under `scripts/`, `plugins/`. The `plugins/` overlap
alone makes them non-disjoint at top-level-directory granularity, AND pin-contracts has a true data
dependency on author-boundary (its pinned tokens must exist first). So the two write nodes serialize
— there is NO batch-eligible write sibling to expose, and forcing one would trip `not_disjoint` or
bypass the doc→pin ordering. This is inherently serial work; the plan optimizes ORDER, not
parallelism.

The only zero-blast-radius slot is the upfront read-only `recon` (`code-architect`) — included
because the cross-edition boundary-token placement is non-trivial (5 doc surfaces + a byte-mirror
validator pair + 2 distinct contract validators), and a frozen write-set under-scope here cannot be
repaired after freeze (author-immutable). It is read-only ⇒ contributes nothing to G1.

### Gates

- **G1 — `code-review` (code-reviewer) post-dominates `pin-contracts`**, the only `.js`-producing
  node (contract-validator edits count as code). `author-boundary` is `.md`/agent-prose only and does
  not itself trip G1, but it is on the same single spine so the gate covers the whole code-producing
  reach. The two write nodes are NOT fanned out as gate siblings — a parallel path would bypass G1.
- **G2 — sensitivity**: labels are `enhancement, area:scripts, area:workflow-phases`. No
  auth/crypto/secret/network surface is touched; the validator derives G2 from the labels +
  write sets and decides whether `security-reviewer` is required. The plan does not preempt that
  decision — if the validator demands a `security-reviewer` post-dominator, the plan is out of
  grammar and gets repaired, never clamped. (Self-check confirmed G2 NOT triggered.)
- **`doc-sync` (doc-updater) before `finalize`**: public docs/interfaces change (the adaptive
  planner/main-session contract). The doc-updater records the new boundary in an ADR
  (`docs/decisions/0006-planner-first-entry.md`) and syncs the docs map; the user-visible CHANGELOG
  entry rides the `finalize` sink (docs/state-only write — `CHANGELOG.md`).

### AC → node coverage (no orphan)

- AC1 (transcript: target/preflight → planner dispatch, no prior node/task/write-set design) →
  author-boundary (adapt-doc ordering prose).
- AC2 (`workflow-planner` is first to author a complete `## Nodes`) → author-boundary.
- AC3 (mandatory full DAG + `AUTHOR EXACTLY` refused as `planner_control_boundary_violation`) →
  author-boundary (agent-profile refusal) + pin-contracts (token pin).
- AC4 (same prompt allowed only in the unfrozen-plan validator-repair path) → author-boundary
  (carve-out prose) + pin-contracts.
- AC5 (node task list created only after `ready_to_run` + reading the frozen plan) →
  author-boundary (adapt-doc task-list timing).
- AC6 (contract tests cover the boundary language in command docs, skill mirrors, and
  `agents/workflow-planner.md`) → pin-contracts.
