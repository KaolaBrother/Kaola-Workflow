# Conventions

Document coding style, testing rules, Git practices, naming, and review expectations.

**The workflow itself is the mission list; `docs/decisions/0017-the-mission-list.md` is its design
record.** Nothing here restates it. These are the rules for building, testing, and releasing *this
repository* and the surfaces it ships.

## Orchestration seam

The orchestrator dispatches subagents, judges what comes back, and runs the finalize transaction
itself. There is no bookkeeping role and no mandatory planning agent — the run's coordination state
is `kaola-workflow/{project}/mission-list.md`, written by whoever is orchestrating. The vendored role
agents are dispatchable tools reached for by name at the moment they are needed, never pre-assigned
to a schedule.

`validate-workflow-contracts.js` and the three edition twins lock the finalize seam in BOTH
directions: a re-introduced bookkeeping-role dispatch on any finalize surface fails the contract
gate, and so does a dropped one-call transaction.

**Execution mode is orchestrator judgment.** Dispatch-vs-inline is a per-item economic call the
orchestrator makes with its own judgment; delegating discretionary production is the default because
a handoff costs once while inline residue taxes every later decision. Nothing attaches to that
choice — no justifier, no evidence line, no approval, no checker. Three shapes are out of bounds
because each recreates the regulation this project subtracted: a **dispatch mandate** (prose making
dispatch the only sanctioned mode), a **justifier** (a reason token owed *because* a unit ran
inline), and an **approval gate on the choice**. What still binds is narrower and role-scoped: a
review gate reviewing its own writer-context is no gate, so route that to the user rather than
self-issuing a pass; and a genuinely absent dispatch tool still records
`local-fallback-tool-unavailable`, which keeps only its literal meaning.

## Codex Subagent Dispatch (issue #266)

The #925 model-routing policy lives only in the live Codex `kaola-workflow-next` and
`kaola-workflow-finalize` dispatch instructions. `kaola-workflow-init` does not render it into
initialized shared repository guidance, which remains runtime-neutral.

Codex subagent dispatch uses a **native role-dispatch packet**, not a Claude
`Agent(subagent_type=..., model=...)` call. When the main Codex session invokes a Kaola subagent, it
names the installed agent role and passes a dispatch packet:

- `role` — the installed agent role name (e.g. `code-reviewer`, `implementer`)
- `prompt` — the task prompt
- `cwd` — the working directory
- `model` / `reasoning_effort` — selected from the role's existing tier for this spawn; the
  live per-tier pair is authored as typed literals in the dispatch-routing pin of
  `templates/routing/next.skeleton.md` and `finalize.skeleton.md`, which is what ships to the Codex
  next/finalize SKILLs. `test-route-reachability.js` independently states both complete expected
  pairs and binds every shipped surface to them. The `CODEX_STANDARD_*`/`CODEX_REASONING_*`
  preflight constants remain historical stale-profile migration values, not dispatch authority;
  `validate-kaola-workflow-contracts.js` cross-binds those migration values to the installer copies
  and separately asserts the live README pairs

The mapping is fixed for every spawn. A role always uses its tier pair (standard, reasoning, or
heavy); task breadth, latency, prior outcomes, and risk do not create an escalation or any other
model/reasoning exception, except the one reviewer-class heavy re-dispatch carve-out. The Codex
pairs are standard `gpt-5.6-luna` / `max`, reasoning `gpt-5.6-sol` / `medium`, and heavy
`gpt-5.6-sol` / `high`; reviewers rest at reasoning and use heavy only for that bounded re-dispatch.

Do not present Claude `Agent(...)` call-syntax as the Codex runtime contract.

**Codex readiness boundary:** `install-codex-agent-profiles.js` owns installation and upgrade proof.
It exits successfully only after source/profile validation, safe writes and pruning, manifest and
hook installation, and post-install verification succeed. The `next` and `finalize` Codex skills do
not invoke `kaola-workflow-codex-preflight.js`, parse or autofix its output, or make profile/config
freshness a workflow entry, resume, or dispatch verdict. `local-fallback-tool-unavailable` retains
only its literal meaning: the runtime dispatch tool is genuinely unavailable.

`kaola-workflow-codex-preflight.js --doctor` is an explicit, user-invoked diagnostic, never an
ordinary session gate. It merges the persisted transport/posture fields it owns from HOME through
every trusted repository-root-to-cwd `.codex/config.toml`, with explicitly present higher fields
winning and the winning unsafe path retained for diagnosis. Profile provenance is separate: a
global profile set is eligible only when no project layer has a Kaola footprint; otherwise the
project authority and exact managed role block must pass. A project Kaola footprint is loadable
only when the most-specific matching absolute `[projects."..."]` entry in global config says
`trust_level = "trusted"`;
unknown/untrusted footprints stop as `project_trust_required` because Codex ignores those project
layers. Any outside-marker `agents` declaration in any loaded project layer is unsafe. This
diagnostic cannot see ephemeral Codex `--profile` or `-c` launch overrides, so its persisted
filesystem result must not be described as proof of those per-process settings.

See `docs/api.md` § Installation and edition sync for the explicit doctor boundary.

## Joining a dispatch

Dispatching a subagent does not end at the spawn call, but nothing prescribes the join: how long to
wait, when to nudge, when to interrupt, and when to re-dispatch are the orchestrator's judgment,
made against the `dispatched` locator recorded in the mission list. **Look for the work, not for the
worker** — if the output the dispatch promised has landed, close the item; if it has not,
re-dispatch unless the dispatch is positively still alive.

One thing worth knowing rather than rediscovering: an in-place writer sharing the parent worktree
writes into the tree everything else is reading, so interrupting one leaves half-written work with
no owner. A writer that must be interruptible belongs in its own worktree, where an interrupt
discards the leg atomically.

## Testing — Cross-Edition Validation (issue #307)

The repo ships four editions (claude / codex / gitlab / gitea), each with its own validators and walkthroughs wired as a separate `npm` chain: `test:kaola-workflow:claude`, `:codex`, `:gitlab`, `:gitea`. `npm test` runs all four — but **chained with `&&`, so it short-circuits on the first failure**. A red codex/gitlab/gitea chain sitting *behind* a green claude chain is therefore never reached, and a Finalization gate that records only `npm test` (or only the claude walkthrough) can ship a change that broke an edition validator or walkthrough undetected.

- **A cross-edition diff MUST have all four chains green, recorded before Finalization.** "Cross-edition" = the diff touches any of: `plugins/kaola-workflow-{gitlab,gitea}/…`, the codex `validate-kaola-workflow-contracts.js`, or any edition-port script (the forge-renamed `kaola-{gitlab,gitea}-workflow-*.js`, the codex byte-mirrors under `plugins/kaola-workflow/scripts/`, or shared scripts in `COMMON_SCRIPTS` / `BYTE_IDENTICAL_GROUPS`).
- **Recording the four chains: use `npm run test:parallel` (#358), or run them sequentially.** `test:parallel` spawns all four chains concurrently, ALWAYS runs every chain to completion (no `&&` short-circuit), prints a per-chain PASS/FAIL summary plus the failing chain's last-50-line output tail, and exits non-zero iff any chain failed — its summary satisfies the "all four recorded" requirement at a wall-clock of roughly the slowest single chain. The runner sets `TEST_PARALLEL=1` in each chain's environment, which widens the load-sensitive closure-audit hang-probe margins (`probeTimeoutEnv()`, 300ms → 2000ms) so the known `testClosureAuditExecuteLabelRemovalTimeoutBreaks` CPU-contention flake does not trip under concurrency. Ad-hoc concurrent runs WITHOUT `TEST_PARALLEL=1` remain flake-prone — use the runner, not hand-rolled parallelism. `npm test` stays the canonical sequential gate; the sequential invocation is in `CLAUDE.md` § Running Tests.
- **Single-scenario dev loop (#357).** `node scripts/simulate-workflow-walkthrough.js --list` prints the scenario registry (one name per line; ordering-coupled head scenarios carry a `[shared-tmp group]` marker and always run as one unit); `--only <name|prefix>` runs just the matching scenario(s) in seconds — use it to reproduce a single failure instead of re-running the full suite (the full-run sentinel prints only on full runs). The harness is fail-closed and isolated: a missing gh-shim file throws instead of falling through to the real `gh`, `runNode` children get a 120s timeout, a scrubbed `KAOLA_*` env, and global-git-config isolation (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`), and the gitlab/gitea edition runner-of-runners print a delimited `CHILD FAILURE` block (last-30-line stdout/stderr tails) when a child test file fails.
- A claude-only green is **insufficient evidence** for such a diff: surface each chain's exit code, do not infer the other three from `npm test` passing.
- **Edition behavioral coverage (issue #342).** A green forge chain certifies *structure* (registries, forbidden tokens, file existence) — it is **insufficient evidence of forge behavioral parity** unless an edition-level test exercises the feature. A cross-edition feature that adds or changes behavior in a HAND-PORTED edition script (the forge-renamed `kaola-{gitlab,gitea}-workflow-*.js`) MUST add behavioral scenarios to that edition's walkthrough (`simulate-{gitlab,gitea}-workflow-walkthrough.js`) driving the real edition CLI, mirroring the root coverage modulo forge nouns. Byte-synced scripts (the codex mirrors under `plugins/kaola-workflow/scripts/`, enforced by `validate-script-sync.js`) inherit root behavioral coverage and need no duplicate scenarios. A throwaway `$TMPDIR` smoke proves a repair but is not coverage — commit the scenarios (the #328 CR1/CR2 lesson: the gitlab/gitea bundle-finalization half shipped under four green chains because the chains certified structure only).

- **What `edition-sync` OWNS, and what it does not (#862).** The tool maintains exactly two things: `kaola-workflow-adaptive-schema.js`, materialized byte-identically into all three plugin trees (`MATERIALIZED_SHARED`, `scripts/edition-sync.js:79-81` — **one entry**), and the codex byte-mirrors under `plugins/kaola-workflow/scripts/`. **Everything in `plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{forge}-workflow-*.js` is a divergent hand-port the tool never writes**, and `renderForgePort` renames FILENAMES only — it translates no forge nouns, no API shapes, no id schemes. So `0 file(s) updated — tree already in sync` means **"nothing I own drifted"**, never **"the editions agree"**. Read it as the second thing and a hand-port that was never made looks finished. This paragraph exists because the ownership boundary was nowhere in the docs, and its absence let a *fabricated* cause ("the sync tool ported the call sites and dropped the threading") get committed to `main` as the explanation for a real defect — worse than the defect, because `git log -S` is exactly where the next porter would find it.
  - **The oracle for a hand-port is a cross-edition count that has to RECONCILE, never a search for what you removed.** #862 verified a four-edition port by grepping that the old string was gone — `0` in all four files — and shipped two dead bundle lanes: **absence-of-the-old is not presence-of-the-new**, and only the second is what a port is for. The count that caught it was one command over the NEW identifier: `root 4 · codex 4 · gitlab 3 · gitea 3`, where the missing site was the `opts` object that feeds the lane. Same instrument principle as the #858 attempt counter and the #860 self-verifying recorder — **a number that must match something else beats reading the hunks**, because reading confirms what you already believe you wrote. All four chains were green over those dead lanes.

- **One integration keeper per behaviour.** `scripts/simulate-workflow-walkthrough.js` owns
  end-to-end journeys (claim → work → finalize → sink) and cross-process/cross-edition behavior.
  Standalone suites own their own module's seams and envelope shapes. Do not duplicate an invariant
  at both altitudes; author it once at the altitude that owns it. The bundle-claim entrypoint has
  exactly one keeper — `scripts/test-bundle-claim.js` plus the walkthrough's own bundle-lane E2E
  journey — and a VALUE re-assert at another bundle-state call site duplicates that keeper and
  should be pruned, not added to.

  **Nothing mechanically detects a lost assertion.** Deleting an assertion never reds the suite it
  was deleted from — the survivors still pass on an unmutated tree — so coverage loss is invisible
  to every gate. That gap is caught at review or not at all: when you prune a test, say what class
  of defect stops being caught and where it is still caught.

- **Generated forge aggregator ports — `sync:editions` (issue #365).** Four scripts
  (`kaola-workflow-{compact-context,release,gap-sweep,run-chains}.js`, `GENERATED_AGGREGATORS` in
  `scripts/edition-sync.js`) are **generated from canonical**, NOT hand-ported: edit the canonical
  `scripts/kaola-workflow-*.js`, then run `npm run sync:editions` (which also cp's
  `COMMON_SCRIPTS`→codex and materializes `kaola-workflow-adaptive-schema.js` byte-identically into
  all three plugin trees). Each generated port carries an `// @generated from scripts/<base>` header
  — never hand-edit one. `scripts/edition-sync.js --check` (wired into the gitlab + gitea chains)
  recomputes each port from canonical via the declared rename map and fails the chain on any byte
  mismatch, so drift in a generated port (the #347 producer-not-ported class) is caught at commit
  time. These inherit root behavioral coverage like the codex byte-mirrors; the **data-layer** forge
  ports (`claim`/`sink-merge`/`sink-pr`/`active-folders`/`classifier`/`roadmap`) stay hand-ported and
  still require the #342 behavioral scenarios above.

### Hermetic unit-chain fixtures

Unit-chain tests own every remote dependency they can reach. Each forge-facing fixture must provide an explicit local seam for every dependency used by the code under test; an omitted dependency fails locally as an unexpected forge call before the fixture callback runs. Tests run with isolated configuration and executable lookup so an undeclared call cannot fall through to ambient credentials, configured remotes, or a host-installed CLI. Keep this rule forge-neutral: assert the owned dependency contract and deterministic result, not a particular provider's incidental diagnostics.

Behavior that intentionally exercises a real network or installed forge client belongs only in a separately named integration test. It must not be hidden inside a unit chain or used to make the default unit-chain result depend on network availability.

- **Routing prose propagates to SIX prose surfaces, not ×4 (issue #400).** Routing, bundle-lane, or finalize-wiring PROSE lives on **six** surfaces — the three Claude **commands** plus the three Codex **SKILL packs**: (1) `commands/` (github-claude), (2) `plugins/kaola-workflow-gitlab/commands/`, (3) `plugins/kaola-workflow-gitea/commands/`, (4) `plugins/kaola-workflow/skills/` (github-codex), (5) `plugins/kaola-workflow-gitlab/skills/`, (6) `plugins/kaola-workflow-gitea/skills/`. **Six is the number of edition trees, and it did not change when the topic count did** — it is per topic, not the total. A change landing on only 4 of the 6 (the recurring CHANGELOG **"×4"** wording is the symptom) leaves the two forge-codex SKILL packs as a **propagation dead zone** — exactly how #369 (`--issue-numbers`) and #380 (auto-bundle restructure) shipped reaching the commands + the github-codex SKILL but not the two forge SKILLs. Forge nouns differ per edition (gitlab = MR / `glab` / `kaola-gitlab-workflow-*.js`; gitea = PR / `tea` / `kaola-gitea-workflow-*.js`; the forge contract validators FORBID `plugins/kaola-workflow/scripts`, `\bgh\b`, `/pull request/i` in SKILLs — verify each with `--forbidden-only`). The **route-reachability contract** (`#400`, in all four `validate-*-contracts.js` + `scripts/test-route-reachability.js`) machine-enforces that every emitted route target resolves to an installed surface AND that a mirrored SKILL carries the command's wiring tokens — so a missing-SKILL or hollow-SKILL dead zone reds the chain with the unreachable target named. Routing prose changes are a cross-edition diff.

- **Every routing surface is GENERATED, not hand-authored (issues #630, #812).** There are **three topics** — `next`, `init`, `finalize` (`TOPICS` in `scripts/generate-routing-surfaces.js`) — over the six edition trees above, so **18 surfaces total**. Read the count off `node scripts/generate-routing-surfaces.js --check`, which prints it, rather than from this sentence. Each topic renders from one canonical skeleton (`templates/routing/{next,init,finalize}.skeleton.md`) plus `templates/routing/slots.js` (frontmatter/H1/setup-resolver/runtime-conditional region content) and `templates/routing/rename-table.js` (forge-noun renames). `slots.js` additionally requires `scripts/kaola-workflow-adaptive-schema.js`, to render the Codex per-spawn tier roster from `CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES` (#944) — so **the kernel is a render input too**, and any fixture that sandboxes the generator must copy it or the spawned `--check` dies at module load before rendering a byte. **Never hand-edit a generated surface** — edit the skeleton, a slot, or the rename table, then run `node scripts/generate-routing-surfaces.js --write`. That one step also brings every edition tree already on the machine back into parity (always the main checkout's, never creating one that is absent), so a routing-prose change leaves no installed `.opencode`/`.kimi` tree stale; `--check` reads no edition tree, which is what keeps the additive editions out of the four chains. The `--check` byte-compare (the default with no args) is wired into all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains, so a hand-edit that drifts from the generated output reds its own chain — closing the present-but-wrong-prose class the token-pin regime alone could miss on a generated surface. There is no hand-authored routing topic left. Command and SKILL forms diverge; that divergence is preserved as declared `REGION`/`SPLICE` directives rather than collapsed, so the byte-compare holds without harmonizing any prose. A second guard covers the generator's own duplication: no `SPLICE` variant may exceed 8 lines and no two variants may share more than 6 consecutive identical non-blank lines, enforced by default with an empty exempt-list — because storing a shared body once per forge would relocate the drift into `slots.js`, where `--check` (which compares surfaces to the skeleton, never variants to each other) cannot see it. `templates/routing/required-blocks.js` is the single-source required-block manifest underlying both: each routing-prose block is declared once with a topic, a `runtime_tag`/`surface_type_tag` pair, and its distinctive content tokens; a derived-universe presence checker in `scripts/test-route-reachability.js` computes each block's obligated surface set from those tags (never a hand-typed file list), so a block structurally cannot obligate a subset of its true surface set — the whole-block-drop class (the #624 finalize-gate-block loss) is closed by construction. The manifest is additive-superset over the pre-existing token pins in `scripts/test-route-reachability.js` and all four `validate-*-contracts.js` — those pins stay.

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

- **Finalize finding-type parity, and the prose that counts it (#914).**
  `scripts/test-forge-finalize-findings.js` (wired into all five chain definitions) pins two
  separate things and keeps them separate. **Behaviourally, per edition**: it drives a real
  archive-staging fault and asserts the raised finding names the live run folder — that claim is
  the whole reason the forge ports are not owed `archive_unstage_failed`, and it lives in a
  *message string* in a hand-ported file, where a reword would silently falsify the recorded
  decision. **Statically**: the per-edition `recordFinalizeFinding` registries agree forge-to-forge
  and match the counts `docs/api.md` states. The static half is a registry-drift guard and is not
  offered as behavioural coverage — #914 rules that a diff or byte-identity check cannot witness
  this surface, which is true of the behaviour and not of the registry. The second half exists
  because the drift happened: #916 added a seventh type in the same bundle that documented six,
  and the prose was briefly false with every chain green. `sink-merge.js` and `claim.js` forge
  ports are hand-ported (`edition-sync.js:30-34`) and absent from `COMMON_SCRIPTS` and
  `RENAME_NORMALIZED_FAMILIES`, so nothing else looks at this seam at all.

## Correctness gates are owned and local

Hosted CI/CD is never a Kaola completion gate. It is not a required step, not a finalization
precondition, and never a reason to waive, replace, or delay the local validation chains, the
edition validators and walkthroughs, or a review. A run must complete on a repo with no CI/CD
configured, with no degradation. Default posture is CI/CD *absent* rather than optional: do not
mention it in prose, plans, finalize output, or suggestions unless the reader has explicitly stated
that CI/CD is mandated for their context. The workflow owns its verdict locally even when a hosted
pipeline also exists.

**Evidence wording is part of correctness.** A structural contract validator proves only the path it
executes. Say exactly what the current suites prove, and route every still-open surface to whoever
owns it rather than folding it into a blanket PASS. Do not upgrade a focused-green result to
cross-edition or terminal-runtime completion. Embedded status text goes stale the moment the next
change lands, so prefer naming the command a reader can re-run over quoting a number.

## The workflow path selector is retired (#227, #770)

There is one workflow and nothing to select. `KAOLA_PATH` and `--workflow-path` no longer select or
refuse anything: a stale request naming any value is ignored and the claim ACQUIRES regardless. The
flag stays a KNOWN, accepted flag (a warn-and-ignore shim printing one stderr notice), and
`KAOLA_PATH` is ignored silently. The retired selector leaves no residue in durable state — the
persisted `workflow_path` field is the constant `adaptive`, never an echo of the request. The
bundle lane runs the same way, so the retired `bundle_requires_adaptive` refusal no longer fires.

## Bundle Lane — Cross-Edition Requirement (issue #328)

The bundle lane (`--target-issues` / `KAOLA_TARGET_ISSUES` / the orchestrator's no-target survey) spans all four editions. Any change to bundle-related code — `claimExplicitBundle`, `claimBundle`, bundle state fields, bundle branch naming, or bundle finalization — is a **cross-edition diff** and MUST have all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green before Finalization. The cross-edition validation rules from § Testing — Cross-Edition Validation apply without exception. The bundle lane's edition behavioral coverage lives in the gitlab/gitea walkthroughs, mirroring `simulate-workflow-walkthrough.js` §#328 — keep them in lockstep when bundle behavior changes (see § Testing — Cross-Edition Validation, Edition behavioral coverage).

**Agent-set deltas carry an exact-match registration surface (#340).** Adding or removing an agent
profile (root `agents/<name>.md` or a plugin `agents/<name>.toml`) breaks exact-match registries and
by-name dispatch registrations that are **keyed on no symbol of the new file** — so a symbol-grep
cannot find them. **Nothing refuses ahead of the chains any more**: the freeze-time registration wall
went with the plan validator, so an omission surfaces only when the affected chain runs. Walk the
list by hand:

| Path | What pins the roster |
|------|----------------------|
| `plugins/*/agents/<name>.toml` (×3) | the three sibling edition profiles, byte-identical |
| `plugins/*/config/agents.toml` (×3) | the `[agents.<name>]` codex-dispatch table — without it the agent is undispatchable in the codex/gitlab/gitea runtimes even though the profile installs |
| `scripts/validate-vendored-agents.js` | `localAgents` exact listing |
| `install.sh` **and** `uninstall.sh` | `REQUIRED_AGENTS` — a missing uninstall name orphans the installed agent. On **removal**, also `uninstall.sh`'s `RETIRED_AGENTS`: uninstall deletes the agent manifest, so a retired name missing there is a permanent strand no later install can heal (#977) |
| `scripts/kaola-workflow-resolve-agent-model.js` (×4, byte-identical) | `DEFAULT_AGENT_MODELS` |
| gitlab/gitea contract validators | agent counts |
| the two forge `test-*-workflow-scripts.js` | counts |
| `scripts/test-agent-profile-parity.js` | `TOML_TREES` per-tree profile **count** |
| `scripts/kaola-workflow-adaptive-schema.js` | `CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES` / `CODEX_PINNED_HEAVY_ROLES` — a role in none of the three has "no Codex profile-tier policy" |
| the six Codex SKILL surfaces | the per-spawn tier roster, **generated** from those same three constants into the `codex-dispatch-model-routing` PIN (#944) — no hand edit, but a new role needs `generate-routing-surfaces.js --write`, and `test-route-reachability.js` T19b reds if the shipped roster and the constants disagree in either direction |
| `scripts/kaola-workflow-codex-preflight.js` | its **own** copy of the three tier lists (authored `require`-free, so it cannot import the schema) |
| `plugins/*/scripts/install-codex-agent-profiles.js` (×3) | a **third** copy of the three tier lists |
| `README.md` | the ```text codex role catalog, set-equality-checked against `plugins/kaola-workflow/config/agents.toml` by `validate-kaola-workflow-contracts.js`; and the Agent/Tier table, which is **not** machine-checked — keep it in step by hand |

Note the three tier lists exist in **three** independent copies. Adding a role to only the schema leaves the
Codex install/doctor chain red; that duplication is the standing cost of the diagnostic's
`require`-free authoring. An agent-set delta is itself a cross-edition diff.

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

`code-reviewer`, `adversarial-verifier`, and `security-reviewer` are generated-profile exceptions to
the ordinary hand-mirrored agent workflow:

1. Edit `templates/reviewers/behavior-contracts.json` for runtime-neutral behavior or
   `templates/reviewers/runtime-adapters.json` for closed tools/model-policy/evidence-transport data.
   Adapter data must never grow arbitrary prompt, prefix, suffix, or instruction fields.
2. Edit `scripts/generate-reviewer-profiles.js` only when rendering or validation rules change.
3. Run `node scripts/generate-reviewer-profiles.js --write`, then `--check`. Never hand-edit any of
   its three Claude Markdown outputs or nine Codex TOML outputs across GitHub, GitLab, and Gitea
   (`EXPECTED_OUTPUT_PATHS` in the generator is the list).
4. Run `node scripts/test-agent-profile-parity.js` and `node scripts/test-opencode-edition.js`.
   OpenCode must preserve normalized behavior-core bytes and identity after its runtime transform.

`behavior_contract_hash` establishes deterministic runtime-neutral contract equivalence.
`resolved_profile_hash` establishes deterministic complete-render byte identity. Neither hash means
that stochastic models must emit identical findings, explanations, or outcomes. Installer/preflight
checks may claim exact selected-source, installed-file, manifest, and plugin-cache bytes only; they
must not claim proprietary prompt-load attestation without a public runtime introspection contract.
Codex reviewer profiles remain runtime-unpinned by omission and may not emit top-level `model` or
`model_reasoning_effort`. Their top-level schema is closed to `name`, `description`,
`nickname_candidates`, and `developer_instructions`; behavior and resolved-profile identity lines
live inside `developer_instructions` so they remain runtime-verifiable without becoming unsupported
Codex role fields.

## Local validation receipts

`scripts/kaola-workflow-validation-runner.js` executes a validation command in a scrubbed
environment, binds command/cwd/env/toolchain/candidate identities, and reduces bounded repetitions
to a deterministic `pass`, `fail`, or `inconclusive` receipt. Timeout, signal, mixed results,
candidate mutation, unresolved executable identity, or any other incomparability is `inconclusive`,
never pass. It is self-contained and depends on no hosted pipeline.

## Agent profile parity

**Non-generated agent-profile md↔toml token-pin parity contract (#422, see
`docs/decisions/D-422-01.md`).**
Three-part machine-enforced contract:

1. **`.toml` triple byte-identity** — `validate-script-sync.js` `BYTE_IDENTICAL_GROUPS`
   includes a programmatic entry for every `plugins/kaola-workflow/agents/*.toml` file
   (built via `readdirSync`), covering every base-role profile.
   Any byte divergence between the three plugin-tree copies of a `.toml` reds the validation
   run. A new profile added to the codex tree is auto-covered.

2. **Derived sentence parity** — for non-generated roles, `scripts/test-agent-profile-parity.js`
   derives its obligations from the corpus rather than from a curated list: a rule sentence carried
   by at least two thirds of the hand-maintained canonical profiles must appear in every
   hand-maintained `.md` AND in all three `.toml` twins of each, and `ROLE_PINS` carries the
   role-specific rules no consensus can reach — each pin asserted present in its source `.md`
   first, so a pin whose source wording has moved fails loudly instead of enforcing nothing.
   A drift between the `.md` and the twins reds the claude chain and is caught before the
   four-chain gate.

3. **Chain pinning** — `test-agent-profile-parity.js` is wired into the claude chain and
   pinned by all four `validate-*-contracts.js`, so a missing or renamed guard file reds
   every chain.

**Workflow:** For a non-generated role, mirror a new feature paragraph into all three `.toml`
twins; a rule shared by two thirds of the hand-maintained roles is enforced automatically, and a
role-specific rule needs a `ROLE_PINS` entry in `test-agent-profile-parity.js`. For the three
generated reviewer roles, use the canonical JSON + generator workflow above instead.

**`config/hooks.json` family (#418.1).** The three plugin-tree `config/hooks.json` files
(`plugins/kaola-workflow/`, `plugins/kaola-workflow-gitlab/`, `plugins/kaola-workflow-gitea/`)
are parity-checked by `validate-script-sync.js` `CONFIG_HOOKS_FAMILY` +
`normalizeConfigHooks()`. The files differ only in the forge-renamed compact-resume script
path (`kaola-workflow-codex-compact-resume` → `kaola-{forge}-workflow-codex-compact-resume`);
any other divergence reds the validation run.

## Aiming a guard — what it reads, and how wide (#887)

Five defects shipped past four green chains, a full-scope walkthrough, green edition suites and clean
installs. Every one was found by a reading, none by a test failure, and in each case a guard was live,
passing, and pointed at something that had moved. They share one shape: **the guard derived its
coverage universe from the author side of the artifact, while the defect lived on the consumer side.**

| Guard | Its subject | Why it could not see the defect |
|---|---|---|
| `test-agent-profile-parity` consensus | policy shared across ≥⌈2N/3⌉ of 11 profiles | test custody is shared by 2 roles — below the bar by construction, not by tuning |
| reviewer contradiction check, token table, vocabulary ban | `contractText`, built from `sections[].lines` | section headings were in no scanned region, yet render as `## <heading>` to 12 surfaces |
| opencode `A3` / kimi `K5-kinds` | the write/edit restriction axis | that axis had become unreachable; the live axis (`bash: deny`) was new and unguarded |
| the retired-vocabulary cleanup | the authored contract | `node-id` lived in the generator's own render, which nothing read for vocabulary |
| `test-route-reachability` | a universe derived from the edition tables | the forge term is the registry measuring itself — 12→8 surfaces, and at the time an unchanged assertion count (325→325) |

Two rules follow, and they are the ones stated in `CLAUDE.md`:

**A guard reads what ships, not what was authored.** The question worth asking of a content guard is
not *what does it catch* but *what renders to a consumer that it never reads*. Scanning the authored
source misses generator prose, and a scanned region is a choice whose complement is where the defect
sits. Where a universe is derived from the artifact under test, partially anchored is not anchored:
one **absolute** count belongs in a different file. `test-generate-routing-surfaces`'s `registry
derives 18 surfaces` is that anchor for the routing registry, and it is mutation-proven — delete a
forge from both edition tables and it fails at 18→12, while the walkthrough's
`testAxiomBlockByteIdentity` passes at 14→10 surfaces, the derived term of its width
`FORGES.length × (2 + runtimeEditionCount) + 2` shrinking in lockstep with the registry it measures.
That term is left derived on purpose, and says so where it is written. **The trailing `+ 2` is a
literal for the opposite reason, and the contrast is the lesson.** It counts the two named,
non-derived surfaces (root `CLAUDE.md`, `README.md`); written as `NAMED_SURFACES.length` it would
shrink in lockstep with the very list it measures, so dropping a surface from that list and staling
it yields `PASSED (13 surfaces)` — green over a fully stale file. Mutation-proven, not argued. A
count is safe to derive only from something the mutation cannot move; where the list IS the subject,
write the number. `test-route-reachability` held the green side of this
contrast, and the floor the row above describes still holds it: that universe is still registry-derived
and still passes at 12→8. What changed is the **suite**, which now reds under the same mutation at
`T19b universe: … 6 … found 4` — a later band added for an unrelated purpose. That is an incidental
catch and not the anchor this rule asks for: it measures a different universe, six Codex
routing-marker SKILL surfaces rather than the registry's eighteen rows, against a hand-kept
`codexEditions` twin of the very edition tables being deleted from — one guard *inside* this same
suite rather than one guard over. Enough to stop the suite standing in for "stays green", and not
enough to re-anchor anything.

Quote no assertion total in the rule's illustration above. The suites print their own, and the numeral
this one once carried went stale the same day it was written — four hours later — while the claim it
decorated survived nine days before a sibling assertion inverted that too. The dead numeral then stayed
arithmetically reachable: under the mutation the run evaluates 324 passed and 1 failed, summing to the
very 325 it used to assert, on a line that reads `FAILED`.

**A threshold cannot see a rule beneath its bar.** A consensus derivation reports nothing that
distinguishes *no such rule* from *below threshold*, so a small reciprocal obligation gets an explicit
pin (`ROLE_PINS`), never a derivation. A derivation that reads its rule set from the corpus also lets
a corpus-wide rewrite redefine the baseline — absolute pinned text is the only floor that survives a
uniform inversion.

What is deliberately **not** built is a generic anti-vacuity harness that reports enforcement-domain
size alongside every result. Measured against the five observations above it catches one, and it is a
mechanism justified by *"a guard might be aimed wrong"* — the shape this project's derivation rule
rejects. The per-guard non-vacuity assertions that already exist stay; nothing generalizes them.

## Adding a role agent

A new role agent is a fresh `agents/<name>.md` plus its three plugin `.toml` twins, registered
across the surface in § Bundle Lane above. Two authoring rules survive from the era when a validator
enforced them, and they are now review-enforced:

- **Declare the tools.** The agent file needs a parsable `tools:` front-matter manifest. Whether it
  can write is derived from that manifest and nothing else — never from a hand-maintained list.
- **Say where the deliverable goes.** `Write`/`Edit` present ⇒ the agent writes its own output to a
  path the dispatch names. `Write`/`Edit` absent ⇒ the agent RETURNS its full deliverable as its
  final message, for the orchestrator to persist. A read-only agent that writes files, or a writing
  agent that returns its deliverable only in chat, loses work at the dispatch boundary.

Three roles are exceptions handled by the generator, not by hand: see § Generated Reviewer Profiles.

## Two validation tiers — the fast gate is SAMPLED (#801)

`npm run test:kaola-workflow:claude` is the **fast gate**: a hard 10-minute budget, bought by sampling. `npm run test:kaola-workflow:claude:full` runs everything and is **never mandated — in any case, including a release receipt.** The fast gate is sufficient evidence on its own; the full tier is an opt-in diagnostic. `npm run test:full` chains it with the other three editions for that same discretionary use.

This is deliberate, and it is what `run-chains.js` already does: `resolveChains` maps the `claude` chain to the sampled command with no override, so every chain receipt — release receipts included — has always been fast-gate evidence. The rule now matches the tool instead of contradicting it.

- **What the fast gate does NOT execute on a given run.** One suite is sampled: `simulate-workflow-walkthrough` runs `--shard auto/12`, so 11 of every 12 scenarios are skipped per run. Three are deferred whole — `test-claim-hardening`, `test-sink-merge`, `test-run-chains` — because they are not registry-backed, so sampling is unavailable and whole-suite deferral was the only option. `test-release` moved into the fast gate with #881, since the release gate would otherwise carry no mandated coverage at all. Read the current membership off `package.json` rather than this list: the fast gate is the `test:kaola-workflow:claude` script and the full tier is `test:kaola-workflow:claude:full`, and their difference is the answer.
- **The rotation is the bound on that loss.** `--shard auto/N` seeds the slice index from HEAD: the same commit always runs the same slice (so a red is reproducible and re-running cannot shuffle a failure out of view), while consecutive commits run different slices (so the whole registry is covered across N commits). A fixed slice would leave the other N−1 permanently unexecuted for the same runtime — strictly worse.
- **Coverage loss stays fail-closed.** The shard-coverage audit still asserts that shards agree on the registered scenario count and that their slices sum to exactly it, so a partition that drops or duplicates a scenario reds the chain.
- **A cut must name its surviving gate.** Deferring a suite from the fast gate does not retire it — `claude:full` still runs it — but since the full tier is never mandated, that is a place to reach for the suite deliberately, not a backstop that fires on its own. Never defer without recording the defect class that stops being checked per-run and where it is still checked.
- **Do not reach for concurrency.** It has been measured twice on this suite set and produces false reds — see the #801 CHANGELOG entry and `docs/decisions/D-523-01.md`. Spawn reduction is likewise already refuted; the time is genuine nested work.

## Cross-runtime lexicon parity (#812)

A typed code emitted by the shared engine (`scripts/kaola-workflow-*.js`) can reach **any** runtime, so the convention is that it should be documented on **every** runtime or on none. **Nothing currently enforces this.** `scripts/test-runtime-lexicon-parity.js`, the guard that used to, was deleted 2026-08-01 (recoverable from git history at `b3bc7acf`): it compared the engine's ENVELOPE vocabulary (machine-readable `reason:` codes) against runtime surfaces carrying INTERFACE vocabulary (dispatch fields, env vars, config knobs) — two families that live in different places by design, so the intersection was 0 of 62 and always had been. See the watch list in `docs/decisions/0017-the-mission-list.md` for the full envelope-vs-interface finding and why the failure class is recorded rather than rebuilt.

- **Mutation-proof any new guard.** `test-kimi-edition.js` previously passed 415 assertions while detecting no template drift at all. A green suite is not evidence; only a demonstrated RED-on-mutation is.

## The validation-invisible allowband (#424 / #547)

A narrow band of paths is **validation-invisible**: `docs/**`, root `README.md` and `CHANGELOG.md`,
and the `kaola-workflow/{project}/**` run-state tree. The chain receipt hashes the code-relevant tree
with that band excluded, so a docs-only or state-only commit does not stale a receipt and force a
wasteful four-chain re-run. `isValidationInvisible` in `scripts/kaola-workflow-adaptive-schema.js` is
the single source; the finalize validation report and the release gate both call it.

**The exclusion is only safe while no chain test reads an excluded file.** Prose a chain actually
asserts on is VERDICT-AFFECTING and must stay in the hash, or a real regression to it could be cited
as unchanged and ship green. `SELF_HOST_TEST_CONSUMED` keeps such prose as code, and
`scripts/test-validation-allowband.js` (claude chain) statically scans every chain validator for
allowband-member literals it references and asserts each one is on that list — so a validator that
starts reading `docs/newdoc.md` without adding it goes RED rather than silently widening the hole.
Over-inclusion costs an extra re-run; under-inclusion costs a missed regression, so err toward more
files as code.

Everything **outside** the band is a production surface — `agents/*.md`, `commands/*.md`,
`plugins/*/agents/*.toml`, `templates/**`, `scripts/**` — and a change to one is a change to the
product, whatever its file extension.

## Goal declaration — `KAOLA_GOAL` and `goal_declared` (#441, #874)

A run's goal is the H1 of its `mission-list.md`; `KAOLA_GOAL` is the operator-side env var for the
same text. Key properties:

- **Reader-only, no gate** — a run with no declared goal is entirely valid. Nothing branches on it.
- **Subagent shells do NOT inherit env vars across the spawn boundary**, so a goal that must reach a
  dispatched agent travels in the dispatch prompt. The orchestrator owns placing it there.
- **Advisory declaration, never satisfaction** — `cmdFinalize` in `kaola-workflow-claim.js` writes
  `goal_declared: true|false` into the closure receipt, with `goal_declared_source` (`env`|`plan`|null)
  and `goal_declared_probed` (the exact paths examined). It records only that a goal was DECLARED;
  **nothing in this workflow checks whether a goal was achieved**, so nothing may read these fields as
  success. It replaces the retired `goal_check: satisfied|unsatisfied|absent`, whose negative case was
  unreachable and whose `satisfied` was documented as "AC verified" while no acceptance-criteria check
  existed anywhere — driven, it wrote `satisfied` for `KAOLA_GOAL="cure cancer"` on a run that achieved
  nothing. Archived receipts still carry `goal_check` and are correct as history; never edit one to
  finish the rename. See `docs/decisions/D-441-01.md` (status: superseded) and `docs/api.md`.

## Chain receipt is the only valid greenness evidence (#432)

Prose assertions ("chains passed", "npm test is green") are not evidence of test-chain greenness at
finalization; the receipt artifact is. **The finalize transaction measures and reports — it does not
refuse.** It classifies the receipt structurally, in precedence order, and hands the finding to the
orchestrator on the envelope under `validation` and durably in `finalization-summary.md` under
`## Validation`. Proceeding past a bad reading is available and is sometimes right; proceeding
without saying which reading you were in is not.

The measurement is **dual-mode by repo kind (#475)**, auto-detected by whether the git top-level's
`package.json` declares any `test:kaola-workflow:*` script. Classify by the typed `classification`
field, never by string-matching text.

**Self-host (npm).** Run `node scripts/kaola-workflow-run-chains.js --project <P>` to produce
`.cache/chain-receipt.json`, then cite the receipt path in the finalization summary. Classification,
most severe first: `chains_unverified` (no/unparseable receipt) > `chains_stale` > `chains_empty` >
`chains_red` > `chains_green`. Freshness PREFERS the `codeTreeHash` content address (see § The
validation-invisible allowband) and falls back to the `headSha` pin on a legacy receipt that predates
the field. A known-red chain may be waived with `--accept-known-red name:open-issue-N`; the waiver
must reference a real open tracking issue.

**Consumer (non-npm) repos (#475).** A product repo whose validation is not npm-based does not run
`run-chains.js` — it has nothing to run. The agent **owns verification** (#44) and records
`.cache/final-validation.md` with a column-0 `verdict: pass` line, the exact command it ran, and a
column-0 `validated_candidate_hash:` line binding the verdict to the tree it validated, computed LAST
after every file the validation covered has landed. Classification: `final_validation_unverified`
(absent) > `final_validation_failed` (no `verdict: pass`) > `final_validation_unbound` (no
well-formed hash line) > `final_validation_stale` (recorded hash ≠ a fresh recompute, both hashes
carried on the payload) > `chains_green`. The measurement compares two hashes and never re-runs the
validation command, so the agent-owns-verification boundary is unchanged. `repo_kind_undetermined`
is the one state in which no measurement can be taken at all — the weaker consumer reading is never
silently substituted for an indeterminate repo.

`computeCodeTreeHash` in `scripts/kaola-workflow-adaptive-schema.js` is the single producer of both
the receipt's `codeTreeHash` and the consumer arm's `validated_candidate_hash`; the retired
plan-validator's `--candidate-hash` CLI went with it, so a consumer repo currently has no shipped
command that prints the value it is asked to record.

**Per-chain kill ceiling and timeout observability (#608).** The `spawnSync`/`spawn` kill ceiling
per chain defaults to 1800000ms (30 min, raised from 900000ms — see `docs/decisions/D-608-01.md`
for the recalibration rationale); `KAOLA_RUN_CHAINS_TIMEOUT_MS` overrides it (invalid/zero/negative
values fall back to the default; no upper clamp). A chain killed by this ceiling now carries
`timed_out: true` in its receipt entry (absent on a receipt written before this field existed ⇒
read as `false`, no reader change required) — the field distinguishes a genuine test failure from
a process still running when the clock ran out, without re-running anything. The plain-text
failure summary labels a timed-out chain inline (`name (TIMEOUT at <N>s — raise
KAOLA_RUN_CHAINS_TIMEOUT_MS or investigate a hang)`), and the `chains_red` operator hint names the
same remedy only when a red chain actually timed out. This is observability text only.

## The changed-paths report (#424, converted)

The finalize transaction also reports the paths the run actually changed — on the envelope as
`changed_paths`, durably under a `## Changed Paths` heading in `finalization-summary.md`. **Nothing
compares that list against a declaration, because there is no declaration to compare it to.** It is
there so a reader can see what moved and notice what does not belong.

This is the accepted loss ADR 0017 names: early scope-violation detection went with declared write
sets, so a stray edit is noticed when a reader looks, not one step later. The report is what replaced
it — read it rather than skipping past it.

## Run-gap capture at finalize (#435)

Prose assertions about "no defects found" or "gaps addressed" are insufficient evidence of
run-gap coverage at Finalization. Before Finalization's gap sweep runs, the orchestrator seeds
any run gap it directly observed but the automated scanners cannot see (transient tool noise, a
manual retry, an environmental flake) by appending a `gap: <class> — <text>` line to
`.cache/run-gaps-manual.md` (issue #653 / D-653-01) — the reverse-containment check in step 3
below refuses a `## Run gaps` entry with no matching seeded or scanned source.

The orchestrator MUST:

1. Run `node scripts/kaola-workflow-gap-sweep.js --project <P> --json` to produce
   `.cache/run-gaps.json`. The scanner reads only `kaola-workflow/<P>/.cache/` (scope guard —
   no archive bleed). It sweeps two machine-reliable signal sources: `chain-receipt.json`
   (`accepted_red:true` entries = `deferred_red_chain`) and the optional
   `.cache/run-gaps-manual.md` (`gap: <class> — <text>` lines = `manual:<slug>`). Items are
   deduplicated by `(reasonClass, sample)`. **Most of what a run discovers now arrives through the
   manual seed** — the automatic node-repair signal went with the node lifecycle, so seeding what
   you observed is the difference between a captured gap and a lost one.
2. Populate the `## Run gaps` section of `finalization-summary.md` — one line per swept
   `(reasonClass, sample)` tuple — in exactly one of two forms:
   - `- <reasonClass> (<sample>): filed: #N` — gap tracked by an open issue.
   - `- <reasonClass> (<sample>): noise: <one-line justification>` — gap justified as not
     worth tracking.

   The heading itself must read exactly `## Run gaps`, with nothing else on the line. A heading
   carrying a qualifier reads as no section at all, and the whole section is skipped however
   well-formed its rows are.

   The `<sample>` is delimited by the FIRST `): ` that is followed by a valid `filed:`/`noise:`
   tail (issue #726). Consequently a sample may itself contain parentheses — e.g.
   `- manual:api-probe (retryAfter(from:)): filed: #N` — and a `noise:` justification, which is
   unconstrained free text, may itself contain `): filed: #N` without being mis-carved into the
   sample. A bullet that looks like a mapping row (a parenthesised sample immediately followed by
   a `filed:`/`noise:` tail marker) but does not match the grammar is still skipped, and now names
   itself on stderr as an advisory `ignoring malformed ## Run gaps mapping line` warning so a typo
   does not resurface later as a puzzling `gaps_unswept` / `observed_gap_unseeded` refusal. The
   warning never changes the parse result, the exit code, or the `--json` line on stdout, and
   free-text bullets (`- none`, prose notes) remain silently ignored by design.
3. Run `node scripts/kaola-workflow-gap-sweep.js --project <P> --check` as the gate. It checks
   BOTH directions (issue #653 / D-653-01): a swept-but-unmapped tuple refuses `gaps_unswept`
   (forward, unchanged — `{ result: 'refuse', reason: 'gaps_unswept', unmapped: [{reasonClass,
   sample}] }`); a `## Run gaps` entry matching the strict `- <class> (<sample>): filed:|noise:
   ...` grammar with no matching seeded/scanned source refuses `observed_gap_unseeded`
   (`unseeded: [{reasonClass, sample}]`, reverse — new). A vacuous pass now requires BOTH sides
   empty — no swept classes AND no strict-grammar `## Run gaps` entries; free-text lines that
   don't match the grammar (e.g. `- none`) are ignored by design, preserving back-compat with
   existing summaries. Either refusal exits 1 and blocks finalization until resolved. Because a
   paren-bearing sample now parses (issue #726), a hand-typed row whose sample contains `)` is
   subject to reverse containment like any other — previously such a row never parsed, so it fell
   through to the both-sides-empty vacuous pass and escaped the check entirely.

   In BOTH directions, a summary sample is matched to a seeded sample by CONTAINMENT, not byte
   equality (issue #836): after trimming, either side being a prefix/substring of the other
   identifies the same gap, symmetrically — so a summary may abbreviate the seeded prose (drop a
   `(replan.js:1474)` tail) or elaborate on it without refusing. The information is what is
   checked, not its serialization. Nothing else loosens: the `reasonClass` comparison stays EXACT,
   an empty sample on either side never matches, a sample with no containment relation still
   refuses `observed_gap_unseeded`, and a seeded gap with no mapping row at all still refuses
   `gaps_unswept`.
4. Cite the gate exit code as evidence in the finalization summary. Never record a
   `gaps_addressed: true` prose attestation without a passing `--check` invocation.

The `--check` gate is the ONLY valid run-gap evidence; classify its result structurally by the
typed `reason` field (`gaps_unswept`, `observed_gap_unseeded`), never by string-matching error
text.

Decision records: `docs/decisions/D-435-01.md`, `docs/decisions/D-653-01.md`.

## Release

- **Pre-tag release gate (issue #651, D-651-01).** Before creating the release tag, run the check-only
  pre-tag gate: `node scripts/kaola-workflow-run-chains.js --release-check
  [--json] [--candidate <sha>] [--receipt <path>]`. **It moved here from the retired plan-validator**
  — same argv, same typed envelope, same precedence family — and it now
  lives in the file that PRODUCES the receipt it reads. It reads only `.cache/chain-receipt.json`
  (git-toplevel default, overridable via `--receipt`), local git, and `package.json` (to resolve
  the expected `test:kaola-workflow:*` chain set) — no CI/CD or forge calls — and refuses with a
  typed `reason` unless the receipt is a clean-stamped, all-green, UNWAIVED receipt COVERING
  every declared chain, whose `headSha` STRICTLY equals the release-candidate commit
  (default `HEAD`; `--candidate` for an explicit commit). That equality is the ONLY binding: the
  #547 `codeTreeHash` freshness relaxation used at finalize does NOT apply, and neither does any
  ancestor relaxation — see the working sequence below.
  **This is one of the two places that still refuses**, and deliberately so: it is release
  tooling a human invokes before tagging, not a workflow judging a run. A red, missing, stale,
  incomplete, waived, or unresolvable-chain-set receipt is a
  typed refusal, never a judgment call: `chains_unverified` (no/unparseable receipt) >
  `chains_stale` (`headSha` unbound, not equal to the candidate, or the receipt stamped over a dirty
  worktree — with hint-only `stale_paths`/`stale_kind` culprit diagnostics on a sha mismatch) >
  `chains_empty` (zero chains recorded) > `repo_kind_undetermined` (the expected chain set
  cannot be resolved from `package.json` — fails CLOSED, never treated as a vacuous pass) >
  `chains_incomplete` (the receipt is a legitimate but partial subset — e.g. a
  `run-chains.js --chains claude` receipt — missing one or more declared chains; refuse carries
  structural `missingChains`/`expectedChains`) > `chains_red` (an unwaived red chain) >
  `chains_waived` (ANY `accepted_red` chain — legal at adaptive finalize, never for a release
  tag). Only a typed `pass` envelope
  (`{result:'pass', mode:'release-check', candidate, chains:[...]}`) clears the gate. See
  `docs/api.md` for the full envelope shapes and `docs/decisions/D-651-01.md` for the design.
- **Working sequence:** `--prepare` → one release-only commit → **a full four-chain run at that
  commit** (`KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-run-chains.js` — OFFLINE skips the
  tag-existence check that would otherwise fail before the tag exists) → `--release-check` passes →
  `--tag` → online post-tag validation → push the named tag → publish. **That re-run is mandatory,
  not an alternative** (issue #888). #881 shipped a release-prep carry-over meant to skip it, and
  cutting v9.0.0 measured that it cannot fire: the sink's `chore: archive <project>` commit
  interposes `kaola-workflow/archive/<project>/**` between the finishing run's receipt and the
  release commit, and those paths are outside the release-prep surface by construction. Since the
  workflow has no release path that avoids the sink, the carry-over was an unreachable branch
  reading as a live feature, and it was deleted rather than widened.
- Push only the named tag before creating the forge release. The release tooling emits neutral
  guidance; no external pipeline or forge service participates in the release gate.
- **Release-commit hygiene (issue #651).** A release/tag commit is version bump + release docs
  only — `package.json`, the Codex/Claude-plugin manifests, `CHANGELOG.md`, and the README
  release-version lines — never unrelated behavior-changing code. Bundling more (as happened at
  `kaola-workflow--v6.21.3`, tagged with a red Claude chain and zero receipt because a breaking
  change rode along under an unrelated commit subject) invalidates whatever receipt was checked:
  the receipt's `headSha` then names a different tree than the tag covers. Anything beyond
  version bump + release docs re-runs the whole sequence above — regenerate the receipt at the
  new candidate, re-pass `--release-check`, re-tag.
- **Changelog references to another forge carry no `#` (issue #890).** `--verify` and `--prepare`
  both read the `[Unreleased]` section by extracting every `#\d+`, and neither can tell this repo's
  issue numbers from some other project's. So a reference to an upstream forge is written **without
  the hash** — `openai/codex PR 19792`, `openai/codex issue 33447` — and a bare `#886` continues to
  mean an issue in *this* repo, which is what `--issues-closed` asserts it closed. Writing
  `openai/codex PR #19792` instead forces that number into `--issues-closed` to get past `--prepare`,
  which puts a false statement in the release receipt: measured cutting v9.0.0, where `#19792` and
  `#33447` — an openai/codex PR and issue — were recorded as issues the release closed. They are not.
  The repo already writes the same PR correctly in the `[7.0.0]` entry (*"confirmed against
  rust-v0.145.0 source and upstream Codex PR 19792"*); the `[9.0.0]` lines are the deviation, and
  they stay as they are because released history is not edited casually. **The extractor is
  deliberately not taught to recognise `owner/repo` slugs** — a writer who reintroduces the `#` form
  finds out at `--prepare`, which is a loud, non-destructive, zero-mutation refusal, and that is a
  cheaper answer than machinery for a failure whose whole cost so far is one metadata inaccuracy.
- **The same rule binds this repository's own OLD issues, and that is the case people trip on.** The
  extractor's known set is not "issues that exist here" — it is `--issues-closed` plus every `#\d+`
  found in commit messages **since the last tag**. So citing a past issue as background for a
  mechanism being described (*"the #555 export-drift class"*, *"the #700 guard"*) refuses with
  `changelog_unknown_reference` even though the issue is real, closed, and this repo's own. Measured
  cutting v9.1.0, where 555, 700, 832 and 346 all refused. Write background citations without the
  hash — *"the issue-555 export-drift class"*, *"issue 832"* — and reserve `#N` in the `[Unreleased]`
  section for issues the release actually **delivers**, which is exactly what `--issues-closed`
  asserts. The refusal is the feature: it is the only thing standing between a background citation
  and a release receipt claiming to have closed an issue it never touched.

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
  The chain receipt must be clean-stamped, unwaived, all green, and bind to candidate HEAD via the
  same route `--release-check` accepts — exact `headSha` equality, and nothing
  else. Authorization and completion rows bind version, independent Codex version,
  ordered prepared surface, candidate SHA, chain HEAD, and tag name. Tag creation is an atomic
  zero-old ref update at candidate HEAD. The command then resolves the tag and reads every prepared
  file from the tag tree as raw bytes; a newly-created tag is compare-deleted if verification fails.
  A completed rerun succeeds idempotently only when both receipt rows, live tag, candidate, current
  chain receipt, and tag tree still agree. Git probe ambiguity is always a typed refusal.
- **`--cut`** — compatibility-only refusal. It never prepares, authorizes, or tags; its
  `cut_compatibility_refusal` envelope returns the executable replacement sequence.
- **`--push`** — emits forge-neutral operator guidance for pushing the local tag and running the forge `release-create --latest` command. The script itself performs no remote mutation and invokes no forge CLI binary; publication remains a manual or forge-specific step.

**Relationship to `--release-check`.** `--tag` no longer performs its own separate check — it binds
to candidate HEAD via the same route `--tag` and `--release-check` now share, so the two cannot
disagree. `run-chains.js --release-check` remains a separate mandatory step and a stable external
contract: run it before `--tag`, over a receipt stamped at the release commit itself, and do not
infer its pass from `--prepare` or from `--tag`'s own checks. It calls no external pipeline.

**Registration surface:** `kaola-workflow-release.js` is registered in `COMMON_SCRIPTS` (so the canonical-to-codex byte-mirror is enforced by `validate-script-sync.js`) and in the rename-normalized forge-ports family, but **NOT** in the install-manifest `SUPPORT_SCRIPT_NAMES` block. It is a maintainer/dev tool on the same operational profile as `release-surface-drift.js` (D-442-01 §6). If a chain goes red demanding manifest registration, stop and surface it rather than silently widening SUPPORT_SCRIPTS.

## Provenance stays out of agent-facing prompts (#575)

Design-rationale provenance — issue refs, decision IDs, invariant tags, ADR citations — must not appear in the agent-facing prompt surfaces. It is dispatch-time noise: it bloats context, ages without visible decay, and conveys no actionable rule to the running agent.

### What counts as a prompt surface

The full set across all four editions (claude / codex / gitlab / gitea) plus the opencode, kimi, grok, and cursor runtime editions:

- **Agent definitions** — `agents/*.md` (root), `plugins/*/agents/*.toml` (all three plugin editions), opencode `agents/*.md` (generated from canonical), kimi `.kimi/skills/kaola-role-*/SKILL.md` role contracts (generated from canonical by `scripts/sync-kimi-edition.js`), grok `.grok/agents/*.md` (generated from canonical by `scripts/sync-grok-edition.js`), cursor `.cursor/agents/*.md` (generated from canonical by `scripts/sync-cursor-edition.js`)
- **Commands** — `commands/*.md` (github-claude), `plugins/kaola-workflow-gitlab/commands/`, `plugins/kaola-workflow-gitea/commands/`, Codex `skills/kaola-workflow-*/SKILL.md` (including the two forge-codex SKILL packs), opencode generated command mirrors, kimi generated command skills (`.kimi/skills/<command>/SKILL.md`), grok `.grok/commands/*.md`, cursor `.cursor/commands/*.md`
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

`LANE_STALENESS_MS` (24 hours) is the single staleness constant exported from
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

**One boundary is call-site-specific, not universal (#973/#975/#978).** `assertWorktreeClean`'s
untracked-record half — `worktreeDirtRecords`, added to widen the linked-worktree probe from
`--untracked-files=no` to `-uall` so it can see untracked work at all before `git worktree remove
--force` runs — calls `isParkedLanePath` with an **empty** owned-project set, not the caller's
`ownedProjects`. That is deliberate, not an oversight of rule 3 above: inside a *linked worktree*
the lane folder is that run's own throwaway copy, not the live record `assertCleanWorktree`'s
main-root check protects, so for this one probe an **own** `<project>/` folder is parked too, and
content outside `kaola-workflow/`/`.kw/` still fails the gate. Tracked records are read
exactly as before. Two untracked record shapes are never exempt even under a lane prefix (#978): a
decoded path containing a backslash — porcelain's only separator is `/`, so a backslash is a
literal filename character that the classifier's `\`→`/` normalisation would read as one — and a
path ending in `/`, the collapsed record git emits for an embedded repository it will not descend
into, which stands for a population the per-file exemption never saw. Both are kept as dirt and
refuse. The three shapes #975 recorded as still silently destroyed are closed by #978: those two
record rules cover the first two, and the legacy route now stages and lands the run's own project
folder around its worktree removal, as the `--sink` route already did.

**Merge protocol unchanged.** `ffMergeLoop` and the true-conflict halt in `sink-merge.js` are
byte-unchanged. `assertCleanWorktree`/`assertWorktreeClean` run BEFORE `ffMergeLoop`, so the
looser non-owned exemption cannot affect conflict resolution. Each lane cleans its own branch,
worktree, and active folder ONLY after its own merge lands; it does not clean other lanes.

See `docs/decisions/D-579-01.md` for the full decision record.

## First Principles axiom layer (#645)

`templates/axioms.md` is the single canonical source for the workflow’s five tie-breaking axioms
(correct first; then save human time; then spend as little as possible; machines decide facts,
humans decide values; own your own verdicts) **and for the standing-default paragraphs beneath them**
— the file’s own intro distinguishes the two, because a standing default read as a tie-breaker
applies only when nothing else settles the case, which inverts it. It reaches consumers by EMBEDDING
byte-identically into the surfaces that `testAxiomBlockByteIdentity` prints — never per-edition copies, since `templates/` has no runtime
`require()` consumer and the `BYTE_IDENTICAL_GROUPS` mechanism is built for that case, not this one.
Read the count off `node scripts/simulate-workflow-walkthrough.js --only
testAxiomBlockByteIdentity`, which prints it, rather than from this sentence. The drift guard is that
scenario, comparing the canonical file’s content against every surface it constructed — the six tracked
workflow-init command/skill files read from disk, the additive-runtime init surfaces rendered in memory
via the same sync scripts that generate them (one `sync-*-edition.js` per runtime, currently
opencode, kimi, grok, and cursor), and root `CLAUDE.md` and `README.md`. Those last two
are **hand-maintained, not generated**: `generate-routing-surfaces.js --write` does not touch them,
so an axiom edit must update both by hand or the guard reds the printed set. Each surface is
mutation-proven to fail on its own. The `next` routing surfaces carry a short reference
pointer to the block rather than the block itself. That pointer **is** a `required-blocks.js` entry
(`nx-first-principles`), checked by `scripts/test-route-reachability.js` inside `npm test`: it was
declared with the axiom layer, deleted in an unrelated extraction, and restored once a mutation
showed the pointer could be stripped from every obligated next surface with every chain still green. Its
obligated width is the literal `NEXT_SURFACES` in that file (currently 18 — three forges × claude,
codex, opencode, kimi, grok, cursor), for the reason the row on partially-anchored universes gives —
delete a forge and a derived comparison shrinks and passes over unchecked surfaces,
while the literal reds.

**Tie-breaker protocol.** Axioms apply only when no shipped rule already resolves a situation — walk
them in priority order. Recording a one-line derivation alongside the work is useful and never
required; nothing checks for it.

**Tighten-only boundary.** An axiom may only make an agent stricter, never looser — never cite an
axiom to justify skipping a check that ships. The mirror rule matters just as much and is easier to
forget: an axiom argument that a mechanism should not exist is exactly as admissible as one arguing
for more care. A rule that can only ratchet tighter is how a corpus grows while its owners believe
they are shrinking it.

See `docs/decisions/D-645-01.md`.

## Specify the result; the method is the agent's (#900–#903)

Hand an agent the **form of the result** and check whether it arrived. Do not specify how, and do not
inspect the route. When an agent gets it wrong it adapts — that is the premise ADR 0017 rests on, and
the bundle closing #900–#903 measured it at scale.

**The asymmetry that forced this.** Across that run the orchestrator issued two kinds of instruction.
Statements about the *result* — "prove the pin reds on the recorded baseline", "all three editions must
agree on this fixture", "`record` must never write inside `kaola-workflow/archive/**`" — held without
exception, and each time the agent found a route the orchestrator had not thought of. Statements about
*mechanism* failed **four times out of four**: an on-disk fixture construction `copyDir` makes
structurally impossible, a propagation flag (`--materialize-kernel`) that does not carry the file named,
a sidecar set called four members when it has five, and two test paths that do not exist. Every one was
corrected by the agent that received it, and could only be corrected because nothing obliged it to
comply. **A mechanism claim in a brief makes the agent wrong when it rots; the same fact offered as
evidence merely makes the agent check.**

**Adaptation covers visible error, which is most error — and not the error that matters.** All four
mechanism claims failed loudly: a command printed "0 file(s)", a grep returned the wrong count, a
fixture would not reproduce. The two defects that survived every suite were invisible from inside the
task — a guard whose condition is unreachable, where the tests pass and the mutation proof passes and
nothing in the agent's own loop distinguishes *armed* from *cannot fire*; and a fixture built with the
topology inverted, which greens everything it touches. Iterating never finds those, because the
feedback signal is itself wrong.

So "don't care how" is affordable on exactly two conditions.

**The result must be falsifiable.** "The sink must not lose evidence" cannot be checked. "Every required
archive path is present as a blob in the published commit" can, and it is what caught a symlink passing
the gate while a fresh clone did not carry the file. A vague goal does not free the agent; it relocates
the specification into the check, where nobody reads it.

**The check must not come from the doer.** Eleven green suites, a full-scope walkthrough and every
implementer's own mutation proof reported done-correctly on a bundle that destroyed user evidence at
exit 0. Self-verification tests the arm the author thought of: the recorder's producer/gate proof
exercised the inverted topology and left the shipped one untested. This is the **test custody** rule one
level up — whoever produces a result does not own the evidence that it is correct.

Two corollaries, both live in that run. A guard that cannot fail is worse than no guard because it reads
as coverage: **mutation-proving a guard proves it is armed, never that its condition is reachable.** And
a control that agrees with its positive leg is a signal to check the control, not evidence the guard
works — two agents shipped a control that had silently become the positive leg, one via an empty env var
hitting a `|| 'default'` fallback, one via a CLI mock keyed on the wrong subcommand name for one forge.
