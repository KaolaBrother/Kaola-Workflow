evidence-binding: n3-inheritance-architecture eddc1eb7ce1e
upstream_read: n1-repository-surface-map 434a01548541
upstream_read: n2-codex-inheritance-facts b2d4e33f1541
outcome: executable inheritance blueprint complete
files_to_modify: the exact n4 declared write set: all 48 role TOMLs in the three Codex agent trees; the installer triple; the adaptive-schema, preflight, resolver, adaptive-node, and next-action four-edition families; the canonical routing skeleton, required-block manifest, six generated plan-run surfaces, and three Codex adapt skills; and the focused root/Codex/GitLab/Gitea tests and contract validators enumerated below
build_sequence: 1 RED characterization; 2 unpin source profiles and migrate installed profiles; 3 change dispatch cards from tier-selected pins to proved parent-session inheritance; 4 thread fresh main-session JSONL proof into Codex reasoning-floor enforcement; 5 regenerate routing/edition mirrors and update contract pins; 6 run focused and four-edition GREEN gates; 7 n6 performs the out-of-repo live acceptance probe

# Selected architecture

## Decision

The only supported inherit representation is omission of both top-level role-profile keys:

- omit `model`
- omit `model_reasoning_effort`

Do not introduce `"inherit"`, `null`, empty-string, or any other sentinel. Codex 0.144.3 documentation,
source, and n2's live scratch probe prove omission; no explicit inherit value is documented. Keep
`name`, `description`, `nickname_candidates`, and `developer_instructions` byte-preserving except for
the old static-pin prose inside `workflow-planner.toml`.

## One end-to-end invariant

For every one of the 16 roles in each of the three source trees (48 TOMLs total):

1. The source and every freshly installed copy omit both profile keys. Same-role triples remain
   byte-identical and forge-neutral.
2. Installer source validation accepts only the omitted-pair posture. Preflight treats an exact old
   full pin (`gpt-5.6-sol` plus `medium` or `xhigh`) as legacy stale, treats either single-key pin or
   any other pair as malformed, and never accepts either posture as fresh. Autofix replaces the
   project-scoped copy atomically from current sources; `--no-autofix` and doctor remain read-only.
   An explicit installer `--global` invocation migrates the user scope, while ordinary project
   preflight must not silently rewrite the user-owned global scope or the root config posture key.
3. `reasoning|standard` and legacy `opus|sonnet` remain declarative task/role metadata. They still
   select Claude's model alias, opencode's provider variant, the Codex metadata display, and the
   40/20 minute wait budget. They never select a Codex child model or effort.
4. A Codex dispatch uses a named base role, `fork_turns:"none"`, and no transient `model` or
   `reasoning_effort`. Its expected runtime pair is copied from a fresh proof of the current parent
   session, not calculated from the tier. Before real work, one role-identity child probe per current
   parent session/profile-set proves child pair == parent pair and proves the intended profile path.
5. A reasoning-floor role must satisfy both layers: its effective declarative tier normalizes to
   `reasoning`, and on Codex the fresh current-parent proof is at least the preserved Codex floor
   `gpt-5.6-sol` + `xhigh`. Inheritance alone is not floor evidence. Claude and opencode continue to
   use the existing tier-only floor check.

# Exact interfaces

## Profile validation and migration

Keep `validateProfileText(text, role, expectedMetadata)` as the common installer/preflight schema
seam, but invert its pair rule: the two keys must both be absent. Add a pure classification helper
used by preflight after parse:

- `legacy_pinned`: both keys exist and are exactly `gpt-5.6-sol` plus `medium|xhigh`.
- `malformed`: exactly one key exists, a key is repeated/empty, or a complete pair is anything else.
- `inherit`: both keys are absent and all identity/metadata fields are valid.

Expose legacy full pins as `profiles_stale` with a `stale_profiles` member, while partial/illegal
pins remain `profiles_malformed` with reasons. Include `legacyPinnedProfiles` in `scopeIsStale`,
`scopeIsFresh`, doctor reports, normal-gate priority, and post-autofix re-verification. Preserve
existing priority: malformed first, then stale, missing, config, and managed-block drift. Preserve
`parseTopLevelModelReasoningEffort` and every root `.codex/config.toml` dispatch-posture read/write
boundary exactly; this issue changes role files only.

Global/project behavior is intentionally asymmetric for safety:

- Project preflight: a stale/malformed project copy is autofixed locally and reverified.
- User/global inspection: stale/malformed state is reported and cannot satisfy the global-fresh fast
  path; ordinary project preflight falls through to a fresh project install rather than mutating
  `~/.codex`. `doctor` stays read-only. The existing explicit installer `--global` is the only
  automatic writer for the user scope and must reverify the inherited posture.

## Tier and role policy

Keep `NODE_MODEL_TIERS`, `TIER_ALIASES`, `normalizeTier`, `DEFAULT_AGENT_MODELS`,
`dispatchModelClaude`, `TIER_RANK`, `dispatchEffortOpencode`, and `WAIT_BUDGET_MINUTES` values
unchanged. The two historical role classes remain useful default/declarative metadata; they no
longer constrain runtime compatibility.

Change `codexProfilePolicy(role, model)` to return:

```json
{
  "codex_profile_mode": "inherit",
  "codex_profile_tier": "standard|reasoning",
  "codex_profile_compatible": true
}
```

for every known role profile. `codex_profile_tier` remains the role's historical/default metadata
class, not an expected child strength. `codex_profile_compatible` means the known profile supports
session inheritance; it does not compare the plan tier to that class. Thus an explicit reasoning
tier on a historically standard role and an explicit standard tier on a historically reasoning role
are both valid and inherit the same current parent pair. Unknown/non-profile roles keep null/false
sentinels, and an unresolved effective plan tier is still refused separately.

## Fresh main-session proof

Extend `kaola-workflow-resolve-agent-model.js` with a dependency-free, testable proof loader/validator
and extend the existing floor function without changing its two-argument behavior:

```text
loadCodexSessionProof({ codexHome, threadId })
  -> { status, thread_id, model, reasoning_effort, observed_at, source }

enforceReasoningFloor(role, tier, {
  runtime, currentThreadId, sessionProof
})
```

The CLI wrapper of the Codex-edition `next-action` determines Codex by the existing
`isCodexPluginScriptDir()` boundary, obtains the current `threadId` only from `CODEX_THREAD_ID`, and
scans `$CODEX_HOME/sessions/**/*.jsonl`. It accepts exactly one rollout whose first
`session_meta.payload.id` equals that thread id and uses that rollout's latest `turn_context`.
`turn_context.payload.model` and `.effort` must both be non-empty strings. The proof is:

- `fresh` only when its thread id equals `CODEX_THREAD_ID` and its `observed_at` equals the latest
  `turn_context.timestamp` for that rollout;
- `stale` when a cached/supplied proof is for another thread or is not the latest turn context;
- `absent` on missing/ambiguous rollout, missing environment binding, malformed JSONL, or either
  missing value.

Do not use file mtime, config text, doctor `dispatch_posture`, spawn arguments, or parent-side prose
as a substitute. Reload on every `next-action` CLI call, so a same-thread posture change cannot reuse
an older proof. Keep `computeNextAction` pure by accepting `{ runtime, currentThreadId,
sessionProof }` in `opts`; its descriptor conditionally carries the proof to `adaptive-node`, which
threads it into `buildDispatch`. Direct unit callers can inject the proof object.

Floor evaluation for `REASONING_FLOOR_ROLES` is ordered and fail-closed:

1. Effective tier must normalize to `reasoning`; otherwise existing `reasoning_floor_violation`.
2. Non-Codex runtime stops here and retains the old pass result.
3. Codex requires a fresh bound proof; missing and stale have distinct typed refusals below.
4. The current preserved Codex floor is exact model `gpt-5.6-sol` with effort rank at least `xhigh`.
   Accept efforts `xhigh|max|ultra`; reject `low|medium|high`, missing, and unknown effort. Reject an
   unknown/different model as unclassified rather than guessing it is stronger. Return floor
   `gpt-5.6-sol/xhigh` for Codex and keep floor `opus` for non-Codex.

## Exact dispatch-card contract

For a known Codex role with a resolved tier and fresh proof, retain the existing keys but change
their semantics/values as follows:

```json
{
  "model": "<effective raw/legacy tier token>",
  "codex_model": "<fresh parent turn_context.payload.model>",
  "codex_model_source": "parent_session",
  "codex_reasoning_effort": "<fresh parent turn_context.payload.effort>",
  "codex_reasoning_effort_source": "parent_session",
  "codex_profile_mode": "inherit",
  "codex_profile_tier": "<role default metadata: standard|reasoning>",
  "codex_profile_compatible": true,
  "codex_session_proof_status": "fresh",
  "codex_session_proof_source": "session_jsonl",
  "wait_budget_minutes": "<40 reasoning/opus; 20 standard/sonnet>",
  "wait_budget_source": "planner_model|role_default|planner_override|optimize_budget"
}
```

When proof is absent/stale, `codex_model` and `codex_reasoning_effort` are null, both source fields
remain `parent_session`, and `codex_session_proof_status` is `absent|stale`; routing refuses before
spawn. The two proof-status/source fields are attached only on a Codex runtime descriptor, so shared
Claude/opencode envelope bytes do not acquire a false Codex proof.

`modelDisplay(tier).codex` must no longer render a pinned pair. Exact strings are
`parent session (reasoning tier metadata)` and `parent session (standard tier metadata)` after alias
normalization. `modelDisplay(tier).claude` and `.opencode` remain byte-for-byte behaviorally
unchanged. The summary segment emits `effort=inherit` whenever
`codex_reasoning_effort_source === "parent_session"`; `unresolved` is reserved for a truly unresolved
tier/card, never inheritance.

## Typed refusals under inheritance

- `codex_tier_unresolved`: effective `dispatch.model` cannot normalize to reasoning/standard. It is
  independent of the valid null pair on an absent parent proof and survives legacy plans unchanged.
- `codex_profile_runtime_mismatch`: the card is not `codex_profile_mode:"inherit"`, the current
  parent proof is absent/stale, either proved card value is absent, the child identity/path is not the
  requested installed profile, the profile-set binding changed, or child model/effort differs from
  the freshly re-read parent/card pair. This remains the one routing/live-proof refusal.
- `reasoning_floor_proof_missing`: a ready Codex floor role has no complete current-session proof.
- `reasoning_floor_proof_stale`: a ready Codex floor role's proof thread/timestamp is not the current
  `CODEX_THREAD_ID` and latest turn context.
- `reasoning_floor_violation`: the floor role's tier is sub-floor, or its fresh Codex model/effort is
  below/unclassified against `gpt-5.6-sol/xhigh`.
- `profiles_stale`: exact legacy two-key pins; safe migration is available.
- `profiles_malformed`: partial, repeated, empty, or illegal pins.

Retire `codex_profile_tier_mismatch` from the routing skeleton, adapt skills, required-block manifest,
reachability tests, and validators. Inherited profiles no longer have a runtime tier conflict to
detect. Do not reuse that reason for missing proof.

# Exact write set

No files are created. n4 may modify only these declared groups:

- 48 TOMLs:
  `plugins/kaola-workflow{,-gitlab,-gitea}/agents/{adversarial-verifier,build-error-resolver,code-architect,code-explorer,code-reviewer,contractor,doc-updater,implementer,issue-scout,knowledge-lookup,metric-optimizer,planner,security-reviewer,synthesizer,tdd-guide,workflow-planner}.toml`.
- Installer triple:
  `plugins/kaola-workflow{,-gitlab,-gitea}/scripts/install-codex-agent-profiles.js`.
- Byte-identical four-copy families: root plus the three plugin editions of
  `kaola-workflow-adaptive-schema.js`, `kaola-workflow-codex-preflight.js`, and
  `kaola-workflow-resolve-agent-model.js`.
- Generated aggregator families: `scripts/kaola-workflow-adaptive-node.js`,
  `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js`, and the analogous
  root/Codex/`kaola-gitlab-workflow-next-action.js`/`kaola-gitea-workflow-next-action.js` quartet.
- Routing sources/outputs: `templates/routing/plan-run.skeleton.md`,
  `templates/routing/required-blocks.js`, `commands/kaola-workflow-plan-run.md`, the three
  `plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-plan-run/SKILL.md` files, and the two
  forge command files `plugins/kaola-workflow-{gitlab,gitea}/commands/kaola-workflow-plan-run.md`.
- Planner prose: the three
  `plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-adapt/SKILL.md` files.
- Focused tests: `scripts/test-agent-model-resolver.js`, `scripts/test-next-action.js`,
  `scripts/test-adaptive-node.js`, `scripts/test-adaptive-handoff.js`,
  `scripts/test-agent-profile-parity.js`, `scripts/test-install-model-rendering.js`,
  `scripts/test-route-reachability.js`, `scripts/simulate-workflow-walkthrough.js`,
  `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`,
  `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`, and
  `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`.
- Contract validators: `scripts/validate-kaola-workflow-contracts.js`,
  `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`, and
  `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`.

# TDD build tasks

### Task 1: Capture RED contract failures
- Action: MODIFY tests only.
- Write Set: every focused test and validator listed above; no production/profile files.
- Depends On: none.
- Parallel Group: serial.
- Implement: change expectations first so the old implementation demonstrably fails for unpinned
  source profiles, legacy migration, class-independent inheritance cards, single parent/child proof,
  and proof-aware floor enforcement. Preserve failure output in n4 evidence before GREEN edits.
- Tests: run the first thirteen focused commands in the validation section individually; at minimum
  record the old-schema unpinned rejection, old legacy-pin acceptance/no-migration, old tier-selected
  card pairs, old per-tier routing prose, and floor-role pass without Codex proof.

### Task 2: Unpin and migrate profiles
- Action: MODIFY profile TOMLs, installer/preflight families, installer/parity/walkthrough tests.
- Write Set: all 48 TOMLs; installer triple; preflight quartet;
  `test-agent-profile-parity.js`, `test-install-model-rendering.js`, Codex walkthrough, GitLab/Gitea
  installer tests, and three contract validators.
- Depends On: Task 1 RED.
- Parallel Group: serial.
- Implement: remove both top-level keys from every source; update workflow-planner instructions to
  call tiers metadata/wait classes; invert source/installed validation; distinguish exact legacy
  full pins from malformed partials; make autofix idempotently install omission; include legacy pins
  in user/project/doctor freshness without mutating the root posture key.
- Validate: profile-parity, install-model-rendering, Codex walkthrough, both forge installer tests,
  and all three contract validators.

### Task 3: Make dispatch descriptors inherit
- Action: MODIFY schema/adaptive-node families and card/handoff tests.
- Write Set: adaptive-schema quartet; canonical root + Codex adaptive-node files, then generated forge
  adaptive-node ports; `test-adaptive-node.js`, `test-adaptive-handoff.js`, resolver/card assertions in
  walkthroughs, and validators.
- Depends On: Task 2 profile contract.
- Parallel Group: serial.
- Implement: preserve tier normalization/default classes and wait budgets; make `dispatchEffort`
  consume an optional fresh session proof instead of deriving a pair; change profile mode/compatibility,
  Codex displays, and summary token exactly as specified. Do not alter Claude/opencode mappings.
- Validate: adaptive-node, adaptive-handoff, root walkthrough, and edition-sync check.

### Task 4: Enforce the Codex floor from the current session proof
- Action: MODIFY resolver/next-action families and floor tests.
- Write Set: resolver quartet; canonical root + Codex next-action files, then generated forge
  next-action ports; `test-agent-model-resolver.js`, `test-next-action.js`, adaptive-node proof-card
  assertions, and validators.
- Depends On: Task 3 card shape.
- Parallel Group: serial.
- Implement: add the JSONL loader and proof validator; pass runtime/proof through the pure
  `computeNextAction` seam and descriptors; apply the two-layer floor in the stated order; conditionally
  attach proof status/source on Codex cards. No proof requirement is added to Claude/opencode.
- Validate: resolver, next-action, adaptive-node, and non-Codex control cases.

### Task 5: Replace per-tier routing proof with one inheritance proof
- Action: MODIFY canonical routing/planner prose, required blocks, generated outputs, reachability
  tests, workflow-planner TOMLs already owned by Task 2, and validators.
- Write Set: routing skeleton, required-block manifest, six generated plan-run surfaces, three adapt
  skills, three workflow-planner TOMLs, `test-route-reachability.js`, and three validators.
- Depends On: Tasks 2-4.
- Parallel Group: serial.
- Implement: require one current-parent/child equality proof bound to role identity, installed profile
  path, current parent thread, and profile-set fingerprint; remove per-tier expected pairs and
  `codex_profile_tier_mismatch`; preserve v1/v2 named-role, `fork_turns:"none"`, and omitted transient
  override rules. Regenerate, do not hand-edit generated outputs.
- Validate: route reachability, routing generator check, forbidden-only forge checks, and validators.

### Task 6: Synchronize mirrors and prove GREEN
- Action: generated writes followed by read-only validation.
- Write Set: only the declared generated/mirror members above.
- Depends On: Tasks 1-5.
- Parallel Group: serial.
- Implement: run `npm run sync:editions` after canonical aggregator/schema/resolver/preflight edits,
  then `node scripts/generate-routing-surfaces.js --write`; inspect the diff for unrelated changes.
- Validate: all focused commands, generator and edition check modes, then the four npm chains
  sequentially. n4 records focused GREEN; n9 owns the final full `npm test` after docs.

No safe implementation parallel group is declared. Tests, byte-identical mirrors, generated ports,
the routing skeleton, and the shared card/refusal vocabulary overlap semantically and mechanically;
co-writing them would allow transient contract drift. The ordered tasks are the smallest reliable
TDD slices inside the single n4 semantic writer.

# RED/GREEN matrix

| Case | RED on current code | Required GREEN assertion | Primary test surface |
| --- | --- | --- | --- |
| All 48 source profiles | omission is rejected; every file has two pins | exactly 48 TOMLs; neither key in any; 16 same-role triples byte-identical | `test-agent-profile-parity.js`, Codex walkthrough |
| Legacy standard full pin | Sol/medium is accepted as fresh | `profiles_stale`, safe repair, autofix removes both keys, second run `ok`/no rewrite | install rendering, Codex/GitLab/Gitea installer suites |
| Legacy reasoning full pin | Sol/xhigh is accepted as fresh | same stale/migrate/idempotent result as standard; no old-class branch | same installer suites |
| Model-only partial pin | old validation reports generic wrong pair | `profiles_malformed` with model/effort omission reason; autofix removes key | install rendering + forge suites |
| Effort-only partial pin | old validation reports generic wrong pair | `profiles_malformed`; autofix removes key | same |
| Illegal/repeated/empty pair | old pair-centric errors | remains `profiles_malformed`, never legacy stale | same |
| Project scope | pinned project can pass old schema | no-autofix reports; default local autofix + full reverify; root posture untouched | Codex walkthrough |
| User/global scope | pinned global can satisfy fast path | global is stale and cannot satisfy gate; doctor read-only; project fallback local; explicit `--global` migrates | install rendering + Codex walkthrough |
| Historical standard role card | card claims Sol/medium | mode inherit; actual pair equals fresh parent proof; profile tier remains standard metadata; wait 20 | adaptive-node/handoff |
| Historical reasoning role card | card claims Sol/xhigh | same actual parent pair as standard; profile tier reasoning metadata; wait 40 | adaptive-node/handoff |
| Cross-class explicit tier | `codex_profile_compatible:false` and mismatch refusal | compatible true; tier changes only metadata/display/wait, not child pair | adaptive-node + route reachability |
| Missing parent proof | floor role passes on tier alone; regular card claims pair | floor `reasoning_floor_proof_missing`; regular card status absent/null pair and routing `codex_profile_runtime_mismatch` | resolver/next-action/adaptive-node |
| Stale parent proof | no binding exists | wrong thread or non-latest turn -> `reasoning_floor_proof_stale`; routing runtime mismatch | resolver/next-action |
| Sub-floor parent posture | reasoning label alone passes | Codex Sol/high (and lower) -> `reasoning_floor_violation` | resolver/next-action |
| Valid floor posture | reasoning label passes without runtime fact | Sol/xhigh, Sol/max, Sol/ultra fresh proof passes; exact pair reaches card | resolver/next-action/adaptive-node |
| Unknown model/effort | not evaluated | fail closed as unclassified floor violation | resolver |
| Legacy plan aliases | opus/sonnet select old static pairs | opus==reasoning metadata/display/40; sonnet==standard metadata/display/20; both inherit identical parent pair | schema/card/walkthrough |
| Single child proof | one proof per used static tier | one fresh parent-equals-child proof per current parent/profile fingerprint | route reachability + n6 |
| Child identity/path absent | pair-only proof may pass | runtime mismatch unless role identity and scratch/installed profile path bind | route reachability + n6 |
| Claude control | current opus/sonnet mapping | exact mapping and tier-only floor unchanged; no Codex proof fields required | schema/resolver/next-action controls |
| opencode control | current provider rank mapping | exact provider variants and tier-only floor unchanged | schema/resolver controls |
| Root posture key | unrelated `model_reasoning_effort=ultra` is read | parser, warnings, and user-owned write boundary unchanged | install rendering + walkthroughs |

# n6 out-of-repo live probe procedure

n6 must read n2/n3/n4/n5 evidence, execute this as the main-session gate, and write only its seeded
evidence file in the repository:

1. Record `codex --version`; expected comparison baseline is installed CLI 0.144.3. From the n4 tree,
   mechanically assert all three agent directories contain 16 TOMLs, no TOML has a top-level
   `model` or `model_reasoning_effort`, and each same-role triple is byte-identical. Record counts and
   hashes, not just a claim.
2. Outside the repository create `GATE_HOME=$(mktemp -d
   "${TMPDIR:-/tmp}/codex-inherit-gate.XXXXXX")` and `GATE_WORK=$(mktemp -d
   "${TMPDIR:-/tmp}/codex-inherit-work.XXXXXX")`; create `$GATE_HOME/agents`. Symlink the existing
   auth file without copying/printing credentials; optionally symlink `models_cache.json`.
3. Copy the candidate n4 `plugins/kaola-workflow/agents/code-explorer.toml` to
   `$GATE_HOME/agents/code-explorer.toml`. Record source and copy SHA-256 equality, prove both keys are
   absent, and ensure isolated `CODEX_HOME` prevents a stale globally installed profile from loading.
4. Write only scratch `$GATE_HOME/config.toml` with parent `model="gpt-5.6-sol"`,
   `model_reasoning_effort="high"`, `[agents] max_threads=2`, and `max_depth=1`. `high` is deliberate:
   it differs from both historical profile efforts (`medium` and `xhigh`), so equality cannot be
   mistaken for the old standard pin. This is an inheritance acceptance probe, not a floor pass.
5. From `GATE_WORK`, launch:
   `CODEX_HOME="$GATE_HOME" codex -s read-only -a never -C "$GATE_WORK" exec
   --skip-git-repo-check --json '<bounded prompt>'`. The bounded prompt calls direct
   `agents.spawn_agent` exactly once with `agent_type:"code-explorer"`,
   `task_name:"inheritance_acceptance_probe"`, `fork_turns:"none"`, and no model/effort, then waits.
6. Inspect the rollout JSONLs, not `codex exec --json` stdout. Require exactly one root and one child.
   Root: `session_meta.payload.parent_thread_id` absent. Child:
   `parent_thread_id == root id`, `thread_source == "subagent"`,
   `source.subagent.thread_spawn.agent_role == "code-explorer"`, and both agent-path fields resolve
   to the scratch candidate path. Read each file's latest `turn_context.payload.model` and `.effort`.
7. PASS only if both root and child are exactly `gpt-5.6-sol` + `high`, the IDs/path/role bind, the
   copied profile digest equals n4's candidate, and the all-48/parity mechanical check passed. FAIL on
   missing/extra child, null role, wrong path, missing value, full-history rejection, or any mismatch.
   Config inspection, card values, and parent descriptors are not substitutes.
8. Record version, candidate and scratch paths, candidate digest, root/child session IDs, exact pairs,
   all-48 count/parity result, and `verdict: pass|fail` in n6 evidence. Then delete both external
   scratch directories. If FAIL, stop downstream documentation/finalization and route the exact raw
   mismatch to n4; never add pins or an invented inherit sentinel as fallback.

# Validation commands

RED and focused GREEN commands (run individually so failures are attributable):

```bash
node scripts/test-agent-model-resolver.js
node scripts/test-next-action.js
node scripts/test-adaptive-node.js
node scripts/test-adaptive-handoff.js
node scripts/test-agent-profile-parity.js
node scripts/test-install-model-rendering.js
node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
node scripts/test-route-reachability.js
node scripts/validate-kaola-workflow-contracts.js
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
node scripts/simulate-workflow-walkthrough.js
```

Generation and parity order:

```bash
npm run sync:editions
node scripts/generate-routing-surfaces.js --write
node scripts/edition-sync.js --check
node scripts/generate-routing-surfaces.js --check
```

Immediate forge-prose checks after generation/profile edits:

```bash
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/agents/*.toml plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/agents/*.toml plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md
```

Required cross-edition chains, sequentially:

```bash
npm run test:kaola-workflow:claude
npm run test:kaola-workflow:codex
npm run test:kaola-workflow:gitlab
npm run test:kaola-workflow:gitea
```

n4 cites, but does not substitute for, n9's final post-documentation `npm test`.

# Failure routing and rollback boundaries

- Profile/parser uncertainty: stop on the first unpinned source or installer verification failure;
  do not ship a sentinel or restore static pins. Route to n2/n3 with the exact parser/runtime result.
- Proof unavailable: emit the typed missing/stale/runtime mismatch refusal. Do not consult config text,
  weaken the floor, or silently dispatch.
- Generated drift: edit only canonical root/Codex inputs, rerun edition/routing generators, and inspect
  the generated diff; never hand-repair forge aggregator or six routing outputs.
- Global stale install: project preflight may create/repair only project-local profiles. User scope
  changes require the existing explicit `--global` path; no broad delete or config rewrite.
- Non-Codex regression: revert the offending schema/resolver slice and reapply the Codex-conditional
  proof path; never change Claude model aliases, opencode effort tables, aliases, or wait constants to
  make a Codex test pass.
- Live n6 failure: n6 records `verdict: fail`; n7/n8/n9 must not treat config inspection or unit tests
  as replacement acceptance evidence.

# Out of scope

- No changes to README/API/architecture/ADR/CHANGELOG in n4; n8/n9 own them after live proof.
- No edits to workflow-init command/skills or historical ADR D-598-01; root user posture is unchanged.
- No opencode edition changes, no Claude dispatch changes, no new dependency, no committed probe
  fixture, and no in-worktree live-probe scratch.
- No edits to generator implementations or mirror-group definitions unless an actual generator bug
  blocks this exact declared write set; such an expansion requires replan rather than opportunistic work.

delegation_outcome: completed
