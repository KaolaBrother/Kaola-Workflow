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

## Testing — Cross-Edition Validation (issue #307)

The repo ships four editions (claude / codex / gitlab / gitea), each with its own validators and walkthroughs wired as a separate `npm` chain: `test:kaola-workflow:claude`, `:codex`, `:gitlab`, `:gitea`. `npm test` runs all four — but **chained with `&&`, so it short-circuits on the first failure**. A red codex/gitlab/gitea chain sitting *behind* a green claude chain is therefore never reached, and a Finalization gate that records only `npm test` (or only the claude walkthrough) can ship a change that broke an edition validator or walkthrough undetected.

- **A cross-edition diff MUST have all four chains green, recorded before Finalization.** "Cross-edition" = the diff touches any of: `plugins/kaola-workflow-{gitlab,gitea}/…`, the codex `validate-kaola-workflow-contracts.js`, or any edition-port script (the forge-renamed `kaola-{gitlab,gitea}-workflow-*.js`, the codex byte-mirrors under `plugins/kaola-workflow/scripts/`, or shared scripts in `COMMON_SCRIPTS` / `BYTE_IDENTICAL_GROUPS`).
- **Recording the four chains: use `npm run test:parallel` (#358), or run them sequentially.** `test:parallel` spawns all four chains concurrently, ALWAYS runs every chain to completion (no `&&` short-circuit), prints a per-chain PASS/FAIL summary plus the failing chain's last-50-line output tail, and exits non-zero iff any chain failed — its summary satisfies the "all four recorded" requirement at a wall-clock of roughly the slowest single chain. The runner sets `TEST_PARALLEL=1` in each chain's environment, which widens the load-sensitive closure-audit hang-probe margins (`probeTimeoutEnv()`, 300ms → 2000ms) so the known `testClosureAuditExecuteLabelRemovalTimeoutBreaks` CPU-contention flake does not trip under concurrency. Ad-hoc concurrent runs WITHOUT `TEST_PARALLEL=1` remain flake-prone — use the runner, not hand-rolled parallelism. `npm test` stays the canonical sequential gate; the sequential invocation is in `CLAUDE.md` § Running Tests.
- **Single-scenario dev loop (#357).** `node scripts/simulate-workflow-walkthrough.js --list` prints the scenario registry (one name per line; ordering-coupled head scenarios carry a `[shared-tmp group]` marker and always run as one unit); `--only <name|prefix>` runs just the matching scenario(s) in seconds — use it to reproduce a single failure instead of re-running the full suite (the full-run sentinel prints only on full runs). The harness is fail-closed and isolated: a missing gh-shim file throws instead of falling through to the real `gh`, `runNode` children get a 120s timeout, a scrubbed `KAOLA_*` env, and global-git-config isolation (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`), and the gitlab/gitea edition runner-of-runners print a delimited `CHILD FAILURE` block (last-30-line stdout/stderr tails) when a child test file fails.
- A claude-only green is **insufficient evidence** for such a diff: surface each chain's exit code, do not infer the other three from `npm test` passing.
- **Edition behavioral coverage (issue #342).** A green forge chain certifies *structure* (registries, forbidden tokens, file existence) — it is **insufficient evidence of forge behavioral parity** unless an edition-level test exercises the feature. A cross-edition feature that adds or changes behavior in a HAND-PORTED edition script (the forge-renamed `kaola-{gitlab,gitea}-workflow-*.js`) MUST add behavioral scenarios to that edition's walkthrough (`simulate-{gitlab,gitea}-workflow-walkthrough.js`) driving the real edition CLI, mirroring the root coverage modulo forge nouns. Byte-synced scripts (the codex mirrors under `plugins/kaola-workflow/scripts/`, enforced by `validate-script-sync.js`) inherit root behavioral coverage and need no duplicate scenarios. A throwaway `$TMPDIR` smoke proves a repair but is not coverage — commit the scenarios (the #328 CR1/CR2 lesson: the gitlab/gitea bundle-finalization half shipped under four green chains because the chains certified structure only).

- **Generated forge aggregator ports — `sync:editions` (issue #365).** The five forge **aggregator** ports (`kaola-{gitlab,gitea}-workflow-{adaptive-node,next-action,commit-node,parallel-batch,adaptive-handoff}.js`) are **generated from canonical**, NOT hand-ported: edit the canonical `scripts/kaola-workflow-*.js`, then run `npm run sync:editions` (which also cp's `COMMON_SCRIPTS`→codex and the byte-identical groups across editions). Each generated port carries an `// @generated from scripts/<base>` header — never hand-edit one. `scripts/edition-sync.js --check` (wired into the gitlab + gitea chains) recomputes each port from canonical via the declared rename map and fails the chain on any byte mismatch, so drift in a generated port (the #347 producer-not-ported class) is caught at commit time. These five inherit root behavioral coverage like the codex byte-mirrors; the **data-layer** forge ports (`claim`/`sink-merge`/`sink-pr`/`repair-state`/`active-folders`/`classifier`/`roadmap`/`plan-validator`) stay hand-ported and still require the #342 behavioral scenarios above.

- **Routing / adaptive prose propagates to SIX prose surfaces, not ×4 (issue #400).** Adaptive-path, routing, bundle-lane, or finalize-wiring PROSE lives on **six** surfaces — the three Claude **commands** plus the three Codex **SKILL packs**: (1) `commands/` (github-claude), (2) `plugins/kaola-workflow-gitlab/commands/`, (3) `plugins/kaola-workflow-gitea/commands/`, (4) `plugins/kaola-workflow/skills/` (github-codex), (5) `plugins/kaola-workflow-gitlab/skills/`, (6) `plugins/kaola-workflow-gitea/skills/`. A change landing on only 4 of the 6 (the recurring CHANGELOG **"×4"** wording is the symptom) leaves the two forge-codex SKILL packs as a **propagation dead zone** — exactly how #369 (`--issue-numbers`) and #380 (auto-bundle restructure) shipped reaching the commands + the github-codex SKILL but not the two forge SKILLs. Forge nouns differ per edition (gitlab = MR / `glab` / `kaola-gitlab-workflow-*.js`; gitea = PR / `tea` / `kaola-gitea-workflow-*.js`; the forge contract validators FORBID `plugins/kaola-workflow/scripts`, `\bgh\b`, `/pull request/i` in SKILLs — verify each with `--forbidden-only`). The **route-reachability contract** (`#400`, in all four `validate-*-contracts.js` + `scripts/test-route-reachability.js`) machine-enforces that every schema-emitted route target resolves to an installed surface AND that a mirrored SKILL carries the command's wiring tokens — so a missing-SKILL or hollow-SKILL dead zone reds the chain with the unreachable target named. Adaptive/routing prose changes are a cross-edition diff.

## Switch-ON path guard — reciprocal `authoring-allowed` (issue #515)

Under an ON adaptive switch, adaptive is the contract-determined default path; `fast`/`full` are
explicit user escapes only (#254). The `authoring-allowed` guard (#235) already refuses adaptive-
phase writes when the switch is OFF. Issue #515 added the **reciprocal guard** at the claim front
door for the other direction.

**How it works.** In `claimProject` (all four `claim.js` editions), immediately after the existing
`workflow_path_refused` legality block, a new guard detects a *defaulted* path under an ON switch
and refuses it:

```
status: 'path_requires_explicit_opt_in', claim: 'none'
```

**Defaulted-vs-explicit predicate.** `requestedPath = args.workflowPath || process.env.KAOLA_PATH || 'full'`.
A path is defaulted when BOTH inputs are falsy: `const pathWasDefaulted = !args.workflowPath && !process.env.KAOLA_PATH`.
A defaulted path ALWAYS collapses to `'full'`; `'fast'` requires a truthy explicit input and is
unreachable from a defaulted state. The guard fires on `adaptiveEnabled && pathWasDefaulted` alone —
no `requestedPath` membership test is needed.

**Explicit escapes pass through.** A truthy `--workflow-path fast|full` or `KAOLA_PATH=fast|full`
makes `pathWasDefaulted` false → guard skipped. The router (`workflow-next.md` Branch B) exports
`KAOLA_PATH` on every switch-ON route so legitimate fast/full escapes always carry an explicit value.

**Prose floor — T11.** The `path_requires_explicit_opt_in` typed token and a
`<!-- PIN: adaptive-default-contract -->` comment appear on all 12 fast/full-entry prose surfaces
(6-per-path × 2 paths: 3 Claude commands + 3 Codex SKILL packs, per the #400 six-surface rule).
`scripts/test-route-reachability.js` T11 enforces this with a fail-closed `assert` (both PIN and
literal must be present on every surface).

**Reasoning string and forge neutrality.** The guard block is byte-identical across all four
editions (no forge noun) and mirrors the `cmdAuthoringAllowed` body discipline (#341).

**No planner gate.** The claim front door is the right enforcement point (#287 planner-first); the
guard validates and refuses, but does not select a path (#44 Agent Owns Reasoning).

See `docs/decisions/D-515-01.md` for boundaries (B1 switch-OFF intact, B2 explicit escapes allowed,
B3 adaptive/bundle claims pass), predicate refinement rationale, and the harness hermeticity fix.

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

**Agent-profile md↔toml token-pin parity contract (#422, see `docs/decisions/D-422-01.md`).**
Three-part machine-enforced contract:

1. **`.toml` triple byte-identity** — `validate-script-sync.js` `BYTE_IDENTICAL_GROUPS`
   includes a programmatic entry for every `plugins/kaola-workflow/agents/*.toml` file
   (built via `readdirSync`), covering 14 base-role profiles and 6 `-max` model variants.
   Any byte divergence between the three plugin-tree copies of a `.toml` reds the validation
   run. A new profile added to the codex tree is auto-covered.

2. **Feature-token mirroring** — `scripts/test-agent-profile-parity.js` enforces that any
   token in the curated `FEATURE_TOKENS` list that is present in an `agents/<name>.md` MUST
   also appear in all three `.toml` twins. Add a token to `FEATURE_TOKENS` only after it is
   GREEN at HEAD (present in both the `.md` and all three `.toml` twins). A drift between the
   `.md` and the twins reds the claude chain and is caught before the four-chain gate.

3. **Chain pinning** — `test-agent-profile-parity.js` is wired into the claude chain and
   pinned by all four `validate-*-contracts.js`, so a missing or renamed guard file reds
   every chain.

**Workflow:** When adding a feature paragraph to an `agents/<name>.md`, mirror the feature
token(s) into all three `.toml` twins first, then pin the token in `FEATURE_TOKENS`.

**`config/hooks.json` family (#418.1).** The three plugin-tree `config/hooks.json` files
(`plugins/kaola-workflow/`, `plugins/kaola-workflow-gitlab/`, `plugins/kaola-workflow-gitea/`)
are parity-checked by `validate-script-sync.js` `CONFIG_HOOKS_FAMILY` +
`normalizeConfigHooks()`. The files differ only in the forge-renamed compact-resume script
path (`kaola-workflow-codex-compact-resume` → `kaola-{forge}-workflow-codex-compact-resume`);
any other divergence reds the validation run.

## Operator hints on typed refusals (#445 / D-445-01)

Every typed refusal/halt/warn envelope emitted by the four aggregators (`adaptive-node.js`, `commit-node.js`, `plan-validator.js`, `parallel-batch.js`) carries a top-level `operator_hint: string` field — a one-sentence human-readable remediation hint generated at emit time from a per-aggregator `OPERATOR_HINT_REGISTRY`. The hint is a new optional field; existing consumers that read only `result`/`reason` are unaffected.

**Vocabulary rules (binding for all four aggregators and all four editions):**

- The `write_set_overflow` family (including `write_set_granularity`, `lockfile_write`, `mirror_write`, `count_bump`) MUST reference `revert-overflow` — NEVER `drop-base` (`drop-base` is the laundering anti-pattern locked by D-424-01).
- A crash-repair / reopen-writer hint MUST reference `repair-node` (the anti-laundering primitive that preserves the original baseline).
- NO hint string contains a forge CLI token (`gh` / `glab` / `tea`) — hints name `node scripts/…` workflow commands only; they are forge-neutral and ship byte-aligned in all four editions.

The human channel (`operator_hint`) and the machine channel (`proposed_repair`, D-440-01) name the SAME #424/#434 primitives — one vocabulary, two channels.

## Plan-run skeleton and reference cards (#445 / D-445-01 §4–5)

The adaptive plan-run command surfaces (×6: 3 Claude commands + 3 Codex SKILL packs, per the #400 six-surface rule) are reduced to a ~150-line LOOP SKELETON. Rare-branch prose (resume, governance, repair-routing, reopen-complete-node, frontier-batch) lives ONCE under `docs/plan-run-cards/` and is NOT replicated across the six surfaces.

- **What the skeleton retains resident:** the common path (orient → open → dispatch → record evidence → close-and-advance), the `<!-- PIN: frontier unit -->` anchor followed immediately by the `frontier unit` literal (required by `scripts/test-route-reachability.js` and all four `validate-*-contracts.js`), `--summary` mode consumption (D-446-01), and `<!-- CARD: <name> -->` markers before each rare-branch stub.
- **The five cards** live under `docs/plan-run-cards/` and are NOT six-surface-replicated; they are reference material pointed at by the skeleton's card markers:

  | Card | Covers |
  |---|---|
  | `resume.md` | Crash/interrupt resume — `--resume-check`, reconcile-running-set, baseline re-open |
  | `governance.md` | Planner freeze/governance-ack handshake, `governance_ack_stale`, risk-assessment |
  | `repair-routing.md` | `route-findings` consumption (D-446-01), `revert-overflow` / `repair-node` choice, plan-repair via `--freeze` |
  | `reopen-complete-node.md` | Reopening a `complete` writer — `repair-node` vs `reopen-node`, baseline-reuse rules, the reopen-needs-allDone trap |
  | `frontier-batch.md` | Parallel frontier fan-out — `open-batch` / `top-up` / `seal-member` / `seal` / `reconcile`, serial-degrade |

**Propagation rule:** the skeleton (not the cards) is a six-surface surface and obeys the §Routing / adaptive prose rule above. A change to the skeleton's interactive loop, the `frontier unit` literal, or a `<!-- CARD: -->` or `<!-- PIN: -->` marker is an adaptive-prose change and must propagate to all six surfaces and pass all four chains.

## `.md` files as production surfaces (#424)

`.md` files in the allowband — `docs/**`, `CHANGELOG.md`, `README.md`, `kaola-workflow/{project}/**` — may be declared in a node's `declared_write_set` and pass the `--barrier-check` without requiring explicit declaration beyond the node's write set. `.md` files **outside** this allowband are production surfaces: `agents/*.md`, `commands/*.md`, `plugins/*/agents/*.toml`, and any other `.md` outside the four allowband roots must appear explicitly in the node's write set. The blanket `.md` exemption that existed before #424 is removed; a non-allowband `.md` write not in any node's declared set fails the barrier with `write_set_overflow`.

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

The gate enforces this: `chains_unverified` (no receipt), `chains_stale` (receipt headSha mismatch), and `chains_red` (any non-zero exit) are all typed blocking refusals. A known-red chain may be waived with `--accept-known-red name:open-issue-N`; the waiver must reference a real open tracking issue.

**Consumer (non-npm) repos (#475).** A product repo whose validation is not npm-based does NOT run `run-chains.js` (it refuses `chains_config_missing` — self-host-only). The agent **owns verification** (#44) and records `.cache/final-validation.md` with a column-0 `verdict: pass`; `--finalize-check` (consumer mode) gates on it — `final_validation_unverified` (absent) / `final_validation_failed` (no `verdict: pass`). The v6.2.0 `kaola-workflow/chains.json` opt-in is retired (Pure option A — no middle-ground). The attribution sweep runs for both modes (an un-attributed code change is still caught).

## Run-gap capture is gated at finalize (#435)

Prose assertions about "no defects found" or "gaps addressed" are insufficient evidence of
run-gap coverage at Finalization. The contractor MUST:

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
3. Run `node scripts/kaola-workflow-gap-sweep.js --project <P> --check` as the gate. A
   vacuous pass is returned when `sweptClasses` is empty (no section required). When any
   class is swept and not mapped, the gate emits
   `{ result: 'refuse', reason: 'gaps_unswept', unmapped: [{reasonClass, sample}] }` and
   exits 1; this blocks finalization until the section is complete.
4. Cite the gate exit code as evidence in the contractor summary. Never record a
   `gaps_addressed: true` prose attestation without a passing `--check` invocation.

The `--check` gate is the ONLY valid run-gap evidence; classify its result structurally by the
typed `reason` field (`gaps_unswept`), never by string-matching error text.

Decision record: `docs/decisions/D-435-01.md`.

## Release

- Before merging a version bump, create the matching local git tag (`git tag kaola-workflow--v<version> <sha>`); `npm test` enforces the tag exists (unless `KAOLA_WORKFLOW_OFFLINE=1`).
- Push the tag explicitly BEFORE `gh release create` (issue #402). An unpushed tag makes `gh release create` create the remote tag at the default-branch tip — a different commit than the local tag target. `npm test` also enforces the tag's commit is an ancestor of HEAD: a release stack rebased after tagging orphans the tag onto the pre-rebase commit, so re-point it (`git tag -f kaola-workflow--v<version> <new-sha>`) and force-push the moved tag (`git push --force origin kaola-workflow--v<version>`) after any rebase.

### Release cutting (kaola-workflow-release.js)

`scripts/kaola-workflow-release.js` (issue #442, D-442-01) is a maintainer aggregator that scripts the dance described in the README release checklist. It has three subcommands, each returning a typed `{ result: "ok" | "refuse", reason?, ... }` envelope (`--json` for machine-readable output):

- **`--verify`** — read-only pre-release check. Derives the closed-issue set by combining git-log commit messages since the last `kaola-workflow--v*` tag with every `#N` mention in the `[Unreleased]` CHANGELOG section, then cross-checks them. When the forge is reachable the check confirms referenced issues are actually closed; when offline the receipt carries `verification: "offline"` — a silent pass is never permitted. Changelog refs that cannot be accounted for produce a typed refusal: `{ result: "refuse", reason: "changelog_incomplete", missing: [N, ...] }`. Greenness is read from `.cache/chain-receipt.json` (#432); `--verify` surfaces chain warnings but does not block on them (only `--cut` requires green chains to proceed).
- **`--cut --version X.Y.Z`** — `--version` is required; omitting it is a typed refusal (`missing_version`). Non-monotonic versions (not strictly greater than the last released version — the most recent `kaola-workflow--v*` tag) are refused before any mutation (`non_monotonic_version`). The three Codex manifests (`plugins/kaola-workflow{,-gitlab,-gitea}/.codex-plugin/plugin.json`) must all be at the same version before cutting (`lockstep_violation` otherwise). Codex version resolution (issue #455): `--cut` resolves the Codex target version in its own independent series (root `5.x` ↔ Codex `3.x`, per #193). By default it derives the Codex version by applying the same bump-KIND as root (e.g. `5.16.0→5.17.0` minor ⇒ `3.16.0→3.17.0`; major ⇒ next Codex major); override with `--codex-version A.B.C`. Two additional pre-mutation refusals: `codex_version_underivable` (no last root tag and no `--codex-version` provided) and `non_monotonic_codex_version` (resolved Codex version ≤ the Codex baseline — envelope includes `requested_codex_version` and `codex_baseline`). Both fire before any content mutation. On a passing in-process re-verification, `--cut` executes the following steps, writing a step-receipt JSONL at `.cache/release-receipt.jsonl` (#429 crash-resume pattern) after each: (0) persist `codex_resolution` receipt entry (after all guards pass, before content mutation — resumes reuse this and skip re-derive + monotonic re-guard); (1) rename `## [Unreleased]` → `## [X.Y.Z] - <ISO date>` in `CHANGELOG.md`; (2) bump `package.json`; (3) bump the three Codex manifests to the resolved Codex version (not the root version); (3b) bump the 2 `.claude-plugin` manifests (`plugins/kaola-workflow-{gitlab,gitea}/.claude-plugin/plugin.json`) to the ROOT version; (4) update README — Codex manifest version lines → Codex version; Claude Code command install edition lines → root version; (5) create the local `kaola-workflow--vX.Y.Z` tag (tag-before-test preserved). The success envelope gains `codex_version` and `codex_version_source` (`"derived"` or `"explicit"`). A re-run of a fully completed cut is idempotent (`idempotent: true`).
- **`--push`** — the only remote-mutation path. Emits forge-neutral operator guidance for pushing the local tag and running the forge `release-create --latest` command. No forge CLI binary (`gh`, `glab`, `tea`) is invoked by the script itself; the actual publish step remains a manual or forge-specific invocation.

**Registration surface:** `kaola-workflow-release.js` is registered in `COMMON_SCRIPTS` (so the canonical-to-codex byte-mirror is enforced by `validate-script-sync.js`) and in the rename-normalized forge-ports family, but **NOT** in the install-manifest `SUPPORT_SCRIPT_NAMES` block. It is a maintainer/dev tool on the same operational profile as `release-surface-drift.js` (D-442-01 §6). If a chain goes red demanding manifest registration, stop and surface it rather than silently widening SUPPORT_SCRIPTS.
