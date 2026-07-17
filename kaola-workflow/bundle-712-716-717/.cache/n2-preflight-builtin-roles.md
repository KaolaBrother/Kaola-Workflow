evidence-binding: n2-preflight-builtin-roles faef57844c0a
<!-- RED: paste RED here -->
RED: #716(a) "mixed delegated + built-in plan must pass exact-plan preflight" — AssertionError [ERR_ASSERTION]: 3 !== 0 (preflight exited 3 with status role_not_in_template for plan roles [implementer, code-reviewer, main-session-gate, finalize]; expected exit 0) at scripts/test-install-model-rendering.js:2366, captured pre-implementation via `node scripts/test-install-model-rendering.js`.
<!-- GREEN: paste GREEN here -->
GREEN: #716(a) now passes — exact-plan preflight exits 0 with status "ok" for the mixed delegated + main-session-gate + finalize plan and roles_checked excludes both built-ins; (b) unknown delegated role still exits 3 role_not_in_template naming not-a-real-role; (c) missing delegated profile still exits 1 profiles_missing naming implementer. 3/3 #716 assertion groups green; full `node scripts/test-install-model-rendering.js` prints "Install model rendering tests passed"; downstream reproduction entry `node scripts/kaola-workflow-codex-preflight.js --project-root <tmp> --home <tmp> --no-autofix --json --plan <tmp-plan>` verified manually: exit 0, status ok, zero fabricated main-session-gate/finalize profiles.

## What changed (issue #716)

Root cause: `runPreflight` computed `rolesNotInTemplate = planRoles.filter(r => !templateRoles.includes(r))`
and `readPlanRoles` returns every `## Nodes` role, so the built-in, intentionally non-delegable roles
`main-session-gate` and `finalize` refused a valid frozen plan with `role_not_in_template` (and would
also have been demanded as profile files via the required-role union and `checkProfiles(agentsDir, planRoles)`).

Fix in `scripts/kaola-workflow-codex-preflight.js` (replicated byte-exact to the three plugin mirrors):

- New named constant adjacent to `readPlanRoles`/`runPreflight`:
  `const PLAN_BUILTIN_NON_DELEGABLE_ROLES = Object.freeze(['main-session-gate', 'finalize']);`
- `runPreflight` derives `delegatedPlanRoles = planRoles.filter(r => !PLAN_BUILTIN_NON_DELEGABLE_ROLES.includes(r))`
  and consumes it at exactly the three availability-check sites: the `role_not_in_template` filter,
  the required-role union, and `checkProfiles(agentsDir, ...)`. Delegated-role behavior is unchanged
  (fail-closed `role_not_in_template` for unknown roles, `profiles_missing` for missing profiles).
- Header comment updated to state the exemption. No `require`, no import, no edition-specific token added.

## Files touched (all inside the leg)

- `scripts/kaola-workflow-codex-preflight.js` — the fix (29 lines changed).
- `plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js` — byte-identical replica.
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js` — byte-identical replica.
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js` — byte-identical replica.
  (all four copies sha256 56455fcd26f84f35c00992c3ef0b8ddbeea276a72421a8751247b85099618c77)
- `scripts/test-install-model-rendering.js` — RED-first regression block (101 lines) beside the
  repository-root preflight-driving fixtures: schema-2-shaped `## Nodes` plan fixtures synthesized in
  $TMPDIR covering (a) mixed delegated + built-in roles pass, (b) unknown delegated role refuses
  `role_not_in_template` naming the role, (c) truly missing delegated profile refuses `profiles_missing`.

## Checks run (in the leg)

- `node scripts/test-install-model-rendering.js` → "Install model rendering tests passed" (exit 0).
- `node scripts/validate-script-sync.js` → "OK: 25 common scripts, 28 byte-identical groups, ..." (exit 0).
- `node scripts/validate-kaola-workflow-contracts.js` → "Kaola-Workflow Codex contract validation passed" (exit 0)
  (byte-identity group + forge forbidden-token walls hold).
- Manual downstream reproduction: fresh `--global` install into a temp HOME, then
  `node scripts/kaola-workflow-codex-preflight.js --project-root <tmp> --home <tmp> --no-autofix --json --plan <tmp>/workflow-plan.md`
  with plan roles implementer + main-session-gate + finalize → exit 0, `"status": "ok"`;
  `grep -c 'main-session-gate\|finalize'` over the installed agents dir = 0 (no fake profiles).
