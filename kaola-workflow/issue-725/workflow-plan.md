# Workflow Plan — issue #725 (epic Phase A repair epoch: close the three orphaned retirement surfaces)

<!-- plan_hash: 7dd4b0472fea7adff2769698c714521a82e1e223244413ad7a4302e863c17e82 -->

## Meta

project: issue-725
labels: area:scripts, area:workflow-phases, area:workflow-router, enhancement
speculative_open_policy: auto
plan_schema_version: 2
contract_version: 2
epoch_schema_version: 2
plan_epoch: 2
epoch_lineage_id: 43c25ded7e36413c9c1fdb6f1bbdb1ccc19dfae845cf6366230239d986d27997
parent_plan_hash: 5b48fa3f885c37ee7ce88991f6c0c98f3c1010bd9d55845bf8adf4d5773969de
parent_snapshot_manifest_digest: 8804633d71e030a46c3d508c095cf5aeb50ead3ff39b446419ff2973b47edded
claim_root_base_digest: 44ada0fbecbf3cc5a8fc59ffb6401e36891ac16589e231200ae8edb87aaca725
inherited_frontier_digest: fae3cf5a388786839ff280f2fe843a8a7dbe02be2999876c9d307ced49002830
inherited_frontier_classes: code,security
source_evidence_digest: eb055a22d84dc007675c876c74df81218d06f43ec46de0d76051484f73509fbc
transition_reason: review_repair_requires_replan
planner_binding: aa264a25741d
code_certifier: n2-code-certify
security_certifier: n3-security-certify
validation_command: npm test && node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 120
validation_env_allowlist:

## Plan Notes

Repair epoch (plan_epoch 2) of epic #725 Phase A. The parent plan's n1-n10 shipped the fast/full
retirement faithfully, but the tail code certifier (n11-code-certify) refused with three high-severity
blocking findings, all anchored OUTSIDE the tail producer's write set (files no parent node owned), so
this is the claim-preserving replan path rather than an n10 reopen-in-place. This epoch closes exactly
those three orphaned surfaces and re-certifies; it changes nothing else the parent already landed.

The three inherited findings (all fix_role: implementer):
- F1 (validation) — three plan-absent finalize fixtures still seed the retired `workflow_path: fast`, so
  finalize now refuses `adaptive_plan_missing` and reds the claude/gitlab/gitea chains. Migrate them to
  the proven adaptive finalize fixture.
- F2 (validation) — three contract validators pin CLAUDE.md's compact-durable-state contract to
  `fast-summary.md`, which n10-docs correctly removed. Drop only that one assertConcept entry.
- F3 (correctness) — three Codex finalize SKILL packs still resolve and shell the deleted
  `full-advance` script. Mirror n6's finalize-command edit onto them, closing the 6-surface propagation.

Shape (deliberately SERIAL, single producer): all three fixes are independent, disjoint, and small, but
they are authored as ONE implementer node under a SERIAL certifier chain — NOT a parallel antichain of
writers under a common wall. A bundle-wide certifier post-dominating an antichain of independent writers
cannot be single-node-repaired on refutation (`uniqueMaximalReviewProducer` finds no unique graph-maximal
producer -> `repair_requires_replan`), and the authorized epoch ceiling is 2 (this is the last epoch). A
single producer is trivially the unique graph-maximal producer, so any certifier finding reopens n1-repair
IN PLACE and never needs epoch 3. This is the same correctness>makespan trade the parent recorded, taken to
its strongest form. The fixes are mechanical (a twice-proven fixture migration, a one-line pin removal, a
mirror edit), so a standard-tier implementer under two reasoning-tier certifier walls is the right tiering.

Dual certifier wall: the inherited frontier carries BOTH code and security classes
(inherited_frontier_classes: code,security), so the epoch must route every root through a reachable code
certifier AND a reachable security certifier. Parallel reviewers each fail to post-dominate the sole
producer (each leaves a bypass path to the sink), so the two gates are serialized:
n1-repair -> n2-code-certify -> n3-security-certify -> n4-finalize. The security surface is genuinely
non-empty: F3 removes a shell block that builds a $HOME/.codex path and executes a node script.

Traps carried forward from the parent (still binding): (1) no grep-and-delete of the substring "full" —
`escalated_to_full` and the unrelated adaptive "full ..." vocabulary stay; (2) `classifier.js` and
`validation-runner.js` are UNTOUCHABLE, including the classifier's retained tolerant `fast-summary.md`
read; (5) `templates/routing/slots.js` is untouched. No new decision record is authored — D-725-01 (filed
by the parent n10-docs) already documents the Phase-A retirement; this epoch only completes it.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-repair | implementer | — | scripts/test-bundle-finalize.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md | 9 | sequence | — | standard | — | — | — | — | — | — |
| n2-code-certify | code-reviewer | n1-repair | — | 1 | sequence | — | reasoning | — | — | The three orphaned Phase-A retirement surfaces are repaired with zero adaptive regression: the three plan-absent finalize fixtures (scripts/test-bundle-finalize.js and the gitlab/gitea test-sinks) are migrated off the retired workflow_path fast seed onto the adaptive finalize fixture so they stop refusing adaptive_plan_missing; the CLAUDE.md compact-durable-state-contract fast-summary.md pin is removed from the three contract validators (the validate-workflow-contracts.js canonical+codex byte-pair plus validate-kaola-workflow-contracts.js) while the classifier tolerant-read and workflow-next legacy-marker fast-summary assertions are preserved; the three Codex finalize SKILL packs no longer resolve or shell the deleted full-advance script and instead carry the adaptive_plan_missing refusal mirroring the finalize command copies; classifier.js and validation-runner.js are untouched; and all four edition chains plus the opencode and kimi suites are green over the final tree | the full accumulated repair diff vs claim root base 33a1ca57 across all four editions — the three migrated finalize fixtures, the three contract validators with only the CLAUDE.md fast-summary entry removed, and the three finalize SKILL packs with the full-advance shell block replaced by the adaptive_plan_missing refusal — reviewed against the n11-code-certify findings F1/F2/F3 and the four-chain-green plus opencode/kimi-green evidence | sequence | — |
| n3-security-certify | security-reviewer | n2-code-certify | — | 1 | sequence | — | reasoning | — | — | The repair introduces no security regression on the inherited frontier: removing the full-advance path-resolution-and-execution shell block from the three finalize SKILL packs leaves no unsafe path construction, command injection, unvalidated node execution, or symlink-escape regression, and the replacement adaptive_plan_missing refusal path performs no execution; the fixture migration and the validator fast-summary pin removal expose no credential, secret, or auth surface; classifier.js and validation-runner.js remain untouched | the full accumulated repair diff vs claim root base 33a1ca57 across all four editions, with emphasis on the three finalize SKILL packs removed shell-execution block and the migrated finalize fixtures, reviewed for any injection, unsafe path, privilege, or secret-exposure regression against the inherited security frontier | sequence | — |
| n4-finalize | finalize | n3-security-certify | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Node Briefs

### n1-repair

The single fix producer for this epoch. Read the n11-code-certify evidence
(`kaola-workflow/issue-725/.cache/n11-code-certify.md`) and the n1 retirement manifest
(`kaola-workflow/issue-725/.cache/n1-recon.md`) BEFORE editing. Touch ONLY the 9 declared files. Traps:
do NOT touch `classifier.js` or `validation-runner.js`; do NOT grep-and-delete the substring "full".
Non-tdd reason: all three findings are fix_role: implementer completing a behavior-preserving retirement
(a fixture migration, an assertion-pin removal, and a mirror edit) with no natural failing unit test —
correctness is verified by the four edition chains at the certifier and finalize.

F1 (validation) — migrate the three plan-absent finalize fixtures off the retired fast path.
`scripts/test-bundle-finalize.js` seeds `workflow_path: fast` for its plan-absent finalize fixture (around
lines 129/177); `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` (~L40) and
`plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` (~L41) do the same. Because fast is retired,
plan-absent finalize now refuses `adaptive_plan_missing` and these tests red (claude at
test-bundle-finalize.js, gitlab at test-gitlab-sinks.js:826, gitea at test-gitea-sinks.js:791). Migrate
each fixture to an adaptive finalize fixture using the already-proven `seedAdaptiveFinalizeFixture` pattern
in `scripts/simulate-workflow-walkthrough.js` (the helper defined at ~L102 and used dozens of times) — seed
a frozen adaptive `workflow-plan.md` + ledger so finalize verifies a real adaptive plan instead of the
retired fast seed — and update each test's assertions to the adaptive expectation. This is the same
seedAdaptiveFinalizeFixture migration already proven elsewhere.

F2 (validation) — remove ONLY the CLAUDE.md fast-summary pin from the three contract validators. In
`scripts/validate-workflow-contracts.js` and its byte-identical twin
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` the
`assertConcept('CLAUDE.md', 'compact durable state contract', [...])` list (~L318, entry ~L323) still
requires `'fast-summary.md'`; in `scripts/validate-kaola-workflow-contracts.js` the same assertConcept is
at ~L322 (entry ~L327). n10-docs correctly removed fast-summary.md from CLAUDE.md, so this assertion now
fails ("CLAUDE.md must document compact durable state contract; missing: fast-summary.md"). Remove ONLY the
`'fast-summary.md'` entry from that one assertConcept list in each of the three files. DO NOT touch the
OTHER surviving fast-summary references that are correct-by-design: the classifier tolerant-read assertion
`assertIncludes('scripts/kaola-workflow-classifier.js', 'fast-summary.md')` and the workflow-next
legacy-marker `assertIncludes('commands/workflow-next.md', ...'fast-summary.md'...)` — those pin the
retained trap-2 tolerant read and must stay. Keep the two `validate-workflow-contracts.js` copies
byte-identical after the edit.

F3 (correctness) — stop the three Codex finalize SKILL packs from shelling the deleted full-advance script.
`plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`,
`plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md`, and
`plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md` each carry a shell block (~L226-240:
the `case "$KAOLA_CODEX_PLUGIN_NAME"` -> `KAOLA_FULL_ADVANCE_NAME` resolution, the `KAOLA_FULL_ADVANCE` path
build, the lstat path-verifier, and `node "$KAOLA_FULL_ADVANCE" phase5-verify ...`) that resolves and
executes the now-deleted `kaola-workflow-full-advance.js` / forge ports. Mirror the edit n6 already applied
to the three `kaola-workflow-finalize.md` COMMAND copies (see `commands/kaola-workflow-finalize.md`
~L131-134): replace the full-advance plan-absent verifier wiring with the typed
`adaptive_plan_missing` / `finalize_gate_unverified` refusal ("there is no retired fast/full verifier to
shell"). This closes the 6-surface finalize propagation (the 3 COMMAND copies were done by n6; these are the
remaining 3 SKILL packs). No contract-validator or forge-test needle pins the removed shell, and
route-reachability is already green, so no assertion file joins the write set — but if your edit trips any
gitlab/gitea contract-validator or forge-test needle, surface it as a write-set gap rather than widening
scope silently.

Scoped verification (this leg carries the complete post-repair tree — every earlier retirement node is
already merged into the base): run each edited surface's owning check and, ideally, all four edition chains
— `npm run test:kaola-workflow:claude`, `:codex`, `:gitlab`, `:gitea` — plus
`node scripts/test-opencode-edition.js` and `node scripts/test-kimi-edition.js`, expecting green. If a chain
is still red on a reference this repair did not remove, surface it as a write-set gap.

### n2-code-certify

The named schema-2 common CODE certifier wall for the repair epoch — post-dominates the single fix producer
n1-repair. Read the n11-code-certify evidence, the n1 retirement manifest, and n1-repair's evidence file.
Verify against the full accumulated repair diff vs claim root base `33a1ca57` across all four editions:
(1) F1 — the three finalize fixtures are migrated to an adaptive fixture and no longer refuse
`adaptive_plan_missing`; (2) F2 — the CLAUDE.md fast-summary entry is removed from exactly the three
contract validators' compact-durable-state assertConcept, the two `validate-workflow-contracts.js` copies
remain byte-identical, and the classifier tolerant-read + workflow-next legacy-marker fast-summary
assertions are preserved; (3) F3 — the three finalize SKILL packs no longer resolve or execute the deleted
full-advance script and carry the `adaptive_plan_missing` refusal mirroring the command copies, closing the
6-surface propagation; (4) traps respected — `classifier.js` and `validation-runner.js` untouched, no
unrelated-"full" vocabulary deleted; (5) all four edition chains + the opencode + kimi suites are green over
the final tree. Record a gate verdict, not implementation advice; zero findings is valid; admit only
concrete candidate-caused defects with an exact trigger. Because n1-repair is the sole producer, any finding
is localized to it and reopens it IN PLACE (never a replan).

### n3-security-certify

The named schema-2 SECURITY certifier wall carried forward for the inherited security frontier —
post-dominates n1-repair via the serial chain. The repair adds no new sensitive write-set path, but the
inherited frontier obligates a reachable security re-certification, and the F3 change is genuinely
security-relevant: it removes a shell block that builds a `$HOME/.codex/plugins/cache/...` path and executes
a node script. Verify against the full repair diff that removing the full-advance
path-resolution-and-execution block from the three finalize SKILL packs leaves no unsafe path construction,
command injection, unvalidated execution, or symlink-escape regression, and that the replacement
`adaptive_plan_missing` refusal path performs no execution; that the fixture migration and the validator pin
removal expose no credential, secret, or auth surface; and that `classifier.js` and `validation-runner.js`
are untouched. Read-only; record a gate verdict. Zero findings is valid; a concrete finding reopens
n1-repair in place.

### n4-finalize

Unique sink, main-session-direct. This is the same PARTIAL close of epic #725 (Phase A of A-E) the parent
plan intended, now over the repaired tree. Confirm the named code certifier (n2-code-certify) and security
certifier (n3-security-certify) are complete and fresh. Run the Meta `validation_command` once over the
final tree — all four edition chains sequentially green via `npm test`, then
`node scripts/test-opencode-edition.js` and `node scripts/test-kimi-edition.js` — and generate the sink
chain receipt with `KAOLA_RUN_CHAINS_CONCURRENCY=serial` (this host SIGKILLs a concurrent run-chains). Then
sink the Phase-A feature commit from `workflow/issue-725`: commit -> serial run-chains receipt ->
cmdFinalize --keep-worktree -> push branch -> sink-merge --sink from the main root. DO NOT close issue #725
— the epic continues with Phase B in a later run; leave #725 OPEN and the `workflow:in-progress` label in
place. Do NOT touch #718 (it closes with Phase D). Optionally post a brief comment on #725 recording that
Phase A (retire fast/full) shipped and Phase B is next. Write no tracked file from this node beyond the sink
transaction's own bookkeeping.

## Node Ledger

| id | status |
| --- | --- |
| n1-repair | complete |
| n2-code-certify | complete |
| n3-security-certify | complete |
| n4-finalize | in_progress |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-repair) | subagent-invoked | evidence-binding: n1-repair 5ea5f85f1880 | |
| code-reviewer (n2-code-certify) | subagent-invoked | evidence-binding: n2-code-certify 83bb71e5fd84 | |
| security-reviewer (n3-security-certify) | subagent-invoked | evidence-binding: n3-security-certify ef7db60618c3 | |
| finalize (n4-finalize) | pending | | |
