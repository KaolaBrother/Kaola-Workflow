# Plan — issue 597: define the reserved `speculative_open_policy: auto` tier and flip the default off → auto

<!-- plan_hash: d72543a05c4debb9004eb208875da360f2bc8b7f22009347384ca6eaa7bd788b -->

## Meta

labels: enhancement
validation_command: npm test
validation_test_consumes: commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-engine | tdd-guide | — | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js, scripts/kaola-workflow-next-action.js, plugins/kaola-workflow/scripts/kaola-workflow-next-action.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-next-action.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-next-action.js, scripts/test-adaptive-node.js, scripts/test-adaptive-handoff.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js | 1 | sequence | opus |
| n2-prose | doc-updater | n1-engine | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, docs/plan-run-cards/speculative-open.md, docs/decisions/D-597-01.md | 1 | sequence | sonnet |
| n3-rubric | implementer | n1-engine | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, scripts/test-agent-profile-parity.js | 1 | sequence | sonnet |
| n4-adversarial | adversarial-verifier | n1-engine | — | 1 | sequence | opus |
| n5-review | code-reviewer | n1-engine, n2-prose, n3-rubric, n4-adversarial | — | 1 | sequence | opus |
| n6-finalize | finalize | n5-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

**Shape.** One cohesive engine node (n1) carries the whole cross-layer behavioral change plus its
tests, because the auto-tier behavior is only GREEN end-to-end when schema + validator + handoff +
next-action + adaptive-node all land together — the RED tests assert the flow (freeze accepts auto →
handoff materializes auto → next-action emits at auto → adaptive-node opens without the consent flag).
Splitting it by layer would leave every intermediate node RED and split a semantically-coupled
change. n2 (prose/ADR) and n3 (planner rubric) are exact-path-disjoint from n1 and from each other;
they depend on n1 so the documentation and the write-speculation authoring rubric are written against
the SETTLED engine (the operational-learnings prose references open-ready specifics and the discard
telemetry). This dependency costs no makespan (cross-edition antichains touching `plugins/`
serial-degrade at co-open today) and removes prose-drift risk. n4 is an independent read-only skeptic;
n5 is the G1 gate; n6 is the docs/state sink.

**n1 — auto-tier engine (tdd-guide, opus).** Reasoning-heavy and safety-critical.
- Schema (`kaola-workflow-adaptive-schema.js`, BYTE-IDENTICAL ×4 drift anchor — all four copies in
  this node, sync-group gap enforced): `SPECULATIVE_OPEN_POLICY_LEGAL = ['off','consent','auto']`;
  `SPECULATIVE_OPEN_POLICY_REFUSED_AT_FREEZE = []`; `SPECULATIVE_OPEN_POLICY_DEFAULT = 'auto'`.
- **Resume-safety subtlety (AC3 — get this right):** `parseSpeculativePolicy` must keep returning
  `off` for an ABSENT `## Meta` field, so it CANNOT simply return `SPECULATIVE_OPEN_POLICY_DEFAULT`
  (now `auto`) — the absence fallback must be decoupled (a fixed `off`), while the freeze-time
  materialization uses the `auto` DEFAULT. A naive `return DEFAULT` would retroactively flip
  in-flight plans frozen before this change to auto. Cover with a RED test: freeze a legacy plan
  (absent field) → resume must stay `off`.
- Validator (GENERATED_AGGREGATOR — canonical + codex twin + gitlab/gitea forge ports, all four in
  this node per generated_port_split): `auto` now accepted at freeze; unknown values STILL refuse
  with the typed `speculative_policy_unsupported` reason (AC6 — the `!LEGAL.includes()` check now
  narrows to unknown-only). Update the operator-hint text (drop "auto is deferred"); no contract
  validator pins that hint string (verified).
- Handoff (GENERATED_AGGREGATOR ×4): freeze-time Meta materialization (AC1) — when the author omits
  `speculative_open_policy`, the freeze injects an explicit `speculative_open_policy: auto` line into
  `## Meta`, hash-covered, visible in the frozen plan. Frozen plans become self-describing so posture
  cannot drift across an upgrade/resume.
- next-action (GENERATED_AGGREGATOR ×4): emit `speculativePending` at policy `auto` AND `consent`
  (today: `consent` only). `off` stays emission-omitted / byte-identical.
- adaptive-node (GENERATED_AGGREGATOR ×4): at `auto`, `open-ready` opens speculative-eligible members
  (read AND #596 leg-contained write) with NO `--speculative-consent`; the flag is accepted as a
  no-op (AC2). Every #596 safety condition holds identically at `auto` (AC4 — dedicated test that a
  condition-violating member is refused at `auto` exactly as at `consent`). Discard telemetry (AC5):
  on every speculative discard (read or write) record node id / gate / role in the run's durable
  state (extend the existing `appendProvenanceLog` discard path — runtime artifact, not a build-time
  write-set member).
- **O1 fold-in (in scope):** in `runOpenReady`/`selectSpeculativeWriteGroup`, the fail-closed branch
  that excludes ALL candidates on a crash/garbled non-open currently mislabels
  `speculativeWriteExcluded.reason` as `overlaps_live_writer`. Distinguish it with a
  `parallel_safe_indeterminate` reason (the genuine per-pair overlap keeps `overlaps_live_writer`).
  Telemetry accuracy matters more now that `auto` fires speculative writes routinely.
- Tests: `test-adaptive-handoff.js` (materialization), `test-next-action.js` (auto emission),
  `test-adaptive-node.js` (auto activation without flag, no-op flag, #596-condition-refusal at auto,
  discard telemetry, O1 reason). Walkthroughs ×6 exercise the handoff freeze path (materialization
  now injects the auto line) — mirror any assertion across all six editions (#307).

**n2 — prose + ADR (doc-updater, sonnet), docs-only.** The SIX plan-run surfaces (3 Claude commands +
3 Codex SKILL packs) describe the new posture: speculation ON by default under the structural net;
serial waiting on a gate is the degraded mode. Fold in the #597-comment operational learnings
(open-ready path vs fused serial advance; "no parent commits while a speculative leg is open" +
re-anchor recipe for `leg_base_unreachable`) into the speculative-open card. PRESERVE the
route-reachability pins: `<!-- CARD: speculative-open -->` + the `--speculative-consent` literal (T9)
and `<!-- PIN: leg-isolation-recipe -->` + `--write-overlap-consent` (T8); keep the SIX surfaces in
content parity (validate-*-contracts.js). ADR `docs/decisions/D-597-01.md` records the D-419-02 (existing)
consent-invariant supersession (ceremony retired; every mechanical invariant — close fence, discard
path, blast-radius conditions — untouched; operator-directed 2026-07-02). D-597-01 is the next free
number (verified: no D-597 record exists).

**n3 — planner write-speculation rubric (implementer, sonnet).** Code-producing via the `.toml`
twins. non_tdd_reason: agent-profile documentation carried in code-classified `.toml` mirrors plus a
token-presence parity guard — no behavioral unit under test. Update `agents/workflow-planner.md`'s
speculative-open rubric: it currently says "speculative open is NEVER permitted for a write node" —
post-#596 a leg-contained write node IS eligible; the rubric should encourage topology that EXPOSES
speculation (independent post-gate work authored as such) while keeping eligibility mechanical (no new
plan keyword). Mirror byte-identically into the three `workflow-planner.toml` twins (sync-group gap
enforced — all three declared). Update `test-agent-profile-parity.js` FEATURE_TOKENS if the pinned
substring `unsatisfied predecessor is a high-probability-pass gate` wording changes / add an auto-tier
token so md↔toml parity stays enforced.

**n4 — adversarial-verifier (opus), read-only change gate.** This change flips a run-wide default AND
supersedes a recorded consent invariant (D-419-02 (existing)), so an independent skeptic earns its cost
(precedence #1). Refute, against the engine: (a) does `auto` preserve EVERY #596 safety condition
(exact-disjointness, PROTECTED, sink, resolvability, leg-capability, caps, close fence, discard), or
does removing the consent gate open a hole? (b) resume safety — freeze a plan with an absent field,
"upgrade", resume: does it stay `off` (never retroactively auto)? (c) does the O1 relabel correctly
separate a crash/garbled non-open (`parallel_safe_indeterminate`) from a genuine live-writer overlap?
Has Bash — run the freeze/resume experiments and the four chains. Emit lowercase `verdict: pass` /
`verdict: fail`.

**n5 — code-reviewer (opus), G1 gate.** Post-dominates the code-producing nodes (n1 engine, n3
rubric) and reviews the whole change holistically (incl. n2 prose and n4's findings). High blast
radius → opus.

**n6 — finalize (sonnet), sink.** CHANGELOG.md `[Unreleased]` entry only (docs/state). The ADR lives
in n2; state/roadmap/archive are contractor-mechanical, not plan-node writes.

**Cross-edition / validation.** Cross-edition ×4 (schema byte-anchor + four generated aggregators) +
SIX-surface prose → four-chain obligation (`npm test`, run sequentially) + route-reachability +
`edition-sync --check`. Host note: run chains with `KAOLA_RUN_CHAINS_CONCURRENCY=serial`.

## Node Ledger

| id | status |
| --- | --- |
| n1-engine | complete |
| n2-prose | complete |
| n3-rubric | complete |
| n4-adversarial | complete |
| n5-review | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-engine) | subagent-invoked | evidence-binding: n1-engine 5eecdcf1c2a8 | |
| adversarial-verifier (n4-adversarial) | subagent-invoked | evidence-binding: n4-adversarial 29743255134b | |
| implementer (n3-rubric) | subagent-invoked | deferred_to_group | |
| doc-updater (n2-prose) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n5-review 018dcf682ea1 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize ebdf6c40d098 | |
