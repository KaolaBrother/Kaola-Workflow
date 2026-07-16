# Workflow Plan — issue #699

<!-- plan_hash: b9072d7c90fc11b0abb94eb50780818e5606ce8d0ef66429ff6c73b2ed22f37b -->

## Meta

project: issue-699
labels: enhancement, workflow:in-progress, area:scripts, area:workflow-phases
speculative_open_policy: auto
validation_command: npm test
validation_test_consumes: docs/plan-run-cards/repair-routing.md

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-epoch-architecture | code-architect | — | — | 1 | sequence | reasoning |
| n2-lineage-transaction | tdd-guide | n1-epoch-architecture | scripts/kaola-workflow-replan.js, plugins/kaola-workflow/scripts/kaola-workflow-replan.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js, scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js, scripts/validate-script-sync.js, scripts/edition-sync.js, scripts/kaola-workflow-install-manifest.js, plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js, scripts/replan-conformance-fixtures.json, scripts/test-replan.js, scripts/test-claim-hardening.js, scripts/test-bundle-state.js, scripts/test-bundle-finalize.js, scripts/test-edition-sync.js, scripts/test-validate-script-sync.js, scripts/test-install-manifest-single-source.js, package.json | 1 | sequence | reasoning |
| n3-planner-control-plane | tdd-guide | n1-epoch-architecture | templates/routing/plan-run.skeleton.md, templates/routing/next.skeleton.md, templates/routing/slots.js, templates/routing/required-blocks.js, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, scripts/test-route-reachability.js, scripts/test-generate-routing-surfaces.js | 1 | sequence | reasoning |
| n4-runtime-integration | tdd-guide | n2-lineage-transaction, n3-planner-control-plane | scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/test-replan.js, scripts/test-adaptive-handoff.js, scripts/test-adaptive-node.js, scripts/test-plan-run.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence | reasoning |
| n5-edition-contract-proof | tdd-guide | n4-runtime-integration | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 1 | sequence | standard |
| n6-documentation | doc-updater | n5-edition-contract-proof | README.md, CHANGELOG.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md, docs/plan-run-cards/repair-routing.md, docs/decisions/D-699-01.md | 1 | sequence | standard |
| n7-code-review | code-reviewer | n6-documentation | — | 1 | sequence | reasoning |
| n8-security-review | security-reviewer | n7-code-review | — | 1 | sequence | reasoning |
| n9-falsify-crash-cas | adversarial-verifier | n8-security-review | — | 1 | sequence | reasoning |
| n10-falsify-inheritance-budget | adversarial-verifier | n8-security-review | — | 1 | sequence | reasoning |
| n11-falsify-planner-legacy | adversarial-verifier | n8-security-review | — | 1 | sequence | reasoning |
| n12-finalize | finalize | n9-falsify-crash-cas, n10-falsify-inheritance-budget, n11-falsify-planner-legacy | — | 1 | sequence | — |

## Plan Notes

This is a claim-preserving, persistence-sensitive engine change. `n1-epoch-architecture` is a dedicated
reasoning boundary because the implementation must compose #698's schema-2 candidate/context/G4
contracts with #682's durable review journal and #693's typed gate mode without inventing a second
authority model. The architecture evidence is mandatory input to every writer.

After design, `n2-lineage-transaction` and `n3-planner-control-plane` form an exact-file-disjoint ready
frontier. The transaction lane owns machine state, the new aggregator family, claim-level accounting,
archive preservation, and executable conformance. The control-plane lane owns planner authority and the
semantically coupled routing/profile prose across every edition. They must not depend on each other;
`n4-runtime-integration` is their first real convergence point. Never hand-author `parallel_safe` or a
speculative annotation.

Cross-edition families move atomically. The new `kaola-workflow-replan.js` is enrolled as a
GENERATED_AGGREGATOR and a Claude-to-Codex COMMON script; its canonical root file, Codex twin, and both
forge-renamed ports stay in `n2-lineage-transaction`. The adaptive schema and closure contract are
four-file byte-identical groups. Claim remains a canonical/Codex pair plus two hand-ported forge copies.
Adaptive handoff, adaptive node, and plan validator are GENERATED_AGGREGATOR families wholly owned by
`n4-runtime-integration`; edit each canonical root once, then regenerate every hunk into the declared
Codex and forge ports with `npm run sync:editions`. For every generated family, the canonical spec is the
full accumulated root diff from the run base (`git diff <base>..HEAD -- <root-file>`), mirrored modulo
forge nouns.

The planner and routing prose is one semantic unit even though its files are disjoint. The plan-run and
workflow-next outputs remain generated from their canonical skeleton/slot sources. The adapt and finalize
command/skill surfaces stay equivalent across all six Claude/Codex and forge variants. The three plugin
`workflow-planner.toml` files remain byte-identical and forge-neutral; agent-facing text carries rules,
never issue or decision provenance. Every changed plugin file receives the standalone GitLab and Gitea
forbidden-token checks before the full chains.

The recorded `npm test` command is the one full exit suite and runs the Claude, Codex, GitLab, and Gitea
chains sequentially. Writer nodes use focused RED/GREEN tests; Finalization records the full command once
on the post-documentation candidate. The repair-routing card is listed as test-consumed because
`n5-edition-contract-proof` pins its recovery contract. `CHANGELOG.md`, `README.md`, `docs/api.md`, and
`docs/workflow-state-contract.md` already belong to the built-in self-host test-consumed set.

Decision-record numbering was checked before freeze. No `D-699-*` file or mention exists, so
`docs/decisions/D-699-01.md` is the next free record. The active `bundle-693-696-697-698` fixture remains
external evidence, never a write target: the source parent plan hash
`d2f4efb603e4952a861c2387d979a2df2d2f317de3e48d273a80aeba5ce40f05`, attempt
`n8-code-review:1`, settled `repair_requires_replan` packet, candidate, claim, branch, and worktree must be
read but not mutated by this run.

## Node Briefs

### n1-epoch-architecture

Read issue #699 and every live comment, parent #695, dependencies #682/#693/#698, the active
`bundle-693-696-697-698` plan/state, the settled `n8-code-review:1` journal/rebind/evidence packet, and all
current transaction/locking/atomic-write/task-mirror/finalize code before designing. Persist a
dependency-safe blueprint in this node's evidence. It must define: the authoritative state schema and
hash domains; exact claim-root and inherited-frontier derivation; a phase-by-phase idempotency table for
`prepared -> planner_pending -> child_frozen -> parent_archived -> committed`; lock and scheduler fences;
the four candidate compare-and-swap seams; parent/child plan authority; crash roll-forward rules; snapshot
manifest contents including the per-attempt rebind ledger explicitly; epoch-local cache cleanup; planner
dispatch/handoff attestation; claim-level liveness and one-shot Case-B exemption; v1-parent-to-v2-child
compatibility; and exact module/API ownership across the frozen write sets. Include a falsification test
for every acceptance invariant and explain how the live bundle fixture is reproduced without writing to
that other lane. Downstream nodes must read this evidence before editing.

### n2-lineage-transaction

Read `n1-epoch-architecture` evidence first. RED first in `scripts/test-replan.js` and the focused
claim/archive tests. Add the claim-level lineage fields and exact canonical digest builders to the
four-file adaptive schema; initialize fresh claims without deriving identity from the current DAG, while
keeping an explicit compatibility path for verified legacy v1 parents. Implement the forge-neutral
`kaola-workflow-replan.js` family as the sole transaction authority: prepare from a settled typed review
outcome, seed an exact `workflow-plan.next.md` and evidence packet, resume idempotently from every durable
prefix, compare candidate/claim-root/inherited-frontier at all four seams, freeze/activate only the
attested planner child, snapshot the immutable parent plan/ledger/state/journal/findings/rebind ledger/node
evidence/validation vectors, regenerate the task mirror, and clear only hash-proven snapshotted
epoch-local caches. The active state, claim pointer, branch, worktree, and frozen parent bytes stay put
until committed activation.

Enforce `REVIEW_REPLAN_LIMIT = 2` at epoch-lineage scope, not plan or gate scope. A third automatic
review-driven transition durably consent-halts; one audited user extension adds exactly one ceiling slot
and cannot be self-cleared. Implement the one-shot planned `diagnosis_to_build` exemption only from frozen
Meta plus typed, digest-bound terminal evidence; review-driven reasons always count. Candidate mismatch
records `replan_candidate_changed`, advances no counter/epoch, and leaves the parent authoritative and
fenced for planner re-authoring. Make `cmdFinalize` and closure/archive verification preserve every epoch
snapshot and the complete lineage receipt.

Enroll the new script in `edition-sync` GENERATED_AGGREGATORS, COMMON script sync, and the single-source
install manifest; create all four exact script files and executable conformance fixtures. The live
`n8-code-review:1` shape must be a fixture, including R1-R6 inputs and the v1 compatibility transition.
Do not select a replacement DAG, author child nodes, mutate the external bundle, or call a planner from
inside the harness. Run focused RED/GREEN tests and `npm run sync:editions`; cite the Meta suite rather
than running all four chains here.

### n3-planner-control-plane

Read `n1-epoch-architecture` evidence first. Write failing route/profile propagation tests before prose.
Teach all four workflow-planner profiles a distinct re-plan dispatch mode: consume only repository,
project, reason, and source evidence; refuse exact-DAG/control-boundary instructions; write only the
seeded `workflow-plan.next.md`; never mutate the frozen parent; validate and return through the
re-plan-specific handoff. A child invalid at freeze uses the existing bounded unfrozen planner-repair
loop, never main-authored repair. Preserve normal startup behavior and genuine dispatch attestation.

Update the generated plan-run/workflow-next sources and every six-surface adapt/finalize family so
`replan_in_progress` routes to the one resume command, the orchestrator dispatches the planner without
roles/deps/write sets, and no scheduler/finalize path can be presented as legal during an intermediate
phase. `orient` guidance must report the exact transaction phase/hashes and only the resume mutation path.
Keep decision metadata advisory, preserve legacy-v1 behavior, and never introduce an approval gate or
discard/restart fallback. Regenerate routing outputs from canonical skeletons, keep plugin prose
forge-neutral, and prove semantic reachability and byte identity with focused tests. No issue/ADR
provenance belongs in agent-facing surfaces.

### n4-runtime-integration

Read `n1`, `n2`, and `n3` evidence first. RED first across `test-replan`, adaptive-handoff,
adaptive-node, plan-run, and walkthrough fixtures. Integrate the transaction without creating a second
state machine. Every mutating adaptive-node entry (`open-next`, `open-ready`, fused close/open,
close/reopen/repair/revert/record paths) must pass the same `replan_in_progress` guard; `orient` is
read-only and returns phase, exact hashes, and the one resume command. Finalize-check must refuse before
any archive/close side effect while a transition is not committed.

Implement the re-plan-specific child handoff/freeze against the current unchanged candidate,
claim-root/inherited frontier, schema-2 grammar, inherited validation obligations, and #698 G4 virtual
producer/certifier obligations. The handoff must validate only `workflow-plan.next.md`, retain the parent
as current on refusal, and bind child plan hash plus genuine planner dispatch evidence into the
transaction. Activation is a journaled multi-file roll-forward, never described as filesystem-atomic.
Later relevant mutation stales child certification; a zero-writer child cannot launder inherited code or
sensitive changes.

Exercise a crash after every durable write and each candidate-mutation seam, including task-mirror/state
prefixes, and prove repeated resume converges to one child epoch and one snapshot. Reproduce the exact
legacy bundle fixture (or a byte-equivalent local fixture) without mutating its live project. Preserve all
legacy frozen bytes and current v1 behavior. Edit each generated canonical aggregator once and regenerate
the declared Codex/forge ports from the full accumulated root diff.

### n5-edition-contract-proof

Read all upstream evidence. RED first in the contract validators and edition walkthrough tests. Pin the
installed presence and executable behavior of the new replan script in Claude, Codex, GitLab, and Gitea;
pin script-name translation, schema/phase/refusal vocabulary, planner-only child authorship, generated
routing reachability, archive lineage retention, and finalization/scheduler fences. Add executed smoke
cases to the Codex walkthrough and both forge workflow-script suites so a missing port, stale install
manifest, unrenamed self-reference, absent planner attestation, or half-transition mutation turns the
corresponding chain RED. Contract assertions must verify behavior, not merely counts or coverage labels.
Run each changed plugin file through both standalone forbidden-token checks, then run focused edition
validators/walkthroughs. Do not re-derive or rerun the full Meta suite at this node.

### n6-documentation

Read implementation evidence and document the final machine contract before certification. Update the
public feature overview, API schemas/commands/refusals, architecture transaction diagram, workflow-state
and recovery contracts, conventions, repair-routing card, and `[Unreleased]` changelog. Create next-free
`D-699-01` with the claim-root/epoch authority, multi-file journaled activation, CAS, bounded liveness,
planned-transition exemption, and legacy compatibility decision. State explicitly that parent plan bytes
remain immutable, the active claim/branch/worktree/candidate survive, only workflow-planner authors the
child, every epoch snapshot (including rebind ledger) remains in the final archive, and hosted CI/CD is
not a gate. Keep provenance in docs/changelog only.

### n7-code-review

Review the complete post-documentation candidate against every issue acceptance criterion, the
architecture evidence, the live `n8-code-review:1` fixture, surrounding callers, and focused tests. Verify
one authoritative transaction, four CAS seams, strict parent authority until activation, exact planner
attestation/control boundary, no baseline laundering, G4/final-digest freshness, claim-level counters,
one-shot Case-B semantics, exhaustive phase resume, archive completeness including rebind history, and
full edition/install/routing propagation. Confirm RED evidence was genuine and generated/mirror families
match their canonical full diff. Do not rerun the Meta full suite here; reject any unproven acceptance
claim, source-plan mutation, or hidden discard/restart fallback.

### n8-security-review

Read `n7` evidence and audit the complete candidate as a provenance/persistence security boundary.
Attempt path substitution for `workflow-plan.next.md` and epoch snapshots, symlink/traversal and
cross-project writes, digest ambiguity, stale planner-dispatch replay, candidate TOCTOU outside the lock,
forged consent/ceiling extension, cache deletion before durable snapshot, and scheduler/finalize bypasses.
Verify all hash domains are canonical and project/claim/epoch bound, every refusal is zero-mutation or
durably recoverable, secrets are not copied into evidence, and legacy compatibility cannot silently
promote an unverified parent. Return pass only when no authority or evidence can be laundered across an
epoch.

### n9-falsify-crash-cas

Independently try to refute crash safety and compare-and-swap correctness through executable local
fixtures and the real CLIs. Kill after every durable write in all five phases; mutate the candidate at
prepare, pre-freeze, pre-snapshot, and pre-activation; vary task-mirror/state write prefixes; repeat resume
many times. A passing result requires exactly one frozen child, one epoch increment, one immutable parent
snapshot, no premature cache deletion, and `replan_candidate_changed` with no count/epoch advance at every
CAS mismatch. Read-only against the worktree: use out-of-repo scratch for mutation drivers and report a
typed fail on any surviving counterexample.

### n10-falsify-inheritance-budget

Independently attack inherited-candidate and liveness invariants. Use zero-new-writer child plans,
sensitive inherited frontiers, later relevant mutation, multiple gate names/plan hashes, two allowed
automatic transitions, a third attempt, repeated Case-B labels, review-driven reasons disguised as
planned transitions, and forged/missing consent extension data. Prove inherited code cannot finalize
without real role-specific certifier receipts bound to the full final digest, counters cannot reset by
changing a DAG, the third automatic transition consent-halts, and one authorized extension creates only
one slot. Use executable scratch fixtures; emit fail for any laundering or unbounded loop.

### n11-falsify-planner-legacy

Independently attack the planner-first and compatibility boundaries. Replay a main-session exact-DAG
prompt, an unattested child file, a child authored at the wrong path, an invalid child repaired by main,
and a crash/retry around planner dispatch. Reproduce the preserved v1 `n8-code-review:1` parent and prove
its plan bytes, journal, evidence, claim, branch, worktree, and candidate authority never change while a
schema-2 child is prepared, rejected, frozen, snapshotted, and activated. Missing or malformed legacy
authority must fail closed. Also confirm agent/command/skill prose remains forge-neutral and contains no
issue/ADR provenance. Use out-of-repo scratch only and return a typed fail on any control-boundary bypass.

### n12-finalize

Terminal merge sink for issue #699. Read all three adversarial verdicts and require pass evidence. Run the
recorded `npm test` command once on the final post-documentation tree and record all four sequential
edition results. Verify the frozen plan/ledger, chain receipt freshness, no unresolved gate findings,
clean exact write-set compliance, complete epoch/replan fixtures, and next-free `D-699-01`. Then perform
the standard feature commit, run-chains/finalization/archive, merge sink, issue close, roadmap regeneration,
and worktree cleanup. Confirm the archived project retains every epoch snapshot and complete lineage
receipt. CI/CD is not a gate.

## Node Ledger

| id | status |
| --- | --- |
| n1-epoch-architecture | complete |
| n2-lineage-transaction | complete |
| n3-planner-control-plane | complete |
| n4-runtime-integration | complete |
| n5-edition-contract-proof | complete |
| n6-documentation | complete |
| n7-code-review | pending |
| n8-security-review | pending |
| n9-falsify-crash-cas | pending |
| n10-falsify-inheritance-budget | pending |
| n11-falsify-planner-legacy | pending |
| n12-finalize | pending |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-epoch-architecture) | subagent-invoked | evidence-binding: n1-epoch-architecture 2e20f56e4b04 | |
| tdd-guide (n2-lineage-transaction) | subagent-invoked | evidence-binding: n2-lineage-transaction ed9761fbfbc4 | |
| tdd-guide (n3-planner-control-plane) | subagent-invoked | evidence-binding: n3-planner-control-plane 721e19412732 | |
| tdd-guide (n4-runtime-integration) | subagent-invoked | evidence-binding: n4-runtime-integration eca8b605b1db | |
| tdd-guide (n5-edition-contract-proof) | subagent-invoked | evidence-binding: n5-edition-contract-proof 70ee27068f14 | |
| doc-updater (n6-documentation) | subagent-invoked | evidence-binding: n6-documentation c49f69bd882d | |
