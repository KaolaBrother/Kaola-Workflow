# Issue #1032 D3-D8: orchestration surface map

Snapshot: `ef0a6d59` (`kaola-workflow--v9.17.1`, `main`, `origin/main`) on 2026-08-26.
This is a read-only source/generation/deletion map. No tracked source, test, GitHub, model-profile,
contract, or issue-worktree file was changed; the only write is this report. The issue body and its
latest owner refinement are treated as the current authority. The existing `kaola-workflow/issue-1032/`
directory already contained the mission/state artifacts; the report path was free before this write.

## Executive findings

The highest-coupling surfaces are:

1. `templates/routing/slots.js`, `templates/routing/required-blocks.js`, and
   `scripts/test-route-reachability.js`. They jointly own the seven-field handoff block, the
   generated-surface manifest obligations, the fixed Codex routing pin, reviewer heavy re-dispatch,
   and the 42-surface handoff parity/mutation guard. D3, D6, and D7 all converge here.
2. The dispatch-log lifecycle: the four copies of
   `hooks/kaola-workflow-subagent-dispatch-log.sh`, four hook-config families, five runtime sync
   scripts, `kaola-workflow-install-manifest.js`, `install.sh` plus five runtime installers, and the
   schema/telemetry/sink copies. Removing only the shell file would leave registrations, generated
   adapters, stale-installed artifacts, and consumers behind.
3. `templates/axioms.md` plus the `init`, `next`, and `finalize` routing skeletons and their 18
   tracked generated command/skill outputs. D3 wording must be changed at canonical sources and
   regenerated; direct edits to those outputs would violate the repository's one-rule-one-wording
   policy.
4. `agents/{tdd-guide,implementer}.md`, the three plugin TOML copies, and
   `scripts/test-agent-profile-parity.js`. D4 narrows only the implementer's mechanical test-path
   exception; independent test authorship, RED proof, and the prohibition on weakening/deleting/skipping
   acceptance must survive.
5. `templates/reviewers/behavior-contracts.json` and `scripts/generate-reviewer-profiles.js`, plus
   the generated reviewer profiles. D5 is a review-process wording change, while the fixed reviewer
   heavy-dispatch assertions being removed are principally the D7 mechanism.

## Baseline and authority boundary

The current tree is `main...origin/main`; only the pre-existing untracked issue-1032 directory is
present. Read-only baseline checks passed:

- `node scripts/generate-routing-surfaces.js --check` — all 18 tracked routing surfaces byte-match
  their skeletons.
- `node scripts/test-route-reachability.js` — 825 assertions.
- `node scripts/test-validate-script-sync.js` — 56 assertions, with one declared `canonicalOnly`
  exclusion.
- `node scripts/test-outcome-recorder.js` — 85 assertions.

The full `npm test` chain was not run for this map. Its package scripts begin with
`edition-sync.js --materialize-kernel`; the full post-change run remains an owner validation step.

The relevant prior decisions are not equally live:

- #1029 is the source of the self-sufficient handoff contract. D6 supersedes its seven labels,
  ordering, role-specialization text, and reachability pins, not the principle that a handoff must be
  bounded and executable without inherited conversation.
- #1010 and #1018 explain the current fixed Codex tier-pair prose. D7 supersedes the fixed per-spawn
  pair and reviewer escalation contract, while retaining role-tier classification and installed/native
  profile defaults.
- #814 / D-814-01 establishes independent test custody and RED-baseline evidence. D4 supersedes the
  universal implementer prohibition on every test-shaped path, not the independent acceptance oracle.
- #277 and later dispatch-log decisions explain the current advisory spawn record. D8 removes the
  active producer, consumer, installer, and runtime adaptations; historical decision records and
  archived compatibility data are not live producers and should not be rewritten as if they were.

Workflow-state `dispatched`/`result` fields and their consumers are deliberately not re-mapped here;
another explorer owns that surface. The locator/recovery behavior must therefore be preserved while the
separate telemetry sidecar is removed.

## 1. Canonical source to generated output graph

| Concern | Canonical authored source | Generation or mirror path | Current outputs and guards |
|---|---|---|---|
| First-principles and adaptive orchestration wording | `templates/axioms.md:1-17`; routing prose in `templates/routing/init.skeleton.md`, `next.skeleton.md`, and `finalize.skeleton.md` | `scripts/generate-routing-surfaces.js` renders topic/forge variants; `CLAUDE.md` and `README.md` carry active byte-identity copies of the axiom block | 18 tracked command/skill surfaces: three command topics in the root command lane and three forge trees, plus the corresponding skill surfaces. `generate-routing-surfaces.js --check` is the byte guard. `simulate-workflow-walkthrough.js` checks axiom identity. |
| Handoff and tier slots | `templates/routing/slots.js:44-93` (`main-authored-handoff`) and `:119-161` (`codex-tier-roster`) | `templates/routing/{next,finalize}.skeleton.md` splice the slots; the routing generator emits the tracked surfaces and the additive runtime renderers consume those command bytes | Handoff obligations are declared by `required-blocks.js:50-60` and `:110-120`. Reachability expands each next/finalize block to 21 consumer surfaces, 42 total. |
| Required-block manifest | `templates/routing/required-blocks.js:3-30` and entries around `:50-60`, `:110-120`, `:190-197` | `scripts/test-route-reachability.js` derives the obligated universe and mutation tests; the generator is the output writer | Current manifest also pins the concurrency wording. D3 should remove ritual/no-proof tokens and replace stale wording checks with the canonical adaptive paragraph, without adding a dispatch gate. D6 removes the two handoff block entries. |
| Role profiles | Hand-maintained `agents/*.md`; `agents/tdd-guide.md` and `agents/implementer.md` are the D4 sources | Codex/plugin TOML role copies are byte-checked across `plugins/kaola-workflow`, `plugins/kaola-workflow-gitlab`, and `plugins/kaola-workflow-gitea`; `validate-vendored-agents.js` and `test-agent-profile-parity.js` police them | D4 touches the implementer wording in the source plus its three TOML twins. The tdd-guide source and its twins remain acceptance-test custody authority. |
| Reviewer behavior | `templates/reviewers/behavior-contracts.json` and `runtime-adapters.json` | `scripts/generate-reviewer-profiles.js:8-13,171-205` writes three Claude Markdown reviewer profiles and nine Codex/plugin TOMLs | Keep the role-boundary, candidate-scope, acceptance, security, and zero-findings behavior. Do not delete the generator or native adapter metadata merely because the fixed reviewer routing is removed. |
| Tier membership/default metadata | `scripts/kaola-workflow-adaptive-schema.js:594-604` exports `CODEX_PINNED_{STANDARD,REASONING,HEAVY}_ROLES` | `templates/routing/slots.js:127-131` reads the registry; `scripts/edition-sync.js` materializes the four kernel copies | Keep role-to-tier classification as profile/default metadata. Remove only the fixed model/effort prose and its fixed-pair guards. |
| Runtime hooks and adapters | `hooks/kaola-workflow-subagent-dispatch-log.sh`; `hooks/hooks.json`; runtime source/template adapters under `templates/opencode/` and `scripts/sync-*-edition.js` | Edition sync renders opencode/Kimi/Grok/Cursor/ZCode hook/config trees; installers copy them into runtime homes | D8 must remove the dispatch event and shell from every generated path while preserving compact-context/session-start behavior. |
| Shared sidecar kernel | `scripts/kaola-workflow-adaptive-schema.js`, `kaola-workflow-telemetry-report.js`, `kaola-workflow-sink-merge.js`, and `kaola-workflow-closure-contract.js` | Four edition copies are materialized by `scripts/edition-sync.js` and checked by `validate-script-sync.js` | Remove active dispatch-log membership/telemetry, but retain node timing, outcome recording, sink safety, and legacy closure compatibility where those still protect surviving behavior. |

The generator surface count is not the complete handoff count: 18 is the tracked routing output set;
`test-route-reachability.js` derives 21 output/consumer legs per topic, including additive runtime
command lanes, so the current handoff parity test covers 42 final consumers.

## 2. D3 — adaptive delegation wording

### Current authored and generated wording

The same policy is currently spread across these source surfaces:

- `templates/axioms.md:15-17`, mirrored in `CLAUDE.md` and `README.md`, contains the old
  “Dispatch production; keep decisions” / “Parallel by default” axiom language.
- `templates/routing/init.skeleton.md:148-150` repeats those axioms; its managed block at
  `:159-171` says to delegate production by default.
- `templates/routing/next.skeleton.md:234-242` already has a shape decision, but says that
  delegation is “usually right,” and `:285-294` says “Subagent delegation is the default posture,”
  requiring a model/reasoning pair for every spawn.
- `templates/routing/finalize.skeleton.md:106-111` permits inline repair or dispatch but still
  couples the route to the old test-path custody and fixed routing clauses.
- `templates/routing/required-blocks.js:190-197` requires the negative “no disjointness proof,
  evidence line, cap, approval” and “offered and declinable” phrases. These are generated-surface
  consistency pins, not runtime behavior, and must not preserve obsolete wording after the source
  changes.
- `docs/conventions.md:21-30` describes orchestrator judgment but still calls delegation of
  discretionary production the default. `docs/architecture.md` and README explanatory sections
  repeat the current posture.

### Smallest wording that preserves the owner refinement

The canonical rule should be one paragraph, used wherever the current default/parallel prose is
authored, and then regenerated:

> Choose dispatch or inline per item. Dispatch when it materially reduces main-context residue,
> supplies independent judgment, or enables genuinely independent parallel work. Keep one production
> owner for a cohesive state machine, protocol, or integration when handoff and integration cost
> exceed that benefit. Both modes are first-class; width follows the true work frontier. No dispatch
> count, cap, disjointness proof, justification, approval, or fallback stigma attaches to the judgment.

This explicitly preserves concurrent multi-agent work when it has the highest efficiency, while making
inline/one-owner execution equally legitimate for feed-forward or tightly coupled work. It does not
introduce a score, approval step, fallback classification, dispatch quota, or proof obligation. The
old “default posture,” “usually right,” and “parallel by default” sentences should not survive as
alternate copies.

The source-of-truth order is: canonical axiom/routing skeleton wording first, `required-blocks.js`
tokens second, generated 18 surfaces third, and active README/CLAUDE/docs mirrors last. Historical
decision records can retain their original rationale; they are not runtime prompt sources.

## 3. D4 — test-custody narrowing

### Exact live clauses

- `agents/tdd-guide.md:26-38` correctly gives `tdd-guide` custody of the test artifact, excludes
  production code, and requires acceptance claims, baseline, and RED evidence at `:54-62`. Those
  invariants survive.
- `agents/implementer.md:32-39` currently says “What you may never do is write, weaken, delete, or
  skip a test,” then makes every test path read-only. The ban on weakening/deleting/skipping to make
  a change pass is a surviving safety rule; the universal path prohibition is the D4 target.
- The same implementer text is in `plugins/kaola-workflow*/agents/implementer.toml` around lines
  15-18. The three plugin TOMLs are byte-identical copies, not independent policy sources.
- `CLAUDE.md:115-120` states the active user-facing custody rule. `init.skeleton.md:127-130` and
  the generated init surfaces also say whoever implements a behavior never authors its tests. This
  should distinguish acceptance authorship from mechanical path maintenance.
- `templates/routing/finalize.skeleton.md:106-111` says that `tdd-guide` owns the test artifact and
  “no other role may write a test path.” The route should retain the tdd-guide destination for a test
  defect but allow the bounded D4 maintenance exception.
- `templates/routing/slots.js:79-81` repeats the implementer “test read-only boundary.” That text is
  inside the D6 seven-field slot and disappears with the slot; do not create a second D4 copy when
  replacing the compact handoff.

The smallest live rule is: the independent test author owns acceptance meaning and RED proof; the
implementer may perform mechanical maintenance required by the production change (fixture plumbing,
compile-only signature migration, generated-manifest wiring, or test-only adapter/equivalent harness
updates) only when the acceptance claim and asserted behavior are unchanged. Any changed expectation,
accepted behavior, weakened/deleted/skipped assertion, or product-versus-test contradiction returns to
the independent test author or main. This preserves independent acceptance without a path classifier
or universal custody gate.

### D4 test map

- Update/delete only the implementer-specific role pins in `scripts/test-agent-profile-parity.js:37-50`
  (`You do not hold custody...`, the absolute “may never write” sentence, and “every test path as
  read-only”). Keep the tdd-guide pins at the same section and keep the other role-profile parity
  guards.
- Keep RED/baseline and acceptance checks in `agents/tdd-guide.md` and the relevant walkthrough and
  validation suites. Do not “repair” a test merely to make an old custody pin pass.
- Update the finalize route and regenerated next/init/finalize surfaces; no new path classifier or
  custody schema is called for by D4.
- `docs/decisions/D-814-01.md` is a historical decision record. Its zero-write wording is evidence
  of the old contract, not a generated runtime surface; preserve it unless the owner explicitly asks
  for a historical amendment, and document the superseding D4 change in the Unreleased entry.

## 4. D5 — converged review guidance

`templates/reviewers/behavior-contracts.json:24-48` is the canonical reviewer behavior. It already
requires review of the exact supplied candidate/scope, acceptance comparison, correctness/security/
concurrency/persistence/compatibility checks, and candidate-anchored findings. The generated
`agents/code-reviewer.md`, `security-reviewer.md`, and `adversarial-verifier.md` plus their nine TOML
outputs inherit that contract through `scripts/generate-reviewer-profiles.js`.

The target process wording is compact: review the cohesive converged candidate against its acceptance
and required safety concerns; send a finding to the existing production or test owner; after repair,
re-review the repaired finding surface and any new claim. Security-sensitive work still receives
security review. There is no fixed planner/architect/TDD/implementer/reviewer replay, reviewer count,
or blanket re-dispatch gate.

The affected routing guard is `scripts/test-route-reachability.js` T20 at `:1263-1307`. Its current
`REVIEWER_HEAVY_REDISPATCH` and `REVIEWER_HEAVY_MODEL_EXCEPTION` assertions (`:1271-1288`) are the
fixed reviewer-routing mechanism and are removed under D7. Its handoff extraction/parity assertions
at `:1289-1295` are removed under D6. Keep reviewer candidate/scope/acceptance behavior and the
independent security-review role; do not replace the deleted sequence with another mandatory sequence.

## 5. D6 — seven-field handoff removal and compact handoff retention

### Canonical contract and generated reach

`templates/routing/slots.js:44-93` is the complete seven-field source. It contains:

- the `main-authored-handoff` marker;
- the required ordered labels `Mission`, `Context`, `Authority`, `Scope and custody`, `Acceptance`,
  `Deliverable`, and `Stop and report` at `:54-70`;
- role-specialization paragraphs at `:72-86`; and
- sparse-packet/mission-list recovery language at `:88-91`.

`templates/routing/required-blocks.js:50-60` and `:110-120` make it a required next/finalize block.
`test-route-reachability.js` parses and checks it at `:1141-1261`, then derives 21 surfaces per topic
and 42 total at `:1486-1522`. Its three mutation families and 126 mutation legs are at `:1524-1591`.

D6 removes the marker, seven labels and order, role-specialization list, and machine reachability
pins. It retains the bounded natural-language idea: a delegated role receives only the result/question,
relevant measured evidence, authority/custody boundary, exact result locator, and stop condition; the
role profile remains authoritative for universal behavior, inherited conversation is not required, and
the mission list remains the recovery index. The compact paragraph should be ordinary canonical
routing prose, not another delimited schema or required seven-field block.

### D6 deletion/update map

- Delete the `main-authored-handoff` slot and both required-block manifest entries. The existing
  `HANDOFF_OPEN`, labels, semantic-needle list, extraction, parity, and mutation machinery in
  `test-route-reachability.js:1141-1261,1486-1592` must be deleted with that mechanism, not weakened
  until a vacuous check passes.
- Remove the handoff half of T20 (`:1289-1295`) and the synthetic marker fixtures around
  `:1873-1927`. Remove the 21/42/126 count assertions and any `HANDOFF_*` constants; do not replace
  them with a new prompt schema or linter.
- Regenerate all next/finalize command and skill surfaces. The generated outputs are the 18 tracked
  files plus the additive runtime consumers; no direct output edits are authoritative.
- Update `docs/conventions.md:84-109` and `docs/architecture.md:314-329`, which currently describe
  the seven-label block and 42-surface validator. Update active README/routing descriptions as well.
- Preserve `next.skeleton.md:262-267` and the corresponding README recovery guidance at
  `README.md:1371-1376`: a successor checks whether the promised file or commit locator exists.
  That is workflow-state recovery and production deliverable findability, not the deleted dispatch-log
  sidecar and not a reason to retain seven labels.

## 6. D7 — fixed model-routing removal

### Live source and retained metadata

The fixed Codex contract is authored in both topic skeletons:

- `templates/routing/next.skeleton.md:1-20` and `:43-61`;
- `templates/routing/finalize.skeleton.md:1-20` and `:48-67,113-123`; and
- `templates/routing/slots.js:119-161` supplies the role roster used by the skeletons.

The fixed text names Luna/max, Sol/medium, and Sol/high, requires an explicit model on every spawn,
forbids task-breadth/latency/prior-result/risk/availability adaptation, and reserves a reviewer-class
heavy/fable carve-out. The installer-filled command placeholders and the skill dispatch prose are
different rendering shapes of the same fixed policy.

Retain:

- `CODEX_PINNED_STANDARD_ROLES`, `CODEX_PINNED_REASONING_ROLES`, and
  `CODEX_PINNED_HEAVY_ROLES` in `scripts/kaola-workflow-adaptive-schema.js:594-604`;
- role tier classification as profile/default metadata, including the planner/code-architect heavy
  classification;
- `scripts/kaola-workflow-resolve-agent-model.js` and `test-agent-model-resolver.js` for native role
  default/profile resolution;
- runtime-native capability behavior: opencode's optional user model pin, Kimi session inheritance,
  Grok/Cursor tier/frontmatter limits, ZCode's native GLM/thought-level rendering, and reviewer
  adapter metadata in `templates/reviewers/runtime-adapters.json`; and
- installer/profile readiness and model rendering tests that do not assert the deleted fixed per-spawn
  pair.

Delete only the workflow-level fixed pair, explicit-every-spawn requirement, forbidden-adaptation
language, and reviewer heavy/fable escalation model. The resulting runtime/profile default may be
used when it is the cheapest sufficient choice, and a caller may adapt model/effort to task breadth,
latency, prior result, risk, availability, or other evidence without a new approval or score gate.

### D7 test/docs map

- In `scripts/test-route-reachability.js`, remove the model-routing marker/helper and fixed clauses
  at `:61-92`, fixed-pair validation at `:136-208`, T19 fixed model block and mutation assertions
  at `:529-676`, and T19b `EXPECTED_PAIRS`/pair defects and mutations around `:800-955`.
  Retain T19 install/profile readiness and T19b role-roster membership checks where they prove tier
  classification rather than model literals. Remove the fixed marker from `FOREIGN_MARKERS` around
  `:1329`.
- Remove T20's reviewer heavy/fable assertions (`:1271-1288`) with the fixed routing mechanism.
- Update `README.md:1544-1576`, `docs/conventions.md:34-58`, `docs/architecture.md:418-439`, and
  `docs/api.md` model-routing prose. Keep the resolver explanation and native edition capability
  documentation, but stop claiming that every Codex spawn has a fixed pair or that every reviewer
  has a fable escalation.
- The `codex-tier-roster` slot is still a source of membership if tier metadata remains visible in
  generated guidance. Whether the owner removes that display and relies exclusively on profile
  metadata is a design choice; either way, it must not retain fixed model/effort literals.

## 7. D8 — dispatch-log producer/consumer/installer/runtime map

### Producer and registrations

| Surface | Current source and behavior | D8 action |
|---|---|---|
| Shell producer | `hooks/kaola-workflow-subagent-dispatch-log.sh:1-118` parses SubagentStart stdin, resolves model/planned model, and appends `ts`, `agent_type`, `agent_id`, `cwd`, `model`, and `model_planned` JSON lines to `kaola-workflow/{project}/.cache/dispatch-log.jsonl`; it also deduplicates worktree roots | Delete the producer and all four byte-identical copies: root `hooks/`, `plugins/kaola-workflow/hooks/`, `plugins/kaola-workflow-gitlab/hooks/`, and `plugins/kaola-workflow-gitea/hooks/`. No replacement event log is specified. |
| Claude registration | `hooks/hooks.json:18-30` registers `kaola-workflow:subagent-dispatch-log` on `SubagentStart(*)` | Remove only this managed entry; retain compact-context `SessionStart`. |
| Codex/forge registrations | `plugins/kaola-workflow/config/hooks.json:17-29`, plus GitLab/Gitea `config/hooks.json`/`hooks/hooks.json` copies, register the same SubagentStart command and description | Remove dispatch entries from every config family and regenerate/validate the remaining hook config. The closure-attestation description is stale and goes with the entry. |
| Sync guard | `scripts/validate-script-sync.js:180-186` groups the four hook copies; config/hook-family checks are around `:302-342` | Remove the retired hook family from parity expectations while keeping the surviving config/script parity guards. |

### Runtime adapter and generated-copy map

- `templates/opencode/plugins/kaola-workflow-hooks.js:3-16,29-31,74-87,145-166` maps a task
  `tool.execute.before` event to the shell and adapts `{agent_type, agent_id, cwd}`. Remove the
  dispatch mapping, constant, invocation and payload branch; keep the compaction hook.
- `scripts/sync-opencode-edition.js:107-119` lists the dispatch shell in `HOOK_SCRIPTS`; remove
  that item and its generated registration while retaining the plugin source/compact path.
- `scripts/sync-kimi-edition.js:103-108,550-572,697-709` copies the shell, renders a
  `SubagentStart -> dispatch-log` TOML mapping, and adapts `agent_type` to `agent_name`. Remove all
  three dispatch pieces; Kimi's compact/PostCompact path remains.
- `scripts/sync-grok-edition.js:7-13,55-57,331-353` copies the shell, emits a SubagentStart
  registration, and adapts `agent_type`/`agentType`/`subagentType` and `agent_id`/`agentId`.
  Remove the dispatch registration/copy/adaptation while retaining surviving hooks.
- `scripts/sync-cursor-edition.js:8-13,56-58,391-394,510-515` has the same shell and
  `subagentStart` registration plus payload adaptation. Remove dispatch-only pieces.
- `scripts/sync-zcode-edition.js:63-72,346-364,421-427` is a special hazard: ZCode has no
  SubagentStart, but currently maps a `PreToolUse` path to the dispatch shell and adapts
  `agent_type`/`agent_id`/`model`. Remove that fallback mapping, shell/adaptation and its expected
  hook file entries at `:539-545`; retain the compact wrapper and retired-artifact cleanup at
  `:567-585,642-676,753-760`.

### Installer and manifest map

- `scripts/kaola-workflow-install-manifest.js:79-83` and the plugin mirror declare
  `SUPPORT_HOOKS = ['kaola-workflow-subagent-dispatch-log.sh']`; `:130-134` exposes it to the
  installer and `:142-185` exports/validates it. Removing the last support hook may hit the current
  non-empty guard around `:168-170`; the installer needs an explicit no-support-hook path rather than
  an empty-list failure or a phantom replacement.
- `install.sh:681-726` copies support hooks and renders/merges hook settings; `:940-945` reports
  “compaction resume, subagent-dispatch-log.” Remove the retired copy/reporting and stale managed
  config entry, preserving generic compact-hook installation and uninstall handling.
- `install-opencode.sh:423-425`, `install-kimi.sh:358-375`, `install-grok.sh:266-296`,
  `install-cursor.sh:279-318`, and `install-zcode.sh:232-301,401-411` copy generated hooks and/or
  merge generated configs. Their loops can survive; their dispatch result must disappear from the
  generated input. ZCode's uninstall branch must also stop expecting the retired shell.
- `install-all.sh` has the release/install matrix but no independent dispatch-log policy. Keep its
  matrix and let the generated/manifests determine the reduced hook set.

### Sidecar consumers and compatibility

- `scripts/kaola-workflow-adaptive-schema.js:594-618,804-820,1624-1628` defines
  `DISPATCH_LOG_NAME`, includes it in `PARENT_OWNED_SIDECARS`, includes it in the artifact registry,
  and exports it. Remove that member/registry/export in the root and all three edition copies;
  retain `node-timings.jsonl` and `outcome-log.jsonl`.
- `scripts/kaola-workflow-telemetry-report.js:20-40,80-106,176-206,270-289` reads/destructures
  dispatch rows and passes them through `buildReport`/`reportProject`; remove the dispatch input and
  opened/re-dispatch loop, retain outcome/node timing reporting and its four edition copies. Update
  `docs/api.md:1470-1479` so the input set is no longer a three-sidecar contract.
- `scripts/kaola-workflow-sink-merge.js:1828-1840` and the root/plugin copies list the project
  `.cache/dispatch-log.jsonl` among untracked state files; remove the active sidecar from that list
  only after preserving the remaining sink safety checks. Stale attestation comments around
  `:1158-1161,1983-1986,2394-2397` should no longer imply an active dispatch attestation.
- `scripts/kaola-workflow-closure-contract.js` and the three plugin copies refer to retired
  attestation fields and legacy receipt/archive compatibility. Keep the legacy reader/compatibility
  behavior unless a separate owner decision authorizes archive migration; clarify that no active log is
  produced.
- `scripts/test-claim-hardening.js:1820-1858` covers legacy attestation/archive shapes. Preserve
  those historical compatibility tests; remove only active-producer/consumer expectations.

Do not recursively delete existing archived or user-owned `.cache/dispatch-log.jsonl` files as part of
this source deletion without an explicit retention decision. The safe compatibility default is: new
runtime/installations stop producing and consuming the sidecar; old archived evidence remains readable
or inert. Any cleanup of an active untracked file must use the normal sink/issue ownership rules.

## 8. Test inventory: delete with mechanism versus retain surviving behavior

### Delete or rewrite with D3/D6/D7/D8

- `scripts/test-route-reachability.js`: delete the fixed model marker/pair/T19 checks, reviewer
  heavy/fable T20 checks, seven-field handoff T20/T21 extraction/parity/mutation/count machinery, and
  stale marker universe entries. Keep generated-surface reachability, surviving roster membership,
  and non-vacuity checks that still protect live prose.
- `scripts/test-agent-profile-parity.js:37-50`: remove the absolute implementer test-path pins;
  retain the tdd-guide/implementer reciprocal custody and all unrelated role pins, expressed in the
  narrowed wording.
- `scripts/simulate-workflow-walkthrough.js`: remove the dedicated dispatch producer/model/worktree
  tests (`testDispatchLogHookWorktreeAware338`, `testDispatchLogEmitsModelFields566`, and
  `testDispatchLogCapturesWorktreeResident...568`, around `:12444-12635`), plus dispatch-specific
  retired-attestation/backfill assertions around `:12659-127xx`. Keep closure, locator, node-timing,
  outcome, and independent acceptance behavior.
- Plugin walkthroughs: remove the explicit dispatch-hook/config assertions in
  `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js:745-790`, the GitLab/Gitea
  Codex SubagentStart assertions around `simulate-*-codex-workflow-walkthrough.js:79-124`, and
  dispatch-hook existence tests around `:802-818`. Narrow, rather than delete, closure journeys that
  also test surviving sink/receipt behavior.
- `scripts/test-outcome-recorder.js:146-173,226-239,282-285,377-380,439-448`: remove dispatch
  sidecar membership, report-input, dispatch fixture, and dispatch re-dispatch assertions; retain
  outcome/node membership and report behavior. Apply the same classification to its plugin sink tests
  (`plugins/*/scripts/test-*-sinks.js` around the dispatch/retired-field assertions).
- Edition tests `scripts/test-opencode-edition.js`, `test-kimi-edition.js`, `test-grok-edition.js`,
  `test-cursor-edition.js`, and `test-zcode-edition.js`: delete expected dispatch-hook/config,
  payload-adaptation, and dispatch-log output assertions; retain compact hook, native model, and
  surviving runtime configuration tests.
- `scripts/test-validate-script-sync.js` and any install-manifest/model-rendering assertions that
  expect the retired support hook or fixed workflow pair must be re-based on the reduced manifest;
  preserve generic byte-sync and profile/install tests.

### Retain as protection for surviving behavior

- `generate-routing-surfaces.js --check`, routing reachability for live blocks, edition sync parity,
  vendored-agent parity, reviewer profile generation, and the non-vacuity/byte checks that still have
  a live source.
- `test-agent-model-resolver.js`, profile default rendering, native edition model capability tests,
  and adaptive-schema kernel conformance. These prove profile/native defaults, not the deleted fixed
  Codex pair.
- tdd-guide RED/baseline/acceptance tests, implementer tests that prohibit weakening/deleting/skipping
  acceptance, independent reviewer/security/adversarial profile behavior, and full integration closure.
- Sink/claim hardening tests for workflow-state ownership, branch/worktree safety, legacy receipts,
  archived compatibility, and production deliverable locators. Do not remove these because the
  dispatch-log sidecar is gone.
- The package scripts in `package.json` remain the validation entry points. After implementation,
  run the relevant focused chains, all four forge lanes, edition-specific tests, and `npm test`; the
  full scripts include materialization and should be run in the owner-controlled validation phase.

## 9. Active documentation and release surfaces

Active docs that contain live wording or tables to update:

- `README.md`: axiom copies around `:28-40`, fixed model table/contract around `:193-200,1544-1576`,
  hook tables around `:1289-1323`, and keep locator recovery around `:1371-1376`.
- `CLAUDE.md`: active axiom/concurrency wording and test custody around `:108-120`; preserve
  consumer-facing vendor/model neutrality.
- `docs/conventions.md`: adaptive execution `:21-30`, fixed model routing `:34-58`, and seven-field
  handoff `:84-109`.
- `docs/architecture.md`: runtime hooks/model grid `:350-378`, handoff contract `:314-329`, and
  fixed Codex model contract `:418-439`.
- `docs/api.md`: telemetry sidecar input `:1470-1479` and fixed model-routing API explanation around
  `:1550-1576`.
- Runtime edition docs: `docs/opencode-edition.md:197-203`, `docs/kimi-edition.md:43-51,175-196,
  373-375`, `docs/grok-edition.md:49,141-151`, `docs/cursor-edition.md:221-234`, and
  `docs/zcode-edition.md:31,97-105`.
- `CHANGELOG.md`: add the user-visible D3-D8 behavior under `[Unreleased]`; retain historical
  #1029/#1010/#1018/#277 entries as history. `docs/decisions/` and dated audit/investigation files
  are historical evidence unless a file is explicitly an active contract.

The release impact is an installed-surface migration, not just prompt prose: upgrades must remove
old dispatch registrations and stale generated hook files, and the reduced telemetry API must be
documented. The release owner should regenerate/check all routing and edition copies, run the full
validation chains, and include the Unreleased documentation in the normal release surface. No version,
tag, or publication decision is implied by this map.

## 10. Facts, assumptions, and remaining owner decisions

Facts established at this snapshot:

- The current generated routing tree is clean and consists of 18 tracked surfaces; the current
  handoff guard derives 42 consumers and 126 mutation legs.
- The dispatch log has one shell producer family, multiple event-specific runtime adapters, multiple
  installer/config paths, and active schema/telemetry/sink references; it is not safe to delete one
  file in isolation.
- Role tier membership and native model/profile resolution are separate from the fixed Codex pair
  prose and can survive D7.
- The current locator recovery text is independent of dispatch-log telemetry and is needed for
  safe resume; it must remain.

Assumptions/owner decisions to make during implementation:

1. Place the retained compact handoff as ordinary canonical routing prose, with no marker, labels,
   seven-field schema, or parity/mutation guard. If the owner chooses a marker, that would be a new
   contract and is outside the D6 deletion described by the issue.
2. Keep or remove the displayed `codex-tier-roster` based on whether tier metadata remains useful to
   the profile; either choice must remove fixed model/effort literals.
3. Define the empty `SUPPORT_HOOKS` installer behavior when dispatch-log is the final support hook;
   a no-hook install path must not fail closed or silently retain a stale hook.
4. Preserve historical dispatch-log/attestation fields in archived receipts unless an explicit
   compatibility/retention decision says otherwise. Do not let a deleted active consumer erase
   evidence needed by sink or closure safety.
5. Classify every historical decision/audit mention as history versus active documentation before
   editing it; history should not be rewritten merely to make a repository-wide string search empty.

## Suggested post-change validation order

1. Regenerate routing surfaces from the skeletons and run `node scripts/generate-routing-surfaces.js --check`.
2. Run edition/kernel sync and parity checks, including `node scripts/test-validate-script-sync.js` and
   the reviewer/profile validators; verify no generated runtime tree contains a dispatch registration,
   shell copy, or dispatch-log sidecar input.
3. Run focused D3-D8 route, custody, edition-hook, outcome/telemetry, sink, and walkthrough tests;
   ensure deleted-mechanism tests are gone rather than re-pinned.
4. Run `node scripts/simulate-workflow-walkthrough.js` and the three forge walkthroughs, then the
   package `npm test` chains. Check `git diff --check`, active-doc absence of stale fixed/default
   claims, and generated byte parity.

