# Workflow Plan — bundle-426-427-428-430

<!-- plan_hash: 58397ec580ba1b4994f25226987ea9fff19c67fdae085697c35e8bdb6db4bbe4 -->

Bundle of four finalize/closure/roadmap/bundle-claim bugs surfaced by the 2026-06-11/12
adaptive runs. All four interlock on `scripts/kaola-workflow-claim.js` (`cmdFinalize`,
`archiveProjectDir`, `reconcileRoadmapForClosure`, `cmdStartup`) and its three edition
twins, so the claim.js-touching root edits are serialized (then mirrored to the forge ports
in one downstream node) while the disjoint surfaces (handoff cross-check, orient
consistency, planner/adapt prose, sink-merge idempotency, walkthrough scenarios) fan out
off the single design node.

## Meta

labels: bug, area:scripts, area:workflow-phases

## Plan Notes

- **Edition multiplicity + forge-port ordering (#340).** `kaola-workflow-claim.js` is a
  `COMMON_SCRIPTS` byte-pair (root ↔ `plugins/kaola-workflow/scripts/…` — same base filename,
  the codex twin, NOT a renamed forge port) PLUS `RENAME_NORMALIZED_FAMILIES` forge ports
  (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`), governed by
  `validate-script-sync.js`. Because FOUR nodes (#426/#427/#428/#430-claim) edit the same
  root claim.js, the #340 freeze-wall forbids any of those nodes from also writing a forge
  PORT — the port mirror must come AFTER all root edits. So n2/n3/n4/n5 each write only the
  root + codex byte-pair (2 files), then ONE dedicated forge-port node n5b mirrors BOTH
  gitlab + gitea claim.js ports, depending transitively on every root-editing node. Its
  canonical spec is the **full accumulated root diff** (`git diff <base>..HEAD --
  scripts/kaola-workflow-claim.js`): mirror EVERY hunk modulo forge nouns, never a per-issue
  enumeration (#328 forge-claim-ports lesson — half a mirror, all four chains green).
- **GENERATED_AGGREGATORS coupling (#431).** `kaola-workflow-adaptive-handoff.js` and
  `kaola-workflow-adaptive-node.js` ARE generated aggregators. Each has exactly ONE root
  writer here (n6 handoff, n7 orient), so the `generated_port_split` freeze-wall is satisfied
  by declaring the codex twin + both forge ports in that SAME node (no other node writes their
  root, so the #340 port-ordering gap does not arise). n6 and n7 declare all four exact
  edition paths accordingly.
- **Serial claim.js root chain.** #426 (cmdFinalize re-anchor to mainRoot +
  archive-before-delete invariant + finalization-summary creation + crash receipt), #427
  (cmdFinalize executes member closures + `closure:{}` receipt), #428
  (`reconcileRoadmapForClosure` dual-root removal + typed `roadmap_residue` guard), and
  #430-claim (`cmdStartup` `target_set_mismatch` refusal) all write the same root claim.js
  file. They run as a `sequence` chain n2→n3→n4→n5; the architect node fixes the shared
  cmdFinalize step-ordering contract once so the finalize edits compose rather than conflict.
- **Canonical spec for the claim.js chain (#309).** Each claim.js node mirrors its issue's
  Design section verbatim; the architect node (n1) emits the single shared cmdFinalize
  step-ordering (archive-copy → verify archive completeness → delete live folders in BOTH
  trees → remove worktree from `cwd: mainRoot`) + receipt-schema contract (`anchored_root`,
  `closure:{attempted,closed,failed,skipped_offline|kept_open}`, `roadmap_removed` per-member
  per-root, `roadmap_residue`) that n2/n3/n4/n5 all build against, so four serialized edits to
  one function converge by construction instead of by free-form prose. n1 is read-only — its
  design output is consumed as guidance by the impl nodes (no write set; the four decision
  records that durably record the design are authored by the doc-updater node n12).
- **#427 sink-merge idempotency** (Design point 2: make cmdFinalize's close and
  sink-merge.js's close idempotent against each other — probe-before-close already half-exists
  at sink-merge.js:445) is file-disjoint from claim.js (`kaola-workflow-sink-merge.js` ×4 —
  `COMMON_SCRIPTS` pair + forge twins) and fans out as n9, joining at the review gate.
- **#430 prose** (planner md+3 toml; adapt command md+3 SKILL) splits into n8a/n8b to stay
  under FILE_CEILING; both are `doc-updater`, disjoint, parallel. The adapt-command edit is a
  #400-family routing-prose change governed by `test-route-reachability.js` + the four contract
  validators (the adapt command md + 3 SKILL packs are 4 of the six routing surfaces).
- **Tests (n10)** author the cross-edition walkthrough scenarios (finalize-from-worktree
  non-destructive re-anchor + complete archive; bundle-member closures fired by the script;
  roadmap sources gone from MAIN + residue refusal; `target_set_mismatch` at handoff) across
  all six walkthrough files; the `test-bundle-state.js` incoherent-hand-edit fixture rides
  with the orient node n7 (it asserts exactly the orient consistency check). `implementer`,
  not `tdd-guide`: these are cross-edition integration scenarios exercising completed
  multi-file script restructuring, with no single natural failing-unit-test authored first
  (`non_tdd_reason: cross-edition walkthrough scenario authoring over finished restructured
  script behavior`).
- **Decision records (#337).** `docs/decisions/` next-free numbers are D-426-01, D-427-01,
  D-428-01, D-430-01 (no existing 426/427/428/430 records). All four are authored in the
  doc-updater node n12.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-architect-finalize-contract | code-architect | — | — | 1 | sequence | opus |
| n2-impl-finalize-426 | implementer | n1-architect-finalize-contract | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js | 1 | sequence | sonnet |
| n3-impl-closure-427 | implementer | n2-impl-finalize-426 | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/test-bundle-finalize.js | 1 | sequence | sonnet |
| n4-impl-roadmap-428 | implementer | n3-impl-closure-427 | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js | 1 | sequence | sonnet |
| n5-impl-claimguard-430 | implementer | n4-impl-roadmap-428 | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js | 1 | sequence | sonnet |
| n5b-forge-port-claim | implementer | n2-impl-finalize-426, n3-impl-closure-427, n4-impl-roadmap-428, n5-impl-claimguard-430 | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js | 1 | sequence | sonnet |
| n6-impl-handoff-430 | implementer | n1-architect-finalize-contract | scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js | 1 | sequence | sonnet |
| n7-impl-orient-430 | implementer | n1-architect-finalize-contract | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-bundle-state.js | 1 | sequence | sonnet |
| n8a-prose-planner-430 | doc-updater | n1-architect-finalize-contract | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml | 1 | sequence | sonnet |
| n8b-prose-adapt-430 | doc-updater | n1-architect-finalize-contract | commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md | 1 | sequence | sonnet |
| n9-impl-sink-idem-427 | implementer | n1-architect-finalize-contract | scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js | 1 | sequence | sonnet |
| n10-tests-walkthrough | implementer | n5b-forge-port-claim, n6-impl-handoff-430, n7-impl-orient-430, n9-impl-sink-idem-427 | scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js | 1 | sequence | sonnet |
| n11-code-review | code-reviewer | n5b-forge-port-claim, n6-impl-handoff-430, n7-impl-orient-430, n8a-prose-planner-430, n8b-prose-adapt-430, n9-impl-sink-idem-427, n10-tests-walkthrough | — | 1 | sequence | opus |
| n12-docs | doc-updater | n11-code-review | docs/api.md, docs/workflow-state-contract.md, docs/decisions/D-426-01.md, docs/decisions/D-427-01.md, docs/decisions/D-428-01.md, docs/decisions/D-430-01.md | 1 | sequence | sonnet |
| n13-finalize | finalize | n12-docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
| --- | --- |
| n1-architect-finalize-contract | complete |
| n2-impl-finalize-426 | complete |
| n3-impl-closure-427 | complete |
| n4-impl-roadmap-428 | complete |
| n5-impl-claimguard-430 | complete |
| n5b-forge-port-claim | complete |
| n6-impl-handoff-430 | complete |
| n7-impl-orient-430 | complete |
| n8a-prose-planner-430 | complete |
| n8b-prose-adapt-430 | complete |
| n9-impl-sink-idem-427 | complete |
| n10-tests-walkthrough | complete |
| n11-code-review | complete |
| n12-docs | complete |
| n13-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-architect-finalize-contract) | subagent-invoked | evidence-binding: n1-architect-finalize-contract f8d210c9afe3 | |
| implementer (n2-impl-finalize-426) | subagent-invoked | evidence-binding: n2-impl-finalize-426 4d09f1b618b4 | |
| implementer (n3-impl-closure-427) | subagent-invoked | evidence-binding: n3-impl-closure-427 2eec1e20dfec | |
| implementer (n4-impl-roadmap-428) | subagent-invoked | evidence-binding: n4-impl-roadmap-428 ee8dcb89d177 | |
| implementer (n5-impl-claimguard-430) | subagent-invoked | evidence-binding: n5-impl-claimguard-430 6903038e6a3e | |
| implementer (n5b-forge-port-claim) | subagent-invoked | evidence-binding: n5b-forge-port-claim bc3d9f4f1fc8 | |
| implementer (n6-impl-handoff-430) | subagent-invoked | evidence-binding: n6-impl-handoff-430 fd62c3abb169 | |
| implementer (n7-impl-orient-430) | subagent-invoked | evidence-binding: n7-impl-orient-430 9c7dc9e48657 | |
| doc-updater (n8a-prose-planner-430) | subagent-invoked | evidence-binding: n8a-prose-planner-430 f055367f8adb | |
| doc-updater (n8b-prose-adapt-430) | subagent-invoked | evidence-binding: n8b-prose-adapt-430 59b1ed5b8799 | |
| implementer (n9-impl-sink-idem-427) | subagent-invoked | evidence-binding: n9-impl-sink-idem-427 234edbc6a22b | |
| implementer (n10-tests-walkthrough) | subagent-invoked | evidence-binding: n10-tests-walkthrough 8398b76c81b6 | |
| code-reviewer | subagent-invoked | verdict: pass | |
| doc-updater (n12-docs) | subagent-invoked | evidence-binding: n12-docs 9fe1159b9e64 | |
| finalize (n13-finalize) | main-session-direct | evidence-binding: n13-finalize 2e7a8879cbec | |
