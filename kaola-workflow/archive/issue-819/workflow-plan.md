# Workflow Plan — issue #819 (capability_gap recovery is unreachable)

<!-- plan_hash: ef3c23fdae2135702f2fe272edb08865e8d70bfa1be8fb7a97c496574ea51915 -->
<!-- ledger_chain_head: 3150e7b7d2cc4b1b0e6b63f9f1493653c2cec9acd4c3d65fb0bb45b20ae64ed6 -->

## Meta

project: issue-819
labels: area:scripts, bug, workflow:in-progress
speculative_open_policy: auto
plan_schema_version: 2
contract_version: 2
plan_form: spine
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 90
validation_env_allowlist:
code_certifier: n8-code-certify
security_certifier: none
inherited_frontier_digest: none
inherited_frontier_classes: none
selection_bundle: 819
selection_priority_basis: frontier = #819 — it is the ONLY open issue in the backlog (`gh issue list --state open` returns exactly one row) and the only row in `kaola-workflow/ROADMAP.md`'s Active Work table, whose `Next Step` column reads `adaptive`. `kaola-workflow/.roadmap/` holds only `issue-819.md` and there is no `### Project rules` block, so there is no drive-order guardrail to honor or violate. The pick IS the frontier: no issue was skipped, nothing outranks it, and no lower-priority substitution occurred. It is a correctness `bug` in the workflow's own recovery contract (First Principle 1) and its acceptance is verifiable inside this repository.
selection_rejected: none — the survey found no other open issue. `gh issue list --state open --limit 100` returned a single row (#819); every other candidate is already closed. `node scripts/kaola-workflow-claim.js status --json` returned `{"active":[],"drift":[],"count":0}`, so no lane was excluded as `live`, `stale`, or `ambiguous`, and no candidate was excluded for a red write-set overlap or an unresolved external dependency.
selection_disjointness: Single-issue selection, so no cross-issue disjointness was required. Within #819 the work partitions into three write lanes that share no file: the four `adaptive-node` script editions (the behavior), `scripts/test-adaptive-node.js` (the judgment of that behavior, held in separate custody), and the plan-run routing prose layer (the skeleton, the routing-contract token table, and the six rendered surfaces). The documentation surfaces are held out of all three and written once downstream, because a document describing a refusal code that has not landed yet is a guess rather than a record.

## Design

### What this run delivers

Issue #819 reports that the workflow's mechanical, no-consent escape hatch — `substitute-role` — cannot
actually complete. Two independent seams block it, and with both live every `capability_gap` degrades to
a consent halt no matter how good an in-kind substitute was available. The defect was observed end to end
on a real Codex run that stopped with zero work done. The trigger that produced that particular gap is
already fixed separately; this run repairs the **recovery path**, which stays broken for any legitimate
gap on any runtime.

Both seams were located during planning and are handed to the run rather than rediscovered:

- **Seam 1 — the P5 guard.** `runSubstituteRole` in `scripts/kaola-workflow-adaptive-node.js` refuses
  `substitute_node_closed` whenever `hasEvidenceBodyBelowHeader()` reports any non-empty value below the
  `evidence-binding:` header. Every role profile mandates self-persisting its deliverable to the seeded
  `dispatch.evidence_file`, so a gapping role writes its gap text there before returning, and the guard
  fires on exactly the case substitution exists to serve. P5's intent is right — swapping a card after real
  work would relabel completed work — but a gap body is contractually not that work.
- **Seam 2 — the frozen task identity.** `codexTaskNameForNode()` derives the Codex `task_name` from
  `id + '__' + role`, reading the **frozen** role, while `buildDispatch()` redirects only `agent_type`. A
  substituted node therefore re-presents an identity Codex has already seen and the spawn is rejected
  outright, so a recorded substitution is structurally undispatchable.

The named units of work, and what each delivers:

1. **`n1-surface` — the propagation and pin inventory.** Not a rediscovery of the seams (those are given
   above) but the exhaustive answer to *what must move*, which is the failure mode this repository fails on
   most often. It enumerates every file the change reaches across the four script editions, the six routing
   surfaces and their generation layer, and the test and documentation surfaces; it records which machine
   assertion stands on each; and it **reproduces both failures** so the run is built on measurement rather
   than on the issue's narrative. It delivers facts, not a diff.

2. **`n2-mechanism` — the design decision.** The issue's own acceptance criteria fence the solution space
   to two admissible mechanisms for seam 1 ("a typed marker or a binding-only reset", never a prose string
   match) and require that any legitimate reset be **owned atomically by a subcommand**. Which of the two,
   how the reset composes with the nonce binding, how the task identity is re-derived so a substituted node
   becomes dispatchable *without* disturbing the unsubstituted card, and what the new self-substitution
   refusal is called — those are one coherent architecture decision, and splitting them across writers
   would produce four locally-reasonable but mutually inconsistent answers. It delivers a binding spec.

3. **`n3-tests` — the RED regression, in separate custody.** Acceptance item A5 asks for coverage that is
   *mutation-proven, not merely green*, and the whole issue exists because a guard did the wrong thing
   while every chain stayed green. The tests are therefore authored by a role that writes no production
   code, before the production code exists, so they cannot be shaped to fit an implementation.

4. **`n4-scripts` — the behavior, across the four editions.** `kaola-workflow-adaptive-node.js` is both a
   `COMMON_SCRIPTS` member (byte-copied to the codex tree) and a `GENERATED_AGGREGATORS` member (rendered
   into the two forge trees), so the canonical file and its three ports are one indivisible write set that
   must move together.

5. **`n5-prose` — the routing contract.** The prose that *routes* an orchestrator into the recovery path is
   part of the repair, not commentary on it: the current text names a refusal set that is about to change,
   states a task-identity rule that is about to change, and tells the orchestrator to halt on precisely the
   refusal this run makes reachable. These six surfaces are **generated** from
   `templates/routing/plan-run.skeleton.md`; a hand-edit to a rendered output is silently wiped by the next
   `--write` and turns all four chains red, so the skeleton, the routing-contract token table, and the six
   outputs are one indivisible write set.

6. **`n6-docs`** records the new refusal code, the reset surface, and the decision. **`n7-falsify`** is the
   adversarial change gate over the whole candidate. **`n8-code-certify`** is the single common code
   certifier wall. **`n9-finalize`** is the sink.

### One scope boundary drawn here, not deferred

**Role-profile prose is out of scope, and that is a bounded claim rather than a convenience.** The obvious
worry is that seam 1 needs the ~56 agent-profile surfaces (`agents/*.md` plus three hand-maintained
`.toml` editions each, policed by `test-agent-profile-parity.js`) to be taught a new marker. It does not:
every profile **already** mandates the exact token form `capability_gap: <missing capability> — <required
action>`, so a structural check keyed on that column-0 key reads a contract that is already shipped and
stable across all four editions, and the alternative mechanism — a subcommand that owns the reset — needs
no marker at all. Both admissible mechanisms therefore land inside the write sets declared below, which is
what makes this an all-concrete spine rather than one carrying an expansion point.

`n2` must re-verify this boundary against the code. If it concludes the existing token form is genuinely
insufficient and profile prose must change, that is a **scope expansion, not a repair**: say so explicitly
and stop, rather than quietly widening a lane into a fifty-file migration.

### Why the shape is what it is — every `sequence` edge named

- **`n1` ∥ `n2` co-open — the read antichain at the head.** Neither depends on the other and neither
  declares a write set. `n2` decides *what the change is* from the two seam anchors already stated above;
  `n1` establishes *what the change reaches*. `n2` does not need the pin inventory to choose a mechanism,
  and `n1` does not need the mechanism to enumerate surfaces. Serializing them would be a guess dressed as
  caution, and uncertainty is not a serializer.

- **{`n1`, `n2`} → {`n3`, `n5`} (S1, data dependency).** Both writers consume two concrete artifacts:
  `kaola-workflow/issue-819/.cache/n1-surface.md` (the file-by-file surface set and the assertion standing
  on each) and `kaola-workflow/issue-819/.cache/n2-mechanism.md` (the binding interface — the exact
  refusal-code names, the reset surface and its flags, and the task-identity derivation). Without the
  second, `n3` would assert one interface and `n5` would document another.

- **`n3` ∥ `n5` co-open — the disjoint-write antichain.** They share **no file**. `n3` owns
  `scripts/test-adaptive-node.js` and nothing else; `n5` owns `templates/routing/plan-run.skeleton.md`,
  `templates/routing/required-blocks.js`, the six rendered `kaola-workflow-plan-run` surfaces, and
  `scripts/test-route-reachability.js`. Disjointness is established by exact declared paths, not inferred.
  `n5` is additionally independent of `n4`: its content is fixed by the `n2` spec, so it sits off the
  critical path entirely and runs concurrent with the test-then-implement chain.

- **`n3` → `n4` (S1, data dependency).** `n4` consumes `scripts/test-adaptive-node.js` — the RED
  assertions `n3` authors — as its oracle. That named artifact is the serializer, and it is also what keeps
  test custody separate: `n3` writes no production file and `n4` writes no test file.

- **{`n4`, `n5`} → `n6` (S1, data dependency).** `n6` records a refusal-code name, a subcommand surface,
  and a task-identity rule **as landed**, reading the accumulated diff. Documenting them from the spec
  instead would ship a plausible description of something slightly different — the exact failure mode the
  `docs/api.md` reason-code catalog exists to prevent.

- **`n6` → `n7` → `n8` → `n9` (gate serialization).** Each observes the whole accumulated candidate. The
  CHANGELOG and decision record land **before** the certifier runs the recorded validation command,
  because writing a chain-asserted document after the receipt run makes the receipt stale.

There are no loops, selectors, or fan-out groups, and no co-opened write legs beyond `n3` ∥ `n5`. This is
an **all-concrete spine**: the whole shape is provable at freeze, so it carries zero `expansion-point`
nodes.

### One wait budget extended, with its evidence

`n8-code-certify` carries `wait_budget_minutes: 120` as a `planner_override`. The evidence is concrete and
recorded, not a difficulty estimate: `CLAUDE.md` documents the claude fast gate at approximately 6.5
minutes, this diff touches the edition trees so all four chains are obligated and must be run
**sequentially**, and the certifier must additionally run `scripts/test-adaptive-node.js` unsharded. The
reasoning-tier default of 40 minutes is below the floor of that measured work. The extension only extends.

### Why no security gate and no main-session gate

`security_certifier: none`. The labels (`bug`, `area:scripts`) are not in the sensitive set, and no declared
path touches an auth surface, credential handling, untrusted-input execution, or path resolution. The change
does relax a guard, which deserves saying out loud — but P5 protects an **integrity** property (never
relabel completed work as pending), not a security boundary, and that property is the explicit subject of
`n7`'s refutation claim and `n8`'s certification claim rather than a third reviewer's.

No `main-session-gate`. Every acceptance item is delegable and machine- or reviewer-checkable. Item A3 is
the one that invites a human check, and the residual is stated rather than hidden: this run executes on the
Claude runtime, so it proves **our** side of the task-identity contract — that a substituted node yields an
identity distinct from the pre-substitution one, stable across an idempotent replay, while an unsubstituted
card stays byte-identical — and it does not perform a live Codex re-dispatch. The external fact that Codex
rejects a duplicate task name is already established by the recorded `already exists` failure in the issue.
Standing that residual up as a device gate would demand a second runtime and a deliberately wedged run for
a property our own code fully determines.

### What "done" means beyond `validation_command`

The four chains green is necessary and **not** sufficient, and here that is more than a formality: the fast
gate runs `scripts/test-adaptive-node.js --shard auto/12`, a rotating one-twelfth slice, so a newly added
assertion may simply not execute on a given rotation. Done additionally means:

- The new coverage was executed by running `node scripts/test-adaptive-node.js` **unsharded**, with a real
  exit code captured — never a piped `| tail`, and never inferred from a green fast gate.
- Each new assertion was **mutation-proven**: reverting its seam turns it red. A pin that passes against
  both the old and the new code guards nothing, and this issue exists because green did not mean guarded.
- The full recovery path runs end to end — gap, substitute, re-dispatch, close — with **no hand patch of a
  nonce-bound artifact** anywhere in it. If a reset is legitimate, a subcommand performed it atomically.
- A self-substitution is refused rather than recorded, so the substitution log can no longer contain a row
  that means nothing.
- The change is present in all four script editions and all six routing surfaces. An edition-partial change
  is not a partial fix here; it is a fix that silently does not exist on the runtime where the defect was
  observed.

## Acceptance

A1: A `capability_gap` body in `.cache/{node-id}.md` does not block `substitute-role`; P5 still refuses on a genuine deliverable. Distinguish structurally (typed marker or binding-only reset), never by string-matching prose.
A2: No hand-patching of a nonce-bound evidence file is required anywhere in the recovery path; if a reset is legitimate, a subcommand owns it atomically.
A3: After a recorded substitution, the new `agent_type` is actually dispatchable on Codex — the task-identity rule accommodates a re-dispatch under a different role.
A4: `substitute-role` rejects a no-op self-substitution (`from_role === to_role`) rather than recording it.
A5: Regression coverage proves the full path: gap -> substitute -> re-dispatch -> close, with the guard still refusing a real-deliverable swap (mutation-proven, not merely green).
A6: The change is present in all four `adaptive-node` script editions and all six `kaola-workflow-plan-run` routing surfaces, and the recorded validation command is green across all four chains run sequentially. (The issue is silent on this; it is added because this repository's cross-edition contract makes an edition-partial change incomplete, and because the defect was observed on the runtime served by the ported editions — see `## Design`.)

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-surface | investigator | — | — | 1 | sequence | — | reasoning | — | — | — | — | — | — |
| n2-mechanism | code-architect | — | — | 1 | sequence | — | reasoning | — | — | — | — | — | — |
| n3-tests | tdd-guide | n1-surface, n2-mechanism | scripts/test-adaptive-node.js | 1 | sequence | — | reasoning | — | — | — | — | — | — |
| n4-scripts | implementer | n3-tests | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js | 1 | sequence | — | reasoning | — | — | — | — | — | — |
| n5-prose | implementer | n1-surface, n2-mechanism | templates/routing/plan-run.skeleton.md, templates/routing/required-blocks.js, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, scripts/test-route-reachability.js | 1 | sequence | — | standard | — | — | — | — | — | — |
| n6-docs | doc-updater | n4-scripts, n5-prose | docs/api.md, CHANGELOG.md, docs/decisions/D-819-01.md | 1 | sequence | — | standard | — | — | — | — | — | — |
| n7-falsify | adversarial-verifier | n6-docs | — | 1 | sequence | — | reasoning | — | — | the candidate makes capability_gap recovery genuinely reachable without opening a relabeling hole: substitute-role invoked on a node whose evidence carries only a capability gap succeeds and leaves that evidence file atomically re-seeded and correctly nonce-bound with no hand patch anywhere in the path, the same guard still refuses a swap on a node carrying a genuine deliverable, a recorded substitution yields a dispatch identity that differs from the pre-substitution identity and is stable across an idempotent replay while an unsubstituted node's dispatch card stays byte-identical to before, a self-substitution is refused rather than recorded, every new regression assertion actually fails when its seam is reverted rather than merely passing after the fix, and all four adaptive-node editions plus all six plan-run routing surfaces carry the change | the entire accumulated diff for issue 819 against the run base — the four adaptive-node editions, scripts/test-adaptive-node.js, the plan-run routing skeleton and required-blocks table with the six rendered surfaces, scripts/test-route-reachability.js, and the docs and decision record — read together with the n1 surface inventory and the n2 mechanism spec, and re-verified by running node scripts/test-adaptive-node.js unsharded, node scripts/generate-routing-surfaces.js --check, node scripts/test-route-reachability.js, and node scripts/validate-script-sync.js, plus a mutation probe that reverts each seam in turn and confirms the matching assertion turns red | sequence | n3-tests, n4-scripts, n5-prose, n6-docs |
| n8-code-certify | code-reviewer | n7-falsify | — | 1 | sequence | — | reasoning | 120 | — | the complete issue 819 candidate satisfies every acceptance item and introduces no regression: capability_gap recovery is reachable end to end with no hand patch of a nonce-bound artifact, the P5 guard still refuses a genuine-deliverable swap, the gap-versus-deliverable distinction is structural rather than a prose string match, a substituted node is dispatchable under a fresh and replay-stable identity while the unsubstituted dispatch card is byte-unchanged, a self-substitution is refused, the regression coverage is mutation-proven rather than merely green, plugin prose touched under plugins remains forge-neutral, and the recorded validation command is green across all four chains run sequentially | the entire accumulated diff for issue 819 against the run base across all four editions, validated by running the recorded validation_command end to end as four explicit sequential chain runs, by running node scripts/test-adaptive-node.js unsharded so the new coverage is actually executed rather than left to the fast gate's rotating one-twelfth slice, and by the forbidden-token check on every touched file under plugins | sequence | — |
| n9-finalize | finalize | n8-code-certify | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Node Briefs

### n1-surface

**Intent.** Establish, by measurement, exactly what this change reaches and what machine assertion stands
on each surface. The two seams are already located (see `## Design`) — do not spend your budget
rediscovering them. Your deliverable is the propagation inventory plus a reproduction of both failures.

**Read first.** Issue #819 in full (`gh issue view 819 --json body`). Then, in
`scripts/kaola-workflow-adaptive-node.js`: `runSubstituteRole` and its five guards P1–P5,
`hasEvidenceBodyBelowHeader`, `activeRoleSubstitution`, `resolveRoleSubstitution`, `buildDispatch`,
`codexTaskNameForNode` / `sanitizeCodexTaskName`, the seeding path that writes the
`evidence-binding:` header and the token scaffold, and the subcommand-registration and guard-prologue
lists near the top of the file.

**Approach.**

1. **Reproduce both failures.** Build a throwaway fixture (the existing `substitute-role` scenario in
   `scripts/test-adaptive-node.js` is a working model) and demonstrate, with captured output: (a) that a
   `capability_gap:` body in `.cache/<node-id>.md` produces `substitute_node_closed`; and (b) that
   `codexTaskNameForNode` returns the same value before and after a recorded substitution while
   `buildDispatch` redirects only `agent_type`. Record the actual values, not a description of them.
2. **Inventory the script lane.** Confirm how `kaola-workflow-adaptive-node.js` reaches its three ports —
   `COMMON_SCRIPTS` byte-copy to the codex tree and `GENERATED_AGGREGATORS` rendering to the two forge
   trees, both driven by `scripts/edition-sync.js` — and record the exact command that regenerates them
   and the exact command that verifies no drift.
3. **Inventory the registration surface inside the file.** If the mechanism adds a subcommand, enumerate
   every in-file list it must join: the subcommand dispatch switch, the mutating-subcommand set, the
   split-guard / scheduler-lock set, the usage block, and `OPERATOR_HINT_REGISTRY`. Missing one of these
   is how a new subcommand ships unguarded.
4. **Inventory the routing lane.** Confirm the six `kaola-workflow-plan-run` surfaces are generated from
   `templates/routing/plan-run.skeleton.md`, and record which passages the change must touch — at minimum
   the `role-capability-coverage` PIN region (the typed-refusal list and the "`capability_gap` is **NOT
   evidence**" contract) and the task-identity / `codex_task_name` dispatch rule. Record the
   `pr-role-capability-coverage` entry in `templates/routing/required-blocks.js` and every
   `content_tokens` string it pins, and how `scripts/test-route-reachability.js` consumes that table.
5. **Inventory the pins.** For every surface above, list each machine assertion standing on it across the
   contract validators, the routing-reachability test, `scripts/test-adaptive-node.js`, and the four
   walkthroughs. Mark each preserved-by-construction or needing an update, and name the node that owns any
   update. Planning found no substitute-role assertion in the contract validators or the walkthrough —
   confirm or refute that, because a writer trusting it wrongly would go red.
6. **Record the baseline.** Run `node scripts/test-adaptive-node.js` **unsharded** and capture its real
   exit code, so the run knows whether it started green. Note explicitly that the claude fast gate runs
   this file with `--shard auto/12`, so a new assertion may not execute there.

**Constraints.**

- Read-only. Declare no write set; your durable output is your `.cache` evidence file. A throwaway fixture
  under a temp directory is not a repository write, but never edit a tracked file.
- Capture REAL exit codes with `$?`. Never judge a command through a piped `| tail`.
- State facts and separate them from inference. If a claim in `## Design` (including the scope boundary on
  role-profile prose) is contradicted by the code, say so plainly — that is the most valuable thing you can
  return.
- Do not choose the mechanism. That is `n2`'s decision and it is running concurrently with you.

### n2-mechanism

**Intent.** Settle, once, the design that makes `capability_gap` recovery reachable — precisely enough that
a test author and two writers working from your spec produce mutually consistent work without re-deciding
anything. You deliver a decision, not a diff.

**Read first.** Issue #819 in full, paying close attention to the wording of its acceptance criteria: they
fence the solution space. Then, in `scripts/kaola-workflow-adaptive-node.js`, the same functions named in
`n1`'s brief — `runSubstituteRole` (guards P1–P5), `hasEvidenceBodyBelowHeader`, the evidence-seeding path
(`evidence-binding:` header, token scaffold, `writeFileAtomicReplace`, the nonce-rotation branch),
`buildDispatch`, and `codexTaskNameForNode`. `n1-surface` is running concurrently with you; you do not
depend on its inventory and must not wait for it.

**Approach.**

1. **Decide the gap-versus-deliverable distinction (A1).** The criterion admits exactly two shapes — a
   typed marker or a binding-only reset — and forbids string-matching prose. Note that every role profile
   already mandates the return form `capability_gap: <missing capability> — <required action>`, so a
   column-0 `capability_gap:` key is an existing, shipped, cross-edition token rather than a new one; a
   check keyed on that key is structural in the same sense `evidence-binding:` is. Weigh that against a
   reset-owned-by-a-subcommand shape. State the choice, the rejected alternative, and why. Specify exactly
   how P5 continues to refuse a genuine deliverable — that half of the guard must not weaken.
2. **Decide who owns the reset, and prove it is atomic (A2).** The observed run only proceeded because a
   human hand-patched a nonce-bound evidence file. Whatever you choose, no step in the recovery path may
   require that. Specify the exact surface (a flag on `substitute-role`, or a separate subcommand — name
   it), the crash-atomicity mechanism, what happens to the prior body, and what the nonce binding is after
   the reset. Say plainly whether the reset re-seeds with the current binding or rotates it.
3. **Decide the task-identity derivation (A3).** Two properties must hold at once: a substituted node must
   present an identity distinct from the one already consumed, and an idempotent replay of the same
   substitution must present the *same* identity or crash-resume breaks. Note the strong constraint that a
   node with **no** substitution on record must produce a byte-identical dispatch card to today's — the
   `resolveRoleSubstitution` / conditional-attach discipline in `buildDispatch` exists exactly to protect
   that. State the derivation as a rule, with worked examples for: no substitution, one substitution, a
   replay of that substitution, and a second substitution.
4. **Decide the self-substitution refusal (A4).** Note that the idempotent-replay branch currently returns
   `ok` on a repeat, so ordering matters: specify where the new check sits relative to P1–P5 and relative
   to that replay branch, name the refusal code, and state what a caller sees.
5. **Specify the test obligations (A5).** For each seam, state the assertion and the **mutation** that must
   turn it red. `n3` authors the tests; you tell it what must be provable.
6. **Specify the prose delta.** For the `role-capability-coverage` PIN region and the task-identity rule in
   `templates/routing/plan-run.skeleton.md`, give the current text and its replacement, including the
   updated typed-refusal list and any change to the "substitute and re-dispatch, or halt" instruction. Name
   any `content_tokens` entry in `templates/routing/required-blocks.js` that must be added, changed, or
   preserved. `n5` transcribes this; do not leave it to invent contract wording.

**Constraints.**

- Read-only. Declare no write set; your durable output is your `.cache` evidence file.
- Re-verify the `## Design` scope boundary that role-profile prose stays out of scope. If you conclude the
  existing `capability_gap:` token form is genuinely insufficient and the ~56 profile surfaces must change,
  **stop and say so explicitly** — that is a scope expansion, and scope expansion is not a repair.
- Relaxing a guard is the heart of this change: state, in one paragraph, what P5 still guarantees after
  your change and what it no longer guarantees. If those cannot both be stated crisply, the mechanism is
  wrong.
- Any prose destined for a file under `plugins/` must be forge-neutral — no forge CLI binary, brand, or
  request noun; write "the forge CLI" / "the forge".
- Keep provenance out of agent-facing replacement prose: the rule, never issue refs, decision IDs, or ADR
  citations.
- Do not edit any file. If a call is a values judgment rather than a fact, name it and stop.

### n3-tests

**Intent.** Author the RED regression that proves the full recovery path and pins the guard that must
survive. You own the test file and nothing else — the production fix is `n4`'s, and it will consume your
assertions as its oracle.

**Read first.** `kaola-workflow/issue-819/.cache/n2-mechanism.md` — the binding interface; do not re-decide
any of it. Then `kaola-workflow/issue-819/.cache/n1-surface.md` for the reproduction and the baseline. Then
the existing `substitute-role` scenario in `scripts/test-adaptive-node.js` (search for
`substitute_node_closed`) — extend that established fixture style rather than inventing a new harness.

**Approach.** Add coverage for the full path — gap, substitute, re-dispatch identity, close — and for the
guard that must not weaken. At minimum:

1. A node whose evidence carries only a capability-gap body substitutes successfully, and the evidence file
   afterwards is correctly bound with no hand intervention.
2. A node whose evidence carries a genuine deliverable still refuses `substitute_node_closed`. This is the
   control; without it the change is indistinguishable from deleting P5.
3. A seed-only evidence file remains substitutable (the existing case — keep it green).
4. A substituted node's dispatch identity differs from the pre-substitution identity, and is unchanged
   across an idempotent replay of the same substitution.
5. A node with no substitution on record produces a dispatch card byte-identical to today's.
6. A self-substitution is refused with the code `n2` named, and writes **no** record.
7. The atomic reset surface behaves as specified, including on a re-invocation.

**Constraints.**

- **You author tests only.** `scripts/test-adaptive-node.js` is your entire write set. Do not edit any
  production script; if a test cannot be written without a production change, that is the finding — record
  it and stop.
- These tests are expected to be **RED** when you close, because the fix does not exist yet. Record which
  assertions fail and with what output; that failure text is `n4`'s target.
- For each assertion, state in your evidence the **mutation** that must turn it red. A pin that passes
  against both the old and the new behavior guards nothing, and `n7` will verify this claim rather than
  accept it.
- Run `node scripts/test-adaptive-node.js` **unsharded** and capture the real exit code. The fast gate runs
  this file at `--shard auto/12`, so never rely on a chain to tell you your tests ran.
- Follow the file's existing conventions: hand-rolled `assert`, `scenario(...)`, temp-dir fixtures cleaned
  up in a `finally`. No test framework.

### n4-scripts

**Intent.** Make `n3`'s RED assertions green by implementing the `n2` mechanism across all four
`adaptive-node` editions.

**Read first.** `kaola-workflow/issue-819/.cache/n2-mechanism.md` (binding — implement this, do not
redesign it), then `kaola-workflow/issue-819/.cache/n3-tests.md` and the assertions themselves in
`scripts/test-adaptive-node.js` — those are your oracle. Then
`kaola-workflow/issue-819/.cache/n1-surface.md` for the in-file registration surface and the regeneration
commands.

**Approach.** Edit the canonical `scripts/kaola-workflow-adaptive-node.js`: the P5 distinction, the atomic
reset surface, the self-substitution refusal, and the task-identity derivation. If the mechanism adds a
subcommand, join **every** in-file list `n1` enumerated — the dispatch switch, the mutating set, the
split-guard / scheduler-lock set, the usage block, and `OPERATOR_HINT_REGISTRY`. Then propagate to the
three ports with `npm run sync:editions` and verify with `node scripts/edition-sync.js --check` and
`node scripts/validate-script-sync.js`.

**Constraints.**

- **Never hand-edit a port.** The codex twin is a byte copy and the two forge ports are rendered; a
  hand-edit is overwritten by the next sync and turns the chains red. Edit canonical, regenerate. The three
  ports are in your write set solely so the regeneration can be committed.
- **Do not touch `scripts/test-adaptive-node.js`.** It is not in your write set, and editing the oracle to
  fit the implementation is the failure this custody split exists to prevent. If an assertion looks wrong,
  report it — do not weaken it.
- The unsubstituted dispatch card must stay **byte-identical** to before. Prove it, do not assume it.
- Preserve what P5 still guarantees. A change that makes every substitution succeed has removed the guard
  rather than fixed it.
- Any reset must be crash-atomic (temp + rename, matching the existing `writeFileAtomicReplace`
  discipline). A torn evidence rewrite leaves a node unclosable.
- Before closing, run and capture real exit codes for `node scripts/test-adaptive-node.js` (unsharded),
  `node scripts/edition-sync.js --check`, and `node scripts/validate-script-sync.js`. Never a piped
  `| tail`.
- Forge-neutral prose in every string that ships under `plugins/`, including operator hints; verify with
  `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only <file>`
  and the gitea equivalent.
- If a change requires editing a file outside your declared write set, stop and report it rather than
  writing outside the set.

### n5-prose

**Intent.** Update the routing contract that tells an orchestrator how to recover from a
`capability_gap`, so the prose describes the path that now actually works. The current text names a refusal
set that is changing, states a task-identity rule that is changing, and directs a halt on the very refusal
this run makes reachable.

**Read first.** `kaola-workflow/issue-819/.cache/n2-mechanism.md` — it carries the exact replacement prose;
transcribe it, do not compose contract wording yourself. Then
`kaola-workflow/issue-819/.cache/n1-surface.md` for the passage and pin inventory. Then the header comment
of `scripts/generate-routing-surfaces.js`.

**Approach.** Edit `templates/routing/plan-run.skeleton.md` — the `role-capability-coverage` PIN region and
the task-identity / `codex_task_name` dispatch rule. The skeleton carries command and skill variants as
parallel regions, so locate and apply **both** copies of every passage. Update the
`pr-role-capability-coverage` `content_tokens` in `templates/routing/required-blocks.js` only where the
`n2` spec says a pinned token changes. Then regenerate with
`node scripts/generate-routing-surfaces.js --write` and confirm with `--check`.

**Constraints.**

- **Never hand-edit a rendered surface.** The six `kaola-workflow-plan-run` outputs are generated; a
  hand-edit is wiped by the next `--write` and turns all four chains red. Every change goes into the
  skeleton (or the token table), then gets rendered. The six outputs are in your write set solely so the
  render can be committed.
- Preserve every existing needle in the `n1` inventory that the `n2` spec does not explicitly change — in
  particular `<!-- PIN: role-capability-coverage -->`, `cannot cover the node brief`, `capability_gap`,
  `substitute-role`, `BYTE-IDENTICAL`, `write-halt --reason consent`, and `is **NOT evidence**`. If the
  spec requires changing one of these, change it in `templates/routing/required-blocks.js` in the same
  node so prose and pin land together.
- Keep provenance out of these surfaces: the rule, never issue refs, decision IDs, or ADR citations.
- Forge-neutral prose in every file under `plugins/`; verify with the standalone `--forbidden-only` check
  on each touched file.
- Before closing, run and capture real exit codes for `node scripts/generate-routing-surfaces.js --check`,
  `node scripts/test-generate-routing-surfaces.js`, and `node scripts/test-route-reachability.js`.
- `non_tdd_reason`: agent-facing prose and generated-surface rendering, with no natural failing unit test;
  the machine pin for this text is the `required-blocks` token table you update in this same node.
- If a change requires editing a file outside your declared write set, stop and report it.

### n6-docs

**Intent.** Record the change as it actually landed, and record the decision behind it.

**Read first.** The accumulated diff for this run, plus `kaola-workflow/issue-819/.cache/n4-scripts.md` and
`kaola-workflow/issue-819/.cache/n5-prose.md`. Document the names that are **in the tree**, not the names
the spec proposed.

**Approach.**

1. `docs/api.md` — add the new refusal code to the `adaptive-node.js` reason-code material, and, if the
   mechanism added a subcommand, add it to the guard-prologue / mutating-subcommand and scheduler-lock
   catalogs so the documented sets match the shipped ones. Follow the existing entry style.
2. `CHANGELOG.md` — an entry under `[Unreleased]` describing the recovery-path repair across all four
   editions.
3. `docs/decisions/D-819-01.md` — the decision record: the gap-versus-deliverable mechanism chosen and the
   alternative rejected, who owns the atomic reset, the task-identity derivation and the byte-identity
   constraint it had to respect, and — stated explicitly — what P5 still guarantees after the change and
   what it no longer guarantees.

**Constraints.**

- Write these **before** the certifier runs the validation command. A chain-asserted document written after
  the receipt run makes the receipt stale.
- `D-819-01` is the next free decision-record id for this issue; confirm nothing under `docs/decisions/`
  already claims it.
- Do not invent an interface. Every code name, flag, and refusal string must be copied from the tree — if
  the diff and the spec disagree, the diff wins and the disagreement is a finding.
- Provenance belongs here: issue refs and decision IDs are correct in these files, unlike agent-facing
  surfaces.

### n7-falsify

**Intent.** Try to refute the claim that this candidate makes `capability_gap` recovery reachable without
opening a relabeling hole. Do not confirm it.

**Approach.** Read the whole accumulated diff against the run base together with the `n1` inventory and the
`n2` spec. Then attack, in rough order of expected yield:

1. **The mutation probe — the highest-value check.** Revert each seam in turn and confirm the matching
   assertion actually turns red. This issue exists because a guard misbehaved while every chain was green;
   a pin that passes against both old and new code guards nothing.
2. **The relabeling hole.** Construct the adversarial case: a node that has done real work but whose
   evidence could be made to look like a gap. Can the new path relabel completed work as pending? If the
   distinction can be forged by the returning role itself, say so.
3. **Byte-identity.** Confirm an unsubstituted node's dispatch card is unchanged, and that
   `--check` renders the six routing surfaces byte-identically from the skeleton.
4. **The replay property.** Confirm the substituted identity is stable across an idempotent replay — a
   derivation that changes per invocation breaks crash-resume, which would trade one wedge for another.
5. **Propagation.** Confirm all four script editions and all six routing surfaces carry the change, and
   that no port was hand-edited rather than regenerated.
6. **Coverage reality.** Confirm the new assertions were actually executed unsharded, not merely carried by
   a green fast gate running one twelfth of the file.

**Constraints.** Read-only; author nothing. Record the verdict with the adversarial vocabulary
(`refuted` / `not_refuted` / `indeterminate`) and write evidence to
`kaola-workflow/issue-819/.cache/n7-falsify.md`. Do **not** run the four-chain `validation_command` — form
your judgment on the diff and the targeted probes above, and invoke it only if your verdict would otherwise
be `not_refuted` and only a full-candidate run could change it; a blocking finding must short-circuit
before the expensive step.

### n8-code-certify

**Intent.** The single common code certifier wall (G1) over the complete candidate.

**Approach.** Review the entire accumulated diff across all four editions against every acceptance item,
then run the recorded `validation_command` — the four chains sequentially — and certify on the real result.

**Constraints.**

- Capture the real exit code and the success sentinel for **each** chain; never judge by a piped `| tail`.
  A green claude chain alone is insufficient evidence for a cross-edition diff: `npm test` short-circuits
  on `&&`, so a red codex, gitlab, or gitea chain behind a green claude one is never reached. This plan
  records the four chains as four explicit runs.
- Additionally run `node scripts/test-adaptive-node.js` **unsharded**. The claude fast gate runs that file
  at `--shard auto/12`, so a green chain does not prove this run's new coverage executed.
- Run the forge-neutrality `--forbidden-only` check over every touched file under `plugins/`.
- Judge whether P5 still refuses a genuine-deliverable swap. A candidate that makes every substitution
  succeed has deleted the guard, not repaired it, and that is a blocking finding regardless of chain color.
- Record the approval verdict with the approval vocabulary (`approved` / `changes_requested`).

### n9-finalize

**Intent.** Close the run. Docs and state writes only.

**Constraints.** Pass `--issue 819` on closure. Sweep run gaps: every run-discovered defect is filed or
justified as noise, or the `gaps_unswept` gate refuses. If `n2` reported that role-profile prose must
change, that is a run gap and must be filed rather than absorbed. No code writes in this node.

## Node Ledger

| id | status |
| --- | --- |
| n1-surface | complete |
| n2-mechanism | complete |
| n3-tests | complete |
| n4-scripts | complete |
| n5-prose | complete |
| n6-docs | complete |
| n7-falsify | complete |
| n8-code-certify | complete |
| n9-finalize | in_progress |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| investigator (n1-surface) | subagent-invoked | evidence-binding: n1-surface c88971e73a76 | |
| code-architect (n2-mechanism) | subagent-invoked | evidence-binding: n2-mechanism cb782b26822d | |
| tdd-guide (n3-tests) | subagent-invoked | evidence-binding: n3-tests bcb81dd402a2; barrier: group_passed | |
| implementer (n4-scripts) | subagent-invoked | evidence-binding: n4-scripts 62e0af8d9649 | |
| implementer (n5-prose) | subagent-invoked | evidence-binding: n5-prose 89e5dde2bea3; barrier: deferred_to_group | |
| doc-updater (n6-docs) | subagent-invoked | evidence-binding: n6-docs 78609a6c6101 | |
| adversarial-verifier (n7-falsify) | subagent-invoked | evidence-binding: n7-falsify bab5de04e791 | |
| code-reviewer (n8-code-certify) | subagent-invoked | evidence-binding: n8-code-certify e5d144bbf842 | |
| finalize (n9-finalize) | pending | | |
