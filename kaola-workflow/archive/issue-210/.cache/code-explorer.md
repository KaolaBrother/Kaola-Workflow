# Codebase Research — issue #210 (default delegated compliance)

Source: 8-agent parallel `code-explorer` Workflow fan-out (run `wf_08d1c5d9-00a`,
406k tokens, full output `tasks/wrz46o3sn.output`). Distilled below.

## Tree boundary (CODEX-only fix; do NOT touch Claude)

- CODEX (in scope): `plugins/*/skills/**/SKILL.md`; 3 Codex contract validators
  (`scripts/validate-kaola-workflow-contracts.js` = github-codex,
  `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`,
  `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`);
  3 Codex walkthroughs; the 3 `.codex-plugin/plugin.json`.
- SHARED DOCS (in scope): `README.md`, `docs/workflow-state-contract.md`, `CHANGELOG.md`.
- CLAUDE / DO NOT TOUCH: top-level `commands/`, `plugins/*/commands/`,
  `package.json` version (3.17.2), `scripts/validate-workflow-contracts.js`,
  `scripts/simulate-workflow-walkthrough.js`, `scripts/kaola-workflow-fast-audit.js`,
  `scripts/test-fast-audit.js` (the last two LIVE in `scripts/` but run in the
  CLAUDE suite — NOT in-scope-Codex).
- BYTE-IDENTICAL-SYNCED (editing either copy touches Claude — AVOID):
  `kaola-workflow-repair-state.js`, `validate-workflow-contracts.js`,
  `release-surface-drift.js` (see `scripts/validate-script-sync.js` COMMON_SCRIPTS).

## The Delegation Contract (primary rewrite target)

- The "## Delegation Contract" section is **byte-identical across all 3 forge
  `kaola-workflow-next/SKILL.md`**, at **lines 27–55**. It currently: prose L29
  ("must establish a session delegation policy with the user… requires explicit
  authorization"), skip clause L31, "Ask the user once at startup:" L33,
  blockquote menu L35–41, Write order L43–53 (printf patch L49–51), re-ask L55.
- Resume reference (validator-asserted, MUST survive verbatim): github L224–225;
  gitlab/gitea L236–237 — string `extract and reassign \`delegation_policy:\`
  alongside \`phase\` and \`next_skill\``.
- Other Codex skills (execute/fast/finalize/ideation/plan/research/review × 3
  forges): reference delegation ONLY to RECORD the 4-token compliance vocabulary
  — **none prompt**, **none need changing**. The strings `delegation_policy`,
  `Delegation Contract`, `local-authorized` appear ONLY in the 3 `next` SKILLs.

## What MUST be preserved (or Claude/Codex suites break)

1. Resume reference string (above) — asserted by all 3 validators (github L89,
   gitlab L244–247, gitea L251–254).
2. 4-token ledger vocabulary `subagent-invoked` / `local-fallback-explicit` /
   `local-fallback-tool-unavailable` / `N/A` — asserted present in each
   delegation skill (github L154–158); also read by Claude-suite
   `kaola-workflow-fast-audit.js` parseReviewMode (L112–128) + `test-fast-audit.js`
   (L285–308) + `commands/kaola-workflow-phase6.md` (L300–305).
3. 3 policy values `delegate` / `local-authorized` / `tool-unavailable` and the
   printf patch + its 3-value enumeration (next SKILL L53) — keep all present.
4. The `## [3.17.2]` CHANGELOG heading + the `kaola-workflow--v3.17.2` tag's
   recorded codex `1.8.2` (release-surface-drift) — so NO version bump.

## repair-state already supports the new default (NO script change)

`kaola-workflow-repair-state.js` `delegationPolicyCompliance()` `delegate` branch
(L235–263): accepts all-`subagent-invoked` rows **OR** an all-evidenced
`local-fallback-tool-unavailable` ledger (L254–258). That is exactly the #210
auto-detect-tool-unavailable end state — already enforced as valid. The contract
validators import this engine and assert outcomes that already hold.

**Critical constraint this lands on the SKILL prose:** the `delegate` branch only
passes for `local-fallback-tool-unavailable` rows when `hasEvidenceOrSkip(row)` is
true. So the auto-detect path MUST write an evidence/skip value in the ledger's
Evidence column, not just the status token, or repair-state raises a spurious
pending gate.

## Validators: zero must-update assertions; work is ADDITIVE

No validator pins the prompt prose ("Ask the user", "How should delegation be
handled"). Rewriting to no-prompt-default breaks nothing. New tests are additive
RED-guards: `assertNotIncludes` the old prompt sentinels + `assertIncludes` the
new default sentinels, mirrored byte-identically across all 3 validators. Sentinel
strings must match the SKILL prose exactly.

## Codex walkthroughs: no delegation assertions

The 3 Codex simulate walkthroughs assert no delegation vocabulary; the change
breaks none. Pass strings: `Kaola-Workflow walkthrough simulation passed` /
`GitLab Codex workflow walkthrough simulation passed` /
`Gitea Codex workflow walkthrough simulation passed`.

## Version decision (user-confirmed): NO bump

Branch-A policy (#193) couples codex manifest versions to the root tag; a
codex-only bump cannot pass `npm test` online. User chose to ship #210 at codex
`1.8.2` with no version edit. See memory `project_codex_version_root_coupled`.

## Shared-doc edit points

- `README.md` L373–378 — rewrite the "ask the user to authorize a delegation
  policy" Codex paragraph to default-delegate framing. Leave generic "delegated"
  lines (527, 682, 686, 749, 750) and version rows (403–408) untouched.
- `docs/workflow-state-contract.md` L39–43 — reframe `delegation_policy` from
  "User-authorized delegation mode" to default-delegate; PRESERVE L44–47 (vocab)
  and L49–56 (enforcement) verbatim.
- `CHANGELOG.md` — add a bullet under `## [Unreleased]` (L3). No version heading.

## Test commands

- Codex: `npm run test:kaola-workflow:codex`
  (`validate-script-sync.js` + `validate-kaola-workflow-contracts.js` +
  `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`).
- Claude (must stay green, unchanged): `npm run test:kaola-workflow:claude`.
- GitLab/Gitea suites run their `validate-…-contracts.js` + codex walkthroughs.
- Full: `npm test`. Mechanical non-touch proof: `git diff --name-only main`.
