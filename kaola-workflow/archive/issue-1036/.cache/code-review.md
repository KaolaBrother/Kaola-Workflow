# Code review: PR #1038 / Issue #1036

## Review identity

- Candidate: `febc1411772d08132316a969d2d0d3bda625cce2`
- Base: `a6d49c112581b49a151700c49c60971df411ec3e`
- PR: #1038, `fix: split Cursor named_roles CLI vs Cloud catalog-miss (#1036)`
- Issue owner correction: 2026-08-27 comment at `issuecomment-5436971626`
- Surface: the complete 13-file diff, Cursor adapter generation and consumers, generated next/finalize routing, focused tests, and declared README/API/architecture/conventions/changelog documentation

## Finding

### R1 - Suite-global Codex version attestation makes the live binary fallback unreachable

- Failure class: test coverage regression / environment-source masking.
- Primary anchor: `scripts/test-install-model-rendering.js:32-36`.
- Secondary anchors: `scripts/test-install-model-rendering.js:1303-1318`; `scripts/kaola-workflow-codex-preflight.js:2283-2294`.
- Concrete precondition and input: run `node scripts/test-install-model-rendering.js` with `KAOLA_CODEX_VERSION` unset, while the live `codex` binary is absent, unparsable, below the supported floor, or while the binary-probe implementation is regressed. The new line sets `process.env.KAOLA_CODEX_VERSION=0.145.0` before any test and the many `spawnSync` calls that omit an explicit `env` inherit it.
- Expected behavior: the test-only floor attestation should be scoped to child invocations whose asserted property lies after the version gate, while at least one controlled case removes the attestation and exercises the real `codex --version` fallback and its `probe` or `unavailable` source classification.
- Observed behavior: environment precedence wins for every unqualified preflight child, so `resolveCodexVersion()` never reaches `probeCodexVersionFromBinary()` in this suite. Flag and explicit-env precedence remain tested, but the final live fallback is masked. A broken or below-floor installed binary can no longer make this suite expose that path.
- Reproduction:
  1. Put a `codex` executable on a controlled `PATH` that exits successfully without a parseable version.
  2. Run preflight with `KAOLA_CODEX_VERSION` removed: result is `status=codex_version_unsupported`, `detected_version=null`, `detected_version_source=unavailable`.
  3. Run the same preflight with `KAOLA_CODEX_VERSION=0.145.0`, matching the new suite-global default: the version refusal disappears and execution advances to `codex_multi_agent_v2_required`.
- Guard analysis: the explicit `--codex-version 0.144.9` and child env `KAOLA_CODEX_VERSION=0.140.0` assertions only prove the two higher-precedence sources. They cannot detect a regression in the live probe because both deliberately outrank it. No other `scripts/test-*.js` assertion checks `detected_version_source=probe` or the controlled no-env binary fallback.
- Suggested repair: avoid mutating the suite process environment. Add the floor attestation to the specific spawn helper or child calls that need to reach post-version assertions, and add a hermetic fake-binary case with `KAOLA_CODEX_VERSION` removed to cover the final precedence leg.

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=suite-global-version-attestation-masks-the-live-codex-binary-fallback

## Complete review coverage

- Read both commits and the full diff for all 13 changed files: `CHANGELOG.md`, `README.md`, `docs/README.md`, `docs/api.md`, `docs/conventions.md`, `docs/cursor-edition.md`, ADR 0021, `docs/runtime-capabilities.md`, `scripts/sync-cursor-edition.js`, the three changed test files, and `templates/agents/runtime-capabilities.json`.
- Read the latest Issue #1036 owner correction and PR #1038 metadata. The candidate exactly matches the requested base/head identities.
- Traced `templates/agents/runtime-capabilities.json` through `generate-agent-profiles.js`, the `runtime-delegation` slot, `replaceRuntimeDelegationGuidance`, and `sync-cursor-edition.js` into freshly rendered Cursor `workflow-next` and `kaola-workflow-finalize` commands.
- Confirmed the shipped generated blocks, not only source prose, say that `named_roles` is not host-universal, inspect the live Task enum, use named omit-model only when the Kaola name is present, use built-ins as themselves on catalog miss, treat already-present plus built-in-only as `capability_gap`, and allow only resolver-listed live-schema model slugs as the catalog-miss effort lever.
- Confirmed retaining `capabilities.named_roles: true` follows the latest owner correction: it records supported CLI named profiles while the rendered availability and carrier guidance narrow it by host. No candidate path treats the boolean alone as Cloud proof.
- Checked the consumer-facing README, API, conventions, Cursor edition guide, runtime capability inventory/evidence, ADR, docs index, and changelog for the same host split and for the explicit unclaimed Cloud boot-load boundary. No contradictory Cloud boot-load claim was found.
- Checked Cursor command adaptation and generated tests. `CURSOR_MODEL_DISPATCH_BLOCK` remains exported residue and is not the production render path; the actual production path is independently asserted against freshly rendered command content, so this did not create a current behavioral finding.
- Checked that the second commit changes test setup only and does not alter production preflight code. Its masking effect is nevertheless material because this suite is the only located coverage for the preflight version-source precedence.

## Commands and evidence

1. Candidate and scope:

   `git status --short`

   Clean candidate worktree.

   `git rev-parse HEAD`

   `febc1411772d08132316a969d2d0d3bda625cce2`

   `git diff --stat a6d49c112581b49a151700c49c60971df411ec3e..febc1411772d08132316a969d2d0d3bda625cce2`

   Result: 13 files, 185 insertions, 70 deletions.

   `git log --oneline a6d49c112581b49a151700c49c60971df411ec3e..febc1411772d08132316a969d2d0d3bda625cce2`

   Result: `413d353c fix: split Cursor named_roles CLI vs Cloud catalog-miss`; `febc1411 test: attest Codex version floor in install-model-rendering suite`.

2. Forge evidence:

   `gh issue view 1036 --json number,title,state,labels,body,comments,url`

   Confirmed the owner correction keeps family `named_roles: true`, requires live-enum Path A/Path B routing, and leaves Cloud boot-load unclaimed.

   `gh pr view 1038 --json number,title,state,baseRefOid,headRefOid,body,commits,files,comments,reviews,url`

   Confirmed exact base/head and the same 13 files.

3. Static and focused validation:

   `git diff --check a6d49c112581b49a151700c49c60971df411ec3e..febc1411772d08132316a969d2d0d3bda625cce2`

   Passed.

   `node scripts/test-runtime-agent-architecture.js`

   Passed: 721 assertions.

   `node scripts/generate-agent-profiles.js --check`

   Passed: 14 roles, seven runtimes, 126 native renders.

   `node scripts/generate-routing-surfaces.js --check`

   Passed: all 18 surfaces byte-match the skeleton.

   `node scripts/test-install-model-rendering.js`

   Passed, but R1 explains why that green result no longer covers the live binary fallback.

4. Cursor edition:

   Running `node scripts/test-cursor-edition.js` directly in the linked candidate worktree initially stopped because the ignored generated trees are rooted in the main checkout at base `a6d49c11`; the two changed Cursor commands were therefore stale relative to the candidate source. This was an environment/build-artifact mismatch, not an admitted candidate defect.

   In a standalone local clone checked out at the exact candidate, after generating all three ignored Cursor forge trees, `node scripts/test-cursor-edition.js` passed 847 assertions and all `.cursor`, `.cursor-gitlab`, and `.cursor-gitea` trees were in parity.

5. Version-mask A/B:

   A controlled `PATH` with a no-output `codex` executable and no `KAOLA_CODEX_VERSION` produced `codex_version_unsupported` with source `unavailable`. The identical preflight with `KAOLA_CODEX_VERSION=0.145.0` advanced to `codex_multi_agent_v2_required`. This records the exact branch hidden by the new suite-global default.

6. Expensive closure gates:

   The all-four chain command and full walkthrough were not run after R1 was admitted. Per review policy, an admitted defect short-circuits ahead of the expensive validation rather than spending the full gate and then reporting the same failing review verdict.

verdict: fail
findings_blocking: 1
review_conclusion: The Cursor host-split implementation and declared documentation are coherent, but the suite-global Codex version default materially removes coverage of the live binary fallback and needs a scoped test repair.
