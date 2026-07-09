evidence-binding: n1-explore 51876192226e
findings: Existing freshness flow is `kaola-workflow-run-chains.js` -> `.cache/chain-receipt.json` with `codeTreeHash`/`validationTestConsumes` -> `plan-validator --finalize-check`; stale diagnostics should reuse `testConsumes`, `isValidationInvisible`, and `computeCodeTreeHash`, and should be added at the current `chains_stale` emit sites without changing the typed refusal reason.

## Facts

- Session/project rules: `CLAUDE.md:98-115` requires source verification, reuse-before-adding, no provenance in agent-facing prompts, `simulate-workflow-walkthrough.js` before completion, and four-chain validation for cross-edition diffs.
- Current worktree fact: `git status --short` shows only `?? kaola-workflow/issue-648/`; no source files were edited by this read-only node.
- Frozen plan: `kaola-workflow/issue-648/workflow-plan.md:20-26` defines n2 validator/walkthrough writes, n3 runtime prose writes, docs/review/finalize nodes. The n1 brief is `workflow-plan.md:30-35`; n2 asks additive stale diagnostics and walkthrough cases at `workflow-plan.md:37-44`; n3 asks provenance-free stamp-last/citation prose at `workflow-plan.md:46-54`; plan notes call out generated validator coupling, prompt-surface coupling, docs-before-final-validation, and focused/full validation at `workflow-plan.md:88-101`.
- Receipt producer: `scripts/kaola-workflow-run-chains.js:38-43` documents the plan-dir receipt path; `:63-72` documents `headSha`, `workTreeHash`, `codeTreeHash`, and `validationTestConsumes`; `:554-572` resolves `headSha`, `workTreeHash`, parses `validation_test_consumes`, and calls `planValidator.computeCodeTreeHash`; `:637-649` writes the receipt.
- Clean-stamp signal already exists: `scripts/kaola-workflow-run-chains.js:363-368` returns `workTreeHash: "clean"` when `git diff HEAD` is empty. That is the source-backed way to distinguish clean stamped receipts from dirty stamped receipts before emitting culprit paths.
- Validator helpers to reuse: `scripts/kaola-workflow-plan-validator.js:295-320` defines `SELF_HOST_TEST_CONSUMED`, `testConsumes`, and `isValidationInvisible`; `:2346-2369` defines `computeCodeTreeHash`; `:3416-3424` exports `parseValidationTestConsumes`, `testConsumes`, `isValidationInvisible`, and `computeCodeTreeHash`.
- Existing finalize gate: `scripts/kaola-workflow-plan-validator.js:3057-3123` chooses self-host chain receipt vs consumer final-validation mode; `:3124-3182` gates chain receipts; current `chains_stale` JSON emits are exactly `:3153-3154` for `codeTreeHash` mismatch and `:3159-3160` for legacy `headSha` mismatch; consumer final-validation is `:3183-3196`; attribution sweep is `:3198-3224`.
- `cmdFinalize` wrapper: `scripts/kaola-workflow-claim.js:2199-2207` runs `--finalize-check` before archive/side effects; `:2221-2240` wraps non-pass validator output as `finalize_gate_unverified` with `inner_reason`. Do stale-path classification in the validator, not this wrapper.
- Existing false-absolute backstop: `scripts/kaola-workflow-claim.js:1896-1907` rewrites archived `.cache/final-validation.md` text from `No files changed after those runs` to a bounded reuse statement; prose should still instruct agents to write the truthful boundary up front.
- Current docs schema: `docs/api.md:465-495` documents the receipt schema, `codeTreeHash` freshness re-key, and dual self-host/consumer gate; `docs/api.md:346-349` documents `validation_command` and `validation_test_consumes`.

## Walkthrough Coverage

- Helper/freshness predicates are already covered in `scripts/simulate-workflow-walkthrough.js:3383-3410`.
- Existing self-host finalize cases are `chains_unverified`, legacy stale `headSha`, red/waived chains, `codeTreeHash` match/mismatch, inert-doc pass, code-change stale, and unattributed change at `scripts/simulate-workflow-walkthrough.js:3561-3677`.
- Existing consumer final-validation cases are pass, absent, failed, and attribution sweep at `scripts/simulate-workflow-walkthrough.js:3679-3731`.
- Receipt producer tests cover schema and `codeTreeHash` presence at `scripts/test-run-chains.js:172-195`, receipt path resolution at `:704-770`, and empty receipt fail-closed at `:963-995`.
- `scripts/test-validation-allowband.js:13-18` and `:99-112` guard that chain-consumed prose stays code-relevant and inert docs stay validation-invisible.

## Runtime Prose Surfaces

- Plan-run is generated: `scripts/generate-routing-surfaces.js:6-7`, `:48-57`, and `:82-107` define generated plan-run/next surfaces across 3 command dirs + 3 skill dirs. Current check passed: `node scripts/generate-routing-surfaces.js --check`.
- Plan-run paragraphs to carry stamp-last/citation sequencing are in `templates/routing/plan-run.skeleton.md:513-552` plus the all-done splice in `templates/routing/slots.js:104-110`. Rendered root command is `commands/kaola-workflow-plan-run.md:419-462`; rendered skill mirrors have the same block at `plugins/kaola-workflow*/skills/kaola-workflow-plan-run/SKILL.md:452-486`; forge command mirrors carry it at `plugins/kaola-workflow-{gitlab,gitea}/commands/kaola-workflow-plan-run.md:417-452`.
- Finalize root command paragraphs are `commands/kaola-workflow-finalize.md:84-141` for dual-mode gate, `:294-319` for Validation De-Duplication, `:400-415` for final validation, and `:769-793` for pre-contractor receipt/final-validation handling.
- Finalize skill mirrors carry chain/consumer gate text at `plugins/kaola-workflow*/skills/kaola-workflow-finalize/SKILL.md:72-108` and mechanical pre-contractor text at roughly `:205-217`. GitHub skill has a detailed validation reuse sentence at `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md:156`; GitLab/Gitea skills currently have the shorter line at `plugins/kaola-workflow-{gitlab,gitea}/skills/kaola-workflow-finalize/SKILL.md:157`.
- Finalize forge command mirrors carry de-duplication and mechanical pre-contractor paragraphs at `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md:224-249,688-702` and `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md:223-248,686-700`.

## Write-Set Concerns

- n2 write set matches generated validator reality: `scripts/edition-sync.js:45-55` includes `kaola-workflow-plan-validator.js`; `package.json:36` defines `npm run sync:editions`.
- n3 write set omits `templates/routing/plan-run.skeleton.md`, `templates/routing/slots.js`, and the GitLab/Gitea plan-run command mirrors. Since plan-run is generated, direct rendered edits will fail `generate-routing-surfaces --check`; source-template edits plus `--write` will touch surfaces outside the declared n3 write set.
- n3 also omits `plugins/kaola-workflow-{gitlab,gitea}/commands/kaola-workflow-finalize.md`, but route reachability models finalize as 3 command surfaces + 3 skill surfaces: `scripts/test-route-reachability.js:227-233` and `:753-790`.

## Likely Validation Commands

- Focused validator/walkthrough: `node scripts/simulate-workflow-walkthrough.js`
- Receipt producer guard if touched or adjacent behavior changes: `node scripts/test-run-chains.js`
- Edition propagation: `npm run sync:editions`, then `node scripts/edition-sync.js --check` and `node scripts/validate-script-sync.js`
- Plan-run surface generation: `node scripts/generate-routing-surfaces.js --check`
- Prose reachability/contracts: `node scripts/test-route-reachability.js`, `node scripts/validate-workflow-contracts.js`, `node scripts/validate-kaola-workflow-contracts.js`, `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`, `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
- Full required final gate for cross-edition change: `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` or `npm test`.

## Unknowns

- No existing implementation of `stale_paths`, `stale_kind`, or a stale culprit path cap exists; `rg` finds only the issue plan references. The next node must define the additive payload shape while preserving `reason: "chains_stale"`.
- Consumer citation fields such as `source: cited:<node-id>`, `validated_command`, `validated_at_head`, and `reuse_boundary` are not currently parsed by `--finalize-check`; the current gate only requires column-0 `verdict: pass` in `final-validation.md`.
