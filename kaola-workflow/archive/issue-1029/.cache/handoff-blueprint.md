# Issue #1029 — Main-authored subagent handoff blueprint

## Status and decision

This blueprint is based on candidate `89d171ef71c65b5d8841e98c9b48f7e52b10a41a` in
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1029`.

The minimum design is a **main-authored, task-specific handoff packet with seven short labels**, plus
small role-family guidance for what task-specific information belongs under those labels. It is
prompt guidance, not a schema: there is no parser, completeness score, runtime prompt inspection,
approval step, or new mandatory handoff file. The mission list stays exactly four fields and remains
the recovery index. The installed role profile stays authoritative for universal role behavior.

Keep the seven labels from the issue. Combining them would merge distinct correctness boundaries:

- `Mission` separates the assigned result from background.
- `Context` separates evidence from authority.
- `Authority` separates settled decisions from decisions the child may not make.
- `Scope and custody` separates permission to read from responsibility to write.
- `Acceptance` makes the child result falsifiable without delegating the final verdict.
- `Deliverable` makes the result recoverable.
- `Stop and report` routes contradictions and missing authority back to main rather than letting the
  child silently expand or guess.

The economy comes from **sparse content**, not fewer labels. Do not require `N/A`, a reason for an
empty field, an evidence count, a token budget, or a fixed sentence count. A heading may be one
line. Include only task-specific content that exists and is relevant. The wording tells main what a
field means; it does not inspect whether main wrote a subjectively good brief.

No unresolved user-owned decision blocks this architecture. The issue and this dispatch settle the
ownership model, `fork_turns: "none"` requirement, role-profile authority, final-verdict authority,
and cross-runtime equality. Exact prose remains reviewable implementation wording; it does not
change a public API, schema, dependency, role tier, role classification, or working capability.

## Additive derivation

Start from ADR 0017's observed sufficient system: main has a goal, can dispatch named tools, and
keeps only interruption-recovery state in one mission list. Add only what issue #1029's current-tree
measurement forces.

| Evidence at the candidate | Smallest consequence |
|---|---|
| Reviewer dispatches already name surface and acceptance in both routing topics, while ordinary role dispatches do not. | Generalize task-specific sufficiency to every named-role handoff; do not add a second reviewer-only system. |
| `tdd-guide` consumes an acceptance surface and holds test custody; `implementer` stays in assigned production scope and treats tests as read-only. | Main must transmit acceptance and custody before either role starts. Do not copy either profile's process into the prompt. |
| `planner` and `code-architect` define rich output formats but the router does not supply the task's binding goal, non-goals, constraints, or decision envelope. | Main transmits the task-specific question, bounds, and authority; the profiles continue to own how planning/design is performed. |
| Reviewer profiles echo only candidate/claim/surface/evidence identities supplied by dispatch and never guess missing identities. | A handoff must name the exact candidate, review surface, claim/acceptance, and evidence locator. |
| The mission-list `dispatched` field is deliberately only what went out, to whom, and where the output was to land. | Keep the full packet out of the mission-list grammar. The `dispatched` locator may point to a durable packet, but no packet file is mandatory. |
| The requested dispatch must work with no inherited conversation. | The child receives every task-specific decision, bound, and evidence it needs in the packet or at exact repository locators. Correctness never depends on parent conversation history. |
| Routing prose already renders from three skeletons to six tracked surfaces per topic, then the five additive editions render from the canonical command rows. | Extend the existing skeleton/slot/generator path; do not create per-runtime prompt copies. |
| The existing required-block manifest derives all runtime/forge obligations and renders additive trees in memory. | Prove presence and byte equality over the derived 21-tree universe per topic; do not hand-maintain a surface list or require installed edition trees. |

First Principles resolve the remaining ties:

1. **Correct first:** main supplies the intended result, evidence, authority, custody, falsifiable
   acceptance, and locator before context is dropped.
2. **Save human time:** evidence main already paid to establish travels once; the child does not
   repeat discovery caused only by an incomplete prompt.
3. **Spend as little as possible:** one common block and five compact family deltas replace per-role
   templates, new state, or runtime inspection.
4. **Machines decide facts; humans decide values:** facts and hypotheses are labeled; unresolved
   value calls come back to main, which asks the user.
5. **Own your verdicts:** the child returns production or evidence. Main accepts, integrates, routes
   consequences, and decides done.

This does not contradict ADR 0017. ADR 0017 prohibits turning the mission list into a specification
or machine-verified schedule; it does not require main to send under-specified prompts. The packet
exists only at an actual dispatch boundary and does not become durable run machinery.

## The smallest common handoff invariant

The following is the recommended normative block. Author it once and render it byte-identically on
both dispatch-capable routing topics. The field names and order are part of the shared wording; the
task-specific values are written by main at dispatch time.

> **Main-authored handoff.** Before each named-role spawn, main writes a task-specific brief that the
> role can execute from the brief, its installed profile, and the named repository evidence alone;
> inherited conversation is never required. The role profile remains authoritative for universal
> role behavior. Main retains product intent, value decisions, integration, acceptance of returned
> work, and the final done verdict.
>
> `Mission:` one result to produce or one question to answer.
>
> `Context:` the candidate/worktree and baseline identity, relevant measured facts, hypotheses
> labeled as hypotheses, and only the upstream evidence this task needs.
>
> `Authority:` decisions already settled; decisions the role may recommend but not make; and any
> unresolved user-owned decision.
>
> `Scope and custody:` read/write boundary, explicit exclusions, test-versus-production ownership,
> and co-active ownership relevant to avoiding collisions.
>
> `Acceptance:` falsifiable conditions for this role's deliverable and its stopping boundary. State
> the required result and proof, not an implementation method. This is not the workflow's final done
> verdict.
>
> `Deliverable:` what returns and the exact path, commit, or evidence locator where the full result
> lands.
>
> `Stop and report:` return contradictory evidence, ambiguity that changes the result, a capability
> gap, an out-of-scope finding, or a user-owned decision to main; do not silently assume, expand, or
> work around it.

The shipped block should add one final economy sentence: **“Keep the packet compact: include only
task-specific facts, decisions, bounds, and evidence; do not repeat the role profile.”**

The common wording specifies the result, not the spawn mechanism. A runtime that exposes history
control should use `fork_turns: "none"`; that invocation syntax belongs in a capability-specific
region if it needs to ship at all. The byte-identical block states the portable invariant: inherited
history is never required.

The packet may be inline in the spawn prompt or stored at an exact durable path that the spawn prompt
names. Do not mandate a handoff file. A packet referenced by path must still be readable in the
child's worktree and must not rely on an environment variable that is absent at spawn.

## What main retains and what it emits

### Main retains

- the user's goal, purpose, priority, and unresolved value judgments;
- the integrated view across work items and the decision to run inline, sequentially, or in
  parallel;
- role selection, model-tier routing, and any allowed runtime-specific dispatch override;
- allocation of test, production, documentation, and evidence custody;
- acceptance of the returned artifact, consequences of review findings, integration choices, and
  the final done verdict;
- decisions that affect another child or change the run frontier.

“Retains” does not mean hides. Main emits the settled subset needed for this child to act correctly,
but does not outsource deciding it.

### Main emits for this task

- the exact result/question and candidate identity;
- measured facts already established by main, with source locators;
- hypotheses only when labeled as hypotheses;
- settled constraints and non-goals;
- the child's decision envelope and the user-owned boundary;
- readable and writable surfaces, exclusions, and relevant co-active ownership;
- acceptance claims and the proof expected from this role;
- the exact result locator and failure-routing conditions.

Do not emit the whole conversation, generic repository history, the role profile copied into the
brief, speculative risks unrelated to the task, or a prescribed implementation mechanism unless
that mechanism is itself a measured compatibility contract.

## Minimal role-family specialization

These are **content deltas inside the common packet**, not new templates or role-profile edits.

| Family | Task-specific additions main supplies | Acceptance focus | Boundary that remains with main |
|---|---|---|---|
| Planning and design (`planner`, `code-architect`) | Binding goal or exact design question; planning/design scope and non-goals; existing patterns/invariants; compatibility constraints; settled decisions; open value calls; permitted recommendation envelope. | A concrete dependency-safe plan or blueprint with exact files/interfaces/task order, tests per task, risks, rollback/failure routing, and explicit independent work. No product-file edits. | Choosing among user-owned product/API/schema/dependency decisions and approving the plan/blueprint. |
| Read and investigation (`code-explorer`, `investigator`, `knowledge-lookup`) | One exact question or claim; candidate/baseline/environment; evidence surface; whether execution is permitted; the observation that would settle the question; output locator. | Reproducible evidence, commands/anchors where applicable, observation separated from inference, and explicit unknowns. No remedy selection or tracked-file mutation. | Deciding the remedy and integrating evidence with the rest of the run. |
| Test authoring (`tdd-guide`) | Acceptance claims; exact baseline SHA; test-artifact custody; production exclusion; subject under test; required test command and RED evidence locator. | A believable near-miss fails on the recorded baseline, against the real subject; report failure signature and test paths. | Product behavior decisions, production implementation, and final green/done verdict. |
| Production implementation (`implementer`) | Intended behavior; production write custody and exclusions; authored tests/acceptance evidence to read; test paths explicitly read-only; relevant before-state and verification expectation. | Correct behavior plus the role's applicable verification-tier evidence; no test edits or self-issued done verdict. | Test custody, acceptance of the implementation, review consequences, and final done. |
| Repair, convergence, docs, and optimization (`build-error-resolver`, `synthesizer`, `doc-updater`, `metric-optimizer`) | Concrete failure or candidate state; exact mutation boundary; artifacts/branches/behavior to preserve; for docs, changed files and declared doc surfaces; for optimization, metric command/direction/repeats/minimum delta/regression gate/stop condition. | The named failure retested; both branch intents preserved or collision reported; docs reconciled to verified ground truth; or the bounded metric ratchet stopped with its full iteration record. | Architecture changes, choosing a side in a design collision, undocumented public-contract changes, ambiguous gates/metrics, and final acceptance. |
| Reviewers (`code-reviewer`, `security-reviewer`, `adversarial-verifier`) | Exact candidate and dispatched surface; intended behavior/claim; acceptance evidence; seeded evidence locator and identities. Security review also receives the trust/security-sensitive boundary. Adversarial verification receives exactly one recorded claim and one surface. | Candidate-caused findings anchored to the dispatched surface; out-of-scope observations stay observations. Adversarial result is `refuted`, `not_refuted`, or `indeterminate` for its single claim. | Admission consequence, repairs, combined verdicts, and final done. |

The family table must not restate role processes, output schemas already owned by profiles, tool
manifests, model routing, or reviewer confidence/admission policy. If a universal behavior is wrong
or missing, repair the authoritative profile in a separately scoped issue; do not compensate by
copying it into every task prompt.

## Mission-list relationship

No mission-list grammar changes.

- At creation, `item` remains one-line mission prose with hints and facts, never a role, file list,
  dependency edge, or packet.
- Before spawn, `dispatched` still records what went out, to whom, and where the output will land.
- If main chooses to persist a large packet, `dispatched` may name that packet path along with the
  output locator, but this is ordinary prose and not a new field.
- At close, `result` records the outcome locator or a few inline lines.
- Resume continues to look for the promised work, not the worker. A successor may re-author an
  equivalent packet from the mission item, current candidate, and existing evidence before
  re-dispatch; no runtime prompt log is durable authority.

Do not add `role`, `scope`, `acceptance`, `handoff`, `dependency`, model, or agent identifiers to the
mission-list grammar. Do not attest, freeze, hash, parse, or machine-verify individual handoffs.

## Canonical source and cross-runtime generation

### Authoring source

Reuse the existing routing generator's `SLOT` mechanism:

1. Define one plain string value, `SLOTS['main-authored-handoff']`, in
   `templates/routing/slots.js`. It contains the complete marked normative block and the five
   compact role-family bullets. A plain shared slot is already supported by `resolveKeyed`; no new
   renderer directive or include engine is needed.
2. Insert `<!-- SLOT:main-authored-handoff -->` once in
   `templates/routing/next.skeleton.md` and once in
   `templates/routing/finalize.skeleton.md`, outside runtime and forge `REGION`s and after any
   runtime-specific model-routing section. That makes the same bytes available before every spawn
   described by either topic.
3. Mark the slot's contents with `<!-- PIN: main-authored-handoff -->` / `<!-- /PIN -->` so tests can
   extract the complete final shipped block without depending on surrounding topic prose.
4. Remove the old reviewer-only “surface and acceptance” sentences from the runtime-specific model
   routing regions after the shared block is in place. The reviewers family bullet preserves and
   strengthens that behavior on every runtime. Keep the reviewer heavy-routing carve-out unchanged.

This placement is the single normative wording source. The skeletons contain only the same slot
reference, so neither topic owns a paraphrase.

### Propagation

`node scripts/generate-routing-surfaces.js --write` renders the slot to the six tracked surfaces for
each affected topic: Claude command and Codex skill shapes across GitHub, GitLab, and Gitea. Its
existing `refreshPresentEditionTrees()` then asks opencode, Kimi, Grok, Cursor, and ZCode generators
to refresh any already-present forge trees without creating absent trees. Those five generators
already consume the canonical command rows through the routing registry.

The obligated universe is therefore:

- 7 runtimes: Claude, Codex, opencode, Kimi, Grok, Cursor, ZCode;
- 3 forges: GitHub, GitLab, Gitea;
- 2 dispatch-capable topics: next and finalize;
- 42 extracted blocks total.

No runtime-specific variant of the normative block is permitted. Invocation syntax, model routing,
and genuine capabilities stay outside it in declared regions. If an additive renderer changes or
removes bytes inside the marked block, treat that as propagation failure; do not bless a paraphrase.

## Mutation-provable test design

Test only objective shipped properties. Do **not** grade real task prompts for quality or refuse a
spawn because a subjective field appears weak.

### Test artifact ownership

`tdd-guide` owns:

- `scripts/test-route-reachability.js`;
- `scripts/test-generate-routing-surfaces.js`;
- `templates/routing/required-blocks.js` as an explicit test-artifact exception: it is the
  required-block oracle consumed by `test-route-reachability.js`, not shipped runtime prose.

It records RED against baseline `89d171ef71c65b5d8841e98c9b48f7e52b10a41a` before production
source changes. The expected baseline failure is absence of `SLOTS['main-authored-handoff']` and of
the marked block on both topics.

### Required assertions

1. **Canonical source:** `SLOTS['main-authored-handoff']` exists as one plain string, contains one
   complete PIN block, and contains each exact field label once in the required order.
2. **Placement:** the next and finalize skeletons each contain exactly one slot reference, outside a
   conditional region. Init contains none because it dispatches no task role.
3. **Tracked render equality:** all 12 committed next/finalize command/SKILL surfaces byte-match the
   generator and each contains exactly one extracted block equal to the slot string.
4. **Derived-universe reach:** add `nx-main-authored-handoff` and `fn-main-authored-handoff` entries
   to `templates/routing/required-blocks.js`, tagged `both`/`both`, with the marker plus at least two
   distinctive non-marker tokens. The existing manifest derives all 21 runtime/forge trees for each
   topic and reads additive output from each generator's in-memory renderer.
5. **Cross-runtime byte equality:** extract the PIN block from all 42 final rendered surfaces and
   compare bytes to the canonical slot value, not merely token presence. Assert the universe is
   exactly 42 and non-empty.
6. **Reviewer continuity:** T20 retains its heavy-tier assertions but takes reviewer surface and
   acceptance from the new shared block. Assert the old reviewer-only sentence is absent so two
   wordings cannot coexist.
7. **Mission-list non-expansion:** keep the existing four-field grammar pins. A targeted negative
   assertion may verify the new handoff field labels did not enter the mission-list example; do not
   create a parser for this.

### Required mutation proofs

Run the same pure extractor/checker over in-memory copies and plant each defect separately:

- **missing:** delete the whole marked block from one obligated surface; the check must red and name
  that surface;
- **hollow:** retain the PIN marker but delete an interior distinctive sentence; the required-block
  check must red;
- **reordered:** swap `Authority:` and `Scope and custody:` in one extracted block; exact/order check
  must red and name that surface;
- **drifted:** change one normative word or field label on one additive runtime/forge render; byte
  equality must red and name that surface;
- **source-placement:** delete the slot reference from either skeleton; the placement assertion must
  red before committed-surface byte comparison can hide the omission;
- **new-runtime coverage:** retain the existing independent generator-roster floor so a shipped
  `sync-*-edition.js` missing from the manifest universe reds.

An N-surface promise needs an N-site proof: loop the missing/reordered/drift mutation over each of the
42 obligated surfaces, one at a time, and require the failure to name that target. A single mutant
proves only one path.

## Ordered TDD implementation plan

### Task 1 — Author the oracle and prove RED

Owner: `tdd-guide`.

Files:

- modify `scripts/test-route-reachability.js`;
- modify `scripts/test-generate-routing-surfaces.js`;
- modify `templates/routing/required-blocks.js` under the explicit test-artifact exception.

Work:

- encode the exact canonical block, field order, two topic placements, 42-surface extraction, old
  reviewer-sentence absence, and the mutation battery above;
- run both focused suites against the baseline before any production wording exists;
- record test name, failure signature, and exact baseline SHA in
  `kaola-workflow/issue-1029/.cache/tdd-red.md`.

Tests: the two focused suites themselves. This task must complete before Task 2 because its artifact
is the oracle Task 2 consumes.

Failure routing: if an exact block cannot survive any current additive renderer, record the runtime,
forge, before/after bytes, and renderer function and stop. That would require a larger generator
contract decision; do not add a runtime exception.

### Task 2 — Add the single canonical block and place it on both topics

Owner: `implementer`; test files and `required-blocks.js` are read-only.

Files:

- modify `templates/routing/slots.js`;
- modify `templates/routing/next.skeleton.md`;
- modify `templates/routing/finalize.skeleton.md`.

Work:

- add the shared slot value and the two unconditional slot references;
- remove only the now-redundant reviewer scope/acceptance sentences;
- preserve all model/reasoning routing, heavy reviewer carve-out, role classifications, custody,
  and finalization authority;
- run the focused tests while iterating, without weakening the oracle.

Tests: `scripts/test-generate-routing-surfaces.js` and `scripts/test-route-reachability.js`.

Failure routing: a conflict between the common block and a role profile is a profile-contract
finding. Keep the profile authoritative and report it; do not paste a compensating role process into
the shared block.

### Task 3 — Regenerate tracked and present additive surfaces

Owner: main or the same implementer; this is mechanical output from Task 2 and is not independent.

Command: `node scripts/generate-routing-surfaces.js --write`.

Tracked files expected to change:

- `commands/workflow-next.md`;
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md`;
- `plugins/kaola-workflow-gitea/commands/workflow-next.md`;
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`;
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`;
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md`;
- `commands/kaola-workflow-finalize.md`;
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md`;
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md`;
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`;
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md`;
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md`.

Already-present `.opencode*`, `.kimi*`, `.grok*`, `.cursor*`, and `.zcode*` trees may refresh outside
the tracked diff; absent trees must not be created. Inspect `git diff --name-only` and the generator
output. Any tracked change outside this list or the source/test/docs lists in this blueprint is a
finding to investigate, not output to accept automatically.

Tests: generator `--check`, the two focused suites, and each additive edition suite.

### Task 4 — Dock the verified behavior

Owner: `doc-updater`; depends on Tasks 2–3 because docs must describe final bytes.

Files:

- modify `README.md` with the user-visible main-authored handoff behavior and the seven runtime reach;
- modify `docs/architecture.md` with the flow `main decision -> task packet -> role artifact/evidence -> main verdict` and the mission-list boundary;
- modify `docs/api.md` in the existing subagent-dispatch integration-contract section, clarifying that the common task packet is runtime-neutral while invocation/model syntax is runtime-specific;
- modify `docs/conventions.md` with the canonical slot, both skeleton placements, derived 42-surface guard, mutation proof, and prohibition on subjective prompt gating;
- modify `CHANGELOG.md` under `[Unreleased]`.

Do not copy the full normative block into documentation. Point to the canonical source and summarize
behavior so documentation cannot become another authoring surface. No new ADR is required: this
extends dispatch behavior without changing ADR 0017's mission-list decision.

Tests: rerun the focused routing/generation tests after docs; run documented commands or locators
needed to verify factual claims.

### Task 5 — Independent review

These review tasks are genuinely independent: they are read-only, consume the same final candidate,
and write distinct evidence files. They may run concurrently after Tasks 1–4.

- `code-reviewer`: exact candidate diff, issue acceptance, and this blueprint; output
  `.cache/code-review.md`.
- `security-reviewer`: exact candidate diff and prompt/trust boundary; output
  `.cache/security-review.md`. A clean result is expected if no security-sensitive exposure exists;
  do not invent a finding.
- `adversarial-verifier`: exactly one claim — “the marked normative block is byte-identical on all
  42 derived next/finalize runtime/forge surfaces and the guard reds on every single-surface
  missing/reorder/drift mutation”; output `.cache/adversarial-handoff-parity.md`.

Main admits consequences, routes repairs, and reruns affected review. Reviewers do not combine their
own verdicts or certify final done.

### Task 6 — Final validation and workflow handoff

Run from the issue worktree against the final candidate:

```bash
node scripts/test-generate-routing-surfaces.js
node scripts/test-route-reachability.js
node scripts/generate-routing-surfaces.js --check
npm run test:kaola-workflow:editions
node scripts/simulate-workflow-walkthrough.js
npm test
node scripts/kaola-workflow-run-chains.js --project issue-1029
```

The full walkthrough is explicit because the fast Claude chain samples it. `npm test` records all
four tracked chains for the edition-touching routing diff. The separate additive-edition command is
required because those editions deliberately sit outside `npm test`. The final run-chains command
must be last after code and test-consumed prose settles, so its receipt binds the actual candidate.

Then use the normal finalize skill; main retains the final verdict and sink resolution.

## Dependency and independence map

```text
Task 1 oracle/RED
        |
        v
Task 2 canonical source
        |
        v
Task 3 generated surfaces
        |
        v
Task 4 documentation
        |
        +-------------------+--------------------+
        v                   v                    v
code review          security review      adversarial parity
        \                   |                    /
         +------------------+-------------------+
                            v
                  Task 6 final validation
```

Only the three reviewers are genuinely independent in this sequence: their inputs are complete and
their output files do not overlap. Task 1 must precede production to preserve test custody and RED
evidence. Task 3 consumes Task 2. Task 4 must describe the final rendered behavior. Final validation
and receipt consume everything.

## Rollback and failure routing

- **Guard or wording defect before merge:** revert the slot, both slot placements, 12 generated
  tracked surfaces, docs, and the tests/manifest that exist only for this mechanism as one scoped
  change. Regenerate any present additive trees from the reverted canonical source. Tests are
  removed with the mechanism, never rewritten to bless absent behavior.
- **One additive runtime mutates the block:** capture exact input/output bytes and repair that
  renderer if the mutation is incidental. If the runtime genuinely cannot carry the shared
  semantics, stop and surface a named capability divergence to the user; do not design a silent
  paraphrase.
- **Role profile contradiction:** profiles remain authoritative. Report the exact profile clause and
  shared clause; do not expand the handoff block into a shadow profile.
- **User-owned decision discovered by a child:** main asks the user in conversation. No durable
  approval field or workflow stop-state is added.
- **Out-of-scope work:** return a finding with evidence and let main append or route a mission item;
  the child does not broaden its write set.
- **Validation failure:** route by custody (`tdd-guide` for oracle defects, `implementer` for product
  prose/generator behavior, `build-error-resolver` for tooling failures), then rerun the exact failed
  command and every downstream check whose input changed.

## Deliberate non-goals and watch list

Not built:

- a handoff schema, form, prompt linter, completeness score, pre-spawn refusal, or approval gate;
- a fifth mission-list field or a local database of task prompts;
- automatic extraction of main conversation into a child prompt;
- per-role prompt templates or role-profile prose duplicated in routing surfaces;
- a mandatory handoff artifact file;
- an implementation-method field;
- model-tier, role-classification, reviewer-admission, test-custody, or finalization changes;
- runtime telemetry asserting that main used the packet on every real spawn.

Watch, do not build: if future traces show recurring omission of one objective field despite the
shipped guidance, record the exact failed handoffs first. Only that observation could justify a
more specific mechanism, and it still would not justify a subjective prompt-quality gate.

## Acceptance trace

| Issue acceptance | Blueprint coverage |
|---|---|
| Smallest invariant from First Principles and ADR 0017 | Additive derivation; seven sparse labels; no new run state or gate. |
| Main retains/emits task-specific content | “What main retains and what it emits.” |
| Minimal role-family specialization | Five-family table; profile processes not duplicated. |
| Profiles authoritative; mission list compact | Explicit profile and four-field mission-list boundaries. |
| No prescribed method or subjective runtime gate | Acceptance wording says result/proof; tests only objective shipped bytes. |
| Canonical wording/source and cross-runtime strategy | One shared slot, two unconditional placements, existing generator path, 42-surface derived universe. |
| Mutation-provable tests | Missing, hollow, reorder, drift, source-placement, runtime-roster proofs over every obligated site. |
| Ordered file set and validation | Tasks 1–6, exact files, dependency map, commands. |
| Dogfood feedback | Next section. |

## Dogfood feedback on this dispatch packet

### Useful

- `Mission` made the architecture question singular rather than turning this into implementation.
- `Authority` was the most valuable field: it settled main ownership, final-verdict ownership,
  `fork_turns: "none"`, and cross-runtime equality while explicitly allowing a recommendation on
  field economy.
- `Scope and custody` prevented edits to tracked product files and avoided colliding with the
  concurrent surface mapper.
- `Acceptance` was concrete enough to drive the blueprint sections and mutation strategy.
- `Deliverable` made the result recoverable without relying on this return message.
- `Stop and report` correctly named the three cases that would have invalidated the architecture:
  a repository-rule conflict, an unresolved user value call, or a propagation limit.

The packet was sufficient with no inherited parent conversation. Repository evidence supplied the
remaining operational detail.

### Redundant or compressible

- Repository root, candidate worktree, and baseline are all `Context`; they need not also appear in
  Mission or Deliverable.
- “Architecture/design only” and “do not edit tracked files” are one custody statement, not two
  separate constraints.
- Acceptance item 8 and Deliverable partly overlap; acceptance can say the required blueprint
  content while Deliverable only names artifact form and locator.
- The generic capability-gap and user-owned-decision stops already exist in the code-architect
  profile. They were still useful here because the task added two specific stop conditions, but a
  routine handoff should add only task-specific stop conditions rather than repeat profile text.

Do not combine the field labels merely because some values can be one line. The duplication was in
the values, not in the responsibility each label carries.

### Missing context or evidence

- The issue lists plausible failure modes but no trace of an actual bad child handoff. That absence
  is why this design stops at guidance plus objective propagation tests and records any enforcement
  mechanism on the watch list.
- The dispatch did not state whether canonical shared wording should live in a new fragment, a
  duplicated skeleton block, or an existing slot. Repository inspection answered this: the current
  plain-string `SLOT` mechanism is sufficient and avoids a new include abstraction.
- The dispatch did not enumerate the generated runtime/forge universe or additive generator tests.
  The derived manifest and `package.json` supplied the current answer; the blueprint deliberately
  derives the guard universe rather than freezing those paths in production.
- The output path is in the main-root active folder while source inspection happens in the linked
  worktree. Calling that authority/run-state split out explicitly would save one premise check in a
  future prompt.

Overall: keep the seven headings, keep values terse and task-specific, and remove repeated profile
rules. This dogfood prompt was rigorous without needing a prompt gate; its main cost came from
duplicated values and repository facts that could have been grouped under `Context`.
