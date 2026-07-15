evidence-binding: n1-repository-surface-map 434a01548541
findings: complete repository surface map
  outcome: complete_repository_surface_map

  facts:
    profile_sources:
      - The committed Codex profile source is the three plugin `agents/` trees. Each tree has exactly 16 TOMLs (48 total), and every same-role triple is byte-identical at the current revision. The standard class is `code-explorer`, `knowledge-lookup`, `tdd-guide`, `implementer`, `doc-updater`, `issue-scout`, `contractor`, and `metric-optimizer`; the reasoning class is `planner`, `code-architect`, `build-error-resolver`, `code-reviewer`, `security-reviewer`, `adversarial-verifier`, `workflow-planner`, and `synthesizer` (`plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:68-80`; `scripts/kaola-workflow-adaptive-schema.js:93-111`).
      - Every current TOML has top-level `model = "gpt-5.6-sol"`; the eight standard profiles have `model_reasoning_effort = "medium"`, and the eight reasoning profiles have `model_reasoning_effort = "xhigh"`. Representative standard source: `plugins/kaola-workflow/agents/code-explorer.toml:1-6`; representative reasoning source and floor prose: `plugins/kaola-workflow/agents/synthesizer.toml:1-12`; the workflow-planner also embeds the entire old static-class authoring rule at `plugins/kaola-workflow/agents/workflow-planner.toml:46-50`.
      - `config/agents.toml` is registration/identity metadata, not the model/effort source. Installer validation joins each TOML to its config entry for `description` and `nickname_candidates`, while model/effort policy is duplicated in installer/preflight constants and adaptive schema (`plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:212-287`, `scripts/kaola-workflow-codex-preflight.js:756-851`).

    installer_and_preflight_flow:
      - The three installers are a byte-identical group; their `validateProfileText` requires the exact Sol/medium or Sol/xhigh pair by role and rejects a missing, partial, illegal, or wrong-class pair (`plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:208-287`; mirror group declared at `scripts/validate-script-sync.js:199-207`). Source validation runs before install, installed profiles are copied atomically, and post-verification reuses the same validator (`plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:344-378,486-505,682-713`).
      - The preflight is byte-identical across root plus all three plugins (`scripts/validate-script-sync.js:187-196`). `inspectScope` schema-checks every required installed profile and classifies invalid legacy/partial/unpinned profiles in `malformed` (`scripts/kaola-workflow-codex-preflight.js:1018-1099`). Priority is `profiles_malformed`, then stale files, missing profiles, config, and managed-block drift (`scripts/kaola-workflow-codex-preflight.js:1348-1487`). With default autofix it locates the edition-local installer, reinstalls project-local profiles, and re-runs all checks; `--no-autofix` reports the safe repair without writing (`scripts/kaola-workflow-codex-preflight.js:1502-1616`). Global freshness can satisfy the normal gate; stale global state falls through to project inspection/autofix, and doctor remains read-only.
      - There are two unrelated `model_reasoning_effort` scopes. Per-role `agents/*.toml` pins are the issue-687 target. The root-level key in `.codex/config.toml` is user-owned dispatch posture: `parseTopLevelModelReasoningEffort` reads only the TOML root, and `deriveDispatchPosture` maps `ultra` to proactive while never writing it (`plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:1201-1259`; same logic in preflight). `commands/workflow-init.md`, all three workflow-init SKILLs, README `:628-646`, docs/API posture fields, and D-598-01 describe/assert this root setting and must not be mechanically stripped with profile pins.

    tier_schema_dispatch_cards_and_enforcement:
      - `model` in `workflow-plan.md` is currently portable declarative metadata normalized by `normalizeTier`: `reasoning|standard` plus legacy `opus|sonnet` aliases (`scripts/kaola-workflow-adaptive-schema.js:45-70`). Claude maps it to opus/sonnet; opencode maps it to provider effort variants. Those two mappings and tier-derived wait budgets (`reasoning:40`, `standard:20`) are independent of the Codex child pin and must remain (`scripts/kaola-workflow-adaptive-schema.js:72-77,166-186,204-291`).
      - Current Codex resolution is not inheritance. `dispatchModelCodex` maps both tiers to `gpt-5.6-sol`; `dispatchEffort` maps reasoning to xhigh and standard to medium; absent input produces null `role_default` sentinels (`scripts/kaola-workflow-adaptive-schema.js:79-86,128-164`). `codexProfilePolicy` emits `codex_profile_mode:'pinned'`, role-static `codex_profile_tier`, and `codex_profile_compatible` based on plan-tier/class equality (`:88-126`). `modelDisplay` renders the old pair as `gpt-5.6-sol (<medium|xhigh> reasoning effort)` (`:305-326`).
      - `buildDispatch` is the production card seam. It carries raw `model`, `codex_model`, `codex_model_source`, `codex_reasoning_effort`, `codex_reasoning_effort_source`, the three `codex_profile_*` fields, wait budget, and optional `model_display` (`scripts/kaola-workflow-adaptive-node.js:1343-1400`). The summary reduces the card to `effort=<medium|xhigh|unresolved>` and explicitly says unresolved is not inheritance (`:1484-1504`). The same fields propagate through `open-next`, `open-ready`, fused advance, frontier previews, and handoff/first-node displays.
      - `codex_tier_unresolved` is not emitted mechanically by the scripts; it is the routing refusal when card model/effort is null. `codex_profile_tier_mismatch` and `codex_profile_runtime_mismatch` are likewise prose-enforced typed refusals: the former checks `codex_profile_compatible`, the latter checks child JSONL against the pinned pair. All three are pinned into routing tests/validators rather than raised inside `adaptive-node` (`templates/routing/plan-run.skeleton.md:79-114`; `scripts/test-route-reachability.js:221-242`).
      - `REASONING_FLOOR_ROLES` is exactly `{synthesizer}` (`scripts/kaola-workflow-resolve-agent-model.js:41`). `enforceReasoningFloor` currently accepts only effective tier `reasoning|opus` and rejects standard/sonnet/empty as `reasoning_floor_violation` (`:43-77`). The production consumer is `computeNextAction`: after forming the ready set it checks each ready node's authored/resolved tier and refuses before emission (`scripts/kaola-workflow-next-action.js:143-163`). This proves only declarative tier today; it has no parent session model/effort proof input. Under inheritance, leaving this check unchanged would incorrectly treat a reasoning tier label as runtime floor evidence. The four resolver copies and four next-action copies therefore co-move with whatever explicit fresh session-posture proof n3 specifies.

    child_session_proof_and_routing_generation:
      - Canonical Codex proof prose is `templates/routing/plan-run.skeleton.md:79-114`: one probe per used static tier; inspect child JSONL `turn_context.model` and `.effort`; require standard=`gpt-5.6-sol`+medium and reasoning=`gpt-5.6-sol`+xhigh; refuse absent/stale/mismatch as `codex_profile_runtime_mismatch`; omit transient `model` and `reasoning_effort`; spawn named role with `fork_turns:"none"` in both v1/v2.
      - `scripts/generate-routing-surfaces.js:45-75` generates six plan-run outputs from that skeleton: `commands/kaola-workflow-plan-run.md`, GitLab/Gitea command twins, and the three Codex `kaola-workflow-plan-run/SKILL.md` packs. The Codex-only proof block appears in the three SKILLs at `:78-114`; the common summary's `codex_tier_unresolved` wording appears on all six at `:15-18`. `templates/routing/required-blocks.js` and `scripts/test-route-reachability.js` independently pin the required generated tokens.
      - The three Codex adapt SKILLs are intentionally matched and separately carry the old planner contract: standard -> Sol/medium, reasoning -> Sol/xhigh, every profile pins both, mismatch -> `codex_profile_tier_mismatch`, unresolved -> `codex_tier_unresolved` (`plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md:24-33`, same lines in GitLab/Gitea). Their workflow-planner spawn already omits transient pair overrides and uses `fork_turns:"none"` (`:210-216`).
      - Generated runtime families: canonical+Codex adaptive-node and next-action plus renamed GitLab/Gitea ports. `edition-sync` lists both as generated aggregators (`scripts/edition-sync.js:46-54`) and derives the forge filenames; direct hand edits to generated forge ports would be overwritten.

    mirror_groups:
      - 48 TOMLs: 16 byte-identical triples by role (current mechanical `cmp` check found zero drift).
      - Four byte-identical `kaola-workflow-adaptive-schema.js` copies (`scripts/validate-script-sync.js:178-184`).
      - Four byte-identical `kaola-workflow-resolve-agent-model.js` copies (`:132-138`).
      - Four byte-identical `kaola-workflow-codex-preflight.js` copies (`:187-196`).
      - Three byte-identical `install-codex-agent-profiles.js` copies (`:199-207`).
      - Two generated aggregator families, each canonical root + Codex twin + renamed GitLab + renamed Gitea (`scripts/edition-sync.js:46-54,64-75`).
      - Six generated plan-run surfaces from one skeleton (`scripts/generate-routing-surfaces.js:45-75`), with required-token manifest in `templates/routing/required-blocks.js`.

    focused_old_contract_assertions:
      - Profile pair/source schema: Codex walkthrough asserts every source role is exact Sol/medium or Sol/xhigh (`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js:1522-1537`) and exercises malformed -> `profiles_malformed` plus autofix -> ok (`:1663-1675`). GitLab/Gitea installer suites pin malformed/autofix behavior at `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:4136-4148` and `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js:3988-4000`.
      - Schema/resolver: `scripts/test-agent-model-resolver.js:25-44` requires the two role classes to cover the resolver registry and each class to resolve Sol plus medium/xhigh. `scripts/simulate-workflow-walkthrough.js:1926-1959` pins legacy opus/reasoning=xhigh and sonnet/standard=Sol/medium.
      - Dispatch cards/displays: `scripts/test-adaptive-node.js:11688-11744` asserts exact Sol/xhigh and Sol/medium card fields plus pinned compatibility/mismatch/null behavior; `:11814-11851` pins neutral/legacy mapping and pair-bearing `model_display`. `scripts/test-adaptive-handoff.js:279-285,341-354` pins first-node display strings.
      - Reasoning floor: `scripts/test-next-action.js:758-810` covers sub-floor ready synthesizer refusal, reasoning pass, non-floor control, and not-ready control. `scripts/test-agent-model-resolver.js` also covers resolver floor primitives/CLI later in the file. `scripts/test-agent-profile-parity.js:16-28,82-101` pins `REASONING_FLOOR_ROLES` prose into all three synthesizer TOMLs but currently does not check top-level model/effort or triple byte parity.
      - Routing: `scripts/test-route-reachability.js:213-242,305-323,941-949` pins `fork_turns:none`, omitted transient overrides, fresh child proof, all three typed Codex refusals, both exact static pairs, and `dispatch.codex_profile_mode` across the three SKILLs and manifest. `templates/routing/required-blocks.js` mirrors these reachability needles.
      - Contract validators: root Codex validator pins installer/preflight role arrays and exact standard/reasoning pairs (`scripts/validate-kaola-workflow-contracts.js:764-786`), static pair/proof/adapt/workflow-planner prose (`:882-901`), and all profile schema checks. GitLab equivalents are `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:908-927,998-1007`; Gitea equivalents are `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:913-932,1003-1012`.
      - Root-user posture assertions are deliberately not old child-pin assertions: `scripts/test-install-model-rendering.js:488-501,635-661,726-751`, the Codex walkthrough `:1160-1299`, and forge suites around GitLab `:3803-3932` / Gitea `:3655-3784` pin root `model_reasoning_effort=ultra` behavior. Preserve these while adding legacy installed-profile migration coverage.

    documentation_surface:
      - Current public static-pin contract is explicit in `README.md:183-189,564-568,732-743`, `docs/architecture.md:98-100,657-660,686-688`, and `docs/api.md:246,706-715,781,1767-1769,1825-1838`. These are correctly assigned to n8, not n4. Historical ADRs/investigations (notably D-451-01, D-582-01/02, D-598-01) record prior runtime facts and should not be bulk-rewritten; n8's new D-687-01 should explain the superseding current contract.

  n4_write_set_audit:
    declared_count: 96
    result: complete_with_one_conditional_test_path
    unavoidable_groups_present:
      - all 48 role TOMLs
      - installer triple; preflight/schema/resolver quadruples
      - adaptive-node and next-action canonical/Codex/forge generated quartets
      - skeleton, all six generated plan-run outputs, all three adapt SKILLs, and required-block manifest
      - root/Codex/forge installer walkthroughs, resolver/next-action/card/handoff/profile-parity/install-render/routing tests
      - root Codex plus GitLab/Gitea contract validators
    missing_paths: []
    unnecessary_paths:
      - None if n4 fulfills its brief. `scripts/test-agent-profile-parity.js` is the only conditional member: current code does not inspect top-level pins or byte-equality, so n4 must extend it (or an equivalent owned test) for the required all-48 unpinned/triple-parity proof. If n4 leaves it unchanged, that path would be unnecessary rather than evidence.
    intentionally_excluded:
      - `README.md`, `docs/api.md`, `docs/architecture.md`, and new `docs/decisions/D-687-01.md` belong to n8 after live proof.
      - `CHANGELOG.md` belongs to n9.
      - workflow-init command/SKILL surfaces and D-598-01 remain unchanged because they govern the root user-owned dispatch-posture setting.
      - `scripts/generate-routing-surfaces.js`, `scripts/edition-sync.js`, and `scripts/validate-script-sync.js` are generators/group definitions to run, not expected semantic edits.
      - `scripts/validate-workflow-contracts.js` and its plugin twin only pin the surviving `REASONING_FLOOR_ROLES` token, not the old Sol pair; no edit is forced unless n3 renames/removes that token.

  assumptions:
    - The exact inheritance representation and session-proof input are intentionally not selected here; n2 establishes runtime behavior and n3 owns that design.
    - The n4 set is judged against the stated invariant and current generated/mirror rules. A design that introduces a new durable proof field in a producer outside adaptive-node/next-action could expand the set, but no current code fact requires such a producer.

  unknowns_blocking_plan:
    - Whether omission of both top-level profile keys actually inherits both parent values in the installed Codex version; repository prose is contradictory historically, so config inspection is insufficient.
    - The exact freshness/binding form for parent-session model/effort proof and how it reaches `computeNextAction`; the current production seam accepts only role+tier and has no runtime proof input.
    - Whether `codex_tier_unresolved` survives as the name for absent declarative tier, is retired for valid inheritance, or splits from a new missing-session-proof refusal. n3 must settle this after n2.

  validation_commands:
    focused:
      - node scripts/test-agent-model-resolver.js
      - node scripts/test-next-action.js
      - node scripts/test-adaptive-node.js
      - node scripts/test-adaptive-handoff.js
      - node scripts/test-agent-profile-parity.js
      - node scripts/test-install-model-rendering.js
      - node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
      - node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
      - node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
      - node scripts/test-route-reachability.js
      - node scripts/validate-kaola-workflow-contracts.js
      - node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
      - node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
      - node scripts/edition-sync.js --check
      - node scripts/generate-routing-surfaces.js --check
    cross_edition_required:
      - npm run test:kaola-workflow:claude
      - npm run test:kaola-workflow:codex
      - npm run test:kaola-workflow:gitlab
      - npm run test:kaola-workflow:gitea
delegation_outcome: completed
