evidence-binding: code-reviewer d337f634cb8b
finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=implementer rationale=luna_not_in_current_spawn_manifest

## R1 - The standard-tier default cannot be dispatched through the current Codex spawn contract

- failure_class: runtime capability mismatch
- trigger: A Codex workflow delegates any standard-tier role, such as `implementer`, and follows the new required packet with `model: "gpt-5.6-luna"` and `reasoning_effort: "max"`.
- expected: `agents.spawn_agent` accepts that exact pair and opens the named role.
- observed: The current `agents.spawn_agent` manifest supplied to this review advertises only `gpt-5.6-sol` and `gpt-5.6-terra` as available model overrides. Luna is not an advertised spawn override, so the default packet required by the candidate has no supported call shape in the runtime being used to ship it.
- primary_anchor: `templates/routing/next.skeleton.md:84` through `templates/routing/next.skeleton.md:87`
- secondary_anchors: `templates/routing/finalize.skeleton.md:84` through `templates/routing/finalize.skeleton.md:87`; all six generated Codex next/finalize skills carry the same bytes.
- reproducible_scenario: From this review session, form the required standard-role call with `agent_type: "implementer"`, `fork_turns: "none"`, `model: "gpt-5.6-luna"`, and `reasoning_effort: "max"`; the model is outside the manifest's advertised override set. No compliant Luna call can be formed from the supplied capability contract.
- proof: The candidate hard-codes Luna as the unconditional standard default, while its new test only searches Markdown strings. Neither the route test nor the profile preflight queries or proves spawn-model availability. The earlier successful Sol/Terra override probes do not prove Luna.
- impact: Standard roles are the normal production path. On the current Codex capability surface, the central new default can fail before a child opens, so this is not merely a degraded badge or documentation mismatch.
- required_resolution: Obtain a real successful Luna/max `agents.spawn_agent` receipt on the supported target surface, or define an explicit in-scope capability outcome that preserves the closed two-tier contract without silently substituting a third default.

finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=live_dispatch_guidance_still_requires_profile_inheritance

## R2 - Live Codex instructions still direct profile/inheritance routing and can omit the new effort override

- failure_class: conflicting operational contract
- trigger: A Codex orchestrator reaches the specific delegation instruction in `workflow-next` or the finalizer's `doc-updater` step, or follows the consumer guidance produced by `workflow-init`.
- expected: The instruction used at the call site tells Codex to pass both exact per-spawn fields from the role tier, including Luna/max for `doc-updater`.
- observed: The specific next/finalize instructions still say only to pass the role's configured model. The finalizer never names `reasoning_effort` at the `doc-updater` call site. The init-generated consumer guidance says each agent ships its model in its installed profile, although the Codex profiles deliberately omit both runtime keys. Current README and conventions text also says Kaola does not rely on or override per-spawn values and reads the model from the profile. These statements conflict with the new global paragraph and give an orchestrator a concrete path to omit the required pair.
- primary_anchor: `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md:224` through `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md:225`
- secondary_anchors: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:333` through `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:337`; `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md:94` through `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md:99`; `README.md:825` through `README.md:836`; `docs/conventions.md:32` through `docs/conventions.md:41`; `docs/decisions/D-687-01.md:112` through `docs/decisions/D-687-01.md:121`.
- proof: Every named Codex profile still omits top-level `model` and `model_reasoning_effort`. Therefore "configured model" and "ships its model in its installed profile" cannot resolve the new pair. The focused route test passed with all of these contradictory instructions present.
- impact: This directly affects the finalizer `doc-updater` path requested for review and can produce parent-inherited or model-only spawns, violating both exact mappings and the per-spawn effort requirement.
- required_resolution: Reconcile the specific Codex call-site guidance and the directly contradictory live documentation. Keep the consumer-facing init wording vendor-neutral, but remove the false profile-owned-model statement and make the active Codex skill contract unambiguous about both spawn fields.

finding: id=R3 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=mutation_guard_checks_only_one_compliant_paragraph

## R3 - The mutation suite does not prove an effective closed dispatch contract

- failure_class: material test coverage gap
- trigger: A later edit leaves the exact pinned paragraph intact but adds a conflicting call-site instruction, omits `reasoning_effort` from a concrete spawn instruction, or adds a prose exception such as "other complex work may also escalate" without creating a fifth Markdown bullet.
- expected: The guard reds whenever a shipped Codex dispatch surface permits values or exceptions outside the exact two defaults and four recorded Sol/medium reasons.
- observed: `codexModelRoutingContractValid` extracts only the first bounded PIN block and checks positive substrings plus a four-bullet count. It does not inspect the complete dispatch-capable skill, does not validate an actual `agents.spawn_agent` packet, and has no forbidden-conflict check. Its "unbounded fifth trigger" mutant tests only one fifth-bullet spelling. The suite is green now even though R2's contradictory operational instructions remain in the same skills.
- primary_anchor: `scripts/test-route-reachability.js:63` through `scripts/test-route-reachability.js:95`
- secondary_anchors: `scripts/test-route-reachability.js:332` through `scripts/test-route-reachability.js:364`
- proof: `node scripts/test-route-reachability.js` exited 0 with 402 assertions on the candidate while the later next/finalize call-site prose still instructs configured-profile model routing. Adding a non-bullet permissive sentence would preserve every predicate in `codexModelRoutingContractValid`.
- impact: The repository's mutation-proof requirement is not met for the key closed-list and exact-call boundary, so a green suite cannot support the acceptance claim that exact spawn values and only four exceptions are proven.
- required_resolution: Extend the test-owned oracle to validate the effective complete Codex dispatch instruction, including both concrete spawn fields and forbidden contradictory or open-ended alternatives; mutation-prove at least the non-bullet fifth-trigger and later-call-site-conflict shapes.

## Validation evidence

- `node scripts/test-route-reachability.js` exited 0: `Route-reachability test passed (402 assertions).`
- `node scripts/generate-routing-surfaces.js --check` exited 0: all 18 surfaces byte-match the skeleton.
- `git diff --check origin/main` exited 0.
- The complete candidate changes only the two routing skeletons, their six generated Codex skill surfaces, one focused test, and directly related documentation. Claude command surfaces are byte-unchanged against `origin/main`; role prompts, classifications, profiles, installer/preflight, lifecycle, scheduler, worktree, and mission-list implementations are unchanged.

## Residual review notes

- The authored mapping itself is exact and byte-identical across all six Codex next/finalize skills: standard Luna/max, reasoning Sol/xhigh, and temporary standard Sol/medium.
- The four named reasons match issue #924, require a selected trigger plus task-specific rationale before dispatch, exclude routine implementation, preserve role classification and defaults, and return later standard spawns to Luna/max.
- A full walkthrough was not rerun after admitting the defects above; the reviewer contract short-circuits the expensive validation once blocking candidate defects are established.

verdict: fail
findings_blocking: 3
review_conclusion: The candidate preserves its narrow file scope and generated ownership, but the unsupported Luna call, conflicting live dispatch guidance, and incomplete mutation oracle prevent the exact Codex per-spawn contract from being review-complete.
