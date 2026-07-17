evidence-binding: n3-documentation 91d32191ea7f
upstream_read: n1-reviewer-profile-resolution 0126b9d3ef32
upstream_read: n2-preflight-builtin-roles faef57844c0a
docs_updated: CHANGELOG.md (one [Unreleased] ### Fixed bullet covering #712+#716+#717 together) and docs/api.md (preflight required-role set item 3 + typed-refusal item 6 + exit-3 role_not_in_template table row now state the main-session-gate/finalize built-in exemption while unknown delegated roles still refuse); no pre-existing runtime-detection description existed in docs/api.md to correct (verified below).

## Files changed (declared write set exactly: CHANGELOG.md, docs/api.md)

- `CHANGELOG.md` — appended ONE bullet under `## [Unreleased]` → `### Fixed` (after the kimi
  reviewer-profile bullet, before `## [6.23.1]`): "Reviewer-profile runtime resolution and Codex
  preflight now agree with the installed layouts and the plan grammar — one bundle closing #712,
  #716, and #717 together." It records: #717's tail-anchored single-segment installed Codex
  plugin-cache tuple branch in `detectReviewRuntime` (explicit `KAOLA_WORKFLOW_RUNTIME` override
  still first, kimi before opencode, unknown layouts fail closed to claude); #712's claude branch
  matching `~/.claude/kaola-workflow/scripts/` BEFORE the #708 opencode pattern plus
  `reviewerProfilePath`'s ordered claude candidates (`<support>/agents/<role>.md` first — self-dev
  canonical AND the documented symlink workaround — then native `$KAOLA_AGENT_DIR` else
  `~/.claude/agents`, total miss → native candidate → `review_profile_unavailable`, never a silent
  wrong-runtime binding; resolver-side only, no re-stamp/installer change); #716's
  `PLAN_BUILTIN_NON_DELEGABLE_ROLES = ['main-session-gate','finalize']` exempting the two built-in
  non-delegable roles at the three availability-check sites (`role_not_in_template` filter,
  required-role union, `checkProfiles`) while unknown delegated roles still refuse
  `role_not_in_template` and missing delegated profiles still refuse `profiles_missing`; byte-exact
  replication to the three plugin mirrors + `edition-sync.js --write` regeneration; regression
  suites named (test-adaptive-node.js 2425 assertions, simulate-workflow-walkthrough.js,
  test-install-model-rendering.js).
- `docs/api.md` — three edits in the `kaola-workflow-codex-preflight.js` section:
  1. Behavior item 3 (Required-role set, line 2205): now states the #716 exemption — built-in
     non-delegable `main-session-gate`/`finalize` carry no `agents.toml` entry and no profile file
     BY DESIGN and are filtered out of the plan-role half before every availability check (template
     filter, required-role union, `checkProfiles`); every other (delegated) plan role stays
     fail-closed (`role_not_in_template` / `profiles_missing`).
  2. Behavior item 6 (typed refusal): "the plan names a role absent from the template" → "the plan
     names a delegated role absent from the template".
  3. Exit-code table row 3: `role_not_in_template` meaning now reads "plan names a delegated role
     absent from the template (the built-in non-delegable `main-session-gate` / `finalize` roles
     are exempt from template/profile availability — #716)".

## Runtime-detection description check (#712/#717 staleness sweep)

Task direction: "correct any runtime-detection description that the #712/#717 resolver behavior
makes stale." Verified NONE exists in docs/api.md — zero matches for `detectReviewRuntime`,
`reviewerProfilePath`, `resolveReviewerProfileIdentity`, `review_profile_unavailable`, and
`KAOLA_WORKFLOW_RUNTIME` across the whole file (the reviewer runtime-resolution chain was never
documented there), so there was no stale runtime-detection prose to correct; the resolver behavior
is captured in the new CHANGELOG bullet instead. Skip-with-reason per the doc-updater contract
(no invented sections).

## Ground-truth verification (docs match the code in this worktree)

- `scripts/kaola-workflow-adaptive-node.js:784-824` — `detectReviewRuntime` order: explicit
  override → source-tree codex → #717 cache tuple → kimi → #712 claude → #708 opencode → claude
  default. `:870-891` — claude `reviewerProfilePath` candidate order and native-dir default.
- `scripts/kaola-workflow-codex-preflight.js:2224` (`PLAN_BUILTIN_NON_DELEGABLE_ROLES`),
  `:2767` (delegatedPlanRoles), consumed at `:2770` (role_not_in_template filter), `:2786`
  (required-role union), `:3021` (checkProfiles) — matches both doc edits verbatim.
- `git status --porcelain`: only `CHANGELOG.md` and `docs/api.md` modified (tracked); all
  `.cache/*` entries are harness-owned untracked artifacts plus this evidence file.
