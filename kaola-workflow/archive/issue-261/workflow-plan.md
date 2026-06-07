# Adaptive Workflow Plan — issue-261

<!-- plan_hash: 00130adcd591a3a0738da68bbaa13f444528a8427cec1fed9701898c37663f49 -->

adaptive: close the archive-pollution blind spot in the Phase-6 staging safety nets (#261, relates
to #231 / #260). Three coordinated fixes, each with regression coverage: (1) narrow `cmdFinalize`'s
broad `git add -A kaola-workflow/` (claim.js:915, linked-worktree `--keep-worktree` path) to the
finalized project's own archive + rename + roadmap mirror so a stray foreign `kaola-workflow/archive/<other>/`
is never swept onto a branch; (2) give the script-enforced #231 merge gate teeth — scope down the
blanket `isWorkflowArtifact` exemption in `--barrier-check` so an `archive/<X>/` write is exempt ONLY
when `<X>` is the finalized project, refusing a foreign-project archive write (this is the issue's
headline complaint: today the gate is blind in the archive band); (3) tighten the Phase-6 Staging
Guard prose so it detects a staged foreign `archive/<other>/` dir and emits a typed block.

Disjointness reality (top-level-dir granularity): claim.js and plan-validator.js are COMMON_SCRIPTS
byte-mirror pairs (validate-script-sync.js) — each pair MUST live in ONE node spanning `scripts/`+`plugins/`;
the phase6.md edits span `commands/`+`plugins/`. Every write node funnels through `plugins/`, so the
three implement nodes COLLIDE pairwise and are SERIALIZED — no safe write-side fanout exists here. The
read-only design node and the docs node sit on their own zero-/disjoint-blast-radius lanes. G1:
code-reviewer post-dominates all three code producers. G2: the carve-out modifies the #231 merge gate
itself (sensitive) and labels include area:scripts/area:workflow-phases, so security-reviewer
post-dominates. doc-updater updates the documented staging/exemption contract (docs/architecture.md,
docs/api.md) before the unique docs/state finalize sink (CHANGELOG.md only). Verification target is
full `npm test` (the gitlab/gitea contract validators + validate-script-sync byte-identity run only
there, not under simulate-workflow-walkthrough.js alone) — the AC's "×4 editions green".

## Meta

labels: bug, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| design | code-architect | — | — | 1 | sequence |
| narrow-finalize | tdd-guide | design | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| gate-carveout | tdd-guide | narrow-finalize | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, scripts/test-commit-node.js | 1 | sequence |
| staging-guard | implementer | gate-carveout | commands/kaola-workflow-phase6.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md | 1 | sequence |
| review | code-reviewer | staging-guard | — | 1 | sequence |
| security | security-reviewer | review | — | 1 | sequence |
| docs | doc-updater | security | docs/architecture.md, docs/api.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
| --- | --- |
| design | complete |
| narrow-finalize | complete |
| gate-carveout | complete |
| staging-guard | complete |
| review | complete |
| security | complete |
| docs | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (design) | subagent-invoked | # design (code-architect, read-only) — blueprint for #261 archive-pollution fix | |

| tdd-guide (narrow-finalize) | subagent-invoked | # narrow-finalize (tdd-guide) — AC2: cmdFinalize stages only finalized project's | |
| tdd-guide (gate-carveout) | subagent-invoked | # gate-carveout (tdd-guide) — AC3: --barrier-check refuses foreign-project archi | |
| implementer (staging-guard) | subagent-invoked | # staging-guard node evidence — issue-261 | |
| code-reviewer | subagent-invoked | verdict: pass | |
| security-reviewer | subagent-invoked | verdict: pass | |
| doc-updater (docs) | subagent-invoked | # docs (doc-updater) — document the shipped #261 contract behavior | |
| finalize (finalize) | subagent-invoked | # finalize (terminal sink) — Phase-6 validation evidence for #261 | |
## Design Notes

Goal (AC mapping):
- AC1 (stray foreign `archive/<other>/` not committed and/or typed-blocked): covered by the
  `staging-guard` prose tightening AND the `gate-carveout` script teeth — defense in depth.
- AC2 (`cmdFinalize` stages only the finalized project's archive + rename + roadmap mirror): the
  `narrow-finalize` node replaces `git add -A kaola-workflow/` (claim.js:915) with explicit
  path adds — `kaola-workflow/archive/<project>/`, the `kaola-workflow/<project>/`→archive rename,
  `kaola-workflow/.roadmap/`, `kaola-workflow/ROADMAP.md`.
- AC3 (`--barrier-check` refuses a foreign-project archive write): the `gate-carveout` node scopes
  the `isWorkflowArtifact` exemption (plan-validator.js ~:355-374) to exempt `archive/<X>/` only
  when `<X> == {finalized project}`, else refuse.
- AC4 (×4 editions green): verified by full `npm test`, NOT simulate-workflow-walkthrough.js alone.

Node roles / shape rationale:
- design (code-architect, read-only): a non-trivial change touching a script-enforced merge gate
  across multiple editions; settle the carve-out's "finalized project" derivation and the exact
  narrowed add-set before any edit. No write set.
- narrow-finalize (tdd-guide): a stray-foreign-archive-not-staged assertion is a clean failing
  test first (simulate suite). Edits the claim.js byte-mirror PAIR (both copies in one node so
  validate-script-sync stays byte-identical) + simulate-workflow-walkthrough.js regression.
- gate-carveout (tdd-guide): a foreign-project `archive/` write → `--barrier-check` refuse is a
  clean failing test first (test-commit-node.js drives the barrier choreography). Edits the
  plan-validator byte-mirror PAIR + test-commit-node.js regression.
- staging-guard (implementer; non_tdd_reason: the Staging Guard is bash-embedded-in-markdown
  command prose across 3 editions — there is NO natural failing UNIT test for a markdown command
  body; it is documentation/prose wiring, not behavioral logic). 3 phase6.md editions kept in
  lockstep.
- review (code-reviewer): G1 — post-dominates the three code/prose producers.
- security (security-reviewer): G2 — the carve-out hardens the #231 merge gate (sensitive);
  labels area:scripts/area:workflow-phases. Post-dominates the change.
- docs (doc-updater): the staging/exemption contract is documented in docs/architecture.md and
  docs/api.md; update before finalize since public/internal contract behavior changed.
- finalize (finalize): unique docs/state sink — CHANGELOG.md only.
