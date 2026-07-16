# Conventions

Document coding style, testing rules, Git practices, naming, and review expectations.

## Subagent Seam Rule (issue #277)

The lean-orchestrator boundary is enforced through role-profile placement, not agent willpower.

- **Procedure lives in agent profiles.** The complete Finalization procedure (scripts, bookkeeping, archive, roadmap regen) lives solely in the `contractor` agent profile. The claim + author + adaptive-handoff procedure lives solely in the `workflow-planner` profile. Orchestrator command files (`finalize.md`, `kaola-workflow-adapt.md`) keep only thin dispatch handles — they invoke the contractor or planner subagent and wait for their result; they do not duplicate bookkeeping inline.
- **Main runs dispatch handles, the per-node loop, and the sink.** The main Opus session dispatches subagents and judges their output. It also owns the adaptive per-node lifecycle transactions (`kaola-workflow-adaptive-node.js`, main-direct by design) and the Finalization sink (merge/PR + issue close). These two are explicitly out of attestation scope.
- **Script-side enforcement.** `validate-workflow-contracts.js` text-locks the contractor dispatch handle on all four editions. A contractor-reference removal from an orchestrator command file fails the contract gate.

## Codex Subagent Dispatch (issue #266)

Codex subagent dispatch uses a **native role-dispatch packet**, not a Claude `Agent(subagent_type=..., model=...)` call. When the main Codex session invokes a Kaola subagent, it names the installed agent role and passes a dispatch packet:

- `role` — the installed agent role name (e.g. `workflow-planner`, `contractor`)
- `prompt` — the task prompt
- `cwd` — the working directory
- `expected_cache` — the expected evidence-cache path(s)
- `declared_write_set` — the files this node may write
- `model` — the resolved model, read from the installed `.codex/agents/kaola-workflow/<role>.toml` profile (via `resolve-agent-model`)

Do not present Claude `Agent(...)` call-syntax as the Codex runtime contract.

**No-silent-inline-fallback rule (hard gate):** Before any `subagent-invoked` compliance row is written, `kaola-workflow-codex-preflight.js` MUST return `status:"ok"` (exit 0). A non-ok preflight result is a STOP — the caller records a typed refusal, not an inline execution. There is no silent fallback when role profiles are absent or stale; the preflight gate is the enforcement point for the `delegation_policy: delegate` / `subagent-invoked` contract (see `docs/workflow-state-contract.md` § Workflow State Fields). Specifically:

- `subagent-invoked` — only valid after preflight passes.
- `local-fallback-tool-unavailable` — only valid when subagent tooling is genuinely unavailable (runtime detection, not a silent config-drift shortcut).
- `local-fallback-explicit` — only valid when the user explicitly set `delegation_policy: local-authorized`.

See `docs/api.md` § Codex Harness Scripts for the preflight CLI and typed-refusal shapes.

## Codex Join Protocol — wait budgets, escalation, and writer kill-safety (issue #611)

Dispatching a subagent (Codex `spawn_agent`, or a Claude/forge teammate) does not end at the spawn
call — the orchestrator owns a join/lifecycle discipline for what happens after, so the same
timeout/nudge/reclaim decision is never left to model improvisation:

- **Wait budget.** Every dispatch card carries `dispatch.wait_budget_minutes` (tier-derived —
  `reasoning`→40, `standard`→20, role-default→20 — always a concrete number, never absent). **A
  `running` agent is never interrupted before its wait budget elapses.**
- **Evidence-grounded override.** An optional frozen node override may only extend the effective
  tier floor through 720 minutes. Author it only from concrete issue, command, benchmark, or
  preflight duration evidence, and record the evidence plus expected runtime in the node brief;
  task difficulty alone and an attempt to mask a wedge are not evidence.
- **Escalation ladder, not impatience-kill.** Only after the wait budget expires: (1) demand the
  bounded deliverable now (`followup_task` / an equivalent nudge); (2) after a grace window with no
  response, interrupt (recoverable, not a kill) and ask once more for partial evidence; (3) reclaim
  the node — the documented LAST resort, never the first move.
- **Typed delegation outcomes.** Every delegation records a closed-vocabulary `delegation_outcome`
  in the node's evidence (`completed | returned_partial | interrupted_unresponsive |
  interrupted_obsolete`, absent ⇒ `completed`) — never a free-text "it stalled so I did it myself".
- **Writer kill-safety.** An in-place writer (sharing the parent worktree) is non-interruptible
  before the wait budget and the full escalation ladder — a writer that must be interruptible
  belongs in an isolated `parallel_safe` leg instead. After reclaiming any in-place writer,
  `reconcile-running-set` MUST run and its per-writer verdict (`adopt`/`halt`) MUST be honored
  BEFORE the node is re-opened: a `halt` verdict means the writer's changes could not be confirmed
  clean, and re-opening straight past it is the halt-then-reopen laundering hole this protocol
  closes.

See `docs/plan-run-cards/join-protocol.md` for the full mechanics (long-poll join loop, the exact
`reconcile-running-set` JSON verdict shape, frontier dispatch discipline, and slot awareness) and
`docs/decisions/D-611-01.md` for the design record.

## Testing — Cross-Edition Validation (issue #307)

The repo ships four editions (claude / codex / gitlab / gitea), each with its own validators and walkthroughs wired as a separate `npm` chain: `test:kaola-workflow:claude`, `:codex`, `:gitlab`, `:gitea`. `npm test` runs all four — but **chained with `&&`, so it short-circuits on the first failure**. A red codex/gitlab/gitea chain sitting *behind* a green claude chain is therefore never reached, and a Finalization gate that records only `npm test` (or only the claude walkthrough) can ship a change that broke an edition validator or walkthrough undetected.

- **A cross-edition diff MUST have all four chains green, recorded before Finalization.** "Cross-edition" = the diff touches any of: `plugins/kaola-workflow-{gitlab,gitea}/…`, the codex `validate-kaola-workflow-contracts.js`, or any edition-port script (the forge-renamed `kaola-{gitlab,gitea}-workflow-*.js`, the codex byte-mirrors under `plugins/kaola-workflow/scripts/`, or shared scripts in `COMMON_SCRIPTS` / `BYTE_IDENTICAL_GROUPS`).
- **Recording the four chains: use `npm run test:parallel` (#358), or run them sequentially.** `test:parallel` spawns all four chains concurrently, ALWAYS runs every chain to completion (no `&&` short-circuit), prints a per-chain PASS/FAIL summary plus the failing chain's last-50-line output tail, and exits non-zero iff any chain failed — its summary satisfies the "all four recorded" requirement at a wall-clock of roughly the slowest single chain. The runner sets `TEST_PARALLEL=1` in each chain's environment, which widens the load-sensitive closure-audit hang-probe margins (`probeTimeoutEnv()`, 300ms → 2000ms) so the known `testClosureAuditExecuteLabelRemovalTimeoutBreaks` CPU-contention flake does not trip under concurrency. Ad-hoc concurrent runs WITHOUT `TEST_PARALLEL=1` remain flake-prone — use the runner, not hand-rolled parallelism. `npm test` stays the canonical sequential gate; the sequential invocation is in `CLAUDE.md` § Running Tests.
- **Single-scenario dev loop (#357).** `node scripts/simulate-workflow-walkthrough.js --list` prints the scenario registry (one name per line; ordering-coupled head scenarios carry a `[shared-tmp group]` marker and always run as one unit); `--only <name|prefix>` runs just the matching scenario(s) in seconds — use it to reproduce a single failure instead of re-running the full suite (the full-run sentinel prints only on full runs). The harness is fail-closed and isolated: a missing gh-shim file throws instead of falling through to the real `gh`, `runNode` children get a 120s timeout, a scrubbed `KAOLA_*` env, and global-git-config isolation (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`), and the gitlab/gitea edition runner-of-runners print a delimited `CHILD FAILURE` block (last-30-line stdout/stderr tails) when a child test file fails.
- A claude-only green is **insufficient evidence** for such a diff: surface each chain's exit code, do not infer the other three from `npm test` passing.
- **Edition behavioral coverage (issue #342).** A green forge chain certifies *structure* (registries, forbidden tokens, file existence) — it is **insufficient evidence of forge behavioral parity** unless an edition-level test exercises the feature. A cross-edition feature that adds or changes behavior in a HAND-PORTED edition script (the forge-renamed `kaola-{gitlab,gitea}-workflow-*.js`) MUST add behavioral scenarios to that edition's walkthrough (`simulate-{gitlab,gitea}-workflow-walkthrough.js`) driving the real edition CLI, mirroring the root coverage modulo forge nouns. Byte-synced scripts (the codex mirrors under `plugins/kaola-workflow/scripts/`, enforced by `validate-script-sync.js`) inherit root behavioral coverage and need no duplicate scenarios. A throwaway `$TMPDIR` smoke proves a repair but is not coverage — commit the scenarios (the #328 CR1/CR2 lesson: the gitlab/gitea bundle-finalization half shipped under four green chains because the chains certified structure only).

- **Lifecycle and boundary coverage for frozen dispatch fields.** A field added to `## Nodes` must
  be tested through the real validator and every descriptor/opener that consumes it, durable
  running-set persistence, rolling top-up, and crash reconciliation. Pin exact lower/upper bounds,
  typed refusals, omitted/default resolution, and a legacy-absence control whose descriptor and
  dispatch object remain byte-compatible. Direct builder injection is a unit control, not a
  substitute for an authored-plan lifecycle test.

- **Generated forge aggregator ports — `sync:editions` (issue #365).** The four forge **aggregator** ports (`kaola-{gitlab,gitea}-workflow-{adaptive-node,next-action,commit-node,adaptive-handoff}.js`) are **generated from canonical**, NOT hand-ported: edit the canonical `scripts/kaola-workflow-*.js`, then run `npm run sync:editions` (which also cp's `COMMON_SCRIPTS`→codex and the byte-identical groups across editions). Each generated port carries an `// @generated from scripts/<base>` header — never hand-edit one. `scripts/edition-sync.js --check` (wired into the gitlab + gitea chains) recomputes each port from canonical via the declared rename map and fails the chain on any byte mismatch, so drift in a generated port (the #347 producer-not-ported class) is caught at commit time. These four inherit root behavioral coverage like the codex byte-mirrors; the **data-layer** forge ports (`claim`/`sink-merge`/`sink-pr`/`repair-state`/`active-folders`/`classifier`/`roadmap`/`plan-validator`) stay hand-ported and still require the #342 behavioral scenarios above.

### Hermetic unit-chain fixtures

Unit-chain tests own every remote dependency they can reach. Each forge-facing fixture must provide an explicit local seam for every dependency used by the code under test; an omitted dependency fails locally as an unexpected forge call before the fixture callback runs. Tests run with isolated configuration and executable lookup so an undeclared call cannot fall through to ambient credentials, configured remotes, or a host-installed CLI. Keep this rule forge-neutral: assert the owned dependency contract and deterministic result, not a particular provider's incidental diagnostics.

Behavior that intentionally exercises a real network or installed forge client belongs only in a separately named integration test. It must not be hidden inside a unit chain or used to make the default unit-chain result depend on network availability.

- **Routing / adaptive prose propagates to SIX prose surfaces, not ×4 (issue #400).** Adaptive-path, routing, bundle-lane, or finalize-wiring PROSE lives on **six** surfaces — the three Claude **commands** plus the three Codex **SKILL packs**: (1) `commands/` (github-claude), (2) `plugins/kaola-workflow-gitlab/commands/`, (3) `plugins/kaola-workflow-gitea/commands/`, (4) `plugins/kaola-workflow/skills/` (github-codex), (5) `plugins/kaola-workflow-gitlab/skills/`, (6) `plugins/kaola-workflow-gitea/skills/`. A change landing on only 4 of the 6 (the recurring CHANGELOG **"×4"** wording is the symptom) leaves the two forge-codex SKILL packs as a **propagation dead zone** — exactly how #369 (`--issue-numbers`) and #380 (auto-bundle restructure) shipped reaching the commands + the github-codex SKILL but not the two forge SKILLs. Forge nouns differ per edition (gitlab = MR / `glab` / `kaola-gitlab-workflow-*.js`; gitea = PR / `tea` / `kaola-gitea-workflow-*.js`; the forge contract validators FORBID `plugins/kaola-workflow/scripts`, `\bgh\b`, `/pull request/i` in SKILLs — verify each with `--forbidden-only`). The **route-reachability contract** (`#400`, in all four `validate-*-contracts.js` + `scripts/test-route-reachability.js`) machine-enforces that every schema-emitted route target resolves to an installed surface AND that a mirrored SKILL carries the command's wiring tokens — so a missing-SKILL or hollow-SKILL dead zone reds the chain with the unreachable target named. Adaptive/routing prose changes are a cross-edition diff.

- **Twelve of the six-surface set are GENERATED, not hand-authored (issue #630).** The plan-run and next topics — 3 commands + 3 SKILLs each, 12 surfaces total — render from one canonical skeleton per topic (`templates/routing/plan-run.skeleton.md`, `templates/routing/next.skeleton.md`) plus `templates/routing/slots.js` (frontmatter/H1/setup-resolver/runtime-conditional region content) and `templates/routing/rename-table.js` (forge-noun renames), via `scripts/generate-routing-surfaces.js`. **Never hand-edit those 12 surfaces** — edit the skeleton, a slot, or the rename table, then run `node scripts/generate-routing-surfaces.js --write`. A `--check` byte-compare (the default with no args) is wired into all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains, so a hand-edit that drifts from the generated output reds its own chain — closing the present-but-wrong-prose class the token-pin regime alone could miss on a generated surface. The six **finalize** surfaces are NOT generated — their command/SKILL forms diverge roughly 2:1, so they stay hand-authored, guarded only by the manifest below. `templates/routing/required-blocks.js` is the single-source required-block manifest underlying both: each routing-prose block is declared once with a topic, a `runtime_tag`/`surface_type_tag` pair, and its distinctive content tokens; a derived-universe presence checker in `scripts/test-route-reachability.js` computes each block's obligated surface set from those tags (never a hand-typed file list), so a block structurally cannot obligate a subset of its true surface set — the whole-block-drop class (the #624 finalize-gate-block loss) is closed by construction. The manifest is additive-superset over the pre-existing token pins in `scripts/test-route-reachability.js` and all four `validate-*-contracts.js` — those pins stay.

- **Shared engine `workflow-state.md` field parity (#580 / D-580-01).** Fields that every
  edition's `active-folders` port must parse and surface are declared ONCE in
  `SHARED_STATE_FIELDS` — an `Object.freeze([...])` exported from
  `scripts/kaola-workflow-adaptive-schema.js` (byte-identical ×4 via `validate-script-sync.js`).
  `scripts/test-active-folders-field-parity.js` (wired into all four
  `test:kaola-workflow:{claude,codex,gitlab,gitea}` chains) calls each edition's
  `readActiveFolders` against a sentinel-populated `workflow-state.md` and asserts every
  shared field is surfaced with its sentinel value — a missing field fails the assertion, not
  silently defaults. Adding a new shared field requires: (1) add to `SHARED_STATE_FIELDS`;
  (2) update every edition's `active-folders` port; (3) verify the parity gate is green.
  Per-edition fields (gitlab `mr_*`/`project_id`; gitea `full_name`/`pr_*`) are deliberately
  NOT in `SHARED_STATE_FIELDS` and are not pinned by this gate.

## Planner-owned re-plan epochs and proof discipline (#699 / D-699-01)

A frozen adaptive plan is immutable parent evidence. When direct review repair returns
`repair_requires_replan`, do not edit/re-freeze `workflow-plan.md`, reset the project, establish a
fresh writer baseline over the inherited candidate, or prescribe a replacement DAG from the main
session. The legal recovery is the claim-scoped re-plan transaction:

1. The real `repair-node` call mechanically persists the schema-2 `repair_outcome` envelope as
   `.cache/replan-source.json` before returning `repair_requires_replan`. Never create, patch, or
   substitute this file by hand.
2. `kaola-workflow-replan.js prepare` recomputes the envelope/journal/attempt/evidence/candidate
   digests, proves the attempt is still failed, settled, and unconsumed, then records the parent,
   claim root, candidate/frontier, source hashes, and budget under `scheduler.lock`.
3. `resume` seeds the exact child path and packet, including the pre-dispatch snapshot-authority
   projection, then returns
   `replan_planner_dispatch_required` until a genuine `workflow-planner` dispatch authors and
   attests `workflow-plan.next.md`.
4. Only the re-plan handoff validates/freezes the child. The parent remains authoritative through
   snapshot, and activation rolls forward through its six journaled prefixes.
5. Any crash or intermediate fence resumes through the same `resume` command; ordinary scheduler,
   handoff, repair, archive, and Finalization mutations remain forbidden.

The main orchestrator may pass repository/project, reason, source evidence, bindings, and the exact
child path. It may not pass nodes, roles, dependencies, write sets, cardinality, shape, model, or
build order. The planner profile owns the child DAG. Preserve this boundary in agent-facing prose
without issue/ADR provenance; provenance belongs here, in `CHANGELOG.md`, and in the decision record.

Fresh schema-2 claims must remain in one of two exact epoch-1 forms. `planless` has no plan/snapshot
and `none` for active/Planning Evidence hashes and first-node fields; `planned` has one frozen plan
whose hashes and first-node tuple agree with state and the task mirror. Publish the complete tuple in
one state write—never patch only the hash. Offline mode creates no worktree and no in-place branch,
regardless of the native setting.

Verifying the active (non-transaction) epoch is not a byte comparison. Every prepare/resume/archive/
finalize/watch caller must compose the one shared `verifyCurrentEpochAuthority` result rather than
re-derive a partial check: the authored `Meta`/`Nodes`/`Node Briefs` surface is hash-verified, while
`Node Ledger`, `Required Agent Compliance`, and the task mirror are runtime surfaces that legally
progress after commitment and are parse/consistency-checked instead. Do not add a second, private
authority check to a new caller. For no-history repositories, preserve the exact object-width
zero-commit/canonical-empty-tree root; never invent a path/time/file hash substitute.

Re-plan identity and liveness are claim-scoped. `epoch_lineage_id` derives from the durable claim
identity and claim-root base, never from the plan hash or logical gate. Four CAS seams recompute the
candidate/root/frontier tuple. The focused matrix covers all 12 seam/axis combinations; a mismatch
does not advance the epoch or counter. Two committed
automatic review-driven transitions are allowed; a further attempt consent-halts before dispatch.
One user action may extend the hash-chained ceiling by exactly one slot. The only zero-cost path is
the one-shot typed no-review Case-B exemption: review journal/source authority must be absent, the
parent complete, all four exact schema-2 `diagnosis_complete` artifacts valid, writers limited to
those artifact paths, and child proof/recommendation citations exact. Review-driven outcomes always
count; untyped, repeated, writer-bearing, or missing-citation variants count or refuse.

Every parent epoch snapshot and the complete lineage evidence remain in the final archive, including
the authoritative review journal and every attempt's full `rebind` array. Do not clean an epoch-local
file until its exact snapshot entry is durable and verified; cleanup is manifest-allowlisted and
digest-bound. A child inherits the candidate frontier and G4 certifier obligations, so no new baseline
may hide already-present code or sensitive changes.

Do not conflate the two snapshot digests. A schema-2 child's
`parent_snapshot_manifest_digest` binds the stable pre-dispatch
`snapshot_authority_projection`; the later full manifest separately seals that projection, exact
child/attestation, file index, self-digest, and exact manifest bytes. A historical schema-1 child may
retain `pending` only when every external seal proves `legacy_external_binding`; new schema-2 work
never uses that compatibility branch. The central inventory has exactly 41 base durable-write label
families and five deterministic dynamic suffix forms. Tests lock the inventory and execute every
discovered main-path prefix; do not overstate this as direct failpoint execution of every side-path
label unless a later test proves it.

Verified v1 plans are explicit legacy authority. They may finish as v1 or enter v2 through the sole
compatibility path that proves an immutable legacy root, snapshots exact parent bytes/evidence/rebind
history, and dispatches a fresh planner. Never silently add schema-2 fields to the v1 parent, and
never accept a newly authored missing-schema child as legacy.

Every archive caller uses `archiveSucceeded`: only `archived:true` or idempotent
`skipped:"source-missing"` permits roadmap/remote/claim/worktree/branch/receipt cleanup. A refusal
must leave live authority inspectable. Activation and initial handoff replace the complete Planning
Evidence tuple; `state_planning_evidence_stale_first_node`, hash mismatch, and task-mirror mismatch
are blockers, not fields to hand-edit around.

**Evidence wording is part of correctness.** A structural contract validator proves only the path it
executes. Say exactly what the current focused suites prove and route every still-open write surface
(lifecycle/publication callers, packaged-edition fixtures, pending reviews/falsifiers) to its owning
node rather than folding it into a blanket PASS. Do not upgrade a focused-green result to
cross-edition or terminal-runtime completion, and do not describe a partially repaired defect as
still wholly unrepaired once its owning node's evidence shows otherwise — check the current Node
Ledger and gate evidence before writing a status claim into prose docs, since embedded status text
goes stale the moment the next node closes.

Hosted CI/CD is not a Kaola completion gate and must not be used to waive, replace, or delay the
candidate-bound local transaction tests, all relevant edition validators/walkthroughs, gate-role
reviews, or frozen falsification nodes. The workflow owns its verdict locally even when a hosted
pipeline also exists.

## Adaptive is the Default; Fast/Full are Install-Time Opt-ins (issue #538)

Adaptive is the unconditional default path — there is no on/off switch and no path-selection step.
`fast` and `full` are install-time opt-ins (`--with-fast` / `--with-full`) that become explicit
routing escapes once installed.

**Path legality.** `claimProject` resolves `resolveInstalledPaths(readAdaptiveConfig())` and passes
the result to `isLegalWorkflowPath(requestedPath, installedPaths)`. Adaptive is legal
unconditionally; `fast`/`full` require membership in `installed_paths`. A `KAOLA_PATH` naming a
non-installed path returns a typed `path_not_installed` refusal (`result: refuse`) — never a silent
substitution and never a crash (#44).

**Router is unconditional.** The router (`workflow-next.md` Step 0a-1) contains no Branch A /
Branch B fork. A path-name keyword (`"fast path"` / `"full review"`) or explicit `KAOLA_PATH`
exports the named path and hands it to the claim; the claim's `path_not_installed` is the single
authority. The router does not read `installed_paths` or perform a soft fall-through to adaptive.

**`authoring-allowed` always allows.** `cmdAuthoringAllowed` (the #235 guard called by
`/kaola-workflow-adapt` before authoring a plan) now unconditionally returns
`{ "status": "authoring_allowed", "allowed": true }`. Adaptive authoring is never refused — there
is no switch to be OFF.

**No automatic fallback between paths.** Adaptive never silently downgrades to `fast` or `full`.
Before the first freeze, invalid authoring uses the existing bounded planner-only repair loop. After
freeze, a settled `repair_requires_replan` routes through the claim-preserving planner-owned epoch
transaction: the parent stays immutable, the claim/branch/worktree/candidate survive, and only
`workflow-planner` authors a child. Automatic review-driven replacements are claim-budgeted; budget
exhaustion consent-halts. There is no hidden discard/restart fallback and no main-authored DAG repair.

**Bundle lane.** The bundle lane is adaptive-only; a bundle claim on any other path returns
`bundle_requires_adaptive` (`result: refuse`).

See `docs/decisions/D-538-01.md` for the full decision record (switch-axis flip, legality model,
union re-install, no-fallback, dead-code removal). Supersedes
`docs/decisions/0007-adaptive-default-under-switch-on.md`.

## Bundle Lane — Cross-Edition Requirement (issue #328)

The bundle lane (`--target-issues` / `KAOLA_TARGET_ISSUES` / `issue-scout`) spans all four editions. Any change to bundle-related code — `claimExplicitBundle`, `claimBundle`, bundle state fields, bundle branch naming, bundle finalization, or the `issue-scout` agent file — is a **cross-edition diff** and MUST have all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green before Finalization. The cross-edition validation rules from § Testing — Cross-Edition Validation apply without exception. The bundle lane's edition behavioral coverage lives in the gitlab/gitea walkthroughs (six scenarios each — claim / refusal-rollback / duplicate-block / orient / finalize-roadmap-cleanup / single-issue regression — mirroring `simulate-workflow-walkthrough.js` §#328; added by #342) — keep them in lockstep when bundle behavior changes (see § Testing — Cross-Edition Validation, Edition behavioral coverage).

**Agent-set deltas carry an exact-match registration surface (#340).** Adding or removing an agent profile (root `agents/<name>.md` or a plugin `agents/<name>.toml`) breaks exact-match registries and by-name dispatch registrations that are **keyed on no symbol of the new file** — so a symbol-grep (#306) cannot find them. The full 22-path surface: the three sibling edition profiles; the three `config/agents.toml` codex-dispatch templates (the `[agents.<name>]` table — without it the agent is undispatchable in the codex/gitlab/gitea runtimes even though the profile installs); `validate-vendored-agents.js` (`localAgents` exact listing); `install.sh` **and** `uninstall.sh` `REQUIRED_AGENTS` (a missing uninstall name orphans the installed agent); `resolve-agent-model.js` (×4, byte-identical); the plan-validator `CANONICAL_ROLES` (×4); the gitlab/gitea contract-validator agent counts; and the two forge `test-*-workflow-scripts.js` counts. The adaptive plan validator refuses an addition omitting any of these at freeze (`agent-registration gap`); removals are not machine-detected on the plan side but the derived config↔dir and install↔uninstall parity guards in the contract validators red the affected chain. This is itself a cross-edition diff.

## Forge-Neutral Plugin Agent Profiles (issue #341)

- Plugin agent/command/skill prose is **forge-neutral**: never name a forge-specific CLI
  binary (`gh`/`glab`), a forge brand, or forge-specific request nouns — write "the forge
  CLI" / "the forge". The gitlab/gitea contract validators enforce this (`assertNoForbidden`),
  scanning every plugin command/skill/hook/agent/config file BEFORE any count assertion.
- The plugin role-agent profiles (`plugins/*/agents/*.toml`) are byte-identical mirrors across
  the three plugin editions. The canonical spec for a new agent toml: name no CLI; mirror the
  existing agents' edition-neutral style.
- A forge-touching node verifies its changed files without the full chains (counts may be
  transiently stale mid-run):
  `node plugins/kaola-workflow-{gitlab,gitea}/scripts/validate-kaola-workflow-{gitlab,gitea}-contracts.js --forbidden-only <file>...`

## Generated Reviewer Profiles and Proof Boundaries (#696 / D-696-01)

`code-reviewer` and `adversarial-verifier` are generated-profile exceptions to the ordinary
hand-mirrored agent workflow:

1. Edit `templates/reviewers/behavior-contracts.json` for runtime-neutral behavior or
   `templates/reviewers/runtime-adapters.json` for closed tools/model-policy/evidence-transport data.
   Adapter data must never grow arbitrary prompt, prefix, suffix, or instruction fields.
2. Edit `scripts/generate-reviewer-profiles.js` only when rendering or validation rules change.
3. Run `node scripts/generate-reviewer-profiles.js --write`, then `--check`. Never hand-edit any of
   its three Claude or six Codex outputs.
4. Run `node scripts/test-agent-profile-parity.js` and `node scripts/test-opencode-edition.js`.
   OpenCode must preserve normalized behavior-core bytes and identity after its runtime transform.

`behavior_contract_hash` establishes deterministic runtime-neutral contract equivalence.
`resolved_profile_hash` establishes deterministic complete-render byte identity. Neither hash means
that stochastic models must emit identical findings, explanations, or outcomes. Installer/preflight
checks may claim exact selected-source, installed-file, manifest, and plugin-cache bytes only; they
must not claim proprietary prompt-load attestation without a public runtime introspection contract.
Codex reviewer profiles preserve inherit-by-omission and may not emit top-level `model` or
`model_reasoning_effort`.

## Reviewer Contract V2 Authoring and Local Validation (#693 / #697 / #698)

- Every newly authored adaptive plan declares `plan_schema_version: 2`; do not rewrite a verified
  frozen field-absent/schema-1 plan. Contract, context, receipt, and journal versions must match
  exactly before spawn or state mutation.
- Author the complete schema-2 validation policy and gate metadata. Keep one command authority:
  refine the existing `validation_command` with `validation_cwd`, repetitions, `all` pass rule,
  timeout, and a canonical environment allowlist. Do not introduce a second command field.
- Never infer adversarial mode from a role name, prompt, or desired outcome. The shared
  forward-reachability `deriveGateMode` result is authoritative at every lifecycle seam.
- Keep harness-owned `execution_status` and `gate_effect` out of role evidence. Reviewers emit the
  domain outcome and supplied identities; the harness verifies bindings before findings and derives
  the other axes.
- Execute inherited validation obligations with `kaola-workflow-validation-runner.js` using the
  exact frozen policy, and place canonical receipts in `.cache/validation-vectors/`. Timeout, signal,
  mixed results, candidate mutation, unresolved executable identity, or other incomparability is
  `inconclusive`, never pass.
- Treat `review_scope_expanded` and `review_nonconvergent` as settled typed `replan_required`
  handoffs. Stop the frozen run and surface the packet. This layer must not select a replacement
  writer/topology, thaw the plan, or activate a child epoch.
- Correctness gates are owned and local. Do not add a hosted pipeline as a required plan node,
  completion authority, or Finalization precondition.

**Non-generated agent-profile md↔toml token-pin parity contract (#422, see
`docs/decisions/D-422-01.md`).**
Three-part machine-enforced contract:

1. **`.toml` triple byte-identity** — `validate-script-sync.js` `BYTE_IDENTICAL_GROUPS`
   includes a programmatic entry for every `plugins/kaola-workflow/agents/*.toml` file
   (built via `readdirSync`), covering all 16 base-role profiles.
   Any byte divergence between the three plugin-tree copies of a `.toml` reds the validation
   run. A new profile added to the codex tree is auto-covered.

2. **Feature-token mirroring** — for non-generated roles, `scripts/test-agent-profile-parity.js` enforces that any
   token in the curated `FEATURE_TOKENS` list that is present in an `agents/<name>.md` MUST
   also appear in all three `.toml` twins. Add a token to `FEATURE_TOKENS` only after it is
   GREEN at HEAD (present in both the `.md` and all three `.toml` twins). A drift between the
   `.md` and the twins reds the claude chain and is caught before the four-chain gate.

3. **Chain pinning** — `test-agent-profile-parity.js` is wired into the claude chain and
   pinned by all four `validate-*-contracts.js`, so a missing or renamed guard file reds
   every chain.

**Workflow:** For a non-generated role, mirror a new feature paragraph/token into all three `.toml`
twins first, then pin it in `FEATURE_TOKENS`. For the two generated reviewers, use the canonical
JSON + generator workflow above instead.

**`config/hooks.json` family (#418.1).** The three plugin-tree `config/hooks.json` files
(`plugins/kaola-workflow/`, `plugins/kaola-workflow-gitlab/`, `plugins/kaola-workflow-gitea/`)
are parity-checked by `validate-script-sync.js` `CONFIG_HOOKS_FAMILY` +
`normalizeConfigHooks()`. The files differ only in the forge-renamed compact-resume script
path (`kaola-workflow-codex-compact-resume` → `kaola-{forge}-workflow-codex-compact-resume`);
any other divergence reds the validation run.

## Future-Agent Evidence-Contract Checklist (issue #643 / D-643-01)

Adding a new node-role agent (a fresh `agents/<name>.md` + its plugin `.toml` twins) MUST ship with
BOTH halves of the evidence-recording contract, or the future-agent wall (`validate-vendored-agents.js`'s
`checkFutureAgentWall`) refuses:

1. **A `ROLE_TOKEN_REGISTRY` row** (`scripts/kaola-workflow-plan-validator.js`) naming at least one
   content-bearing evidence token beyond `evidence-binding` — or, for a genuinely single-token role, an
   explicit one-line entry in `PRESENCE_ONLY_RATIONALE` (the allowlist ships empty; every current node
   role reaches the >=2-token floor without one). This registry is the single source for both the
   open-time evidence SEED and the close-time evidence-shape GATE — no second copy to drift.
2. **A role-kind evidence-contract section in the agent file**, whose KIND is derived from the agent's
   own `tools:` front-matter manifest — never a hand-maintained list. `Write`/`Edit` present in the
   manifest ⇒ write-kind: the agent SELF-WRITES its evidence into the seeded `.cache/{node-id}.md`,
   preserving the seeded `evidence-binding:` header verbatim. `Write`/`Edit` absent ⇒ read-kind: the
   agent RETURNS its full deliverable as its final message for the orchestrator to persist via
   `record-evidence --stdin` (which re-injects the `evidence-binding:` header — the agent must never
   add, alter, or strip it itself). An agent file with no parsable `tools:` line at all is refused
   (`agent_contract_manifest_missing`) rather than silently defaulting to the weaker read-kind needle.

Both checks are machine-enforced by `validate-vendored-agents.js` (root) and mirrored `.toml` needle
checks in the codex/gitlab/gitea contract validators — a new node-role addition that omits either half
reds the affected chain before it can ship silently.

## Operator hints on typed refusals (#445 / D-445-01)

Every typed refusal/halt/warn envelope emitted by the three aggregators (`adaptive-node.js`, `commit-node.js`, `plan-validator.js`) carries a top-level `operator_hint: string` field — a one-sentence human-readable remediation hint generated at emit time from a per-aggregator `OPERATOR_HINT_REGISTRY`. The hint is a new optional field; existing consumers that read only `result`/`reason` are unaffected.

**Vocabulary rules (binding for all three aggregators and all four editions):**

- The `write_set_overflow` family (including `write_set_granularity`, `lockfile_write`, `mirror_write`, `count_bump`) MUST reference `revert-overflow` — NEVER `drop-base` (`drop-base` is the laundering anti-pattern locked by D-424-01).
- A crash-repair / reopen-writer hint MUST reference `repair-node` (the anti-laundering primitive that preserves the original baseline).
- NO hint string contains a forge CLI token (`gh` / `glab` / `tea`) — hints name `node scripts/…` workflow commands only; they are forge-neutral and ship byte-aligned in all four editions.

The human channel (`operator_hint`) and the machine channel (`proposed_repair`, D-440-01) name the SAME #424/#434 primitives — one vocabulary, two channels.

## Plan-run skeleton and reference cards (#445 / D-445-01 §4–5)

The adaptive plan-run command surfaces (×6: 3 Claude commands + 3 Codex SKILL packs, per the #400 six-surface rule) are reduced to a ~150-line LOOP SKELETON. Rare-branch prose (resume, governance, repair-routing, reopen-complete-node, frontier-batch) lives ONCE under `docs/plan-run-cards/` and is NOT replicated across the six surfaces.

- **What the skeleton retains resident:** the common path (orient → open → dispatch → record evidence → close-and-advance), the `<!-- PIN: frontier unit -->` anchor followed immediately by the `frontier unit` literal (required by `scripts/test-route-reachability.js` and all four `validate-*-contracts.js`), `--summary` mode consumption (D-446-01), and `<!-- CARD: <name> -->` markers before each rare-branch stub.
- **The cards** live under `docs/plan-run-cards/` and are NOT six-surface-replicated; they are reference material pointed at by the skeleton's card markers:

  | Card | Covers |
  |---|---|
  | `resume.md` | Crash/interrupt resume — `--resume-check`, reconcile-running-set, baseline re-open |
  | `governance.md` | Planner freeze/governance-ack handshake, `governance_ack_stale`, risk-assessment |
  | `repair-routing.md` | `route-findings` consumption (D-446-01), `revert-overflow` / `repair-node` choice, plan-repair via `--freeze` |
  | `reopen-complete-node.md` | Reopening a `complete` writer — `repair-node` vs `reopen-node`, baseline-reuse rules, the reopen-needs-allDone trap |
  | `frontier-batch.md` | Parallel frontier fan-out — the running-set scheduler (`open-ready` / `close-node` / `reconcile-running-set`); default-on disjoint write co-open in isolated legs (D-542-01), serial-degrade only for non-disjoint/uncertain frontiers or hosts without worktree support |
  | `speculative-open.md` | Speculative open (`speculative_open_policy: consent`) — `open-ready --speculative-consent` / `discard-speculative`, read and write graduation |
  | `join-protocol.md` | Wait budgets, long-poll join loop, escalation ladder, writer kill-safety (`reconcile-running-set`), typed `delegation_outcome`, frontier dispatch + slot awareness (#611) |

**Propagation rule:** the skeleton (not the cards) is a six-surface surface and obeys the §Routing / adaptive prose rule above. A change to the skeleton's interactive loop, the `frontier unit` literal, or a `<!-- CARD: -->` or `<!-- PIN: -->` marker is an adaptive-prose change and must propagate to all six surfaces and pass all four chains.

## `.md` files as production surfaces (#424)

`.md` files in the allowband — `docs/**`, `CHANGELOG.md`, `README.md`, `kaola-workflow/{project}/**` — may be declared in a node's `declared_write_set` and pass the `--barrier-check` without requiring explicit declaration beyond the node's write set. `.md` files **outside** this allowband are production surfaces: `agents/*.md`, `commands/*.md`, `plugins/*/agents/*.toml`, and any other `.md` outside the four allowband roots must appear explicitly in the node's write set. The blanket `.md` exemption that existed before #424 is removed; a non-allowband `.md` write not in any node's declared set fails the barrier with `write_set_overflow`.

## Freeze-time write-set hygiene and disjointness (#587)

Three freeze-time authoring checks close blind spots in the write-set grammar and the
cross-node / parallel-group disjointness proof:

- **Glob-token refusal.** A declared write-set token containing a glob metacharacter (`* ? [ ] { }`)
  refuses at freeze (`glob_in_path`), joining the existing directory-shaped / `..` / backslash
  shape refusals. A glob never matches at the exact-path barrier — `**/*.md` used to freeze
  GREEN-disjoint (its `areaForPath` degenerates to a bogus area like `**`) and then died late at
  runtime as `write_set_overflow`; the fix is to expand the glob to the concrete files it stands
  for.
- **Cross-node case-fold.** The exact-path and coarse-area comparisons the freeze-time
  disjointness proof runs across nodes — `classifier.disjointWriteSets` (declared
  `fanout(<group>)` members) and the inferred antichain-sibling exact-clobber check (#232) — now
  case-fold the path/area before comparing. Two parallel legs declaring `Src/x.js` and `src/x.js`
  are the same physical file on a case-insensitive filesystem (macOS, Windows) and now refuse at
  freeze instead of silently clobbering each other's write at runtime. The fold is
  **unconditional** (no policy or consent flag gates it) and cross-node only — it leaves
  `classifier.normalizeRepoPath` case-exact (a global fold would corrupt display/error strings and
  break the case-exact per-node barrier match) and does not change the existing same-node sibling
  `case_collision` check (#388).
- **Parallel-group allowband rule.** The `.md` allowband (`docs/**`, `CHANGELOG.md`, `README.md`
  — see "`.md` files as production surfaces" above) is barrier-invisible: the per-node barrier
  never flags a write inside it, and `git merge` silently both-applies two legs' edits. Freeze now
  requires that allowband be declared on **exactly one leg** of any parallel group — a declared
  fan-out group or an inferred antichain-sibling pair — refusing with `parallel_allowband_collision`
  when 2 or more legs each declare an allowband surface, even different ones (e.g. `CHANGELOG.md`
  on one leg, `README.md` on another). The `kaola-workflow/{project}/**` workflow-state band is
  deliberately excluded (per-node `.cache` evidence legitimately differs per leg). Serial runs are
  unaffected — this is a parallel-group-only freeze check.

See `docs/decisions/D-587-01.md`.

## Write co-open eligibility: exact-path is the granularity of truth (#593)

Write co-open eligibility (the `--parallel-safe` check, `writeOverlapRelaxable` in
`kaola-workflow-plan-validator.js`) now relaxes BOTH `shared-infra` (same infra area) AND
`coarse` (same non-shared top-level area — e.g. two cross-edition antichains both under
`plugins/`) frontiers BY DEFAULT, provided the retained net holds (NET-1: a post-dominating
`code-reviewer` gate over the legs; NET-2: no PROTECTED concrete file in either set) and every
declared entry is EXACTLY-RESOLVABLE (no directory-shaped or glob token — those keep today's
coarse-area refusal, since exact-path disjointness against them is unprovable). Only a genuine
`exact` overlap (the same path, or a case-collision) still serial-degrades, at every tier, with
no flag or policy able to bypass it. `write_overlap_policy` / `--write-overlap-consent` stay
parsed for frozen-plan back-compat but are VESTIGIAL at this seam.

**Consequence for planner surface maps: exact-path is the only granularity that matters.**
Because a shared top-level area no longer forces serialization on its own, a planner's
disjointness proof is only as good as its declared write sets — an area comparison can no
longer paper over an undeclared overlap the way consent-gating implicitly did. A surface map
that omits a **hidden shared surface** two "disjoint" legs both actually touch turns a would-be
`exact` collision into an invisible clobber instead of a correctly-serialized pair. Common
hidden shared surfaces in this repo:

- `package.json` script/chain entries a change must also update (e.g. adding a test file to a
  `test:kaola-workflow:*` chain).
- `scripts/simulate-workflow-walkthrough.js` scenario/needle additions two legs might both touch.
- `install.sh` / `install-*.sh` registration blocks (`SUPPORT_SCRIPT_NAMES`, manifest entries).
- Contract-validator prompt-needle pins (`assertIncludes`/`assertConcept` calls in the
  `validate-*-contracts.js` family) that two legs might both need to add or move.

A planner authoring a parallel-write frontier MUST declare every file each leg actually touches,
including these hidden shared surfaces — not just the "obvious" feature files — so a genuine
overlap on one of them classifies as `exact` (correctly serialized) rather than silently
escaping the disjointness proof because the area-level comparison alone made the pair look
`coarse`-or-better. See `docs/decisions/D-593-01.md`.

## Barrier and write-halt triage payload (#440)

When a `write_set_overflow` barrier failure is raised — either at close time (`barrier_failed`) or via a `write-halt` escalation — the return envelope carries a structured `triage` payload: `{ class, offending paths, proposed_repair?, testDelta? }`. Three mechanical subtypes narrow `write_set_overflow`:

- `lockfile_write` — the overflowing path is a lockfile (e.g. `package-lock.json`).
- `mirror_write` — the overflowing path is a byte-identical mirror target (e.g. a codex-synced script port).
- `count_bump` — the overflowing path contains a validator count assertion affected by the change.

A path matching none of these stays plain `write_set_overflow`. The classification table lives in `kaola-workflow-adaptive-schema.js` (byte-identical across all four editions — never a forge token). The `barrier_failed` close and the `write-halt` escalation carry the SAME `triage` shape; callers classify one structure regardless of channel, never by string-matching the reason field. For the overflow family, `proposed_repair` is a structured `{ kind, node, paths }` object using the #434 sanctioned-repair-primitives vocabulary (`write_set_swap`, `add_to_write_set`, `revert_overflow`, `repair_node`). For `sensitive_write_unreviewed` or `foreign_archive` classes, no `proposed_repair` is offered. The diagnosis is threaded — `write-halt --triage-json <barrierOut>` consumes the `barrierOut` envelope the close already returns; `barrierCheck` in `plan-validator.js` remains the single source of the offending-paths arrays and is never re-run. See `docs/decisions/D-440-01.md`.

## Goal-conditioned bundles — `KAOLA_GOAL` and `goal_check` (#441)

Plans may include an optional `goal: <text>` prose line in `## Meta`. Key properties:

- **Reader-only, no gate** — `parseGoal` reads `^goal:[ \t]*(.*)$` from the `sectionBody('Meta')` region, the same decoy-immune scoping `parseLabels` uses. No validator gate is added; goal-absent plans stay valid and hash-stable.
- **Hash-covered for free** — `computePlanHash` already hashes the entire `## Meta` body, so the `goal:` line is covered with no code change. Tampering the goal after freeze trips `plan_hash_mismatch` on `--resume-check`.
- **Operator entry** — `KAOLA_GOAL` is the operator-side env var for the goal text. Because subagent shells do NOT inherit env vars across the spawn boundary, the goal text ALSO travels in the scout/planner dispatch prompts — the orchestrator owns placing it in both.
- **Scout integration** — the `issue-scout` reads the goal as clustering context and surfaces a `goal_alignment` note in its recommendation. Goal alignment narrows which issues cluster together; it does not relax the D-430-01 bundle-coherence / target-set-integrity guards.
- **Advisory attestation** — `cmdFinalize` in `kaola-workflow-claim.js` writes `goal_check: satisfied|unsatisfied|absent` into the closure receipt. In v1 this is informational metadata only and does NOT block claim or finalize. Flip-to-blocking is deferred to the #429 follow-up. See `docs/decisions/D-441-01.md`.

## Chain receipt is the only valid greenness evidence (#432)

Prose assertions ("chains passed", "npm test is green") are insufficient evidence of test-chain greenness at Finalization. The `--finalize-check` gate is **dual-mode by repo kind (#475)**, auto-detected by whether `package.json` declares any `test:kaola-workflow:*` script.

**Self-host (npm).** The contractor MUST:

1. Run `node scripts/kaola-workflow-run-chains.js --project <P>` to produce `.cache/chain-receipt.json`.
2. Cite the receipt path as evidence in the contractor summary.
3. Never record a `chains_passed: true` prose attestation without the receipt artifact.

**Per-chain kill ceiling and timeout observability (#608).** The `spawnSync`/`spawn` kill ceiling
per chain defaults to 1800000ms (30 min, raised from 900000ms — see `docs/decisions/D-608-01.md`
for the recalibration rationale); `KAOLA_RUN_CHAINS_TIMEOUT_MS` overrides it (invalid/zero/negative
values fall back to the default; no upper clamp). A chain killed by this ceiling now carries
`timed_out: true` in its receipt entry (absent on a receipt written before this field existed ⇒
read as `false`, no reader change required) — the field distinguishes a genuine test failure from
a process still running when the clock ran out, without re-running anything. The plain-text
failure summary labels a timed-out chain inline (`name (TIMEOUT at <N>s — raise
KAOLA_RUN_CHAINS_TIMEOUT_MS or investigate a hang)`), and the `chains_red` operator hint names the
same remedy only when a red chain actually timed out. This is observability text only — the
refuse/pass decision (`redChains.length` check) is unchanged.

The gate enforces this: `chains_unverified` (no receipt), `chains_stale` (receipt headSha mismatch), and `chains_red` (any non-zero exit) are all typed blocking refusals. A known-red chain may be waived with `--accept-known-red name:open-issue-N`; the waiver must reference a real open tracking issue.

**Consumer (non-npm) repos (#475).** A product repo whose validation is not npm-based does NOT run `run-chains.js` (it refuses `chains_config_missing` — self-host-only). The agent **owns verification** (#44) and records `.cache/final-validation.md` with a column-0 `verdict: pass`; `--finalize-check` (consumer mode) gates on it — `final_validation_unverified` (absent) / `final_validation_failed` (no `verdict: pass`). **The verdict must also be bound to the candidate it validated (issue #653 / D-653-01).** Record a column-0 `validated_candidate_hash:` line — produced via `node scripts/kaola-workflow-plan-validator.js <plan> --candidate-hash --json` (read-only, no tests executed), computed LAST after every file the validation covered has landed — or the gate refuses `final_validation_unbound` (no well-formed hash line) / `final_validation_stale` (the recorded hash no longer equals a fresh recompute over the current tree; payload carries `recorded_candidate_hash` + `current_candidate_hash`). The gate compares two hashes only; it never re-runs the validation command, so the agent-owns-verification boundary above is unchanged. A citation of a prior terminal validation run still requires a FRESH hash computed at citation time. The v6.2.0 `kaola-workflow/chains.json` opt-in is retired (Pure option A — no middle-ground). The attribution sweep runs for both modes (an un-attributed code change is still caught).

## Run-gap capture is gated at finalize (#435)

Prose assertions about "no defects found" or "gaps addressed" are insufficient evidence of
run-gap coverage at Finalization. Before Finalization's gap sweep runs, the orchestrator seeds
any run gap it directly observed but the automated scanners cannot see (transient tool noise, a
manual retry, an environmental flake) by appending a `gap: <class> — <text>` line to
`.cache/run-gaps-manual.md` (issue #653 / D-653-01) — the reverse-containment check in step 3
below refuses a `## Run gaps` entry with no matching seeded or scanned source.

The contractor MUST:

1. Run `node scripts/kaola-workflow-gap-sweep.js --project <P> --json` to produce
   `.cache/run-gaps.json`. The scanner reads only `kaola-workflow/<P>/.cache/` (scope guard —
   no archive bleed). It sweeps three machine-reliable signal sources: `provenance-log.jsonl`
   (nodeIds with more than one `open` event = `in_run_repair`), `chain-receipt.json`
   (`accepted_red:true` entries = `deferred_red_chain`), and the optional
   `.cache/run-gaps-manual.md` (`gap: <class> — <text>` lines = `manual:<slug>`). Items are
   deduplicated by `(reasonClass, sample)`.
2. Populate the `## Run gaps` section of `finalization-summary.md` — one line per swept
   `(reasonClass, sample)` tuple — in exactly one of two forms:
   - `- <reasonClass> (<sample>): filed: #N` — gap tracked by an open issue.
   - `- <reasonClass> (<sample>): noise: <one-line justification>` — gap justified as not
     worth tracking.
3. Run `node scripts/kaola-workflow-gap-sweep.js --project <P> --check` as the gate. It checks
   BOTH directions (issue #653 / D-653-01): a swept-but-unmapped tuple refuses `gaps_unswept`
   (forward, unchanged — `{ result: 'refuse', reason: 'gaps_unswept', unmapped: [{reasonClass,
   sample}] }`); a `## Run gaps` entry matching the strict `- <class> (<sample>): filed:|noise:
   ...` grammar with no matching seeded/scanned source refuses `observed_gap_unseeded`
   (`unseeded: [{reasonClass, sample}]`, reverse — new). A vacuous pass now requires BOTH sides
   empty — no swept classes AND no strict-grammar `## Run gaps` entries; free-text lines that
   don't match the grammar (e.g. `- none`) are ignored by design, preserving back-compat with
   existing summaries. Either refusal exits 1 and blocks finalization until resolved.
4. Cite the gate exit code as evidence in the contractor summary. Never record a
   `gaps_addressed: true` prose attestation without a passing `--check` invocation.

The `--check` gate is the ONLY valid run-gap evidence; classify its result structurally by the
typed `reason` field (`gaps_unswept`, `observed_gap_unseeded`), never by string-matching error
text.

Decision records: `docs/decisions/D-435-01.md`, `docs/decisions/D-653-01.md`.

## Release

- **Pre-tag release gate (issue #651, D-651-01).** Before creating the release tag, run the check-only,
  plan-independent pre-tag gate: `node scripts/kaola-workflow-plan-validator.js --release-check
  [--json] [--candidate <sha>] [--receipt <path>]`. It reads only `.cache/chain-receipt.json`
  (git-toplevel default, overridable via `--receipt`), local git, and `package.json` (to resolve
  the expected `test:kaola-workflow:*` chain set) — no CI/CD or forge calls — and refuses with a
  typed `reason` unless the receipt is a clean-stamped, all-green, UNWAIVED receipt COVERING
  every declared chain, whose `headSha` STRICTLY equals the release-candidate commit (default
  `HEAD`; `--candidate` for an explicit commit — the #547 `codeTreeHash` freshness relaxation
  used at adaptive finalize is deliberately NOT applied here; a release tag names an exact
  commit). A red, missing, stale, incomplete, waived, or unresolvable-chain-set receipt is a
  typed refusal, never a judgment call: `chains_unverified` (no/unparseable receipt) >
  `chains_stale` (`headSha` unbound/mismatched, or the receipt stamped over a dirty worktree —
  with hint-only `stale_paths`/`stale_kind` culprit diagnostics on a sha mismatch) >
  `chains_empty` (zero chains recorded) > `repo_kind_undetermined` (the expected chain set
  cannot be resolved from `package.json` — fails CLOSED, never treated as a vacuous pass) >
  `chains_incomplete` (the receipt is a legitimate but partial subset — e.g. a
  `run-chains.js --chains claude` receipt — missing one or more declared chains; refuse carries
  structural `missingChains`/`expectedChains`) > `chains_red` (an unwaived red chain) >
  `chains_waived` (ANY `accepted_red` chain — legal at adaptive finalize, never for a release
  tag). Only a typed `pass` envelope
  (`{result:'pass', mode:'release-check', candidate, chains:[...]}`) clears the gate. See
  `docs/api.md` for the full envelope shapes and `docs/decisions/D-651-01.md` for the design.
- **Working sequence:** `--prepare` → one release-only commit →
  `KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-run-chains.js` at the bump commit
  (OFFLINE both skips the tag-existence check that would otherwise fail before the tag exists,
  and lets the chains stamp `headSha` at the candidate with no tag needed yet) →
  `--release-check` passes → `--tag` → online post-tag validation → push the named tag → publish.
- Push only the named tag before creating the forge release. The release tooling emits neutral
  guidance; no external pipeline or forge service participates in the release gate.
- **Release-commit hygiene (issue #651).** A release/tag commit is version bump + release docs
  only — `package.json`, the Codex/Claude-plugin manifests, `CHANGELOG.md`, and the README
  release-version lines — never unrelated behavior-changing code. Bundling more (as happened at
  `kaola-workflow--v6.21.3`, tagged with a red Claude chain and zero receipt because a breaking
  change rode along under an unrelated commit subject) invalidates whatever receipt was checked:
  the receipt's `headSha` no longer names the tree the tag actually covers. Anything beyond
  version bump + release docs re-runs the whole sequence above — regenerate the receipt at the
  new candidate, re-pass `--release-check`, re-tag.

### Release cutting (kaola-workflow-release.js)

`scripts/kaola-workflow-release.js` is a maintainer aggregator with typed JSON envelopes.
The state machine is `unprepared → prepared → committed candidate → chain-authorized → tagged`.
Preparation and tagging are separate trust transitions; neither a prepared worktree nor a green
receipt alone authorizes a ref mutation.

- **`--verify`** — read-only pre-release check. Derives the closed-issue set by combining git-log commit messages since the last `kaola-workflow--v*` tag with every `#N` mention in the `[Unreleased]` CHANGELOG section, then cross-checks them. When the forge is reachable the check confirms referenced issues are actually closed; when offline the receipt carries `verification: "offline"` — a silent pass is never permitted. Changelog refs that cannot be accounted for produce a typed refusal: `{ result: "refuse", reason: "changelog_incomplete", missing: [N, ...] }`. Greenness is read from `.cache/chain-receipt.json`; `--verify` surfaces chain warnings but does not authorize a tag. The later `--release-check` and `--tag` gates require strict green candidate-bound evidence.
- **`--prepare --version X.Y.Z [--codex-version A.B.C]`** — requires a clean tracked
  worktree and monotonic root version. The three Codex manifests must share a baseline, but Codex
  remains an independent version axis: derive the same SemVer bump kind from its own baseline, or
  set an explicit monotonic Codex version. A proven empty root-tag history permits only the explicit
  bootstrap. Preparation changes exactly this allowlist: `CHANGELOG.md`, `README.md`, `package.json`,
  the three `.codex-plugin/plugin.json` manifests, and the GitLab/Gitea
  `.claude-plugin/plugin.json` manifests. It creates no tag.
- **Prepare receipt and resume boundary.** `.cache/release-receipt.jsonl` begins with one
  version-scoped `prepare_binding`, records exactly one completion row for each allowlisted file,
  and ends preparation with one `prepared` row containing root/Codex versions, baseline SHA, date,
  ordered file hashes, `candidateSha:null`, and `authorized:false`. A crash resumes only missing
  steps for the same binding. An identical completed prepare is idempotent; another version,
  duplicate/foreign rows, inconsistent fields, or changed prepared bytes refuses. Git fact probes
  fail closed before preparation mutation. Starting the next release's `--prepare` requires first
  deleting `.cache/release-receipt.jsonl` (and the stale `.cache/chain-receipt.json`), because a
  completed `prepared` row for a prior version makes the next `--prepare` refuse
  `stale_release_receipt`.
- **Release-only candidate.** Commit exactly the eight allowlisted paths as exactly one commit from
  the recorded baseline. Renames, deletions, additions, unrelated files, empty/extra commits, or a
  committed receipt refuse `candidate_surface_mismatch`.
- **`--tag --version X.Y.Z`** — requires a clean tracked worktree, coherent prepare receipt,
  exact candidate provenance and bytes, and a nonempty receipt covering every declared edition chain.
  The chain receipt must be clean-stamped, unwaived, all green, and have `headSha` exactly equal to
  candidate HEAD. Authorization and completion rows bind version, independent Codex version,
  ordered prepared surface, candidate SHA, chain HEAD, and tag name. Tag creation is an atomic
  zero-old ref update at candidate HEAD. The command then resolves the tag and reads every prepared
  file from the tag tree as raw bytes; a newly-created tag is compare-deleted if verification fails.
  A completed rerun succeeds idempotently only when both receipt rows, live tag, candidate, current
  chain receipt, and tag tree still agree. Git probe ambiguity is always a typed refusal.
- **`--cut`** — compatibility-only refusal. It never prepares, authorizes, or tags; its
  `cut_compatibility_refusal` envelope returns the executable replacement sequence.
- **`--push`** — emits forge-neutral operator guidance for pushing the local tag and running the forge `release-create --latest` command. The script itself performs no remote mutation and invokes no forge CLI binary; publication remains a manual or forge-specific step.

**Relationship to `--release-check`.** `--tag` performs its own strict local receipt checks, while
the existing plan-independent validator gate remains a separate mandatory step and stable external
contract. Run it after the candidate-bound offline receipt and before `--tag`; do not infer its pass
from prepare or from tag's checks. It does not read a workflow plan and does not call an external
pipeline.

**Registration surface:** `kaola-workflow-release.js` is registered in `COMMON_SCRIPTS` (so the canonical-to-codex byte-mirror is enforced by `validate-script-sync.js`) and in the rename-normalized forge-ports family, but **NOT** in the install-manifest `SUPPORT_SCRIPT_NAMES` block. It is a maintainer/dev tool on the same operational profile as `release-surface-drift.js` (D-442-01 §6). If a chain goes red demanding manifest registration, stop and surface it rather than silently widening SUPPORT_SCRIPTS.

## Provenance stays out of agent-facing prompts (#575)

Design-rationale provenance — issue refs, decision IDs, invariant tags, ADR citations — must not appear in the agent-facing prompt surfaces. It is dispatch-time noise: it bloats context, ages without visible decay, and conveys no actionable rule to the running agent.

### What counts as a prompt surface

The full set across all four editions (claude / codex / gitlab / gitea) plus the opencode runtime edition:

- **Agent definitions** — `agents/*.md` (root), `plugins/*/agents/*.toml` (all three plugin editions), opencode `agents/*.md` (generated from canonical)
- **Commands** — `commands/*.md` (github-claude), `plugins/kaola-workflow-gitlab/commands/`, `plugins/kaola-workflow-gitea/commands/`, Codex `skills/kaola-workflow-*/SKILL.md` (including the two forge-codex SKILL packs), opencode generated command mirrors
- **Skills** — `plugins/*/skills/*/SKILL.md` across all three plugin editions

The six routing surfaces from §Routing / adaptive prose (#400) are a subset of this set.

### Banned token classes

Remove any of the following when they appear in a prompt surface:

| Class | Pattern examples |
|---|---|
| Issue refs | `#NNN` (e.g. `#472`, `(#307)`) |
| Decision IDs | `D-NNN-NN` (e.g. `D-542-01`, `D-430-01`) |
| Invariant tags | `[INV-NN]` (e.g. `[INV-01]`) |
| ADR citations | `ADR-NNNN`, `ADR NNNN` (hyphen or space form, e.g. `ADR-0008`, `ADR 0004`) |
| Forge request refs | `PR#NNN`, `MR#NNN`, `AC#NNN` |
| Defect/pattern clauses | Whole prose clauses whose only function is to record the history of a past defect or anti-pattern, with no operative rule content surviving removal |

Parenthetical issue refs inside an otherwise-operative rule sentence are the most common case: `(#NNN)` can almost always be dropped with no loss of rule meaning.

### Allowlist — these are NOT provenance

The following forms are runtime identifiers or structural placeholders, not design-rationale provenance, and MAY appear in prompt surfaces:

- **Runtime target-issue variables:** `KAOLA_TARGET_ISSUE=N`, `KAOLA_TARGET_ISSUES`, `"work on issue N"`, `"issue N"`, `Closes #<issue>` in commit-message instructions
- **Numeric placeholders** in angle-bracket or letter-only shorthand: `#N`, `#<issue>`, `#<n>` — placeholder forms that contain no digit-only sequence after `#` and therefore do not match the machine guard
- **Audit/gate short-labels** used in output schemas or gate tables: `G1`, `G3`, `H5`, `AC7`, `M4` — letter-digit labels that match no banned arm of the guard
- **Illustrative user-command examples** must use placeholder form (e.g. `"work on #<N>"`, `"fix #<issue>"`) — examples with actual issue numbers (e.g. `"work on #42"`) match the `#\d{1,4}` arm of the machine guard and are not allowed in prompt surfaces

### Where provenance belongs

| Surface | Purpose |
|---|---|
| `CHANGELOG.md` | User-visible record of what changed and why, including issue refs |
| `docs/decisions/D-NNN-NN.md` | Full decision record: context, decision, consequences, alternatives |
| Git commit messages | Traceability link from code change to issue/decision |
| `docs/conventions.md` (this file) | Durable policy rules — may cite issues and decision records by number |
| `CLAUDE.md` | Concise rule stubs — may reference this file by path |

### Enforcement

The provenance ban is **machine-enforced** by a `PROVENANCE_BAN` guard wired into all five contract validators and the additive opencode test suite (#576, `docs/decisions/D-576-01.md`).

**Banlist regex:**

```
/#\d{1,4}|D-\d{3}-\d{2}|\bINV-\d+|ADR[ -]\d{2,4}|\b(?:PR|MR|AC)#\d+/
```

The guard scans agent-facing prompt surfaces — agent definitions, commands, skills, `.toml` profiles, and the regenerated opencode mirrors — and fails with a `file:line` + offending token diagnostic pointing back at `docs/conventions.md`.

**Per-edition surface placement:**

| Validator | Surfaces scanned |
|---|---|
| `validate-kaola-workflow-contracts.js` (claude) | `agents/*.md`, `commands/*.md`; byte-mirrored to the codex copy |
| `validate-kaola-workflow-contracts.js` (codex) | `plugins/kaola-workflow/agents/*.toml`, `plugins/kaola-workflow/skills/` |
| `validate-kaola-workflow-gitlab-contracts.js` | `plugins/kaola-workflow-gitlab/` agents, commands, skills |
| `validate-kaola-workflow-gitea-contracts.js` | `plugins/kaola-workflow-gitea/` agents, commands, skills |
| `scripts/test-opencode-edition.js` (opencode, assertion A25) | Regenerated `.opencode/` agent and command mirrors |

The guard runs in all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains and in the additive opencode suite. A violation is a hard chain failure; the error message names the offending `file:line` and token.

See `docs/decisions/D-575-01.md` for the convention adopted in #575 (enforcement then deferred) and `docs/decisions/D-576-01.md` for the #576 guard implementation that supersedes that deferred note.

## Co-Tenant Lane Convention and Clean-Check Selectivity (#579)

Multiple sessions can operate on the same repository checkout simultaneously (e.g. an adaptive
worktree run alongside a manual claim on the main checkout). The lane classification and
clean-check selectivity rules govern how each session respects the other's in-progress state.

### Lane classification

`classifyLane(lane, ctx)` (exported from `scripts/kaola-workflow-classifier.js`) partitions each
active-folder lane into one of four buckets. The classifier is a pure function; `ctx.now` and
`ctx.staleMs` are injectable for testing. Precedence ladder — first match wins:

1. `lane.session_marker === ctx.ownSession` → **`mine`** (this lane belongs to the current session).
2. `ctx.explicitResumeIssues` intersects this lane's issue(s) → **`stale`** (explicit resume
   instruction adopts the lane as resumable, overriding a fresh marker).
3. `ctx.coTenantSignal` (`KAOLA_COTENANT=1`) → **`live`** (blanket signal that another session is
   active; leave the lane alone).
4. Liveness heuristic — `claim_ts` present and age < `LANE_STALENESS_MS` → **`ambiguous`** (ask
   before overwriting); otherwise → **`stale`** (old leftover or pre-#579 markerless folder).

`LANE_STALENESS_MS = 86400000` (24 hours) is the single staleness constant exported from
`kaola-workflow-adaptive-schema.js`. The value is conservative: a run completes well within a
day, so a marker newer than 24 hours could be an active co-tenant.

**Resume behavior:** `cmdResume` excludes `live` lanes from the resume candidate set. `stale` and
`mine` lanes are resumable. An `ambiguous` lane (or more than one resumable candidate) triggers
the existing `resume_ambiguous` refusal — prompt the user before overwriting.

### Clean-check selectivity

The clean-worktree gates in `sink-merge.js` (`assertCleanWorktree`, `assertWorktreeClean`) and
`claim.js` (`treeDirty`) apply a parked-lane filter AFTER the existing probe-fault / catch-dirty /
`--untracked-files` handling. The filter exempts only non-owned co-tenant scratch so real
uncommitted code and own in-progress state still fail the gate.

**`PARKED_LANE_PREFIXES`** (exported from `kaola-workflow-adaptive-schema.js`):

```
['kaola-workflow/', '.kw/worktrees/', '.kw/legs/']
```

**`isParkedLanePath(relPath, ownedProjects)`** returns `true` (exempt) only when all three
conditions hold:

1. `relPath` starts with one of `PARKED_LANE_PREFIXES`.
2. The second path segment is project-shaped (not `.roadmap`, not `archive`, not a
   dot-leading name, not the top-level files `ROADMAP.md` or `config.json`).
3. That segment is **not** in `ownedProjects` (the current session's own project(s)).

Everything else — real code under `src/`/`scripts/`/`docs/`, shared durable state
(`kaola-workflow/.roadmap/`, `ROADMAP.md`, `config.json`, `archive/`), and own `<project>/`
folders — returns `false` and still fails the dirty check.

**Fail-closed invariant.** An unverifiable tree (probe fault, exception, or stderr from the
`git status` call) is always treated as dirty — the parked filter narrows which KNOWN-CLEAN
states pass, never relaxes the unverifiable-is-dirty posture.

**Merge protocol unchanged.** `ffMergeLoop` and the true-conflict halt in `sink-merge.js` are
byte-unchanged. `assertCleanWorktree`/`assertWorktreeClean` run BEFORE `ffMergeLoop`, so the
looser non-owned exemption cannot affect conflict resolution. Each lane cleans its own branch,
worktree, and active folder ONLY after its own merge lands; it does not clean other lanes.

See `docs/decisions/D-579-01.md` for the full decision record.

## Main-session-gate write fence and upstream instrumentation provisioning (#607)

A `main-session-gate` is read-only by grammar and non-delegable — it never authors or deletes
files. Two conventions enforce and preserve that boundary at runtime:

**Gate-window fence.** While a `main-session-gate` node is open, an in-worktree, out-of-band
`Write`/`Edit` is denied by default (`hooks/kaola-workflow-write-lane.sh` rule (c), exit 2) — the
workflow bands, the `.kw/` band, member worktrees, and a co-open writer's own declared lane stay
legal. The opt-out is `KAOLA_GATE_WINDOW_FENCE=0` (or `false`/`no`); any other value keeps the
fence ON. **A crash mid-gate intentionally leaves the fence active** until the run resumes and
closes the gate: `reconcile-running-set` preserves a lone, non-`opening` gate entry rather than
clearing it, so every in-worktree product write stays fenced repo-wide across the crash window.
This is a deliberate fail-closed tripwire, not a bug — recovery is resuming the run (which closes
the gate normally) or, for a genuinely abandoned run, the manual `KAOLA_GATE_WINDOW_FENCE=0`
opt-out. See `docs/decisions/D-607-01.md`.

**Upstream instrumentation provisioning.** Any instrumentation a gate's acceptance check needs (a
probe script, build wiring to make a probe runnable) is authored by an UPSTREAM WRITER node,
inside that node's own declared write set — never by the gate. The plan states the durability
decision for that instrumentation explicitly: durable (committed and kept), env-gated (kept but
inert without a flag), or ephemeral (a named downstream node owns its deletion). Out-of-repo
scratch (a temp dir, the scratchpad) remains legal for the gate's own transient use and is not
"instrumentation" in this sense. The gate's `.cache` evidence must attest this with a column-0
`instrumentation: none | <node-id>` token — `none` when the gate ran no in-worktree
instrumentation, or the id of the upstream writer node that authored what it did run; the named
node must exist in the ledger as a writer (non-empty declared write set). Absence of the token is
refused alongside the existing missing-verdict shape check.

## First Principles axiom layer (#645)

`templates/axioms.md` is the single canonical source for the workflow's five tie-breaking axioms
(correct first; then save human time; then spend as little as possible; machines decide facts,
humans decide values; own your own verdicts). It reaches consumers by EMBEDDING byte-identically
into the six workflow-init CLAUDE.md-template surfaces — never per-edition copies, since
`templates/` has no runtime `require()` consumer and the `BYTE_IDENTICAL_GROUPS` mechanism is built
for that case, not this one. The drift guard is a `simulate-workflow-walkthrough.js` scenario,
`testAxiomBlockByteIdentity`, comparing the canonical file's trimmed content against each of the six
embeds. A short reference pointer (not the full block) is separately required on the six generated
`next` routing surfaces via a `required-blocks.js` entry, `nx-first-principles`.

**Tie-breaker protocol.** Axioms apply only when no shipped rule, gate, or refusal already resolves
a situation — walk them in priority order and record an OPTIONAL one-line derivation in the node's
`.cache` evidence; its absence never blocks a gate (it is never wired into any evidence-shape
check).

**Tighten-only boundary (hard).** An axiom may only make an agent stricter, never looser — never
cite an axiom to justify skipping a typed gate, refusal, or barrier. A rule that would loosen an
existing gate belongs in the gate itself, with its own review, not as an axiom appeal.

See `docs/decisions/D-645-01.md`.

## Issue-scout higher-profile model tier (#646)

`issue-scout` has a `agents/profiles/higher/issue-scout.md` file (`model: opus`) alongside the base
`agents/issue-scout.md` (`model: sonnet`), following the same higher/common tier shape as
`code-reviewer`/`security-reviewer`. `ISSUE_SCOUT_MODEL` is wired into `install.sh`'s
`model_for_placeholder` case and `render_command_file`'s `placeholders` array — both entries land
together in the same change, never partially: a partial land (either list without the other)
reproduces a historical unrendered-placeholder regression, where the token survived install with no
case to resolve it. The rendered placeholder is COMMAND-surface-only (the three `workflow-next`
commands) — Codex SKILL packs keep prose-only scout dispatch, matching the model-less
`issue-scout.toml` twins across all three plugin editions; a shared-body placeholder would leak
into the skills. `DEFAULT_AGENT_MODELS['issue-scout']` and `REASONING_FLOOR_ROLES` are unaffected —
a higher-profile lever raises quality, it never lowers the reasoning floor.

See `docs/decisions/D-646-01.md`.
