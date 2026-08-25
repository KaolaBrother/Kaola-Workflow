# Implementation Plan: Self-sufficient role handoffs (#1029)

## Recommendation

Add one role-neutral, main-authored handoff block to the shared routing intermediate representation, insert that exact block into both `workflow-next` and finalization skeletons, and extend the existing route-reachability oracle to extract and compare the shipped bytes across every runtime/forge render. Keep role profiles unchanged: they remain the source of universal role behavior, while the routing block tells main what task-specific facts, decisions, boundaries, evidence, and locator it must carry to a child whose `fork_turns` is `"none"`.

This is the first solution-ladder rung that closes the measured gap. It reuses the routing generator, additive-runtime renderers, required-block manifest, and route-reachability suite. It adds no prompt-quality grader, spawn wrapper, schema, environment carrier, mission-list field, dependency, or runtime gate.

## Verified baseline and acceptance reading

- Candidate worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1029`
- Claimed baseline: `89d171ef71c65b5d8841e98c9b48f7e52b10a41a`
- Live issue #1029 is open and its only comment is the current claim marker; no comment overrides the body.
- `node scripts/test-route-reachability.js` is green at 557 assertions.
- `node scripts/generate-routing-surfaces.js --check` reports 18 tracked surfaces byte-matching their skeletons.
- The 18 count is not the whole consumer universe. It is three topics x two tracked surface types x three forges. Existing route-reachability infrastructure also renders opencode, Kimi, Grok, Cursor, and ZCode in memory through their own sync modules. Therefore the handoff obligation is 21 consumer surfaces per affected topic: three forges x seven runtimes. Because only `next` and `finalize` dispatch named roles, #1029 covers 42 consumer surfaces in total and 12 regenerated tracked files.
- No acceptance correction or user value decision is presently required. If implementation proves that a runtime transform cannot preserve the common block, that is new contradictory evidence: stop, report the exact transform and bytes, and ask whether to change the public byte-identity contract rather than inventing a paraphrase.

## Requirements and non-goals

The shipped routing rule must make main responsible for a compact packet in this exact field order:

1. `Mission`
2. `Context`
3. `Authority`
4. `Scope and custody`
5. `Acceptance`
6. `Deliverable`
7. `Stop and report`

The wording must establish these observable outcomes:

- A child with `fork_turns: "none"` can act without inherited conversation, an unstated main-context decision, or an environment variable that does not cross the spawn boundary.
- Measured facts, hypotheses, settled decisions, recommendations, and unresolved user-owned decisions are distinguishable.
- Write/read boundaries, exclusions, co-active ownership, and test-versus-production custody are explicit where relevant.
- Acceptance is falsifiable and the exact full-result locator is named.
- Main retains integration, acceptance, review consequence, and final done authority.
- Role selection specializes only task-specific content: planner/architect decision envelopes; TDD RED/baseline/test custody; implementer production custody/test-read-only boundary; investigation questions and measurement standards; repair/optimization/documentation mutation and completion bounds; existing reviewer claim/surface/acceptance contracts.
- A field may be compact or explicitly inapplicable with a reason; the rule does not require irrelevant padding.
- The mission list remains four fields and three write moments. Its `dispatched` value remains a recovery index naming what went out, to whom, and where the result lands; it does not become the full task specification.

Non-goals:

- No machine inspection of actual spawn prompts and no subjective “sufficient prompt” pass/fail gate.
- No new mission-list grammar, workflow-state schema, hook, dispatch log field, environment variable, or generated per-role packet template.
- No edits to `agents/*.md`, reviewer generators, model/tier routing, reviewer admission, or finalization authority.
- No copied universal role behavior in the task packet.
- No `init` surface change: `workflow-init` does not dispatch the named work roles covered by this issue.

## Architecture and minimum file surface

### Authored production source

1. `templates/routing/slots.js`
   - Add one shared string-valued slot containing the complete handoff block, including stable extraction delimiters and the seven canonical fields in order.
   - Keep the block runtime- and forge-neutral so additive transforms have no reason to rewrite it.
   - This is the single wording source used by both routing topics; do not copy the block into two skeletons.

2. `templates/routing/next.skeleton.md`
   - Insert the shared slot before the workflow begins dispatching named roles, so every normal role dispatch is governed by it.
   - Preserve the existing mission-list section as missions rather than specifications and preserve the Codex/command runtime-specific model regions around it.

3. `templates/routing/finalize.skeleton.md`
   - Insert the same shared slot before finalization's routed-fix, documentation, or review dispatches.
   - Keep runtime-specific `Agent(...)`, model, and reasoning syntax outside the common block.

### TDD-owned oracle surface

4. `templates/routing/required-blocks.js`
   - Add forward obligations for the common handoff content on `next` and `finalize`, both runtime lanes and both tracked/generated surface shapes.
   - Use the existing required-block vocabulary; do not create a second surface registry.

5. `scripts/test-route-reachability.js`
   - Reuse `MANIFEST_EDITIONS`, `GENERATED_SURFACE_CONTENT`, and the sync modules' renderers to enumerate all seven runtimes x three forges for each affected topic.
   - Extract the delimited block, compare exact bytes across all 42 surfaces, assert exactly one block per surface, and independently anchor 21 surfaces per topic (42 total).
   - Assert the seven field headings occur exactly once and in canonical order, plus the substantive custody, decision-boundary, falsifiability, locator, mission-list, and no-subjective-gate clauses.
   - Keep the guard about shipped bytes, not only `slots.js` or skeleton source.

Files 4 and 5 are test artifacts. They belong exclusively to `tdd-guide`; the implementer may read and run them but must not write, weaken, or delete them.

### Generated tracked families

Run `node scripts/generate-routing-surfaces.js --write` after the authored production source changes. It must update only the six tracked `next` surfaces and six tracked `finalize` surfaces:

- `commands/{workflow-next,kaola-workflow-finalize}.md`
- `plugins/kaola-workflow-gitlab/commands/{workflow-next,kaola-workflow-finalize}.md`
- `plugins/kaola-workflow-gitea/commands/{workflow-next,kaola-workflow-finalize}.md`
- `plugins/kaola-workflow/skills/{kaola-workflow-next,kaola-workflow-finalize}/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/{kaola-workflow-next,kaola-workflow-finalize}/SKILL.md`
- `plugins/kaola-workflow-gitea/skills/{kaola-workflow-next,kaola-workflow-finalize}/SKILL.md`

The same tracked command rows feed 30 additive consumer renders, two topics x three forges x five runtimes, under the `.opencode*`, `.kimi*`, `.grok*`, `.cursor*`, and `.zcode*` generated trees. Those trees are gitignored and are not commit inputs. `--write` refreshes only copies already present; the route-reachability test must render all of them in memory so absence on disk never skips coverage.

### Documentation docking

6. `README.md`
   - Add the user-facing main-authored handoff contract near workflow roles/dispatch, including `fork_turns: "none"`, task-specific versus profile behavior, and the unchanged compact mission-list boundary.

7. `docs/conventions.md`
   - Record the canonical source, affected consumer universe, shipped-byte guard, mutation proof, and the explicit rule that no subjective per-spawn sufficiency gate exists.
   - Cross-reference the existing “Specify the result; the method is the agent's” and “A guard reads what ships” rules instead of restating them loosely.

8. `docs/architecture.md`
   - Add the handoff layer between main's decision context and role profiles, and update the runtime capability table/pointer so all seven runtime columns resolve to the shared generated block.

9. `docs/api.md`
   - Document that the packet is a prompt-surface contract, not a new CLI/envelope/state API; explicitly state that mission-list and workflow-state schemas are unchanged.

10. `CHANGELOG.md`
    - Add an `[Unreleased]` entry for #1029 describing the shared packet, all-runtime/forge propagation, and parity/mutation evidence.

`docs/workflow-state-contract.md` already accurately states the four-field mission-list and `dispatched` locator behavior. Leave it unchanged unless the final documentation comparison finds a genuinely missing or contradictory statement.

## Dependency-safe implementation sequence

### Phase 1 — TDD oracle and RED evidence

Owner: `tdd-guide`. Dependencies: none beyond the verified baseline. Complexity: medium. Risk: a self-derived or vacuous coverage universe.

1. Write only the test-manifest and route-reachability changes in files 4 and 5.
2. Establish a green control by recording the current 557-assertion baseline at SHA `89d171e...`.
3. Run the new test-only state before production exists. Required RED evidence:
   - command: `node scripts/test-route-reachability.js`;
   - nonzero exit;
   - failure names the absent canonical block and/or obligated `next`/`finalize` surfaces;
   - the failure is not a syntax error, missing module, zero-width universe, or stale fixture;
   - record the exact failing assertion and baseline SHA in the TDD result.
4. Add pure in-memory mutation legs, but expect their green completion only after production lands:
   - remove one required field;
   - swap two adjacent fields;
   - change one canonical field name/content;
   - apply each mutation independently to every one of the 42 obligated surfaces and require a failure naming that surface, with an unmutated green control first.
5. Hand the test commit/result to the implementer without changing production source.

Incremental verification: the old assertions remain green; only the newly introduced contract assertions should be RED.

### Phase 2 — Shared production wording and propagation

Owner: `implementer`. Dependencies: Phase 1 RED evidence. Complexity: medium. Risk: duplicating role profiles, accidental runtime-specific wording, or changing tests to obtain green.

1. Read the TDD result and tests, then edit only files 1-3.
2. Author the compact common block once in `slots.js`. It should tell main what result/evidence/authority must travel, not prescribe the child's implementation method.
3. Insert the shared slot into both skeletons outside runtime-specific model/invocation regions.
4. Regenerate via `node scripts/generate-routing-surfaces.js --write`; never hand-edit a rendered command or skill.
5. Run `node scripts/test-route-reachability.js` until the TDD oracle is green without touching files 4-5.
6. Inspect the diff and generated output for exactly one block per surface, unchanged mission-list wording, no profile/model changes, no provenance tokens, and no tracked `init` changes.

Incremental verification:

```text
node scripts/test-route-reachability.js
node scripts/generate-routing-surfaces.js --check
node scripts/test-generate-routing-surfaces.js
node scripts/validate-workflow-contracts.js
git diff --check
```

If an additive transform rewrites or removes common block bytes, first confirm the runtime capability actually requires divergence. A genuine capability difference belongs outside the common block in an existing named runtime region. Do not paraphrase the common rule or weaken the byte-identity acceptance.

### Phase 3 — Documentation docking

Owner: `doc-updater`. Dependencies: Phase 2 stable production/test behavior. Complexity: small-to-medium. Risk: duplicating normative wording and creating future drift.

1. Update files 6-10 from verified generated bytes and actual guard output.
2. Prefer pointers to the canonical block and exact behavior boundaries. Do not claim a prompt-quality gate, automatic goal satisfaction, or new mission-list/state fields.
3. Record explicitly why `docs/workflow-state-contract.md` was unchanged, or update it only if the final comparison finds a real gap.

Incremental verification:

```text
rg -n "Mission|Context|Authority|Scope and custody|Acceptance|Deliverable|Stop and report|fork_turns" README.md docs/conventions.md docs/architecture.md docs/api.md CHANGELOG.md
git diff --check
```

### Phase 4 — Independent review and repair loop

Dependencies: Phases 1-3 integrated. Complexity: medium. Risk: a green guard that reads authored source rather than consumer bytes, or a packet that silently outsources a value decision.

1. Dispatch an independent `code-reviewer` over the exact candidate diff, the 42-surface obligation, test custody, and issue acceptance. Review must trace every additive renderer and confirm role profiles remain authoritative.
2. Dispatch an `adversarial-verifier` on one precise claim: removing, reordering, or changing any common field on any obligated surface is detected while the unmodified candidate remains green.
3. Route test defects only to `tdd-guide`; route production defects only to `implementer`; documentation findings to `doc-updater`. Re-run only the affected targeted commands after each repair.
4. Stop and report any unresolved public/value decision rather than allowing planner, architect, reviewer, or implementer to settle it.

## Validation strategy

### Targeted validation

Run from the candidate worktree after the final repair:

```text
node scripts/test-route-reachability.js
node scripts/generate-routing-surfaces.js --check
node scripts/test-generate-routing-surfaces.js
node scripts/validate-workflow-contracts.js
node scripts/test-opencode-edition.js
node scripts/test-kimi-edition.js
node scripts/test-grok-edition.js
node scripts/test-cursor-edition.js
node scripts/test-zcode-edition.js
node scripts/simulate-workflow-walkthrough.js
git diff --check
```

Expected evidence:

- Route reachability reports green and its assertion count increases from the 557 baseline.
- The routing generator still reports all 18 tracked surfaces byte-matching.
- The dedicated mutation battery proves all three failure classes against all 42 consumer surfaces; no surface is skipped because its generated tree is absent.
- All five additive edition suites pass, proving their full renderer/install contracts still accept the new block.
- The full-scope walkthrough exits 0; do not substitute the sampled fast-chain shard for this explicit workflow-change check.
- The worktree diff contains only the bounded authored/test/docs files and the 12 generated tracked surfaces.

### Full self-host validation

After all code, tests, generated surfaces, and test-consumed prose are final, run the producer once from the candidate worktree:

```text
node scripts/kaola-workflow-run-chains.js --project issue-1029
```

Because the diff touches edition routing surfaces, expect the producer to select the applicable four self-host chains and write `kaola-workflow/issue-1029/.cache/chain-receipt.json` in the authority folder. Confirm the receipt binds the final candidate, carries no red/waived/missing chain, and was produced after the final test-consumed prose change. The opt-in `test:kaola-workflow:claude:full` tier is not mandatory; the explicit full walkthrough above covers the workflow-specific sampling gap.

## Finalization and verifiable done state

1. Complete every mission-list item with its result locator; keep the full handoff packets/results in their dispatched deliverables, not as new mission-list fields.
2. Invoke `kaola-workflow-finalize` for `issue-1029` from the validated candidate worktree.
3. In acceptance, map every issue criterion to the new guard, generated bytes, role-custody evidence, documentation, or explicit prose evidence.
4. Confirm finalization records the chain receipt, changed paths, mission-list state, documentation docking, and any run gaps. Any finding that corrects the filed issue must be posted to issue #1029 before closure.
5. Commit the bounded candidate and use the normal sink. If the sink reports divergence, resolve it by correct merge/resynchronization or a PR; do not call the run done merely because a sink command returned.
6. Verify after sink:
   - the implementation commit is on the intended published mainline (or the explicitly chosen PR remains the recorded resolution);
   - issue #1029 is closed only when all acceptance evidence is satisfied;
   - `kaola-workflow/issue-1029/` is archived with its finalization summary and evidence;
   - the run's branch/worktree cleanup affected only its own lane;
   - `node scripts/kaola-workflow-closure-audit.js --project issue-1029` reports the scoped run clean, with any repository-wide outside-scope finding kept separate.

Done means a fresh reader can extract one byte-identical common handoff block from all 42 `next`/`finalize` runtime-forge surfaces; every required field and order is independently mutation-proven; a `fork_turns: "none"` child receives sufficient task-specific authority, custody, acceptance, and locator context; the mission list and role profiles retain their existing authority; targeted and final receipts are green and candidate-bound; documentation is docked; and the issue is finalized, sunk, archived, and closure-audited.

## Risks, mitigations, and decision points

| Risk | Mitigation / decision rule |
|---|---|
| A universal packet grows into copied role profiles | Keep seven common fields small; role-family bullets name only task-specific inputs/outcomes and point to installed role behavior. |
| The packet becomes a subjective runtime gate | Test only canonical wording, field order, exact shipped bytes, and enumerated surfaces. Never inspect arbitrary live prompts or grade “sufficiency.” |
| The 18 tracked count is mistaken for all runtimes | Independently anchor 21 surfaces per topic and render the five additive editions in memory. Keep `--check`'s 18 count as the tracked-source fact. |
| Test and production custody blur because `required-blocks.js` lives under `templates/` | Treat it as oracle data owned by `tdd-guide`; implementer owns only shared slot/skeleton/rendered product files. |
| A runtime transform rewrites generic prose | Keep invocation/model syntax outside the block; if bytes still differ, report exact evidence and require a named capability decision rather than an incidental rewrite. |
| The mission list becomes a second specification | Preserve its four fields and one-line missions; `dispatched` remains only the recovery index and result locator. |
| A planner/architect is allowed to settle an unresolved value call | `Authority` and `Stop and report` must distinguish recommendable from decidable matters; production stops until the user decides. |
| Documentation copies the rule and drifts | Use one canonical prompt block; docs explain source, boundary, and guard, and quote field names only where necessary. |
| Regeneration touches unrelated or ignored trees | Review `git status` after `--write`; commit only the 12 expected tracked renders. Present additive trees are disposable generated evidence, not source. |
| A test passes because its mutation never changed bytes | Assert each mutant differs from its control, then require a failure naming only the mutated surface; restore and prove green between legs. |

No irreversible/public decision is open in the current evidence. Changing the seven field vocabulary/order, weakening byte identity for a runtime, adding a mission-list/state field, or introducing a spawn gate would be a user-owned contract decision and must not be planned or implemented without explicit approval.

## Dogfood assessment of this handoff

The main-authored packet was sufficient to produce this plan with `fork_turns: "none"`.

- Necessary: `Mission` fixed the single outcome; `Context` supplied the candidate, baseline, live issue, and starting measurements; `Authority` settled the design direction and prohibited prompt-quality machinery; `Scope and custody` prevented edits to product/tests and collisions with the two concurrent artifacts; `Acceptance` made the plan falsifiable and preserved TDD/implementation separation; `Deliverable` made the full result recoverable at one exact path; `Stop and report` prevented silently planning through a contradiction or value call.
- Redundant but harmless: the issue URL duplicated issue number 1029, and the stated assertion/surface counts duplicated facts that still had to be verified live. They were useful as drift detectors, not authority.
- Missing but recoverable: the packet did not state that the 18 generator surfaces are only the tracked source family while the current consumer universe is 21 per topic including ZCode, rendered in memory through five additive sync modules. That distinction required repository tracing and would be valuable task-specific `Context` in a future handoff. No missing field or missing user decision blocked planning.

