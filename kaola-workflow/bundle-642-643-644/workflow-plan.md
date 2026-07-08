# Workflow Plan — bundle-642-643-644

<!-- plan_hash: e15aaa0445400a7907e86c555b5b419354d98313bf6b48c4d7b83c89c5296795 -->

## Meta
project: bundle-642-643-644
labels:
speculative_open_policy: auto
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

Same-scope bundle of three adaptive-machinery follow-ups, all diagnosed with exact line refs (build DAG, not
a shape-first investigation). #642 — durable node-to-node information channel (`## Node Briefs` grammar +
`goal_line`/`upstream_evidence` on the dispatch card + close-time consumed-proof + resume re-hydration +
×6 routing prose). #643 — complete the per-role evidence-recording contract (ROLE_TOKEN_REGISTRY rows +
agent-file evidence sections + role-kind enumerations + a future-agent wall). #644 — close the two fenced
residuals of the #641 read∥write co-open relaxation (A1 main-session-gate blindness at the G4 merge fence,
A2 `testConsumedExtra` thread-through). This run precedes a stable release cut with a zero-backlog goal, so
review is maximized: reasoning-tier design + machinery + gates, a dedicated adversarial-verifier that RUNS
the reproductions (the same lens that SURFACED #644 from #641). Cross-edition #307 throughout —
`kaola-workflow-plan-validator.js` and `kaola-workflow-adaptive-node.js` are GENERATED_AGGREGATORs (canonical
+ codex twin + gitlab/gitea forge ports move atomically), the six routing surfaces are GENERATED from
`templates/routing/`, and the plugin agent profiles are byte-identical ×3 + forge-neutral.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-architect | code-architect | — | — | 1 | sequence | reasoning | — |
| n2-validator | tdd-guide | n1-architect | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/test-adaptive-node.js, scripts/test-adaptive-handoff.js | 6 | sequence | reasoning | — |
| n3-adaptive | tdd-guide | n2-validator | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js, scripts/simulate-workflow-walkthrough.js | 6 | sequence | reasoning | — |
| n4-agents | implementer | n1-architect | agents/code-architect.md, agents/code-explorer.md, agents/knowledge-lookup.md, agents/planner.md, agents/issue-scout.md, agents/build-error-resolver.md, agents/doc-updater.md, agents/synthesizer.md, agents/workflow-planner.md, plugins/kaola-workflow/agents/code-architect.toml, plugins/kaola-workflow/agents/code-explorer.toml, plugins/kaola-workflow/agents/knowledge-lookup.toml, plugins/kaola-workflow/agents/planner.toml, plugins/kaola-workflow/agents/issue-scout.toml, plugins/kaola-workflow/agents/build-error-resolver.toml, plugins/kaola-workflow/agents/doc-updater.toml, plugins/kaola-workflow/agents/synthesizer.toml, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/code-architect.toml, plugins/kaola-workflow-gitlab/agents/code-explorer.toml, plugins/kaola-workflow-gitlab/agents/knowledge-lookup.toml, plugins/kaola-workflow-gitlab/agents/planner.toml, plugins/kaola-workflow-gitlab/agents/issue-scout.toml, plugins/kaola-workflow-gitlab/agents/build-error-resolver.toml, plugins/kaola-workflow-gitlab/agents/doc-updater.toml, plugins/kaola-workflow-gitlab/agents/synthesizer.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/code-architect.toml, plugins/kaola-workflow-gitea/agents/code-explorer.toml, plugins/kaola-workflow-gitea/agents/knowledge-lookup.toml, plugins/kaola-workflow-gitea/agents/planner.toml, plugins/kaola-workflow-gitea/agents/issue-scout.toml, plugins/kaola-workflow-gitea/agents/build-error-resolver.toml, plugins/kaola-workflow-gitea/agents/doc-updater.toml, plugins/kaola-workflow-gitea/agents/synthesizer.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml | 36 | sequence | standard | additive evidence-contract prose sections in existing agent profiles + planner compact-plan posture; no natural failing unit test — the future-agent wall (n6) is the machine enforcement, and cross-edition byte-mirror + forge-neutrality is mechanical rendering of the architect's canonical text |
| n5-prose | implementer | n1-architect | templates/routing/plan-run.skeleton.md, templates/routing/slots.js, templates/routing/required-blocks.js, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md | 9 | sequence | standard | routing-surface prose regenerated by generate-routing-surfaces.js from the skeleton/slots (the six surfaces are GENERATED, never hand-edited); the route-reachability + contract-validator pins (n6) are the machine enforcement |
| n6-enforcement | tdd-guide | n2-validator, n4-agents, n5-prose | scripts/validate-vendored-agents.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-route-reachability.js | 7 | sequence | reasoning | — |
| n7-cr-engine | code-reviewer | n3-adaptive | — | 1 | sequence | reasoning | — |
| n8-cr-surface | code-reviewer | n4-agents, n5-prose, n6-enforcement | — | 1 | sequence | reasoning | — |
| n9-adversary | adversarial-verifier | n7-cr-engine | — | 1 | sequence | reasoning | — |
| n10-docs | doc-updater | n8-cr-surface, n9-adversary | CHANGELOG.md, docs/api.md, docs/conventions.md, docs/plan-run-cards/resume.md, docs/decisions/D-642-01.md, docs/decisions/D-643-01.md, docs/decisions/D-644-01.md | 7 | sequence | standard | — |
| n11-finalize | finalize | n10-docs | — | 1 | sequence | — | — |

## Plan Notes

**Decomposition driver — the two GENERATED_AGGREGATORs force the node boundaries (not issue boundaries).**
All three issues collide on `scripts/kaola-workflow-adaptive-node.js` and/or
`scripts/kaola-workflow-plan-validator.js`. `generated_port_split` + the forge-port ordering rule forbid
splitting one aggregator's root+ports across serial nodes (a port-writing node cannot sit upstream of a later
root edit of the same file), so:
- **`plan-validator.js` work is ONE node (n2)** — #642 (`## Node Briefs` parse + `brief_unknown_node` freeze
  refusal + hash coverage) and #643 (ROLE_TOKEN_REGISTRY rows) both edit it; they cannot be two nodes.
- **`adaptive-node.js` work is ONE node (n3)** — #642 (channel: `goal_line`/`upstream_evidence`/seed/close
  consumed-proof/resume) and #644 (A1/A2 scheduler residuals) both edit it; they cannot be two nodes.
- n2 and n3 are SEPARATE (different aggregators, a clean `require()` seam — adaptive-node imports the
  validator's parsed-briefs/predicate exports), giving each tdd-guide a tighter RED-first scope; n3 depends on
  n2 because `goal_line` consumes the `## Node Briefs` the validator parses and the consumed-proof reads role
  sets exported by the validator (and both touch `scripts/test-adaptive-node.js`, serialized on that file).
- Each aggregator node edits CANONICAL, then regenerates the codex twin + 2 forge ports via
  `node scripts/edition-sync.js --write` (`sync:editions`); `edition-sync.js --check` (gitlab/gitea chains)
  proves byte/rename parity. The forge ports' canonical spec is the FULL accumulated root diff vs the run
  base (`git diff <base>..HEAD -- <root>`), mirror every hunk modulo forge nouns.

**Scheduler exposes a wide ready frontier (co-open default-on, exact-file-disjoint).** After n1 the frontier
is the antichain `{n2, n4, n5}` (validator-scripts ∥ agent-profiles ∥ routing-templates — pairwise
exact-file-disjoint → validator derives `parallel_safe`, scheduler co-opens isolated legs). The middle
frontier `{n3, n6}` is likewise exact-file-disjoint (adaptive-node+its tests ∥ contract-validators+route-
reachability). NEVER hand-add `parallel_safe`. Serial edges exist only for true deps/shared files: n2→n3
(shared `test-adaptive-node.js` + require seam), n6 waits on n2+n4+n5 (its walls assert THEIR content).

**n1-architect (code-architect, reasoning, read-only) — the single design producer, constrains every
implement node AND is the durable channel this run has (the `## Node Briefs` feature is not yet live).** It
RETURNS its full blueprint (orchestrator persists it verbatim to `.cache/n1-architect.md`); every downstream
node reads it. Deliverable, per issue:
- #642: exact `## Node Briefs` grammar + `brief_unknown_node` refusal + hash-coverage points in the validator;
  the `buildDispatch` `goal_line` population (the pre-built unwired `ctx.goal_line` socket at AN:1256-1263)
  and `upstream_evidence: [{node_id, role, path}]` derivation from `depends_on` (project-qualified paths, the
  #516 barrier-exempt band; conditional-attach like `leg_path` so the briefless/root envelope stays
  byte-identical); `seedEvidenceFile` upstream pointers; the close-time consumed-proof (`upstream_read:
  <node-id> <nonce>` echo recomputed from the frozen plan's `depends_on`, typed refusal `upstream_not_consumed`,
  HARD-gated for IMPLEMENT_ROLES consumers of producer nodes, advisory elsewhere; the card/openers must NEVER
  emit the upstream nonce so a correct echo proves a real read); resume re-hydration from the envelope cache.
- #643: the ROLE_TOKEN_REGISTRY vocabulary (content-bearing token per role: code-architect
  `files_to_create|files_to_modify`+`build_sequence`, code-explorer `findings`, knowledge-lookup
  `findings`+`sources`, planner `recommendation`, issue-scout `recommendation`, build-error-resolver
  `build-green`, synthesizer `merge_outcome`, doc-updater `docs_updated`); the role-kind evidence-contract
  text per kind (read producers RETURN-for-persistence, write roles SELF-WRITE); the future-agent wall design
  (derive kind from the tool manifest — Write/Edit present or not — never a hand-list; ≥2-token rule with a
  `PRESENCE_ONLY_RATIONALE` allowlist escape); the ×6 role-kind enumeration re-derivation. Includes an AUDIT
  of every node-role agent `.md` + `.toml` against the wall's needles, naming exactly which of n4's declared
  files need edits and which are already compliant (synthesizer.md already carries the self-write needle).
- #644: A1 — count `kind:'gate'` at `liveReadsAtMerge` (AN:~5393) and hold the relaxed `write_awaits_drain`
  else-branch + `tryR2bLeglessCoopen`'s live-reads filter while a `kind:'gate'` member is live; A2 — thread
  `parseValidationTestConsumes` result as `opts.testConsumedExtra` into the `scratchObservableWriteSet` call
  in `tryR2bLeglessCoopen` (AN:~3861). Exact line refs are in the issue; the design is mechanical.
- `reasoning`: these decisions (grammar, anti-fabrication nonce protocol, concurrency-fence semantics)
  constrain all downstream work; rework is the most expensive outcome (precedence #1).

**n2-validator (tdd-guide, reasoning) — `plan-validator.js` ×4 + its two claude-only test surfaces.** RED
first: (a) `test-adaptive-handoff.js` — a `## Node Briefs` block naming an unknown node id → handoff
`plan_invalid` with `brief_unknown_node`; a post-freeze one-line brief edit → `plan_integrity_failed`
(hash-coverage proof) [#642 V4]; (b) `test-adaptive-node.js` — `open-next` over a fixture with a new
producer role seeds the new registry tokens as stubs and `close-and-open-next` REFUSES `evidence_shape_failed`
on an empty content-bearing token, closes when filled [#643 V1/V6, the lossy-paraphrase regression]. Then
implement the parse + rows. `reasoning`: the freeze wall is the highest-blast-radius surface (governs every
plan freeze across four editions). test-adaptive-node.js is shared with n3 (serial via the n2→n3 edge);
test-adaptive-handoff.js is n2-only.

**n3-adaptive (tdd-guide, reasoning) — `adaptive-node.js` ×4 + `test-adaptive-node.js` + the claude-only
walkthrough.** Implements #642's channel + #644's two scheduler fixes, RED-first, one slice at a time:
- #642 V1 (card emission): `open-next`/`open-ready`/fused-advance emit `goal_line` (when a brief exists) and
  `upstream_evidence` (when `depends_on` non-empty) via the single `buildDispatch`; briefless/root envelopes
  stay byte-identical (conditional-attach pin, same discipline as `leg_path`).
- #642 V2 (consumed-proof): happy path with a real upstream nonce closes; missing/`stale`/`wrong` echo →
  `upstream_not_consumed`, zero ledger mutation; fabrication resistance — the serialized open envelope +
  `.cache/open-*-envelope.json` contain NO upstream nonce anywhere (grep-absent); producer→gate pair closes
  advisory (non-blocking).
- #642 V3 (resume survival): a fresh-shell `orient --json` re-derives the in-progress node's re-dispatch
  materials (`goal_line` + `upstream_evidence`) from DISK alone; the walkthrough resume scenario re-derives
  the same card from the envelope cache without re-opening.
- #642 walkthrough scenarios (AC6): brief→goal_line, upstream_evidence derivation, briefless back-compat,
  unknown-node-id refusal (freeze scenario exercises n2's parser, available since n3 depends on n2).
- #644 A1/A2: RED `{main-session-gate ∥ doc-updater docs/api.md}` antichain — the writer must HOLD (co-open
  precondition + G4 merge-fence) while the gate is live, and byte-identical serial fallback preserved; a
  fork-widening (`validation_test_consumes: docs/fork-guide.md`) RED row proving `testConsumedExtra` now
  refuses the R2b legless co-open of a `docs/fork-guide.md` writer over a dirty parent.
- `reasoning`: dispatch machinery + anti-fabrication proof + concurrency fences — subtle correctness where
  rework dominates.

**n4-agents (implementer, standard) — the evidence-contract prose surface (#643 D2) + the #642 planner
posture, cross-edition byte-mirror + forge-neutral.** Renders the architect's canonical role-kind text into
each root `agents/<role>.md` (claude format) and each `plugins/<edition>/agents/<role>.toml` (codex format,
byte-identical ×3, NO forge-CLI/brand nouns — "the forge CLI"/"the forge"). The write set declares ALL nine
registry/posture roles across three editions DEFENSIVELY (36 files) — under-write with a skip-reason is safe;
the architect's audit names the actual edits (the 7 genuinely-uncovered roles need sections; synthesizer is
already compliant; workflow-planner carries #642's compact-plan posture — decide design-node vs inline-brief
by issue complexity, and when omitting the design node the implement node's brief MUST carry the
implementation direction). Verify changed files immediately with the standalone forge-neutrality check
(`node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only
<file>...` + the gitea twin) rather than waiting for the full chains. Keep the three `.toml` editions
byte-identical (`test-agent-profile-parity.js`). NOTE: this is a CONTRACT-COMPLETION for EXISTING roles —
no agent is added/removed, so the 22-surface agent-registration wall does NOT fire (no CANONICAL_ROLES /
config/agents.toml / install.sh delta). `standard`: mechanical rendering of already-decided text, held by
the n8 reasoning gate and the n6 wall.

**n5-prose (implementer, standard) — the six routing surfaces via the generation seam.** The six plan-run
surfaces are GENERATED by `generate-routing-surfaces.js --check` (in ALL FOUR chains) from
`templates/routing/plan-run.skeleton.md` + `slots.js` (+ `required-blocks.js` if a new required block is
introduced) — so EDIT THE SKELETON/SLOTS, then `node scripts/generate-routing-surfaces.js --write` to
regenerate the six committed surfaces (never hand-edit a surface, or `--check` reds). Adds #642 D3's two
step-3 relay lines (carry `goal_line` verbatim into the role dispatch; READ each `upstream_evidence` file
before starting) + the resume re-hydration line, and #643 D3's role-kind enumeration re-derived from the
tool manifest ("any node role without Write in its manifest RETURNS its deliverable; Write roles SELF-WRITE",
current roster as examples). `standard`: template edits per the architect's exact skeleton spec; the n6 pins
+ n8 reasoning gate enforce.

**n6-enforcement (tdd-guide, reasoning) — the machine-enforcement walls (#643 D4 + the ×6 surface pins).**
Depends on n2 (registry rows must exist for the wall's ≥2-token check), n4 (agent sections must exist so the
wall passes over the real repo), n5 (surfaces must carry the new prose so the pins pass). RED-first: (a) the
future-agent wall in `validate-vendored-agents.js` — a scratch fixture agent with a Write manifest but NO
registry row / NO evidence section is a typed refusal; add row+section → passes [#643 V3, sandboxed in a
scratch dir, never the live repo root]; a mutation stripping one real agent's section → typed refusal (needle
is load-bearing) [#643 V2]; (b) mirrored `.toml` needles in the gitlab/gitea (and codex) contract validators;
(c) `test-route-reachability.js` + the four `validate-*-contracts.js` pin the new ×6 relay/enumeration
sentences and grep-assert no surface still carries the stale 3-role-WRITE / 4-role-READ enumerations [#643
V4, #642 AC4]. `reasoning`: the wall derives role-kind from the tool manifest and must be precise, and it is
the durable regression guard that keeps these contracts from rotting on the next agent addition.

**Gates — two code-reviewers (G1 post-dominance) + one adversarial-verifier; maximized but non-redundant.**
- **n7-cr-engine (code-reviewer, reasoning)** post-dominates the engine (n2+n3 via the n3 dep): the freeze
  grammar + registry, the conditional-attach byte-identity, the consumed-proof anti-fabrication (nonce never
  emitted), and the #644 fence matrix + byte-identical serial fallback. Runs `validation_command` (the four
  chains — #307, run SEQUENTIALLY; this box's run-chains guidance).
- **n8-cr-surface (code-reviewer, reasoning)** post-dominates n4+n5+n6: agent byte-mirror + forge-neutrality,
  the routing-generation seam (`--check` byte-match across six surfaces + forge renames), and the wall logic.
- Removing `{n7, n8}` disconnects every code node (n2,n3,n4,n5,n6) from the sink → G1 satisfied on the
  reachability-after-removal test.
- **n9-adversary (adversarial-verifier, reasoning, read-only, has Bash)** depends on n7 (so its path to sink
  still passes a code-reviewer) and RUNS the reproductions the four-chain suite cannot self-referee (the suite
  is partly CIRCULAR — it exercises the very adaptive-node being changed): the #642 fabrication-resistance
  grep (open envelope carries no upstream nonce) + the `upstream_not_consumed` fail-closed rows, and the #644
  `{gate ∥ writer}` co-open-hold + G4 merge-fence-hold + fork-widening RED. This is the exact lens that
  surfaced #644 from #641 — highest-value, non-redundant with the diff-reading reviewers.
- **No security-reviewer (G2):** labels are empty and no write-set path is sensitivity-classified, so G2 is
  not required; the consumed-proof's anti-fabrication property (nonce non-leak, echo-is-real-proof) is a
  concrete REPRODUCTION covered by n9 (V2 negative-3), so a third overlapping gate would be a means without a
  goal (precedence #3) — review QUALITY is maximized by the strong reviewer + adversary over the actual
  reproductions, not by gate count. **No main-session-gate (G3):** acceptance is fully machine-checkable
  (V1–V6 tests + the four chains + the adversarial reproductions) — no GPU/visual/device/human-signoff hinge.
  **No knowledge-lookup:** every design decision is confirmable in-repo (the cited line refs + the
  #641/#516/#392 precedents).

**n10-docs (doc-updater, standard) — CHANGELOG lands BEFORE the finalize chain receipt.** Depends on both
gate clusters (n8 + n9) so it documents the reviewed/adversary-approved state. Writes `CHANGELOG.md`
(`[Unreleased]`, all three issues), `docs/api.md` (the `dispatch` sub-object: `goal_line` + `upstream_evidence`;
the evidence-recording contract per role kind), `docs/conventions.md` (the new-agent checklist: registry row
with a content-bearing token + role-kind evidence section [#643 AC7]), `docs/plan-run-cards/resume.md` (the
resume re-hydration line), and three NEXT-FREE decision records `D-642-01.md` / `D-643-01.md` / `D-644-01.md`
(the repo series currently runs through `D-641-01 (existing)` — these are the next-free ids; D-643-01 records the AC6
back-compat choice — the shape gate reads required tokens at close time, so an in-flight plan seeded with the
old stub set still closes). `docs/api.md` is a #547 test-consumed doc (CODE for the freshness hash); writing
it here (before finalize's receipt) keeps the receipt fresh — putting CHANGELOG/api.md on the sink would make
its own chain receipt `chains_stale`. Docs-band only → not code-producing → no extra G1.

**n11-finalize (finalize) — unique docs/state sink, empty tracked write.** Runs the recorded
`validation_command` (four-chain #307, SEQUENTIALLY) over the final post-docs tree as its receipt and closes
642+643+644 together (bundle `all_or_nothing`). It writes no tracked file (CHANGELOG lives on n10 per the
pre-gate-docs discipline); its evidence is the passing four-chain receipt + the closure.

**Verification-plan coverage (both issues carry V1–V6; every item is pinned by a test or recorded in
evidence).** #642: V1→n3 (card emission unit + walkthrough), V2→n3 (consumed-proof happy/negatives/fabrication)
+ n9 (adversarial repro), V3→n3 (resume survival), V4→n2 (freeze/tamper), V5 (live self-host dogfood)→ see
caveat below, V6→n3 walkthrough. #643: V1→n2 (per-role seed/shape matrix), V2→n6 (agent-file needle + mutation),
V3→n6 (future-agent wall negative, sandboxed), V4→n6 (enumeration derivation + ×6 pins), V5→n2 (back-compat),
V6→n2 (recording-fidelity, lossy-paraphrase now refuses). #644: A1/A2 pinned in n3; regression matrix in n9.

**V5 dogfood caveat (honest scope).** #642 V5 asks the implementing run to self-host the new channel and cite
a real `upstream_read` line. The run's openers execute the INSTALLED scripts, which do not carry the new code
until a reinstall, so true mid-run self-hosting is not mechanically guaranteed by the planner. V5's INTENT
(prove the channel works end-to-end) is met deterministically by the pinned V1–V3 fixtures in
`test-adaptive-node.js` + the walkthrough; n11's evidence may cite the passing close/open envelope from those
fixtures as proof-of-behavior. THIS plan itself uses a producer→implementer chain (n1-architect → n2/n3) with
per-node direction carried in these Plan Notes (the pre-#642 channel), matching the compact-plan posture #642
documents for when a design node IS authored.

## Node Ledger

| id | status |
| --- | --- |
| n1-architect | complete |
| n2-validator | complete |
| n3-adaptive | complete |
| n4-agents | complete |
| n5-prose | complete |
| n6-enforcement | complete |
| n7-cr-engine | complete |
| n8-cr-surface | complete |
| n9-adversary | complete |
| n10-docs | complete |
| n11-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-architect) | subagent-invoked | evidence-binding: n1-architect 416c5fde30b3 | |
| tdd-guide (n2-validator) | subagent-invoked | deferred_to_group | |
| implementer (n4-agents) | subagent-invoked | deferred_to_group | |
| implementer (n5-prose) | subagent-invoked | group_passed | |
| tdd-guide (n3-adaptive) | subagent-invoked | deferred_to_group | |
| tdd-guide (n6-enforcement) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n7-cr-engine dce77a8a41e6 | |
| adversarial-verifier (n9-adversary) | subagent-invoked | evidence-binding: n9-adversary 3b80090c352a | |
| doc-updater (n10-docs) | subagent-invoked | evidence-binding: n10-docs 923a0d2372ee | |
