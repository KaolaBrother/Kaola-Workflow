evidence-binding: n1-architecture ea05782ab1d5

# Dependency-safe blueprint for issues 693, 696, 697, and 698

Downstream rule: every implementation, documentation, review, security, falsification, and finalize node MUST read this artifact before acting. Product/repository files were not edited by this architecture node.

files_to_create: 13 canonical contract, runner, fixture, and decision files detailed below
- templates/reviewers/behavior-contracts.json
- templates/reviewers/runtime-adapters.json
- scripts/generate-reviewer-profiles.js
- scripts/kaola-workflow-validation-runner.js
- plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js
- scripts/test-validation-runner.js
- scripts/reviewer-conformance-fixtures.json
- docs/decisions/D-693-01.md
- docs/decisions/D-696-01.md
- docs/decisions/D-697-01.md
- docs/decisions/D-698-01.md

files_to_modify: existing generated profiles, workflow engine, routing, installer, validation, and documentation files detailed below
- scripts/test-agent-profile-parity.js
- scripts/test-opencode-edition.js
- agents/code-reviewer.md
- agents/profiles/higher/code-reviewer.md
- agents/adversarial-verifier.md
- plugins/kaola-workflow/agents/code-reviewer.toml
- plugins/kaola-workflow/agents/adversarial-verifier.toml
- plugins/kaola-workflow-gitlab/agents/code-reviewer.toml
- plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml
- plugins/kaola-workflow-gitea/agents/code-reviewer.toml
- plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml
- scripts/validate-script-sync.js
- scripts/test-validate-script-sync.js
- scripts/kaola-workflow-install-manifest.js
- plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js
- scripts/test-install-manifest-single-source.js
- package.json
- scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
- scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js
- scripts/kaola-workflow-repair-state.js
- plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js
- scripts/test-adaptive-node.js
- scripts/test-adaptive-handoff.js
- scripts/test-plan-run.js
- scripts/test-commit-node.js
- scripts/simulate-workflow-walkthrough.js
- templates/routing/plan-run.skeleton.md
- templates/routing/slots.js
- templates/routing/required-blocks.js
- commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md
- commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md
- commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- agents/workflow-planner.md
- plugins/kaola-workflow/agents/workflow-planner.toml
- plugins/kaola-workflow-gitlab/agents/workflow-planner.toml
- plugins/kaola-workflow-gitea/agents/workflow-planner.toml
- scripts/test-route-reachability.js
- scripts/test-generate-routing-surfaces.js
- install.sh
- scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js
- scripts/test-install-model-rendering.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- scripts/validate-vendored-agents.js
- scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- scripts/validate-kaola-workflow-contracts.js
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- README.md
- CHANGELOG.md
- docs/api.md
- docs/architecture.md
- docs/workflow-state-contract.md
- docs/agents-source.md
- docs/conventions.md
- docs/opencode-edition.md

build_sequence: n2+n3 -> n4 -> n5 -> n6 -> n7 -> n8 -> n9 -> n10+n11+n12 -> n13
1. n2-profile-contracts and n3-validation-runner run concurrently because their exact write sets are disjoint.
2. n4-review-engine consumes both outputs and implements schema/versioning, the shared gate classifier, contexts, receipts, journals, findings, reducers, validation inheritance, and G4 as one cohesive state machine.
3. n5-runtime-guidance exposes only the n4 machine contract through generated six-surface routing and planner/finalize guidance.
4. n6-installed-contract-proof binds repository, installed, and plugin-cache identities after all behavior/runtime surfaces exist.
5. n7-documentation records the shipped contracts and decisions before certification.
6. n8 code review, then n9 security review, then the disjoint n10/n11/n12 falsification frontier, then n13 final validation/finalization.

## 1. Architecture decisions and invariants

### 1.1 One pure graph classifier

`scripts/kaola-workflow-adaptive-schema.js` owns and exports the only pure classifier:

```js
deriveGateMode(planView, node) -> 'investigation' | 'change_gate' | null
```

`null` is returned for non-`adversarial-verifier` nodes. `planView` is an immutable normalized value with `nodes[{id, role, dependsOn}]`, `sinkId`, and `changeProducerIds`. `changeProducerIds` is the union of code-producing nodes, sensitive nodes, and schema-2 producer ids declared by the verifier's `certifies` metadata. The function performs only forward reachability:

1. the verifier must forward-reach the unique sink; and
2. at least one change producer must forward-reach the verifier.

If both hold, mode is `change_gate`; otherwise it is `investigation`. This deliberately preserves the existing `advVerifierIsChangeGate` safety direction. It is NOT strict post-dominance: a verifier downstream of code with a parallel non-verifier route to the sink remains a change gate.

`scripts/kaola-workflow-plan-validator.js` owns the canonical `planView` builder because it already owns node parsing, code/sensitive classification, labels, and unique-sink validation. Its existing `advVerifierIsChangeGate` export becomes a compatibility wrapper around `deriveGateMode(...) === 'change_gate'`, not a second implementation.

Every lifecycle seam consumes this result, never role prose or a caller-supplied mode:

- mode-derived required-token seeding;
- `record-evidence --verify` and evidence-shape verification;
- dispatch/context construction in all three openers;
- `close-node` and `close-and-open-next`;
- fan-out member close and aggregation;
- receipt normalization and review-journal admission;
- repair-state pending-gate reconstruction;
- `--verdict-check`, gate verification, and Finalization freshness checks.

Schema-2 freezes reject mixed modes inside one logical group. Mutation fixtures must make each seam fail if it falls back to role-only verdict handling or a separately reimplemented predicate.

### 1.2 Three independent axes

The normalized receipt has independent axes:

```text
execution_status: complete | failed
domain_outcome:
  code/security/main-session: approved | changes_requested
  adversarial-verifier: refuted | not_refuted | indeterminate
gate_effect: pass | fail | none
```

- `execution_status` is harness-derived from a terminal child state plus nonce, context, profile, candidate, and `record-evidence --verify` success. A model-authored `execution_status` line is never authoritative and should be rejected as a reserved harness field.
- A complete investigation adversarial result accepts all three domain outcomes, derives `gate_effect:none`, closes the node/group, creates no product-repair attempt, and opens downstream convergence.
- Missing, malformed, stale, failed, or mismatched evidence derives `execution_status:failed`; it does not become analytical `indeterminate`, does not close, and routes bounded role retry.
- A change-gate adversarial result maps `not_refuted -> pass` and `refuted|indeterminate -> fail`.
- Code/security/main-session derives `pass` only from `approved` with zero admitted blockers. `changes_requested` or any admitted blocker derives `fail`; free-form verdict/count lines are compatibility input only on contract v1.

### 1.3 Explicit plan grammar and v1 boundary

Newly frozen plans add `plan_schema_version: 2` in `## Meta`. Schema-2 `## Nodes` adds hash-covered columns:

```text
gate_claim | gate_surface | gate_aggregation | certifies
```

- `gate_claim` is a nonempty single-line claim for schema-2 gate nodes.
- `gate_surface` is a nonempty single-line surface. Replicas use the same surface; partitions use pairwise-distinct surfaces.
- `gate_aggregation` is exactly `sequence`, `replicated_majority`, or `partitioned_all`.
- `certifies` is a canonical sorted comma list of producer node ids. It is required for a schema-2 change-gate adversarial verifier and empty for an investigation verifier. Code/security common-certifier producer sets are validator-derived.

Schema-2 Meta also carries:

```text
code_certifier: <node-or-logical-group-ref>
security_certifier: <node-or-logical-group-ref>|none
inherited_frontier_digest: none|<64-hex>
inherited_frontier_classes: none|code|security|code,security
```

The inherited fields are hash-covered and must match authoritative handoff state when such state exists. Issue 699 will own the claim-preserving epoch transaction and CAS that establishes that authority; this bundle implements the validator/context/G4 semantics and typed handoff only.

Migration is fail-closed and byte-preserving:

- An unfrozen draft without `plan_schema_version: 2` cannot newly freeze.
- An unfrozen draft explicitly requesting version 1 is refused; new legacy plans cannot be authored.
- A verified already-frozen plan whose hash-covered Meta predates the field maps explicitly to `plan_schema_version:1` and dispatch `contract_version:1`.
- A schema-2 plan maps only to dispatch `contract_version:2`.
- Missing, unknown, or plan/dispatch mismatched contract versions refuse before spawn.
- Contract v1 continues through the existing parser, evidence vocabulary, reducer, and journal schema without rewriting frozen plan or journal bytes.
- There is no in-place v1 journal upgrade. A future v1-parent to v2-child move is only through issue 699's explicit snapshot/activation transaction.

This currently frozen bundle plan is itself a v1 compatibility fixture and must remain byte-identical outside its mutable ledger.

## 2. Canonical reviewer source and identity

### 2.1 Source schema

`templates/reviewers/behavior-contracts.json` is strict JSON with exactly:

```json
{
  "schema_version": 1,
  "roles": {
    "code-reviewer": {
      "behavior_contract_version": 2,
      "description": "runtime-neutral description",
      "nickname_candidates": ["..."],
      "sections": [{"id": "stable-id", "heading": "...", "lines": ["..."]}],
      "receipt_contract": {"domain_outcomes": ["approved", "changes_requested"], "finding_schema": "finding-anchor-v1"}
    },
    "adversarial-verifier": {
      "behavior_contract_version": 2,
      "description": "runtime-neutral description",
      "nickname_candidates": ["..."],
      "sections": [{"id": "stable-id", "heading": "...", "lines": ["..."]}],
      "receipt_contract": {"domain_outcomes": ["refuted", "not_refuted", "indeterminate"], "finding_schema": "finding-anchor-v1"}
    }
  }
}
```

Unknown roles, keys, section ids, duplicated ids, non-string policy lines, contradictory description/body statements, and provenance tokens are rejected. The code-review core includes the current >80% admission rule, diff/surrounding callers/tests, candidate-caused and unchanged-code boundary, exact trigger/anchor, HIGH/CRITICAL proof burden, no style/filler/speculation, zero-finding success, consolidation, discovery/closure behavior, canonical findings, and domain receipt. The adversarial core includes refute-if-uncertain, one claim/surface, strongest falsification, attempted counterexamples, context-derived investigation/change-gate behavior, domain/gate separation, and declared aggregation.

`templates/reviewers/runtime-adapters.json` is closed data only. Each runtime/variant entry permits exactly `tools`, `model_policy_ref`, and `evidence_transport`; values come from closed enums. No description, suffix, prefix, prompt, instruction, or arbitrary field is legal. Codex uses `model_policy_ref: codex-inherit-by-omission`; the generator must never emit `model` or `model_reasoning_effort`. Claude base/higher differs only in frontmatter/model adapter data. OpenCode remains generated from the canonical Claude root and its normalized core must be unchanged by the OpenCode transform.

### 2.2 Rendering and hash boundaries

`scripts/generate-reviewer-profiles.js` is the sole writer for the two Claude root profiles, higher code-reviewer, and six Codex TOMLs. It supports `--write`, `--check`, and `--manifest-json`, emits LF plus one final newline, deterministic key/order/escaping, and never embeds issue/ADR provenance in agent-facing output.

Every output embeds:

- `behavior_contract_version`;
- `behavior_contract_hash`;
- `resolved_profile_hash`.

Hash definitions:

- `behavior_contract_hash = sha256(canonical_json({schema_version, role, behavior_contract_version, description, nickname_candidates, sections, receipt_contract}))`. It excludes tools, runtime/model policy, evidence transport, output path, and runtime syntax.
- The generator emits the same delimited normalized behavior-core bytes into Markdown bodies and decoded TOML `developer_instructions`. Tests extract and byte-compare those core bytes across Claude base/higher, Codex/GitLab/Gitea, and generated OpenCode.
- A profile cannot literally hash a field containing its own hash. Therefore `resolved_profile_hash = sha256(complete rendered UTF-8 profile bytes with the one unique resolved_profile_hash value replaced by exactly 64 ASCII zeroes)`. Verification performs the identical normalization and rejects zero/multiple self-hash fields. This binds every other output byte, including description, tools/transport wording, frontmatter/TOML structure, behavior hash, and final newline.

Repository generation proves output bytes. Installer/preflight proves selected source and installed bytes. Neither is described as proof of proprietary runtime prompt loading.

## 3. Schema-2 context, dispatch, receipt, and journal

### 3.1 Runtime-neutral context

At gate open, adaptive-node writes canonical JSON under `.cache/review-contexts/<context_hash>.json`. `context_hash` is SHA-256 of canonical JSON bytes excluding only the file-system newline. Canonical JSON recursively sorts object keys, preserves array order where semantic, emits UTF-8/no insignificant whitespace, and permits only integers for numeric contract fields.

Minimum context object:

```json
{
  "schema_version": 2,
  "contract_version": 2,
  "behavior_contract_version": 2,
  "behavior_contract_hash": "...",
  "plan_schema_version": 2,
  "plan_hash": "...",
  "claim_identity_digest": "...",
  "epoch_lineage_id": "...",
  "epoch": 1,
  "logical_gate": {"key": "...", "kind": "sequence|group", "members": [], "claim_digest": "...", "surface_digests": [], "aggregation": "...", "certified_producers": []},
  "gate_mode": "investigation|change_gate",
  "claim_root_base": {"commit": "...", "digest": "..."},
  "candidate_digest": "...",
  "inherited_frontier": {"digest": "...|none", "classes": []},
  "scope_lineage_id": "...",
  "review_phase": "discovery|closure",
  "attempt_ordinal": 1,
  "acceptance_evidence": [{"kind": "...", "digest": "..."}],
  "prior_findings": [],
  "repair_delta": null,
  "validation_obligations": []
}
```

`scope_lineage_id` hashes canonical claim identity, acceptance-evidence digest, claim-root base, and reviewed path/frontier identity. It excludes node id, plan hash, epoch ordinal, reviewer runtime, and current blob ids, so gate renaming or re-plan cannot reset discovery.

The context is runtime-neutral and contains no `resolved_profile_hash`, runtime/model/tool name, evidence transport, timestamp, or local absolute path. The dispatch envelope separately carries `context_hash`, context path, plan/contract versions, graph-derived gate mode, behavior identity, runtime-specific `resolved_profile_hash`, candidate digest, logical-gate data, and mode-derived required tokens. Evidence must echo these values; close recomputes all of them before parsing a domain outcome.

### 3.2 Mode-derived evidence tokens

Keep the static v1 `ROLE_TOKEN_REGISTRY` behavior for contract 1. For contract 2, adaptive-schema owns `requiredReviewTokens(planView,node)`:

- all schema-2 reviewer gates: `evidence-binding`, `contract_version`, `review_context_hash`, `behavior_contract_hash`, `resolved_profile_hash`, `candidate_digest`, `domain_outcome`;
- adversarial investigation: the above plus `claim_outcome` (equal to the normalized adversarial domain outcome);
- adversarial change gate: investigation tokens plus `gate_mode`, `gate_claim`, `gate_surface`, and `gate_aggregation`;
- code/security/main-session: base tokens plus `gate_claim`, `gate_surface`, `gate_aggregation`, and structured finding rows.

Openers seed empty values only. The role must fill them. `execution_status` and `gate_effect` are reserved harness outputs and are not seeded for/model-authored by the role.

### 3.3 Receipt and journal

Every complete member produces a canonical normalized sidecar at `.cache/review-receipts/<context_hash>/<node-id>.json` containing schema/contract versions, evidence binding, context/behavior/profile/candidate identities, harness-derived execution status, normalized domain outcome, harness-derived gate effect, normalized findings, validation vector references, optional certifier digest, and raw-evidence SHA-256.

Investigation receipts are durable analytical evidence but never create a product-repair entry in `.cache/review-attempts.json`. A failed execution creates no analytical receipt and no repair attempt.

Schema-2 change gates use journal schema 2. It retains the existing immutable #682 attempt, producer-binding, repair, rebind, and consumption fields and adds:

- `contract_version`, `epoch_lineage_id`, `gate_mode`, `scope_lineage_id`, context/profile hashes;
- `review_phase`, prior/current open UID sets, immutable normalized finding records and resolutions;
- repair delta and validation obligation/vector identities;
- progress result, idempotency key, consecutive non-progress count, and stop reason;
- reducer inputs/output and role-specific certification digest.

Journal top-level `schema_version` must match the verified plan contract exactly. A v1 plan accepts only schema 1 through the unchanged v1 validator; a v2 plan accepts only schema 2. Missing, cross-version, or future journal versions refuse without rewriting.

## 4. Finding anchors, UID, and progress

### 4.1 Canonical anchor union

The role emits structured local rows; the harness validates Git/candidate membership and assigns identity. Model ids are display metadata only. Every anchor carries `kind`, one closed `failure_class`, and a harness-recomputed `trigger_digest`. The failure-class enum is versioned in the canonical behavior source and initially contains `correctness`, `security`, `data_loss`, `concurrency`, `persistence`, `compatibility`, `contract`, `validation`, `test_coverage`, `scope_regression`, and `performance_regression`.

The role supplies a structured trigger `{precondition_digest,input_digest,expected_digest,observed_digest}`; the harness computes its digest from canonical JSON. An arbitrary model-supplied digest cannot create a new UID.

Anchor variants:

1. `candidate_range`: exact repo-relative Git tree path, repository object format (`sha1|sha256`), tree mode, object id, and validated half-open blob byte range.
2. `deleted_base_range`: parent candidate digest, exact base path/object format/mode/object id/range, and deletion patch/hunk digest.
3. `tree_entry_change`: exact path/object format plus unequal base/candidate `{tree_mode,object_id}` or null entries; covers additions, deletions, symlink, executable-bit, and gitlink changes.
4. `required_absence`: exact required path, acceptance-clause digest, and candidate-tree digest proving absence.
5. `evidence_observation`: producer evidence digest plus a stable closed-format observation key.

Paths use forward slashes and must byte-match the exact `git ls-tree -z` path after only stripping leading `./` and collapsing literal `.` segments. Reject absolute paths, backslashes, NUL/control bytes, empty/`..` segments, ambiguous matches, or Unicode normalization that changes Git's actual bytes. Object-id length follows the repository object format. Ranges are integer, nonempty, and within blob byte length.

Exactly one primary anchor defines identity. Secondary anchors are canonicalized, de-duplicated, and byte-sorted but never change UID. UID is:

```text
sha256(canonical_json({scope_lineage_id, primary_anchor}))
```

Proof/resolution digests and model ids do not participate. Duplicate identical UIDs consolidate only when all immutable fields match; otherwise refuse `finding_uid_collision`. Two failures at one location require different harness-derived structured trigger digests. No `supersedes` relation exists in anchor v1.

A moved/deleted prior finding closes under its old UID and old primary anchor; the new location may be secondary evidence. A materially new failure gets a new UID. Proof-only changes cannot churn identity.

### 4.2 Discovery, closure, and progress

- First attempt for a scope lineage is `discovery`.
- Every later attempt is `closure`, must return every prior UID as `open` or `resolved`, and may inspect only the full prior frontier plus repair delta.
- A new blocker with a structurally valid primary/secondary anchor in the repair delta is admitted as a repair regression.
- A genuine in-scope blocker not structurally bound to the repair delta returns `review_scope_expanded` plus durable `replan_required` evidence. It is never silently downgraded to follow-up and is not routed to a same-lineage direct repair.

Resolution requires exactly `{uid,repair_attempt_id,validation_vector_digest,evidence_digest,candidate_digest}` and all digests must bind the current candidate.

For previous open set `P` and current admitted open set `C`, progress is true only if every UID in `P-C` has valid current-candidate resolution evidence, `|C| < |P|`, and every inherited validation obligation has a current comparable pass vector. Missing/changed/fail/inconclusive validation is non-progress.

The progress idempotency key is the logical gate/scope lineage plus repair attempt id and before/after candidate digests. Crash replay cannot increment counts twice. Two consecutive non-progress repair attempts yield `review_nonconvergent`; the existing five-consumed-repair hard limit remains. Neither outcome chooses a writer or replacement DAG.

## 5. Deterministic validation runner and D-547-01 reconciliation

### 5.1 Chosen collision resolution

Extend, do not namespace, the existing D-547-01 `validation_command` key. This is safer because there is one frozen command authority and no risk that old/new command fields disagree.

For a verified legacy v1 plan, `parseValidationPolicy` exposes an explicit compatibility mapping:

```text
command = existing validation_command or null
cwd = .
repetitions = 1
pass_rule = all
env_allowlist = []
runner_required = false
source = legacy-d547
```

The old command remains an opaque record-once/final-validation-staleness field; no new runner or timeout semantics are imposed and legacy bytes do not change.

For schema 2, the same command is refined by:

```text
validation_cwd: <normalized repo-relative path; default .>
validation_repetitions: 1..5; default 1
validation_pass_rule: all
validation_timeout_minutes: 1..120
validation_env_allowlist: <sorted comma-separated key list; default empty>
```

Schema-2 code-producing plans require a command and bounded timeout. Unknown keys/values, duplicate keys, path escape, non-`all` pass rule, or unsafe env-key syntax refuse freeze. D-697-01 explicitly extends D-547-01; it does not silently supersede legacy behavior.

### 5.2 Identity and execution

The four runner copies are byte-identical and the module has no forge nouns. It exports pure canonicalization/reduction helpers and a guarded CLI. It starts from an empty environment, sets deterministic locale/timezone and isolated HOME/TMP values, and injects only platform-minimum keys plus the frozen allowlist. It never persists raw effective environment values; `command_id` carries sorted `{key, sha256(value)}` pairs.

`command_id` hashes canonical JSON over:

- exact command bytes, normalized repo-relative cwd, repetitions/all-pass/timeout policy;
- sorted environment key/value-digest pairs;
- runner Node identity and execution-shell realpath/mode/version-output digest;
- deterministically resolved simple-command executable realpaths/modes/version-output digests;
- sorted relevant lock/toolchain file path/mode/content digests from the repo/cwd ancestry.

The resolver supports a conservative closed shell-command shape. Dynamic command heads, unresolved executables, failed/bounded version probes, ambiguous symlinks, or incomparable toolchain identity make the vector `inconclusive`; they never weaken identity. The exact command still executes through the fixed recorded shell. Absolute local paths are normalized out of failure signatures and never enter runtime-neutral command identity except via digests/declared repo-relative cwd.

Candidate digest uses the runner's exported landable-tree helper, excluding only active workflow state and explicitly inert docs while retaining source, tests, and D-547 test-consumed prose. The review engine/G4 imports this helper rather than reimplementing candidate/vector comparison.

Each repetition records audit start/end timestamps outside the deterministic semantic vector, and inside the vector records index, exit code, signal, timeout, stdout/stderr digests, normalized failure-signature digest, pre/post candidate digests, and executable/toolchain identity. Two addresses are recorded:

- `vector_id`: deterministic hash of all semantic fields, excluding wall-clock timestamps/durations;
- `receipt_sha256`: hash of the complete durable receipt bytes, including audit timestamps.

Reduction is exact:

- `pass`: every run exits zero, no signal/timeout, comparable identities, and every pre/post digest equals the vector's candidate digest.
- `fail`: every run exits nonzero, no signal/timeout/mutation, comparable identities, and all normalized failure signatures are identical.
- `inconclusive`: mixed exits/signatures, signal, timeout, candidate mutation, missing/incomparable identity, or any other case.

Inherited obligations are `{command_id, required_pass_vector_id}` records. The current candidate must have a comparable pass for every inherited `command_id`. A child may add but not drop/change one without a future claim-lineage consent transition. Metrics are observational only and cannot select writers or DAGs.

The opt-in qualification subcommand uses injectable process adapters for local Claude/Codex probes. It records contract/profile/context identities and invariant-class outcomes, never compares prose/finding equality and never becomes a hosted authority.

## 6. Aggregation semantics

All declared members must have complete, bound, version-matched receipts before reduction; missing/failed execution is incomplete/refuse, never a vote.

### sequence

`sequence` is the degenerate one-member aggregation and is legal only for a non-group gate. Code/security passes iff the member is approved with no admitted blocker. Change-gate adversarial passes iff `not_refuted`. Investigation adversarial derives `gate_effect:none` for any complete claim outcome.

### replicated_majority

All members have identical claim and surface. Code/security: any admitted blocker vetoes; otherwise approvals must be a strict majority, so a tie fails. Adversarial analytical aggregate is `not_refuted` only with a strict majority of `not_refuted`; a refuted tie resolves to `refuted`, and any remaining no-majority mixture resolves `indeterminate`. A change gate passes only on aggregate `not_refuted`; investigation keeps `gate_effect:none`.

### partitioned_all

Members share one claim and have pairwise-distinct nonempty required surfaces. Code/security requires every surface approved and no blocker. Adversarial aggregate is `refuted` if any required surface is refuted, otherwise `indeterminate` if any is indeterminate, otherwise `not_refuted`. Change-gate `refuted|indeterminate` fails; investigation remains analytical with no gate effect.

Logical-gate identity hashes claim, ordered surface set, aggregation, exact member set, and certified producer set. Incompatible groups cannot share a context or journal lineage. Group metadata, not cardinality or role prefix, selects the reducer.

## 7. G4 common certifier wall

Schema-2 freeze resolves `code_certifier` and conditional `security_certifier` to a real sequence node or logical group with the correct role/reducer. A change-gate adversarial certifier uses its `certifies` producer list.

For a sequence certifier, ordinary post-dominance applies. For a logical group, collapse the exact group to a virtual certifier: removing the whole group must eliminate every producer-to-sink path, every required member must be reachable from the producer frontier, and the group's join cannot complete without all declared members. Branch-local reviews remain legal but do not satisfy G4.

Producer sets are role-specific and include declared and barrier-observed actual writers capable of changing the corresponding digest:

- code: code/config/tests plus test-consumed prose;
- security: sensitive labels/paths/actual sensitive changes;
- adversarial: the exact declared certified producer set.

Inert docs and active workflow-control state are excluded from the code digest. A later relevant actual or declared mutation stales the certifier receipt.

When `inherited_frontier_digest` is nonempty, the validator creates one virtual producer for every declared inherited class. It is modeled before all current DAG roots, is included even with zero child writers, and must be post-dominated by the planner-designated real certifier. Finalization requires the certifier receipt to bind the full current role-specific digest and recomputes it. Thus inherited unapproved work cannot be laundered by a zero-writer plan.

## 8. Exact module ownership and generation rules

### n2-profile-contracts

- Canonical source/generator: `templates/reviewers/behavior-contracts.json`, `templates/reviewers/runtime-adapters.json`, `scripts/generate-reviewer-profiles.js`.
- Generated Claude outputs: `agents/code-reviewer.md`, `agents/profiles/higher/code-reviewer.md`, `agents/adversarial-verifier.md`.
- Generated Codex outputs: the six code-reviewer/adversarial-verifier TOMLs in the github/gitlab/gitea plugin agent directories; all three editions of a role are byte-identical and contain no Codex model pins.
- Proof: `scripts/test-agent-profile-parity.js`, `scripts/test-opencode-edition.js`.
- Never hand-edit a generated output; fix canonical JSON/generator and regenerate.

### n3-validation-runner

- Runner and direct test: the four new runner files plus `scripts/test-validation-runner.js`.
- Distribution/sync ownership: `scripts/validate-script-sync.js`, `scripts/test-validate-script-sync.js`, both install-manifest copies, `scripts/test-install-manifest-single-source.js`.
- Test-chain ownership: `package.json` only adds the focused runner test without changing sequential edition order.
- The runner is a new four-file byte-identical group and support-manifest entry; create-on-missing and drift are machine tested.

### n4-review-engine

- Runtime-neutral pure contracts/canonicalization/reducers: four byte-identical adaptive-schema files.
- Plan grammar, plan view, G4, verdict/finalization verification: canonical root plan-validator plus generated Codex and forge ports.
- Dispatch/context/receipt/journal/progress/close lifecycle: canonical root adaptive-node plus generated Codex and forge ports.
- Resume/pending-gate reconstruction: manually mirrored four repair-state files.
- Deterministic corpus and RED/GREEN tests: `scripts/reviewer-conformance-fixtures.json`, `scripts/test-adaptive-node.js`, `scripts/test-adaptive-handoff.js`, `scripts/test-plan-run.js`, `scripts/test-commit-node.js`, `scripts/simulate-workflow-walkthrough.js`.
- Edit each canonical root generated aggregator once, then run `node scripts/edition-sync.js --write`; do not hand-diverge generated ports. Repair-state remains its existing manually normalized family.

### n5-runtime-guidance

- Plan-run generated source: `templates/routing/plan-run.skeleton.md`, `templates/routing/slots.js`, `templates/routing/required-blocks.js`; regenerate the six plan-run outputs with `node scripts/generate-routing-surfaces.js --write`.
- Adapt/finalize six-surface guidance and four workflow-planner profiles carry schema-2 authoring/execution/finalization rules while retaining explicit v1 behavior.
- `scripts/test-route-reachability.js` and `scripts/test-generate-routing-surfaces.js` prove all six surfaces and no prompt provenance.
- Guidance passes machine fields; it never derives a second mode, chooses a writer, or authors replacement topology.

### n6-installed-contract-proof

- Installer/source proof: `install.sh`, three Codex installers, four byte-identical preflight copies.
- Installed-scope tests: `scripts/test-install-model-rendering.js`, github Codex walkthrough, GitLab/Gitea workflow-script tests.
- Contract assertions: vendored-agent validator, root/plugin workflow validators, and forge validators listed in `files_to_modify`.
- Installed manifests record behavior/profile hashes. Repository, global, project, and plugin-cache mismatches fail with exact repair commands. Inherit-by-omission remains mandatory. No check claims proprietary prompt-load attestation.

### n7-documentation

- Update the eight listed public/architecture/contract documents and `[Unreleased]` changelog.
- Create next-free D-693-01, D-696-01, D-697-01, D-698-01.
- D-697-01 explicitly extends D-547-01 for schema 2 and records the legacy mapping above.
- Agent-facing surfaces contain rules only; issue/ADR provenance remains in docs/decisions and changelog.

## 9. TDD execution tasks

### Task 1: Canonical reviewer generation (n2)
- Action: CREATE/MODIFY the exact n2 files above.
- Depends On: n1 only.
- Parallel Group: PG-A with Task 2; exact write sets are disjoint.
- RED: one-byte output mutation, unknown/free-form adapter key, omitted edition output, contradictory description, changed core without regeneration, duplicate self-hash field, and Codex model/model-effort pins all fail.
- GREEN: implement strict source validation, canonical hashes, renderer, generated outputs, and OpenCode normalized-core parity.
- Validate: `node scripts/generate-reviewer-profiles.js --check && node scripts/test-agent-profile-parity.js && node scripts/test-opencode-edition.js`

### Task 2: Deterministic validation runner (n3)
- Action: CREATE/MODIFY the exact n3 files above.
- Depends On: n1 only; keep the executable role-neutral so it can land before schema-2 policy wiring.
- Parallel Group: PG-A with Task 1.
- RED: env/realpath/version/lock/cwd/repetition/timeout/signal/output-order/candidate-mutation cases plus missing four-edition creation and manifest drift.
- GREEN: implement identity, execution, reduction, vector addressing, opt-in mockable qualification, sync/install registration, and package-chain hook.
- Validate: `node scripts/test-validation-runner.js && node scripts/test-validate-script-sync.js && node scripts/validate-script-sync.js && node scripts/test-install-manifest-single-source.js`

### Task 3A: Schema boundary and shared gate mode (n4, serial)
- Write Set: the n4 schema/validator/adaptive-node/repair-state families plus focused tests.
- Depends On: Tasks 1 and 2.
- RED: forward-reachability counterexample, investigation `refuted|indeterminate`, stale evidence, change-gate failure, every lifecycle seam mutation, new-draft missing version, and frozen-v1 preservation.
- GREEN: add explicit version resolver, shared plan view/classifier, mode-derived tokens/dispatch/settlement/verdict/finalization, and the three-axis normalizer.
- Validate: `node scripts/test-adaptive-node.js && node scripts/test-plan-run.js && node scripts/test-commit-node.js`

### Task 3B: Context/profile/candidate binding (n4, serial after 3A)
- RED: runtime-neutral context byte drift, profile hash inside context, stale candidate/context/profile/contract version, and close parsing findings before binding verification.
- GREEN: canonical context/dispatch/receipt sidecars and pre-normalization recomputation.
- Validate: `node scripts/test-adaptive-node.js && node scripts/test-adaptive-handoff.js`

### Task 3C: Anchors, journal v2, and progress (n4, serial after 3B)
- RED: traversal/ambiguous path, sha1/sha256 mismatch, invalid range, deletion, absence, symlink/mode, move, multi-anchor, proof churn, trigger churn, UID collision, missing prior UID, invalid resolution, validation non-progress, two-nonprogress, crash replay, and five-repair ceiling.
- GREEN: implement canonical anchors/UID, discovery/closure, schema-2 journal, strict progress and typed re-plan outcomes while retaining the untouched schema-1 validator.
- Validate: `node scripts/test-adaptive-node.js && node scripts/simulate-workflow-walkthrough.js`

### Task 3D: Reducers and G4 (n4, serial after 3C)
- RED: sequence, odd/even replicated ties, blocker veto, partition gaps/duplicate surfaces, mixed mode, branch-local-only certifiers, inherited zero-writer frontier, inert-doc post-cert mutation, test-consumed-doc/code mutation, and actual-write digest expansion.
- GREEN: implement declared reducers, logical identity, common certifier virtual collapse, inherited virtual producers, role digests, and final freshness.
- Validate: `node scripts/test-adaptive-node.js && node scripts/test-plan-run.js && node scripts/test-commit-node.js && node scripts/simulate-workflow-walkthrough.js`

### Task 3E: Port and conformance closeout (n4, serial after 3D)
- GREEN: run root changes through edition generation, mirror repair-state, populate the deterministic conformance JSON, and prove root/Codex/forge parity.
- Validate: `node scripts/edition-sync.js --check && node scripts/validate-script-sync.js && node scripts/test-adaptive-handoff.js && node scripts/test-adaptive-node.js && node scripts/test-plan-run.js && node scripts/test-commit-node.js && node scripts/simulate-workflow-walkthrough.js`

### Task 4: Runtime authoring/execution/finalization guidance (n5)
- Depends On: all Task 3 substeps.
- RED: six-surface missing-field/mode/version/profile/context/validation/certifier propagation and prohibited prompt provenance.
- GREEN: update canonical routing generation inputs, regenerate plan-run six, update adapt/finalize six and planner four, retain v1 branch and typed `replan_required` handoff without issue-699 activation.
- Validate: `node scripts/generate-routing-surfaces.js --check && node scripts/test-generate-routing-surfaces.js && node scripts/test-route-reachability.js`

### Task 5: Installed identity and contract proof (n6)
- Depends On: Tasks 1 through 4.
- RED: stale/modified repo, global, project, plugin-cache profiles; behavior/profile mismatch; foreign adapter field; missing/mismatched version; inherited-profile model pin; missing runner/install file.
- GREEN: extend install manifests/preflight/doctor/validators and edition walkthroughs with exact repair instructions and honest proof boundaries.
- Validate: `node scripts/test-install-model-rendering.js && node scripts/validate-vendored-agents.js && node scripts/validate-script-sync.js && node scripts/validate-workflow-contracts.js && node scripts/validate-kaola-workflow-contracts.js && node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js && node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js && node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

### Task 6: Documentation and decisions (n7)
- Depends On: Task 5 and final implemented field/refusal names.
- GREEN: document public schema, architecture, state, profile sources, OpenCode derivation, local validation, G4, v1 mapping, proof limits, and issue-699 boundary; create four ADRs and changelog entry.
- Validate: `node scripts/test-route-reachability.js && node scripts/validate-workflow-contracts.js && node scripts/validate-kaola-workflow-contracts.js && node scripts/test-opencode-edition.js`

### Task 7: Reviews, falsification, and final gate (n8-n13)
- n8 code review then n9 security review are serial by the frozen plan.
- n10 lifecycle, n11 profiles, and n12 validation are read-only and safely parallel after n9.
- n13 runs the full post-documentation tree once.
- Validate: `npm test && node scripts/test-opencode-edition.js`

## 10. Falsification matrix

| Invariant | Counterexample that must fail |
| --- | --- |
| Reachability mode | Code reaches AV and sink through parallel paths so AV is not a strict post-dominator; classifier must still return change_gate. Read-only probe AV must return investigation. |
| Seam unity | Replace the mode result at any one seed, dispatch, close, journal, reducer, repair-state, verdict, or finalize seam; the conformance mutation must fail. |
| Three axes | Model writes `execution_status:complete` with stale context, or calls a malformed execution `indeterminate`; node must remain unclosed with no product-repair journal. |
| Investigation liveness | `refuted` and `indeterminate` complete bound investigation receipts must close and open convergence with no `producer_slice: []` repair route. |
| Explicit versions | New missing/v1 draft, v2 dispatch missing/mismatching contract, future plan/journal version, and v1 journal under v2 must refuse before spawn/mutation. Verified frozen missing-field plan must remain v1. |
| Reviewer parity | One byte mutation, omitted output, extra adapter prose key, contradictory description, duplicate hash slot, or Codex model pin must fail exact generation/installed proof. |
| Hash boundary | Changing any rendered byte except replacing the self-hash value for verification changes resolved_profile_hash; changing adapter data does not change behavior_contract_hash. |
| Context binding | Same runtime-neutral inputs must produce identical context bytes; runtime/profile data in context or changed candidate/context/profile hash must refuse before findings. |
| Anchor identity | Path traversal, ambiguous Unicode/path match, wrong object format, range overflow, mode/symlink-only change, deletion, absence, move, trigger churn, proof churn, duplicate/conflicting UID, and multi-anchor ordering are covered. |
| Progress | Removed UID without proof, equal/larger open set, missing/changed/inconclusive validation, or replayed repair cannot count as progress; two unique consecutive failures stop; five cap remains. |
| Runner identity | Unallowlisted env cannot leak in; allowlisted value, PATH/realpath/version, lock/toolchain, cwd, or command changes command_id. Raw secret values never appear. |
| Runner reduction | Stable all-zero is pass; stable same-signature nonzero is fail; mixed, timeout, signal, mutation, unresolved/incomparable identity is inconclusive. Semantic vector id is fixed despite audit timestamps. |
| Reducers | Code/security blocker cannot be outvoted; replicated tie fails; partition missing/duplicate surface fails; AV indeterminate change gate fails; sequence is exactly one-member semantics. |
| G4 | Branch-local reviewers without a common certifier fail freeze; inherited code/security frontier with zero writers still requires a real certifier; inert docs stay fresh while code/test-consumed prose/actual relevant writes stale. |
| Installed proof | Stale repository/global/project/plugin-cache bytes or behavior/profile hashes refuse with scoped repair; no test asserts private prompt-load bytes. |
| D-547 compatibility | Frozen v1 `validation_command` keeps record-once/staleness behavior and one-repetition compatibility mapping; schema-2 extras refine the same key; inherited obligations cannot be silently dropped. |

## 11. Failure routing and rollback

- Generated-profile drift: do not patch outputs. Fix canonical JSON/generator, regenerate all outputs, and rerun exact-generation tests.
- Cross-edition drift: stop the node; regenerate canonical aggregator ports or repair the normalized family. Never accept a partial edition set.
- Any v1 fixture or frozen-byte change: stop and remove the schema-2 change causing it; do not migrate/rewrite active v1 state.
- Malformed/stale/failed reviewer execution: bounded role retry only; no product repair journal and no analytical `indeterminate` substitution.
- Bound change-gate failure: retain the existing durable repair journal and five-repair cap. `review_scope_expanded`, `review_nonconvergent`, or unsafe multi-writer routing emits durable `replan_required`; it never selects a writer/DAG.
- Runner mutation/timeout/signal/incomparability: persist `inconclusive`; never auto-revert user code or call it pass.
- G4 freeze failure: return planner repair with uncovered producer/certifier ids. Scripts must not add hidden nodes/edges.
- Context/journal/profile/version mismatch: typed zero-mutation refusal; never repair by editing hashes or rewriting legacy state.
- Installed profile drift: use the exact installer/preflight repair command for the affected scope; do not infer runtime prompt loading.
- Final focused/full test failure: route to the owning implementation node or build-error-resolver with the exact failing command; n13 must not finalize.

## 12. Explicit out of scope

- Issue 699's claim-preserving epoch transaction, plan swap, CAS seams, epoch snapshots, automatic re-plan budget, consent extension, and Case-B activation.
- Identical stochastic prose or findings across foundation models.
- A shared external reviewer backend or hosted pipeline authority.
- Model/model-effort pins in Codex reviewer profiles.
- Proof of proprietary prompt-load bytes.
- Semantic proof that a repair caused a failure, LLM finding deduplication, harness-selected writers, metrics-selected topology, or an automatically rewritten DAG.
