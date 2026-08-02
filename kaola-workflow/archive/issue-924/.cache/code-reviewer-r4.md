evidence-binding: code-reviewer-r4 033b1d6bcd57
## Findings

No admitted open findings.

finding: id=R3 scope=in_scope action=none status=resolved severity=medium fix_role=tdd-guide rationale=next_finalize_complete_surface_mutants_fail_closed

## R3 closure under the clarified boundary

- status: resolved
- proof: `hasAvailabilityFallbackConflict` is applied by both the complete routing-contract validator and the concrete call-site validator. The T19 loop appends `If Luna/max is unavailable, use Sol/medium instead.` to each of the six live Codex next/finalize skills and requires both validators to red. The focused suite passes 456 assertions, and an independent read-only count confirmed all 6 of 6 later availability-fallback mutants are detected.
- excluded_prior_leg: The former init positive-contract requirement is deliberately not reopened. Issue #924 now explicitly excludes workflow-init and initialized shared guidance because a repository can use multiple runtimes; the current candidate correctly removes that test and leaves every init surface unchanged.

finding: id=R1 scope=in_scope action=none status=resolved severity=high fix_role=implementer rationale=unsupported_luna_remains_fail_closed_inline

## R1 closure recheck

- status: resolved
- proof: All six live Codex next/finalize skills retain `gpt-5.6-luna` with `max` for standard roles and `gpt-5.6-sol` with `xhigh` for reasoning roles. If Luna/max is not accepted, the contract records the capability mismatch and completes the work inline. It explicitly forbids silent substitution, and Luna unavailability does not authorize Sol/medium.

finding: id=R2 scope=in_scope action=none status=resolved severity=medium fix_role=doc-updater rationale=live_call_sites_require_both_spawn_fields

## R2 closure recheck

- status: resolved
- proof: The next delegation call site and finalizer `doc-updater` call site require both `model` and `reasoning_effort` explicitly from the Codex Per-Spawn Model Routing contract. The complete-surface guard rejects later configured-profile and inheritance conflicts. Direct README, API, architecture, conventions, changelog, and qualified D-687 documentation use the same mapping and capability outcome without changing shared initialization guidance.

## Policy verification

- Standard default: exact `gpt-5.6-luna` / `max`.
- Reasoning default: exact `gpt-5.6-sol` / `xhigh`; existing reviewer and reasoning-role classifications remain unchanged because no role source, profile, resolver, or classification file changed.
- Temporary standard override: exact `gpt-5.6-sol` / `medium`, only after recording one of the four closed reasons: broad repository understanding, serial latency or cost erosion, repeated concrete Luna failures, or architecture/migration/subtle persistent-state risk.
- Routine implementation is excluded; the override is per-spawn, does not reclassify a role, does not change later defaults, and is not an availability fallback.
- Concrete next/finalize dispatch guidance requires both spawn fields and refers back to the exact routing contract.

## Scope verification

- The complete diff changes only the two live Codex routing skeletons, their six generated GitHub/GitLab/Gitea Codex next/finalize skills, the directly owned route-reachability test, and direct Codex dispatch documentation.
- `templates/routing/init.skeleton.md`, all three Codex init skills, all initialization commands, and all Claude command surfaces are byte-identical to `origin/main`.
- Role prompts and classification, role profiles, installer/preflight behavior, issue lifecycle, scheduler, worktree, mission-list, and adjacent routing implementations are unchanged.

## Validation evidence

- `node scripts/test-route-reachability.js` exited 0: `Route-reachability test passed (456 assertions).`
- `node scripts/generate-routing-surfaces.js --check` exited 0: all 18 generated surfaces byte-match their skeletons.
- `git diff --check origin/main` exited 0.
- The excluded-surface byte check against `origin/main` exited 0 for the init skeleton, all init skills, all initialization commands, and all Claude command trees.
- Independent read-only mutation accounting returned exactly 6 detected later availability-fallback mutants for the 6 live Codex next/finalize skills.

## Residual risks

- Runtime model-capability discovery remains an agent judgement rather than executable repository code. The live Codex contract supplies a safe deterministic outcome when Luna/max is unavailable: record the mismatch and remain inline without substituting another pair.
- This review ran the focused routing, generation, mutation-accounting, excluded-surface, and diff checks. The issue's full walkthrough requirement remains owned by finalization and was not duplicated in this focused review.

verdict: pass
findings_blocking: 0
review_conclusion: The candidate now obeys the clarified next-and-finalize-only boundary, preserves every init and Claude surface byte-for-byte, and fully proves the exact two-tier Codex dispatch contract with its closed four-trigger exception and fail-closed Luna capability outcome.
