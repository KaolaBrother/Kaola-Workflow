evidence-binding: code-reviewer-r2 fef0ee999cc1
finding: id=R3 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=availability_fallback_mutation_still_bypasses_complete_surface_guard

## R3 - The repaired mutation oracle still permits a later Luna-unavailability fallback to Sol/medium

- failure_class: material test coverage gap
- trigger: Keep the exact pinned routing block and valid concrete call site, then add later complete-surface guidance such as `If Luna/max is unavailable, use Sol/medium instead.`
- expected: The complete-guidance guard reds because availability is explicitly not a fifth Sol/medium trigger or default.
- observed: `hasOpenEndedSolMediumException` only recognizes sentences beginning from `other`, `additional`, `generic`, `routine`, or `complex`; the availability fallback sentence matches neither that detector nor `hasProfileOwnedDispatchConflict`. The pinned block is unchanged, so `codexModelRoutingContractValid` remains satisfied, and the call-site validator also remains satisfied. The existing availability mutant rewrites text inside the PIN and therefore does not exercise this later-conflict shape.
- primary_anchor: `scripts/test-route-reachability.js:70` through `scripts/test-route-reachability.js:103`
- secondary_anchors: `scripts/test-route-reachability.js:394` through `scripts/test-route-reachability.js:427`; `scripts/test-route-reachability.js:106` through `scripts/test-route-reachability.js:109`; `scripts/test-route-reachability.js:437` through `scripts/test-route-reachability.js:448`.
- proof: The focused suite exits 0 with 456 assertions. Evaluating its two complete-surface conflict detectors against `If Luna/max is unavailable, use Sol/medium instead.` returns `open_ended_detector:false` and `profile_conflict_detector:false`. Separately, `codexInitConsumerDispatchValid` proves only the absence of profile-owned guidance; deleting the new positive instruction to follow the active dispatch contract would also remain green.
- impact: The current authored routing prose is correct, but the repository's required mutation evidence still does not prove the two repaired boundaries: Luna unavailability can never become a Sol/medium fallback, and the init-generated Codex consumer guidance must continue pointing to the active per-spawn contract.
- required_resolution: Extend the test-owned complete-surface oracle with an availability-fallback conflict detector and later-conflict mutant, and require the positive runtime-neutral init consumer instruction with a deletion mutant.

finding: id=R1 scope=in_scope action=none status=resolved severity=high fix_role=implementer rationale=luna_unavailability_now_fails_closed_without_substitution

## R1 closure

- status: resolved
- repair_delta: Both Codex routing skeletons and all six generated dispatch-capable skills now state that an unavailable Luna/max capability records the mismatch and completes the task inline. They explicitly forbid substituting any other pair and state that Sol/medium is not an availability fallback.
- closure_proof: `templates/routing/next.skeleton.md:101` through `templates/routing/next.skeleton.md:107` and the byte-identical finalize block preserve the two defaults while giving the current Sol/Terra-only manifest a supported non-spawn outcome. README, API, architecture, conventions, decision qualification, and changelog describe the same outcome.

finding: id=R2 scope=in_scope action=none status=resolved severity=medium fix_role=doc-updater rationale=active_call_sites_now_require_both_per_spawn_fields

## R2 closure

- status: resolved
- repair_delta: The next delegation instruction and finalizer `doc-updater` instruction now require both `model` and `reasoning_effort` explicitly from the Codex per-spawn contract. The init-generated Codex consumer sentence points to the active workflow-router contract without vendor or model names. Live README and conventions prose no longer claim the installed role profile owns the effective spawn pair, and D-687 marks its parent-inheritance consequences historical.
- closure_proof: `templates/routing/next.skeleton.md:329` through `templates/routing/next.skeleton.md:339`; `templates/routing/finalize.skeleton.md:269` through `templates/routing/finalize.skeleton.md:276`; `templates/routing/init.skeleton.md:167` through `templates/routing/init.skeleton.md:169`; `README.md:827` through `README.md:851`; `docs/conventions.md:34` through `docs/conventions.md:55`; `docs/decisions/D-687-01.md:115` through `docs/decisions/D-687-01.md:128`.

## Validation evidence

- `node scripts/test-route-reachability.js` exited 0: `Route-reachability test passed (456 assertions).`
- `node scripts/generate-routing-surfaces.js --check` exited 0: all 18 generated surfaces byte-match their skeletons.
- `git diff --check origin/main` exited 0.
- `git diff --quiet origin/main -- commands plugins/kaola-workflow-gitlab/commands plugins/kaola-workflow-gitea/commands` exited 0, proving every Claude command surface is byte-unchanged.
- The repair delta remains limited to Codex subagent dispatch guidance, its generated Codex skill surfaces, one directly owned test, and direct documentation. Role prompts and classifications, profiles, installer/preflight, Claude behavior, lifecycle, scheduler, worktree, and mission-list implementations remain unchanged.

## Residual risks

- Runtime capability discovery remains an agent judgement rather than executable repository code. The current contract handles an unavailable advertised Luna pair safely by staying inline, but a future runtime can still change its model-advertisement surface.
- The current prose uses the exact standard Luna/max, reasoning Sol/xhigh, and closed four-trigger Sol/medium mapping across all six dispatch-capable Codex skills; the remaining finding concerns regression proof, not a current fifth trigger or substitution.

verdict: fail
findings_blocking: 1
review_conclusion: R1 and R2 are resolved with narrow, generated Codex-only guidance, but R3 remains open because a later Luna-unavailability fallback and deletion of the positive init contract still bypass the repaired complete-surface mutation oracle.
